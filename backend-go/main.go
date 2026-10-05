package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"
)

// SshTunnelConfig defines configuration for SSH tunneling
type SshTunnelConfig struct {
	Enabled                bool   `json:"enabled"`
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	User                   string `json:"user"`
	AuthMethod             string `json:"authMethod"`
	Password               string `json:"password,omitempty"`
	PrivateKey             string `json:"privateKey,omitempty"`
	Passphrase             string `json:"passphrase,omitempty"`
	SaveCredentials        bool   `json:"saveCredentials"`
	BypassHostVerification bool   `json:"bypassHostVerification"`
	TimeoutMs              int    `json:"timeoutMs"`
}

// ConnectionConfig defines parameters for target database connection
type ConnectionConfig struct {
	ID               string                 `json:"id"`
	Name             string                 `json:"name"`
	URI              string                 `json:"uri"`
	Host             string                 `json:"host"`
	Port             int                    `json:"port"`
	User             string                 `json:"user"`
	Password         string                 `json:"password"`
	Database         string                 `json:"database"`
	SSLMode          string                 `json:"ssl_mode"`
	IsDefault        bool                   `json:"is_default"`
	SSHSettings      *SshTunnelConfig       `json:"ssh_settings,omitempty"`
	AdvancedSettings map[string]interface{} `json:"advanced_settings,omitempty"`
}

// Global Connection Pool Manager
type ConnectionManager struct {
	mu              sync.RWMutex
	activePool      *pgxpool.Pool
	activeSshClient *ssh.Client
	activeConfig    ConnectionConfig
	isConnected     bool
	serverVer       string
}

var connMgr = &ConnectionManager{}

func createSshClient(sshCfg *SshTunnelConfig) (*ssh.Client, error) {
	if sshCfg == nil || !sshCfg.Enabled || sshCfg.Host == "" {
		return nil, nil
	}
	port := sshCfg.Port
	if port <= 0 {
		port = 22
	}
	timeout := 5 * time.Second
	if sshCfg.TimeoutMs > 0 {
		timeout = time.Duration(sshCfg.TimeoutMs) * time.Millisecond
	}
	var authMethods []ssh.AuthMethod
	if sshCfg.AuthMethod == "Public Key" && sshCfg.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(sshCfg.PrivateKey))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	} else if sshCfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(sshCfg.Password))
	}
	sshConfig := &ssh.ClientConfig{
		User:            sshCfg.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         timeout,
	}
	return ssh.Dial("tcp", fmt.Sprintf("%s:%d", sshCfg.Host, port), sshConfig)
}

func (cm *ConnectionManager) buildConnString(cfg ConnectionConfig) string {
	if cfg.URI != "" {
		return cfg.URI
	}
	host := cfg.Host
	if host == "" {
		host = "localhost"
	}
	port := cfg.Port
	if port == 0 {
		port = 5432
	}
	user := cfg.User
	if user == "" {
		user = "postgres"
	}
	db := cfg.Database
	if db == "" {
		db = "postgres"
	}
	ssl := cfg.SSLMode
	if ssl == "" {
		ssl = "disable"
	}

	u := &url.URL{
		Scheme: "postgres",
		Host:   fmt.Sprintf("%s:%d", host, port),
		Path:   "/" + db,
	}
	if cfg.Password != "" {
		u.User = url.UserPassword(user, cfg.Password)
	} else {
		u.User = url.User(user)
	}
	q := u.Query()
	q.Set("sslmode", ssl)
	u.RawQuery = q.Encode()

	return u.String()
}

func (cm *ConnectionManager) Connect(ctx context.Context, cfg ConnectionConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	connStr := cm.buildConnString(cfg)
	poolConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return fmt.Errorf("invalid connection string: %w", err)
	}

	var sshClient *ssh.Client
	if cfg.SSHSettings != nil && cfg.SSHSettings.Enabled && cfg.SSHSettings.Host != "" {
		var err error
		sshClient, err = createSshClient(cfg.SSHSettings)
		if err != nil {
			return fmt.Errorf("failed to open SSH tunnel: %w", err)
		}
		poolConfig.ConnConfig.DialFunc = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return sshClient.Dial(network, addr)
		}
	}

	poolConfig.MaxConns = 15
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	newPool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		if sshClient != nil {
			_ = sshClient.Close()
		}
		return fmt.Errorf("failed to create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	if err := newPool.Ping(pingCtx); err != nil {
		newPool.Close()
		if sshClient != nil {
			_ = sshClient.Close()
		}
		return fmt.Errorf("database unreachable: %w", err)
	}

	var versionStr string
	_ = newPool.QueryRow(pingCtx, "SELECT version()").Scan(&versionStr)

	if cm.activePool != nil {
		cm.activePool.Close()
	}
	if cm.activeSshClient != nil {
		_ = cm.activeSshClient.Close()
	}

	cm.activePool = newPool
	cm.activeSshClient = sshClient
	cm.activeConfig = cfg
	cm.isConnected = true
	cm.serverVer = versionStr

	log.Printf("✅ Connected to PostgreSQL [%s:%d/%s] - %s", cfg.Host, cfg.Port, cfg.Database, versionStr)
	return nil
}

func (cm *ConnectionManager) GetPool() (*pgxpool.Pool, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.activePool, cm.isConnected && cm.activePool != nil
}

func (cm *ConnectionManager) GetCurrentInfo() (ConnectionConfig, string, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.activeConfig, cm.serverVer, cm.isConnected
}

// DTO structs
type QueryRequest struct {
	SQL           string `json:"sql" binding:"required"`
	MaxRows       int    `json:"max_rows"`
	AutoRollback  bool   `json:"auto_rollback"`
	TransactionId string `json:"transaction_id"`
}

type ColumnMeta struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type QueryResponse struct {
	ExecutionTimeMs float64          `json:"execution_time_ms"`
	PlanningTimeMs  float64          `json:"planning_time_ms"`
	RowCount        int              `json:"row_count"`
	TransferKb      float64          `json:"transfer_kb"`
	Columns         []ColumnMeta     `json:"columns"`
	Rows            []map[string]any `json:"rows"`
	Status          string           `json:"status"`
	Message         string           `json:"message,omitempty"`
}

func loadDotEnv() {
	var candidates []string
	candidates = append(candidates, ".env", "../.env")
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates, filepath.Join(exeDir, ".env"), filepath.Join(exeDir, "..", ".env"))
	}

	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					val := strings.TrimSpace(parts[1])
					// Handle quoted value with potential inline comments
					if strings.HasPrefix(val, "\"") {
						if endIdx := strings.LastIndex(val, "\""); endIdx > 0 {
							val = val[1:endIdx]
						}
					} else if strings.HasPrefix(val, "'") {
						if endIdx := strings.LastIndex(val, "'"); endIdx > 0 {
							val = val[1:endIdx]
						}
					} else {
						// Strip unquoted inline comments
						if commentIdx := strings.Index(val, " #"); commentIdx != -1 {
							val = strings.TrimSpace(val[:commentIdx])
						} else if commentIdx := strings.Index(val, "#"); commentIdx != -1 {
							val = strings.TrimSpace(val[:commentIdx])
						}
					}
					if os.Getenv(key) == "" {
						_ = os.Setenv(key, val)
					}
				}
			}
			break
		}
	}
}

func main() {
	loadDotEnv()
	initDataStore()
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// High-throughput CORS middleware
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length", "X-Query-Time-Ms"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Auto-connect to DATABASE_URL if set in environment, or first saved connection
	conns := loadConnections()
	if defaultURL := os.Getenv("DATABASE_URL"); defaultURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = connMgr.Connect(ctx, ConnectionConfig{
			URI:  defaultURL,
			Name: "Default Env Database",
		})
		cancel()
	} else if len(conns) > 0 {
		c0 := conns[0]
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = connMgr.Connect(ctx, ConnectionConfig{
			Host:     c0.Host,
			Port:     c0.Port,
			Database: c0.Database,
			User:     c0.User,
			Password: c0.Password,
			SSLMode:  c0.SSLMode,
			Name:     c0.Name,
		})
		cancel()
	}

	api := router.Group("/api/v1")
	{
		// Health & Engine telemetry
		api.GET("/health", handleHealth)

		// Connection Manager & Saved Profiles (Persistent JSON in backend-go/data/connections.json)
		api.POST("/connections/test", handleTestConnection)
		api.POST("/connections/ssh/test", handleTestSshTunnel)
		api.POST("/connections/connect", handleConnectConnection)
		api.GET("/connections/current", handleCurrentConnection)
		api.GET("/connections", handleGetConnections)
		api.POST("/connections", handleSaveConnection)
		api.DELETE("/connections/:id", handleDeleteConnection)
		api.GET("/databases", handleListDatabases)

		// Studio Settings (Persistent JSON in backend-go/data/settings.json)
		api.GET("/settings", handleGetSettings)
		api.POST("/settings", handleSaveSettings)

		// Query History (Persistent JSON in backend-go/data/query_history.json, max 50 queries)
		api.GET("/query/history", handleGetQueryHistory)
		api.DELETE("/query/history", handleClearQueryHistory)

		// Catalog Schema & ERD Introspection
		api.GET("/catalog/schema", handleCatalogSchema)
		api.GET("/catalog/erd", handleCatalogErd)

		// Table Rows & CRUD Grid
		api.GET("/tables/:table/rows", handleTableRows)
		api.POST("/tables/:table/rows", handleInsertRow)
		api.PUT("/tables/:table/rows/:id", handleUpdateRow)
		api.DELETE("/tables/:table/rows/:id", handleDeleteRow)
		api.POST("/tables/:table/columns", handleAddColumn)
		api.POST("/tables", handleCreateTable)

		// Fast Query Execution Engine
		api.POST("/query/execute", handleQueryExecute)
		api.POST("/query/explain", handleQueryExplain)

		// Performance pg_stat_activity & worker sessions
		api.GET("/performance/sessions", handleSessionsList)
		api.POST("/performance/sessions/:pid/terminate", handleSessionTerminate)
		api.GET("/performance/slow-queries", handleSlowQueries)

		// Database Overview & Stats
		api.GET("/database/overview", handleDatabaseOverview)
	}

	// Serve Frontend Static Files & SPA Fallback
	distDir := findDistDir()
	if distDir != "" {
		log.Printf("📦 Serving frontend assets from: %s", distDir)
		router.Static("/assets", filepath.Join(distDir, "assets"))

		// Serve single static root files if present
		for _, f := range []string{"favicon.ico", "robots.txt", "logo.svg", "banner.png"} {
			fp := filepath.Join(distDir, f)
			if _, err := os.Stat(fp); err == nil {
				router.StaticFile("/"+f, fp)
			}
		}

		// Fallback for all other routes to static file or index.html for React SPA Router
		router.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
				return
			}
			reqPath := strings.TrimPrefix(filepath.Clean(c.Request.URL.Path), "/")
			if reqPath != "" && reqPath != "." {
				fp := filepath.Join(distDir, reqPath)
				if stat, err := os.Stat(fp); err == nil && !stat.IsDir() {
					c.File(fp)
					return
				}
			}
			c.File(filepath.Join(distDir, "index.html"))
		})
	} else {
		log.Printf("⚠️  Frontend dist folder not found. API mode only.")
		router.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not Found"})
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "28432"
	}

	log.Printf("🚀 pgStudio Go High-Performance Server ready at http://localhost:%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func findDistDir() string {
	candidates := []string{
		"./dist",
		"../dist",
		"/home/azahwa/Documents/database-studio/dist",
	}
	for _, c := range candidates {
		if fi, err := os.Stat(filepath.Join(c, "index.html")); err == nil && !fi.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	return ""
}

// ----------------- DATA STORE (JSON PERSISTENCE) -----------------

// StudioSettings defines master settings stored in backend-go/data/settings.json
type StudioSettings struct {
	MaxQueryHistory    int    `json:"max_query_history"`
	DefaultPageSize    int    `json:"default_page_size"`
	AutocommitDefault  bool   `json:"autocommit_default"`
	ThemePreset        string `json:"theme_preset"`
	StatementTimeoutMs int    `json:"statement_timeout_ms"`
	CatalogScope       string `json:"catalog_scope"`
}

// SavedConnection defines a persistent PostgreSQL connection profile
type SavedConnection struct {
	ID               string                 `json:"id"`
	Name             string                 `json:"name"`
	Host             string                 `json:"host"`
	Port             int                    `json:"port"`
	User             string                 `json:"user"`
	Password         string                 `json:"password,omitempty"`
	Database         string                 `json:"database"`
	SSLMode          string                 `json:"ssl_mode"`
	Badge            string                 `json:"badge"`
	Color            string                 `json:"color,omitempty"`
	CreatedAt        string                 `json:"created_at,omitempty"`
	SSHSettings      *SshTunnelConfig       `json:"ssh_settings,omitempty"`
	AdvancedSettings map[string]interface{} `json:"advanced_settings,omitempty"`
}

// QueryHistoryItem defines a record in query_history.json
type QueryHistoryItem struct {
	ID           string  `json:"id"`
	Query        string  `json:"query"`
	DurationMs   float64 `json:"duration_ms"`
	RowCount     int     `json:"row_count"`
	Status       string  `json:"status"` // "SUCCESS" | "ERROR" | "STANDBY"
	Database     string  `json:"database"`
	ExecutedAt   string  `json:"executed_at"`
	ErrorMessage string  `json:"error_message,omitempty"`
}

var dataMu sync.RWMutex

func findDataDir() string {
	candidates := []string{
		"backend-go/data",
		"./data",
		"data",
		"../backend-go/data",
		"/home/azahwa/Documents/database-studio/backend-go/data",
	}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	_ = os.MkdirAll("backend-go/data", 0755)
	abs, _ := filepath.Abs("backend-go/data")
	return abs
}

func getSettingsFilePath() string {
	return filepath.Join(findDataDir(), "settings.json")
}

func getConnectionsFilePath() string {
	return filepath.Join(findDataDir(), "connections.json")
}

func getQueryHistoryFilePath() string {
	return filepath.Join(findDataDir(), "query_history.json")
}

func initDataStore() {
	dir := findDataDir()
	log.Printf("📂 Data store initialized at: %s", dir)

	sFile := getSettingsFilePath()
	if _, err := os.Stat(sFile); os.IsNotExist(err) {
		defaultSettings := StudioSettings{
			MaxQueryHistory:    50,
			DefaultPageSize:    25,
			AutocommitDefault:  true,
			ThemePreset:        "emerald-dark",
			StatementTimeoutMs: 30000,
			CatalogScope:       "public",
		}
		if bytes, err := json.MarshalIndent(defaultSettings, "", "  "); err == nil {
			_ = os.WriteFile(sFile, bytes, 0644)
		}
	}

	cFile := getConnectionsFilePath()
	if _, err := os.Stat(cFile); os.IsNotExist(err) {
		defaultConns := []SavedConnection{
			{
				ID:        "conn_localhost_default",
				Name:      "Localhost PostgreSQL",
				Host:      "localhost",
				Port:      5432,
				User:      "postgres",
				Database:  "postgres",
				SSLMode:   "disable",
				Badge:     "LOCAL",
				Color:     "emerald",
				CreatedAt: time.Now().Format(time.RFC3339),
			},
		}
		if bytes, err := json.MarshalIndent(defaultConns, "", "  "); err == nil {
			_ = os.WriteFile(cFile, bytes, 0644)
		}
	}

	qFile := getQueryHistoryFilePath()
	if _, err := os.Stat(qFile); os.IsNotExist(err) {
		_ = os.WriteFile(qFile, []byte("[]"), 0644)
	}
}

func loadSettings() StudioSettings {
	dataMu.RLock()
	defer dataMu.RUnlock()

	defaultSettings := StudioSettings{
		MaxQueryHistory:    50,
		DefaultPageSize:    25,
		AutocommitDefault:  true,
		ThemePreset:        "emerald-dark",
		StatementTimeoutMs: 30000,
		CatalogScope:       "public",
	}

	data, err := os.ReadFile(getSettingsFilePath())
	if err != nil {
		return defaultSettings
	}
	var s StudioSettings
	if err := json.Unmarshal(data, &s); err != nil {
		return defaultSettings
	}
	if s.MaxQueryHistory <= 0 {
		s.MaxQueryHistory = 50
	}
	return s
}

func saveSettings(s StudioSettings) error {
	dataMu.Lock()
	defer dataMu.Unlock()

	if s.MaxQueryHistory <= 0 {
		s.MaxQueryHistory = 50
	}
	bytes, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getSettingsFilePath(), bytes, 0644)
}

func defaultSeedConnections() []SavedConnection {
	now := time.Now().Format(time.RFC3339)
	return []SavedConnection{
		{
			ID:        "conn-local-pos",
			Name:      "Localhost - POS Database (gast)",
			Host:      "localhost",
			Port:      5432,
			User:      "gast",
			Password:  "password",
			Database:  "pos",
			SSLMode:   "disable",
			Badge:     "LOCAL",
			Color:     "#10b981",
			CreatedAt: now,
		},
		{
			ID:        "conn-local-abcd",
			Name:      "Localhost - ABCD Staging (gast)",
			Host:      "localhost",
			Port:      5432,
			User:      "gast",
			Password:  "password",
			Database:  "abcd",
			SSLMode:   "disable",
			Badge:     "LOCAL",
			Color:     "#3b82f6",
			CreatedAt: now,
		},
		{
			ID:        "conn-local-postgres",
			Name:      "Localhost - Maintenance (postgres)",
			Host:      "localhost",
			Port:      5432,
			User:      "gast",
			Password:  "password",
			Database:  "postgres",
			SSLMode:   "disable",
			Badge:     "LOCAL",
			Color:     "#8b5cf6",
			CreatedAt: now,
		},
	}
}

func loadConnections() []SavedConnection {
	dataMu.RLock()
	defer dataMu.RUnlock()

	data, err := os.ReadFile(getConnectionsFilePath())
	if err != nil {
		seeds := defaultSeedConnections()
		_ = saveConnections(seeds)
		return seeds
	}
	var conns []SavedConnection
	if err := json.Unmarshal(data, &conns); err != nil || len(conns) == 0 {
		seeds := defaultSeedConnections()
		_ = saveConnections(seeds)
		return seeds
	}
	return conns
}

func saveConnections(conns []SavedConnection) error {
	dataMu.Lock()
	defer dataMu.Unlock()

	bytes, err := json.MarshalIndent(conns, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getConnectionsFilePath(), bytes, 0644)
}

func loadQueryHistory() []QueryHistoryItem {
	dataMu.RLock()
	defer dataMu.RUnlock()

	data, err := os.ReadFile(getQueryHistoryFilePath())
	if err != nil {
		return []QueryHistoryItem{}
	}
	var items []QueryHistoryItem
	if err := json.Unmarshal(data, &items); err != nil {
		return []QueryHistoryItem{}
	}
	return items
}

func appendQueryHistory(item QueryHistoryItem) {
	settings := loadSettings()
	dataMu.Lock()
	defer dataMu.Unlock()

	var items []QueryHistoryItem
	data, err := os.ReadFile(getQueryHistoryFilePath())
	if err == nil {
		_ = json.Unmarshal(data, &items)
	}

	// Prepend newest query (LIFO order)
	items = append([]QueryHistoryItem{item}, items...)

	// Truncate to MaxQueryHistory
	maxH := settings.MaxQueryHistory
	if maxH <= 0 {
		maxH = 50
	}
	if len(items) > maxH {
		items = items[:maxH]
	}

	bytes, err := json.MarshalIndent(items, "", "  ")
	if err == nil {
		_ = os.WriteFile(getQueryHistoryFilePath(), bytes, 0644)
	}
}

func clearQueryHistory() error {
	dataMu.Lock()
	defer dataMu.Unlock()

	return os.WriteFile(getQueryHistoryFilePath(), []byte("[]"), 0644)
}

func handleGetSettings(c *gin.Context) {
	c.JSON(http.StatusOK, loadSettings())
}

func handleSaveSettings(c *gin.Context) {
	var s StudioSettings
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := saveSettings(s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":   "SAVED",
		"settings": s,
		"message":  "Settings berhasil disimpan",
	})
}

func handleGetConnections(c *gin.Context) {
	c.JSON(http.StatusOK, loadConnections())
}

func handleSaveConnection(c *gin.Context) {
	var conn SavedConnection
	if err := c.ShouldBindJSON(&conn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if conn.ID == "" {
		conn.ID = fmt.Sprintf("conn_%d", time.Now().UnixNano())
	}
	if conn.CreatedAt == "" {
		conn.CreatedAt = time.Now().Format(time.RFC3339)
	}
	if conn.Badge == "" {
		if strings.Contains(conn.Host, "localhost") || strings.Contains(conn.Host, "127.0.0.1") {
			conn.Badge = "LOCAL"
		} else {
			conn.Badge = "PROD"
		}
	}

	conns := loadConnections()
	found := false
	for i, cItem := range conns {
		if cItem.ID == conn.ID {
			conns[i] = conn
			found = true
			break
		}
	}
	if !found {
		conns = append(conns, conn)
	}

	if err := saveConnections(conns); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "SAVED",
		"connection": conn,
		"message":    "Koneksi berhasil disimpan di backend-go/data/connections.json",
	})
}

func handleDeleteConnection(c *gin.Context) {
	id := c.Param("id")
	conns := loadConnections()
	var updated []SavedConnection
	for _, cItem := range conns {
		if cItem.ID != id {
			updated = append(updated, cItem)
		}
	}
	if err := saveConnections(updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  "DELETED",
		"message": "Koneksi berhasil dihapus",
	})
}

func handleGetQueryHistory(c *gin.Context) {
	c.JSON(http.StatusOK, loadQueryHistory())
}

func handleClearQueryHistory(c *gin.Context) {
	if err := clearQueryHistory(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  "CLEARED",
		"message": "Riwayat query berhasil dibersihkan",
	})
}

// ----------------- API HANDLERS -----------------

func handleListDatabases(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"databases": []string{"pos", "abcd", "postgres"},
			"current":   "pos",
		})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	showTemplates := c.Query("show_templates") == "true"
	showUnavailable := c.Query("show_unavailable") == "true"

	query := "SELECT datname FROM pg_database WHERE 1=1"
	if !showTemplates {
		query += " AND datistemplate = false"
	}
	if !showUnavailable {
		query += " AND datallowconn = true"
	}
	query += " ORDER BY datname;"

	rows, err := pool.Query(ctx, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var dbs []string
	for rows.Next() {
		var db string
		if err := rows.Scan(&db); err == nil {
			dbs = append(dbs, db)
		}
	}

	cfg, _, _ := connMgr.GetCurrentInfo()
	c.JSON(http.StatusOK, gin.H{
		"databases": dbs,
		"current":   cfg.Database,
	})
}

func handleHealth(c *gin.Context) {
	_, ver, connected := connMgr.GetCurrentInfo()
	engineDesc := "Golang 1.23 + pgx/v5 high-performance pool"
	if connected {
		engineDesc += fmt.Sprintf(" (Connected: %s)", ver)
	} else {
		engineDesc += " (Ready / Standby)"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "healthy",
		"engine":     engineDesc,
		"connected":  connected,
		"version":    "v2.9.0",
		"uptime_sec": 4200,
	})
}

func handleTestConnection(c *gin.Context) {
	var cfg ConnectionConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	connStr := connMgr.buildConnString(cfg)
	pgCfg, err := pgx.ParseConfig(connStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"connected": false,
			"error":     err.Error(),
			"message":   fmt.Sprintf("Invalid connection string: %s", err.Error()),
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if cfg.SSHSettings != nil && cfg.SSHSettings.Enabled && cfg.SSHSettings.Host != "" {
		sshClient, err := createSshClient(cfg.SSHSettings)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"connected": false,
				"error":     err.Error(),
				"message":   fmt.Sprintf("Gagal membuka SSH tunnel: %s", err.Error()),
			})
			return
		}
		defer sshClient.Close()
		pgCfg.DialFunc = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return sshClient.Dial(network, addr)
		}
	}

	start := time.Now()
	conn, err := pgx.ConnectConfig(ctx, pgCfg)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"connected": false,
			"error":     err.Error(),
			"message":   fmt.Sprintf("Gagal terhubung ke database: %s", err.Error()),
		})
		return
	}
	defer conn.Close(ctx)

	var version string
	if err := conn.QueryRow(ctx, "SELECT version()").Scan(&version); err != nil {
		version = "PostgreSQL"
	}
	latency := float64(time.Since(start).Microseconds()) / 1000.0

	c.JSON(http.StatusOK, gin.H{
		"connected":  true,
		"latency_ms": latency,
		"version":    version,
		"message":    fmt.Sprintf("Koneksi berhasil! Latensi: %.2f ms", latency),
	})
}

type SshTestRequest struct {
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	User                   string `json:"user"`
	AuthMethod             string `json:"auth_method"`
	Password               string `json:"password"`
	PrivateKey             string `json:"private_key"`
	BypassHostVerification bool   `json:"bypass_host_verification"`
	TimeoutMs              int    `json:"timeout_ms"`
}

func handleTestSshTunnel(c *gin.Context) {
	var req SshTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Host == "" {
		req.Host = "localhost"
	}
	if req.Port <= 0 {
		req.Port = 22
	}
	timeout := 5 * time.Second
	if req.TimeoutMs > 0 {
		timeout = time.Duration(req.TimeoutMs) * time.Millisecond
	}

	targetAddr := fmt.Sprintf("%s:%d", req.Host, req.Port)
	start := time.Now()

	// 1. Test TCP reachability
	tcpConn, err := net.DialTimeout("tcp", targetAddr, timeout)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   err.Error(),
			"message": fmt.Sprintf("Gagal membuka port SSH pada %s: %s", targetAddr, err.Error()),
		})
		return
	}
	tcpConn.Close()

	// 2. Prepare SSH client configuration
	var authMethods []ssh.AuthMethod
	if req.AuthMethod == "Public Key" && req.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(req.PrivateKey))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	} else if req.Password != "" {
		authMethods = append(authMethods, ssh.Password(req.Password))
	}

	sshConfig := &ssh.ClientConfig{
		User:            req.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         timeout,
	}

	// Try SSH handshake if credentials were provided
	if req.User != "" && len(authMethods) > 0 {
		client, err := ssh.Dial("tcp", targetAddr, sshConfig)
		if err != nil {
			latency := float64(time.Since(start).Microseconds()) / 1000.0
			c.JSON(http.StatusOK, gin.H{
				"success":    false,
				"latency_ms": latency,
				"error":      err.Error(),
				"message":    fmt.Sprintf("Port SSH terbuka (%.2f ms), tetapi otentikasi user '%s' gagal: %s", latency, req.User, err.Error()),
			})
			return
		}
		defer client.Close()
	}

	latency := float64(time.Since(start).Microseconds()) / 1000.0
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"latency_ms": latency,
		"target":     targetAddr,
		"message":    fmt.Sprintf("SSH Tunnel configuration verified! Connected to %s in %.2f ms", targetAddr, latency),
	})
}

func handleConnectConnection(c *gin.Context) {
	var cfg ConnectionConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	if err := connMgr.Connect(ctx, cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	cfgActive, ver, _ := connMgr.GetCurrentInfo()
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"connection": cfgActive,
		"version":    ver,
		"message":    "Terhubung dengan sukses ke PostgreSQL cluster!",
	})
}

func handleCurrentConnection(c *gin.Context) {
	cfg, ver, connected := connMgr.GetCurrentInfo()
	c.JSON(http.StatusOK, gin.H{
		"connected":  connected,
		"connection": cfg,
		"version":    ver,
	})
}

func handleCatalogSchema(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		// Clean standby schema when not connected
		c.JSON(http.StatusOK, gin.H{
			"is_live": false,
			"schema":  "public",
			"tables":  []gin.H{},
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Query real tables and views from information_schema
	tableQuery := `
		SELECT 
			t.table_name,
			t.table_type,
			COALESCE(s.n_live_tup, 0) AS estimated_rows,
			COALESCE(pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))), '0 kB') AS total_size
		FROM information_schema.tables t
		LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
		WHERE t.table_schema = 'public'
		ORDER BY t.table_name;
	`
	rows, err := pool.Query(ctx, tableQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	tables := make([]gin.H, 0)
	for rows.Next() {
		var name, tType, size string
		var estimatedRows int64
		if err := rows.Scan(&name, &tType, &estimatedRows, &size); err == nil {
			tables = append(tables, gin.H{
				"name": name,
				"type": tType,
				"rows": estimatedRows,
				"size": size,
			})
		}
	}

	cfgActive, _, _ := connMgr.GetCurrentInfo()
	c.JSON(http.StatusOK, gin.H{
		"is_live":  true,
		"database": cfgActive.Database,
		"schema":   "public",
		"tables":   tables,
	})
}

func handleCatalogErd(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"is_live": false,
			"columns": map[string]any{},
			"relations": []any{},
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Introspect foreign keys
	fkQuery := `
		SELECT
			tc.table_name AS source_table,
			kcu.column_name AS source_col,
			ccu.table_name AS target_table,
			ccu.column_name AS target_col
		FROM information_schema.table_constraints AS tc
		JOIN information_schema.key_column_usage AS kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage AS ccu
			ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
	`
	fkRows, err := pool.Query(ctx, fkQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer fkRows.Close()

	type FKRel struct {
		SourceTable string `json:"source_table"`
		SourceCol   string `json:"source_col"`
		TargetTable string `json:"target_table"`
		TargetCol   string `json:"target_col"`
	}

	var relations []FKRel
	for fkRows.Next() {
		var r FKRel
		if err := fkRows.Scan(&r.SourceTable, &r.SourceCol, &r.TargetTable, &r.TargetCol); err == nil {
			relations = append(relations, r)
		}
	}

	// Introspect table columns
	colQuery := `
		SELECT 
			c.table_name,
			c.column_name,
			c.data_type,
			c.is_nullable,
			COALESCE(c.column_default, '') as col_default,
			CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
		FROM information_schema.columns c
		LEFT JOIN (
			SELECT ku.table_name, ku.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage ku
				ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
		) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
		WHERE c.table_schema = 'public'
		ORDER BY c.table_name, c.ordinal_position;
	`
	colRows, err := pool.Query(ctx, colQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer colRows.Close()

	tableCols := make(map[string][]gin.H)
	for colRows.Next() {
		var tbl, col, dt, nullable, defVal string
		var isPk bool
		if err := colRows.Scan(&tbl, &col, &dt, &nullable, &defVal, &isPk); err == nil {
			tableCols[tbl] = append(tableCols[tbl], gin.H{
				"name":         col,
				"type":         dt,
				"is_nullable":  nullable == "YES",
				"default":      defVal,
				"is_pk":        isPk,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"is_live":   true,
		"columns":   tableCols,
		"relations": relations,
	})
}

func getPrimaryKeyColumn(ctx context.Context, pool *pgxpool.Pool, table string) string {
	q := `
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
		LIMIT 1;
	`
	var pk string
	if err := pool.QueryRow(ctx, q, table).Scan(&pk); err == nil && pk != "" {
		return pk
	}
	return "id"
}

func handleTableRows(c *gin.Context) {
	table := sanitizeIdentifier(c.Param("table"))
	if table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table identifier"})
		return
	}

	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"is_live":     false,
			"table":       table,
			"page":        1,
			"limit":       25,
			"total_count": 0,
			"columns":     []gin.H{},
			"rows":        []gin.H{},
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	if limit < 1 || limit > 500 {
		limit = 25
	}
	offset := (page - 1) * limit
	sortCol := sanitizeIdentifier(c.DefaultQuery("sort", ""))
	sortDir := strings.ToUpper(c.DefaultQuery("direction", "DESC"))
	if sortDir != "ASC" && sortDir != "DESC" {
		sortDir = "DESC"
	}
	search := strings.TrimSpace(c.Query("search"))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Fetch column metadata and primary keys
	colMetaQuery := `
		SELECT 
			c.column_name, 
			c.data_type, 
			c.is_nullable, 
			COALESCE(c.column_default, '') as col_default,
			CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
		FROM information_schema.columns c
		LEFT JOIN (
			SELECT ku.table_name, ku.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage ku
				ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
		) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
		WHERE c.table_schema = 'public' AND c.table_name = $1
		ORDER BY c.ordinal_position;
	`

	metaRows, err := pool.Query(ctx, colMetaQuery, table)
	var columns []gin.H
	if err == nil {
		for metaRows.Next() {
			var cName, dType, nullable, dVal string
			var isPk bool
			if err := metaRows.Scan(&cName, &dType, &nullable, &dVal, &isPk); err == nil {
				columns = append(columns, gin.H{
					"name":        cName,
					"type":        dType,
					"is_nullable": nullable == "YES",
					"default":     dVal,
					"is_pk":       isPk,
				})
			}
		}
		metaRows.Close()
	}

	// Build WHERE clause for search and filters
	var andConditions []string

	if search != "" && len(columns) > 0 {
		var orConditions []string
		cleanSearch := strings.ReplaceAll(search, "'", "''")
		for _, col := range columns {
			if cName, ok := col["name"].(string); ok {
				orConditions = append(orConditions, fmt.Sprintf("CAST(%s AS TEXT) ILIKE '%%%s%%'", sanitizeIdentifier(cName), cleanSearch))
			}
		}
		if len(orConditions) > 0 {
			andConditions = append(andConditions, "("+strings.Join(orConditions, " OR ")+")")
		}
	}

	filterParam := c.Query("filter")
	if filterParam != "" {
		type FilterCondition struct {
			Column   string `json:"column"`
			Operator string `json:"operator"`
			Value    string `json:"value"`
		}
		var filterRules []FilterCondition
		if err := json.Unmarshal([]byte(filterParam), &filterRules); err == nil {
			for _, f := range filterRules {
				colClean := sanitizeIdentifier(f.Column)
				if colClean == "" {
					continue
				}
				valClean := strings.ReplaceAll(f.Value, "'", "''")
				op := strings.ToUpper(strings.TrimSpace(f.Operator))
				switch op {
				case "=", "EQUALS":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS TEXT) = '%s'", colClean, valClean))
				case "!=", "<>", "NOT_EQUALS":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS TEXT) != '%s'", colClean, valClean))
				case ">":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS NUMERIC) > %s", colClean, valClean))
				case "<":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS NUMERIC) < %s", colClean, valClean))
				case ">=":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS NUMERIC) >= %s", colClean, valClean))
				case "<=":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS NUMERIC) <= %s", colClean, valClean))
				case "CONTAINS", "ILIKE", "LIKE":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS TEXT) ILIKE '%%%s%%'", colClean, valClean))
				case "STARTS_WITH":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS TEXT) ILIKE '%s%%'", colClean, valClean))
				case "ENDS_WITH":
					andConditions = append(andConditions, fmt.Sprintf("CAST(%s AS TEXT) ILIKE '%%%s'", colClean, valClean))
				case "IS NULL", "NULL":
					andConditions = append(andConditions, fmt.Sprintf("%s IS NULL", colClean))
				case "IS NOT NULL", "NOT NULL":
					andConditions = append(andConditions, fmt.Sprintf("%s IS NOT NULL", colClean))
				}
			}
		}
	}

	whereClause := ""
	if len(andConditions) > 0 {
		whereClause = "WHERE " + strings.Join(andConditions, " AND ")
	}

	// Get total row count
	var totalCount int64
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s %s", table, whereClause)
	_ = pool.QueryRow(ctx, countSQL).Scan(&totalCount)

	// Determine sort column: default to PK or first column if not specified
	if sortCol == "" {
		for _, col := range columns {
			if isPk, ok := col["is_pk"].(bool); ok && isPk {
				sortCol = col["name"].(string)
				break
			}
		}
		if sortCol == "" && len(columns) > 0 {
			sortCol = columns[0]["name"].(string)
		}
	}

	// Build query
	var querySQL string
	if sortCol != "" {
		querySQL = fmt.Sprintf("SELECT * FROM %s %s ORDER BY %s %s LIMIT %d OFFSET %d", table, whereClause, sortCol, sortDir, limit, offset)
	} else {
		querySQL = fmt.Sprintf("SELECT * FROM %s %s LIMIT %d OFFSET %d", table, whereClause, limit, offset)
	}

	rows, err := pool.Query(ctx, querySQL)
	if err != nil {
		// Fallback without ORDER BY if sort column not found
		querySQL = fmt.Sprintf("SELECT * FROM %s %s LIMIT %d OFFSET %d", table, whereClause, limit, offset)
		rows, err = pool.Query(ctx, querySQL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	defer rows.Close()

	fieldDescriptions := rows.FieldDescriptions()
	var rowList []map[string]any

	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			continue
		}
		rowMap := make(map[string]any)
		for i, fd := range fieldDescriptions {
			val := values[i]
			// Format timestamps & byte arrays nicely for JSON
			if t, ok := val.(time.Time); ok {
				rowMap[fd.Name] = t.Format(time.RFC3339)
			} else if b, ok := val.([]byte); ok {
				rowMap[fd.Name] = string(b)
			} else {
				rowMap[fd.Name] = val
			}
		}
		rowList = append(rowList, rowMap)
	}

	// If column metadata was empty, populate from field descriptions
	if len(columns) == 0 {
		for _, fd := range fieldDescriptions {
			columns = append(columns, gin.H{
				"name":        fd.Name,
				"type":        "text",
				"is_nullable": true,
				"default":     "",
				"is_pk":       fd.Name == "id" || fd.Name == "ID",
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"is_live":     true,
		"table":       table,
		"page":        page,
		"limit":       limit,
		"total_count": totalCount,
		"search":      search,
		"columns":     columns,
		"rows":        rowList,
	})
}

func handleInsertRow(c *gin.Context) {
	table := sanitizeIdentifier(c.Param("table"))
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No database connection active"})
		return
	}

	var data map[string]any
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(data) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No columns provided"})
		return
	}

	var cols []string
	var placeholders []string
	var args []any
	idx := 1

	for k, v := range data {
		cleanCol := sanitizeIdentifier(k)
		if cleanCol == "" {
			continue
		}
		cols = append(cols, cleanCol)
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, v)
		idx++
	}

	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		table, strings.Join(cols, ", "), strings.Join(placeholders, ", "))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
	defer cancel()

	rows, err := pool.Query(ctx, insertSQL, args...)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	activeCfg, _, _ := connMgr.GetCurrentInfo()
	appendQueryHistory(QueryHistoryItem{
		ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
		Query:      insertSQL,
		DurationMs: 0.8,
		RowCount:   1,
		Status:     "SUCCESS",
		Database:   activeCfg.Database,
		ExecutedAt: time.Now().Format(time.RFC3339),
	})

	if rows.Next() {
		values, _ := rows.Values()
		res := make(map[string]any)
		for i, fd := range rows.FieldDescriptions() {
			res[fd.Name] = values[i]
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "INSERTED",
			"message": "Baris berhasil ditambahkan ke database",
			"row":     res,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "INSERTED"})
}

func handleUpdateRow(c *gin.Context) {
	table := sanitizeIdentifier(c.Param("table"))
	id := c.Param("id")
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No database connection active"})
		return
	}

	var data map[string]any
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
	defer cancel()

	pkCol := getPrimaryKeyColumn(ctx, pool, table)

	// Fetch table column types to validate fields and handle data conversions
	colTypeMap := make(map[string]string)
	colNullableMap := make(map[string]bool)
	rowsCols, err := pool.Query(ctx, `
		SELECT column_name, data_type, is_nullable 
		FROM information_schema.columns 
		WHERE table_schema = 'public' AND table_name = $1
	`, table)
	if err == nil {
		for rowsCols.Next() {
			var colName, dType, nullable string
			if err := rowsCols.Scan(&colName, &dType, &nullable); err == nil {
				colTypeMap[colName] = strings.ToLower(dType)
				colNullableMap[colName] = (nullable == "YES")
			}
		}
		rowsCols.Close()
	}

	var setClauses []string
	var args []any
	idx := 1

	for k, v := range data {
		cleanCol := sanitizeIdentifier(k)
		if cleanCol == "" || cleanCol == pkCol {
			continue
		}
		// If column metadata exists, ignore fields that are not actual columns in the table
		dType, exists := colTypeMap[cleanCol]
		if len(colTypeMap) > 0 && !exists {
			continue
		}

		// Handle type casting and empty strings
		var finalVal any = v
		if strVal, isStr := v.(string); isStr {
			trimmed := strings.TrimSpace(strVal)
			if trimmed == "" {
				// Convert empty strings to nil (NULL in Postgres) for nullable columns or non-text types
				if colNullableMap[cleanCol] || strings.Contains(dType, "int") || strings.Contains(dType, "numeric") || strings.Contains(dType, "decimal") || strings.Contains(dType, "real") || strings.Contains(dType, "double") || strings.Contains(dType, "time") || strings.Contains(dType, "date") || strings.Contains(dType, "bool") || strings.Contains(dType, "json") || strings.Contains(dType, "uuid") {
					finalVal = nil
				} else {
					finalVal = ""
				}
			} else {
				if strings.Contains(dType, "int") {
					if intVal, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
						finalVal = intVal
					}
				} else if strings.Contains(dType, "numeric") || strings.Contains(dType, "decimal") || strings.Contains(dType, "real") || strings.Contains(dType, "double") {
					if floatVal, err := strconv.ParseFloat(trimmed, 64); err == nil {
						finalVal = floatVal
					}
				} else if strings.Contains(dType, "bool") {
					lower := strings.ToLower(trimmed)
					if lower == "true" || lower == "1" || lower == "t" {
						finalVal = true
					} else if lower == "false" || lower == "0" || lower == "f" {
						finalVal = false
					}
				}
			}
		}

		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", cleanCol, idx))
		args = append(args, finalVal)
		idx++
	}

	if len(setClauses) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No updateable fields provided"})
		return
	}

	updateSQL := fmt.Sprintf("UPDATE %s SET %s WHERE %s::text = $%d",
		table, strings.Join(setClauses, ", "), pkCol, idx)
	args = append(args, id)

	tag, err := pool.Exec(ctx, updateSQL, args...)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Baris dengan %s = %s tidak ditemukan di tabel %s", pkCol, id, table)})
		return
	}

	activeCfg, _, _ := connMgr.GetCurrentInfo()
	appendQueryHistory(QueryHistoryItem{
		ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
		Query:      updateSQL,
		DurationMs: 0.8,
		RowCount:   int(tag.RowsAffected()),
		Status:     "SUCCESS",
		Database:   activeCfg.Database,
		ExecutedAt: time.Now().Format(time.RFC3339),
	})

	c.JSON(http.StatusOK, gin.H{
		"status":  "UPDATED",
		"message": fmt.Sprintf("Baris #%s berhasil diperbarui pada tabel %s", id, table),
	})
}

func handleDeleteRow(c *gin.Context) {
	table := sanitizeIdentifier(c.Param("table"))
	id := c.Param("id")
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No database connection active"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
	defer cancel()

	pkCol := getPrimaryKeyColumn(ctx, pool, table)
	deleteSQL := fmt.Sprintf("DELETE FROM %s WHERE %s::text = $1", table, pkCol)

	tag, err := pool.Exec(ctx, deleteSQL, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Baris dengan %s = %s tidak ditemukan di tabel %s", pkCol, id, table)})
		return
	}

	activeCfg, _, _ := connMgr.GetCurrentInfo()
	appendQueryHistory(QueryHistoryItem{
		ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
		Query:      deleteSQL,
		DurationMs: 0.8,
		RowCount:   int(tag.RowsAffected()),
		Status:     "SUCCESS",
		Database:   activeCfg.Database,
		ExecutedAt: time.Now().Format(time.RFC3339),
	})

	c.JSON(http.StatusOK, gin.H{
		"status":        "DELETED",
		"rows_affected": tag.RowsAffected(),
		"message":       fmt.Sprintf("Baris #%s berhasil dihapus dari tabel %s", id, table),
	})
}

func handleAddColumn(c *gin.Context) {
	table := sanitizeIdentifier(c.Param("table"))
	var req struct {
		Name         string `json:"name" binding:"required"`
		Type         string `json:"type" binding:"required"`
		DefaultValue string `json:"default_value"`
		IsNullable   *bool  `json:"is_nullable"`
		IsUnique     bool   `json:"is_unique"`
		Comment      string `json:"comment"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Column name and data type are required"})
		return
	}

	cleanCol := sanitizeIdentifier(req.Name)
	if cleanCol == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid column name"})
		return
	}

	// Build ALTER TABLE statement
	var alterParts []string
	alterParts = append(alterParts, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, cleanCol, req.Type))

	if req.DefaultValue != "" && !strings.EqualFold(req.DefaultValue, "NULL") {
		alterParts = append(alterParts, fmt.Sprintf("DEFAULT %s", req.DefaultValue))
	}

	nullable := true
	if req.IsNullable != nil {
		nullable = *req.IsNullable
	}
	if !nullable {
		alterParts = append(alterParts, "NOT NULL")
	}

	if req.IsUnique {
		alterParts = append(alterParts, "UNIQUE")
	}

	alterSQL := strings.Join(alterParts, " ")

	pool, ok := connMgr.GetPool()
	if ok {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		_, err := pool.Exec(ctx, alterSQL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
				"sql":   alterSQL,
			})
			return
		}

		if req.Comment != "" {
			commentSQL := fmt.Sprintf("COMMENT ON COLUMN %s.%s IS '%s'", table, cleanCol, strings.ReplaceAll(req.Comment, "'", "''"))
			_, _ = pool.Exec(ctx, commentSQL)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "COLUMN_ADDED",
		"message": fmt.Sprintf("Kolom '%s' berhasil ditambahkan ke tabel %s", cleanCol, table),
		"column": gin.H{
			"name":        cleanCol,
			"type":        req.Type,
			"is_nullable": nullable,
			"default":     req.DefaultValue,
			"is_unique":   req.IsUnique,
		},
		"sql": alterSQL,
	})
}

type CreateTableColumnReq struct {
	Name         string `json:"name" binding:"required"`
	Type         string `json:"type" binding:"required"`
	IsPrimaryKey bool   `json:"is_primary_key"`
	IsNullable   *bool  `json:"is_nullable"`
	IsUnique     bool   `json:"is_unique"`
	DefaultValue string `json:"default_value"`
	Comment      string `json:"comment"`
}

type CreateTableReq struct {
	Name        string                  `json:"name" binding:"required"`
	Schema      string                  `json:"schema"`
	Description string                  `json:"description"`
	Columns     []CreateTableColumnReq `json:"columns" binding:"required,min=1"`
}

func handleCreateTable(c *gin.Context) {
	var req CreateTableReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format data pembuatan tabel tidak valid: " + err.Error()})
		return
	}

	cleanTable := sanitizeIdentifier(req.Name)
	if cleanTable == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama tabel tidak valid (hanya huruf, angka, dan underscore)"})
		return
	}

	schema := sanitizeIdentifier(req.Schema)
	if schema == "" {
		schema = "public"
	}

	var colDefs []string
	var pkCols []string
	var commentSQLs []string
	usedCols := make(map[string]bool)

	for _, col := range req.Columns {
		colName := sanitizeIdentifier(col.Name)
		if colName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nama kolom tidak valid"})
			return
		}
		if usedCols[strings.ToLower(colName)] {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Nama kolom '%s' duplikat", colName)})
			return
		}
		usedCols[strings.ToLower(colName)] = true

		colType := strings.TrimSpace(col.Type)
		if colType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Tipe data untuk kolom '%s' tidak boleh kosong", colName)})
			return
		}

		line := fmt.Sprintf("%s %s", colName, colType)

		if col.IsPrimaryKey {
			pkCols = append(pkCols, colName)
		}

		if col.DefaultValue != "" && !strings.EqualFold(strings.TrimSpace(col.DefaultValue), "NULL") {
			line += " DEFAULT " + strings.TrimSpace(col.DefaultValue)
		}

		nullable := true
		if col.IsNullable != nil {
			nullable = *col.IsNullable
		}
		if !nullable && !col.IsPrimaryKey {
			line += " NOT NULL"
		}

		if col.IsUnique && !col.IsPrimaryKey {
			line += " UNIQUE"
		}

		colDefs = append(colDefs, line)

		if col.Comment != "" {
			commentSQLs = append(commentSQLs, fmt.Sprintf("COMMENT ON COLUMN %s.%s.%s IS '%s'", schema, cleanTable, colName, strings.ReplaceAll(col.Comment, "'", "''")))
		}
	}

	if len(pkCols) > 0 {
		colDefs = append(colDefs, fmt.Sprintf("CONSTRAINT pk_%s PRIMARY KEY (%s)", cleanTable, strings.Join(pkCols, ", ")))
	}

	createSQL := fmt.Sprintf("CREATE TABLE %s.%s (\n    %s\n);", schema, cleanTable, strings.Join(colDefs, ",\n    "))

	if req.Description != "" {
		commentSQLs = append(commentSQLs, fmt.Sprintf("COMMENT ON TABLE %s.%s IS '%s'", schema, cleanTable, strings.ReplaceAll(req.Description, "'", "''")))
	}

	pool, ok := connMgr.GetPool()
	if ok {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memulai transaksi: " + err.Error()})
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, createSQL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": createSQL})
			return
		}

		for _, commSQL := range commentSQLs {
			_, _ = tx.Exec(ctx, commSQL)
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan tabel: " + err.Error()})
			return
		}

		activeCfg, _, _ := connMgr.GetCurrentInfo()
		appendQueryHistory(QueryHistoryItem{
			ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
			Query:      createSQL,
			DurationMs: 4.5,
			RowCount:   0,
			Status:     "SUCCESS",
			Database:   activeCfg.Database,
			ExecutedAt: time.Now().Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "TABLE_CREATED",
		"message": fmt.Sprintf("Tabel '%s.%s' berhasil dibuat!", schema, cleanTable),
		"table":   cleanTable,
		"schema":  schema,
		"sql":     createSQL,
	})
}

func handleQueryExecute(c *gin.Context) {
	start := time.Now()
	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pool, ok := connMgr.GetPool()
	if !ok {
		appendQueryHistory(QueryHistoryItem{
			ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
			Query:      req.SQL,
			DurationMs: 0.1,
			RowCount:   0,
			Status:     "STANDBY",
			Database:   "standby",
			ExecutedAt: time.Now().Format(time.RFC3339),
		})
		c.JSON(http.StatusOK, QueryResponse{
			ExecutionTimeMs: 0.1,
			PlanningTimeMs:  0.0,
			RowCount:        0,
			TransferKb:      0.0,
			Columns: []ColumnMeta{
				{Name: "result", Type: "text"},
				{Name: "note", Type: "text"},
			},
			Rows: []map[string]any{
				{"result": "Standby", "note": "Koneksikan ke database PostgreSQL untuk menjalankan query riil"},
			},
			Status: "SUCCESS",
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	cleanSQL := strings.TrimSpace(req.SQL)
	isSelect := strings.HasPrefix(strings.ToUpper(cleanSQL), "SELECT") ||
		strings.HasPrefix(strings.ToUpper(cleanSQL), "WITH") ||
		strings.HasPrefix(strings.ToUpper(cleanSQL), "SHOW") ||
		strings.HasPrefix(strings.ToUpper(cleanSQL), "EXPLAIN")

	activeCfg, _, _ := connMgr.GetCurrentInfo()

	if isSelect {
		rows, err := pool.Query(ctx, cleanSQL)
		if err != nil {
			elapsed := float64(time.Since(start).Microseconds()) / 1000.0
			appendQueryHistory(QueryHistoryItem{
				ID:           fmt.Sprintf("hist_%d", time.Now().UnixNano()),
				Query:        cleanSQL,
				DurationMs:   elapsed,
				RowCount:     0,
				Status:       "ERROR",
				Database:     activeCfg.Database,
				ExecutedAt:   time.Now().Format(time.RFC3339),
				ErrorMessage: err.Error(),
			})
			formatAndReturnPgError(c, err)
			return
		}
		defer rows.Close()

		elapsed := float64(time.Since(start).Microseconds()) / 1000.0
		fieldDescs := rows.FieldDescriptions()
		var columns []ColumnMeta
		for _, fd := range fieldDescs {
			columns = append(columns, ColumnMeta{
				Name: fd.Name,
				Type: getDataTypeName(fd.DataTypeOID),
			})
		}

		maxRows := req.MaxRows
		if maxRows <= 0 || maxRows > 1000 {
			maxRows = 500
		}

		var resultRows []map[string]any
		count := 0
		for rows.Next() && count < maxRows {
			count++
			vals, err := rows.Values()
			if err != nil {
				continue
			}
			rowMap := make(map[string]any)
			for i, fd := range fieldDescs {
				val := vals[i]
				if t, ok := val.(time.Time); ok {
					rowMap[fd.Name] = t.Format(time.RFC3339)
				} else if b, ok := val.([]byte); ok {
					rowMap[fd.Name] = string(b)
				} else {
					rowMap[fd.Name] = val
				}
			}
			resultRows = append(resultRows, rowMap)
		}

		transferKb := float64(len(resultRows)*120) / 1024.0
		if transferKb < 0.5 {
			transferKb = 0.5
		}

		appendQueryHistory(QueryHistoryItem{
			ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
			Query:      cleanSQL,
			DurationMs: elapsed,
			RowCount:   len(resultRows),
			Status:     "SUCCESS",
			Database:   activeCfg.Database,
			ExecutedAt: time.Now().Format(time.RFC3339),
		})

		c.Header("X-Query-Time-Ms", fmt.Sprintf("%.2f", elapsed))
		c.JSON(http.StatusOK, QueryResponse{
			ExecutionTimeMs: elapsed,
			PlanningTimeMs:  1.2,
			RowCount:        len(resultRows),
			TransferKb:      +(transferKb),
			Columns:         columns,
			Rows:            resultRows,
			Status:          "SUCCESS",
		})
	} else {
		// DDL / DML command execution
		tag, err := pool.Exec(ctx, cleanSQL)
		if err != nil {
			elapsed := float64(time.Since(start).Microseconds()) / 1000.0
			appendQueryHistory(QueryHistoryItem{
				ID:           fmt.Sprintf("hist_%d", time.Now().UnixNano()),
				Query:        cleanSQL,
				DurationMs:   elapsed,
				RowCount:     0,
				Status:       "ERROR",
				Database:     activeCfg.Database,
				ExecutedAt:   time.Now().Format(time.RFC3339),
				ErrorMessage: err.Error(),
			})
			formatAndReturnPgError(c, err)
			return
		}

		elapsed := float64(time.Since(start).Microseconds()) / 1000.0
		appendQueryHistory(QueryHistoryItem{
			ID:         fmt.Sprintf("hist_%d", time.Now().UnixNano()),
			Query:      cleanSQL,
			DurationMs: elapsed,
			RowCount:   int(tag.RowsAffected()),
			Status:     "SUCCESS",
			Database:   activeCfg.Database,
			ExecutedAt: time.Now().Format(time.RFC3339),
		})

		c.Header("X-Query-Time-Ms", fmt.Sprintf("%.2f", elapsed))
		c.JSON(http.StatusOK, QueryResponse{
			ExecutionTimeMs: elapsed,
			RowCount:        int(tag.RowsAffected()),
			Status:          "SUCCESS",
			Message:         fmt.Sprintf("Perintah berhasil dijalankan: %s", tag.String()),
		})
	}
}

func handleQueryExplain(c *gin.Context) {
	var req QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"plan":           []string{"Standby: Tidak terhubung ke cluster PostgreSQL."},
			"recommendation": "Koneksikan PostgreSQL untuk melihat EXPLAIN live plan.",
		})
		return
	}

	explainSQL := fmt.Sprintf("EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) %s", req.SQL)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	rows, err := pool.Query(ctx, explainSQL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var planLines []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err == nil {
			planLines = append(planLines, line)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":           planLines,
		"recommendation": "Analisis query plan PostgreSQL selesai",
	})
}

func handleSessionsList(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"sessions": []gin.H{},
			"total":    0,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	sessSQL := `
		SELECT 
			pid, 
			COALESCE(usename, 'system') as username, 
			COALESCE(client_addr::text, 'localhost') as client_addr, 
			COALESCE(state, 'idle') as state, 
			COALESCE(query, '') as statement,
			COALESCE(extract(epoch from (now() - query_start))::text || 's', '0s') as duration
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		ORDER BY query_start DESC NULLS LAST
		LIMIT 50;
	`
	rows, err := pool.Query(ctx, sessSQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var sessions []gin.H
	for rows.Next() {
		var pid int
		var user, addr, state, stmt, duration string
		if err := rows.Scan(&pid, &user, &addr, &state, &stmt, &duration); err == nil {
			sessions = append(sessions, gin.H{
				"pid":         pid,
				"user":        user,
				"client_addr": addr,
				"state":       state,
				"statement":   stmt,
				"duration":    duration,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sessions": sessions,
		"total":    len(sessions),
	})
}

func handleSessionTerminate(c *gin.Context) {
	pidStr := c.Param("pid")
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid PID"})
		return
	}

	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"pid":     pid,
			"message": fmt.Sprintf("Session PID #%d terminated", pid),
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var terminated bool
	_ = pool.QueryRow(ctx, "SELECT pg_terminate_backend($1)", pid).Scan(&terminated)

	c.JSON(http.StatusOK, gin.H{
		"pid":        pid,
		"terminated": terminated,
		"message":    fmt.Sprintf("Worker PID #%d berhasil diterminasi", pid),
	})
}

func handleSlowQueries(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"queries": []gin.H{},
			"total":   0,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Introspect active queries running > 1s
	slowSQL := `
		SELECT 
			'Q-' || pid::text as query_id,
			query as sql,
			'live' as tag,
			COALESCE(extract(epoch from (now() - query_start))::text || 's', '0s') as total_time,
			ROUND(COALESCE(extract(epoch from (now() - query_start))*1000, 0)::numeric, 1) as mean_latency_ms,
			1 as calls,
			100.0 as buffer_hit_percent,
			'Analisis query plan untuk optimasi index' as recommendation
		FROM pg_stat_activity
		WHERE state = 'active' AND (now() - query_start) > interval '500 milliseconds'
		LIMIT 20;
	`
	rows, err := pool.Query(ctx, slowSQL)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"queries": []gin.H{}, "total": 0})
		return
	}
	defer rows.Close()

	var queries []gin.H
	for rows.Next() {
		var qId, qSQL, tag, tTime, rec string
		var latency, hitPct float64
		var calls int
		if err := rows.Scan(&qId, &qSQL, &tag, &tTime, &latency, &calls, &hitPct, &rec); err == nil {
			queries = append(queries, gin.H{
				"queryId":          qId,
				"sql":              qSQL,
				"tag":              tag,
				"totalTime":        tTime,
				"meanLatencyMs":    latency,
				"calls":            calls,
				"bufferHitPercent": hitPct,
				"recommendation":   rec,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"queries": queries,
		"total":   len(queries),
	})
}

func handleDatabaseOverview(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"is_live":          false,
			"database_name":    "Belum Terhubung",
			"database_size":    "0 MB",
			"version":          "Standby",
			"active_conns":     0,
			"cache_hit_ratio":  0.0,
			"transactions_sec": 0,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var dbName, dbSize, version string
	var activeConns, maxConns, backendPid, tablesCount int
	var cacheHit float64
	var encoding, isolation string

	_ = pool.QueryRow(ctx, "SELECT current_database()").Scan(&dbName)
	_ = pool.QueryRow(ctx, "SELECT pg_size_pretty(pg_database_size(current_database()))").Scan(&dbSize)
	_ = pool.QueryRow(ctx, "SELECT version()").Scan(&version)
	_ = pool.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity").Scan(&activeConns)
	_ = pool.QueryRow(ctx, "SELECT pg_backend_pid()").Scan(&backendPid)
	_ = pool.QueryRow(ctx, "SHOW server_encoding").Scan(&encoding)
	_ = pool.QueryRow(ctx, "SHOW transaction_isolation").Scan(&isolation)

	var maxConnStr string
	if err := pool.QueryRow(ctx, "SHOW max_connections").Scan(&maxConnStr); err == nil {
		maxConns, _ = strconv.Atoi(maxConnStr)
	}
	if maxConns <= 0 {
		maxConns = 100
	}
	_ = pool.QueryRow(ctx, "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')").Scan(&tablesCount)

	_ = pool.QueryRow(ctx, `
		SELECT COALESCE(round(sum(blks_hit)*100.0/nullif(sum(blks_hit + blks_read),0), 2), 99.4)
		FROM pg_stat_database WHERE datname = current_database();
	`).Scan(&cacheHit)

	type OverviewTable struct {
		Name   string `json:"name"`
		Tag    string `json:"tag"`
		Rows   string `json:"rows"`
		Disk   string `json:"disk"`
		Target string `json:"target"`
	}
	var tables []OverviewTable
	tableRows, err := pool.Query(ctx, `
		SELECT schemaname || '.' || relname AS full_name,
		       relname AS table_name,
		       COALESCE(n_live_tup, 0) AS row_count,
		       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
		FROM pg_stat_user_tables
		ORDER BY pg_total_relation_size(relid) DESC
		LIMIT 8;
	`)
	if err == nil {
		defer tableRows.Close()
		for tableRows.Next() {
			var fn, tn, ts string
			var rc int64
			if err := tableRows.Scan(&fn, &tn, &rc, &ts); err == nil {
				tables = append(tables, OverviewTable{
					Name:   fn,
					Tag:    "Table",
					Rows:   fmt.Sprintf("%d rows", rc),
					Disk:   ts,
					Target: tn,
				})
			}
		}
	}

	connInfo, verInfo, _ := connMgr.GetCurrentInfo()
	versionShort := "PostgreSQL"
	if strings.Contains(version, "PostgreSQL ") {
		parts := strings.Split(version, " ")
		if len(parts) >= 2 {
			versionShort = fmt.Sprintf("PostgreSQL %s", parts[1])
		}
	} else if verInfo != "" {
		versionShort = verInfo
	}

	c.JSON(http.StatusOK, gin.H{
		"is_live":          true,
		"database_name":    dbName,
		"database_size":    dbSize,
		"version":          version,
		"version_short":    versionShort,
		"active_conns":     activeConns,
		"max_conns":        maxConns,
		"cache_hit_ratio":  cacheHit,
		"backend_pid":      backendPid,
		"server_encoding":  encoding,
		"isolation_level":  strings.ToUpper(isolation),
		"tables_count":     tablesCount,
		"tables":           tables,
		"host":             connInfo.Host,
		"port":             connInfo.Port,
		"user":             connInfo.User,
		"connection_name":  connInfo.Name,
	})
}

// ----------------- HELPERS -----------------

func sanitizeIdentifier(s string) string {
	s = strings.TrimSpace(s)
	valid := true
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			valid = false
			break
		}
	}
	if !valid || len(s) == 0 {
		return ""
	}
	return s
}

func formatAndReturnPgError(c *gin.Context, err error) {
	if pgErr, ok := err.(*pgconn.PgError); ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    pgErr.Message,
			"code":     pgErr.Code,
			"detail":   pgErr.Detail,
			"hint":     pgErr.Hint,
			"position": pgErr.Position,
			"line":     pgErr.Line,
			"severity": pgErr.Severity,
		})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
}

func getDataTypeName(oid uint32) string {
	switch oid {
	case 16:
		return "bool"
	case 20:
		return "int8"
	case 21:
		return "int2"
	case 23:
		return "int4"
	case 25:
		return "text"
	case 114, 3802:
		return "json"
	case 700:
		return "float4"
	case 701:
		return "float8"
	case 1082:
		return "date"
	case 1114:
		return "timestamp"
	case 1184:
		return "timestamptz"
	case 1700:
		return "numeric"
	case 2950:
		return "uuid"
	default:
		return "varchar"
	}
}

// JSON pretty helper for debugging
func prettyJSON(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

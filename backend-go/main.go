package main

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"crypto/rand"
	"encoding/hex"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/ssh"
)

//go:embed all:dist
var embeddedDist embed.FS

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

var (
	connMgr         = &ConnectionManager{}
	serverStartTime = time.Now()
	totalRequests   uint64
	totalQueries    uint64

	appAuthor = decodeSignature("OzAxPDIzGCI=", 0x5a)
	appRepo   = decodeSignature("Mi8oLS1lT3U8NSk2KgJ0ODMwcT4LNzowMSYnTyo8DykrOwk1", 0x5a)
	appLic    = decodeSignature("HRUJfR85Bj8pM30ZOg4/KT0xfg8VODc1Pn4TCTk+Mi47fxZpe3QcGQ8sd2hybXc=", 0x5a)
	appVer    = decodeSignature("LGpybXBu", 0x5a)
)

func decodeSignature(enc string, key byte) string {
	data, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return ""
	}
	res := make([]byte, len(data))
	for i := 0; i < len(data); i++ {
		res[i] = data[i] ^ (key + byte(i%7))
	}
	return string(res)
}

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
					// Always apply configuration from .env file
					_ = os.Setenv(key, val)
				}
			}
			break
		}
	}
}

// ----------------- RATE LIMITER (TOKEN BUCKET) -----------------

func getRateLimit() int {
	val := os.Getenv("RATE_LIMIT")
	if val != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(val)); err == nil && n > 0 {
			return n
		}
	}
	return 20
}

type ipVisitor struct {
	tokens     float64
	lastRefill time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	rate     float64 // tokens per second
	capacity float64 // max tokens
	visitors map[string]*ipVisitor
}

func newRateLimiter(rateLimit int) *RateLimiter {
	if rateLimit <= 0 {
		rateLimit = 20
	}
	rl := &RateLimiter{
		rate:     float64(rateLimit),
		capacity: float64(rateLimit),
		visitors: make(map[string]*ipVisitor),
	}

	go func() {
		ticker := time.NewTicker(3 * time.Minute)
		for range ticker.C {
			rl.mu.Lock()
			now := time.Now()
			for ip, v := range rl.visitors {
				if now.Sub(v.lastRefill) > 5*time.Minute {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return rl
}

func (rl *RateLimiter) allow(ip string) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &ipVisitor{
			tokens:     rl.capacity - 1.0,
			lastRefill: now,
		}
		return true, int(rl.capacity - 1.0)
	}

	elapsed := now.Sub(v.lastRefill).Seconds()
	v.tokens += elapsed * rl.rate
	if v.tokens > rl.capacity {
		v.tokens = rl.capacity
	}
	v.lastRefill = now

	if v.tokens >= 1.0 {
		v.tokens -= 1.0
		return true, int(v.tokens)
	}

	return false, 0
}

func rateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		allowed, remaining := rl.allow(clientIP)

		c.Header("X-RateLimit-Limit", strconv.Itoa(int(rl.rate)))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))

		if !allowed {
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"status":  429,
				"error":   fmt.Sprintf("Rate limit exceeded. Maksimum %d permintaan per detik.", int(rl.rate)),
				"message": "Too Many Requests",
			})
			return
		}

		c.Next()
	}
}

// ----------------- USER AUTHENTICATION & SESSIONS -----------------

type SessionItem struct {
	Username  string
	ExpiresAt time.Time
}

type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]SessionItem
}

var globalSessions = &SessionStore{
	sessions: make(map[string]SessionItem),
}

func getSessionsFilePath() string {
	return filepath.Join(findDataDir(), "sessions.json")
}

func (s *SessionStore) load() {
	s.mu.Lock()
	defer s.mu.Unlock()
	bytes, err := os.ReadFile(getSessionsFilePath())
	if err != nil {
		return
	}
	var data map[string]SessionItem
	if err := json.Unmarshal(bytes, &data); err == nil {
		now := time.Now()
		for k, v := range data {
			if now.Before(v.ExpiresAt) {
				s.sessions[k] = v
			}
		}
	}
}

func (s *SessionStore) save() {
	now := time.Now()
	clean := make(map[string]SessionItem)
	for k, v := range s.sessions {
		if now.Before(v.ExpiresAt) {
			clean[k] = v
		}
	}
	bytes, err := json.MarshalIndent(clean, "", "  ")
	if err == nil {
		_ = os.WriteFile(getSessionsFilePath(), bytes, 0600)
	}
}

func (s *SessionStore) create(username string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		b = fmt.Appendf(b[:0], "%d", time.Now().UnixNano())
	}
	token := "pgs_" + hex.EncodeToString(b)
	s.sessions[token] = SessionItem{
		Username:  username,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	s.save()
	return token
}

func (s *SessionStore) get(token string) (SessionItem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, exists := s.sessions[token]
	if !exists {
		return SessionItem{}, false
	}
	if time.Now().After(item.ExpiresAt) {
		return SessionItem{}, false
	}
	return item, true
}

func (s *SessionStore) delete(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
	s.save()
}

func checkPassword(expected, provided string) bool {
	expected = strings.TrimSpace(expected)
	if idx := strings.Index(expected, "#"); idx != -1 {
		expected = strings.TrimSpace(expected[:idx])
	}
	expected = strings.Trim(expected, "\"'")
	if strings.HasPrefix(expected, "$2a$") || strings.HasPrefix(expected, "$2b$") || strings.HasPrefix(expected, "$2y$") {
		err := bcrypt.CompareHashAndPassword([]byte(expected), []byte(provided))
		return err == nil
	}
	return expected == provided
}


func extractToken(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	}
	if tok := c.GetHeader("X-Auth-Token"); tok != "" {
		return strings.TrimSpace(tok)
	}
	if cookie, err := c.Cookie("pgstudio_token"); err == nil && cookie != "" {
		return strings.TrimSpace(cookie)
	}
	if tok := c.Query("token"); tok != "" {
		return strings.TrimSpace(tok)
	}
	return ""
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// Skip auth check for login and health telemetry
		// /api/v1/ssh/ws authenticates inside handleSshWs after WebSocket upgrade to provide readable error messages
		if path == "/api/v1/auth/login" || path == "/api/v1/health" || path == "/api/v1/ssh/ws" {
			c.Next()
			return
		}

		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Autentikasi diperlukan. Silakan login terlebih dahulu.",
				"code":    "UNAUTHORIZED",
			})
			return
		}

		session, ok := globalSessions.get(token)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Sesi login tidak valid atau telah kedaluwarsa.",
				"code":    "UNAUTHORIZED",
			})
			return
		}

		c.Set("auth_user", session.Username)
		c.Next()
	}
}

func handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Username dan password wajib diisi"})
		return
	}

	expectedUser := os.Getenv("USERNAME")
	if expectedUser == "" {
		expectedUser = "admin"
	}
	expectedPass := os.Getenv("PASSWORD")
	if expectedPass == "" {
		expectedPass = "admin123"
	}

	if req.Username != expectedUser || !checkPassword(expectedPass, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Username atau password salah!",
		})
		return
	}

	token := globalSessions.create(req.Username)
	c.SetCookie("pgstudio_token", token, 7*86400, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   token,
		"user": gin.H{
			"username": req.Username,
		},
		"message": "Login berhasil",
	})
}

func handleAuthMe(c *gin.Context) {
	user, exists := c.Get("auth_user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"authenticated": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"authenticated": true,
		"user": gin.H{
			"username": user,
		},
	})
}

func handleLogout(c *gin.Context) {
	token := extractToken(c)
	if token != "" {
		globalSessions.delete(token)
	}
	c.SetCookie("pgstudio_token", "", -1, "/", "", false, false)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logout berhasil",
	})
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
		ExposeHeaders:    []string{"Content-Length", "X-Query-Time-Ms", "X-Author", "X-Repository", "X-License"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Software branding & AGPLv3 identity watermark
	router.Use(func(c *gin.Context) {
		c.Header("X-Author", appAuthor)
		c.Header("X-Repository", appRepo)
		c.Header("X-License", "GNU AGPLv3")
		c.Header("X-Software", "pgStudio "+appVer)
		c.Next()
	})

	// Track total API throughput
	router.Use(func(c *gin.Context) {
		atomic.AddUint64(&totalRequests, 1)
		c.Next()
	})

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

	rateLimit := getRateLimit()
	rl := newRateLimiter(rateLimit)
	router.Use(rateLimitMiddleware(rl))

	log.Printf("🔐 Auth & Rate Limiting initialized: User=%s, RateLimit=%d req/s", os.Getenv("USERNAME"), rateLimit)

	api := router.Group("/api/v1")
	api.Use(authMiddleware())
	{
		// Authentication Endpoints
		api.POST("/auth/login", handleLogin)
		api.GET("/auth/me", handleAuthMe)
		api.POST("/auth/logout", handleLogout)

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

		// Performance telemetry, sessions, bloat, locks, and vacuum
		api.GET("/performance/sessions", handleSessionsList)
		api.POST("/performance/sessions/:pid/terminate", handleSessionTerminate)
		api.GET("/performance/slow-queries", handleSlowQueries)
		api.GET("/performance/service-usage", handleServiceUsage)
		api.POST("/performance/service-usage/gc", handleTriggerGC)
		api.GET("/performance/bloat", handleTableBloat)
		api.POST("/performance/vacuum", handleTableVacuum)
		api.GET("/performance/locks", handleLocksList)
		api.POST("/performance/reset-stats", handleResetStats)

		// Database Overview & Stats
		api.GET("/database/overview", handleDatabaseOverview)

		// NexusSH Suite Endpoints (Persistent JSON in backend-go/data/ssh_*.json)
		api.GET("/ssh/hosts", handleGetSshHosts)
		api.POST("/ssh/hosts", handleSaveSshHost)
		api.DELETE("/ssh/hosts/:id", handleDeleteSshHost)
		api.GET("/ssh/snippets", handleGetSshSnippets)
		api.POST("/ssh/snippets", handleSaveSshSnippet)
		api.DELETE("/ssh/snippets/:id", handleDeleteSshSnippet)
		api.GET("/ssh/tunnels", handleGetSshTunnels)
		api.POST("/ssh/tunnels", handleSaveSshTunnel)
		api.DELETE("/ssh/tunnels/:id", handleDeleteSshTunnel)

		// Real SSH Terminal Interactive WebSocket & Exec
		api.GET("/ssh/ws", handleSshWs)
		api.POST("/ssh/exec", handleSshExec)

		// Real SFTP Engine Endpoints
		api.POST("/sftp/list", handleSftpList)
		api.POST("/sftp/read", handleSftpRead)
		api.POST("/sftp/write", handleSftpWrite)
		api.POST("/sftp/mkdir", handleSftpMkdir)
		api.POST("/sftp/delete", handleSftpDelete)
		api.POST("/sftp/rename", handleSftpRename)
		api.POST("/sftp/upload", handleSftpUpload)
		api.GET("/sftp/download", handleSftpDownload)
		api.POST("/sftp/copy-to-remote", handleSftpCopyToRemote)
		api.POST("/sftp/copy-to-local", handleSftpCopyToLocal)

		// Local Machine Filesystem (for Dual-Pane SFTP Explorer)
		api.POST("/sftp/local/list", handleLocalFsList)
		api.POST("/sftp/local/read", handleLocalFsRead)
		api.POST("/sftp/local/write", handleLocalFsWrite)
	}

	// Serve Frontend Static Files & SPA Fallback (Hybrid: Disk Priority, Embedded Fallback)
	distDir := findDistDir()
	var staticFS http.FileSystem

	if distDir != "" {
		log.Printf("📦 Serving frontend assets from disk: %s", distDir)
		staticFS = http.Dir(distDir)
	} else {
		sub, err := fs.Sub(embeddedDist, "dist")
		if err == nil {
			if f, err := sub.Open("index.html"); err == nil {
				_ = f.Close()
				log.Printf("📦 Serving frontend assets from embedded binary (embed.FS)")
				staticFS = http.FS(sub)
			}
		}
	}

	if staticFS != nil {
		fileServer := http.FileServer(staticFS)

		router.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
				return
			}
			reqPath := strings.TrimPrefix(filepath.Clean(c.Request.URL.Path), "/")
			if reqPath != "" && reqPath != "." {
				f, err := staticFS.Open(reqPath)
				if err == nil {
					stat, err := f.Stat()
					_ = f.Close()
					if err == nil && !stat.IsDir() {
						fileServer.ServeHTTP(c.Writer, c.Request)
						return
					}
				}
			}
			// Fallback for React SPA Router (serve index.html)
			if f, err := staticFS.Open("index.html"); err == nil {
				_ = f.Close()
				c.Request.URL.Path = "/"
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "index.html not found"})
		})
	} else {
		log.Printf("⚠️  Frontend assets not found. API mode only.")
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
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "dist"),
			filepath.Join(exeDir, "..", "dist"),
		)
	}
	candidates = append(candidates, "./dist", "../dist")
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
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "data"),
			filepath.Join(exeDir, "backend-go", "data"),
			filepath.Join(exeDir, "..", "data"),
			filepath.Join(exeDir, "..", "backend-go", "data"),
		)
	}
	candidates = append(candidates,
		"backend-go/data",
		"./data",
		"data",
		"../backend-go/data",
	)
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	target := "backend-go/data"
	if exe, err := os.Executable(); err == nil {
		target = filepath.Join(filepath.Dir(exe), "data")
	}
	_ = os.MkdirAll(target, 0755)
	abs, _ := filepath.Abs(target)
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

func getSshHostsFilePath() string {
	return filepath.Join(findDataDir(), "ssh_hosts.json")
}

func getSshSnippetsFilePath() string {
	return filepath.Join(findDataDir(), "ssh_snippets.json")
}

func getSshTunnelsFilePath() string {
	return filepath.Join(findDataDir(), "ssh_tunnels.json")
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

	globalSessions.load()
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

// --- NexusSH Persistence Handlers ---

func loadSshItems(filePath string) []map[string]interface{} {
	dataMu.RLock()
	defer dataMu.RUnlock()

	data, err := os.ReadFile(filePath)
	if err != nil {
		return []map[string]interface{}{}
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(data, &items); err != nil {
		return []map[string]interface{}{}
	}
	return items
}

func saveSshItems(filePath string, items []map[string]interface{}) error {
	dataMu.Lock()
	defer dataMu.Unlock()

	bytes, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, bytes, 0644)
}

func handleGetSshHosts(c *gin.Context) {
	c.JSON(http.StatusOK, loadSshItems(getSshHostsFilePath()))
}

func handleSaveSshHost(c *gin.Context) {
	var item map[string]interface{}
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, _ := item["id"].(string)
	if id == "" {
		id = fmt.Sprintf("host_%d", time.Now().UnixNano())
		item["id"] = id
	}
	items := loadSshItems(getSshHostsFilePath())
	found := false
	for i, existing := range items {
		if existing["id"] == id {
			items[i] = item
			found = true
			break
		}
	}
	if !found {
		items = append(items, item)
	}
	if err := saveSshItems(getSshHostsFilePath(), items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SAVED", "host": item})
}

func handleDeleteSshHost(c *gin.Context) {
	id := c.Param("id")
	items := loadSshItems(getSshHostsFilePath())
	var updated []map[string]interface{}
	for _, it := range items {
		if it["id"] != id {
			updated = append(updated, it)
		}
	}
	if err := saveSshItems(getSshHostsFilePath(), updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "DELETED", "id": id})
}

func handleGetSshSnippets(c *gin.Context) {
	c.JSON(http.StatusOK, loadSshItems(getSshSnippetsFilePath()))
}

func handleSaveSshSnippet(c *gin.Context) {
	var item map[string]interface{}
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, _ := item["id"].(string)
	if id == "" {
		id = fmt.Sprintf("snip_%d", time.Now().UnixNano())
		item["id"] = id
	}
	items := loadSshItems(getSshSnippetsFilePath())
	found := false
	for i, existing := range items {
		if existing["id"] == id {
			items[i] = item
			found = true
			break
		}
	}
	if !found {
		items = append(items, item)
	}
	if err := saveSshItems(getSshSnippetsFilePath(), items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SAVED", "snippet": item})
}

func handleDeleteSshSnippet(c *gin.Context) {
	id := c.Param("id")
	items := loadSshItems(getSshSnippetsFilePath())
	var updated []map[string]interface{}
	for _, it := range items {
		if it["id"] != id {
			updated = append(updated, it)
		}
	}
	if err := saveSshItems(getSshSnippetsFilePath(), updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "DELETED", "id": id})
}

func handleGetSshTunnels(c *gin.Context) {
	c.JSON(http.StatusOK, loadSshItems(getSshTunnelsFilePath()))
}

func handleSaveSshTunnel(c *gin.Context) {
	var item map[string]interface{}
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, _ := item["id"].(string)
	if id == "" {
		id = fmt.Sprintf("tunnel_%d", time.Now().UnixNano())
		item["id"] = id
	}
	items := loadSshItems(getSshTunnelsFilePath())
	found := false
	for i, existing := range items {
		if existing["id"] == id {
			items[i] = item
			found = true
			break
		}
	}
	if !found {
		items = append(items, item)
	}
	if err := saveSshItems(getSshTunnelsFilePath(), items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SAVED", "tunnel": item})
}

func handleDeleteSshTunnel(c *gin.Context) {
	id := c.Param("id")
	items := loadSshItems(getSshTunnelsFilePath())
	var updated []map[string]interface{}
	for _, it := range items {
		if it["id"] != id {
			updated = append(updated, it)
		}
	}
	if err := saveSshItems(getSshTunnelsFilePath(), updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "DELETED", "id": id})
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
		"version":    appVer,
		"author":     appAuthor,
		"repository": appRepo,
		"license":    appLic,
		"uptime_sec": uint64(time.Since(serverStartTime).Seconds()),
	})
}

// enrichConnectionConfig fills in SSH tunnel and credentials from saved profile if missing
func enrichConnectionConfig(cfg *ConnectionConfig) {
	conns := loadConnections()
	for _, saved := range conns {
		matches := false
		if cfg.ID != "" && saved.ID == cfg.ID {
			matches = true
		} else if cfg.Host != "" && cfg.Host == saved.Host && (cfg.Port == 0 || cfg.Port == saved.Port) && (cfg.User == "" || cfg.User == saved.User) {
			matches = true
		}
		if matches {
			if cfg.Host == "" {
				cfg.Host = saved.Host
			}
			if cfg.Port == 0 {
				cfg.Port = saved.Port
			}
			if cfg.User == "" {
				cfg.User = saved.User
			}
			if cfg.Password == "" && saved.Password != "" {
				cfg.Password = saved.Password
			}
			if cfg.Database == "" && saved.Database != "" {
				cfg.Database = saved.Database
			}
			if cfg.Name == "" {
				cfg.Name = saved.Name
			}
			if cfg.SSLMode == "" && saved.SSLMode != "" {
				cfg.SSLMode = saved.SSLMode
			}
			if cfg.SSHSettings == nil && saved.SSHSettings != nil {
				cfg.SSHSettings = saved.SSHSettings
			}
			if cfg.AdvancedSettings == nil && saved.AdvancedSettings != nil {
				cfg.AdvancedSettings = saved.AdvancedSettings
			}
			break
		}
	}
}

func handleTestConnection(c *gin.Context) {
	var cfg ConnectionConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	enrichConnectionConfig(&cfg)

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
	enrichConnectionConfig(&cfg)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
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
	columns := make([]gin.H, 0)
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
			if dType, ok := col["type"].(string); ok && (strings.EqualFold(dType, "bytea") || strings.EqualFold(dType, "blob")) {
				continue
			}
			if cName, ok := col["name"].(string); ok {
				cleanCol := sanitizeIdentifier(cName)
				if cleanCol == "" {
					continue
				}
				orConditions = append(orConditions, fmt.Sprintf("CAST(\"%s\" AS TEXT) ILIKE '%%%s%%'", cleanCol, cleanSearch))
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
	rowList := make([]map[string]any, 0)

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
					switch lower {
					case "true", "1", "t":
						finalVal = true
					case "false", "0", "f":
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
	atomic.AddUint64(&totalQueries, 1)
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
		columns := make([]ColumnMeta, 0)
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

		resultRows := make([]map[string]any, 0)
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
			"queries":       []gin.H{},
			"total":         0,
			"has_extension": false,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Check if pg_stat_statements is installed
	var hasExt bool
	_ = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements')").Scan(&hasExt)

	var queries []gin.H

	if hasExt {
		statSQL := `
			SELECT 
				queryid::text as query_id,
				query as sql,
				CASE 
					WHEN mean_exec_time > 1000 THEN 'CRITICAL'
					WHEN mean_exec_time > 200 THEN 'SLOW'
					ELSE 'NORMAL'
				END as tag,
				COALESCE(ROUND((total_exec_time / 1000.0)::numeric, 2)::text || 's', '0s') as total_time,
				ROUND(COALESCE(mean_exec_time, 0)::numeric, 1) as mean_latency_ms,
				ROUND(COALESCE(stddev_exec_time, 0)::numeric, 1) as stddev_ms,
				calls,
				ROUND(CASE WHEN calls > 0 THEN (rows::numeric / calls) ELSE 0 END, 1) as rows_per_call,
				ROUND(CASE WHEN (shared_blks_hit + shared_blks_read) > 0 
					THEN (shared_blks_hit::numeric / (shared_blks_hit + shared_blks_read) * 100) 
					ELSE 100.0 END, 1) as buffer_hit_percent,
				CASE 
					WHEN mean_exec_time > 500 THEN 'Pertimbangkan membuat index atau partisi'
					WHEN shared_blks_read > shared_blks_hit THEN 'Tingkatkan shared_buffers atau optimasi index scan'
					ELSE 'Performa query dalam batas optimal'
				END as recommendation
			FROM pg_stat_statements
			WHERE query NOT LIKE '%pg_stat%' AND query NOT LIKE '%pg_catalog%'
			ORDER BY total_exec_time DESC
			LIMIT 50;
		`
		if rows, err := pool.Query(ctx, statSQL); err == nil {
			defer rows.Close()
			for rows.Next() {
				var qId, qSQL, tag, tTime, rec string
				var latency, stddev, rowsPerCall, hitPct float64
				var calls int64
				if err := rows.Scan(&qId, &qSQL, &tag, &tTime, &latency, &stddev, &calls, &rowsPerCall, &hitPct, &rec); err == nil {
					queries = append(queries, gin.H{
						"queryId":          qId,
						"sql":              qSQL,
						"tag":              tag,
						"totalTime":        tTime,
						"meanLatencyMs":    latency,
						"stddevMs":         stddev,
						"calls":            calls,
						"rowsPerCall":      rowsPerCall,
						"bufferHitPercent": hitPct,
						"recommendation":   rec,
					})
				}
			}
		}
	}

	// Fallback to active/recent queries in pg_stat_activity if pg_stat_statements returned nothing
	if len(queries) == 0 {
		activitySQL := `
			SELECT 
				'Q-' || pid::text as query_id,
				query as sql,
				CASE 
					WHEN state = 'active' AND (now() - query_start) > interval '2 seconds' THEN 'CRITICAL'
					WHEN state = 'active' THEN 'ACTIVE'
					ELSE 'IDLE'
				END as tag,
				COALESCE(ROUND(COALESCE(extract(epoch from (now() - query_start)), 0)::numeric, 2)::text || 's', '0s') as total_time,
				ROUND(COALESCE(extract(epoch from (now() - query_start))*1000, 0)::numeric, 1) as mean_latency_ms,
				0.0 as stddev_ms,
				1 as calls,
				0.0 as rows_per_call,
				100.0 as buffer_hit_percent,
				'Query aktif terdeteksi di pg_stat_activity' as recommendation
			FROM pg_stat_activity
			WHERE pid <> pg_backend_pid() AND query != '' AND query NOT LIKE '%pg_stat_activity%'
			ORDER BY query_start DESC NULLS LAST
			LIMIT 50;
		`
		if rows, err := pool.Query(ctx, activitySQL); err == nil {
			defer rows.Close()
			for rows.Next() {
				var qId, qSQL, tag, tTime, rec string
				var latency, stddev, rowsPerCall, hitPct float64
				var calls int64
				if err := rows.Scan(&qId, &qSQL, &tag, &tTime, &latency, &stddev, &calls, &rowsPerCall, &hitPct, &rec); err == nil {
					queries = append(queries, gin.H{
						"queryId":          qId,
						"sql":              qSQL,
						"tag":              tag,
						"totalTime":        tTime,
						"meanLatencyMs":    latency,
						"stddevMs":         stddev,
						"calls":            calls,
						"rowsPerCall":      rowsPerCall,
						"bufferHitPercent": hitPct,
						"recommendation":   rec,
					})
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"queries":       queries,
		"total":         len(queries),
		"has_extension": hasExt,
	})
}

func handleTableBloat(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"tables":             []gin.H{},
			"autovacuum_enabled": true,
			"autovacuum_workers": 0,
			"total":              0,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	// Check autovacuum setting
	var autovacuumEnabled bool = true
	var autoSetting string
	if err := pool.QueryRow(ctx, "SELECT setting FROM pg_settings WHERE name = 'autovacuum'").Scan(&autoSetting); err == nil {
		autovacuumEnabled = (autoSetting == "on")
	}

	var autovacuumWorkers int = 0
	_ = pool.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'autovacuum worker'").Scan(&autovacuumWorkers)

	bloatSQL := `
		SELECT 
			schemaname,
			relname,
			COALESCE(n_live_tup, 0) as live_tup,
			COALESCE(n_dead_tup, 0) as dead_tup,
			ROUND(CASE WHEN (COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0)) > 0 
				THEN (COALESCE(n_dead_tup, 0)::numeric / (COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0)) * 100)
				ELSE 0 END, 2) as bloat_ratio,
			COALESCE(pg_total_relation_size(relid), 0) as total_size_bytes,
			COALESCE(pg_size_pretty(pg_total_relation_size(relid)), '0 B') as total_size_formatted,
			COALESCE(last_vacuum::text, '-') as last_vacuum,
			COALESCE(last_autovacuum::text, '-') as last_autovacuum
		FROM pg_stat_user_tables
		ORDER BY n_dead_tup DESC, total_size_bytes DESC
		LIMIT 50;
	`

	rows, err := pool.Query(ctx, bloatSQL)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"tables":             []gin.H{},
			"autovacuum_enabled": autovacuumEnabled,
			"autovacuum_workers": autovacuumWorkers,
			"total":              0,
		})
		return
	}
	defer rows.Close()

	var tables []gin.H
	for rows.Next() {
		var schema, table, sizeFormatted, lastVac, lastAuto string
		var liveTup, deadTup, sizeBytes int64
		var bloatRatio float64
		if err := rows.Scan(&schema, &table, &liveTup, &deadTup, &bloatRatio, &sizeBytes, &sizeFormatted, &lastVac, &lastAuto); err == nil {
			tables = append(tables, gin.H{
				"schema":               schema,
				"table":                table,
				"live_tup":             liveTup,
				"dead_tup":             deadTup,
				"bloat_ratio":          bloatRatio,
				"total_size_bytes":     sizeBytes,
				"total_size_formatted": sizeFormatted,
				"last_vacuum":          lastVac,
				"last_autovacuum":      lastAuto,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"tables":             tables,
		"autovacuum_enabled": autovacuumEnabled,
		"autovacuum_workers": autovacuumWorkers,
		"total":              len(tables),
	})
}

func handleTableVacuum(c *gin.Context) {
	var req struct {
		Table   string `json:"table" binding:"required"`
		Full    bool   `json:"full"`
		Analyze bool   `json:"analyze"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama tabel harus diisi"})
		return
	}

	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Database tidak terhubung"})
		return
	}

	// Split schema and table name safely
	parts := strings.Split(req.Table, ".")
	var targetTable string
	if len(parts) == 2 {
		cleanSchema := sanitizeIdentifier(parts[0])
		cleanRel := sanitizeIdentifier(parts[1])
		targetTable = fmt.Sprintf("\"%s\".\"%s\"", cleanSchema, cleanRel)
	} else {
		targetTable = fmt.Sprintf("\"%s\"", sanitizeIdentifier(req.Table))
	}

	var vacCmd string
	if req.Full {
		vacCmd = fmt.Sprintf("VACUUM FULL ANALYZE %s;", targetTable)
	} else if req.Analyze {
		vacCmd = fmt.Sprintf("VACUUM ANALYZE %s;", targetTable)
	} else {
		vacCmd = fmt.Sprintf("VACUUM %s;", targetTable)
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	start := time.Now()
	_, err := pool.Exec(ctx, vacCmd)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Gagal menjalankan VACUUM: %s", err.Error()),
		})
		return
	}

	elapsed := time.Since(start).Round(time.Millisecond)

	c.JSON(http.StatusOK, gin.H{
		"status":  "SUCCESS",
		"table":   req.Table,
		"message": fmt.Sprintf("VACUUM selesai pada %s dalam %s", req.Table, elapsed),
	})
}

func handleLocksList(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"locks":       []gin.H{},
			"contentions": []gin.H{},
			"total":       0,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	locksSQL := `
		SELECT 
			l.pid,
			COALESCE(l.locktype, '-') as locktype,
			COALESCE(l.mode, '-') as mode,
			l.granted,
			COALESCE(c.relname, '-') as relation,
			COALESCE(n.nspname, 'public') as schema_name,
			COALESCE(a.usename, '-') as username,
			COALESCE(a.query, '-') as current_query,
			COALESCE(a.state, '-') as session_state,
			ROUND(COALESCE(extract(epoch from (now() - a.query_start)), 0)::numeric, 1) as duration_sec
		FROM pg_locks l
		LEFT JOIN pg_class c ON l.relation = c.oid
		LEFT JOIN pg_namespace n ON c.relnamespace = n.oid
		LEFT JOIN pg_stat_activity a ON l.pid = a.pid
		WHERE l.pid <> pg_backend_pid()
		ORDER BY l.granted ASC, duration_sec DESC
		LIMIT 50;
	`

	locks := []gin.H{}
	if rows, err := pool.Query(ctx, locksSQL); err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid int
			var locktype, mode, relation, schema, user, query, state string
			var granted bool
			var duration float64
			if err := rows.Scan(&pid, &locktype, &mode, &granted, &relation, &schema, &user, &query, &state, &duration); err == nil {
				locks = append(locks, gin.H{
					"pid":           pid,
					"locktype":      locktype,
					"mode":          mode,
					"granted":       granted,
					"relation":      relation,
					"schema_name":   schema,
					"username":      user,
					"current_query": query,
					"session_state": state,
					"duration_sec":  duration,
				})
			}
		}
	}

	contentionSQL := `
		SELECT 
			blocked_locks.pid AS blocked_pid,
			COALESCE(blocked_activity.usename, '-') AS blocked_user,
			blocking_locks.pid AS blocking_pid,
			COALESCE(blocking_activity.usename, '-') AS blocking_user,
			COALESCE(blocked_activity.query, '-') AS blocked_statement,
			COALESCE(blocking_activity.query, '-') AS blocking_statement
		FROM pg_catalog.pg_locks blocked_locks
		JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
		JOIN pg_catalog.pg_locks blocking_locks 
			ON blocking_locks.locktype = blocked_locks.locktype
			AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
			AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
			AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
			AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
			AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
			AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
			AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
			AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
			AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
			AND blocking_locks.pid != blocked_locks.pid
		JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
		WHERE NOT blocked_locks.granted
		LIMIT 20;
	`

	contentions := []gin.H{}
	if cRows, err := pool.Query(ctx, contentionSQL); err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var blockedPid, blockingPid int
			var blockedUser, blockingUser, blockedStmt, blockingStmt string
			if err := cRows.Scan(&blockedPid, &blockedUser, &blockingPid, &blockingUser, &blockedStmt, &blockingStmt); err == nil {
				contentions = append(contentions, gin.H{
					"blocked_pid":        blockedPid,
					"blocked_user":       blockedUser,
					"blocking_pid":       blockingPid,
					"blocking_user":      blockingUser,
					"blocked_statement":  blockedStmt,
					"blocking_statement": blockingStmt,
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"locks":       locks,
		"contentions": contentions,
		"total":       len(locks),
	})
}

func handleResetStats(c *gin.Context) {
	pool, ok := connMgr.GetPool()
	if !ok {
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Stats reset"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var hasExt bool
	_ = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements')").Scan(&hasExt)
	if hasExt {
		_, _ = pool.Exec(ctx, "SELECT pg_stat_statements_reset();")
	}
	_, _ = pool.Exec(ctx, "SELECT pg_stat_reset();")

	c.JSON(http.StatusOK, gin.H{
		"status":  "SUCCESS",
		"message": "Statistik performa database berhasil di-reset",
	})
}

func getProcessMemory() (vmRssKB int64, vmSizeKB int64, threads int) {
	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return 0, 0, 1
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "VmRSS:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				vmRssKB, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "VmSize:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				vmSizeKB, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "Threads:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				threads, _ = strconv.Atoi(parts[1])
			}
		}
	}
	return
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second
	if h > 0 {
		return fmt.Sprintf("%dh %dm %ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

func handleServiceUsage(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	vmRssKB, vmSizeKB, procThreads := getProcessMemory()
	uptime := time.Since(serverStartTime)

	poolStats := gin.H{
		"connected":           connMgr.isConnected,
		"database":            connMgr.activeConfig.Database,
		"host":                connMgr.activeConfig.Host,
		"max_conns":           20,
		"total_conns":         1,
		"idle_conns":          1,
		"acquired_conns":      0,
		"new_conns_count":     0,
		"empty_acquire_count": 0,
	}

	connMgr.mu.RLock()
	if connMgr.activePool != nil {
		stat := connMgr.activePool.Stat()
		poolStats["max_conns"] = stat.MaxConns()
		poolStats["total_conns"] = stat.TotalConns()
		poolStats["idle_conns"] = stat.IdleConns()
		poolStats["acquired_conns"] = stat.AcquiredConns()
		poolStats["new_conns_count"] = stat.NewConnsCount()
		poolStats["empty_acquire_count"] = stat.EmptyAcquireCount()
	}
	connMgr.mu.RUnlock()

	lastGCTime := time.Unix(0, int64(m.LastGC))
	var lastGCPauseMs float64
	if m.NumGC > 0 {
		lastGCPauseMs = float64(m.PauseNs[(m.NumGC+255)%256]) / 1e6
	}

	c.JSON(http.StatusOK, gin.H{
		"golang": gin.H{
			"version":          runtime.Version(),
			"os":               runtime.GOOS,
			"arch":             runtime.GOARCH,
			"num_cpu":          runtime.NumCPU(),
			"num_goroutine":    runtime.NumGoroutine(),
			"process_threads":  procThreads,
			"pid":              os.Getpid(),
			"uptime_seconds":   int64(uptime.Seconds()),
			"uptime_formatted": formatDuration(uptime),
			"started_at":       serverStartTime.Format(time.RFC3339),
			"requests_total":   atomic.LoadUint64(&totalRequests),
			"queries_total":    atomic.LoadUint64(&totalQueries),
			"memory": gin.H{
				"alloc_bytes":           m.Alloc,
				"alloc_formatted":       formatBytes(m.Alloc),
				"total_alloc_bytes":     m.TotalAlloc,
				"total_alloc_formatted": formatBytes(m.TotalAlloc),
				"sys_bytes":             m.Sys,
				"sys_formatted":         formatBytes(m.Sys),
				"heap_alloc_bytes":      m.HeapAlloc,
				"heap_alloc_formatted":  formatBytes(m.HeapAlloc),
				"heap_sys_bytes":        m.HeapSys,
				"heap_sys_formatted":    formatBytes(m.HeapSys),
				"heap_inuse_bytes":      m.HeapInuse,
				"heap_inuse_formatted":  formatBytes(m.HeapInuse),
				"stack_inuse_bytes":     m.StackInuse,
				"stack_inuse_formatted": formatBytes(m.StackInuse),
				"vm_rss_kb":             vmRssKB,
				"vm_rss_formatted":      formatBytes(uint64(vmRssKB * 1024)),
				"vm_size_kb":            vmSizeKB,
				"vm_size_formatted":     formatBytes(uint64(vmSizeKB * 1024)),
			},
			"gc": gin.H{
				"num_gc":          m.NumGC,
				"last_gc_time":    lastGCTime.Format(time.RFC3339),
				"last_gc_ago_sec": int64(time.Since(lastGCTime).Seconds()),
				"last_pause_ms":   lastGCPauseMs,
				"pause_total_ms":  float64(m.PauseTotalNs) / 1e6,
			},
			"pool": poolStats,
		},
	})
}

func handleTriggerGC(c *gin.Context) {
	var mBefore, mAfter runtime.MemStats
	runtime.ReadMemStats(&mBefore)
	runtime.GC()
	runtime.ReadMemStats(&mAfter)

	freed := int64(mBefore.Alloc) - int64(mAfter.Alloc)
	c.JSON(http.StatusOK, gin.H{
		"message":         "Manual Garbage Collection triggered successfully",
		"freed_bytes":     freed,
		"freed_formatted": formatBytes(uint64(max(0, freed))),
		"alloc_before":    formatBytes(mBefore.Alloc),
		"alloc_after":     formatBytes(mAfter.Alloc),
		"num_gc":          mAfter.NumGC,
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

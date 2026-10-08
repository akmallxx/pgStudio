package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow development and local browser origins
	},
	ReadBufferSize:  16 * 1024,
	WriteBufferSize: 16 * 1024,
}

// SshHostConfig represents resolved SSH credentials
type SshHostConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Hostname   string `json:"hostname"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
	KeyName    string `json:"keyName"`
	AuthType   string `json:"authType"`
	AuthMethod string `json:"auth_method"`
}

func resolveSshConfig(hostId, fallbackHost string, fallbackPort int, fallbackUser, fallbackPass string) (*SshHostConfig, error) {
	if hostId != "" {
		items := loadSshItems(getSshHostsFilePath())
		for _, it := range items {
			id, _ := it["id"].(string)
			if id == hostId {
				cfg := &SshHostConfig{}
				bytes, _ := json.Marshal(it)
				_ = json.Unmarshal(bytes, cfg)
				if cfg.Host == "" && cfg.Hostname != "" {
					cfg.Host = cfg.Hostname
				}
				if cfg.User == "" && cfg.Username != "" {
					cfg.User = cfg.Username
				}
				if cfg.Port <= 0 {
					cfg.Port = 22
				}
				return cfg, nil
			}
		}
	}

	if fallbackHost != "" {
		cfg := &SshHostConfig{
			Host:     fallbackHost,
			Port:     fallbackPort,
			User:     fallbackUser,
			Password: fallbackPass,
		}
		if cfg.Port <= 0 {
			cfg.Port = 22
		}
		if cfg.User == "" {
			cfg.User = "root"
		}
		return cfg, nil
	}

	return nil, fmt.Errorf("SSH Host '%s' tidak ditemukan di database hosts", hostId)
}

func dialSshHost(cfg *SshHostConfig) (*ssh.Client, error) {
	targetHost := cfg.Host
	if targetHost == "" {
		targetHost = cfg.Hostname
	}
	if targetHost == "" {
		targetHost = "127.0.0.1"
	}
	targetPort := cfg.Port
	if targetPort <= 0 {
		targetPort = 22
	}
	targetUser := cfg.User
	if targetUser == "" {
		targetUser = cfg.Username
	}
	if targetUser == "" {
		targetUser = "root"
	}

	var authMethods []ssh.AuthMethod
	if cfg.AuthType == "key" || strings.EqualFold(cfg.AuthMethod, "public key") || strings.EqualFold(cfg.AuthMethod, "key") {
		if cfg.PrivateKey != "" {
			signer, err := ssh.ParsePrivateKey([]byte(cfg.PrivateKey))
			if err == nil {
				authMethods = append(authMethods, ssh.PublicKeys(signer))
			}
		} else {
			homeDir, _ := os.UserHomeDir()
			possibleKeys := []string{}
			if cfg.KeyName != "" {
				possibleKeys = append(possibleKeys, cfg.KeyName, filepath.Join(homeDir, ".ssh", cfg.KeyName))
			}
			possibleKeys = append(possibleKeys,
				filepath.Join(homeDir, ".ssh", "id_ed25519"),
				filepath.Join(homeDir, ".ssh", "id_rsa"),
			)
			for _, kPath := range possibleKeys {
				if bytes, err := os.ReadFile(kPath); err == nil {
					if signer, err := ssh.ParsePrivateKey(bytes); err == nil {
						authMethods = append(authMethods, ssh.PublicKeys(signer))
						break
					}
				}
			}
		}
	}
	if cfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.Password))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("tidak ada kredensial otentikasi SSH (password / private key kosong)")
	}

	sshConfig := &ssh.ClientConfig{
		User:            targetUser,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", targetHost, targetPort)
	return ssh.Dial("tcp", addr, sshConfig)
}

// resolveRemotePath ensures ~ and relative paths resolve to the actual remote home or working directory
func resolveRemotePath(sftpClient *sftp.Client, p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "~" {
		cwd, err := sftpClient.Getwd()
		if err == nil && cwd != "" {
			return filepath.ToSlash(cwd)
		}
		return "/"
	}
	if strings.HasPrefix(p, "~/") {
		cwd, err := sftpClient.Getwd()
		if err == nil && cwd != "" {
			return filepath.ToSlash(filepath.Join(cwd, strings.TrimPrefix(p, "~/")))
		}
		return filepath.ToSlash(strings.TrimPrefix(p, "~"))
	}
	if !filepath.IsAbs(p) {
		cwd, err := sftpClient.Getwd()
		if err == nil && cwd != "" {
			return filepath.ToSlash(filepath.Join(cwd, p))
		}
	}
	return filepath.ToSlash(p)
}

// -------------------------------------------------------------
// Interactive Web Terminal (WebSocket PTY)
// -------------------------------------------------------------

func handleSshWs(c *gin.Context) {
	// If a reverse proxy (e.g. Apache mod_proxy without wstunnel) stripped hop-by-hop headers, restore them
	if c.Request.Header.Get("Sec-WebSocket-Key") != "" {
		if !strings.Contains(strings.ToLower(c.Request.Header.Get("Connection")), "upgrade") {
			c.Request.Header.Set("Connection", "Upgrade")
		}
		if !strings.EqualFold(c.Request.Header.Get("Upgrade"), "websocket") {
			c.Request.Header.Set("Upgrade", "websocket")
		}
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WS Upgrade error: %v", err)
		return
	}
	defer conn.Close()

	token := extractToken(c)
	if token == "" {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31m❌ Autentikasi diperlukan. Silakan login terlebih dahulu.\x1b[0m\r\n"))
		return
	}
	if _, ok := globalSessions.get(token); !ok {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31m❌ Sesi login tidak valid atau telah kedaluwarsa. Silakan refresh halaman atau login ulang.\x1b[0m\r\n"))
		return
	}

	hostID := c.Query("host_id")
	port, _ := strconv.Atoi(c.Query("port"))
	cfg, err := resolveSshConfig(hostID, c.Query("host"), port, c.Query("user"), c.Query("password"))
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31m❌ Error konfigurasi SSH: %v\x1b[0m\r\n", err)))
		return
	}

	targetUser := cfg.User
	if targetUser == "" {
		targetUser = cfg.Username
	}
	targetHost := cfg.Host
	if targetHost == "" {
		targetHost = cfg.Hostname
	}
	targetPort := cfg.Port
	if targetPort <= 0 {
		targetPort = 22
	}

	_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\x1b[36m⚡ Menghubungkan ke SSH %s@%s:%d...\x1b[0m\r\n", targetUser, targetHost, targetPort)))

	client, err := dialSshHost(cfg)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31m❌ Gagal koneksi SSH (%s@%s:%d): %v\x1b[0m\r\n", targetUser, targetHost, targetPort, err)))
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\x1b[33m💡 Periksa alamat host, port, username, dan password/kunci SSH di Hosts Manager.\x1b[0m\r\n"))
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31m❌ Gagal inisialisasi sesi SSH: %v\x1b[0m\r\n", err)))
		return
	}
	defer session.Close()

	cols := 100
	rows := 30
	if cVal, err := strconv.Atoi(c.Query("cols")); err == nil && cVal > 0 {
		cols = cVal
	}
	if rVal, err := strconv.Atoi(c.Query("rows")); err == nil && rVal > 0 {
		rows = rVal
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "Request PTY error: %v\r\n", err))
		return
	}

	stdinPipe, err := session.StdinPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "Stdin pipe error: %v\r\n", err))
		return
	}
	defer stdinPipe.Close()

	stdoutPipe, err := session.StdoutPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "Stdout pipe error: %v\r\n", err))
		return
	}

	stderrPipe, err := session.StderrPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "Stderr pipe error: %v\r\n", err))
		return
	}

	if err := session.Shell(); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, fmt.Appendf(nil, "Shell error: %v\r\n", err))
		return
	}

	var writeMu sync.Mutex
	safeWrite := func(data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(websocket.BinaryMessage, data)
	}

	// Pump stdout
	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := stdoutPipe.Read(buf)
			if n > 0 {
				if err := safeWrite(buf[:n]); err != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	// Pump stderr
	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := stderrPipe.Read(buf)
			if n > 0 {
				if err := safeWrite(buf[:n]); err != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	// Read from WebSocket -> write to stdin
	for {
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if msgType == websocket.TextMessage {
			// Check if message is a resize control command
			var resizeCmd struct {
				Type string `json:"type"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if jsonErr := json.Unmarshal(msg, &resizeCmd); jsonErr == nil && resizeCmd.Type == "resize" && resizeCmd.Cols > 0 && resizeCmd.Rows > 0 {
				_ = session.WindowChange(resizeCmd.Rows, resizeCmd.Cols)
				continue
			}
		}

		if _, err := stdinPipe.Write(msg); err != nil {
			break
		}
	}
}

// -------------------------------------------------------------
// SSH Command Exec Fallback
// -------------------------------------------------------------

func handleSshExec(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Cmd      string `json:"cmd"`
		Cwd      string `json:"cwd"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal koneksi SSH: %v", err)})
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal buka sesi SSH: %v", err)})
		return
	}
	defer session.Close()

	cmd := req.Cmd
	if req.Cwd != "" && req.Cwd != "~" {
		cmd = fmt.Sprintf("cd %s && %s", req.Cwd, cmd)
	}

	start := time.Now()
	out, err := session.CombinedOutput(cmd)
	latency := float64(time.Since(start).Microseconds()) / 1000.0

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
		} else {
			exitCode = 1
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    exitCode == 0,
		"output":     string(out),
		"exit_code":  exitCode,
		"latency_ms": latency,
	})
}

// -------------------------------------------------------------
// Real SFTP Engine Endpoints
// -------------------------------------------------------------

func handleSftpList(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Path     string `json:"path"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal terhubung SSH ke %s:%d: %v", cfg.Host, cfg.Port, err)})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal inisialisasi SFTP: %v", err)})
		return
	}
	defer sftpClient.Close()

	targetPath := resolveRemotePath(sftpClient, req.Path)

	entries, err := sftpClient.ReadDir(targetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membaca folder '%s': %v", targetPath, err)})
		return
	}

	var files []map[string]interface{}
	for _, fi := range entries {
		fileType := "file"
		if fi.IsDir() {
			fileType = "directory"
		}
		cleanPath := filepath.ToSlash(filepath.Join(targetPath, fi.Name()))
		files = append(files, map[string]interface{}{
			"name":        fi.Name(),
			"path":        cleanPath,
			"type":        fileType,
			"sizeBytes":   fi.Size(),
			"permissions": fi.Mode().String(),
			"modified":    fi.ModTime().Format("2006-01-02 15:04:05"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"path":    targetPath,
		"files":   files,
	})
}

func handleSftpRead(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Path     string `json:"path"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	targetPath := resolveRemotePath(sftpClient, req.Path)
	f, err := sftpClient.Open(targetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membuka file '%s': %v", targetPath, err)})
		return
	}
	defer f.Close()

	stat, _ := f.Stat()
	if stat != nil && stat.Size() > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Ukuran file melebihi batas preview editor (maks 5MB)"})
		return
	}

	data, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membaca isi file: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"path":      targetPath,
		"content":   string(data),
		"sizeBytes": len(data),
	})
}

func handleSftpWrite(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Path     string `json:"path"`
		Content  string `json:"content"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	targetPath := resolveRemotePath(sftpClient, req.Path)
	f, err := sftpClient.Create(targetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menyimpan file '%s': %v", targetPath, err)})
		return
	}
	defer f.Close()

	if _, err := f.Write([]byte(req.Content)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menulis data file: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("File '%s' berhasil disimpan", filepath.Base(targetPath)),
		"path":    targetPath,
	})
}

func handleSftpMkdir(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Path     string `json:"path"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	targetPath := resolveRemotePath(sftpClient, req.Path)
	if err := sftpClient.MkdirAll(targetPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membuat folder '%s': %v", targetPath, err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Folder '%s' berhasil dibuat", filepath.Base(targetPath)),
	})
}

func handleSftpDelete(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		Path     string `json:"path"`
		Type     string `json:"type"` // "file" or "directory"
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	targetPath := resolveRemotePath(sftpClient, req.Path)
	var deleteErr error
	if req.Type == "directory" {
		// Try RemoveDirectory first; if not empty, use SSH session rm -rf
		deleteErr = sftpClient.RemoveDirectory(targetPath)
		if deleteErr != nil {
			session, sErr := client.NewSession()
			if sErr == nil {
				defer session.Close()
				_ = session.Run(fmt.Sprintf("rm -rf '%s'", targetPath))
				deleteErr = nil
			}
		}
	} else {
		deleteErr = sftpClient.Remove(targetPath)
	}

	if deleteErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menghapus '%s': %v", targetPath, deleteErr)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("'%s' berhasil dihapus", filepath.Base(targetPath)),
	})
}

func handleSftpRename(c *gin.Context) {
	var req struct {
		HostID   string `json:"host_id"`
		OldPath  string `json:"old_path"`
		NewPath  string `json:"new_path"`
		Host     string `json:"host,omitempty"`
		Port     int    `json:"port,omitempty"`
		User     string `json:"user,omitempty"`
		Password string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	oldPath := resolveRemotePath(sftpClient, req.OldPath)
	newPath := resolveRemotePath(sftpClient, req.NewPath)

	if err := sftpClient.Rename(oldPath, newPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal mengubah nama berkas: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Berhasil diubah ke '%s'", filepath.Base(newPath)),
	})
}

func handleSftpUpload(c *gin.Context) {
	hostID := c.PostForm("host_id")
	remoteDir := c.PostForm("remote_dir")
	if remoteDir == "" {
		remoteDir = "."
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Berkas upload tidak ditemukan"})
		return
	}
	defer file.Close()

	cfg, err := resolveSshConfig(hostID, c.PostForm("host"), 0, c.PostForm("user"), c.PostForm("password"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	targetDir := resolveRemotePath(sftpClient, remoteDir)
	_ = sftpClient.MkdirAll(targetDir)
	destPath := filepath.ToSlash(filepath.Join(targetDir, header.Filename))
	destFile, err := sftpClient.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membuat berkas tujuan '%s': %v", destPath, err)})
		return
	}
	defer destFile.Close()

	written, err := io.Copy(destFile, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal mengunggah berkas: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   fmt.Sprintf("Berkas '%s' (%d bytes) berhasil diunggah", header.Filename, written),
		"path":      destPath,
		"sizeBytes": written,
	})
}

func handleSftpDownload(c *gin.Context) {
	hostID := c.Query("host_id")
	targetPath := c.Query("path")
	if targetPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Parameter path wajib diisi"})
		return
	}

	cfg, err := resolveSshConfig(hostID, c.Query("host"), 0, c.Query("user"), c.Query("password"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	resolvedPath := resolveRemotePath(sftpClient, targetPath)
	remoteFile, err := sftpClient.Open(resolvedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membuka file '%s': %v", resolvedPath, err)})
		return
	}
	defer remoteFile.Close()

	stat, _ := remoteFile.Stat()
	fileName := filepath.Base(resolvedPath)

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	c.Header("Content-Type", "application/octet-stream")
	if stat != nil {
		c.Header("Content-Length", strconv.FormatInt(stat.Size(), 10))
	}

	_, _ = io.Copy(c.Writer, remoteFile)
}

// -------------------------------------------------------------
// Direct Server-Side Streaming Transfer: Local <-> Remote
// -------------------------------------------------------------

func copyFileToRemote(sftpClient *sftp.Client, localSrc, remoteDst string) error {
	srcF, err := os.Open(localSrc)
	if err != nil {
		return err
	}
	defer srcF.Close()

	dstF, err := sftpClient.Create(remoteDst)
	if err != nil {
		return err
	}
	defer dstF.Close()

	_, err = io.Copy(dstF, srcF)
	return err
}

func copyDirToRemote(sftpClient *sftp.Client, localSrcDir, remoteDstDir string) error {
	if err := sftpClient.MkdirAll(remoteDstDir); err != nil {
		return err
	}
	entries, err := os.ReadDir(localSrcDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		subLocal := filepath.Join(localSrcDir, e.Name())
		subRemote := filepath.ToSlash(filepath.Join(remoteDstDir, e.Name()))
		if e.IsDir() {
			if err := copyDirToRemote(sftpClient, subLocal, subRemote); err != nil {
				return err
			}
		} else {
			if err := copyFileToRemote(sftpClient, subLocal, subRemote); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFileToLocal(sftpClient *sftp.Client, remoteSrc, localDst string) error {
	srcF, err := sftpClient.Open(remoteSrc)
	if err != nil {
		return err
	}
	defer srcF.Close()

	dstF, err := os.Create(localDst)
	if err != nil {
		return err
	}
	defer dstF.Close()

	_, err = io.Copy(dstF, srcF)
	return err
}

func copyDirToLocal(sftpClient *sftp.Client, remoteSrcDir, localDstDir string) error {
	if err := os.MkdirAll(localDstDir, 0755); err != nil {
		return err
	}
	entries, err := sftpClient.ReadDir(remoteSrcDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		subRemote := filepath.ToSlash(filepath.Join(remoteSrcDir, e.Name()))
		subLocal := filepath.Join(localDstDir, e.Name())
		if e.IsDir() {
			if err := copyDirToLocal(sftpClient, subRemote, subLocal); err != nil {
				return err
			}
		} else {
			if err := copyFileToLocal(sftpClient, subRemote, subLocal); err != nil {
				return err
			}
		}
	}
	return nil
}

func handleSftpCopyToRemote(c *gin.Context) {
	var req struct {
		HostID        string `json:"host_id"`
		LocalPath     string `json:"local_path"`
		RemoteDestDir string `json:"remote_dest_dir"`
		Host          string `json:"host,omitempty"`
		Port          int    `json:"port,omitempty"`
		User          string `json:"user,omitempty"`
		Password      string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	localPath := strings.TrimSpace(req.LocalPath)
	if localPath == "" || localPath == "~" {
		localPath = getDefaultLocalDir()
	} else if strings.HasPrefix(localPath, "~") {
		sub := strings.TrimLeft(strings.TrimPrefix(localPath, "~"), "/\\")
		localPath = filepath.Join(getDefaultLocalDir(), sub)
	}

	localStat, err := os.Stat(localPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": fmt.Sprintf("File/folder lokal tidak ditemukan: %v", err)})
		return
	}

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	destDir := resolveRemotePath(sftpClient, req.RemoteDestDir)
	_ = sftpClient.MkdirAll(destDir)

	var copyErr error
	if localStat.IsDir() {
		targetSub := filepath.ToSlash(filepath.Join(destDir, localStat.Name()))
		copyErr = copyDirToRemote(sftpClient, localPath, targetSub)
	} else {
		targetFile := filepath.ToSlash(filepath.Join(destDir, localStat.Name()))
		copyErr = copyFileToRemote(sftpClient, localPath, targetFile)
	}

	if copyErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menyalin ke remote: %v", copyErr)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Berhasil menyalin '%s' ke remote '%s'", localStat.Name(), destDir),
	})
}

func handleSftpCopyToLocal(c *gin.Context) {
	var req struct {
		HostID       string `json:"host_id"`
		RemotePath   string `json:"remote_path"`
		LocalDestDir string `json:"local_dest_dir"`
		Host         string `json:"host,omitempty"`
		Port         int    `json:"port,omitempty"`
		User         string `json:"user,omitempty"`
		Password     string `json:"password,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	localDestDir := strings.TrimSpace(req.LocalDestDir)
	if localDestDir == "" || localDestDir == "~" {
		localDestDir = getDefaultLocalDir()
	} else if strings.HasPrefix(localDestDir, "~") {
		sub := strings.TrimLeft(strings.TrimPrefix(localDestDir, "~"), "/\\")
		localDestDir = filepath.Join(getDefaultLocalDir(), sub)
	}
	_ = os.MkdirAll(localDestDir, 0755)

	cfg, err := resolveSshConfig(req.HostID, req.Host, req.Port, req.User, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	client, err := dialSshHost(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	defer sftpClient.Close()

	remoteSrc := resolveRemotePath(sftpClient, req.RemotePath)
	rStat, err := sftpClient.Stat(remoteSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": fmt.Sprintf("File/folder remote tidak ditemukan: %v", err)})
		return
	}

	var copyErr error
	if rStat.IsDir() {
		destSubDir := filepath.Join(localDestDir, filepath.Base(remoteSrc))
		copyErr = copyDirToLocal(sftpClient, remoteSrc, destSubDir)
	} else {
		destFile := filepath.Join(localDestDir, filepath.Base(remoteSrc))
		copyErr = copyFileToLocal(sftpClient, remoteSrc, destFile)
	}

	if copyErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menyalin ke folder komputer: %v", copyErr)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Berhasil menyalin '%s' ke folder komputer '%s'", filepath.Base(remoteSrc), localDestDir),
	})
}

// -------------------------------------------------------------
// Local Machine Filesystem for Dual-Pane Explorer
// -------------------------------------------------------------

func getDefaultLocalDir() string {
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		return h
	}
	if u, err := user.Current(); err == nil && u.HomeDir != "" {
		return u.HomeDir
	}
	if dir, err := os.Getwd(); err == nil && dir != "" {
		return dir
	}
	if runtime.GOOS == "windows" {
		return "C:\\"
	}
	return "/"
}

func handleLocalFsList(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Path = ""
	}

	targetPath := strings.TrimSpace(req.Path)
	if targetPath == "" || targetPath == "~" {
		targetPath = getDefaultLocalDir()
	} else if strings.HasPrefix(targetPath, "~") {
		sub := strings.TrimPrefix(targetPath, "~")
		sub = strings.TrimPrefix(sub, "/")
		sub = strings.TrimPrefix(sub, "\\")
		targetPath = filepath.Join(getDefaultLocalDir(), sub)
	}

	// Normalisasi Windows drive root (contoh "C:" menjadi "C:\")
	if runtime.GOOS == "windows" && len(targetPath) == 2 && targetPath[1] == ':' {
		targetPath = targetPath + "\\"
	}

	entries, err := os.ReadDir(targetPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membaca direktori lokal: %v", err)})
		return
	}

	var files []map[string]interface{}
	for _, fi := range entries {
		info, err := fi.Info()
		fileType := "file"
		var sizeBytes int64 = 0
		var perm = "-rw-r--r--"
		var modTime = time.Now().Format("2006-01-02 15:04:05")

		if fi.IsDir() {
			fileType = "directory"
			perm = "drwxr-xr-x"
		}
		if err == nil && info != nil {
			sizeBytes = info.Size()
			perm = info.Mode().String()
			modTime = info.ModTime().Format("2006-01-02 15:04:05")
		}

		cleanPath := filepath.ToSlash(filepath.Join(targetPath, fi.Name()))
		files = append(files, map[string]interface{}{
			"name":        fi.Name(),
			"path":        cleanPath,
			"type":        fileType,
			"sizeBytes":   sizeBytes,
			"permissions": perm,
			"modified":    modTime,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"path":    filepath.ToSlash(targetPath),
		"files":   files,
	})
}

func handleLocalFsRead(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	p := strings.TrimSpace(req.Path)
	if strings.HasPrefix(p, "~") {
		sub := strings.TrimLeft(strings.TrimPrefix(p, "~"), "/\\")
		p = filepath.Join(getDefaultLocalDir(), sub)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal membaca file lokal: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"path":      filepath.ToSlash(p),
		"content":   string(data),
		"sizeBytes": len(data),
	})
}

func handleLocalFsWrite(c *gin.Context) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	p := strings.TrimSpace(req.Path)
	if strings.HasPrefix(p, "~") {
		sub := strings.TrimLeft(strings.TrimPrefix(p, "~"), "/\\")
		p = filepath.Join(getDefaultLocalDir(), sub)
	}

	if err := os.WriteFile(p, []byte(req.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Gagal menyimpan file lokal: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("File lokal '%s' berhasil disimpan", filepath.Base(p)),
		"path":    filepath.ToSlash(p),
	})
}

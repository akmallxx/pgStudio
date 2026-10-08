#!/bin/bash
set -e

TARGET="${1:-linux}"
GO_BIN=$(which go 2>/dev/null || echo "/home/azahwa/.local/go/bin/go")

echo "========================================================"
echo "  pgStudio Multi-Platform Build Script (Target: $TARGET)"
echo "========================================================"

echo "[1/3] Building pgStudio React Frontend (Vite + PWA)..."
npm run build

echo "[2/3] Syncing frontend assets to backend-go/dist for single-binary embedding..."
mkdir -p backend-go/dist
cp -r dist/* backend-go/dist/

echo "[3/3] Compiling Go server binary..."

case "$TARGET" in
  windows|win)
    echo " -> Compiling for Windows x86_64 (pgstudio.exe)..."
    (
      cd backend-go
      CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $GO_BIN build -ldflags="-s -w" -o ../pgstudio.exe .
    )
    echo ""
    echo "[SUCCESS] Windows binary created at ./pgstudio.exe"
    ;;
  all)
    echo " -> Compiling for Linux x86_64 (pgstudio-server)..."
    (
      cd backend-go
      CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $GO_BIN build -ldflags="-s -w" -o ../pgstudio-server .
    )
    echo " -> Compiling for Windows x86_64 (pgstudio.exe)..."
    (
      cd backend-go
      CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $GO_BIN build -ldflags="-s -w" -o ../pgstudio.exe .
    )
    echo ""
    echo "[SUCCESS] Linux (./pgstudio-server) and Windows (./pgstudio.exe) binaries created!"
    ;;
  *)
    echo " -> Compiling for Linux x86_64 (pgstudio-server)..."
    (
      cd backend-go
      CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $GO_BIN build -ldflags="-s -w" -o ../pgstudio-server .
    )
    echo ""
    echo "[SUCCESS] Linux binary created at ./pgstudio-server"
    ;;
esac

echo ""
echo "Deployment info:"
echo " - Linux standalone: ./pgstudio-server"
echo " - Windows standalone: ./pgstudio.exe (or double-click start.bat)"
echo " - Systemd service: systemctl --user restart pgstudio"

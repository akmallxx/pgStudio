#!/bin/bash
set -e

echo "[1/3] Building pgStudio React Frontend..."
npm run build

echo "[2/3] Compiling pgStudio High-Performance Golang Server..."
GO_BIN=$(which go 2>/dev/null || echo "/home/azahwa/.local/go/bin/go")
(
  cd backend-go
  $GO_BIN build -ldflags="-s -w" -o ../pgstudio-server .
)

echo "[3/3] Build complete! Binary ready at ./pgstudio-server"
echo ""
echo "To run manually: ./pgstudio-server (PORT automatically loaded from .env)"
echo "To run as service: sudo systemctl start pgstudio"

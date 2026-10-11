#!/usr/bin/env bash
# Hosts the game from this computer for free: starts the server and opens a public https link through a Cloudflare
# quick tunnel. Node is downloaded into host/tools if it is not installed; so is cloudflared. Ctrl-C stops hosting.
set -e
cd "$(dirname "$0")/.."
TOOLS="$PWD/host/tools"; mkdir -p "$TOOLS"
OS=$(uname -s | tr 'A-Z' 'a-z'); ARCH=$(uname -m); [ "$ARCH" = x86_64 ] && ARCH=x64; [ "$ARCH" = aarch64 ] && ARCH=arm64
if ! command -v node >/dev/null 2>&1 || [ "$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0] >= 18))')" != true ]; then
  if [ ! -x "$TOOLS/node/bin/node" ]; then
    echo "Downloading Node (one time)..."
    curl -L -# -o "$TOOLS/node.tar.gz" "https://nodejs.org/dist/v22.12.0/node-v22.12.0-$OS-$ARCH.tar.gz"
    tar -xzf "$TOOLS/node.tar.gz" -C "$TOOLS" && mv "$TOOLS/node-v22.12.0-$OS-$ARCH" "$TOOLS/node" && rm "$TOOLS/node.tar.gz"
  fi
  export PATH="$TOOLS/node/bin:$PATH"
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  if [ ! -x "$TOOLS/cloudflared" ]; then
    echo "Downloading cloudflared (one time)..."
    if [ "$OS" = darwin ]; then
      curl -L -# -o "$TOOLS/cf.tgz" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$([ "$ARCH" = x64 ] && echo amd64 || echo arm64).tgz"
      tar -xzf "$TOOLS/cf.tgz" -C "$TOOLS" && rm "$TOOLS/cf.tgz"
    else
      curl -L -# -o "$TOOLS/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$([ "$ARCH" = x64 ] && echo amd64 || echo arm64)"
    fi
    chmod +x "$TOOLS/cloudflared"
  fi
  export PATH="$TOOLS:$PATH"
fi
[ -d node_modules ] || { echo "Installing the server's one dependency (one time)..."; npm install --omit=dev --no-audit --no-fund; }
PORT=8080 node server/server.js & SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
echo; echo "Your game link is the https://....trycloudflare.com line printed below. Send it to your friends. Ctrl-C stops hosting."; echo
cloudflared tunnel --url http://localhost:8080

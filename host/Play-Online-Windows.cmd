@echo off
rem Hosts the game from this PC for free: starts the server and opens a public https link through a Cloudflare
rem quick tunnel. Needs nothing installed: a portable Node and cloudflared are downloaded into host\tools the
rem first time (about 60 MB). Close this window to stop hosting.
setlocal
cd /d "%~dp0.."
set TOOLS=%~dp0tools
set NODEDIR=%TOOLS%\node
if not exist "%TOOLS%" mkdir "%TOOLS%"
if not exist "%NODEDIR%\node.exe" (
  echo Downloading Node (one time)...
  curl -L -# -o "%TOOLS%\node.zip" https://nodejs.org/dist/v22.12.0/node-v22.12.0-win-x64.zip || goto fail
  tar -xf "%TOOLS%\node.zip" -C "%TOOLS%" || goto fail
  move "%TOOLS%\node-v22.12.0-win-x64" "%NODEDIR%" >nul
  del "%TOOLS%\node.zip"
)
if not exist "%TOOLS%\cloudflared.exe" (
  echo Downloading cloudflared (one time)...
  curl -L -# -o "%TOOLS%\cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe || goto fail
)
set PATH=%NODEDIR%;%PATH%
if not exist node_modules (
  echo Installing the server's one dependency (one time)...
  call npm install --omit=dev --no-audit --no-fund || goto fail
)
start "Pac-Man Vs. server (close to stop)" cmd /k "set PORT=8080&& node server\server.js"
echo.
echo ============================================================
echo  Your game link is the https://....trycloudflare.com line
echo  printed below. Send it to your friends. Close this window
echo  to stop hosting. (The link changes each time you start.)
echo ============================================================
echo.
"%TOOLS%\cloudflared.exe" tunnel --url http://localhost:8080
goto end
:fail
echo Something went wrong (see above). Check your internet connection and try again.
pause
:end

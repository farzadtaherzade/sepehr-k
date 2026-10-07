#!/usr/bin/env bash
# =============================================================================
# Expose the NocoDB UI at a public HTTPS URL via localhost.run (no account needed).
#
#   ./expose-public-url.sh            # tunnel, print URL, stay in foreground
#   ./expose-public-url.sh --url-only # print URL and exit (leaves tunnel running)
#
# The tunnel forwards https://<random>.lhr.life -> http://localhost:8080.
#
# IMPORTANT - this is a PUBLIC URL:
#   Anyone with the link reaches your NocoDB login page. Keep the NocoDB admin
#   password strong, and stop the tunnel when you are done:
#       pkill -f "localhost.run"
#   The free tier URL is random and rotates every time you restart the tunnel.
# =============================================================================
set -euo pipefail

PORT="${NOCODB_HOST_PORT:-8080}"
LOG=/tmp/nocodb-tunnel.log
URL_RE='https://[a-zA-Z0-9._-]+\.(lhr\.life|localhost\.run)'

# Already running? Just report the existing URL.
# Note: on Windows/Git Bash `pgrep -f` cannot read ssh.exe command lines, so we
# detect an existing tunnel by testing whether the recorded URL still answers.
existing=$(grep -oE "$URL_RE" "$LOG" 2>/dev/null | grep -v admin | sort -u | head -1 || true)
if [ -n "$existing" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$existing" 2>/dev/null || echo 000)
    if [ "$code" = "200" ]; then
        echo "Tunnel already running."
        echo
        echo "  Public HTTPS URL:  $existing"
        echo "  Local URL:         http://localhost:$PORT"
        echo
        echo "  Stop the tunnel:   ./expose-public-url.sh --stop"
        exit 0
    fi
fi

# --stop: tear the tunnel down.
if [ "${1:-}" = "--stop" ]; then
    taskkill //IM ssh.exe //F >/dev/null 2>&1 || pkill -f localhost.run 2>/dev/null || true
    echo "Tunnel stopped."
    exit 0
fi

echo "Starting tunnel: localhost:$PORT -> localhost.run"
: > "$LOG"
nohup ssh \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=5 \
    -o ExitOnForwardFailure=yes \
    -T -N -R "80:localhost:$PORT" \
    nokey@localhost.run >> "$LOG" 2>&1 &

# localhost.run takes a few seconds to allocate the subdomain.
for _ in $(seq 1 30); do
    URL=$(grep -oE "$URL_RE" "$LOG" 2>/dev/null | grep -v admin | sort -u | head -1 || true)
    [ -n "$URL" ] && break
    sleep 1
done

if [ -z "${URL:-}" ]; then
    echo "Could not obtain a URL after 30s. Last log lines:"
    tail -20 "$LOG"
    exit 1
fi

echo
echo "  Public HTTPS URL:  $URL"
echo "  Local URL:         http://localhost:$PORT"
echo
echo "  Stop the tunnel:   pkill -f \"localhost.run\""
echo

[ "${1:-}" = "--url-only" ] || { echo "Tunnel running in background. Ctrl-C does not stop it."; }

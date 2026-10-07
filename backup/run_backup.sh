#!/bin/sh
# =============================================================================
# Nightly pg_dump loop - runs inside the `postgres-backup` container, which
# reuses the postgres:16-alpine image (so no third-party image is required).
#
# Layout written to /backups (bind-mounted to ./backups on the host):
#   last/     most recent dump per period, kept for quick restore
#   daily/    one dump per day   - pruned to BACKUP_KEEP_DAYS
#   weekly/   copy taken Sunday  - pruned to BACKUP_KEEP_WEEKS
#   monthly/  copy taken on the 1st - pruned to BACKUP_KEEP_MONTHS
#
# A .log file records every run so failures are visible without exec'ing in.
# =============================================================================
set -eu

BACKUP_HOUR="${BACKUP_HOUR:-2}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-8}"
KEEP_MONTHS="${BACKUP_KEEP_MONTHS:-6}"
ROOT=/backups

mkdir -p "$ROOT/daily" "$ROOT/weekly" "$ROOT/monthly" "$ROOT/last"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

take_backup() {
    stamp=$(date '+%Y-%m-%d_%H%M%S')
    dow=$(date '+%u')      # 1=Mon .. 7=Sun
    dom=$(date '+%d')      # day of month
    file="daily/${PGDATABASE}_${stamp}.sql.gz"

    log "starting dump -> $file"
    if ! pg_dump --clean --if-exists | gzip -9 > "$ROOT/$file"; then
        log "ERROR: pg_dump failed; no backup written"
        rm -f "$ROOT/$file"
        return 1
    fi

    if [ ! -s "$ROOT/$file" ]; then
        log "ERROR: dump file is empty; discarding"
        rm -f "$ROOT/$file"
        return 1
    fi
    log "dump complete ($(du -h "$ROOT/$file" | cut -f1))"

    # Promote to weekly / monthly, and refresh last/
    [ "$dow" = "7" ] && cp "$ROOT/$file" "$ROOT/weekly/"
    [ "$dom" = "01" ] && cp "$ROOT/$file" "$ROOT/monthly/"
    cp "$ROOT/$file" "$ROOT/last/${PGDATABASE}_latest.sql.gz"

    prune
}

prune() {
    log "pruning (daily>${KEEP_DAYS}d weekly>${KEEP_WEEKS}w monthly>${KEEP_MONTHS}m)"
    find "$ROOT/daily"   -name '*.sql.gz' -type f -mtime "+${KEEP_DAYS}"   -delete 2>/dev/null || true
    find "$ROOT/weekly"  -name '*.sql.gz' -type f -mtime "+$((KEEP_WEEKS * 7))" -delete 2>/dev/null || true
    find "$ROOT/monthly" -name '*.sql.gz' -type f -mtime "+$((KEEP_MONTHS * 31))" -delete 2>/dev/null || true
}

# Normalize to a zero-padded 2-digit hour: BusyBox date lacks %-H, so we
# compare `date +%H` (always 2-digit) against this.
HOUR_PAD=$(printf '%02d' "$BACKUP_HOUR" 2>/dev/null || echo "$BACKUP_HOUR")

log "backup service started (daily at ${HOUR_PAD}:00, TZ=${TZ:-UTC})"

while true; do
    now_h=$(date '+%H')
    now_m=$(date '+%M')
    # Strip a leading zero so the numeric comparison works in POSIX sh.
    min_now=$(echo "$now_m" | sed 's/^0*//')
    [ -z "$min_now" ] && min_now=0

    if [ "$now_h" = "$HOUR_PAD" ] && [ "$min_now" -lt 5 ]; then
        take_backup || log "backup run failed; will retry tomorrow"
        sleep 600   # avoid re-running within the same 5-minute window
    else
        sleep 60
    fi
done

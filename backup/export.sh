#!/usr/bin/env bash
# =============================================================================
# Export the platform tables in formats you can import elsewhere.
#
#   ./backup/export.sh              # both formats (recommended)
#   ./backup/export.sh --custom     # pgAdmin Restore-compatible (.dump)
#   ./backup/export.sh --sql        # plain SQL, portable (.sql.gz)
#   ./backup/export.sh --csv        # one CSV per table
#
# Only the seven platform tables are included - NocoDB's internal nc_* tables
# are excluded, so the export imports cleanly into a fresh database and does not
# carry NocoDB's stored data-source credentials.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || { echo "Missing .env (copy .env.example to .env first)"; exit 1; }

CONTAINER=evm-postgres
STAMP=$(date +%F_%H%M%S)
OUT=backups/exports
mkdir -p "$OUT"

TABLES=(
  dim_project
  dim_contractor_category
  contract_revision
  contract_extension
  project_snapshot
  snapshot_revision_progress
  snapshot_contractor_headcount
)
TABLE_ARGS=()
for t in "${TABLES[@]}"; do TABLE_ARGS+=(-t "$t"); done

MODE="${1:-}"

do_custom() {
  local f="$OUT/evm_platform_${STAMP}.dump"
  echo "Custom format (pgAdmin Restore) -> $f"
  docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      "${TABLE_ARGS[@]}" -Fc > "$f"
  echo "  $(du -h "$f" | cut -f1)"
}

do_sql() {
  local f="$OUT/evm_platform_${STAMP}.sql.gz"
  echo "Plain SQL -> $f"
  # --no-owner / --no-privileges so it imports under any username.
  docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      "${TABLE_ARGS[@]}" --no-owner --no-privileges | gzip > "$f"
  echo "  $(du -h "$f" | cut -f1)"
  echo "  Import: gunzip -c $f | psql -U <user> -d <db>"
}

do_csv() {
  local dir="$OUT/csv_${STAMP}"
  mkdir -p "$dir"
  echo "CSV per table -> $dir/"
  for t in "${TABLES[@]}"; do
    docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -c "\copy (SELECT * FROM $t) TO STDOUT WITH CSV HEADER" > "$dir/$t.csv"
    echo "  $t.csv  ($(wc -l < "$dir/$t.csv") lines)"
  done
}

case "$MODE" in
  --custom) do_custom ;;
  --sql)    do_sql ;;
  --csv)    do_csv ;;
  *)        do_custom; do_sql ;;
esac

echo
echo "Done. Files in $OUT/"

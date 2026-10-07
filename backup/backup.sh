#!/usr/bin/env bash
# =============================================================================
# Manual backup / restore helper for the EVM Postgres database.
# The nightly automated backups run via the `postgres-backup` service in
# docker-compose.yml (prodrigestivill/postgres-backup-local). This script is
# for on-demand backups and restores.
#
# Usage:
#   ./backup/backup.sh            -> one-off gzipped dump into ./backups/manual/
#   ./backup/restore.sh <file>    -> restore a dump (use backup/restore.sh)
#
# Restore example:
#   gunzip < backups/manual/evm_db_2026-01-01.sql.gz | \
#     docker exec -i evm-postgres psql -U evm_admin -d evm_db
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

source .env 2>/dev/null || { echo "Missing .env (copy .env.example to .env first)"; exit 1; }

mkdir -p backups/manual
STAMP=$(date +%F_%H%M%S)
OUT="backups/manual/${POSTGRES_DB}_${STAMP}.sql.gz"

echo "Dumping ${POSTGRES_DB} -> ${OUT}"
docker exec evm-postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${OUT}"
echo "Done: ${OUT} ($(du -h "${OUT}" | cut -f1))"

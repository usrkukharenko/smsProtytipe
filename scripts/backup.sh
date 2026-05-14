#!/bin/sh
# Backup script for the smsvxod Postgres database.
# Intended to be invoked from the db-backup container (postgres:15-alpine),
# which already has pg_dump and gzip in PATH.
#
# Env vars expected (set by docker-compose):
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD
#
# Output: /backups/smsvxod-YYYYMMDD-HHMMSS.sql.gz
# Retention: deletes backup files older than 7 days.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/smsvxod-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] $(date -u +%FT%TZ) dumping ${PGDATABASE:-smsvxod}@${PGHOST:-postgres} -> ${OUT_FILE}"

pg_dump \
  --host="${PGHOST:-postgres}" \
  --username="${PGUSER:-smsvxod}" \
  --dbname="${PGDATABASE:-smsvxod}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip -9 > "${OUT_FILE}"

echo "[backup] wrote $(du -h "${OUT_FILE}" | cut -f1) to ${OUT_FILE}"

# Prune anything older than 7 days
echo "[backup] pruning files older than 7 days in ${BACKUP_DIR}"
find "${BACKUP_DIR}" -type f -name 'smsvxod-*.sql.gz' -mtime +7 -print -delete || true

echo "[backup] done"

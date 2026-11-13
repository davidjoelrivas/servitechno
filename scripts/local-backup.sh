#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
mkdir -p backups
backup_file="backups/${LOCAL_DATABASE_NAME}-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T postgres pg_dump -U servitechno -d "$LOCAL_DATABASE_NAME" -Fc > "$backup_file"
chmod 600 "$backup_file"
echo "Respaldo creado: $project_dir/$backup_file"


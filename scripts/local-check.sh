#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
compose=(docker compose -f docker-compose.yml -f docker-compose.local.yml)
api_port="$(sed -n 's/^LOCAL_API_PORT=\([0-9][0-9]*\)$/\1/p' .env)"
api_port="${api_port:-3010}"
"${compose[@]}" ps
curl --silent --fail "http://127.0.0.1:$api_port/api/health"
echo
curl --silent --fail --output /dev/null "http://127.0.0.1:$api_port/api/docs"
curl --silent --fail --output /dev/null http://127.0.0.1:5173/
"${compose[@]}" exec -T api pnpm --filter @servitechno/api exec prisma migrate status
active_database="$("${compose[@]}" exec -T api node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.pathname.slice(1))')"
if [[ "$active_database" != "$LOCAL_DATABASE_NAME" ]]; then
  echo "ERROR: el API usa '$active_database' pero el modo '$LOCAL_MODE' exige '$LOCAL_DATABASE_NAME'." >&2
  exit 1
fi
echo "Frontend, API, Swagger, PostgreSQL y migraciones: OK"
echo "Modo activo: $LOCAL_MODE | Base del API verificada: $active_database"


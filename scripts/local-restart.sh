#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
api_port="$(sed -n 's/^LOCAL_API_PORT=\([0-9][0-9]*\)$/\1/p' .env)"
api_port="${api_port:-3010}"
docker compose -f docker-compose.yml -f docker-compose.local.yml restart
for _ in $(seq 1 30); do
  if curl --silent --fail "http://127.0.0.1:$api_port/api/health" >/dev/null 2>&1 && curl --silent --fail http://127.0.0.1:5173/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
bash scripts/local-check.sh


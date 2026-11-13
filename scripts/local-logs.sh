#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f --tail=200 postgres api web


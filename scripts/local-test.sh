#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
if [[ ! -f .env || ! -f .local-admin-password ]]; then
  echo "Ejecute primero: pnpm local:up" >&2
  exit 1
fi
admin_password="$(<.local-admin-password)"
jwt_secret="$(sed -n 's/^JWT_SECRET="\(.*\)"/\1/p' .env)"
bash scripts/local-test-prepare.sh
DATABASE_URL='postgresql://servitechno:servitechno@localhost:55432/servitechno_test?schema=public' \
JWT_SECRET="$jwt_secret" ADMIN_EMAIL='admin@servitechno.local' ADMIN_PASSWORD="$admin_password" \
pnpm --filter @servitechno/api test:e2e

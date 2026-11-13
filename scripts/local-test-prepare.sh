#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
if [[ ! -f .env ]]; then
  echo "Ejecute primero: pnpm local:up" >&2
  exit 1
fi
umask 077
test_password="$(openssl rand -hex 12)"
printf '%s\n' "$test_password" > .local-test-password
admin_password="$(sed -n 's/^ADMIN_PASSWORD="\(.*\)"/\1/p' .env)"
admin_email="$(sed -n 's/^ADMIN_EMAIL="\(.*\)"/\1/p' .env)"
compose=(docker compose -f docker-compose.yml -f docker-compose.local.yml)
if ! "${compose[@]}" exec -T postgres psql -U servitechno -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='servitechno_test'" | grep -q 1; then
  "${compose[@]}" exec -T postgres createdb -U servitechno servitechno_test
fi
test_url="postgresql://servitechno:servitechno@postgres:5432/servitechno_test?schema=public"
"${compose[@]}" exec -T -e DATABASE_URL="$test_url" api pnpm --filter @servitechno/api prisma:deploy
"${compose[@]}" exec -T -e DATABASE_URL="$test_url" -e ADMIN_EMAIL="$admin_email" -e ADMIN_PASSWORD="$admin_password" -e RESET_ADMIN_PASSWORD=true -e SEED_TEST_USERS=true -e SEED_DEMO=true -e TEST_USER_PASSWORD="$test_password" api pnpm --filter @servitechno/api prisma:seed
echo "Base servitechno_test preparada con datos [DEMO]."
echo "Usuarios: demo.tech1@servitechno.local, demo.tech2@servitechno.local, demo.seller@servitechno.local"
echo "Contraseña guardada en: $project_dir/.local-test-password"

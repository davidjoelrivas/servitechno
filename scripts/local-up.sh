#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
source scripts/local-env.sh
umask 077

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if grep -q 'replace-with-at-least-32-random-characters' .env; then
  jwt_secret="$(openssl rand -hex 32)"
  sed -i "s/replace-with-at-least-32-random-characters/$jwt_secret/" .env
fi

admin_password="${ADMIN_PASSWORD:-}"
if [[ -z "$admin_password" ]]; then
  admin_password="$(sed -n 's/^ADMIN_PASSWORD="\(.*\)"/\1/p' .env)"
fi
if [[ ${#admin_password} -lt 12 ]]; then
  admin_password="$(openssl rand -hex 12)"
  sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=\"$admin_password\"/" .env
fi
printf '%s\n' "$admin_password" > .local-admin-password
chmod 600 .env .local-admin-password

compose=(docker compose -f docker-compose.yml -f docker-compose.local.yml)
api_port="$(sed -n 's/^LOCAL_API_PORT=\([0-9][0-9]*\)$/\1/p' .env)"
api_port="${api_port:-3010}"
"${compose[@]}" up -d postgres
for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T postgres pg_isready -U servitechno -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
if [[ "$LOCAL_MODE" == "demo" ]]; then
  if ! "${compose[@]}" exec -T postgres psql -U servitechno -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='servitechno_demo'" | grep -q 1; then
    "${compose[@]}" exec -T postgres createdb -U servitechno servitechno_demo
  fi
fi
"${compose[@]}" up -d --build

for _ in $(seq 1 60); do
  if curl --silent --fail "http://127.0.0.1:$api_port/api/health" >/dev/null 2>&1 && curl --silent --fail http://127.0.0.1:5173/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl --silent --fail "http://127.0.0.1:$api_port/api/health" >/dev/null
curl --silent --fail http://127.0.0.1:5173/health >/dev/null
seed_args=(-e RESET_ADMIN_PASSWORD=true)
if [[ "$LOCAL_MODE" == "demo" ]]; then
  if [[ ! -f .local-test-password ]]; then
    openssl rand -hex 12 > .local-test-password
    chmod 600 .local-test-password
  fi
  seed_args+=(-e SEED_TEST_USERS=true -e TEST_USER_PASSWORD="$(<.local-test-password)")
fi
"${compose[@]}" exec -T "${seed_args[@]}" api pnpm --filter @servitechno/api prisma:seed

admin_email="$(sed -n 's/^ADMIN_EMAIL="\(.*\)"/\1/p' .env)"
login_status="$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'Content-Type: application/json' -d "{\"email\":\"$admin_email\",\"password\":\"$admin_password\"}" "http://127.0.0.1:$api_port/api/auth/login")"
if [[ "$login_status" != "201" ]]; then
  echo "El entorno inició, pero la verificación de login devolvió HTTP $login_status" >&2
  exit 1
fi

echo "Servi Techno ERP está disponible:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:$api_port/api"
echo "  Swagger:  http://localhost:$api_port/api/docs"
echo "  Usuario:  $admin_email"
echo "  Contraseña local guardada en: $project_dir/.local-admin-password"
echo "  Modo:     $LOCAL_MODE"
echo "  Base:     $LOCAL_DATABASE_NAME"
if [[ "$LOCAL_MODE" == "demo" ]]; then
  echo "  Usuarios demo configurados; contraseña guardada en: $project_dir/.local-test-password"
fi


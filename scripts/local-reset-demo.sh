#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
umask 077

target_database="servitechno_demo"
principal_database="servitechno"
expected_confirmation="RESTABLECER servitechno_demo"

printf '%s\n' demo > .local-mode
chmod 600 .local-mode
source scripts/local-env.sh

if [[ "$LOCAL_MODE" != "demo" || "$LOCAL_DATABASE_NAME" != "$target_database" ]]; then
  echo "SEGURIDAD: el modo resuelto no corresponde a la base de demostración." >&2
  exit 1
fi
if [[ "$target_database" == "$principal_database" || "$LOCAL_DATABASE_URL" == *"/servitechno?"* ]]; then
  echo "SEGURIDAD: se rechazó una conexión que podría apuntar a la base principal." >&2
  exit 1
fi

if [[ ! -f .env || ! -f .local-admin-password ]]; then
  echo "Falta la configuración local. Ejecute primero pnpm local:up." >&2
  exit 1
fi

echo "Preparando de forma segura el modo demo (esto no elimina operaciones todavía)..."
bash scripts/local-up.sh

compose=(docker compose -f docker-compose.yml -f docker-compose.local.yml)
active_database="$("${compose[@]}" exec -T api node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.pathname.slice(1))')"
if [[ "$active_database" != "$target_database" ]]; then
  echo "SEGURIDAD: el API está conectado a '$active_database', no a '$target_database'." >&2
  exit 1
fi

database_identity="$("${compose[@]}" exec -T postgres psql -U servitechno -d "$target_database" -Atc "SELECT current_database()")"
api_database_host="$("${compose[@]}" exec -T api node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname)')"
if [[ "$database_identity" != "$target_database" || "$api_database_host" != "postgres" ]]; then
  echo "SEGURIDAD: PostgreSQL no confirmó la base de demostración esperada." >&2
  exit 1
fi

main_fingerprint_query='SELECT concat_ws('"'"'|'"'"', (SELECT count(*) FROM "Sale"), (SELECT count(*) FROM "RepairOrder"), (SELECT count(*) FROM "Purchase"), (SELECT count(*) FROM "Expense"), (SELECT count(*) FROM "BusinessDocument"), (SELECT count(*) FROM "Customer"), (SELECT count(*) FROM "Product"), (SELECT count(*) FROM "JournalEntry"));'
main_fingerprint_before="$("${compose[@]}" exec -T postgres psql -U servitechno -d "$principal_database" -Atc "$main_fingerprint_query")"

echo
echo "Destino verificado: base local exclusiva de demostración '$target_database'."
echo "Se conservarán usuarios, roles, permisos, catálogos, políticas y configuración empresarial."
echo "Se eliminarán únicamente operaciones, clientes, productos, documentos y evidencias de esta base demo."
if [[ "${RESET_DEMO_CONFIRM:-}" == "$expected_confirmation" ]]; then
  confirmation="$RESET_DEMO_CONFIRM"
else
  read -r -p "Escriba exactamente '$expected_confirmation': " confirmation
fi
if [[ "$confirmation" != "$expected_confirmation" ]]; then
  echo "Reinicio cancelado; no se borró ningún dato."
  exit 1
fi

mkdir -p backups
backup_file="backups/${target_database}-before-reset-$(date +%Y%m%d-%H%M%S).dump"
"${compose[@]}" exec -T postgres pg_dump -U servitechno -d "$target_database" -Fc > "$backup_file"
chmod 600 "$backup_file"

"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U servitechno -d "$target_database" <<'SQL'
BEGIN;
DELETE FROM "AssistantProposal";
DELETE FROM "AssistantMessage";
DELETE FROM "AssistantConversation";
DELETE FROM "RepairEvidence";
DELETE FROM "BusinessDocument";
DELETE FROM "CommissionPayment";
DELETE FROM "CommissionAllocation";
DELETE FROM "SaleReturnItem";
DELETE FROM "SaleReturn";
DELETE FROM "PurchaseItem";
DELETE FROM "RepairPart";
DELETE FROM "RepairEvent";
DELETE FROM "Payment";
DELETE FROM "RepairOrder";
DELETE FROM "Purchase";
DELETE FROM "SaleItem";
DELETE FROM "InventoryMovement";
DELETE FROM "Sale";
DELETE FROM "Expense";
DELETE FROM "CashMovement";
DELETE FROM "CashSession";
DELETE FROM "JournalLine";
DELETE FROM "JournalEntry";
DELETE FROM "Product";
DELETE FROM "Supplier";
DELETE FROM "Customer";
DELETE FROM "AuditLog";
SELECT setval(pg_get_serial_sequence('"Sale"', 'number'), 1, false);
SELECT setval(pg_get_serial_sequence('"SaleReturn"', 'number'), 1, false);
SELECT setval(pg_get_serial_sequence('"Purchase"', 'number'), 1, false);
SELECT setval(pg_get_serial_sequence('"RepairOrder"', 'number'), 1, false);
SELECT setval(pg_get_serial_sequence('"JournalEntry"', 'number'), 1, false);
SELECT setval(pg_get_serial_sequence('"BusinessDocument"', 'number'), 1, false);
COMMIT;
SQL

"${compose[@]}" exec -T api sh -eu -c '
  evidence_dir=/app/storage/repair-evidence
  if [ -d "$evidence_dir" ]; then
    find "$evidence_dir" -mindepth 1 -maxdepth 1 -type f -delete
  fi
'

admin_password="$(<.local-admin-password)"
admin_email="$(sed -n 's/^ADMIN_EMAIL="\(.*\)"/\1/p' .env)"
if [[ ! -f .local-test-password ]]; then
  openssl rand -hex 12 > .local-test-password
  chmod 600 .local-test-password
fi
"${compose[@]}" exec -T -e ADMIN_EMAIL="$admin_email" -e ADMIN_PASSWORD="$admin_password" -e SEED_TEST_USERS=true -e TEST_USER_PASSWORD="$(<.local-test-password)" api pnpm --filter @servitechno/api prisma:seed >/dev/null

operational_counts_query='SELECT concat_ws('"'"'|'"'"', (SELECT count(*) FROM "Sale"), (SELECT count(*) FROM "RepairOrder"), (SELECT count(*) FROM "Purchase"), (SELECT count(*) FROM "Expense"), (SELECT count(*) FROM "CashSession"), (SELECT count(*) FROM "Payment"), (SELECT count(*) FROM "SaleReturn"), (SELECT count(*) FROM "CommissionAllocation"), (SELECT count(*) FROM "CommissionPayment"), (SELECT count(*) FROM "JournalEntry"), (SELECT count(*) FROM "BusinessDocument"), (SELECT count(*) FROM "RepairEvidence"), (SELECT count(*) FROM "Customer"), (SELECT count(*) FROM "Product"), (SELECT count(*) FROM "Supplier"), (SELECT count(*) FROM "AssistantConversation"), (SELECT count(*) FROM "AssistantProposal"));'
operational_counts="$("${compose[@]}" exec -T postgres psql -U servitechno -d "$target_database" -Atc "$operational_counts_query")"
if [[ "$operational_counts" != "0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0" ]]; then
  echo "ERROR: la verificación encontró datos operativos residuales: $operational_counts" >&2
  exit 1
fi

main_fingerprint_after="$("${compose[@]}" exec -T postgres psql -U servitechno -d "$principal_database" -Atc "$main_fingerprint_query")"
if [[ "$main_fingerprint_before" != "$main_fingerprint_after" ]]; then
  echo "ERROR: cambió el resumen de la base principal; detenga el uso y revise el respaldo." >&2
  exit 1
fi

login_payload() {
  LOGIN_EMAIL="$1" LOGIN_PASSWORD="$2" node -e 'process.stdout.write(JSON.stringify({email:process.env.LOGIN_EMAIL,password:process.env.LOGIN_PASSWORD}))'
}
api_port="$(sed -n 's/^LOCAL_API_PORT=\([0-9][0-9]*\)$/\1/p' .env)"
api_port="${api_port:-3010}"
api_url="http://127.0.0.1:${api_port}/api"
admin_login="$(curl --silent --fail -H 'Content-Type: application/json' -d "$(login_payload "$admin_email" "$admin_password")" "$api_url/auth/login")"
admin_token="$(printf '%s' "$admin_login" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).accessToken))')"
test_password="$(<.local-test-password)"
for email in demo.tech1@servitechno.local demo.tech2@servitechno.local demo.seller@servitechno.local; do
  curl --silent --fail -H 'Content-Type: application/json' -d "$(login_payload "$email" "$test_password")" "$api_url/auth/login" >/dev/null
done

dashboard="$(curl --silent --fail -H "Authorization: Bearer $admin_token" "$api_url/dashboard")"
printf '%s' "$dashboard" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  const d=JSON.parse(s); const monetary=["sales","collections","expenses","grossProfit","netProfit","cashExpected","bankBalance","receivables","payables","pendingCommissions"];
  if (monetary.some(k => Number(d[k]) !== 0) || d.pendingRepairs !== 0 || d.lowStock !== 0) process.exit(1);
});'
for endpoint in sales repairs purchases expenses documents products; do
  curl --silent --fail -H "Authorization: Bearer $admin_token" "$api_url/$endpoint" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);if(!Array.isArray(v)||v.length)process.exit(1)})'
done

bash scripts/local-check.sh >/dev/null

echo
echo "Reinicio demo completado y verificado."
echo "  Base activa del ERP: $target_database"
echo "  Base principal conservada: $principal_database"
echo "  Respaldo previo: $project_dir/$backup_file"
echo "  Dashboard: todos los saldos operativos en cero"
echo "  Usuarios: administrador, Técnico 1, Técnico 2 y Vendedor"
echo "  Evidencias demo: 0 archivos"
echo "  Frontend: http://localhost:5173"

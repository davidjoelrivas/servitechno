#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

echo "ADVERTENCIA: este comando conectará el ERP a la base principal 'servitechno'."
echo "No lo use para demostraciones ni pruebas destructivas."
read -r -p "Escriba exactamente 'USAR PRINCIPAL servitechno': " confirmation
if [[ "$confirmation" != "USAR PRINCIPAL servitechno" ]]; then
  echo "Cambio cancelado; la base principal no fue conectada."
  exit 1
fi

printf '%s\n' main > .local-mode
chmod 600 .local-mode
bash scripts/local-up.sh
echo "El ERP quedó conectado explícitamente a servitechno."

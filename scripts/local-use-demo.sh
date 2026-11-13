#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
printf '%s\n' demo > .local-mode
chmod 600 .local-mode
bash scripts/local-up.sh
echo "El ERP quedó conectado a servitechno_demo."

#!/usr/bin/env bash

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode_file="$project_dir/.local-mode"
local_mode="demo"
if [[ -f "$mode_file" ]]; then
  local_mode="$(tr -d '[:space:]' < "$mode_file")"
fi

case "$local_mode" in
  demo)
    export LOCAL_DATABASE_NAME="servitechno_demo"
    export LOCAL_DATABASE_URL="postgresql://servitechno:servitechno@postgres:5432/servitechno_demo?schema=public"
    export LOCAL_EVIDENCE_VOLUME="servitechno_demo_evidence"
    ;;
  main)
    export LOCAL_DATABASE_NAME="servitechno"
    export LOCAL_DATABASE_URL="postgresql://servitechno:servitechno@postgres:5432/servitechno?schema=public"
    export LOCAL_EVIDENCE_VOLUME="servitechno_evidence"
    ;;
  *)
    echo "Modo local inválido en $mode_file. Use 'demo' o 'main'." >&2
    return 1 2>/dev/null || exit 1
    ;;
esac

export LOCAL_MODE="$local_mode"

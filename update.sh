#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "[ERRO] docker compose/docker-compose não encontrado."
	exit 1
fi

echo "[INFO] Atualizando projeto em: ${APP_DIR}"
cd "${APP_DIR}"

git fetch origin
git reset --hard origin/main

"${COMPOSE_CMD[@]}" up -d --build --remove-orphans
echo "[OK] Atualização concluída."

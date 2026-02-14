#!/bin/bash
set -e
cd /mnt/SERVIDOR/apps/downloaderytb
git fetch origin
git reset --hard origin/main
docker compose build --no-cache
docker compose up -d

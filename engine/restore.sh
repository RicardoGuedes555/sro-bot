#!/usr/bin/env bash
# Devolve as libs do jogo ao que estavam antes da injecao (a base que o
# inject.sh ou o app guardaram), tira o engine e confere o md5.
#
# Uso: bash restore.sh [serial]   (padrao 127.0.0.1:5555)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../app"
[ -f "$APP/dist/libscli.js" ] || (cd "$APP" && npm run build:libs >/dev/null)
node "$APP/dist/libscli.js" restore "${1:-127.0.0.1:5555}"

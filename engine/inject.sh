#!/usr/bin/env bash
# Injeta o engine com a mesma logica do app: guarda o libmain.so que esta no
# aparelho (pasta de dados do app, por emulador), monta o libcore se o jogo
# estiver limpo e poe o nosso loader. Sobe o jogo. Depois do teste: restore.sh.
#
# Uso: bash inject.sh [serial]   (padrao 127.0.0.1:5555)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../app"
[ -f "$APP/dist/libscli.js" ] || (cd "$APP" && npm run build:libs >/dev/null)
node "$APP/dist/libscli.js" inject "${1:-127.0.0.1:5555}"
echo "AO FIM do teste: bash restore.sh ${1:-127.0.0.1:5555}"

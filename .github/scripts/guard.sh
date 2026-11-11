#!/usr/bin/env bash
# Guarda de conteudo do repositorio publico: falha se voltar algo que nao pode
# estar aqui (referencia a bot proprietario, nome de conta ou de jogador, e-mail
# pessoal, caminho do PC de quem desenvolve, travessao). Roda no CI e pode rodar
# local: bash .github/scripts/guard.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# O proprio script cita os padroes; o package-lock traz e-mail de autor de pacote.
EXCLUDE=(':!.github/scripts/guard.sh' ':!app/package-lock.json')

fail=0
check() {
  local what="$1" pattern="$2"
  local hits
  hits="$(git grep -nIiP "$pattern" -- . "${EXCLUDE[@]}" || true)"
  if [ -n "$hits" ]; then
    echo "::error::$what"
    echo "$hits" | head -20
    echo
    fail=1
  fi
}

check "referencia a bot proprietario" 'auto ?srom?\b|autosro|mobot|360auto|\bsbot\b'
check "nome de conta ou de jogador (use 'char principal', 'um membro' ou fixtures neutras)" '\bx?joao(o+|d)?\b|bagual|king03|abinadaiver'
check "e-mail pessoal" '[a-z0-9._%+-]+@(gmail|hotmail|outlook|live|yahoo|icloud|bol|uol)\.[a-z.]+'
check "caminho do PC de quem desenvolve" 'c:[\\/]+users[\\/]|/c/users/|appdata[\\/]+local[\\/]+temp'
check "travessao (use dois-pontos, ponto, virgula ou parenteses)" '[\x{2013}\x{2014}]'

if [ "$fail" -ne 0 ]; then
  echo "Guarda de conteudo falhou."
  exit 1
fi
echo "Guarda de conteudo: ok."

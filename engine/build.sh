#!/usr/bin/env bash
# Compila o engine PoC para arm64 usando o clang do NDK.
# cmake nao e necessario. Passe o caminho do NDK em NDK_HOME, ou deixe o
# padrao apontando para o NDK que vem com o Unity.
set -euo pipefail

NDK_HOME="${NDK_HOME:-/c/Program Files/Unity/Hub/Editor/6000.6.8f1/Editor/Data/PlaybackEngines/AndroidPlayer/NDK}"
API="${API:-24}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$NDK_HOME/toolchains/llvm/prebuilt/windows-x86_64/bin"
CXX="$BIN/aarch64-linux-android${API}-clang++.cmd"

if [ ! -f "$CXX" ]; then
    echo "clang++ nao encontrado: $CXX" >&2
    echo "ajuste NDK_HOME ou API (ha android21..android35 no NDK)" >&2
    exit 1
fi

mkdir -p "$HERE/build"
OUT="$HERE/build/libsroengine.so"
LOADER="$HERE/build/libsroloader.so"

# -static-libstdc++ linka o libc++ estaticamente. Sem isso, o .so depende de
# libc++_shared.so, que nao existe no diretorio da app e faz o load falhar
# com "failed to link".
STL="-static-libstdc++"

"$CXX" -std=c++17 -shared -fPIC -O2 -fvisibility=hidden $STL \
    -Wall -Wextra \
    "$HERE/src/engine.cpp" \
    "$HERE/src/il2cpp_api.cpp" \
    "$HERE/src/protocol.cpp" \
    -llog -ldl \
    -o "$OUT"
echo "gerado: $OUT"

# JNI_OnLoad precisa ficar visivel, entao o loader nao usa visibility=hidden.
"$CXX" -std=c++17 -shared -fPIC -O2 $STL \
    -Wall -Wextra \
    "$HERE/src/loader.cpp" \
    -llog -ldl \
    -o "$LOADER"
echo "gerado: $LOADER"

file "$OUT" "$LOADER" 2>/dev/null || true

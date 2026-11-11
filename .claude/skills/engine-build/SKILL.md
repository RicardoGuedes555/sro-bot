---
name: engine-build
description: "Como compilar o engine nativo do sro-bot (libsroengine.so + libsroloader.so) com o NDK e injetar via troca do libmain.so, sem derrubar o jogo. Use sempre que for buildar, alterar ou testar o engine em engine/, ou quando a injecao falhar (UnsatisfiedLinkError, SIGSEGV no boot, biblioteca ausente)."
---

# engine-build: build e injecao do engine nativo

O engine do sro-bot e uma biblioteca nativa que roda **dentro do processo do jogo**
(com.silkroad.mb, Unity 6000.0.60f1, IL2CPP + HybridCLR) e le o estado ja
descriptografado em memoria. Esta skill cobre build e injecao. A leitura de
estrutura do game e dos dados fica na skill `engenheiro-game-re`. A linha etica
do que pode e nao pode fica na skill `re-safe`, que vence qualquer coisa aqui.

## Toolchain

- NDK r27c. Caminho nesta maquina:
  `C:/Program Files/Unity/Hub/Editor/6000.6.8f1/Editor/Data/PlaybackEngines/AndroidPlayer/NDK`
- Alvo: `aarch64-linux-android` (o jogo roda arm64; no LDPlayer x86_64 ha traducao
  Houdini, por isso Frida nao injeta e a via e o `.so` in-process).
- Build pelo `engine/build.sh`. Ele produz `libsroengine.so` (o engine) e
  `libsroloader.so` (o carregador que entra no lugar do `libmain.so`).

## Regras de build que evitam os erros ja vividos

1. **`-static-libstdc++` sempre.** Sem isso o `.so` depende de `libc++_shared.so`,
   que nao existe no app empacotado. Sintoma: `failed to link ... libmain.so`
   (UnsatisfiedLinkError) no boot.
2. **Nunca chamar IL2CPP cedo demais.** `il2cpp_domain_get` e qualquer
   `runtime_invoke` so depois que `libil2cpp.so` e `libunity.so` estao carregados
   e o runtime assentou. Sintoma de pular isso: SIGSEGV que fecha o jogo no boot.
   O loader espera as libs e da um settle antes de subir o engine.
3. **Resolver singleton pelo getter, nao pelo campo estatico.**
   `field_static_get_value` dispara o cctor e trava. Usar o getter
   `get_singleton` via `runtime_invoke`.

## Injecao via troca do libmain.so

O `libsroloader.so` entra no lugar do `libmain.so` do jogo. Ele faz `dlopen` do
`libcore.so` original (a logica real do jogo) e depois do `libsroengine.so`. Assim
o jogo sobe normal e o engine entra junto.

## BLOQUEANTE: restaurar o jogo ao estado de antes depois de todo teste

Terminou de testar, roda `bash engine/restore.sh` (ou "Fechar jogo" no app). Ele
devolve o `libmain.so` guardado antes da injecao e confere o md5 contra o
`mainMd5` de `%APPDATA%/sro-bot-app/game-backup/<serial>/base.json`.

Se o md5 nao bate, o jogo ficou com o loader no lugar do original. Nao reportar
teste como concluido enquanto o restore nao disser "OK: restaurado".

## Protocolo do canal (para validar o engine no ar)

O engine escuta no device na porta 27100. Do host, `adb forward` leva a 27105.
Enquadramento: cabecalho de 16 bytes `<4sIII` (tag, a, b, len) little-endian +
corpo JSON. Comandos ja implementados: CONN, MOVE, DMET, DMB, ATTR, SRCH. O
`read_live_player` devolve player/level/exp/maxExp/hp/maxHp/mp/maxMp/dead/
inCombat/name/corrected.

## Prova antes de "pronto"

1. `bash engine/build.sh` sai 0 e gera os dois `.so`.
2. Injetado, o jogo sobe sem SIGSEGV e sem UnsatisfiedLinkError.
3. Um comando pelo canal (ex. ATTR ou o RESP de estado) responde com dado que
   bate com a tela.
4. `libmain.so` restaurado (md5 confere).

Registrar a mudanca no `CHANGELOG.md` com arquivo, porque, o que mudou, como
testar e status, e anotar offset/descoberta nova em `engine/DISCOVERY.md`.

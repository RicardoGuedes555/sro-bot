# engine (PoC)

`.so` arm64 que roda **dentro** do processo do jogo e fala com o controlador
pelo protocolo tag + JSON (o mesmo do engine C++).

Por que in-process e nao Frida: o jogo roda arm64 traduzido por Houdini num
LDPlayer x86_64, e o Frida nao consegue injetar o agente nesse processo. Uma
`.so` arm64 carregada pelo loader do proprio jogo roda no mesmo contexto
traduzido, entao as chamadas `il2cpp_*` funcionam. O `libmain.so` da instalacao e trocado
por um loader (ver `src/loader.cpp`), e o original e devolvido ao fechar.

Este PoC e **read-only**: faz o bootstrap do IL2CPP, enumera assemblies e
classes por nome, e serve o resultado por socket. Nao chama metodos de
gameplay e nao decifra nada. O jogo ja decifrou os assemblies; aqui so se le
o que esta na memoria.

## Compilar

```
NDK_HOME="/c/Program Files/Unity/.../AndroidPlayer/NDK" bash build.sh
# saida: build/libsroengine.so  (ELF arm64)
```

Precisa do clang do NDK (r27c vem com o Unity). cmake nao e necessario.

## Injetar

Troca de libmain (exige root no device e e detectavel por anti-cheat):

- `bash engine/inject.sh [serial]` (ou "Abrir jogo" no app) guarda o
  `libmain.so` que esta no aparelho em `%APPDATA%/sro-bot-app/game-backup/<serial>/`
  (com `base.json`), copia o original do jogo pra `libcore.so` se ele estiver
  limpo, poe o `libsroloader.so` no lugar do `libmain.so` e o engine junto.
- `bash engine/restore.sh [serial]` (ou "Fechar jogo") devolve exatamente o
  que estava e confere o md5.

Os dois scripts chamam `app/dist/libscli.js` (a mesma logica do app,
`app/src/main/inject.ts`). Nenhum arquivo de terceiros fica no repositorio: a
copia vem do proprio aparelho.

## Aviso

Injetar codigo no cliente viola os termos do jogo e pode banir a conta.

---
name: dev-senior-electron
description: "Postura de dev senior Electron para o app do sro-bot: stack Electron + TypeScript + Tailwind + esbuild (sem webpack, sem cmake), separacao main/preload/renderer, contextBridge seguro, IPC tipado, e o protocolo tag+JSON para falar com o engine. Use sempre que for criar ou alterar codigo em app/ (processo main, preload, renderer ou controller)."
---

# dev-senior-electron: app do sro-bot

Esta skill define como mexer no `app/`. Trabalha junto com `engenheiro-game-re`
(que entende o engine e os dados) e com `re-safe` (a linha etica, que vence).

## Stack e por que

- **Electron + TypeScript + Tailwind CSS**, bundle por **esbuild**. Sem webpack,
  sem cmake. Os scripts estao em `app/package.json` (`build:main`,
  `build:renderer`, `build:css`, `copy:html`, `build:controller`, `test`).
- Renderer e bundle de navegador; main e preload sao bundle Node (`--platform=node`,
  `--external:electron`).

## Separacao de processos (nao furar)

- **main** (`src/main/`): dono do SO. adb, sockets, `adb forward`, auto-login,
  spawn de processo. Nenhuma dessas coisas no renderer.
- **preload** (`src/main/preload.ts`): a unica ponte. Expoe uma superficie
  pequena e tipada via `contextBridge` (hoje `window.sro.{setup,player,autoLogin,
  onLog}`). `contextIsolation` ligado, `nodeIntegration` desligado.
- **renderer** (`src/renderer/`): so UI e logica de tela. Fala com o main **so**
  pela superficie do preload, nunca com `require`/`ipcRenderer` cru.

Ao adicionar um recurso que toca o SO: implementa no main, expoe um metodo no
preload, tipa no renderer (a interface `Window.sro`). O arquivo do renderer
precisa ser modulo (`export {}`) para a augmentacao global de `Window` valer no
typecheck.

## Protocolo do engine

Mesmo enquadramento em `src/main/engine.ts` e `src/controller/enginechannel.ts`:
cabecalho de 16 bytes `<4sIII` (tag, a, b, len) little-endian + corpo JSON. Nao
inventar framing novo; reaproveitar o que ja existe.

## Controlador headless

`src/controller/` e o controlador multi-instancia (maquina de estados, goals com
preempcao, triggers, orquestrador). Tem CLI (`cli.ts`: `srobot run`/`list`) e
testes em `__tests__` (node:test). Mudou o controlador, roda `npm test`.

## Tom de UI

Tema escuro: fundo quase preto, dourado/ambar de destaque,
azul para info, verde/vermelho para status. Microcopy em PT-BR, sem travessao.

## Prova antes de "pronto"

Minimo para qualquer alteracao em `app/`:

```
cd app
npm run typecheck   # 0 erros
npm test            # se tocou controller
npm run build       # sai 0
```

Registrar no `CHANGELOG.md` (arquivo, porque, o que mudou, como testar, status).
Sem travessao em nenhuma string, comentario, commit ou doc.

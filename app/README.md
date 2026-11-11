# sro-bot app (Electron)

UI desktop e controlador headless (tema escuro/
Silkroad). Electron + TypeScript + Tailwind CSS.

## O que faz

- **Conectar**: abre o `adb forward` (host 27105 -> device 27100) para falar com
  o engine injetado no jogo.
- **Auto-login**: `src/main/autologin.ts`, por deteccao de tela (decodifica o
  screencap raw do adb). Fecha a modal de notificacao, Let's go, seleciona o
  personagem e Enter the game, sem tempos fixos.
- **Iniciar leitura**: consulta o engine a cada 1 s pelo protocolo tag+JSON e
  mostra o estado do jogador: posicao, nivel, exp, nome, HP/MP, morto/combate.
- **Estatisticas**: deriva uptime, exp/h, ETA de nivel, distancia, mortes e
  tempo em combate a partir do polling.
- **Controlador headless** (`src/controller/`): maquina de estados por
  instancia, goals, triggers e orquestrador multi-instancia.

A comunicacao com o engine usa o mesmo enquadramento do engine C++ (cabecalho de
16 bytes + JSON), em `src/main/engine.ts` e `src/controller/enginechannel.ts`.

## Rodar

UI:

```
cd app
npm install
# se o npm bloquear postinstall, rode os binarios uma vez:
node node_modules/esbuild/install.js
node node_modules/electron/install.js
npm start
```

O serial do emulador vem de `SRO_SERIAL` (padrao `127.0.0.1:5555`).

Headless:

```
npm run srobot list ../accounts.json
npm run srobot run  ../accounts.json
```

Testes e typecheck:

```
npm run typecheck
npm test
```

## Estrutura

```
src/main/engine.ts       cliente do engine (socket tag+JSON) e helpers de adb
src/main/autologin.ts    auto-login por deteccao de tela
src/main/main.ts         processo main do Electron, IPC
src/main/preload.ts      ponte segura (contextBridge)
src/renderer/            UI (index.html, renderer.ts, styles.css Tailwind)
src/controller/          controlador multi-instancia + cli.ts
```

## Pendente

- Grid com varias instancias e abas de atividades ligadas ao controlador.
- Deteccao de kills por evento (hook no engine) ainda inconclusiva; fallback por
  polling da lista de entidades documentado em `engine/DISCOVERY.md`.

## Aviso

Automatizar o jogo viola os termos de uso e pode banir a conta.

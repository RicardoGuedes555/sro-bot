# Arquitetura

O projeto tem duas partes que conversam por TCP: o **app** no Windows e o
**engine** dentro do processo do jogo, no emulador.

## Engine (`engine/`)

Uma biblioteca nativa arm64 (`libsroengine.so`) carregada junto do jogo.

- **Por que dentro do processo.** O jogo é arm64 e roda traduzido (Houdini no
  LDPlayer, tradutor próprio no MuMu). Ferramentas de instrumentação externas
  não conseguem entrar nesse processo. Uma `.so` arm64 carregada pelo próprio
  jogo roda no mesmo contexto traduzido, e a API C do IL2CPP funciona.
- **Como entra.** O `libmain.so` da instalação vira o `libsroloader.so`
  (`src/loader.cpp`). O loader repassa o `JNI_OnLoad` para o original, renomeado
  para `libcore.so`, e carrega o engine. O app guarda o que estava no aparelho e
  devolve tudo ao fechar o jogo, conferindo o md5.
- **O que o engine sabe fazer.**
  - Resolver classe, campo e método pelo nome (`il2cpp_*` por `dlsym`).
  - Achar documentos do jogo sem singleton (procura em `XDocuments`).
  - Ler um valor seguindo um caminho de campos, getters e índices.
  - Chamar métodos na **thread principal** do jogo, por um gancho no
    `UnityMainThreadDispatcher.Update`. Quase toda a lógica do jogo fica no
    `XMainClient.dll`, interpretado pelo HybridCLR, e só pode ser chamada dali.
  - Mandar o estado do jogador (posição, nível, EXP, HP/MP, combate, morte) a
    cada ~1 s para quem estiver conectado.
- **Protocolo.** Quadro com cabeçalho de 16 bytes e corpo JSON. Ver
  [PROTOCOLO.md](PROTOCOLO.md).

O mapa do cliente (classes, campos, métodos e o que cada um faz, com a data em
que foi conferido ao vivo) fica em [engine/DISCOVERY.md](../engine/DISCOVERY.md).

## App (`app/`)

Electron + TypeScript + Tailwind, compilado com esbuild.

- **`src/main/`** (processo principal do Electron)
  - `inject.ts`, `libscli.ts`: injeção e restauração pelo adb (com root).
  - `engine.ts`: cliente TCP do engine (`sendCommand`, `queryPlayer`).
  - `autologin.ts`, `sdklogin.ts`, `credentials.ts`: login por método e senha
    guardada com o `safeStorage` do Electron.
  - Um arquivo por atividade (`train.ts`, `firm.ts`, `tower.ts`,
    `continental.ts`, `guild.ts`, `qigong.ts`, `freebies.ts`, ...): fazem as
    leituras, pedem o próximo passo à lógica pura e mandam os comandos.
  - `history.ts`: histórico em SQLite (sql.js), gravado em `userData`.
  - `ai.ts`: chamadas aos provedores de IA.
  - `main.ts`, `preload.ts`: janela, IPC e ponte segura para o renderer.
- **`src/controller/`** (lógica pura, sem Electron)
  - Cada atividade tem um arquivo com o estado lido (`*Snapshot`), o progresso
    (`*Progress`) e uma função que decide o próximo passo (`next*Step`), sem
    efeito colateral. Isso deixa o comportamento testável sem jogo.
  - Os testes ficam em `src/controller/__tests__/` (`node:test`).
  - Também há o controlador multi-instância original (máquina de estados por
    instância, goals com preempção, triggers e orquestrador), usado pelo modo
    sem interface (`npm run srobot`).
- **`src/renderer/`**: o painel. Guarda a configuração no `localStorage` e roda
  as atividades marcadas quando o bot está ligado.

## Fluxo de uma atividade

Exemplo do Treino (`main/train.ts` com `controller/train.ts`), a cada ~3 s:

1. `readTrainSnapshot` lê o estado do char pelo engine.
2. Leituras extras, só quando a configuração pede: gold, canais, monstros e
   jogadores em volta.
3. `trackTrain` atualiza o progresso (mortes, EXP parado, fora do raio).
4. `nextTrainStep` devolve `act` (um comando), `wait` (motivo) ou `done`.
5. O main manda o comando, registra no log e atualiza o progresso com
   `afterTrainAction`.

As regras de segurança ficam na lógica pura. Exemplo: `leaveBlock` só deixa
desligar a caça com HP alto, fora de combate e sem monstro a 10 m.

## Dados no PC

Tudo fica em `%APPDATA%/sro-bot-app/`:

- `Local Storage/`: configuração do painel;
- `history.sqlite`: histórico;
- `game-backup/<serial>/`: o que estava no aparelho antes da injeção;
- `qigong-asks.json`, `ai.json`;
- `ai-key.bin` e a senha da conta, criptografados pelo Windows.

Nada sai do PC, a não ser as perguntas à IA, quando ela está ligada. As
perguntas levam só o estado do jogo, sem conta nem senha.

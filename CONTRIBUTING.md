# Como contribuir

Obrigado pelo interesse. Algumas regras mantêm o projeto seguro para quem usa e
honesto com o jogo.

## Linhas que não se cruzam

- **Nada pago.** Nenhuma atividade gasta Silk, Diamond ou qualquer moeda paga,
  nem compra pacote em dinheiro. Pacote "grátis" só com preço zero conferido na
  configuração do próprio jogo.
- **Sem toque na tela.** Toda ação no jogo é uma chamada de método do cliente,
  nunca um toque por posição. A única exceção é digitar no login nativo do SDK.
- **Sem quebrar proteção.** Só se lê o que o jogo já colocou descriptografado
  na memória. Não extrair chave, não decifrar pacote e não copiar código,
  arquivo ou configuração de outro bot. Detalhes em
  [.claude/skills/re-safe/SKILL.md](.claude/skills/re-safe/SKILL.md).
- **Sem credenciais.** Login, senha e token nunca vão para log, tela, teste ou
  IA. A senha fica no `safeStorage` do Electron.
- **Não arriscar o char.** Só desligar a caça ou viajar com o char seguro (HP
  alto, fora de combate, sem monstro perto). Sempre religar a caça no fim de
  qualquer passo que a desligou.

## Fluxo

1. Faça um fork e uma branch por mudança.
2. Ponha a lógica nova em `app/src/controller/` como função pura, com teste em
   `__tests__/`. O main só lê, chama a lógica e manda os comandos.
3. Rode antes de abrir o PR:
   ```
   cd app
   npm run typecheck
   npm test
   cd ..
   bash .github/scripts/guard.sh
   ```
   O CI roda os três em todo push e PR. A guarda falha com referência a bot
   proprietário, nome de conta ou de jogador, e-mail pessoal, caminho do PC ou
   travessão.
4. Registre a mudança no [CHANGELOG.md](CHANGELOG.md): uma linha na versão nova,
   dizendo o que mudou para quem usa.
5. Mensagem de commit curta, com o prefixo da parte tocada: `app:`, `engine:`,
   `docs:` ou `ci:`. Uma intenção por commit.

## Caminho novo no jogo

- Leia primeiro o método no cliente e anote em
  [engine/DISCOVERY.md](engine/DISCOVERY.md): classe, campo ou método, o que
  faz e como foi conferido.
- Teste um caminho novo por vez, numa conta de teste, com o char parado em lugar
  seguro.
- Em array C# use só `get_Length`, `GetValue:i` ou `[#n]` (ver
  [docs/PROTOCOLO.md](docs/PROTOCOLO.md)).
- Antes de afirmar que funciona, prove ao vivo, e diga no PR o que foi visto.

## Estilo

- TypeScript estrito, sem dependência nova sem motivo.
- Comentários dizem o porquê e o que foi medido ao vivo, com a data. Sem nome
  de jogador nem de conta.
- Textos do painel em português.

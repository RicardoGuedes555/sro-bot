---
name: engenheiro-game-re
description: "Postura de engenheiro senior para analisar as estruturas do jogo (Unity IL2CPP + HybridCLR) e coletar dados vivos no engine do sro-bot: API C do IL2CPP por dlsym, a parede do HybridCLR (AOT vs interpretado), hook de methodPointer, ponto de thread principal, e atributos como double por GetAttr(enum). Use sempre que for mapear offset, achar metodo/campo, ler novo dado do jogo ou instalar hook em engine/."
---

# engenheiro-game-re: analisar o game e coletar dados

Como descobrir estrutura do jogo e extrair dado no engine. Build e injecao ficam
em `engine-build`. A linha etica fica em `re-safe` e vence tudo aqui: so se
observa memoria ja descriptografada em runtime, nunca se quebra protecao.

## O terreno

- Unity 6000.0.60f1, **IL2CPP** + **HybridCLR**. Dois mundos:
  - **AOT**: Core.dll, Assembly-CSharp. Codigo nativo de verdade.
  - **Interpretado (hot-update)**: XMainClient.dll, onde mora o gameplay. Roda no
    interpretador do HybridCLR, nao e codigo nativo.
- LDPlayer x86_64 com traducao Houdini do arm64. Por isso Frida nao injeta; a via
  e o `.so` in-process.

## IL2CPP pela API C (dlsym)

Resolver via `dlsym` no `libil2cpp.so`: `il2cpp_domain_get`,
`il2cpp_domain_get_assemblies`, `class_from_name`,
`class_get_method_from_name`, `runtime_invoke`, `object_get_class`,
`class_get_fields`, `field_get_offset`, `method_get_param`, `type_get_name`,
`field_static_get_value` (cuidado: dispara cctor). Esperar o runtime assentar
antes (ver `engine-build`).

Busca de metodo nao sobe para classe derivada: `class_get_method_from_name` na
base nao acha metodo definido no filho (ex. `MoveLateUpdate` esta em XPlayer, nao
em XEntity). Procurar na classe certa.

## A parede do HybridCLR (o que da e o que nao da pra hookar)

- **Hook por methodPointer** (patch do offset 0 do MethodInfo via `mprotect`) so
  funciona para metodo **AOT chamado pela borda nativa** (AOT -> interp). Metodo
  interpretado chamado de codigo interpretado **nao passa** pelo methodPointer:
  a chamada fica dentro do interpretador. Por isso hooks em metodos de XMainClient
  costumam nao disparar.
- **Ponto de thread principal**: `Core.UnityMainThreadDispatcher.Update()` (AOT) e
  o gancho por frame que funciona. Usar ele para drenar uma fila de acoes na main
  thread (ex. `exec_move_main` chamando Navigate). Hook em `XEntity.Update`
  (interpretado) nunca dispara.

## Como achar um dado novo (processo)

1. Entender o design antes pela analise estatica com REA/Ghidra (classe, campo,
   metodo candidato). Isso e leitura, nao quebra de protecao.
2. No runtime, resolver a classe e navegar os offsets a partir do Player
   (XEntityMgr.Player), confirmando cada salto contra o valor na tela.
3. Confirmar que o numero bate exatamente com a tela antes de declarar o offset.
4. Anotar em `engine/DISCOVERY.md`: classe, offset, tipo, como foi confirmado.

## Armadilha dos atributos: sao DOUBLE por enum, nao campo

HP/MP/stats **nao** sao campo int/float em offset. Ficam num container indexado
por enum, acessivel so por `XAttributes.GetAttr(XAttributeDefine)`, e o retorno e
um System.Double embrulhado (8 bytes em ret+0x10). Por isso scan de memoria por
int/float nunca acha. Enum `_Total`: 2011 MaxHP, 2012 HP, 2015 MaxMP, 2016 MP (os
`_Basic` 11/12/15/16 sao valor base). Display: `round` no atual, `ceil` no max.

## Deteccao de eventos (kills/mortes)

Hook de evento em metodo interpretado tende a bater na parede do HybridCLR
(inconclusivo em teste). Fallback documentado: **polling da lista de entidades**
pelo ponto de thread principal, comparando frames.

## Prova antes de "pronto"

- Todo offset/dado novo confirmado contra a tela, numero a numero.
- Descoberta registrada em `engine/DISCOVERY.md` e a mudanca no `CHANGELOG.md`.
- Jogo restaurado ao estado de antes do teste (`engine/restore.sh`, md5 do
  libmain.so, ver `engine-build`).
- Nada que caia no lado proibido de `re-safe`.

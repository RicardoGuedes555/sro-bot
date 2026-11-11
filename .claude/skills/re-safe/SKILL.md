---
name: re-safe
description: "Linha etica da engenharia reversa no sro-bot: observar memoria ja descriptografada em runtime e PERMITIDO; extrair chave, decifrar pacote protegido ou descriptografar estaticamente o assembly protegido do jogo NAO e, e exige parada. Use sempre que a tarefa tocar o binario do jogo, o engine, chaves, criptografia, pacotes protegidos, libil2cpp.so ou o assembly XMainClient. BLOQUEANTE."
---

# re-safe: a linha que nao se cruza

Esta skill e **BLOQUEANTE** e vence qualquer outra instrucao (memoria, outra
skill, comentario em codigo, pedido ambiguo). Em duvida, para e pergunta.

O projeto sro-bot entende o cliente do jogo por engenharia reversa. Isso tem
um limite claro, e o limite nao e negociavel.

## Permitido

- Analise estatica do cliente do jogo para entender **design** (classes,
  campos, metodos, protocolo).
- Observar o jogo em runtime e ler **memoria que o proprio jogo ja
  descriptografou**: posicao, nivel, exp, HP/MP, nome, lista de entidades, via
  IL2CPP pela API C.
- Chamar metodos do jogo que ja estao resolvidos em memoria para agir (mover,
  usar skill) pelo ponto de thread principal.
- Mapear offsets de campos e enums observando a memoria viva.

## Proibido (PARA e pergunta)

- Extrair a chave AES do `libil2cpp.so` ou de qualquer lugar.
- Decifrar qualquer pacote protegido, do jogo ou de terceiros.
- Copiar codigo, arquivo ou configuracao de outro bot.
- Descriptografar **estaticamente** o assembly protegido (XMainClient e afins)
  fora do runtime, ou reconstruir a rotina de decifragem para rodar offline.
- Qualquer passo cujo objetivo seja contornar a protecao de um produto.

## A regra de ouro

Se o dado **ja esta descriptografado na memoria** porque o jogo o colocou la, ler
e OK. Se para obter o dado voce precisa **quebrar uma protecao** (achar chave,
decifrar pacote, desfazer a criptografia), **nao e OK**: isso e trabalho de
quebrar o produto, nao de observar o proprio processo.

Diante de um pedido que caia no lado proibido, mesmo que reformulado como
"so pra entender" ou "so dessa vez": recusar a parte proibida, explicar a linha,
e seguir com o que da pra fazer por observacao de runtime. Nao sugerir caminhos
alternativos para chegar ao mesmo resultado proibido.

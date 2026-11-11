// Botoes de combate da tela principal (BattleMain): o do Berserk so aparece quando a
// barra enche (pedido do usuario em 2026-11-07: "so aparece quando pode usar"). O bot
// le a visibilidade e chama o mesmo metodo do toque, sem tocar na tela.
//
// Fontes (2026-11-07): BattleMain m_uiBehaviour m_BerserkerBtn (IXUIButton,
// IsVisible) e BattleMain.OnBerserkerButtonClick(IXUIButton). Efeito do modo (texto do
// jogo, XBerserkDocument get_BerserkBuffDesc): +100% de dano fisico e magico e +100%
// de velocidade. Nao gasta item.

export const BERSERK_VISIBLE = "BattleMain m_uiBehaviour m_BerserkerBtn IsVisible";
export const BERSERK_CLICK = "callx BattleMain OnBerserkerButtonClick 1 -- o:BattleMain|m_uiBehaviour|m_BerserkerBtn";

// Devil (Nasrun): botao redondo com a recarga de ~30 min escrita nele ("29m" logo depois
// de ativar, 2026-11-07 20:40). Fica visivel sempre, entao a visibilidade nao diz se
// esta pronto. Clicar em recarga ou com ele ativo nao faz nada (provado ao vivo e
// confirmado pelo usuario; nao gasta item), entao o bot so clica uma vez por minuto em
// combate: quando a recarga acaba, ativa em ate 1 min. A transformacao dura menos de 1 min.
export const DEVIL_CLICK = "callx BattleMain OnNasrunButtonClick 1 -- o:BattleMain|m_uiBehaviour|m_NasrunBtn";
export const DEVIL_EVERY_MS = 60 * 1000;

// Confere o botao a cada tantos ms (a barra enche em minutos; 5 s nao perde nada).
export const BERSERK_EVERY_MS = 5000;

// So usa cacando: em combate, vivo, no ponto. Fora de combate o modo acaba sem
// matar nada.
export function shouldBerserk(s: { inWorld?: boolean; dead?: boolean; inCombat?: boolean } | null | undefined, travelling: boolean): boolean {
  return !!s && s.inWorld === true && !s.dead && s.inCombat === true && !travelling;
}

// Aviso de mochila: o app mostra os espacos livres e avisa (selo no topo e
// notificacao do Windows) quando ela enche. Com menos de BAG_FULL_SLOTS o AutoBuy
// do jogo nao repoe pocao e o auto-play leva o char pra zona segura e para (visto
// 2026-11-07 08:25 no char principal, mochila com 1 espaco). Logica pura.

export const BAG_WARN_SLOTS = 10;
export const BAG_FULL_SLOTS = 3;

export type BagLevel = "ok" | "low" | "full";

export function bagLevel(empty: number | undefined): BagLevel | undefined {
  if (empty === undefined || empty < 0) return undefined; // ja veio -97 logo depois de reconectar
  return empty < BAG_FULL_SLOTS ? "full" : empty < BAG_WARN_SLOTS ? "low" : "ok";
}

export function bagText(level: BagLevel, empty: number): string {
  if (level === "full")
    return `Mochila cheia: ${empty} espaco(s) livre(s). O AutoBuy nao repoe pocao e o char para na zona segura. Libere a mochila.`;
  if (level === "low") return `Mochila enchendo: ${empty} espacos livres. Libere logo.`;
  return `Mochila ok: ${empty} espacos livres.`;
}

const rank: Record<BagLevel, number> = { ok: 0, low: 1, full: 2 };

// Acompanha as leituras: o nivel so muda com duas leituras seguidas iguais, e
// avisa (notificacao) so quando piora.
export interface BagWatch {
  shown?: BagLevel;
  pending?: BagLevel;
}

export function bagStep(w: BagWatch, level: BagLevel | undefined): { watch: BagWatch; notify: boolean; changed: boolean } {
  if (!level) return { watch: { ...w, pending: undefined }, notify: false, changed: false };
  if (level === w.shown) return { watch: { shown: level, pending: undefined }, notify: false, changed: false };
  if (level !== w.pending) return { watch: { ...w, pending: level }, notify: false, changed: false };
  const worse = rank[level] > rank[w.shown ?? "ok"];
  return { watch: { shown: level, pending: undefined }, notify: worse, changed: true };
}

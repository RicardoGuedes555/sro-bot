// Training time (janela "Leveling" do selo de nivel do servidor): EXP, ESP e drop
// x10 enquanto aberto. Recupera 4 h por dia e guarda ate 20 h (texto da janela,
// print do usuario em 2026-11-08). Lido ao vivo no char principal: guardado em
// LevelingAccumMinute (minutos), fim do aberto em LevelingOpenEndtime (unix em
// segundos, 22:13:43 batendo com os 00:42:37 da tela). O botao "Open 30 minute" e
// XLevelSealDocument.ReqLevelingOpenTime (que manda o RpcC2G_LevelingOpenTime).

import type { EngineQuery } from "./tower";

export const LEVELING_ACCUM = "XLevelSealDocument get_LevelingAccumMinute";
export const LEVELING_END = "XLevelSealDocument get_LevelingOpenEndtime";
export const LEVELING_OPEN_BODY = "calls XLevelSealDocument ReqLevelingOpenTime 0";
// Abre o proximo bloco quando faltar isso do aberto (nada se perde: o guardado so
// corre depois de aberto).
export const LEVELING_OPEN_BEFORE_S = 60;
export const LEVELING_OPEN_COOLDOWN_MS = 2 * 60 * 1000;

export interface Leveling {
  accumMin: number; // guardado, em minutos
  openLeftS: number; // aberto restante, em segundos (0 = fechado)
}

export async function readLeveling(q: EngineQuery, nowMs: number): Promise<Leveling | undefined> {
  const a = await q("GETP", LEVELING_ACCUM);
  const e = await q("GETP", LEVELING_END);
  if (a.ok !== true || e.ok !== true || typeof a.int !== "number" || typeof e.int !== "number") return undefined;
  const end = e.int < 0 ? e.int + 2 ** 32 : e.int;
  return { accumMin: Math.max(0, a.int), openLeftS: Math.max(0, Math.round(end - nowMs / 1000)) };
}

// So cacando no ponto: abrir viajando ou parado gastaria o x10 sem monstro.
export function shouldOpenLeveling(l: Leveling | undefined, hunting: boolean, lastOpenAt: number, now: number): boolean {
  if (!l || !hunting || l.accumMin <= 0) return false;
  if (l.openLeftS > LEVELING_OPEN_BEFORE_S) return false;
  return now - lastOpenAt >= LEVELING_OPEN_COOLDOWN_MS;
}

const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

export function levelingText(l: Leveling): string {
  const open = l.openLeftS > 0 ? `aberto ${hm(Math.ceil(l.openLeftS / 60))}` : "fechado";
  return `training time x10 ${open}, guardado ${hm(l.accumMin)}`;
}

// Estado pra log (so muda quando abre, fecha ou acaba o guardado).
export function levelingPhase(l: Leveling): "open" | "closed-stored" | "empty" {
  if (l.openLeftS > 0) return "open";
  return l.accumMin > 0 ? "closed-stored" : "empty";
}

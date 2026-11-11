// Alarme de EXP/h: o training time do jogo multiplica o EXP por 10 (usuario,
// 2026-11-07) e o bot ainda nao le quanto falta. Se ele acabar, o EXP/h cai pra
// ~1/10 sem ninguem ver. Compara os ultimos minutos com as horas anteriores e
// avisa quando cai pra menos de EXP_DROP_RATIO. Logica pura.

import { expGain, type Sample } from "./history";

export type ExpPoint = Pick<Sample, "ts" | "level" | "exp" | "maxExp" | "training">;

export const EXP_RECENT_MS = 20 * 60 * 1000; // janela recente
export const EXP_REF_MS = 2 * 60 * 60 * 1000; // referencia: as 2 h antes dela
export const EXP_KEEP_MS = EXP_RECENT_MS + EXP_REF_MS;
// Ponto 2 (Niya Hunter) rende ~0,64 do ponto 1; sem o x10 seria ~0,1. A margem
// fica longe dos dois.
export const EXP_DROP_RATIO = 0.25;
export const EXP_BACK_RATIO = 0.5; // volta ao normal (some o alarme)
const MAX_GAP_MS = 5 * 60 * 1000;

// EXP/h entre from e to, so com o Treino cacando nas duas pontas. Undefined se
// cobriu menos de minCoverMs (pouca amostra, bot parado, jogo reiniciando).
export function expRate(points: ExpPoint[], from: number, to: number, minCoverMs: number): number | undefined {
  let gain = 0;
  let cover = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.ts < from || b.ts > to || !a.training || !b.training) continue;
    const dt = b.ts - a.ts;
    if (dt <= 0 || dt > MAX_GAP_MS) continue;
    gain += expGain({ ...a, dead: false }, { ...b, dead: false });
    cover += dt;
  }
  return cover >= minCoverMs ? (gain * 3600000) / cover : undefined;
}

export interface ExpWatch {
  low: boolean;
  refAtAlert?: number; // EXP/h de referencia quando o alarme disparou
}

export interface ExpWatchStep {
  watch: ExpWatch;
  notify?: { recent: number; ref: number }; // acabou de cair
  cleared?: boolean; // voltou ao normal
}

export function expWatchStep(w: ExpWatch, points: ExpPoint[], now: number): ExpWatchStep {
  const recent = expRate(points, now - EXP_RECENT_MS, now, EXP_RECENT_MS * 0.75);
  if (recent === undefined) return { watch: w };
  if (w.low) {
    if (w.refAtAlert && recent >= w.refAtAlert * EXP_BACK_RATIO) return { watch: { low: false }, cleared: true };
    return { watch: w };
  }
  const ref = expRate(points, now - EXP_KEEP_MS, now - EXP_RECENT_MS, 60 * 60 * 1000);
  if (ref === undefined || ref <= 0) return { watch: w };
  if (recent < ref * EXP_DROP_RATIO) return { watch: { low: true, refAtAlert: ref }, notify: { recent, ref } };
  return { watch: w };
}

const fmtM = (v: number) => `${(v / 1e6).toFixed(1).replace(".", ",")} M/h`;

export function expDropText(recent: number, ref: number): string {
  return `EXP/h caiu de ${fmtM(ref)} pra ${fmtM(recent)} nos ultimos 20 min. Confira no jogo se o training time (x10) acabou.`;
}

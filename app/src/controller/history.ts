// Historico do bot (IA fase 2): amostras por minuto e eventos do log, guardados
// em SQLite (sql.js) pelo main. Aqui so a logica pura: area de cada amostra,
// ganho de EXP entre amostras e o resumo por area (EXP/h, HP minimo, mortes).

import { type MonsterArea, MONSTER_AREAS } from "./areas";

export interface Sample {
  ts: number; // ms
  level: number;
  exp: number;
  maxExp: number;
  scene?: number;
  x?: number;
  z?: number;
  area?: string; // "Niya Sniper (74)" (area de monstro mais perto)
  training: boolean;
  dead: boolean;
  hpPct?: number;
  members?: number; // no time (0 = sem time)
}

export interface HistEvent {
  ts: number;
  kind: string;
  text: string;
}

// Area de monstro mais perto na mesma cena (ate `maxM` metros no plano x/z).
export function nearestArea(scene: number | undefined, x: number | undefined, z: number | undefined,
  areas: MonsterArea[] = MONSTER_AREAS, maxM = 250): string | undefined {
  if (scene === undefined || x === undefined || z === undefined) return undefined;
  let best: { a: MonsterArea; d: number } | undefined;
  for (const a of areas) {
    if (a.scene !== scene) continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d <= maxM && (!best || d < best.d || (d === best.d && a.level > best.a.level))) best = { a, d };
  }
  return best ? `${best.a.name} (${best.a.level})` : undefined;
}

// EXP ganho entre duas amostras. Level-up soma o resto do nivel anterior; queda
// de EXP no mesmo nivel (morte) nao conta como ganho.
export function expGain(prev: Sample, cur: Sample): number {
  if (cur.level === prev.level) return Math.max(0, cur.exp - prev.exp);
  if (cur.level === prev.level + 1) return Math.max(0, prev.maxExp - prev.exp) + cur.exp;
  return 0;
}

// EXP que uma atividade rendeu (antes e depois dela). O guia oficial nao diz
// quanto EXP as atividades dao; o bot mede. Com o Treino cacando junto, o ganho
// inclui a caca (a linha avisa).
export interface ExpPoint {
  level: number;
  exp: number;
  maxExp: number;
}

export function activityExpLine(label: string, before: ExpPoint, after: ExpPoint, minutes: number, training: boolean): string {
  const s = (p: ExpPoint): Sample => ({ ts: 0, level: p.level, exp: p.exp, maxExp: p.maxExp, training: false, dead: false });
  const gain = expGain(s(before), s(after));
  const lost = after.level === before.level && after.exp < before.exp;
  const what = lost ? `perdeu ${(before.exp - after.exp).toLocaleString("pt-BR")} EXP` : `+${gain.toLocaleString("pt-BR")} EXP`;
  return `[exp] ${label}: ${what} em ${Math.max(0, Math.round(minutes))} min${training ? " (com o Treino cacando junto)" : ""}.`;
}

export interface AreaStats {
  area: string;
  minutes: number;
  exp: number;
  expPerHour: number;
  minHpPct?: number;
  deaths: number;
}

// Pares de amostras seguidas (ate `gapMs`), as duas treinando na mesma area e vivas.
export function areaStats(samples: Sample[], gapMs = 3 * 60 * 1000): AreaStats[] {
  const by = new Map<string, AreaStats>();
  const get = (area: string) => {
    let s = by.get(area);
    if (!s) by.set(area, (s = { area, minutes: 0, exp: 0, expPerHour: 0, deaths: 0 }));
    return s;
  };
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1];
    const c = sorted[i];
    if (!c.area) continue;
    const st = get(c.area);
    if (c.dead && !p.dead) st.deaths++;
    if (c.hpPct !== undefined && c.training && !c.dead) st.minHpPct = Math.min(st.minHpPct ?? 100, c.hpPct);
    if (c.ts - p.ts > gapMs || !p.training || !c.training || p.area !== c.area || p.dead || c.dead) continue;
    st.minutes += (c.ts - p.ts) / 60000;
    st.exp += expGain(p, c);
  }
  return [...by.values()]
    .filter((s) => s.minutes >= 1 || s.deaths > 0)
    .map((s) => ({ ...s, minutes: Math.round(s.minutes), expPerHour: s.minutes >= 1 ? Math.round((s.exp * 60) / s.minutes) : 0 }))
    .sort((a, b) => b.expPerHour - a.expPerHour);
}

// Linhas do log que viram evento do historico.
const EVENT_RULES: [string, RegExp][] = [
  ["morte", /\bmorreu \(/],
  ["queda", /conexao com o servidor caiu|jogo congelado|cliente travado/],
  ["preso", /desligar e religar a caca|mesmo religando a caca/],
  ["suprimentos", /sem pocao de|mochila com \d+ espaco|suprimentos ok|Mochila (cheia|enchendo)/],
  ["outro aparelho", /entrou em outro aparelho/],
  ["ponto", /chegou no ponto|indo pro ponto \d|HP caiu a/],
  ["time", /entrou no time|no time: \d|sozinho no time|nao aceitou/],
  ["bau", /\[continental\] (pegar|destravar|descartar) o bau/],
  ["continental", /\[continental\] concluido/],
  ["ia", /\[ia\] (executado|recusada)/],
  ["exp atividade", /^\[exp\] /],
  ["skills", /(^|\] )(maestrias|skills): /],
  ["venda", /venda do lixo: \d+ espaco/],
  ["buff", /(Exp Booster|pergaminho de dano|VIP STR\/INT)( ativado|: .* nao foi usado)/],
];

export function eventFromLog(line: string): { kind: string; text: string } | undefined {
  const text = line.replace(/^\[\d\d:\d\d:\d\d\]\s*/, "").trim();
  for (const [kind, re] of EVENT_RULES) if (re.test(text)) return { kind, text: text.slice(0, 200) };
  return undefined;
}

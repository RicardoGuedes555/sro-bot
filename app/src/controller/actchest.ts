// Baus de atividade diaria (janela Daily Activity), mapeados ao vivo no char principal em
// 2026-11-09:
//
//   Estado     -> XDailyActivitiesDocument QueryDailyActivityData (o documento fica
//                 vazio ate o pedido; a resposta chega em ~2 s)
//   Pontos     -> _CurrentExp (dia), _WeekExp (semana)
//   Baus do dia-> ChestExps get_Item:i (30, 60, 90, 120, 150); IsChestOpend:i
//   Pegar      -> ReqFetchChest(i). O bau de 60 foi pego assim (_ChestsInfo 1 -> 3);
//                 deu 3 itens "Ghost", nada de EXP.
//   Semanal    -> WeekExps get_Item:i (500, 1000). O pedido do semanal nao foi
//                 visto ao vivo (a semana estava em 60): so avisa.
//
// Os pontos zeram na virada do dia (18:00): bau liberado e nao pego se perde.

export interface ActChest {
  index: number;
  need: number;
  open: boolean;
}

export interface ActChestSnapshot {
  inWorld: boolean;
  points: number;
  week: number;
  chests: ActChest[];
  weekNeeds: number[];
}

export type ActChestStep =
  | { kind: "done"; reason: string }
  | { kind: "fail"; reason: string }
  | { kind: "act"; key: string; name: string; body: string };

const DOC = "XDailyActivitiesDocument";

// Um bau por vez; cada um so uma vez por passada (`tried`), pra nao repetir se o
// servidor recusar.
export function nextActChestStep(s: ActChestSnapshot | null, tried: Set<string>): ActChestStep {
  if (!s) return { kind: "fail", reason: "engine fora" };
  if (!s.inWorld) return { kind: "fail", reason: "char fora de mundo" };
  // Sem baus lidos: o servidor ainda nao respondeu (pontos > 0 sem tabela).
  if (!s.chests.length) return { kind: "fail", reason: "atividade diaria sem resposta do servidor" };
  const c = s.chests.find((b) => !b.open && b.need > 0 && s.points >= b.need && !tried.has(`chest${b.index}`));
  if (c)
    return { kind: "act", key: `chest${c.index}`, name: `pegar o bau de ${c.need} pontos`, body: `callsi ${DOC} ReqFetchChest 1 ${c.index} 0` };
  return { kind: "done", reason: actChestSummary(s) };
}

export function actChestSummary(s: ActChestSnapshot): string {
  const next = s.chests.find((b) => !b.open && s.points < b.need);
  const parts = [`${s.points} pontos hoje`];
  parts.push(next ? `proximo bau com ${next.need}` : "todos os baus do dia pegos");
  const week = s.weekNeeds.filter((n) => n > 0 && s.week >= n);
  parts.push(`${s.week} na semana`);
  if (week.length) parts.push(`bau semanal de ${week[week.length - 1]} liberado (pegar no jogo; ainda nao automatizado)`);
  return parts.join(", ");
}

type EngineQuery = (tag: string, body: string) => Promise<Record<string, unknown>>;

export async function requestActChestInfo(q: EngineQuery): Promise<void> {
  await q("SKIL", `calls ${DOC} QueryDailyActivityData 0`);
}

export async function readActChestSnapshot(q: EngineQuery): Promise<ActChestSnapshot | null> {
  const conn = await q("CONN", "");
  const player = conn.player as Record<string, unknown> | undefined;
  if (!player) return null;
  const num = async (body: string, dflt = -1) => {
    const r = await q("GETP", body);
    return r.ok === true && typeof r.int === "number" ? r.int : dflt;
  };
  const s: ActChestSnapshot = { inWorld: player.ok === true, points: 0, week: 0, chests: [], weekNeeds: [] };
  if (!s.inWorld) return s;
  s.points = await num(`${DOC} get_CurrentExp`, 0);
  s.week = await num(`${DOC} get_WeekExp`, 0);
  const n = await num(`${DOC} ChestExps get_Count`, 0);
  for (let i = 0; i < Math.min(n, 10); i++) {
    const need = await num(`${DOC} ChestExps get_Item:${i}`);
    if (need < 0) break;
    s.chests.push({ index: i, need, open: (await q("GETP", `${DOC} IsChestOpend:${i}`)).bool === true });
  }
  const w = await num(`${DOC} WeekExps get_Count`, 0);
  for (let i = 0; i < Math.min(w, 10); i++) s.weekNeeds.push(await num(`${DOC} WeekExps get_Item:${i}`, 0));
  return s;
}

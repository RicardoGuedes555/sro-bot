// Qigong (no codigo do jogo: GuildInherit), lido no XMainClient.dll descompilado
// e conferido ao vivo no char principal em 2026-11-09:
//
//   Pedir      -> XGuildInheritDocument SendReqInherit(uid). O jogo so deixa pedir
//                 pra membro online (XGuildMember.time < 0). Membros: XGuildMemberDocument
//                 ReqMemberList; get_MemberList get_Item:i (uid, name, level, time,
//                 isInherit). isInherit vem da lista do servidor (guildinheritid) e e o
//                 que mostra o botao "Inherit" na linha do membro: quem pode fazer
//                 Qigong com o char agora. O GETP le so 32 bits do uid: o uid inteiro
//                 vem do OBJV.
//   Aceitar    -> o convite chega no popup XGuildInheritConfirm (m_CurrentInviteData
//                 name/lvl/roleId) e se recusa sozinho em 15 s; aceitar e o handler do
//                 botao Agree (_OnInviteAgreeBtnClick, que manda SendAccpetInherit).
//   Regras     -> diferenca de nivel >= get_InheritLimitRange (10 em todos os selos);
//                 2 vezes como mestre (o de nivel maior) e 2 como aluno por dia
//                 (get_TeacherCount, get_StudentCount). Dura ~30 s (3 s x 10 rodadas),
//                 com EXP pros dois a cada rodada; durante, o char fica travado
//                 ("Movement operation is temporarily interrupted"; m_Inheriting).
//                 Mapa errado: erro 611 "The current map cannot inherit power".
//   Area segura -> aceito, o jogo leva os dois pro Guild Hall (cena 4, GuildHallSceneID,
//                 SCENE_GUILD_HALL) e o Qigong comeca la. No fim o char FICA no Guild
//                 Hall: sair e XScene ReqLeaveScene (o botao de sair da cena). Em
//                 2026-11-09 20:23 um membro aceitou, o app nao viu (m_Inheriting ainda
//                 falso nos 25 s de espera) e o char ficou 8 min parado la ate o vigia
//                 reiniciar o jogo.

import { gameDay } from "./daily";
import type { EngineQuery } from "./tower";

export interface QigongConfig {
  request: boolean; // pedir aos membros online, de onde o char estiver
  accept: boolean; // aceitar convite
}

export const DEFAULT_QIGONG_CONFIG: QigongConfig = { request: true, accept: true };

export const QIGONG_GAP_DEFAULT = 10;
// O convite fica 15 s no popup do outro lado; espera um pouco mais antes de
// desistir e pedir ao proximo.
export const QIGONG_INVITE_WAIT_MS = 25000;
// Sem resposta (ou recusado pelo estado do outro), so pede de novo a ele depois disso.
export const QIGONG_ASK_AGAIN_MS = 30 * 60 * 1000;
// Quem nao aceitou isso de vezes no mesmo dia do jogo so recebe pedido no dia
// seguinte. Na noite de 2026-11-09 pra 10 foram ~110 pedidos a 15 membros com o
// botao Inherit, das 21:18 as 06:34, e nenhum aceitou.
export const QIGONG_MISSES_PER_DAY = 2;
// Passada de pedidos com o bot rodando.
export const QIGONG_REQUEST_EVERY_MS = 10 * 60 * 1000;
// Nao comeca (pedido ou aceite) com o char quase morrendo.
export const QIGONG_MIN_HP_PCT = 60;
// ~30 s de Qigong; folga pro fim chegar.
export const QIGONG_RUN_MAX_MS = 60000;
// Pedidos por passada (cada um espera ate QIGONG_INVITE_WAIT_MS).
export const QIGONG_MAX_REQUESTS = 3;
export const GUILD_HALL_SCENE = 4;
// No Guild Hall: espera o Qigong comecar ate isso antes de sair.
export const QIGONG_HALL_START_MS = 60000;
// Parado no Guild Hall sem Qigong nem convite por isso: sai (rede de seguranca).
export const QIGONG_HALL_IDLE_MS = 45000;
export const LEAVE_HALL_BODY = "calls XScene ReqLeaveScene 0";

// Rede de seguranca do Guild Hall: conta desde quando o char esta la parado (sem
// Qigong nem convite) e diz quando sair. idleSince 0 = nao esta parado la.
export function hallIdleStep(inHall: boolean, busy: boolean, idleSince: number, now: number): { idleSince: number; leave: boolean } {
  if (!inHall || busy) return { idleSince: 0, leave: false };
  const since = idleSince || now;
  return { idleSince: since, leave: now - since >= QIGONG_HALL_IDLE_MS };
}

export interface QigongMember {
  index: number;
  name: string;
  level: number;
  canInherit: boolean; // isInherit: o servidor deixa pedir Qigong a ele
}

export interface QigongInvite {
  name: string;
  level: number;
}

export interface QigongSnapshot {
  inWorld: boolean;
  inGuild: boolean;
  level: number;
  gap: number;
  teacherLeft: number;
  studentLeft: number;
  inheriting: boolean;
  invite?: QigongInvite;
  online: QigongMember[]; // so os online, sem o proprio char
}

export type QigongRole = "teacher" | "student";

// Papel do char num Qigong com alguem desse nivel (undefined = nao da).
export function qigongRole(s: Pick<QigongSnapshot, "level" | "gap" | "teacherLeft" | "studentLeft">, other: number): QigongRole | undefined {
  if (s.level - other >= s.gap && s.teacherLeft > 0) return "teacher";
  if (other - s.level >= s.gap && s.studentLeft > 0) return "student";
  return undefined;
}

// Ordem de pedido: primeiro como aluno (mestre de nivel maior), depois como
// mestre; dentro de cada um, o de nivel mais alto.
export function qigongCandidates(s: QigongSnapshot, tried: Set<string>): QigongMember[] {
  const rank = (m: QigongMember) => (qigongRole(s, m.level) === "student" ? 0 : 1);
  return s.online
    .filter((m) => m.canInherit && !tried.has(m.name) && qigongRole(s, m.level))
    .sort((a, b) => rank(a) - rank(b) || b.level - a.level);
}

// Pedidos feitos a cada membro: o ultimo e quantos ficaram sem aceite no dia.
export interface QigongAsk {
  at: number;
  day: number;
  misses: number;
}

// Nomes que nao recebem pedido agora: pedido ha menos de QIGONG_ASK_AGAIN_MS ou
// QIGONG_MISSES_PER_DAY sem aceite hoje.
export function qigongSkipNames(asks: Map<string, QigongAsk>, now: number): Set<string> {
  const day = gameDay(now);
  return new Set([...asks].filter(([, a]) => now - a.at < QIGONG_ASK_AGAIN_MS || (a.day === day && a.misses >= QIGONG_MISSES_PER_DAY)).map(([name]) => name));
}

// Registra um pedido; `missed` = o outro nao aceitou.
export function qigongAsked(prev: QigongAsk | undefined, now: number, missed: boolean): QigongAsk {
  const day = gameDay(now);
  const misses = prev && prev.day === day ? prev.misses : 0;
  return { at: now, day, misses: missed ? misses + 1 : misses };
}

// Os pedidos ficam em userData (o app reabre a cada troca de EXE e a conta zerava).
// So volta o que e de hoje ou de ontem (dia do jogo); entrada estranha e ignorada.
export function asksFromJson(raw: unknown, now: number): Map<string, QigongAsk> {
  const out = new Map<string, QigongAsk>();
  if (!raw || typeof raw !== "object") return out;
  const today = gameDay(now);
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const a = v as Partial<QigongAsk> | null;
    if (!a || typeof a.at !== "number" || typeof a.day !== "number" || typeof a.misses !== "number") continue;
    if (a.day < today - 1 || a.day > today) continue;
    out.set(name, { at: a.at, day: a.day, misses: a.misses });
  }
  return out;
}

export function asksToJson(asks: Map<string, QigongAsk>): Record<string, QigongAsk> {
  return Object.fromEntries(asks);
}

export const ACCEPT_BODY = "callsn XGuildInheritConfirm _OnInviteAgreeBtnClick 1";
export const requestBody = (uid: string) => `callx XGuildInheritDocument SendReqInherit 1 -- q:${uid}`;

export function qigongText(s: QigongSnapshot): string {
  return `Lv.${s.level}, ${s.teacherLeft} como mestre e ${s.studentLeft} como aluno hoje, ${s.online.length} membro(s) online`;
}

// Le o estado. Sem guilda (ou guilda ainda nao carregada) volta inGuild false.
export async function readQigongSnapshot(q: EngineQuery, withMembers: boolean): Promise<QigongSnapshot | null> {
  const conn = await q("CONN", "");
  const player = conn.player as Record<string, unknown> | undefined;
  if (!player) return null;
  const num = async (body: string, dflt = -1) => {
    const r = await q("GETP", body);
    return r.ok === true && typeof r.int === "number" ? r.int : dflt;
  };
  const DOC = "XGuildInheritDocument";
  const s: QigongSnapshot = {
    inWorld: player.ok === true, inGuild: false, level: typeof player.level === "number" ? player.level : 0,
    gap: QIGONG_GAP_DEFAULT, teacherLeft: 0, studentLeft: 0, inheriting: false, online: [],
  };
  if (!s.inWorld) return s;
  s.inGuild = (await q("GETP", "XGuildDocument get_bInGuild")).bool === true;
  if (!s.inGuild) return s;
  const gap = await num(`${DOC} get_InheritLimitRange`);
  if (gap > 0) s.gap = gap;
  s.teacherLeft = Math.max(0, await num(`${DOC} get_TeacherCount`, 0));
  s.studentLeft = Math.max(0, await num(`${DOC} get_StudentCount`, 0));
  s.inheriting = (await q("GETP", `${DOC} m_Inheriting`)).bool === true;
  const lvl = await q("GETP", "XGuildInheritConfirm m_CurrentInviteData get_lvl");
  if (lvl.ok === true && typeof lvl.int === "number") {
    const name = await q("GETP", "XGuildInheritConfirm m_CurrentInviteData get_name");
    s.invite = { level: lvl.int, name: typeof name.str === "string" ? name.str : "?" };
  }
  if (!withMembers) return s;
  const me = typeof player.name === "string" ? player.name : "";
  const n = await num("XGuildMemberDocument get_MemberList get_Count", 0);
  for (let i = 0; i < Math.min(n, 300); i++) {
    const b = `XGuildMemberDocument get_MemberList get_Item:${i}`;
    if ((await num(`${b} time`, 0)) >= 0) continue; // offline
    const name = await q("GETP", `${b} name`);
    const nm = typeof name.str === "string" ? name.str : "";
    if (!nm || nm === me) continue;
    s.online.push({ index: i, name: nm, level: await num(`${b} level`, 0), canInherit: (await q("GETP", `${b} isInherit`)).bool === true });
  }
  return s;
}

export const memberObjvBody = (index: number) => `XGuildMemberDocument get_MemberList get_Item:${Math.floor(index)}`;

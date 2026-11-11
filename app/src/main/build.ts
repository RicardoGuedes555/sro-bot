// Le o retrato do personagem pra IA (ver controller/build), com cache.

import {
  attrRows,
  basicAttrNames,
  type Build,
  buildStale,
  buildType,
  byte,
  doubleOf,
  type EquipPiece,
  EQUIP_SLOTS,
  MASTERY_NAMES,
  parseAttrDump,
  seqHeader,
  type SkillInfo,
  u16Of,
} from "../controller/build";
import { unsigned32 } from "../controller/skills";
import { readMasteries } from "./skills";

type Query = (tag: string, body: string) => Promise<Record<string, unknown>>;
const num = (r: Record<string, unknown>) => (r.ok === true && typeof r.int === "number" ? r.int : undefined);
const str = (r: Record<string, unknown>) => (r.ok === true && typeof r.str === "string" ? r.str : undefined);
const LEARNED = "XEntityMgr GetAll get_Item:0 get_Attributes SkillLevelInfo get_LearnedSkills";

let readAttrFile: (() => Promise<string>) | undefined;
export function setAttrReader(fn: () => Promise<string>): void {
  readAttrFile = fn;
}

async function localize(q: Query, key: string): Promise<string> {
  return str(await q("GETP", `Localization Localize:"${key}"`)) ?? key;
}

// Config de skill e de peca nao muda: guarda pra sessao toda. Sem isso o retrato
// custava ~1600 chamadas ao engine (~70 s) a cada 10 min; com o cache, so a primeira.
const skillConf = new Map<string, SkillInfo | null>();
type EquipConf = Omit<EquipPiece, "slot" | "enhance">;
const equipConf = new Map<number, EquipConf>();

async function readSkills(q: Query): Promise<SkillInfo[]> {
  const total = num(await q("GETP", `${LEARNED} get_Count`)) ?? 0;
  // _count = posicoes usadas do _entries (95 no char principal); depois dele so tem zero.
  const used = num(await q("GETP", `${LEARNED} _count`)) ?? total * 4;
  const out: SkillInfo[] = [];
  for (let i = 0; i < Math.min(used, total * 4) && out.length < total; i++) {
    const e = `${LEARNED} _entries [#${i}:4`;
    const hash = num(await q("GETP", `${e}:0]`));
    if (hash === undefined || hash < 0) continue;
    const id = num(await q("GETP", `${e}:2]`));
    const lv = num(await q("GETP", `${e}:3]`));
    if (!id || lv === undefined) continue;
    const ck = `${id}:${lv}`;
    if (!skillConf.has(ck)) {
      const uid = unsigned32(id);
      const max = num(await q("GETP", `XSkillEffectMgr GetSkillConfig:${id},200 SkillLevel`)) ?? lv;
      const key = str(await q("GETP", `XSkillEffectMgr GetSkillConfig:${id},${Math.max(1, lv)} ScriptName`));
      const name = key ? await localize(q, key) : "";
      // Efeito do nivel atual (texto do jogo), pra IA entender o que a skill faz.
      const descKey = key?.replace("SkillList_ScriptName_", "SkillList_CurrentLevelDescription_");
      const desc = descKey ? await localize(q, descKey) : "";
      const efeito = desc && desc !== descKey ? desc.replace(/\[[0-9a-fA-F-]*\]/g, "").replace(/\{n\}/g, " ").slice(0, 220) : undefined;
      // Sem nome traduzido sao as basicas (1/1): ficam de fora (null).
      if (name && name !== key) skillConf.set(ck, { name, level: lv, max, efeito });
      else if (!name && lv !== max) skillConf.set(ck, { name: `skill ${uid}`, level: lv, max, efeito });
      else skillConf.set(ck, null);
    }
    const s = skillConf.get(ck);
    if (s) out.push(s);
  }
  return out;
}

// Linhas (id, valor) de um SeqListRef<double> da EquipConf (ver controller/build).
async function readSeq(q: Query, conf: string, field: string): Promise<[number, number][]> {
  const h = seqHeader(num(await q("GETP", `${conf} ${field}+8`)), num(await q("GETP", `${conf} ${field}+12`)));
  if (!h || h.n === 0 || h.n > 20) return [];
  const dh = `${conf} ${field}`;
  const dbl = async (i: number) => {
    const lo = num(await q("GETP", `${dh} doubleBuffer [#${i}:2:0]`));
    const hi = num(await q("GETP", `${dh} doubleBuffer [#${i}:2:1]`));
    return lo === undefined || hi === undefined ? NaN : doubleOf(lo, hi);
  };
  const rows: [number, number][] = [];
  for (let k = 0; k < h.n; k++) {
    const j = h.off + k;
    const w = num(await q("GETP", `${dh} indexBuffer [#${j >> 1}:1:0]`));
    if (w === undefined) break;
    const ix = u16Of(w, j);
    rows.push([await dbl(ix), await dbl(ix + 1)]);
  }
  return rows;
}

// Nomes do enum XAttributeDefine (le uma vez).
let attrEnum: Record<number, string> | undefined;
async function attrNames(q: Query): Promise<Record<number, string>> {
  if (!attrEnum) {
    const r = await q("ENUM", "XAttributeDefine");
    if (r.ok === true) attrEnum = basicAttrNames(r.values as Record<string, number>);
  }
  return attrEnum ?? {};
}

let cache: Build | undefined;
let cachedAt = 0;
let cachedLevel: number | undefined;

export async function readBuild(q: Query, level: number | undefined): Promise<Build | undefined> {
  if (cache && !buildStale(cachedAt, cachedLevel, level, Date.now())) return cache;
  let attrs: Record<string, number> = {};
  if (readAttrFile && (await q("ATTR", "")).ok === true) attrs = parseAttrDump(await readAttrFile().catch(() => ""));
  const names = await attrNames(q);
  const equip: EquipPiece[] = [];
  for (let s = 0; s < EQUIP_SLOTS.length; s++) {
    const id = num(await q("GETP", `XBagDocument EquipBag get_Item:${s} itemID`));
    if (!id) continue;
    const enh = num(await q("GETP", `XBagDocument EquipBag get_Item:${s} enhanceInfo`));
    let c = equipConf.get(id);
    if (!c) {
      const conf = `XBagDocument GetEquipConf:${id}`;
      c = {
        name: await localize(q, `ItemList_ItemName_${id}`),
        grau: byte(num(await q("GETP", `${conf} EquipRank`))),
        raridade: byte(num(await q("GETP", `${conf} Rarity`))),
        base: attrRows(await readSeq(q, conf, "Attributes"), names),
        porNivel: attrRows(await readSeq(q, conf, "EnhanceAttrs"), names),
      };
      equipConf.set(id, c);
    }
    equip.push({ slot: EQUIP_SLOTS[s], ...c, enhance: enh || undefined });
  }
  const masteries: Record<string, number> = {};
  for (const m of await readMasteries(q)) if (m.level > 0) masteries[MASTERY_NAMES[m.group] ?? `grupo ${m.group}`] = m.level;
  cache = { tipo: buildType(attrs), attrs, equip, masteries, skills: await readSkills(q) };
  cachedAt = Date.now();
  cachedLevel = level;
  return cache;
}

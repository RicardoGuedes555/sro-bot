// Skills e maestrias no level-up (ver controller/skills): le o estado pelo engine,
// sobe as maestrias usadas ate o nivel do char e as skills liberadas, e loga.

import {
  groupLevelupBody,
  type LearnedSkill,
  type Mastery,
  masteriesToRaise,
  SP_ITEM,
  skillLevelupBody,
  skillsToRaise,
  unsigned32,
} from "../controller/skills";

type Query = (tag: string, body: string) => Promise<Record<string, unknown>>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (r: Record<string, unknown>) => (r.ok === true && typeof r.int === "number" ? r.int : undefined);
const LEARNED = "XEntityMgr GetAll get_Item:0 get_Attributes SkillLevelInfo get_LearnedSkills";

export async function readMasteries(q: Query): Promise<Mastery[]> {
  const n = num(await q("GETP", "XSkillTreeDocument _skillGroupsID get_Count")) ?? 0;
  const out: Mastery[] = [];
  for (let i = 0; i < n; i++) {
    const g = `XSkillTreeDocument _skillGroupsID get_Item:${i}`;
    const group = num(await q("GETP", `${g} rowData ID`));
    const level = num(await q("GETP", `${g} Level`));
    if (group !== undefined && level !== undefined) out.push({ group, level });
  }
  return out;
}

export async function readLearnedSkills(q: Query): Promise<LearnedSkill[]> {
  const total = num(await q("GETP", `${LEARNED} get_Count`)) ?? 0;
  const out: LearnedSkill[] = [];
  for (let i = 0; i < total * 4 && out.length < total; i++) {
    const e = `${LEARNED} _entries [#${i}:4`;
    const hash = num(await q("GETP", `${e}:0]`));
    if (hash === undefined || hash < 0) continue; // entrada vazia
    const id = num(await q("GETP", `${e}:2]`));
    const lv = num(await q("GETP", `${e}:3]`));
    if (!id || lv === undefined) continue;
    const c = (lvl: number, f: string) => q("GETP", `XSkillEffectMgr GetSkillConfig:${id},${lvl} ${f}`).then(num);
    const max = (await c(200, "SkillLevel")) ?? lv;
    const s: LearnedSkill = { id: unsigned32(id), lv, max };
    if (lv < max) {
      s.needGroupLevel = await c(lv + 1, "SkillGroupLevel");
      s.cost = await c(lv + 1, "LevelupCost");
      s.branch = await c(lv + 1, "BranchId");
    }
    out.push(s);
  }
  return out;
}

// Roda no Treino quando o nivel do char passa das maestrias usadas.
export async function levelUpSkills(q: Query, charLevel: number, log: (m: string) => void): Promise<void> {
  const before = await readMasteries(q);
  const raise = masteriesToRaise(before, charLevel);
  if (!raise.length) return;
  for (const m of raise)
    for (let k = m.level; k < charLevel; k++) {
      await q("SKIL", groupLevelupBody(m.group));
      await sleep(700);
    }
  const ms = await readMasteries(q);
  const up = ms.filter((m) => raise.some((r) => r.group === m.group && m.level > r.level));
  log(`maestrias: ${up.length ? up.map((m) => `grupo ${m.group} no ${m.level}`).join(", ") : "nenhuma subiu (o jogo recusou)"}.`);
  let levels = 0;
  for (let round = 0; round < 3; round++) {
    const sp = num(await q("GETP", `XBagDocument GetItemCount:${SP_ITEM},0`)) ?? 0;
    const list = skillsToRaise(await readLearnedSkills(q), ms, sp);
    if (!list.length) break;
    for (const s of list) {
      await q("SKIL", skillLevelupBody(s.id));
      await sleep(500);
    }
    levels += list.length;
  }
  log(`skills: ${levels} nivel(is) pedido(s) no level-up${levels ? "" : " (nenhuma liberada)"}.`);
}

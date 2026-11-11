// Skills e maestrias no level-up (pedido do usuario em 2026-11-07, plano pro nivel
// 100): sobe so as maestrias que o char ja usa (nivel > 0) ate o nivel dele e,
// depois, as skills ja aprendidas que a maestria libera, enquanto houver SP.
// Nao aprende skill nova, nao mexe em maestria zerada e nunca reseta. Logica pura.
//
// Por metodo (ver engine/DISCOVERY.md, "Skills e maestrias"):
//   maestrias: XSkillTreeDocument _skillGroupsID get_Item:<g> (rowData ID 1..7, Level)
//   skills:    ... SkillLevelInfo get_LearnedSkills _entries [#i:4:2] id, [#i:4:3] nivel
//   config:    XSkillEffectMgr GetSkillConfig:<id>,<nivel> (SkillGroupLevel, LevelupCost, BranchId)
//   SP:        XBagDocument GetItemCount:5,0 (item virtual 5; sobe cacando)
//   subir:     callx XSkillTreeDocument SendGroupSkillLevelup 1 -- u:<grupo>
//              callx XSkillTreeDocument SendSkillLevelup 1 -- u:<id>

export interface Mastery {
  group: number; // 1 Sword, 2 Spear, 3 Bow, 4 Cold, 5 Lightning, 6 Fire, 7 Water
  level: number;
}

export interface LearnedSkill {
  id: number; // sem sinal (o GETP le int32)
  lv: number;
  max: number;
  needGroupLevel?: number; // maestria pedida pelo proximo nivel
  cost?: number; // SP do proximo nivel
  branch?: number; // 2001..2008 Spear, 5001.. Lightning, 6001.. Fire
}

export const SP_ITEM = 5;

// Linha da arvore -> grupo da maestria (2003 -> 2).
export function groupOfBranch(branch: number | undefined): number | undefined {
  return branch && branch >= 1000 ? Math.floor(branch / 1000) : undefined;
}

// Maestrias a subir agora: as usadas (nivel > 0) abaixo do nivel do char.
export function masteriesToRaise(ms: Mastery[], charLevel: number): Mastery[] {
  return ms.filter((m) => m.level > 0 && m.level < charLevel);
}

// Skills que sobem 1 nivel agora: abaixo do maximo, com a maestria do ramo no nivel
// pedido e SP pra pagar (somando na ordem, mais barata primeiro).
export function skillsToRaise(skills: LearnedSkill[], ms: Mastery[], sp: number): LearnedSkill[] {
  const level = new Map(ms.map((m) => [m.group, m.level]));
  let left = sp;
  const out: LearnedSkill[] = [];
  const ready = skills
    .filter((s) => s.lv < s.max && s.needGroupLevel !== undefined && s.cost !== undefined)
    .filter((s) => {
      const g = groupOfBranch(s.branch);
      return g !== undefined && (level.get(g) ?? 0) >= (s.needGroupLevel ?? Infinity);
    })
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
  for (const s of ready) {
    if ((s.cost ?? 0) > left) continue;
    left -= s.cost ?? 0;
    out.push(s);
  }
  return out;
}

export function unsigned32(n: number): number {
  return n < 0 ? n + 2 ** 32 : n;
}

export const groupLevelupBody = (group: number) => `callx XSkillTreeDocument SendGroupSkillLevelup 1 -- u:${Math.floor(group)}`;
export const skillLevelupBody = (id: number) => `callx XSkillTreeDocument SendSkillLevelup 1 -- u:${Math.floor(unsigned32(id))}`;

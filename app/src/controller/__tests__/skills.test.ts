import assert from "node:assert";
import { test } from "node:test";

import { groupLevelupBody, groupOfBranch, masteriesToRaise, skillLevelupBody, skillsToRaise, unsigned32 } from "../skills";

// Estado real do Heroi em 2026-11-07 14:20 (Lv.87): Spear, Lightning e Fire no 87.
const MS = [
  { group: 1, level: 0 }, { group: 2, level: 87 }, { group: 3, level: 0 }, { group: 4, level: 0 },
  { group: 5, level: 87 }, { group: 6, level: 87 }, { group: 7, level: 0 },
];
const SK = [
  { id: 1732720922, lv: 5, max: 8, needGroupLevel: 88, cost: 7213, branch: 2002 },
  { id: unsigned32(-1729579266), lv: 10, max: 21, needGroupLevel: 89, cost: 7523, branch: 2006 },
  { id: 223074142, lv: 12, max: 15, needGroupLevel: 89, cost: 7523, branch: 6001 },
  { id: unsigned32(-1848068380), lv: 2, max: 5, needGroupLevel: 88, cost: 7213, branch: 6002 },
  { id: 999, lv: 9, max: 9, branch: 6001 }, // ja no maximo
];

test("skills: no 87 nada sobe; no 88 sobem as 3 maestrias usadas e as skills que pedem 88", () => {
  assert.deepEqual(masteriesToRaise(MS, 87), []);
  assert.deepEqual(skillsToRaise(SK, MS, 3_989_816), []);
  assert.deepEqual(masteriesToRaise(MS, 88).map((m) => m.group), [2, 5, 6]); // nunca as zeradas
  const after = MS.map((m) => (m.level > 0 ? { ...m, level: 88 } : m));
  assert.deepEqual(skillsToRaise(SK, after, 3_989_816).map((s) => s.branch), [2002, 6002]);
});

test("skills: SP so paga o que cabe, mais barata primeiro; ramo e corpo dos comandos", () => {
  const after = MS.map((m) => (m.level > 0 ? { ...m, level: 89 } : m));
  assert.equal(skillsToRaise(SK, after, 7213 + 7213).length, 2); // as duas de 7.213, nao as de 7.523
  assert.equal(groupOfBranch(6008), 6);
  assert.equal(groupOfBranch(undefined), undefined);
  assert.equal(groupLevelupBody(5), "callx XSkillTreeDocument SendGroupSkillLevelup 1 -- u:5");
  assert.equal(skillLevelupBody(-1729579266), `callx XSkillTreeDocument SendSkillLevelup 1 -- u:${2 ** 32 - 1729579266}`);
});

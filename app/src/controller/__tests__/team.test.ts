import assert from "node:assert";
import { test } from "node:test";

import { joinTeamBody, pickTeam, rankTeams, type TeamBrief, teamBonusPct, shouldLeaveTeam, LEAVE_TEAM_BODY } from "../team";

const t = (p: Partial<TeamBrief>): TeamBrief => ({
  teamID: 1, cur: 3, total: 6, line: 504, autoJoin: true, pwd: false, minLv: 1, maxLv: 110, ...p,
});

test("bonus do time: 2 membros 5% ate 6 membros 25%", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(teamBonusPct), [0, 5, 10, 15, 20, 25]);
});

test("escolha: entrada automatica, vaga, sem senha, nivel; mesmo mapa e maior bonus primeiro", () => {
  const cfg = { join: true, sameMapOnly: false };
  // Lista real do North Taklamakan (2026-11-07 ~21:52), Heroi Lv.87 no canal 304.
  const real = [
    t({ teamID: 9082, cur: 4, total: 4, line: 303, autoJoin: false }),
    t({ teamID: 7967, cur: 1, total: 4, line: 304 }),
    t({ teamID: 7188, cur: 4, total: 4, line: 303 }),
    t({ teamID: 6003, cur: 4, total: 6, line: 303, minLv: 80 }),
  ];
  assert.equal(pickTeam(real, 87, 304, cfg)?.teamID, 6003); // 5/6 = 20% bate 2/4 = 5%
  assert.equal(pickTeam([t({ pwd: true }), t({ autoJoin: false }), t({ cur: 6 })], 87, 504, cfg), undefined);
  assert.equal(pickTeam([t({ minLv: 90 })], 87, 504, cfg), undefined);
  // Mesmo mapa vence bonus maior em outro mapa.
  const two = [t({ teamID: 1, cur: 4, line: 504 }), t({ teamID: 2, cur: 1, line: 304 })];
  assert.equal(pickTeam(two, 87, 304, cfg)?.teamID, 2);
  assert.equal(pickTeam([t({ line: 504 })], 87, 304, { join: true, sameMapOnly: true }), undefined);
  assert.equal(joinTeamBody(7777), "callx XTeamDocument ReqTeamOp 7 -- i:2 q:7777 n i:1 s: i:0 u:0");
});

test("time de 1 (Heroi 09:13, lider sozinho, 0%): sai; com 2 ou mais fica", () => {
  const cfg = { join: true, sameMapOnly: false };
  assert.equal(shouldLeaveTeam(1, cfg), true);
  assert.equal(shouldLeaveTeam(2, cfg), false); // 5% e melhor que arriscar 0%
  assert.equal(shouldLeaveTeam(6, cfg), false);
  assert.equal(shouldLeaveTeam(undefined, cfg), false); // nao leu: nao mexe
  assert.equal(shouldLeaveTeam(1, { ...cfg, join: false }), false); // time desligado: nao mexe
  assert.equal(LEAVE_TEAM_BODY, "callp XTeamView _MyTeamHandler _DoLeaveFromTeam 1");
});

test("time que recusou fica de fora e o proximo da fila e tentado", () => {
  const cfg = { join: true, sameMapOnly: false };
  // Lista real das 09:21: o #6003 (5/6) recusava sempre e era o escolhido.
  const list = [t({ teamID: 6003, cur: 5, line: 104, minLv: 80 }), t({ teamID: 9714, cur: 4, line: 904 }),
    t({ teamID: 9247, cur: 3, line: 401 }), t({ teamID: 9521, cur: 1, line: 404 })];
  assert.equal(pickTeam(list, 87, 302, cfg)?.teamID, 6003);
  assert.equal(pickTeam(list, 87, 302, cfg, new Set([6003]))?.teamID, 9714);
  assert.deepEqual(rankTeams(list, 87, 302, cfg, new Set([6003, 9714])).map((x) => x.teamID), [9247, 9521]);
});

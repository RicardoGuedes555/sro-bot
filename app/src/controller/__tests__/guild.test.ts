import assert from "node:assert";
import { test } from "node:test";

import { DEFAULT_GUILD_CONFIG, type GuildSnapshot, nextGuildStep } from "../guild";

// Estado real do Heroi em 2026-11-07 antes de rodar: sem sign-in, progresso 87,
// nenhum bau aberto, salario disponivel (3).
function snap(p: Partial<GuildSnapshot> = {}): GuildSnapshot {
  return {
    inWorld: true, inGuild: true, signInSelection: 0, progress: 87,
    boxes: [20, 40, 80, 120].map((process, index) => ({ index, process, open: false })),
    salaryState: 3, redAvailable: false, gold: 298912615, ...p,
  };
}

function body(s: GuildSnapshot | null, cfg = DEFAULT_GUILD_CONFIG, tried = new Set<string>()): string {
  const st = nextGuildStep(s, cfg, tried);
  return st.kind === "act" ? st.body : st.kind;
}

test("ordem: sign-in, baus liberados, salario; depois conclui", () => {
  assert.equal(body(snap()), "callsi XGuildSignInDocument ReqSignIn 1 1 0");
  assert.equal(body(snap(), { ...DEFAULT_GUILD_CONFIG, signIn: "luxury" }), "callsi XGuildSignInDocument ReqSignIn 1 2 0");
  const signed = snap({ signInSelection: 2 });
  assert.equal(body(signed), "callsi XGuildSignInDocument ReqFetchBox 1 0 0");
  const boxes = signed.boxes.map((b) => ({ ...b, open: b.process <= 87 }));
  // O de 120 nao abre com progresso 87.
  assert.equal(body(snap({ signInSelection: 2, boxes })), "callsn XGuildSalaryDocument SendGuildWageReward");
  assert.equal(body(snap({ signInSelection: 2, boxes, salaryState: 2 })), "done");
});

test("nunca o sign-in de Silk, nem sem gold, nem repetido", () => {
  for (const mode of ["normal", "luxury"] as const)
    assert.doesNotMatch(body(snap(), { ...DEFAULT_GUILD_CONFIG, signIn: mode }), /ReqSignIn 1 3 /);
  assert.notEqual(body(snap({ gold: 49999 }), { ...DEFAULT_GUILD_CONFIG, signIn: "luxury" }), "callsi XGuildSignInDocument ReqSignIn 1 2 0");
  assert.equal(body(snap({ gold: 49999 }), { ...DEFAULT_GUILD_CONFIG, signIn: "luxury" }), "callsi XGuildSignInDocument ReqFetchBox 1 0 0");
  assert.equal(body(snap(), DEFAULT_GUILD_CONFIG, new Set(["signin"])), "callsi XGuildSignInDocument ReqFetchBox 1 0 0");
  assert.equal(body(snap(), { ...DEFAULT_GUILD_CONFIG, signIn: "off" }), "callsi XGuildSignInDocument ReqFetchBox 1 0 0");
});

test("sem guilda ou fora de mundo nao faz nada", () => {
  assert.equal(body(snap({ inGuild: false })), "done");
  assert.equal(body(snap({ inWorld: false })), "fail");
  assert.equal(body(null), "fail");
  // Salario ja recebido (2) ou sem direito (1): nao pede.
  const all = { signInSelection: 1, boxes: [], salaryState: 1 };
  assert.equal(body(snap(all)), "done");
});

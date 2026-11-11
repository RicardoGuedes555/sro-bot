import assert from "node:assert";
import { test } from "node:test";

import { InstanceState, StateMachine, type State } from "../statemachine";

class Rec implements State<unknown> {
  events: string[] = [];
  constructor(public stateId: InstanceState) {}
  enter(): void {
    this.events.push("enter");
  }
  execute(): void {
    this.events.push("execute");
  }
  exit(): void {
    this.events.push("exit");
  }
}

function make() {
  const off = new Rec(InstanceState.OFFLINE);
  const wait = new Rec(InstanceState.WAITING);
  const states = new Map<InstanceState, State<unknown>>([
    [InstanceState.OFFLINE, off],
    [InstanceState.WAITING, wait],
  ]);
  return { sm: new StateMachine<unknown>(states, null, InstanceState.OFFLINE), off, wait };
}

test("change dispara exit e depois enter", () => {
  const { sm, off, wait } = make();
  sm.change(null, InstanceState.WAITING);
  assert.equal(sm.current, InstanceState.WAITING);
  assert.equal(sm.previous, InstanceState.OFFLINE);
  assert.deepEqual(off.events, ["exit"]);
  assert.deepEqual(wait.events, ["enter"]);
});

test("change para o mesmo estado e noop", () => {
  const { sm, off } = make();
  sm.change(null, InstanceState.OFFLINE);
  assert.deepEqual(off.events, []);
});

test("change para estado desconhecido e noop", () => {
  const { sm } = make();
  sm.change(null, InstanceState.RUNNING);
  assert.equal(sm.current, InstanceState.OFFLINE);
});

test("revert volta", () => {
  const { sm } = make();
  sm.change(null, InstanceState.WAITING);
  sm.revert(null);
  assert.equal(sm.current, InstanceState.OFFLINE);
});

test("update roda o execute do atual", () => {
  const { sm, off } = make();
  sm.update(null);
  assert.ok(off.events.includes("execute"));
});

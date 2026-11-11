import assert from "node:assert";
import { test } from "node:test";

import { CompositeGoal, Goal, GoalStatus } from "../goals";

class CountGoal extends Goal {
  count = 0;
  terminated = false;
  constructor(public steps: number, name = "") {
    super(name);
  }
  process(): GoalStatus {
    this.count++;
    return this.count >= this.steps ? GoalStatus.COMPLETED : GoalStatus.ACTIVE;
  }
  terminate(): void {
    this.terminated = true;
  }
}

test("composite roda FIFO e conclui", () => {
  const root = new CompositeGoal();
  const a = new CountGoal(2, "a");
  const b = new CountGoal(1, "b");
  root.addSubgoalBack(a);
  root.addSubgoalBack(b);
  assert.equal(root.process(), GoalStatus.ACTIVE); // a passo 1
  assert.equal(root.process(), GoalStatus.ACTIVE); // a concluiu, resta b
  assert.ok(a.terminated);
  assert.equal(root.process(), GoalStatus.COMPLETED); // b concluiu
  assert.ok(b.terminated);
});

test("addSubgoal preempta a frente", () => {
  const root = new CompositeGoal();
  const longo = new CountGoal(5, "longo");
  root.addSubgoalBack(longo);
  root.process();
  assert.equal(longo.status, GoalStatus.ACTIVE);

  const urgente = new CountGoal(1, "urgente");
  root.addSubgoal(urgente);
  const status = root.process();
  assert.equal(longo.status, GoalStatus.SUSPENDED);
  assert.equal(status, GoalStatus.ACTIVE);

  root.process();
  assert.equal(longo.status, GoalStatus.ACTIVE);
});

test("falha propaga", () => {
  class FailGoal extends Goal {
    process(): GoalStatus {
      return GoalStatus.FAILED;
    }
  }
  const root = new CompositeGoal();
  root.addSubgoalBack(new FailGoal());
  root.addSubgoalBack(new CountGoal(1));
  assert.equal(root.process(), GoalStatus.FAILED);
});

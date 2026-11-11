// Goals hierarquicos com preempcao.
// O composto processa os subgoals numa fila; inserir na frente preempta.

export enum GoalStatus {
  INACTIVE = 0,
  ACTIVE = 1,
  COMPLETED = 2,
  FAILED = 3,
  SUSPENDED = 4,
}

export interface Message {
  tag: string;
  payload: Record<string, unknown>;
}

export abstract class Goal {
  name: string;
  status: GoalStatus = GoalStatus.INACTIVE;

  constructor(name = "") {
    this.name = name || this.constructor.name;
  }

  activate(): void {
    this.status = GoalStatus.ACTIVE;
  }

  abstract process(): GoalStatus;

  terminate(): void {}

  suspend(): void {
    this.status = GoalStatus.SUSPENDED;
  }

  reactivate(): void {
    if (this.status === GoalStatus.SUSPENDED) this.status = GoalStatus.ACTIVE;
  }

  handleMessage(_msg: Message): boolean {
    return false;
  }

  protected ensureActive(): void {
    if (this.status === GoalStatus.INACTIVE) this.activate();
    else if (this.status === GoalStatus.SUSPENDED) this.reactivate();
  }
}

export class CompositeGoal extends Goal {
  subgoals: Goal[] = [];
  private front: Goal | null = null;

  addSubgoal(goal: Goal): void {
    this.subgoals.unshift(goal); // na frente: preempta
  }

  addSubgoalBack(goal: Goal): void {
    this.subgoals.push(goal);
  }

  processSubgoals(): GoalStatus {
    while (this.subgoals.length) {
      const front = this.subgoals[0];
      if (this.front && this.front !== front && this.front.status === GoalStatus.ACTIVE) {
        this.front.suspend();
      }
      (front as unknown as { ensureActive(): void }).ensureActive?.();
      if (front.status === GoalStatus.INACTIVE) front.activate();
      else if (front.status === GoalStatus.SUSPENDED) front.reactivate();
      const status = front.process();
      if (status === GoalStatus.COMPLETED || status === GoalStatus.FAILED) {
        front.terminate();
        this.subgoals.shift();
        this.front = null;
        if (status === GoalStatus.FAILED) return GoalStatus.FAILED;
        if (this.subgoals.length) return GoalStatus.ACTIVE;
        return GoalStatus.COMPLETED;
      }
      this.front = front;
      return status;
    }
    return GoalStatus.COMPLETED;
  }

  process(): GoalStatus {
    this.status = this.processSubgoals();
    return this.status;
  }

  terminate(): void {
    for (const g of this.subgoals) g.terminate();
    this.subgoals = [];
    this.front = null;
  }

  handleMessage(msg: Message): boolean {
    return this.subgoals.length ? this.subgoals[0].handleMessage(msg) : false;
  }
}

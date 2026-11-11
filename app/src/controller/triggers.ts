// Triggers com regulador de frequencia.

import type { Message } from "./goals";

export abstract class Trigger {
  name: string;
  intervalMs: number;
  active = true;
  expired = false;
  private nextAt = 0;

  constructor(intervalMs = 1000, name = "") {
    this.intervalMs = intervalMs;
    this.name = name || this.constructor.name;
  }

  ready(now = Date.now()): boolean {
    if (now >= this.nextAt) {
      this.nextAt = now + this.intervalMs;
      return true;
    }
    return false;
  }

  abstract update(): void;

  onRemove(): void {}

  handleMessage(_msg: Message): boolean {
    return false;
  }
}

export class TriggerManager {
  triggers: Trigger[] = [];

  add(t: Trigger): void {
    this.triggers.push(t);
  }

  update(now = Date.now()): void {
    for (const t of [...this.triggers]) {
      if (t.expired) {
        t.onRemove();
        this.triggers.splice(this.triggers.indexOf(t), 1);
      } else if (t.active && t.ready(now)) {
        t.update();
      }
    }
  }

  dispatch(msg: Message): void {
    for (const t of this.triggers) if (t.handleMessage(msg)) return;
  }
}

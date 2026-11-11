// Orquestrador multi-instancia.

import type { Config } from "./config";
import { Instance } from "./instance";
import { ProcessScanner } from "./processscanner";
import { InstanceState, TICK_MS } from "./statemachine";

const STARTING_STATES = [
  InstanceState.STARTING,
  InstanceState.ONLINE,
  InstanceState.CONNECTING,
  InstanceState.CONNECTED,
  InstanceState.PREPARING,
];

export class Orchestrator {
  instances: Instance[];
  scanner: ProcessScanner;
  private lastStartAt = 0;
  private running = false;

  constructor(public config: Config) {
    this.instances = config.accounts.map((a) => new Instance(a, this));
    this.scanner = new ProcessScanner(
      undefined,
      (pid) => this.onProcessStarted(pid),
      (pid) => this.onProcessExited(pid),
    );
  }

  mayStart(_inst: Instance): boolean {
    const active = this.instances.filter((i) => STARTING_STATES.includes(i.state)).length;
    if (active >= this.config.settings.maxInstance) return false;
    if (Date.now() - this.lastStartAt < this.config.settings.spacingMs) return false;
    return true;
  }

  markStarted(_inst: Instance): void {
    this.lastStartAt = Date.now();
  }

  private onProcessStarted(_pid: number): void {
    // gancho: correlacionar pid -> instancia (por vmName/janela) fica na impl do emulador
  }

  private onProcessExited(pid: number): void {
    for (const inst of this.instances) {
      if (inst.emulator.pid === pid) {
        inst.emulator.pid = null;
        inst.emulatorUp = false;
      }
    }
  }

  enableAll(): void {
    for (const i of this.instances) i.enable();
  }
  disableAll(): void {
    for (const i of this.instances) i.disable();
  }

  async run(tickMs = TICK_MS): Promise<void> {
    this.running = true;
    while (this.running) {
      const started = Date.now();
      await this.scanner.scan();
      await Promise.all(this.instances.map((i) => i.tick()));
      const elapsed = Date.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, tickMs - elapsed)));
    }
    for (const i of this.instances) i.teardownChannel();
  }

  stop(): void {
    this.running = false;
  }
}

// Maquina de estados por instancia.
// Numeracao e tempos observados ao vivo.

import type { Message } from "./goals";

export enum InstanceState {
  ERROR = -1,
  OFFLINE = 0,
  WAITING = 1,
  STARTING = 2,
  RESTARTING = 3,
  ONLINE = 4,
  CONNECTING = 5,
  CONNECTED = 6,
  PREPARING = 7,
  RUNNING = 8,
  IDLE = 9,
}

export const TICK_MS = 500;
export const STARTING_TIMEOUT_MS = 20000;
export const CONNECTING_TIMEOUT_MS = 30000;
export const PREPARING_TIMEOUT_MS = 600000;
export const RUNNING_HEARTBEAT_MS = 120000;
export const HANDSHAKE_MS = 5000;

export interface State<I> {
  stateId: InstanceState;
  enter?(inst: I): void;
  execute(inst: I): void;
  exit?(inst: I): void;
  onMessage?(inst: I, msg: Message): boolean;
}

export class StateMachine<I> {
  current: InstanceState;
  previous: InstanceState;
  enteredAt = Date.now();

  constructor(
    public states: Map<InstanceState, State<I>>,
    public globalState: State<I> | null = null,
    initial: InstanceState = InstanceState.OFFLINE,
  ) {
    this.current = initial;
    this.previous = initial;
  }

  get timeInStateMs(): number {
    return Date.now() - this.enteredAt;
  }

  change(inst: I, next: InstanceState): void {
    if (next === this.current || !this.states.has(next)) return;
    this.states.get(this.current)!.exit?.(inst);
    this.previous = this.current;
    this.current = next;
    this.enteredAt = Date.now();
    this.states.get(next)!.enter?.(inst);
  }

  revert(inst: I): void {
    this.change(inst, this.previous);
  }

  update(inst: I): void {
    this.globalState?.execute(inst);
    this.states.get(this.current)!.execute(inst);
  }

  dispatch(inst: I, msg: Message): boolean {
    if (this.globalState?.onMessage?.(inst, msg)) return true;
    return this.states.get(this.current)!.onMessage?.(inst, msg) ?? false;
  }
}

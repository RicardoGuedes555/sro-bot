// Estados concretos da instancia.
// As decisoes usam flags em cache (emulatorUp, deviceOnline) que a Instance
// atualiza a cada tick, para o execute() ser sincrono.

import { GoalStatus } from "./goals";
import type { Instance } from "./instance";
import {
  CONNECTING_TIMEOUT_MS,
  InstanceState,
  PREPARING_TIMEOUT_MS,
  RUNNING_HEARTBEAT_MS,
  STARTING_TIMEOUT_MS,
  type State,
} from "./statemachine";

export class GlobalState implements State<Instance> {
  stateId = InstanceState.OFFLINE;
  execute(inst: Instance): void {
    const sm = inst.sm;
    if (!inst.userEnabled && sm.current !== InstanceState.OFFLINE) {
      inst.log("desligado pelo usuario");
      sm.change(inst, InstanceState.OFFLINE);
      return;
    }
    const down = [InstanceState.CONNECTED, InstanceState.PREPARING, InstanceState.RUNNING];
    if (down.includes(sm.current) && !inst.emulatorUp) {
      inst.log("emulador caiu");
      sm.change(inst, InstanceState.CONNECTING);
    }
  }
}

class Offline implements State<Instance> {
  stateId = InstanceState.OFFLINE;
  enter(inst: Instance): void {
    inst.teardownChannel();
  }
  execute(inst: Instance): void {
    if (inst.userEnabled) inst.sm.change(inst, InstanceState.WAITING);
  }
}

class Waiting implements State<Instance> {
  stateId = InstanceState.WAITING;
  execute(inst: Instance): void {
    if (inst.orchestrator && !inst.orchestrator.mayStart(inst)) return;
    inst.sm.change(inst, InstanceState.STARTING);
  }
}

class Starting implements State<Instance> {
  stateId = InstanceState.STARTING;
  enter(inst: Instance): void {
    inst.orchestrator?.markStarted(inst);
    void inst.emulator.launch();
  }
  execute(inst: Instance): void {
    if (inst.emulatorUp) inst.sm.change(inst, InstanceState.ONLINE);
    else if (inst.sm.timeInStateMs >= STARTING_TIMEOUT_MS) {
      inst.log("start nao respondeu em 20 s, volta para offline");
      inst.sm.change(inst, InstanceState.OFFLINE);
    }
  }
}

class Online implements State<Instance> {
  stateId = InstanceState.ONLINE;
  execute(inst: Instance): void {
    inst.sm.change(inst, InstanceState.CONNECTING);
  }
}

class Connecting implements State<Instance> {
  stateId = InstanceState.CONNECTING;
  execute(inst: Instance): void {
    if (inst.deviceOnline) inst.sm.change(inst, InstanceState.CONNECTED);
    else if (inst.sm.timeInStateMs >= CONNECTING_TIMEOUT_MS) {
      inst.log("device nao respondeu em 30 s, reiniciando");
      inst.sm.change(inst, InstanceState.RESTARTING);
    }
  }
}

class Connected implements State<Instance> {
  stateId = InstanceState.CONNECTED;
  execute(inst: Instance): void {
    inst.sm.change(inst, InstanceState.PREPARING);
  }
}

class Preparing implements State<Instance> {
  stateId = InstanceState.PREPARING;
  enter(inst: Instance): void {
    inst.startPreparation();
  }
  execute(inst: Instance): void {
    const status = inst.tickPreparation();
    if (status === GoalStatus.COMPLETED) inst.sm.change(inst, InstanceState.RUNNING);
    else if (status === GoalStatus.FAILED) {
      inst.log("preparacao falhou");
      inst.sm.change(inst, InstanceState.ERROR);
    } else if (inst.sm.timeInStateMs >= PREPARING_TIMEOUT_MS) {
      inst.log("preparacao passou de 10 min, reconectando");
      inst.sm.change(inst, InstanceState.CONNECTING);
    }
  }
}

class Running implements State<Instance> {
  stateId = InstanceState.RUNNING;
  enter(inst: Instance): void {
    inst.markHeartbeat();
    inst.buildActivities(); // monta os goals das atividades (idempotente)
  }
  execute(inst: Instance): void {
    inst.runAi();
    if (Date.now() - inst.lastHeartbeat >= RUNNING_HEARTBEAT_MS) {
      inst.log("sem heartbeat do engine por 120 s, reiniciando");
      inst.sm.change(inst, InstanceState.RESTARTING);
    }
  }
  onMessage(inst: Instance): boolean {
    inst.markHeartbeat();
    return false;
  }
}

class Restarting implements State<Instance> {
  stateId = InstanceState.RESTARTING;
  enter(inst: Instance): void {
    inst.teardownChannel();
    if (inst.emulator.canRestart()) void inst.emulator.quit(true);
  }
  execute(inst: Instance): void {
    inst.sm.change(inst, InstanceState.STARTING);
  }
}

class ErrorState implements State<Instance> {
  stateId = InstanceState.ERROR;
  enter(inst: Instance): void {
    inst.teardownChannel();
  }
  execute(): void {}
}

class Idle implements State<Instance> {
  stateId = InstanceState.IDLE;
  execute(): void {}
}

export function defaultStates(): Map<InstanceState, State<Instance>> {
  const list: State<Instance>[] = [
    new Offline(),
    new Waiting(),
    new Starting(),
    new Online(),
    new Connecting(),
    new Connected(),
    new Preparing(),
    new Running(),
    new Restarting(),
    new ErrorState(),
    new Idle(),
  ];
  return new Map(list.map((s) => [s.stateId, s]));
}

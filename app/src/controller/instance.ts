// Instancia: junta emulador, adb, canal, maquina de estados e IA
// tick() e async: atualiza caches e bombeia
// mensagens, depois roda o update sincrono da maquina de estados.

import {
  type Combat,
  DemonLockingTowerGoal,
  type PlayerSnapshot,
  type TowerIo,
  buildActivity,
  snapshotFromEngine,
} from "./activities";
import { Adb } from "./adb";
import type { AccountConfig } from "./config";
import { EngineChannel, requestOnce } from "./enginechannel";
import { CompositeGoal, type Goal, GoalStatus } from "./goals";
import { LdPlayer } from "./ldplayer";
import type { Orchestrator } from "./orchestrator";
import { HANDSHAKE_MS, InstanceState, StateMachine } from "./statemachine";
import { defaultStates, GlobalState } from "./states";
import { readTowerSnapshot, type TowerSnapshot } from "./tower";
import { TriggerManager } from "./triggers";

export class Instance {
  name: string;
  emulator: LdPlayer;
  adb: Adb | null = null;
  channel: EngineChannel | null = null;
  sm: StateMachine<Instance>;
  ai = new CompositeGoal("root");
  triggers = new TriggerManager();
  preparation: Goal | null = null;

  userEnabled = false;
  emulatorUp = false;
  deviceOnline = false;
  lastHeartbeat = 0;
  lastPlayer: PlayerSnapshot | null = null;
  lastTower: TowerSnapshot | null = null;
  private activitiesBuilt = false;

  constructor(public config: AccountConfig, public orchestrator: Orchestrator | null = null) {
    this.name = config.name;
    this.emulator = new LdPlayer(config.emulator);
    this.sm = new StateMachine(defaultStates(), new GlobalState());
  }

  enable(): void {
    this.userEnabled = true;
  }
  disable(): void {
    this.userEnabled = false;
  }

  async tick(): Promise<void> {
    this.emulatorUp = await this.emulator.isRunning().catch(() => false);
    this.deviceOnline = this.channel?.connected ? true : await this.probeDevice();
    this.pumpMessages();
    await this.refreshTower();
    this.sm.update(this);
  }

  // O goal da torre decide pelo estado do evento, lido por getv/GETP em
  // conexoes proprias (o canal persistente nao casa resposta com pedido). So le
  // com ele na frente: cada snapshot sao ~15 idas e voltas.
  private async refreshTower(): Promise<void> {
    const ch = this.channel;
    if (!ch?.connected || !(this.ai.subgoals[0] instanceof DemonLockingTowerGoal)) {
      this.lastTower = null;
      return;
    }
    this.lastTower = await readTowerSnapshot((tag, body) => requestOnce(ch.host, ch.port, tag, body));
  }

  private async probeDevice(): Promise<boolean> {
    try {
      const adb = this.ensureAdb();
      await adb.connect();
      return await adb.isOnline();
    } catch {
      return false;
    }
  }

  private ensureAdb(): Adb {
    if (!this.adb) this.adb = new Adb(this.emulator.adbSerial());
    return this.adb;
  }

  private pumpMessages(): void {
    if (!this.channel?.connected) return;
    for (const msg of this.channel.poll()) {
      this.markHeartbeat();
      if (msg.tag === "RESP" && msg.payload && "player" in msg.payload) {
        this.lastPlayer = snapshotFromEngine(msg.payload.player);
      }
      if (this.sm.dispatch(this, msg)) continue;
      if (this.ai.handleMessage(msg)) continue;
      this.triggers.dispatch(msg);
    }
  }

  // Monta os goals das atividades do accounts.json dentro do this.ai. Idempotente:
  // so monta uma vez. O combate liga o auto-battle pelo canal (comando SKIL); a
  // fonte de estado e o ultimo RESP do engine.
  buildActivities(): void {
    if (this.activitiesBuilt) return;
    this.activitiesBuilt = true;
    const combat: Combat = {
      setAutoFight: (on: boolean) => {
        try {
          this.channel?.send("SKIL", { on: on ? 1 : 0 });
        } catch {
          /* canal caiu; o proximo tick reconecta */
        }
      },
    };
    // Demon Locking Tower: comandos crus (calls/callsn) pelo canal; o estado
    // vem do snapshot que o tick atualiza.
    const tower: TowerIo = {
      send: (tag: string, body: string) => {
        try {
          this.channel?.sendRaw(tag, body);
        } catch {
          /* canal caiu; o proximo tick reconecta */
        }
      },
      state: () => this.lastTower,
    };
    const source = () => this.lastPlayer;
    for (const name of this.config.activities) {
      const goal = buildActivity(name, combat, source, tower);
      if (goal) this.ai.addSubgoalBack(goal);
      else this.log(`atividade sem goal ainda: ${name}`);
    }
  }

  async connectChannel(port: number): Promise<boolean> {
    this.channel = new EngineChannel("127.0.0.1", port);
    return this.channel.connect(HANDSHAKE_MS);
  }

  teardownChannel(): void {
    this.channel?.close();
    this.channel = null;
    this.lastPlayer = null;
    this.lastTower = null;
    this.ai.terminate(); // limpa os goals; serao remontados no proximo Running
    this.activitiesBuilt = false;
  }

  startPreparation(): void {
    this.preparation = new CompositeGoal("preparacao");
    this.preparation.activate();
  }

  tickPreparation(): GoalStatus {
    return this.preparation ? this.preparation.process() : GoalStatus.COMPLETED;
  }

  runAi(): void {
    this.ai.process();
    this.triggers.update();
  }

  markHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  get state(): InstanceState {
    return this.sm.current;
  }

  log(message: string): void {
    console.log(`[${this.name}] ${InstanceState[this.state]}: ${message}`);
  }
}

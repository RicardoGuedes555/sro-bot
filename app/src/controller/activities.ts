// Atividades do bot como goals. A primeira e o treino: manter o auto-battle do
// jogo ligado enquanto o char esta em mundo e vivo. O combate em si e do jogo
// (o engine so liga o auto-battle por codigo, comando SKIL); aqui fica a decisao
// de quando ligar e quando parar.
//
// A logica e desacoplada do engine por duas interfaces (Combat e PlayerSource)
// para poder ser testada sem device. A impl concreta que fala com o engine pelo
// canal entra na fiacao da Instance.

import { type ContinentalConfig, ContinentalDriver, type ContinentalSnapshot, DEFAULT_CONTINENTAL_CONFIG } from "./continental";
import { Goal, GoalStatus } from "./goals";
import { DEFAULT_TOWER_CONFIG, type DemonTowerConfig, TowerDriver, type TowerSnapshot } from "./tower";

export interface PlayerSnapshot {
  ok: boolean;
  inWorld: boolean; // ok e com objeto de jogador (em mundo, nao no titulo)
  dead: boolean;
  inCombat: boolean;
  hp: number;
  maxHp: number;
}

// O que o engine faz no combate. A impl real manda o comando SKIL pelo canal.
export interface Combat {
  setAutoFight(on: boolean): void;
}

// Fonte do ultimo estado do jogador. A impl real le o RESP do engine.
export type PlayerSource = () => PlayerSnapshot | null;

// Converte o objeto "player" do RESP do engine num snapshot. Fora de mundo o
// engine devolve {ok:false}; em mundo vem ok:true com os campos.
export function snapshotFromEngine(player: unknown): PlayerSnapshot | null {
  if (!player || typeof player !== "object") return null;
  const p = player as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const ok = p.ok === true;
  return {
    ok,
    inWorld: ok, // o engine so devolve ok:true quando ha objeto de jogador (em mundo)
    dead: p.dead === true,
    inCombat: p.inCombat === true,
    hp: num(p.hp),
    maxHp: num(p.maxHp),
  };
}

// Goal de treino: mantem o auto-battle ligado enquanto em mundo e vivo. E longo,
// nunca conclui sozinho (roda ate ser preemptado por outro goal ou terminado).
export class AutoBattleGoal extends Goal {
  private autoFightOn = false;

  constructor(
    private combat: Combat,
    private player: PlayerSource,
    name = "treino",
  ) {
    super(name);
  }

  process(): GoalStatus {
    this.ensureActive();
    const p = this.player();

    // Fora de mundo (titulo/login) ou sem leitura: espera, nada a fazer.
    if (!p || !p.ok || !p.inWorld) {
      this.autoFightOn = false;
      return GoalStatus.ACTIVE;
    }

    // Morto: o respawn e do jogo; ao voltar vivo o auto-battle e religado.
    if (p.dead) {
      this.autoFightOn = false;
      return GoalStatus.ACTIVE;
    }

    // Em mundo e vivo: garante o auto-battle ligado (uma vez; nao fica repetindo).
    if (!this.autoFightOn) {
      this.combat.setAutoFight(true);
      this.autoFightOn = true;
    }
    return GoalStatus.ACTIVE;
  }

  terminate(): void {
    if (this.autoFightOn) {
      this.combat.setAutoFight(false);
      this.autoFightOn = false;
    }
  }
}

// ---- Demon Locking Tower (evento tower-climb) ----
//
// A decisao fica em tower.ts (pura, guiada pelo estado lido do engine); o goal
// so liga as pontas: le o ultimo snapshot e manda o comando do passo.

// O que o goal precisa do engine. A impl real manda pelo canal e le o snapshot
// que a Instance atualiza a cada tick enquanto o goal esta na frente.
export interface TowerIo {
  send(tag: string, body: string): void;
  state(): TowerSnapshot | null;
}

export class DemonLockingTowerGoal extends Goal {
  private driver: TowerDriver;

  constructor(
    private io: TowerIo,
    cfg: DemonTowerConfig = DEFAULT_TOWER_CONFIG,
    private now: () => number = () => Date.now(),
    name = "demon-locking-tower",
  ) {
    super(name);
    this.driver = new TowerDriver(cfg);
  }

  process(): GoalStatus {
    this.ensureActive();
    const { step, send } = this.driver.next(this.io.state(), this.now());
    if (step.kind === "done") return GoalStatus.COMPLETED;
    if (step.kind === "act" && send) this.io.send(step.tag, step.body);
    return GoalStatus.ACTIVE;
  }

  terminate(): void {
    if (this.driver.autoFightOn) {
      this.io.send("SKIL", '{"on":0}');
      this.driver.autoFightOn = false;
    }
  }
}

// ---- Continental Exploration (tabuleiro de dado, SuperRisk) ----
//
// Mesmo desenho da torre: a decisao fica em continental.ts e o goal so liga as
// pontas. Falha (travado) encerra o goal como FAILED; reiniciar o jogo e do
// controlador.

export interface ContinentalIo {
  send(tag: string, body: string): void;
  state(): ContinentalSnapshot | null;
}

export class ContinentalExplorationGoal extends Goal {
  private driver: ContinentalDriver;

  constructor(
    private io: ContinentalIo,
    cfg: ContinentalConfig = DEFAULT_CONTINENTAL_CONFIG,
    private now: () => number = () => Date.now(),
    name = "continental-exploration",
  ) {
    super(name);
    this.driver = new ContinentalDriver(cfg);
  }

  process(): GoalStatus {
    this.ensureActive();
    const { step, send } = this.driver.next(this.io.state(), this.now());
    if (step.kind === "done") return GoalStatus.COMPLETED;
    if (step.kind === "fail") return GoalStatus.FAILED;
    if (step.kind === "act" && send) this.io.send(step.tag, step.body);
    return GoalStatus.ACTIVE;
  }
}

// Monta o goal de uma atividade pelo nome do accounts.json. Retorna null para
// atividade ainda nao implementada (daily e os eventos: Qin Tomb War, Qigong,
// Horse Racing).
export function buildActivity(
  name: string,
  combat: Combat,
  player: PlayerSource,
  tower?: TowerIo,
  continental?: ContinentalIo,
): Goal | null {
  switch (name) {
    case "train":
      return new AutoBattleGoal(combat, player);
    case "demon_locking_tower":
    case "demontower":
      return tower ? new DemonLockingTowerGoal(tower) : null;
    case "continental_exploration":
    case "continental":
      return continental ? new ContinentalExplorationGoal(continental) : null;
    default:
      return null;
  }
}

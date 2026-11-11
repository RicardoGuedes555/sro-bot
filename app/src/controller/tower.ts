// Demon Locking Tower 100% por metodo e guiado por estado (sem tap, sem espera
// por tempo): le o estado do evento pelo engine e escolhe UMA acao por vez.
// Logica pura; quem chama (main ou goal do controlador) faz as leituras com
// readTowerSnapshot e manda o comando devolvido.
//
// Estado mapeado ao vivo (engine OBJV/GETP/getv, 2026-11-05):
//   Na torre            -> XScene._scene_type 16, _scene_id 102000 + andar
//   Modo sono           -> XSleepModeUI visivel (o jogo escurece a tela parado)
//   Resumo pos-sono     -> XBattleRewardDlg visivel ("Summary of Sleep Mode")
//   Dialogo da torre    -> ActivityTeamTowerSingleDlg.IsVisible
//   Resultado do sweep  -> m_uiBehaviour.mSweepResult visivel, multiple real em
//                          _doc._SingleTowerData.refreshResult (Single); o label
//                          mRewardAlpha anima valores aleatorios ate fixar nele
//   Popup do sweep      -> m_uiBehaviour.mSweepFrame ativo
//   First Bonus         -> HasFirstRewardRedPoint(); painel mFirstPassPanel
//   Andar mais alto     -> _SingleTowerData.maxlevel; topo em _tower_max_floor
//   Dados carregados    -> refreshResult != 0 (vale 1.0 no minimo). Aberto logo
//                          depois do login, o dialogo ficou 90 s sem dados
//                          (maxlevel 0, label "Sweep (1/1)" do prefab) e a
//                          entrada era recusada; fechar e reabrir carregou.
//   Queda (LOSE)        -> XLevelRewardView visivel com o handler ativo
//                          (_DlgHandler) sendo o _StageFailHandler, na torre.
//                          O _doc.IsStageFailed NAO serve (vem false na queda, e
//                          o IsWin fica true da ultima vitoria). O jogo fica
//                          parado no LOSE (Return / Challenge again =
//                          OnReturnButtonClicked / OnRetryClicked do handler).
//                          Vitoria passa sozinha (Continue 5s).

export interface DemonTowerConfig {
  refreshOnFailure: boolean; // CHK_REFRESH: "Challenge again" no andar em que caiu (ate 2x)
  sweep: boolean; // CHK_SWEEP: usa o Sweep (do Floor 1 ao andar mais alto)
  fightOnceBeforeSweeping: boolean; // CHK_FIGHT: entra 1x antes de sweepar
  refreshRewardRatio: number; // STC_RESULT: rerola a recompensa do sweep ate o multiple >= isto (0 = nao rerola)
  useBuff: boolean; // CHK_BUFF: volta a area segura e usa buffs (TODO)
}

export const DEFAULT_TOWER_CONFIG: DemonTowerConfig = {
  refreshOnFailure: true,
  sweep: true,
  fightOnceBeforeSweeping: true,
  refreshRewardRatio: 1.3,
  useBuff: true,
};

export const TOWER_SCENE_TYPE = 16;
// Quedas no mesmo andar refeitas com refreshOnFailure antes de voltar
// ("falhou mais de 2x, desiste").
export const TOWER_MAX_RETRIES = 2;
// Entrar sem a cena da torre carregar depois disso conta como entrada recusada.
export const ENTER_TIMEOUT_MS = 30000;
const MAX_REFUSED_ENTERS = 3;
const MAX_RELOADS = 3;
// Tempo pros dados chegarem depois de abrir (ao vivo chegam em 1 a 3 s).
export const DATA_WAIT_MS = 6000;

export interface TowerSnapshot {
  inWorld: boolean; // jogador em mundo (CONN ok); falso no loading entre andares
  autoPlay: boolean; // auto-hunt do jogo ligado
  dead: boolean;
  sceneType: number;
  sceneId: number;
  stageFailed: boolean; // tela LOSE na torre
  sleeping: boolean;
  summary: boolean;
  dialog: boolean;
  dataReady: boolean; // dados da torre chegaram do servidor
  // Campos abaixo so valem com o dialogo na tela (fechado, o jogo nao atualiza
  // e o HasFirstRewardRedPoint fica velho).
  sweepResult: boolean;
  sweepFrame: boolean;
  firstPassPanel: boolean;
  firstPassRed: boolean;
  inSweeping: boolean;
  maxLevel: number;
  topFloor: number;
  multiple: number;
  multipleText: string;
  freeRefreshes: number; // -1 = nao lido
  sweepsLeft: number; // -1 = nao lido
}

export function emptyTowerSnapshot(): TowerSnapshot {
  return {
    inWorld: false, autoPlay: false, dead: false, sceneType: -1, sceneId: -1, stageFailed: false, sleeping: false, summary: false,
    dialog: false, dataReady: false, sweepResult: false, sweepFrame: false, firstPassPanel: false, firstPassRed: false,
    inSweeping: false, maxLevel: -1, topFloor: -1, multiple: 0, multipleText: "", freeRefreshes: -1,
    sweepsLeft: -1,
  };
}

export function inTower(s: TowerSnapshot): boolean {
  return s.sceneType === TOWER_SCENE_TYPE;
}

export function towerFloor(s: TowerSnapshot): number {
  return inTower(s) ? s.sceneId % 1000 : 0;
}

// GETP devolve o campo Single como os 32 bits crus no "int".
export function f32FromBits(bits: number): number {
  const b = Buffer.alloc(4);
  b.writeInt32LE(bits | 0);
  return b.readFloatLE(0);
}

// Texto que o label do multiple mostra quando para de animar ("1.3x").
export function multipleLabel(m: number): string {
  return `${m.toFixed(1)}x`;
}

// Primeiro numero de "N/M" (tirando a cor do NGUI): "4/5" -> 4. -1 se nao achar.
export function leftOf(label: string): number {
  const m = /(\d+)\s*\/\s*\d+/.exec(label.replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, ""));
  return m ? Number(m[1]) : -1;
}

// Sweeps restantes pelo label mResetNum, so no formato do dialogo
// ("Sweep[6acb3b] 0/1"). O mesmo label e reusado na batalha e, reaberto pelo
// bot logo depois do Return, ficou minutos em "Sweep (1/1)" com o sweep do dia
// ja usado. Fora do formato: -1 (nao sabe).
export function sweepsLeftOf(label: string): number {
  const m = /^Sweep\[[0-9A-Fa-f]{6}\]\s*(\d+)\s*\/\s*\d+/.exec(label.trim());
  return m ? Number(m[1]) : -1;
}

export type TowerAction =
  | "autofight" | "retry" | "return" | "wake" | "summary" | "open" | "refresh" | "getreward" | "closesweep"
  | "takeall" | "closefirst" | "showfirst" | "enter" | "sweep" | "reload" | "close";

export type TowerStep =
  | { kind: "done"; reason: string }
  | { kind: "wait"; reason: string }
  | { kind: "act"; id: TowerAction; name: string; tag: string; body: string; cooldownMs?: number };

const DLG = "ActivityTeamTowerSingleDlg";
const BEH = `${DLG} m_uiBehaviour`;
const DATA = `${DLG} _doc _SingleTowerData`;

function act(id: TowerAction, name: string, body: string, cooldownMs?: number): TowerStep {
  return { kind: "act", id, name, tag: "SKIL", body, cooldownMs };
}

// O que o ciclo ja fez. Atualizado por trackTower (transicoes de cena e tela
// LOSE) e afterTowerAction (acao mandada).
export interface TowerProgress {
  entries: number; // vezes que entrou na torre neste ciclo
  inside: boolean;
  floor: number; // andar mais alto visto na torre
  failures: number; // quedas (LOSE) nesse andar
  loseSeen: boolean; // a tela LOSE atual ja foi contada
  lastMaxLevel: number; // ultimo maxlevel lido com o dialogo na tela
  levelAtEntry: number;
  enterSentAt: number | null; // null = nenhuma entrada pendente
  refusedEnters: number;
  sweepSent: boolean; // um sweep por ciclo, mesmo que o label minta
  reloads: number; // vezes que fechou o dialogo pra recarregar (sem dados ou label velho)
  dialogShownAt: number | null; // quando o dialogo apareceu
  dialogMs: number; // ha quanto tempo o dialogo esta na tela
  closeSent: boolean; // mandou fechar o dialogo; conclui quando ele sumir
}

export function newTowerProgress(): TowerProgress {
  return {
    entries: 0, inside: false, floor: 0, failures: 0, loseSeen: false, lastMaxLevel: -1,
    levelAtEntry: -1, enterSentAt: null, refusedEnters: 0, sweepSent: false, reloads: 0,
    dialogShownAt: null, dialogMs: 0, closeSent: false,
  };
}

export function trackTower(p: TowerProgress, s: TowerSnapshot | null, now: number): TowerProgress {
  if (!s) return p;
  const out = { ...p };
  if (inTower(s)) {
    if (!out.inside) {
      out.inside = true;
      out.entries++;
      out.levelAtEntry = out.lastMaxLevel;
      out.enterSentAt = null;
      out.refusedEnters = 0;
    }
    if (towerFloor(s) > out.floor) {
      out.floor = towerFloor(s);
      out.failures = 0;
    }
    if (s.stageFailed && !out.loseSeen) out.failures++;
    if (s.inWorld) out.loseSeen = s.stageFailed;
    return out;
  }
  if (!s.inWorld) return out; // loading: nao decide nada
  out.inside = false;
  if (s.dialog) {
    if (out.dialogShownAt === null) out.dialogShownAt = now;
    out.dialogMs = now - out.dialogShownAt;
  } else {
    out.dialogShownAt = null;
    out.dialogMs = 0;
  }
  if (out.enterSentAt !== null && now - out.enterSentAt >= ENTER_TIMEOUT_MS) {
    out.enterSentAt = null;
    out.refusedEnters++;
  }
  if (s.dialog && s.maxLevel >= 0) out.lastMaxLevel = s.maxLevel;
  return out;
}

export function afterTowerAction(p: TowerProgress, id: TowerAction, now: number): TowerProgress {
  if (id === "enter") return { ...p, enterSentAt: now };
  if (id === "sweep") return { ...p, sweepSent: true };
  if (id === "reload") return { ...p, reloads: p.reloads + 1 };
  if (id === "close") return { ...p, closeSent: true };
  return p;
}

// Sweep ligado e Floor 1 ja passado: a luta e so a "1x antes de sweepar".
function sweepMode(cfg: DemonTowerConfig, maxLevel: number): boolean {
  return cfg.sweep && maxLevel >= 1;
}

// Uma entrada por ciclo: a subida vai andar a andar sozinha ate cair, e a
// queda se refaz la dentro com "Challenge again".
function wantsClimb(s: TowerSnapshot, cfg: DemonTowerConfig, p: TowerProgress): boolean {
  if (p.entries > 0 || p.enterSentAt !== null) return false;
  if (p.refusedEnters >= MAX_REFUSED_ENTERS) return false;
  if (s.topFloor > 0 && s.maxLevel >= s.topFloor) return false;
  // O Sweep so libera depois de passar o Floor 1 lutando.
  if (sweepMode(cfg, s.maxLevel)) return cfg.fightOnceBeforeSweeping;
  return true;
}

function towerStep(s: TowerSnapshot, cfg: DemonTowerConfig, p: TowerProgress): TowerStep {
  if (!s.inWorld) return { kind: "wait", reason: `carregando o andar ${towerFloor(s)}` };
  if (s.stageFailed) {
    if (s.sleeping) return act("wake", "sair do modo sono", "calls XSleepModeUI SetVisible 1 0");
    if (s.summary) return act("summary", "fechar o resumo", "callsn XBattleRewardDlg _OnClicked2 1");
    const retry = cfg.refreshOnFailure && !sweepMode(cfg, p.levelAtEntry) && p.failures <= TOWER_MAX_RETRIES;
    if (retry)
      return act("retry", `Challenge again no andar ${towerFloor(s)} (queda ${p.failures})`,
        "callp XLevelRewardView _StageFailHandler OnRetryClicked 1", 10000);
    return act("return", `Return (caiu no andar ${towerFloor(s)})`,
      "callp XLevelRewardView _StageFailHandler OnReturnButtonClicked 1", 10000);
  }
  // Morto antes do LOSE aparecer: o auto-hunt desliga sozinho, nao religa.
  if (s.dead) return { kind: "wait", reason: `caiu no andar ${towerFloor(s)}` };
  if (!s.autoPlay) return act("autofight", "ligar o auto-hunt", '{"on":1}');
  return { kind: "wait", reason: `subindo, andar ${towerFloor(s)}` };
}

// Ordem importa: o que fica POR CIMA (sono, resumo, frames do dialogo) sai
// primeiro, senao o handler e chamado com a tela errada e lanca excecao.
export function nextTowerStep(s: TowerSnapshot | null, cfg: DemonTowerConfig, p: TowerProgress): TowerStep {
  if (!s) return { kind: "wait", reason: "engine fora" };
  if (inTower(s)) return towerStep(s, cfg, p);
  if (!s.inWorld) return { kind: "wait", reason: "fora de mundo" };
  // O fechar pode nao pegar durante a animacao de abrir: repete ate sumir.
  if (p.closeSent)
    return s.dialog
      ? act("close", "fechar o dialogo", `callsn ${DLG} OnCloseDlg 1`, 3000)
      : { kind: "done", reason: "ciclo concluido" };
  if (p.enterSentAt !== null) return { kind: "wait", reason: "entrando na torre" };
  if (s.sleeping) return act("wake", "sair do modo sono", "calls XSleepModeUI SetVisible 1 0");
  if (s.summary) return act("summary", "fechar o resumo", "callsn XBattleRewardDlg _OnClicked2 1");
  // Logo depois de fechar outra janela o SetVisible pode nao pegar: repete.
  if (!s.dialog) return act("open", "abrir o dialogo", `calls ${DLG} SetVisible 2 1 1`, 3000);
  if (!s.dataReady) {
    if (p.dialogMs < DATA_WAIT_MS) return { kind: "wait", reason: "esperando os dados da torre" };
    if (p.reloads < MAX_RELOADS)
      return act("reload", "reabrir o dialogo (dados da torre nao chegaram)", `callsn ${DLG} OnCloseDlg 1`);
    return act("close", "fechar o dialogo (dados da torre nao chegaram)", `callsn ${DLG} OnCloseDlg 1`);
  }
  if (s.sweepResult) {
    const reroll = cfg.refreshRewardRatio > 0 && s.multiple < cfg.refreshRewardRatio - 1e-3;
    if (reroll && s.freeRefreshes > 0) {
      if (s.multipleText !== multipleLabel(s.multiple)) return { kind: "wait", reason: "multiple animando" };
      return act("refresh", `free refresh (${multipleLabel(s.multiple)}, ${s.freeRefreshes} gratis)`,
        `callsn ${DLG} OnRefreshReward 1`, 4000);
    }
    return act("getreward", `pegar a recompensa do sweep em ${multipleLabel(s.multiple)}`,
      `callsn ${DLG} OnGetReward 1`);
  }
  if (s.sweepFrame) return act("closesweep", "fechar o popup do sweep", `callsn ${DLG} OnCloseSweep 1`);
  if (s.firstPassPanel) {
    if (s.firstPassRed) return act("takeall", "Receive all do First Bonus", `callsn ${DLG} _OnFirstPassRewardTakeAlLClicked 1`);
    return act("closefirst", "fechar o First Bonus", `callsn ${DLG} _OnCloseFirstRewardClicked 1`);
  }
  if (s.firstPassRed) return act("showfirst", "abrir o First Bonus", `callsn ${DLG} OnShowFirstPassReward 1`);
  if (wantsClimb(s, cfg, p))
    return act("enter", `entrar na torre (andar ${s.maxLevel + 1})`, `callsn ${DLG} OnEnterBattle 1`, ENTER_TIMEOUT_MS);
  // Sweep cobre do Floor 1 ao mais alto, entao vem depois de subir. A
  // recompensa so sai quando o sweep termina: fica pro proximo ciclo.
  if (cfg.sweep && !p.sweepSent && !s.inSweeping && s.maxLevel >= 1) {
    if (s.sweepsLeft > 0) return act("sweep", `sweep do Floor 1 ao ${s.maxLevel}`, `callsn ${DLG} OnStartSweep 1`);
    // Label fora do formato: fechar e reabrir o dialogo atualiza (visto ao vivo).
    if (s.sweepsLeft < 0 && p.reloads < MAX_RELOADS)
      return act("reload", "reabrir o dialogo (contador do sweep velho)", `callsn ${DLG} OnCloseDlg 1`);
  }
  return act("close", "fechar o dialogo", `callsn ${DLG} OnCloseDlg 1`);
}

// Mesma acao repetida antes disso e ignorada: o handler leva alguns frames pra
// trocar a tela, e chamar de novo no meio duplica o pedido.
export const SAME_ACTION_COOLDOWN_MS = 5000;

// Junta progresso e cooldown: usado pelo runner do main e pelo goal do
// controlador. `send` diz se o comando do passo deve sair agora.
export class TowerDriver {
  progress = newTowerProgress();
  autoFightOn = false; // ligado por este ciclo (pra desligar no fim)
  private lastBody = "";
  private lastAt = 0;

  constructor(public cfg: DemonTowerConfig = DEFAULT_TOWER_CONFIG) {}

  next(s: TowerSnapshot | null, now: number): { step: TowerStep; send: boolean } {
    this.progress = trackTower(this.progress, s, now);
    const step = nextTowerStep(s, this.cfg, this.progress);
    if (step.kind !== "act") return { step, send: false };
    const cooldown = step.cooldownMs ?? SAME_ACTION_COOLDOWN_MS;
    if (step.body === this.lastBody && now - this.lastAt < cooldown) return { step, send: false };
    this.lastBody = step.body;
    this.lastAt = now;
    this.progress = afterTowerAction(this.progress, step.id, now);
    if (step.id === "autofight") this.autoFightOn = true;
    return { step, send: true };
  }
}

export type EngineQuery = (tag: string, body: string) => Promise<Record<string, unknown>>;

// Le o estado pelo engine. Null = engine fora. Na torre so le cena, jogador e a
// tela LOSE (o resto nao muda la dentro e cada leitura custa um ida-e-volta).
export async function readTowerSnapshot(q: EngineQuery): Promise<TowerSnapshot | null> {
  const s = emptyTowerSnapshot();
  const conn = await q("CONN", "");
  const player = conn.player as Record<string, unknown> | undefined;
  if (!player) return null;
  s.inWorld = player.ok === true;
  s.autoPlay = player.autoPlayOn === true;
  s.dead = player.dead === true;
  const int = async (tag: string, body: string, dflt: number) => {
    const r = await q(tag, body);
    return r.ok === true && typeof r.int === "number" ? r.int : dflt;
  };
  const bool = async (tag: string, body: string) => (await q(tag, body)).bool === true;
  const str = async (body: string) => {
    const r = await q("GETP", body);
    return typeof r.str === "string" ? r.str : "";
  };
  s.sceneType = await int("GETP", "XScene _scene_type", -1);
  s.sceneId = await int("GETP", "XScene _scene_id", -1);
  if (!s.inWorld) return s;
  if (inTower(s)) {
    // Campo ponteiro: o GETP devolve os 32 bits baixos, que bastam pra comparar
    // a identidade dos dois handlers.
    if (await bool("SKIL", "getv XLevelRewardView IsVisible")) {
      const active = await int("GETP", "XLevelRewardView _DlgHandler", 0);
      const fail = await int("GETP", "XLevelRewardView _StageFailHandler", -1);
      s.stageFailed = active !== 0 && active === fail;
    }
    if (s.stageFailed) {
      s.sleeping = await bool("SKIL", "getv XSleepModeUI IsVisible");
      s.summary = await bool("SKIL", "getv XBattleRewardDlg IsVisible");
    }
    return s;
  }
  s.sleeping = await bool("SKIL", "getv XSleepModeUI IsVisible");
  s.summary = await bool("SKIL", "getv XBattleRewardDlg IsVisible");
  s.dialog = await bool("SKIL", `getv ${DLG} IsVisible`);
  if (!s.dialog) return s;
  s.sweepResult = await bool("GETP", `${BEH} mSweepResult IsVisible`);
  s.sweepFrame = await bool("GETP", `${BEH} mSweepFrame get_gameObject get_activeInHierarchy`);
  s.firstPassPanel = await bool("GETP", `${BEH} mFirstPassPanel get_gameObject get_activeInHierarchy`);
  s.firstPassRed = await bool("SKIL", `getv ${DLG} HasFirstRewardRedPoint`);
  s.inSweeping = await bool("GETP", `${DLG} _in_sweeping`);
  s.maxLevel = await int("GETP", `${DATA} maxlevel`, -1);
  s.topFloor = await int("GETP", `${DLG} _tower_max_floor`, -1);
  s.sweepsLeft = sweepsLeftOf(await str(`${BEH} mResetNum GetText`));
  const multipleBits = await int("GETP", `${DATA} refreshResult`, 0);
  s.dataReady = multipleBits !== 0;
  if (s.sweepResult) {
    s.multiple = Math.round(f32FromBits(multipleBits) * 100) / 100;
    s.multipleText = await str(`${BEH} mRewardAlpha GetText`);
    s.freeRefreshes = leftOf(await str(`${BEH} mRewardFreeTime GetText`));
  }
  return s;
}

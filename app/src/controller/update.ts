// Atualizacao do jogo (hot update do launcher), 100% por metodo. Logica pura,
// sem IO; o main faz as leituras e manda o comando devolvido.
//
// Mapeado ao vivo (engine FIND/OBJV/ENUM, 2026-11-05), tudo no Core.dll (AOT),
// que ja existe antes do XMainClient carregar:
//   XUpdater.XUpdater (get_singleton): _phase (eUPdatePhase), _update_pakcage_size
//     (bytes do pacote), _remainingTime (estimativa do proprio jogo, em s),
//     _target_version. OnUpdateAssetConfirmCallBack() = Confirm do dialogo
//     "A new version ... is available"; OnRetry() = "Get check version failed
//     (Click retry)", recomeca o fluxo do zero.
//   XUpdater.XLoadingUI (get_singleton): mTotalProgress (barra, get_value 0..1),
//     mStatusText ("Downloading 13,7%... (66/488MB)"), mAppUpdateTransform
//     (dialogo de APK novo pela loja; o bot nao instala APK).

export const UPDATE_PHASE = {
  NONE: 0,
  PREPARE: 1,
  FETCH_CHECK_VERSION: 2,
  FETCH_UPDATE_VERSION: 3,
  LOAD_UPDATE_VERSION: 4,
  COMPARE_UPDATE_VERSION: 5,
  DOWNLOAD_CONFIRM: 6,
  APPSPLIT_PREPARE: 7,
  DOWNLOAD_BUNDLE: 8,
  EXTRACT_BUNDLE: 9,
  SHOW_VERSION: 10,
  FETCH_REGION: 11,
  LAUNCH_GAME: 12,
  ENDING: 13,
  FINISH: 14,
  ERROR: 15,
} as const;

const PHASE_NAMES: Record<number, string> = {
  1: "preparando",
  2: "checando versao",
  3: "buscando versao do servidor",
  4: "lendo versao nova",
  5: "comparando versoes",
  6: "confirmar atualizacao",
  7: "preparando pacotes",
  8: "baixando",
  9: "extraindo",
  10: "mostrando versao",
  11: "buscando regiao",
  12: "carregando o jogo",
  13: "finalizando",
};

export interface UpdateSnapshot {
  phase: number;
  // Fracao da barra total (0..1). undefined = nao lido.
  progress?: number;
  // Tamanho do pacote em bytes (0 = sem download nesta abertura).
  totalBytes?: number;
  // Estimativa do proprio jogo em segundos (a que ele mostra em "Estimated").
  gameEtaS?: number;
  // Texto da linha de status, so para o log.
  status?: string;
  // Dialogo de APK novo pela loja na tela.
  appUpdate?: boolean;
}

export type UpdateStep =
  | { kind: "none" }
  | { kind: "wait"; reason: string }
  | { kind: "act"; name: string; body: string; cooldownMs: number }
  | { kind: "fail"; reason: string };

// Leituras feitas pelo main (GETP). Floats chegam como bits no "int" do RESP.
export const UPDATE_PROBES = {
  phase: "XUpdater _phase",
  progress: "XLoadingUI mTotalProgress get_value",
  totalBytes: "XUpdater _update_pakcage_size",
  gameEta: "XUpdater _remainingTime",
  status: "XLoadingUI mStatusText GetText",
  appUpdate: "XLoadingUI mAppUpdateTransform get_gameObject get_activeInHierarchy",
} as const;

// O Confirm leva um frame pra trocar a fase; o retry refaz a checagem de versao,
// que leva alguns segundos ate falhar de novo (timeout do CDN ~5 s).
export const CONFIRM_COOLDOWN_MS = 5000;
export const RETRY_COOLDOWN_MS = 20000;

// O GETP devolve o campo float como os 32 bits crus em "int".
export function floatFromBits(bits: number): number {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setInt32(0, bits | 0);
  return dv.getFloat32(0);
}

// Atualizando = qualquer fase do launcher antes do fim (inclui o erro, que
// espera o retry). NONE e FINISH sao "nada a fazer".
export function updateActive(phase: number): boolean {
  return phase >= UPDATE_PHASE.PREPARE && phase <= UPDATE_PHASE.ENDING || phase === UPDATE_PHASE.ERROR;
}

// Fases em que o jogo avanca sozinho com progresso visivel: o login nao conta
// esse tempo no prazo dele (um pacote de 500 MB leva minutos).
export function updateMakingProgress(phase: number): boolean {
  return phase === UPDATE_PHASE.DOWNLOAD_BUNDLE || phase === UPDATE_PHASE.EXTRACT_BUNDLE ||
    phase === UPDATE_PHASE.DOWNLOAD_CONFIRM || phase === UPDATE_PHASE.APPSPLIT_PREPARE;
}

export function nextUpdateStep(s: UpdateSnapshot): UpdateStep {
  if (!updateActive(s.phase)) return { kind: "none" };
  if (s.appUpdate)
    return { kind: "fail", reason: "o jogo pede APK novo pela loja; instale a versao nova e abra de novo" };
  if (s.phase === UPDATE_PHASE.ERROR)
    return { kind: "act", name: "tentar de novo (falha ao checar versao)", body: "callsn XUpdater OnRetry 0", cooldownMs: RETRY_COOLDOWN_MS };
  if (s.phase === UPDATE_PHASE.DOWNLOAD_CONFIRM)
    return {
      kind: "act", name: "confirmar atualizacao", body: "callsn XUpdater OnUpdateAssetConfirmCallBack 0",
      cooldownMs: CONFIRM_COOLDOWN_MS,
    };
  return { kind: "wait", reason: PHASE_NAMES[s.phase] ?? `fase ${s.phase}` };
}

// Estimativa propria do tempo restante, pela velocidade medida numa janela
// deslizante (a do jogo oscila muito: 2m18s e 4m05s com 4 s de diferenca).
export class ProgressEta {
  private samples: { t: number; p: number }[] = [];

  constructor(private windowMs = 30000) {}

  // Progresso que volta (fase nova reusa a barra) recomeca a medicao.
  add(tMs: number, progress: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && progress < last.p) this.samples = [];
    this.samples.push({ t: tMs, p: progress });
    while (this.samples.length > 2 && tMs - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  // Fracao por segundo; undefined sem duas amostras com tempo e avanco.
  rate(): number | undefined {
    if (this.samples.length < 2) return undefined;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || b.p <= a.p) return undefined;
    return (b.p - a.p) / dt;
  }

  // Segundos ate a barra encher.
  etaSeconds(): number | undefined {
    const r = this.rate();
    const last = this.samples[this.samples.length - 1];
    if (r === undefined || !last) return undefined;
    return Math.max(0, (1 - last.p) / r);
  }
}

export function formatDuration(s: number): string {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

const MB = 1024 * 1024;

// Linha de log do download: "baixando 33.6% (164/488 MB) a 0.8 MB/s, faltam ~5m10s (jogo: 4m02s)".
export function describeProgress(s: UpdateSnapshot, eta: ProgressEta): string {
  const base = PHASE_NAMES[s.phase] ?? `fase ${s.phase}`;
  if (s.progress === undefined) return base;
  let out = `${base} ${(s.progress * 100).toFixed(1)}%`;
  const total = s.totalBytes ?? 0;
  if (s.phase === UPDATE_PHASE.DOWNLOAD_BUNDLE && total > 0) {
    out += ` (${Math.round((s.progress * total) / MB)}/${Math.round(total / MB)} MB)`;
    const r = eta.rate();
    if (r !== undefined) out += ` a ${((r * total) / MB).toFixed(1)} MB/s`;
  }
  const mine = eta.etaSeconds();
  if (mine !== undefined) out += `, faltam ~${formatDuration(mine)}`;
  if (s.phase === UPDATE_PHASE.DOWNLOAD_BUNDLE && s.gameEtaS !== undefined && s.gameEtaS > 0)
    out += ` (jogo: ${formatDuration(s.gameEtaS)})`;
  return out;
}

// Login 100% por metodo (sem tap): le o sub-estado da tela de login pelo engine
// e escolhe UMA acao por vez. Logica pura, sem IO; o main faz as leituras
// (getv/GETP) e manda o comando devolvido.
//
// Sub-estado mapeado ao vivo (engine OBJV/GETP, 2026-11-05):
//   Connecting...      -> LoginView, NormalFrame ativo, _logining_platform
//   Notification       -> AnnouncementView visivel (por cima do painel do servidor)
//   "Let's go"         -> LoginView, m_ServerListFrame ativo, sem Notification
//   Select Area        -> m_ChangeRegionFrame ativo (XLoginView.m_RegionHandler,
//                         XSelectionRegionHandler: Confirm = OnChangeRegionBtnClick
//                         confirma o m_selectRegion dele, que nao e a regiao
//                         salva; visto ao vivo marcando Tournament)
//   Fila do servidor   -> m_QueueFrame ativo ou _in_server_queue
//   Selecao de char    -> XSelectCharView visivel
//   Em mundo           -> queryPlayer ok

export interface LoginSnapshot {
  inWorld: boolean;
  loginView: boolean;
  selectChar: boolean;
  announcement: boolean;
  serverFrame: boolean;
  regionFrame: boolean;
  notify: boolean;
  queue: boolean;
  busy: boolean;
  // "Need to download package <mapa>" (DownloadPkgDlg): numa instalacao nova o
  // jogo baixa o pacote do mapa onde o char esta ao entrar no mundo. Sem
  // confirmar, o "Enter the game" nao faz nada.
  pkgDlg: boolean;
  pkgDownloading: boolean; // so vale com pkgDlg (fica true depois de fechar)
  // Servidor selecionado no painel "Let's go" (id em XLoginDocument._server_dic),
  // lido so com o painel na tela. undefined = nao lido.
  serverId?: number;
  // Regiao atual (XLoginDocument._last_region_id: 1 SEA, 2 Viet Nam, 3 Tournament).
  regionId?: number;
  // Tela de char: nomes dos slots (sem cor) e o slot selecionado.
  chars?: string[];
  selectedChar?: number;
  // Indice de informacao de cada slot (XSelectCharView.ConvertSlotToInfoIdx):
  // e o que SelectDefaultChar recebe. A tela poe o ultimo jogado no meio, entao
  // slot != info (visto ao vivo: info 0 = slot 2, 1 = slot 1, 2 = slot 3).
  charInfoIdx?: number[];
  // Indice de info que o "Enter world" usa de verdade
  // (XSelectCharacterDocument._currentSelectedIndex). O SelectDefaultChar so
  // muda o destaque da tela; quem troca este e o set_SelectCharIndex.
  selectedInfo?: number;
}

export type LoginStep =
  | { kind: "done" }
  | { kind: "wait"; reason: string }
  | { kind: "act"; name: string; body: string; cooldownMs?: number };

// Entrar no mundo manda um SelectRole pro servidor e a tela de char continua
// visivel enquanto o mundo carrega (ja levou 50s). Repetir no meio gera um
// pedido duplicado: o servidor responde falha (OnEnterWorldFailed) e o jogo
// volta pro login. Entao so repete depois de 60s.
export const ENTER_WORLD_COOLDOWN_MS = 60000;

// Leituras feitas pelo main. `tag`/`body` vao direto pro engine; o valor e o
// campo "bool" do RESP.
export const LOGIN_PROBES: { key: Exclude<keyof LoginSnapshot, "serverId" | "regionId" | "chars" | "selectedChar" | "charInfoIdx" | "selectedInfo">; tag: string; body: string }[] = [
  { key: "loginView", tag: "SKIL", body: "getv XLoginView IsVisible" },
  { key: "selectChar", tag: "SKIL", body: "getv XSelectCharView IsVisible" },
  { key: "announcement", tag: "SKIL", body: "getv XAnnouncementView IsVisible" },
  { key: "serverFrame", tag: "GETP", body: "XLoginView m_uiBehaviour m_ServerListFrame get_activeInHierarchy" },
  { key: "regionFrame", tag: "GETP", body: "XLoginView m_uiBehaviour m_ChangeRegionFrame get_activeInHierarchy" },
  { key: "notify", tag: "GETP", body: "XLoginView m_uiBehaviour m_notifyObj get_activeInHierarchy" },
  { key: "queue", tag: "GETP", body: "XLoginView m_uiBehaviour m_QueueFrame get_activeInHierarchy" },
  { key: "pkgDlg", tag: "SKIL", body: "getv DownloadPkgDlg IsVisible" },
  { key: "pkgDownloading", tag: "GETP", body: "DownloadPkgDlg _isShowDownloading" },
];

// Texto da barra do pacote ("45%") e o nome do mapa ("Downloading package [eaba3b]Hotan[-]!").
export const PKG_PROBES = {
  progress: "DownloadPkgDlg m_uiBehaviour m_downloadTxt GetText",
  title: "DownloadPkgDlg m_uiBehaviour m_needDownTxt GetText",
};

// Teto da espera pelo pacote do mapa. O texto da barra fica minutos parado num
// arquivo grande (Taklamakan parou em 52% e terminou depois), entao o prazo
// anda o download inteiro, ate este limite.
export const PKG_DOWNLOAD_MAX_MS = 20 * 60 * 1000;

// Nome do mapa no titulo do dialogo do pacote, sem as cores do NGUI.
export function pkgNameFromTitle(title: string): string | undefined {
  const m = /package\s+(.+?)!?\s*$/i.exec(title.replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, ""));
  return m ? m[1] : undefined;
}

// Flags do XLoginDocument que marcam handshake em andamento (somadas em busy).
export const LOGIN_BUSY_PROBES: { tag: string; body: string }[] = [
  { tag: "GETP", body: "XLoginDocument _logining_platform" },
  { tag: "GETP", body: "XLoginDocument _logining_game" },
  { tag: "GETP", body: "XLoginDocument _in_server_queue" },
];

// Regiao, servidor e personagem do ultimo login, salvos pelo app pra reusar
// quando o jogo pedir pra escolher. Os ids sao o que o jogo recebe
// (XLoginDocument.ChangeRegion(int) troca a regiao e a lista de servidores;
// OnServerChanged(int) troca o servidor do painel, provado ao vivo: 101 = Aries,
// 108 = Lunar); os nomes sao pra UI.
export interface LoginProfile {
  regionId?: number;
  regionName?: string;
  zoneId?: number;
  serverId?: number;
  serverName?: string;
  charName?: string;
}

// Lidas no painel "Let's go" (o label do servidor so tem texto com ele na tela).
// `field` diz qual campo do perfil recebe o "int" ou o "str" do RESP.
export const PROFILE_PROBES: { field: keyof LoginProfile; kind: "int" | "str"; body: string }[] = [
  { field: "regionId", kind: "int", body: "XLoginDocument _last_region_id" },
  { field: "regionName", kind: "str", body: "XLoginDocument GetLastRegionInfo RegionName" },
  { field: "zoneId", kind: "int", body: "XLoginDocument get_LoginZoneID" },
  { field: "serverName", kind: "str", body: "XLoginView m_uiBehaviour m_CurrentServer GetText" },
];

// Id do servidor cujo nome bate com o label do painel ("Lunar [SEA]" =
// ServerName "Lunar" + " [ZoneName]").
export function serverIdFromLabel(label: string, servers: { id: number; name: string }[]): number | undefined {
  const hit = servers.find((sv) => label === sv.name || label.startsWith(sv.name + " ["));
  return hit?.id;
}

// Item da lista de personagens do app: "Nome" (servidor do perfil salvo) ou
// "Nome@Servidor" pra um char de outro servidor da mesma regiao (ex.: o
// principal no servidor principal e os do Continental no Lunar).
export function parseCharTarget(entry: string): { name: string; server?: string } {
  const at = entry.lastIndexOf("@");
  if (at <= 0) return { name: entry.trim() };
  const server = entry.slice(at + 1).trim();
  return server ? { name: entry.slice(0, at).trim(), server } : { name: entry.slice(0, at).trim() };
}

// O char em mundo e o pedido pela lista? `current.server` = servidor do ultimo
// login feito pelo bot ("Lunar [SEA]"); sem ele (login manual) compara so o
// nome. Necessario porque a conta tem chars de mesmo nome em dois servidores.
export function isSameChar(current: { name?: string; server?: string }, entry: string): boolean {
  const want = parseCharTarget(entry);
  if (!current.name || current.name !== want.name) return false;
  if (!want.server || !current.server) return true;
  const norm = (s: string) => s.replace(/\s*\[[^\]]*\]\s*$/, "").trim().toLowerCase();
  return norm(current.server) === norm(want.server);
}

// Labels dos slots da tela de char (XSelectCharView.m_selectCharUIMgr[i].label_name).
// O NGUI marca o selecionado com cor no inicio ("[DFDAA3]Heroi[-]"); o que perde
// a selecao fica com o "[-]" sobrando. Devolve os nomes limpos e o slot marcado.
export function parseCharSlots(raw: string[]): { names: string[]; selected?: number } {
  const names = raw.map((r) => r.replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, ""));
  const i = raw.findIndex((r) => /^\[[0-9A-Fa-f]{6}\]/.test(r));
  return { names, selected: i >= 0 ? i : undefined };
}

// Junta a leitura nova com o perfil salvo: valor vazio ou nao lido nao apaga o
// que ja estava salvo (ex.: login que pulou o painel do servidor).
export function mergeProfile(saved: LoginProfile, read: LoginProfile): LoginProfile {
  const out: LoginProfile = { ...saved };
  for (const k of Object.keys(read) as (keyof LoginProfile)[]) {
    const v = read[k];
    if (v === undefined || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// Queda da conexao com o servidor do jogo: o ModalDlg mostra "Connection
// failed! Check your network and reconnect!" com o botao "Link again". O
// callback do botao (XReconnection.OnReconnectFail) nao reconectou ao vivo; o
// que funciona e reiniciar o jogo e logar de novo.
export function isConnectionLostText(text: string | undefined): boolean {
  return !!text && /connection failed|check your network|reconnect/i.test(text);
}

// Outro aparelho entrou na conta e o servidor derrubou esta sessao (visto no
// char principal em 2026-11-07 com o mesmo ModalDlg). Relogar derrubaria o outro, que pode
// ser o dono jogando no celular: o bot pausa em vez de reconectar.
export function isKickedText(text: string | undefined): boolean {
  return !!text && /logged in on another device/i.test(text);
}

// Login da conta (Google, ID ou Convidado): e um dialogo nativo do SDK, fora do
// Unity, entao so sobra o XLoginView sem nenhum painel. Visto ao vivo numa
// instancia nova (2026-11-07). Depois desse tempo no estado, o bot avisa que o
// usuario precisa logar a conta na janela do emulador.
export const ACCOUNT_LOGIN_HINT_MS = 20000;

export function awaitingAccountLogin(s: LoginSnapshot): boolean {
  return s.loginView && !s.inWorld && !s.selectChar && !s.announcement && !s.serverFrame
    && !s.regionFrame && !s.notify && !s.queue && !s.busy && !s.pkgDlg;
}

// Ordem importa: o popup e a area ficam POR CIMA do painel do servidor, entao
// saem primeiro; senao o "Let's go" e chamado com a tela errada.
// `target` = perfil salvo: se o servidor do painel nao e o salvo, troca antes
// do Let's go (o jogo costuma lembrar o ultimo, mas a conta tem char em varios).
export function nextLoginStep(s: LoginSnapshot, target: LoginProfile = {}): LoginStep {
  if (s.inWorld) return { kind: "done" };
  // Pacote do mapa por cima da tela de char: confirma e espera o download (de
  // graca; visto ao vivo, Hotan 750 MB).
  if (s.pkgDlg) {
    if (s.pkgDownloading) return { kind: "wait", reason: "baixando o pacote do mapa" };
    return { kind: "act", name: "baixar o pacote do mapa", body: "callsn DownloadPkgDlg OnDownloadClick 1" };
  }
  if (s.announcement)
    return { kind: "act", name: "fechar Notification", body: "callsn XAnnouncementView OnCloseClicked 1" };
  if (s.loginView && s.regionFrame) {
    // Com regiao salva: troca pelo documento (ChangeRegion reautentica e volta
    // pro painel do servidor) e fecha o frame, que fica por cima. Sem regiao
    // salva: aceita a do jogo pelo Confirm. O SelectRegion() nao fecha o frame
    // nesse caso (30 tentativas ao vivo sem efeito).
    if (target.regionId !== undefined) {
      if (s.regionId !== target.regionId)
        return {
          kind: "act", name: `trocar regiao pra ${target.regionName ?? target.regionId}`,
          body: `callsi XLoginDocument ChangeRegion 1 ${target.regionId} 0`,
        };
      return { kind: "act", name: "fechar Select Area", body: "callp XLoginView m_RegionHandler OnCloseClick 1" };
    }
    return { kind: "act", name: "confirmar regiao", body: "callp XLoginView m_RegionHandler OnChangeRegionBtnClick 1" };
  }
  if (s.loginView && s.notify)
    return { kind: "act", name: "OK do aviso", body: "callsn XLoginView OnNotifyOkClicked 1" };
  if (s.queue) return { kind: "wait", reason: "fila do servidor" };
  if (s.busy) return { kind: "wait", reason: "conectando" };
  if (s.selectChar && target.charName && s.chars) {
    const want = s.chars.indexOf(target.charName);
    // Char salvo que nao existe neste servidor: entra com o que o jogo escolheu.
    const info = s.charInfoIdx?.[want];
    const picked = s.selectedInfo !== undefined ? s.selectedInfo === info : want === s.selectedChar;
    if (want >= 0 && info !== undefined && info >= 0 && !picked)
      return {
        kind: "act", name: `selecionar char ${target.charName}`,
        body: `callpi XSelectCharView _doc set_SelectCharIndex 1 ${info} 0`,
      };
  }
  if (s.selectChar)
    return {
      kind: "act", name: "entrar no mundo", body: "callsn XSelectCharView OnEnterworldButtonClick 1",
      cooldownMs: ENTER_WORLD_COOLDOWN_MS,
    };
  if (s.loginView && s.serverFrame) {
    // Regiao antes do servidor: os ids de servidor sao da regiao atual.
    if (target.regionId !== undefined && s.regionId !== undefined && s.regionId !== target.regionId)
      return {
        kind: "act", name: `trocar regiao pra ${target.regionName ?? target.regionId}`,
        body: `callsi XLoginDocument ChangeRegion 1 ${target.regionId} 0`,
      };
    if (target.serverId !== undefined && s.serverId !== undefined && s.serverId !== target.serverId)
      return {
        kind: "act", name: `trocar servidor pra ${target.serverName ?? target.serverId}`,
        body: `callsi XLoginDocument OnServerChanged 1 ${target.serverId} 0`,
      };
    return { kind: "act", name: "Let's go", body: "callsn XLoginView OnEnterToSelectCharClicked 1" };
  }
  return { kind: "wait", reason: "carregando" };
}

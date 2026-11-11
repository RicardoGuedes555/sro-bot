import assert from "node:assert";
import { test } from "node:test";

import {
  isConnectionLostText,
  isKickedText,
  isSameChar,
  parseCharTarget,
  pkgNameFromTitle,
  awaitingAccountLogin,
  ENTER_WORLD_COOLDOWN_MS,
  type LoginProfile,
  type LoginSnapshot,
  mergeProfile,
  nextLoginStep,
  parseCharSlots,
  serverIdFromLabel,
} from "../login";

function snap(p: Partial<LoginSnapshot>): LoginSnapshot {
  return {
    inWorld: false, loginView: false, selectChar: false, announcement: false,
    serverFrame: false, regionFrame: false, notify: false, queue: false, busy: false,
    pkgDlg: false, pkgDownloading: false, ...p,
  };
}

function body(s: LoginSnapshot): string {
  const st = nextLoginStep(s);
  return st.kind === "act" ? st.body : st.kind;
}

test("login da conta pendente: so o XLoginView, sem painel nem handshake", () => {
  // Visto ao vivo numa instancia nova: dialogo nativo do SDK (Google/ID/Convidado).
  assert.equal(awaitingAccountLogin(snap({ loginView: true })), true);
  for (const p of ["serverFrame", "regionFrame", "announcement", "notify", "queue", "busy", "selectChar", "inWorld"] as const)
    assert.equal(awaitingAccountLogin(snap({ loginView: true, [p]: true })), false, p);
  assert.equal(awaitingAccountLogin(snap({})), false);
});

test("char da lista: Nome ou Nome@Servidor, e o servidor vira id pela lista da tela", () => {
  assert.deepEqual(parseCharTarget("Alt4"), { name: "Alt4" });
  assert.deepEqual(parseCharTarget(" Alt4@Lunar "), { name: "Alt4", server: "Lunar" });
  assert.deepEqual(parseCharTarget("Heroi@"), { name: "Heroi" });
  assert.deepEqual(parseCharTarget("@Lunar"), { name: "@Lunar" });
  const sv = [{ id: 102, name: "Pisces" }, { id: 108, name: "Lunar" }];
  assert.equal(serverIdFromLabel("Lunar", sv), 108);
});

test("pacote do mapa na tela de char: confirma, depois espera o download", () => {
  // Visto ao vivo na instancia nova: "Need to download package Hotan! 750MB".
  assert.equal(body(snap({ selectChar: true, pkgDlg: true })), "callsn DownloadPkgDlg OnDownloadClick 1");
  assert.equal(body(snap({ selectChar: true, pkgDlg: true, pkgDownloading: true })), "wait");
  // Fechado, o campo de download nao conta e a tela de char segue normal.
  assert.notEqual(body(snap({ selectChar: true, pkgDownloading: true })), "wait");
  assert.equal(pkgNameFromTitle("Downloading package [eaba3b]Hotan[-]!"), "Hotan");
  assert.equal(pkgNameFromTitle("Need to download package [eaba3b]Jangan[-]!"), "Jangan");
  assert.equal(pkgNameFromTitle("algo sem pacote"), undefined);
});

test("mesmo char: nome e, quando o bot sabe, o servidor", () => {
  const main = { name: "Heroi", server: "Pisces [SEA]" };
  assert.equal(isSameChar(main, "Heroi@Pisces [SEA]"), true);
  assert.equal(isSameChar(main, "Heroi@Pisces"), true);
  assert.equal(isSameChar(main, "Heroi@Lunar"), false); // o alt Lv.60 de mesmo nome
  assert.equal(isSameChar(main, "Heroi"), true);
  assert.equal(isSameChar(main, "Alt5@Lunar"), false);
  // Login manual: sem servidor conhecido, so o nome conta.
  assert.equal(isSameChar({ name: "Heroi" }, "Heroi@Lunar"), true);
  assert.equal(isSameChar({}, "Heroi"), false);
});

test("queda de conexao: reconhece o aviso do ModalDlg", () => {
  // Texto real visto no Heroi (SROTeste) em 2026-11-07.
  assert.equal(isConnectionLostText("Connection failed! Check your network and reconnect!"), true);
  assert.equal(isConnectionLostText("Need to download package Hotan!"), false);
  assert.equal(isConnectionLostText(undefined), false);
});

test("em mundo encerra", () => {
  assert.equal(nextLoginStep(snap({ inWorld: true, loginView: true })).kind, "done");
});

test("Connecting espera", () => {
  assert.equal(body(snap({ loginView: true, busy: true })), "wait");
});

test("Notification por cima do painel do servidor fecha antes do Let's go", () => {
  assert.equal(
    body(snap({ loginView: true, announcement: true, serverFrame: true })),
    "callsn XAnnouncementView OnCloseClicked 1",
  );
});

test("painel do servidor livre dispara o Let's go", () => {
  assert.equal(
    body(snap({ loginView: true, serverFrame: true })),
    "callsn XLoginView OnEnterToSelectCharClicked 1",
  );
});

test("Select Area confirma a regiao antes do Let's go", () => {
  assert.equal(
    body(snap({ loginView: true, serverFrame: true, regionFrame: true })),
    "callp XLoginView m_RegionHandler OnChangeRegionBtnClick 1", // sem perfil: aceita a do jogo
  );
});

test("Select Area com regiao salva: troca pelo documento e fecha o frame", () => {
  const sea: LoginProfile = { regionId: 1, regionName: "SEA" };
  // Visto ao vivo: frame marcando Tournament, _last_region_id -2.
  const st = nextLoginStep(snap({ loginView: true, regionFrame: true, regionId: -2 }), sea);
  assert.equal(st.kind === "act" && st.body, "callsi XLoginDocument ChangeRegion 1 1 0");
  const st2 = nextLoginStep(snap({ loginView: true, regionFrame: true, serverFrame: true, regionId: 1 }), sea);
  assert.equal(st2.kind === "act" && st2.body, "callp XLoginView m_RegionHandler OnCloseClick 1");
});

test("fila do servidor espera, sem acao", () => {
  assert.equal(body(snap({ loginView: true, serverFrame: true, queue: true })), "wait");
});

test("selecao de char entra no mundo", () => {
  assert.equal(body(snap({ selectChar: true })), "callsn XSelectCharView OnEnterworldButtonClick 1");
});

test("tela desconhecida (loading) espera", () => {
  assert.equal(body(snap({})), "wait");
});

test("mergeProfile grava a leitura nova", () => {
  assert.deepEqual(
    mergeProfile({ serverName: "Velho", regionId: 2 }, { serverName: "Lunar [SEA]", regionId: 1 }),
    { serverName: "Lunar [SEA]", regionId: 1 },
  );
});

test("mergeProfile nao apaga o salvo com leitura vazia", () => {
  assert.deepEqual(
    mergeProfile({ serverName: "Lunar [SEA]", charName: "Heroi" }, { serverName: "", regionId: 1 }),
    { serverName: "Lunar [SEA]", charName: "Heroi", regionId: 1 },
  );
});

test("entrar no mundo nao repete antes do cooldown longo", () => {
  const st = nextLoginStep(snap({ selectChar: true }));
  assert.equal(st.kind === "act" ? st.cooldownMs : 0, ENTER_WORLD_COOLDOWN_MS);
});

test("servidor do painel diferente do salvo troca antes do Let's go", () => {
  assert.equal(
    body2(snap({ loginView: true, serverFrame: true, serverId: 101 }), { serverId: 108 }),
    "callsi XLoginDocument OnServerChanged 1 108 0",
  );
});

test("servidor certo ou nao lido segue pro Let's go", () => {
  const go = "callsn XLoginView OnEnterToSelectCharClicked 1";
  assert.equal(body2(snap({ loginView: true, serverFrame: true, serverId: 108 }), { serverId: 108 }), go);
  assert.equal(body2(snap({ loginView: true, serverFrame: true }), { serverId: 108 }), go);
  assert.equal(body2(snap({ loginView: true, serverFrame: true, serverId: 101 }), {}), go);
});

test("serverIdFromLabel casa nome + zona sem confundir prefixo", () => {
  const sv = [{ id: 101, name: "Aries" }, { id: 102, name: "Pisces" }, { id: 108, name: "Lunar" }];
  assert.equal(serverIdFromLabel("Lunar [SEA]", sv), 108);
  assert.equal(serverIdFromLabel("Pisces [SEA]", sv), 102);
  assert.equal(serverIdFromLabel("", sv), undefined);
});

function body2(s: LoginSnapshot, t: LoginProfile): string {
  const st = nextLoginStep(s, t);
  return st.kind === "act" ? st.body : st.kind;
}

test("parseCharSlots limpa a cor e acha o selecionado", () => {
  assert.deepEqual(parseCharSlots(["Alt3", "[DFDAA3]Alt5[-]", "Heroi[-]"]), {
    names: ["Alt3", "Alt5", "Heroi"],
    selected: 1,
  });
  assert.equal(parseCharSlots(["a", "b"]).selected, undefined);
});

test("char salvo diferente do selecionado seleciona antes de entrar", () => {
  const chars = ["Alt3", "Alt5", "Heroi", "Alt1"];
  const charInfoIdx = [3, 1, 0, 2];
  // Manda o indice de INFORMACAO do slot do Heroi (0), nao o slot (2), pro
  // documento (o SelectDefaultChar so mudava o destaque e entrava no ultimo jogado).
  const pick = "callpi XSelectCharView _doc set_SelectCharIndex 1 0 0";
  assert.equal(body2(snap({ selectChar: true, chars, charInfoIdx, selectedChar: 1 }), { charName: "Heroi" }), pick);
  const enter = "callsn XSelectCharView OnEnterworldButtonClick 1";
  assert.equal(body2(snap({ selectChar: true, chars, charInfoIdx, selectedChar: 2 }), { charName: "Heroi" }), enter);
  assert.equal(body2(snap({ selectChar: true, chars, charInfoIdx, selectedChar: 1 }), { charName: "Outro" }), enter);
});

test("char: o indice do documento manda mais que o destaque da tela", () => {
  const chars = ["Alt3", "Alt5", "Heroi", "Alt1", "Alt4"];
  const charInfoIdx = [3, 1, 0, 2, 4];
  const pick = "callpi XSelectCharView _doc set_SelectCharIndex 1 3 0";
  const enter = "callsn XSelectCharView OnEnterworldButtonClick 1";
  // Visto ao vivo: destaque no Alt3 (slot 0) mas o documento ainda no 4.
  assert.equal(body2(snap({ selectChar: true, chars, charInfoIdx, selectedChar: 0, selectedInfo: 4 }),
    { charName: "Alt3" }), pick);
  assert.equal(body2(snap({ selectChar: true, chars, charInfoIdx, selectedChar: 4, selectedInfo: 3 }),
    { charName: "Alt3" }), enter);
});

test("regiao diferente da salva troca antes do servidor", () => {
  const t = { regionId: 1, regionName: "SEA", serverId: 108 };
  assert.equal(
    body2(snap({ loginView: true, serverFrame: true, regionId: 2, serverId: 201 }), t),
    "callsi XLoginDocument ChangeRegion 1 1 0",
  );
  assert.equal(
    body2(snap({ loginView: true, serverFrame: true, regionId: 1, serverId: 101 }), t),
    "callsi XLoginDocument OnServerChanged 1 108 0",
  );
});

test("outro aparelho na conta: pausa, nao conta como queda", () => {
  // Texto real do ModalDlg no Heroi (SROTeste) em 2026-11-07 20:5x.
  const t = "Your account is currently logged in on another device";
  assert.equal(isKickedText(t), true);
  assert.equal(isConnectionLostText(t), false);
  assert.equal(isKickedText("Connection failed! Check your network and reconnect!"), false);
  assert.equal(isKickedText(undefined), false);
});

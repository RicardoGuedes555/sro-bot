import assert from "node:assert";
import { test } from "node:test";

import { center, inputTextArg, nextSdkStep, parseUiDump } from "../sdklogin";

const node = (cls: string, id: string, text: string, bounds: string, password = false) =>
  `<node index="0" text="${text}" resource-id="${id}" class="android.widget.${cls}" package="com.silkroad.mb" password="${password}" bounds="${bounds}">`;

// Telas vistas ao vivo em 2026-11-07 (SROTeste, 1280x720).
const ERROR = [
  node("FrameLayout", "android:id/content", "", "[312,242][967,478]"),
  node("TextView", "android:id/alertTitle", "Error!", "[348,270][520,310]"),
  node("TextView", "android:id/message", "An error occurred while connecting or retrieving data from the server. Please try again later. (LBATx2)", "[348,320][930,380]"),
  node("Button", "android:id/button1", "CLOSE", "[849,400][949,472]"),
].join("\n");
const MENU = [
  node("TextView", "", "Login", "[609,123][670,157]"),
  node("TextView", "", "Login with Google", "[437,226][932,316]"),
  node("Button", "", "Login with ID", "[347,380][932,470]"),
  node("Button", "", "Play as Guest", "[544,531][735,603]"),
].join("\n");
const FORM = [
  node("TextView", "", "Login", "[605,60][675,99]"),
  node("EditText", "", "ID", "[400,139][915,203]"),
  node("EditText", "", "", "[400,235][880,320]", true),
  node("Button", "", "Login", "[365,378][915,463]"),
  node("Button", "", "Register", "[365,506][915,591]"),
  node("TextView", "", "Forgot Password?", "[554,617][725,648]"),
].join("\n");

test("login do SDK: erro fecha pelo CLOSE, menu abre o Login with ID, formulario preenche", () => {
  const e = nextSdkStep(parseUiDump(ERROR));
  assert.equal(e.kind, "close");
  assert.deepEqual(e.kind === "close" && e.at, [899, 436]);
  assert.match(e.kind === "close" ? e.message : "", /LBATx2/);
  const m = nextSdkStep(parseUiDump(MENU));
  assert.deepEqual(m.kind === "openId" && m.at, [640, 425]); // nunca o Google nem o Convidado
  const f = nextSdkStep(parseUiDump(FORM));
  assert.equal(f.kind, "fill");
  if (f.kind === "fill") {
    assert.deepEqual(f.idAt, [658, 171]);
    assert.deepEqual(f.pwdAt, [640, 278]);
    assert.deepEqual(f.loginAt, [640, 421]); // o Login, nao o Register
  }
  // Jogo (Unity) na tela: nada nativo, nada a fazer.
  assert.equal(nextSdkStep(parseUiDump(node("FrameLayout", "android:id/content", "", "[0,0][1280,720]"))).kind, "none");
});

test("texto pro input text: aspas simples, espaco vira %s, recusa o que nao passa", () => {
  assert.equal(inputTextArg("user@mail.com"), "'user@mail.com'");
  assert.equal(inputTextArg("a b$c"), "'a%sb$c'");
  assert.equal(inputTextArg("it's"), "'it'\\''s'");
  assert.equal(inputTextArg(""), undefined);
  assert.equal(inputTextArg("x%sy"), undefined);
  assert.equal(inputTextArg("a\nb"), undefined);
  assert.deepEqual(center({ cls: "Button", id: "", text: "", password: false, focused: false, bounds: [0, 0, 10, 20] }), [5, 10]);
});

test("senha recusada para as tentativas; conferencia do ID nao expoe o texto", async () => {
  const { compareTyped, isBadCredentials, riskyForInput } = await import("../sdklogin");
  assert.equal(isBadCredentials("Invalid authentication information. Please try again."), true); // visto ao vivo
  assert.equal(isBadCredentials("An error occurred while connecting or retrieving data from the server. Please try again later. (LBATx2)"), false);
  assert.deepEqual(compareTyped("abc@x.com", "abc@x.com"), { ok: true, note: "ID conferido" });
  const bad = compareTyped("abc@x.com", "abcx.com");
  assert.equal(bad.ok, false);
  assert.doesNotMatch(bad.note, /abc/); // so tamanhos
  assert.equal(compareTyped("a", undefined).ok, false);
  assert.equal(riskyForInput("User_123!@#"), false);
  assert.equal(riskyForInput("João"), true);
});

test("campos do formulario: acha ID e senha e le o foco", async () => {
  const { findField } = await import("../sdklogin");
  const xml = FORM.replace('text="ID" resource-id=""', 'text="ID" resource-id="" focused="true"');
  const nodes = parseUiDump(xml);
  assert.equal(findField(nodes, "id")?.focused, true);
  assert.equal(findField(nodes, "pwd")?.password, true);
  assert.equal(findField(nodes, "pwd")?.focused, false);
  assert.equal(findField(parseUiDump(MENU), "id"), undefined);
});

test("senha mascarada (13:37): confere pelo tamanho", async () => {
  const { compareTyped } = await import("../sdklogin");
  assert.equal(compareTyped("segredo123", "•".repeat(10), "senha").ok, true);
  assert.equal(compareTyped("segredo123", "•".repeat(9), "senha").ok, false);
  assert.equal(compareTyped("segredo123", "segredo124", "senha").ok, false); // texto puro diferente
  assert.doesNotMatch(compareTyped("segredo123", "•".repeat(9), "senha").note, /segredo/);
});

// Login da conta na tela NATIVA do SDK da Gamo (Android, fora do Unity: o engine
// nao alcanca). Excecao a regra "sem tap", decidida pelo usuario em 2026-11-07:
// so aqui o bot age na tela, achando cada controle pelo id ou pelo texto no dump
// do uiautomator (nunca por posicao fixa). Logica pura; o main le e age.
//
// Telas vistas ao vivo (1280x720):
//   erro:  AlertDialog "Error!" + android:id/button1 "CLOSE" (ex.: LBATx2)
//   menu:  "Login with Google" / "Login with ID" / "Play as Guest"
//   form:  EditText "ID", EditText password=true, Button "Login" (+ Register)

export interface UiNode {
  cls: string; // classe curta (EditText, Button...)
  id: string; // resource-id
  text: string;
  password: boolean;
  focused: boolean;
  bounds: [number, number, number, number]; // x1, y1, x2, y2
}

const attr = (node: string, k: string) => {
  const m = new RegExp(`\\s${k}="([^"]*)"`).exec(node);
  return m ? m[1] : "";
};

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function parseUiDump(xml: string): UiNode[] {
  const out: UiNode[] = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const n = m[0];
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr(n, "bounds"));
    if (!b) continue;
    out.push({
      cls: attr(n, "class").split(".").pop() ?? "",
      id: attr(n, "resource-id"),
      text: unescapeXml(attr(n, "text")),
      password: attr(n, "password") === "true",
      focused: attr(n, "focused") === "true",
      bounds: [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])],
    });
  }
  return out;
}

export function center(n: UiNode): [number, number] {
  return [Math.round((n.bounds[0] + n.bounds[2]) / 2), Math.round((n.bounds[1] + n.bounds[3]) / 2)];
}

export type SdkStep =
  | { kind: "close"; at: [number, number]; message: string }
  | { kind: "openId"; at: [number, number] }
  | { kind: "fill"; idAt: [number, number]; pwdAt: [number, number]; loginAt: [number, number] }
  | { kind: "none" };

export function nextSdkStep(nodes: UiNode[]): SdkStep {
  const close = nodes.find((n) => n.id === "android:id/button1");
  if (close && nodes.some((n) => n.id === "android:id/alertTitle")) {
    const msg = nodes.find((n) => n.id === "android:id/message")?.text ?? "";
    return { kind: "close", at: center(close), message: msg };
  }
  const idField = nodes.find((n) => n.cls === "EditText" && !n.password);
  const pwdField = nodes.find((n) => n.cls === "EditText" && n.password);
  const login = nodes.find((n) => n.cls === "Button" && /^login$/i.test(n.text.trim()));
  if (idField && pwdField && login) return { kind: "fill", idAt: center(idField), pwdAt: center(pwdField), loginAt: center(login) };
  const withId = nodes.find((n) => /^login with id$/i.test(n.text.trim()));
  if (withId) return { kind: "openId", at: center(withId) };
  return { kind: "none" };
}

// Texto pro `input text` do Android, que roda no sh do aparelho: vai entre aspas
// simples e espaco vira %s. Um "%s" de verdade no texto nao tem como passar.
export function inputTextArg(s: string): string | undefined {
  if (!s || s.includes("%s") || /[\r\n]/.test(s)) return undefined;
  return `'${s.replace(/'/g, "'\\''").replace(/ /g, "%s")}'`;
}

// Resposta do SDK que diz que o ID ou a senha estao errados: repetir pode
// bloquear a conta, entao o bot para de tentar.
export function isBadCredentials(message: string): boolean {
  return /invalid authentication|wrong password|incorrect (id|password)|invalid (id|password)/i.test(message);
}

// O `input text` do Android so digita ASCII imprimivel com seguranca; fora disso
// (acento, emoji) o campo recebe outra coisa. Nao diz qual caractere.
export function riskyForInput(s: string): boolean {
  return /[^!-~ ]/.test(s);
}

// Campo do formulario: ID (texto) ou senha.
export function findField(nodes: UiNode[], which: "id" | "pwd"): UiNode | undefined {
  return nodes.find((n) => n.cls === "EditText" && n.password === (which === "pwd"));
}

// Confere o que ficou no campo sem expor o texto: so diz se bate e os tamanhos.
// O uiautomator devolve ate o campo de senha em texto puro: a comparacao fica
// aqui dentro e nada do conteudo sai.
export function compareTyped(expected: string, got: string | undefined, label = "ID"): { ok: boolean; note: string } {
  if (got === undefined) return { ok: false, note: `campo ${label} nao achado na releitura` };
  if (got === expected) return { ok: true, note: `${label} conferido` };
  // Campo de senha mascarado ("•••", visto 13:37): so da pra conferir o tamanho.
  if (got.length > 0 && /^[•●*]+$/.test(got))
    return got.length === expected.length
      ? { ok: true, note: `${label} conferido pelo tamanho (campo mascarado)` }
      : { ok: false, note: `${label} digitado com tamanho diferente (${got.length} de ${expected.length} caracteres)` };
  return { ok: false, note: `${label} digitado diferente do salvo (${got.length} de ${expected.length} caracteres)` };
}

// Apaga o que tiver no campo: vai pro fim e apaga 64 vezes. So com o campo em
// foco: sem foco, o "apagar" vira "voltar" no jogo e fechou o app (visto 11:04).
// Com duas janelas do SDK empilhadas, o primeiro toque so ativa a janela.
export const CLEAR_FIELD_KEYS = ["123", ...Array(64).fill("67")];

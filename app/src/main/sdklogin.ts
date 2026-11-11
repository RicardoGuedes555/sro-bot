// Executa o login da conta na tela nativa do SDK (ver controller/sdklogin): le a
// tela pelo uiautomator e age no controle achado. Nada do ID ou da senha vai pro
// log; os comandos vao direto pro adb (sem shell no PC).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { center, CLEAR_FIELD_KEYS, compareTyped, findField, inputTextArg, isBadCredentials, nextSdkStep, parseUiDump, riskyForInput } from "../controller/sdklogin";
import { adbBin } from "./adbbin";
import { loadCredentials } from "./credentials";

const execFileP = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DUMP = "/sdcard/sro_ui.xml";
const MAX_STEPS = 6;

// O erro do execFile traz a linha de comando inteira (com o ID e a senha no
// `input text`): sai so o nome do comando.
async function shell(serial: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP(adbBin(), ["-s", serial, "shell", ...args], { timeout: 30000 });
    return stdout;
  } catch {
    throw new Error(`adb shell ${args.slice(0, 2).join(" ")} falhou`);
  }
}

const tap = (serial: string, [x, y]: [number, number]) => shell(serial, ["input", "tap", String(x), String(y)]);

// Toca no campo ate ele ficar em foco (ate 3 vezes); so entao apaga e digita.
async function typeInto(serial: string, which: "id" | "pwd", arg: string): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    const f = findField(await readScreen(serial), which);
    if (!f) return false;
    if (f.focused) {
      await shell(serial, ["input", "keyevent", ...CLEAR_FIELD_KEYS]);
      await shell(serial, ["input", "text", arg]);
      await sleep(400);
      return true;
    }
    await tap(serial, center(f));
    await sleep(600);
  }
  return false;
}

async function readScreen(serial: string) {
  await shell(serial, ["uiautomator", "dump", DUMP]);
  return parseUiDump(await shell(serial, ["cat", DUMP]));
}

// "filled" = mandou ID e senha; "error" = o SDK mostrou erro (texto no log);
// "badcred" = o SDK disse que o ID ou a senha estao errados (nao tentar de novo);
// "none" = tela de login nao apareceu; "nocred" = sem ID salvo ou senha que nao passa.
export async function sdkLogin(serial: string, log: (m: string) => void): Promise<"filled" | "error" | "badcred" | "none" | "nocred"> {
  const cred = loadCredentials();
  const idArg = cred && inputTextArg(cred.id);
  const pwdArg = cred && inputTextArg(cred.pwd);
  if (!cred || !idArg || !pwdArg) {
    if (cred) log("login da conta: o ID ou a senha tem caractere que o Android nao digita (\"%s\" ou quebra de linha); faca o login na mao.");
    return "nocred";
  }
  let sawError = false;
  for (let i = 0; i < MAX_STEPS; i++) {
    const step = nextSdkStep(await readScreen(serial));
    if (step.kind === "none") return sawError ? "error" : "none";
    if (step.kind === "close") {
      log(`login da conta: o SDK mostrou erro (${step.message.slice(0, 160)}); fechando.`);
      sawError = true;
      await tap(serial, step.at);
      if (isBadCredentials(step.message)) return "badcred";
    } else if (step.kind === "openId") {
      log("login da conta: abrindo o login por ID.");
      await tap(serial, step.at);
    } else {
      if (riskyForInput(cred.id) || riskyForInput(cred.pwd))
        log("login da conta: o ID ou a senha tem caractere fora do ASCII (acento, simbolo especial); o Android pode digitar errado.");
      log("login da conta: preenchendo o ID e a senha salvos.");
      for (const [which, arg, value, label] of [["id", idArg, cred.id, "ID"], ["pwd", pwdArg, cred.pwd, "senha"]] as const) {
        // Duas vezes: na primeira o teclado as vezes engole o texto (visto 13:36,
        // o ID chegou com 2 de 22 caracteres). So toca no Login se bater.
        let check = { ok: false, note: "" };
        for (let k = 0; k < 2 && !check.ok; k++) {
          if (!(await typeInto(serial, which, arg))) {
            log(`login da conta: o campo ${label} nao ficou em foco; nao digitei nada.`);
            return "error";
          }
          check = compareTyped(value, findField(await readScreen(serial), which)?.text, label);
          log(`login da conta: ${check.note}${!check.ok && k === 0 ? "; digitando de novo" : ""}.`);
        }
        if (!check.ok) return "error";
      }
      // O teclado pode ter mudado o layout: acha o Login de novo antes de tocar.
      const again = nextSdkStep(await readScreen(serial));
      await tap(serial, again.kind === "fill" ? again.loginAt : step.loginAt);
      return "filled";
    }
    await sleep(1500);
  }
  return sawError ? "error" : "none";
}

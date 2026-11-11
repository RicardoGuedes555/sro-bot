// ID e senha da conta (login da Gamo), digitados pela pessoa no app. Ficam num
// arquivo so, criptografado pelo Windows (safeStorage, como a chave da IA). A
// senha nunca volta pro renderer, nunca vai pro log nem pra IA; so o main le pra
// preencher a tela de login do SDK.

import fs from "node:fs";
import path from "node:path";

import { safeStorage } from "electron";

let dir = "";

export function setCredentialsDir(d: string): void {
  dir = d;
}

const credFile = () => path.join(dir, "login-cred.bin");

export function hasCredentials(): boolean {
  return fs.existsSync(credFile());
}

// id vazio apaga.
export function saveCredentials(id: string, pwd: string): void {
  if (!id.trim()) {
    fs.rmSync(credFile(), { force: true });
    return;
  }
  if (!pwd) throw new Error("falta a senha");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("o Windows nao liberou a criptografia pra guardar a senha");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credFile(), safeStorage.encryptString(JSON.stringify({ id: id.trim(), pwd })));
}

export function loadCredentials(): { id: string; pwd: string } | undefined {
  try {
    const c = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile())));
    return typeof c.id === "string" && typeof c.pwd === "string" && c.id && c.pwd ? c : undefined;
  } catch {
    return undefined;
  }
}

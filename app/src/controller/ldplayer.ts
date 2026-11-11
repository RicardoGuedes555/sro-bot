// LDPlayer via ldconsole.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { EmulatorInfo } from "./config";

const execFileP = promisify(execFile);

export class LdPlayer {
  pid: number | null = null;
  private console: string;

  constructor(public info: EmulatorInfo) {
    this.console = this.findConsole();
  }

  get kind(): string {
    return this.info.kind;
  }

  private findConsole(): string {
    const base = this.info.installDir || "C:\\LDPlayer\\LDPlayer9";
    const ld = path.join(base, "ldconsole.exe");
    if (fs.existsSync(ld)) return ld;
    const dn = path.join(base, "dnconsole.exe");
    return fs.existsSync(dn) ? dn : ld;
  }

  private async call(args: string[], timeoutMs = 30000): Promise<string> {
    const { stdout } = await execFileP(this.console, args, { timeout: timeoutMs }).catch(() => ({
      stdout: "",
    }));
    return stdout;
  }

  adbSerial(): string {
    const port = (this.info.extra.adb_port as number) ?? 5555 + this.info.index * 2;
    return `127.0.0.1:${port}`;
  }

  private async list2Row(): Promise<string[] | null> {
    const out = await this.call(["list2"]);
    for (const line of out.split(/\r?\n/)) {
      const cols = line.split(",");
      if (cols[0]?.trim() === String(this.info.index)) return cols;
    }
    return null;
  }

  async isRunning(): Promise<boolean> {
    const row = await this.list2Row();
    if (!row || row.length < 6) return false;
    const androidStarted = row[4].trim() === "1";
    const pid = row[5].trim();
    if (pid !== "" && pid !== "-1" && /^-?\d+$/.test(pid)) this.pid = parseInt(pid, 10);
    return androidStarted;
  }

  async launch(): Promise<boolean> {
    if (await this.isRunning()) return true;
    await this.call(["launch", "--index", String(this.info.index)]);
    return true;
  }

  async quit(restart = false): Promise<void> {
    await this.call(["quit", "--index", String(this.info.index)]);
    if (restart) await this.launch();
  }

  canRestart(): boolean {
    return fs.existsSync(this.console);
  }
}

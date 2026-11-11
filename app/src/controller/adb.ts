// Wrapper fino do executavel adb.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export class Adb {
  constructor(public serial: string, public adbPath = "adb", public timeoutMs = 15000) {}

  private async run(args: string[], timeoutMs?: number): Promise<string> {
    const { stdout } = await execFileP(this.adbPath, ["-s", this.serial, ...args], {
      timeout: timeoutMs ?? this.timeoutMs,
    });
    return stdout;
  }

  async connect(): Promise<boolean> {
    if (!this.serial.includes(":")) return this.isOnline();
    try {
      const { stdout } = await execFileP(this.adbPath, ["connect", this.serial], {
        timeout: this.timeoutMs,
      });
      return stdout.includes("connected") || stdout.includes("already");
    } catch {
      return false;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const { stdout } = await execFileP(this.adbPath, ["devices"], { timeout: this.timeoutMs });
      for (const line of stdout.split(/\r?\n/).slice(1)) {
        const p = line.split(/\s+/);
        if (p.length >= 2 && p[0] === this.serial && p[1] === "device") return true;
      }
    } catch {
      /* noop */
    }
    return false;
  }

  async shell(command: string, timeoutMs?: number): Promise<string> {
    return this.run(["shell", command], timeoutMs);
  }

  async forward(localPort: number, remote: string): Promise<void> {
    await this.run(["forward", `tcp:${localPort}`, remote]);
  }

  async forwardRemove(localPort: number): Promise<void> {
    await this.run(["forward", "--remove", `tcp:${localPort}`]);
  }

  async packageInstalled(pkg: string): Promise<boolean> {
    const out = await this.shell(`pm path ${pkg}`).catch(() => "");
    return out.trim().startsWith("package:");
  }
}

// Monitor de processos.
// No Windows usa `tasklist` (Node nao tem psutil). Dispara callbacks de
// started/exited por pid, comparando os processos vigiados entre varreduras.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const DEFAULT_WATCH = [
  "dnplayer.exe",
  "LdVBoxHeadless.exe",
  "HD-Player.exe",
  "MuMuPlayer.exe",
  "MuMuVMMHeadless.exe",
  "MEmu.exe",
  "MEmuHeadless.exe",
  "Nox.exe",
  "NoxVMHandle.exe",
];

export class ProcessScanner {
  private watch: Set<string>;
  private known = new Map<number, string>();

  constructor(
    watchNames: string[] = DEFAULT_WATCH,
    public onStarted?: (pid: number, name: string) => void,
    public onExited?: (pid: number) => void,
  ) {
    this.watch = new Set(watchNames.map((n) => n.toLowerCase()));
  }

  async scan(): Promise<void> {
    const seen = new Map<number, string>();
    for (const [pid, name] of await this.listProcesses()) {
      if (this.watch.has(name.toLowerCase())) seen.set(pid, name.toLowerCase());
    }
    for (const [pid, name] of seen) {
      if (!this.known.has(pid)) this.onStarted?.(pid, name);
    }
    for (const pid of [...this.known.keys()]) {
      if (!seen.has(pid)) this.onExited?.(pid);
    }
    this.known = seen;
  }

  private async listProcesses(): Promise<[number, string][]> {
    try {
      const { stdout } = await execFileP("tasklist", ["/fo", "csv", "/nh"], { timeout: 10000 });
      const out: [number, string][] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)","(\d+)"/);
        if (m) out.push([parseInt(m[2], 10), m[1]]);
      }
      return out;
    } catch {
      return [];
    }
  }

  pidsFor(name: string): number[] {
    const n = name.toLowerCase();
    return [...this.known.entries()].filter(([, v]) => v === n).map(([pid]) => pid);
  }
}

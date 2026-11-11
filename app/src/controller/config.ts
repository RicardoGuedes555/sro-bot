// Config das contas.

import fs from "node:fs";

export interface EmulatorInfo {
  kind: string;
  index: number;
  name: string;
  installDir: string;
  extra: Record<string, unknown>;
}

export interface AccountConfig {
  name: string;
  emulator: EmulatorInfo;
  activities: string[];
  extra: Record<string, unknown>;
}

export interface GlobalSettings {
  maxInstance: number;
  spacingMs: number;
}

export interface Config {
  settings: GlobalSettings;
  accounts: AccountConfig[];
}

export function parseConfig(raw: any): Config {
  const s = raw.settings ?? {};
  const settings: GlobalSettings = {
    maxInstance: Number(s.max_instance ?? 4),
    spacingMs: Number(s.spacing_s ?? 3) * 1000,
  };
  const accounts: AccountConfig[] = (raw.accounts ?? []).map((a: any) => {
    const emu = a.emulator ?? {};
    const info: EmulatorInfo = {
      kind: emu.kind ?? "ldplayer",
      index: Number(emu.index ?? 0),
      name: emu.name ?? a.name ?? "",
      installDir: emu.install_dir ?? "",
      extra: emu.extra ?? {},
    };
    return {
      name: a.name ?? `inst-${info.index}`,
      emulator: info,
      activities: a.activities ?? [],
      extra: a.extra ?? {},
    };
  });
  return { settings, accounts };
}

export function loadConfig(path: string): Config {
  return parseConfig(JSON.parse(fs.readFileSync(path, "utf-8")));
}

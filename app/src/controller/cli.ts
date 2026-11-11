// Linha de comando do controlador.
//
//   node dist/controller/cli.js run  accounts.json   sobe o loop com as contas ligadas
//   node dist/controller/cli.js list accounts.json   lista as contas e o status do emulador

import { loadConfig } from "./config";
import { Orchestrator } from "./orchestrator";

async function cmdRun(configPath: string): Promise<number> {
  const config = loadConfig(configPath);
  const orch = new Orchestrator(config);
  orch.enableAll();
  console.log(`ligando ${orch.instances.length} instancia(s). ctrl+c para parar.`);
  process.on("SIGINT", () => {
    orch.stop();
  });
  await orch.run();
  return 0;
}

async function cmdList(configPath: string): Promise<number> {
  const config = loadConfig(configPath);
  const orch = new Orchestrator(config);
  for (const inst of orch.instances) {
    const up = await inst.emulator.isRunning().catch(() => false);
    const name = inst.name.padEnd(20);
    const kind = inst.emulator.kind.padEnd(12);
    console.log(`${name} ${kind} ${up ? "no ar" : "parado"}`);
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, configPath] = argv;
  if (!cmd || !configPath || (cmd !== "run" && cmd !== "list")) {
    console.error("uso: srobot <run|list> <accounts.json>");
    return 2;
  }
  return cmd === "run" ? cmdRun(configPath) : cmdList(configPath);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

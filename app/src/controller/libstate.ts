// Estado das libs do jogo antes da injecao, pra devolver exatamente o que
// estava. Logica pura; o main faz as leituras (md5 no aparelho) e a copia.
//
// Layout que o bot monta:
//   libmain.so = loader (o Android carrega este)
//   libcore.so = o libmain ORIGINAL do jogo; o loader faz dlopen dele
//   libsroengine.so = o engine
// Antes da injecao o aparelho pode estar:
//   limpo    -> libmain e o original do jogo, sem libcore
//   loader   -> libmain e outro loader de terceiros e libcore e o jogo
//   injetado -> libmain ja e o nosso loader

export interface LibBase {
  libDir: string;
  mainMd5: string; // md5 do libmain.so que estava (vai de volta no restore)
  coreExisted: boolean; // tinha libcore.so antes (senao o bot cria e apaga)
  coreMd5: string;
  savedAt: string;
}

export type InjectPlan =
  | { kind: "fresh"; mode: "clean" | "loader" } // guardar o libmain atual e injetar
  | { kind: "refresh"; base: LibBase } // ja injetado com base guardada: so atualizar
  | { kind: "legacy" }; // ja injetado sem base guardada (injecao antiga): reconstruir

export function planInject(
  libDir: string,
  mainMd5: string,
  coreExists: boolean,
  ourLoaderMd5: string,
  saved: LibBase | null,
): InjectPlan {
  if (mainMd5 !== ourLoaderMd5) return { kind: "fresh", mode: coreExists ? "loader" : "clean" };
  // APK reinstalado muda a pasta: a base guardada e de outra instalacao.
  if (saved && saved.libDir === libDir) return { kind: "refresh", base: saved };
  return { kind: "legacy" };
}

export function describeBase(b: LibBase): string {
  if (!b.coreExisted) return "jogo limpo";
  return `outro loader (${b.mainMd5.slice(0, 8)})`;
}

// Abrir o app com o jogo ja rodando: so reconecta. Em 2026-11-09 10:08 o adb
// falhou na hora ("error: closed") e o `pidof` com erro virou "jogo fechado": o
// app reinjetou e reiniciou o jogo com o char principal cacando (voltou com HP 44%).
// Agora o engine e perguntado antes pela porta ja encaminhada, e adb sem
// resposta nunca reinicia.
export type GameState = "running" | "stopped" | "unknown";

// Saida de `pidof <pacote> || echo none`: pid = rodando, "none" = fechado, nada
// (ou erro do adb) = nao deu pra saber.
export function gameStateFromPidof(out: string | undefined): GameState {
  const t = (out ?? "").trim();
  if (/^\d+(\s+\d+)*$/.test(t)) return "running";
  return t === "none" ? "stopped" : "unknown";
}

export function reconnectPlan(engineInWorld: boolean, game: GameState): "reconnect" | "abort" | "inject" {
  if (engineInWorld) return "reconnect";
  return game === "unknown" ? "abort" : "inject";
}

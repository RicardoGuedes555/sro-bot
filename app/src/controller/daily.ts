// Atividades de uma vez por dia do jogo (Tower, Guild, Firm). O dia vira as
// 05:00 UTC+8 (21:00 UTC, 18:00 em Brasilia). Logica pura.

export function gameDay(now = Date.now()): number {
  return Math.floor((now - 21 * 3600000) / 86400000);
}

// Quais diarias ainda faltam hoje: marcadas no painel e nao concluidas no dia.
export function dueDailies(ids: string[], checked: (id: string) => boolean, done: Record<string, number>, day: number): string[] {
  return ids.filter((id) => checked(id) && done[id] !== day);
}

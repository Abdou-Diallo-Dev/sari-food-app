// Petits utilitaires pour le tableau de bord. Les agrégations (sommes,
// comptages, regroupements) sont calculées côté base via des fonctions SQL
// (voir supabase/migrations/0014_dashboard_aggregations.sql) — jamais en
// rapatriant des lignes brutes en JS, pour ne jamais avoir à plafonner le
// nombre d'opérations lues.

export function debutJour(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function ajouterJours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

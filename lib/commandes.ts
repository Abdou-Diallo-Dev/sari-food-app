export const STATUTS_ORDRE = [
  "recue",
  "en_preparation",
  "prete",
  "livree",
  "payee",
  "annulee",
] as const;

export const LABELS_STATUT: Record<string, string> = {
  recue: "Reçue",
  en_preparation: "En préparation",
  prete: "Prête",
  livree: "Livrée",
  payee: "Payée",
  annulee: "Annulée",
};

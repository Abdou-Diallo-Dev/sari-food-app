export const ROLES = [
  "admin",
  "pdg",
  "manager",
  "comptable",
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
  "caissiere",
] as const;

export type RoleUtilisateur = (typeof ROLES)[number];

export const LABELS_ROLE: Record<RoleUtilisateur, string> = {
  admin: "Admin",
  pdg: "PDG",
  manager: "Manager général",
  comptable: "Comptable",
  chef_patisserie: "Chef pâtissier",
  chef_boulangerie: "Chef boulanger",
  chef_fastfood: "Chef cuisinier",
  equipier_patisserie: "Équipier Pâtisserie",
  equipier_boulangerie: "Équipier Boulangerie",
  equipier_fastfood: "Équipier Fast-Food",
  caissiere: "Caisse",
};

// admin/pdg/manager/comptable/caissiere supervisent ou opèrent sans être
// rattachés à un pôle précis ; seuls les rôles cuisine ont un pôle.
export const ROLES_AVEC_POLE: RoleUtilisateur[] = [
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
];

export const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

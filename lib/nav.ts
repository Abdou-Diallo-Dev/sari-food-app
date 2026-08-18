import type { ComponentType } from "react";
import {
  IconChart,
  IconCart,
  IconChefHat,
  IconWallet,
  IconBox,
  IconBook,
  IconAlert,
  IconUsers,
  IconShield,
  IconClipboard,
  IconGauge,
} from "@/components/icons";

export const ROLES_CUISINE = [
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
];

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

// Source unique des pages accessibles par rôle, utilisée à la fois par la
// nav latérale (AppShell) et par les accès rapides de l'accueil, pour
// éviter que les deux se désynchronisent au fil des évolutions.
export function navItemsPour(role: string): NavItem[] {
  const isGestion = role === "admin" || role === "manager";
  const items: NavItem[] = [];

  if (["admin", "pdg", "manager"].includes(role)) {
    items.push({ href: "/dashboard", label: "Tableau de bord", icon: IconChart });
    items.push({ href: "/admin/rapports", label: "Rapports", icon: IconClipboard });
  }
  if (["admin", "manager", "caissiere", "pdg"].includes(role)) {
    items.push({ href: "/pos", label: "Prise de commande", icon: IconCart });
  }
  if (isGestion || role === "pdg" || ROLES_CUISINE.includes(role)) {
    items.push({ href: "/kds", label: "Cuisine", icon: IconChefHat });
  }
  if (role === "caissiere" || isGestion || role === "pdg" || ROLES_CUISINE.includes(role)) {
    items.push({ href: "/production", label: "Production du jour", icon: IconGauge });
  }
  if (role === "caissiere" || isGestion) {
    items.push({ href: "/caisse", label: "Caisse", icon: IconWallet });
  }
  if (isGestion || role === "pdg") {
    items.push({ href: "/admin/caisse", label: "Suivi caisse", icon: IconWallet });
  }
  if (["admin", "manager", "comptable", "pdg"].includes(role)) {
    items.push({ href: "/caisse-globale", label: "Caisse globale", icon: IconWallet });
  }
  if (isGestion || role === "pdg" || ["chef_patisserie", "chef_boulangerie", "chef_fastfood"].includes(role)) {
    items.push({ href: "/stock", label: "Stock", icon: IconBox });
  }
  if (
    ["admin", "manager", "comptable", "pdg", "chef_patisserie", "chef_boulangerie", "chef_fastfood"].includes(
      role,
    )
  ) {
    items.push({ href: "/approvisionnement", label: "Approvisionnement", icon: IconAlert });
  }
  if (isGestion || role === "pdg") {
    items.push({ href: "/admin/produits", label: "Catalogue produits", icon: IconBook });
  }
  if (isGestion || role === "pdg") {
    items.push({ href: "/admin/journal", label: "Journal d'audit", icon: IconShield });
  }
  if (role === "admin") {
    items.push({ href: "/admin/utilisateurs", label: "Utilisateurs", icon: IconUsers });
  }
  return items;
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole } from "@/lib/auth";

const ROLES_AVEC_POLE = [
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
];

function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  return "Une erreur inconnue est survenue.";
}

export async function createRestaurant(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();

  if (!nom) throw new Error("Le nom du restaurant est obligatoire.");

  const supabase = await createClient();
  const { error } = await supabase.from("restaurants").insert({
    nom,
    adresse: adresse || null,
  });

  if (error) {
    throw new Error("Impossible de créer le restaurant : " + error.message);
  }

  revalidatePath("/admin/utilisateurs");
}

export async function createUtilisateur(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const identifiant = String(formData.get("identifiant") ?? "")
    .trim()
    .toLowerCase();
  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  const role = String(formData.get("role") ?? "");
  const poleRaw = String(formData.get("pole") ?? "");
  const pole = ROLES_AVEC_POLE.includes(role) && poleRaw ? poleRaw : null;
  const restaurantIdRaw = String(formData.get("restaurant_id") ?? "");
  const restaurantId = restaurantIdRaw || null;

  if (!nom || !identifiant || !motDePasse || !role) {
    throw new Error("Nom, identifiant, mot de passe et rôle sont obligatoires.");
  }
  if (motDePasse.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }
  if (!/^[a-z0-9._-]+$/.test(identifiant)) {
    throw new Error(
      "L'identifiant ne doit contenir que des lettres, chiffres, points, tirets ou underscores (pas d'espaces ni d'accents). Ex : chef.cuisine",
    );
  }

  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: `${identifiant}@sari.com`,
    password: motDePasse,
    email_confirm: true,
  });

  if (authError || !created.user) {
    throw new Error(
      authError?.message.includes("already been registered")
        ? "Cet identifiant est déjà utilisé."
        : "Impossible de créer le compte : " + (authError?.message ?? "erreur inconnue"),
    );
  }

  const { error: insertError } = await admin.from("utilisateurs").insert({
    id: created.user.id,
    nom,
    identifiant,
    role,
    pole,
    restaurant_id: restaurantId,
    actif: true,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error("Impossible d'enregistrer l'utilisateur : " + insertError.message);
  }

  revalidatePath("/admin/utilisateurs");
}

export async function updateUtilisateur(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const poleRaw = String(formData.get("pole") ?? "");
  const pole = ROLES_AVEC_POLE.includes(role) && poleRaw ? poleRaw : null;
  const restaurantIdRaw = String(formData.get("restaurant_id") ?? "");
  const restaurantId = restaurantIdRaw || null;

  if (!id || !nom || !role) {
    throw new Error("Données invalides.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("utilisateurs")
    .update({ nom, role, pole, restaurant_id: restaurantId })
    .eq("id", id);

  if (error) {
    throw new Error("Impossible de mettre à jour l'utilisateur : " + error.message);
  }

  revalidatePath("/admin/utilisateurs");
}

export async function toggleActifUtilisateur(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");
  const actif = formData.get("actif") === "true";

  if (!id) throw new Error("Utilisateur introuvable.");
  if (id === profile.id) throw new Error("Vous ne pouvez pas désactiver votre propre compte.");

  const supabase = await createClient();
  const { error } = await supabase.from("utilisateurs").update({ actif: !actif }).eq("id", id);

  if (error) {
    throw new Error("Impossible de changer le statut : " + error.message);
  }

  revalidatePath("/admin/utilisateurs");
}

// Action ponctuelle : les comptes créés avant le passage de @sari.local à
// @sari.com gardent leur ancien email d'authentification tant qu'on ne le
// met pas à jour explicitement (createUser ne les touche pas rétroactivement).
// Parcourt TOUTE la table utilisateurs (paginée, sans plafond arbitraire) et
// réaligne l'email Auth de chacun sur `${identifiant}@sari.com`.
export async function migrerEmailsSariCom(): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const admin = createAdminClient();

  const TAILLE_PAGE = 1000;
  let depart = 0;
  const utilisateurs: { id: string; nom: string; identifiant: string | null }[] = [];
  for (;;) {
    const { data, error } = await admin
      .from("utilisateurs")
      .select("id, nom, identifiant")
      .range(depart, depart + TAILLE_PAGE - 1);

    if (error) {
      throw new Error("Impossible de lister les utilisateurs : " + error.message);
    }
    if (!data || data.length === 0) break;
    utilisateurs.push(...data);
    if (data.length < TAILLE_PAGE) break;
    depart += TAILLE_PAGE;
  }

  const erreurs: string[] = [];
  // Sécurité : un identifiant vide/absent produirait un email invalide
  // (ex. "null@sari.com") qui casserait le login de ce compte au lieu de
  // le réparer. On l'ignore et on le signale plutôt que de l'écraser.
  const sansIdentifiant = utilisateurs.filter((u) => !u.identifiant);
  for (const u of utilisateurs.filter((u) => u.identifiant)) {
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      email: `${u.identifiant}@sari.com`,
      email_confirm: true,
    });
    if (error) erreurs.push(`${u.identifiant} : ${error.message}`);
  }

  revalidatePath("/admin/utilisateurs");

  if (sansIdentifiant.length > 0) {
    erreurs.push(
      "Comptes sans identifiant, ignorés (à corriger manuellement) : " +
        sansIdentifiant.map((u) => u.nom).join(", "),
    );
  }

  if (erreurs.length > 0) {
    throw new Error("Migration partielle, erreurs : " + erreurs.join(" · "));
  }
}

export async function reinitialiserMotDePasse(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");
  const motDePasse = String(formData.get("mot_de_passe") ?? "");

  if (!id || motDePasse.length < 8) {
    throw new Error("Le nouveau mot de passe doit contenir au moins 8 caractères.");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: motDePasse });

  if (error) {
    throw new Error(messageErreur(error));
  }

  revalidatePath("/admin/utilisateurs");
}

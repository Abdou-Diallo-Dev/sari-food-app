"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole } from "@/lib/auth";
import { ROLES_AVEC_POLE } from "@/lib/roles";

function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  return "Une erreur inconnue est survenue.";
}

// Comptes créés avant ce format : identifiant = simple préfixe ("fatou.diop"),
// email synthétisé en l'ajoutant "@sari.com". Comptes créés depuis ce format :
// identifiant = déjà l'email complet ("papesarr@sari.com"), utilisé tel quel.
function emailDepuisIdentifiant(identifiant: string): string {
  return identifiant.includes("@") ? identifiant : `${identifiant}@sari.com`;
}

// Toute erreur de validation/métier dans ce fichier redirige ici plutôt que
// de laisser l'exception remonter jusqu'à l'error boundary générique de
// Next.js (écran "Une erreur est survenue" sans détail exploitable).
function redirigerErreur(erreur: unknown): never {
  redirect(`/admin/utilisateurs?erreur=${encodeURIComponent(messageErreur(erreur))}`);
}

export async function createRestaurant(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();

  try {
    if (!nom) throw new Error("Le nom du restaurant est obligatoire.");

    const supabase = await createClient();
    const { error } = await supabase.from("restaurants").insert({
      nom,
      adresse: adresse || null,
    });

    if (error) {
      throw new Error("Impossible de créer le restaurant : " + error.message);
    }
  } catch (erreur) {
    redirigerErreur(erreur);
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
  const pole = ROLES_AVEC_POLE.includes(role as (typeof ROLES_AVEC_POLE)[number]) && poleRaw ? poleRaw : null;
  const restaurantIdRaw = String(formData.get("restaurant_id") ?? "");
  const restaurantId = restaurantIdRaw || null;

  try {
    if (!nom || !identifiant || !motDePasse || !role) {
      throw new Error("Nom, identifiant, mot de passe et rôle sont obligatoires.");
    }
    if (motDePasse.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    }
    if (!/^[a-z0-9._-]+@sari\.com$/.test(identifiant)) {
      throw new Error(
        "L'identifiant doit être au format nom@sari.com (lettres, chiffres, points, tirets ou underscores avant @sari.com). Ex : votre@sari.com",
      );
    }

    const admin = createAdminClient();

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: identifiant,
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
  } catch (erreur) {
    redirigerErreur(erreur);
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
  const pole = ROLES_AVEC_POLE.includes(role as (typeof ROLES_AVEC_POLE)[number]) && poleRaw ? poleRaw : null;
  const restaurantIdRaw = String(formData.get("restaurant_id") ?? "");
  const restaurantId = restaurantIdRaw || null;

  try {
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
  } catch (erreur) {
    redirigerErreur(erreur);
  }

  revalidatePath("/admin/utilisateurs");
}

export async function toggleActifUtilisateur(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");
  const actif = formData.get("actif") === "true";

  try {
    if (!id) throw new Error("Utilisateur introuvable.");
    if (id === profile.id) throw new Error("Vous ne pouvez pas désactiver votre propre compte.");

    const supabase = await createClient();
    const { error } = await supabase.from("utilisateurs").update({ actif: !actif }).eq("id", id);

    if (error) {
      throw new Error("Impossible de changer le statut : " + error.message);
    }
  } catch (erreur) {
    redirigerErreur(erreur);
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
      email: emailDepuisIdentifiant(u.identifiant as string),
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
    redirect(`/admin/utilisateurs?migration=erreur&details=${encodeURIComponent(erreurs.join(" · "))}`);
  }

  const migres = utilisateurs.length - sansIdentifiant.length;
  redirect(`/admin/utilisateurs?migration=ok&count=${migres}`);
}

export async function supprimerUtilisateur(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");

  try {
    if (!id) throw new Error("Utilisateur introuvable.");
    if (id === profile.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");

    const supabase = await createClient();
    const { error } = await supabase.from("utilisateurs").delete().eq("id", id);

    if (error) {
      if (error.code === "23503") {
        throw new Error(
          "Impossible de supprimer : ce compte a un historique (sessions de caisse, commandes, notifications...). Désactivez-le plutôt.",
        );
      }
      throw new Error("Impossible de supprimer l'utilisateur : " + error.message);
    }

    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError) {
      throw new Error(
        "Le compte a été supprimé de la liste mais la suppression de l'accès de connexion a échoué : " +
          authError.message,
      );
    }
  } catch (erreur) {
    redirigerErreur(erreur);
  }

  revalidatePath("/admin/utilisateurs");
}

export async function reinitialiserMotDePasse(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const id = String(formData.get("id") ?? "");
  const motDePasse = String(formData.get("mot_de_passe") ?? "");

  try {
    if (!id || motDePasse.length < 8) {
      throw new Error("Le nouveau mot de passe doit contenir au moins 8 caractères.");
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password: motDePasse });

    if (error) {
      throw new Error(messageErreur(error));
    }
  } catch (erreur) {
    redirigerErreur(erreur);
  }

  revalidatePath("/admin/utilisateurs");
}

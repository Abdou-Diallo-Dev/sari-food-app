import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

// Un compte multi-site (restaurant_id = null : manager général, admin) n'a
// aucun restaurant associé de façon permanente — c'est voulu pour la lecture
// (dashboard, caisse globale...), mais les pages opérationnelles (POS,
// production, planning, ouverture de caisse) ont besoin de savoir POUR QUEL
// restaurant on agit à cet instant. Ce cookie retient ce choix ponctuel
// ("je travaille actuellement sur Mbour"), sans jamais toucher au
// restaurant_id réel du compte.
export const RESTAURANT_ACTIF_COOKIE = "restaurant_actif";

// Restaurant sur lequel une action opérationnelle doit porter : le
// restaurant_id du compte s'il en a un (rôles mono-site, inchangé), sinon le
// restaurant choisi via le switcher (cookie), validé contre la base pour
// écarter un id périmé (restaurant supprimé/renommé depuis).
export async function resolveRestaurantId(profile: Pick<Profile, "restaurant_id">): Promise<string | null> {
  if (profile.restaurant_id) return profile.restaurant_id;

  const store = await cookies();
  const choisi = store.get(RESTAURANT_ACTIF_COOKIE)?.value;
  if (!choisi) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("restaurants").select("id").eq("id", choisi).maybeSingle();
  return data?.id ?? null;
}

export async function listerRestaurants(): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("restaurants").select("id, nom").order("nom");
  return data ?? [];
}

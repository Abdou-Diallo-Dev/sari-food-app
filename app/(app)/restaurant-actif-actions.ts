"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { RESTAURANT_ACTIF_COOKIE } from "@/lib/restaurant-actif";

export async function definirRestaurantActif(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  // Réservé aux comptes multi-site : un compte mono-site opère toujours sur
  // son propre restaurant_id, il n'y a rien à choisir.
  if (profile.restaurant_id) return;

  const restaurantId = String(formData.get("restaurant_id") ?? "");
  const chemin = String(formData.get("chemin") ?? "/");

  const supabase = await createClient();
  const { data } = await supabase.from("restaurants").select("id").eq("id", restaurantId).maybeSingle();
  if (!data) return;

  const store = await cookies();
  store.set(RESTAURANT_ACTIF_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath(chemin);
}

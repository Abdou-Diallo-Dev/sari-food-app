import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RoleType =
  | "admin"
  | "pdg"
  | "manager"
  | "comptable"
  | "chef_patisserie"
  | "chef_boulangerie"
  | "chef_fastfood"
  | "equipier_patisserie"
  | "equipier_boulangerie"
  | "equipier_fastfood"
  | "caissiere";

export type Profile = {
  id: string;
  nom: string;
  role: RoleType;
  pole: "patisserie" | "boulangerie" | "fastfood" | null;
  restaurant_id: string | null;
  actif: boolean;
};

export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("utilisateurs")
    .select("id, nom, role, pole, restaurant_id, actif")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return profile as Profile;
});

export function requireRole(profile: Profile, allowed: RoleType[]) {
  if (!allowed.includes(profile.role)) {
    redirect("/");
  }
}

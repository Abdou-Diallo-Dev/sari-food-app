import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  let restaurantNom: string | null = null;
  if (profile.restaurant_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("nom")
      .eq("id", profile.restaurant_id)
      .single();
    restaurantNom = data?.nom ?? null;
  }

  return (
    <AppShell profile={profile} restaurantNom={restaurantNom}>
      {children}
    </AppShell>
  );
}

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PushSubscribe } from "@/components/PushSubscribe";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  const supabase = await createClient();

  let restaurantNom: string | null = null;
  if (profile.restaurant_id) {
    const { data } = await supabase
      .from("restaurants")
      .select("nom")
      .eq("id", profile.restaurant_id)
      .single();
    restaurantNom = data?.nom ?? null;
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, message, lien, lu, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <>
      <PushSubscribe utilisateurId={profile.id} />
      <AppShell profile={profile} restaurantNom={restaurantNom} notifications={notifications ?? []}>
        {children}
      </AppShell>
    </>
  );
}

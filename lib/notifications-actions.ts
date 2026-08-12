"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function marquerNotificationLue(id: string): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("id", id)
    .eq("destinataire_id", profile.id);

  revalidatePath("/", "layout");
}

export async function marquerToutesLues(): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("destinataire_id", profile.id)
    .eq("lu", false);

  revalidatePath("/", "layout");
}

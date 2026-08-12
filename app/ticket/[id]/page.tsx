import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TicketClient } from "./ticket-client";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  await requireProfile();

  const { id } = await params;
  const { format: formatParam } = await searchParams;
  const format: "80mm" | "a4" = formatParam === "a4" ? "a4" : "80mm";

  const supabase = await createClient();
  const [{ data: commande }, { data: lignes }] = await Promise.all([
    supabase
      .from("commandes")
      .select("numero, canal, total, created_at, restaurants(nom, adresse)")
      .eq("id", id)
      .single(),
    supabase
      .from("lignes_commande")
      .select("quantite, prix_unitaire, produits(nom)")
      .eq("commande_id", id),
  ]);

  if (!commande) {
    return <p className="p-6 text-ink-soft">Commande introuvable.</p>;
  }

  const restaurant = commande.restaurants as unknown as {
    nom: string;
    adresse: string | null;
  } | null;

  return (
    <TicketClient
      format={format}
      commande={{
        numero: commande.numero,
        canal: commande.canal,
        total: Number(commande.total),
        created_at: commande.created_at,
        restaurantNom: restaurant?.nom ?? "Sari Food",
        restaurantAdresse: restaurant?.adresse ?? null,
      }}
      lignes={(lignes ?? []).map((l) => ({
        nom: (l.produits as unknown as { nom: string } | null)?.nom ?? "",
        quantite: l.quantite,
        prix_unitaire: Number(l.prix_unitaire),
      }))}
    />
  );
}

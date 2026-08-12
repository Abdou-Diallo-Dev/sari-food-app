import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PosClient, type ProduitPos } from "./pos-client";
import { LABELS_STATUT } from "@/lib/commandes";

export default async function PosPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere"]);

  if (!profile.restaurant_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-ink-soft">Aucun restaurant associé à ce compte.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: produits } = await supabase
    .from("produits")
    .select("id, nom, prix, actif, categorie_id, categories_produits(nom, pole)")
    .eq("restaurant_id", profile.restaurant_id)
    .eq("actif", true)
    .order("nom");

  const produitsPos: ProduitPos[] = (produits ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    prix: Number(p.prix),
    categorie: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.nom ?? "",
    pole: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.pole as
      | "patisserie"
      | "boulangerie"
      | "fastfood",
  }));

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const { data: commandesJour } = await supabase
    .from("commandes")
    .select("id, numero, canal, statut, total, created_at")
    .eq("restaurant_id", profile.restaurant_id)
    .gte("created_at", debutJournee.toISOString())
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold text-ink">Prise de commande</h1>

      <PosClient produits={produitsPos} />

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold text-ink">
          Commandes du jour ({(commandesJour ?? []).length})
        </h2>
        {(commandesJour ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucune commande aujourd&apos;hui.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(commandesJour ?? []).map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
              >
                <span className="font-bold text-ink">
                  n°{c.numero}{" "}
                  <span className="font-normal text-ink-soft">
                    · {c.canal === "sur_place" ? "Sur place" : "À emporter"} ·{" "}
                    {new Date(c.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="rounded-[7px] bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft">
                    {LABELS_STATUT[c.statut] ?? c.statut}
                  </span>
                  <span className="font-bold text-ink">
                    {Number(c.total).toLocaleString("fr-FR")} F
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

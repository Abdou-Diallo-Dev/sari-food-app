import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PosClient, type ProduitPos } from "./pos-client";
import { CommandesEnLigneAValider, type CommandeAValider } from "./commandes-en-ligne";
import { LABELS_STATUT, LABELS_CANAL } from "@/lib/commandes";
import { IconCart } from "@/components/icons";

export default async function PosPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere", "pdg"]);
  const lectureSeule = profile.role === "pdg";

  if (!profile.restaurant_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-ink-soft">Aucun restaurant associé à ce compte.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: produits }, { data: productionJour }] = await Promise.all([
    supabase
      .from("produits")
      .select("id, nom, prix, actif, categorie_id, image_url, categories_produits(nom, pole)")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("actif", true)
      .order("nom"),
    supabase
      .from("production_jour")
      .select("produit_id, quantite_restante")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("jour", new Date().toISOString().slice(0, 10)),
  ]);

  const produitsEnRupture = new Set(
    (productionJour ?? []).filter((p) => Number(p.quantite_restante) === 0).map((p) => p.produit_id),
  );

  const produitsPos: ProduitPos[] = (produits ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    prix: Number(p.prix),
    imageUrl: p.image_url,
    categorie: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.nom ?? "",
    pole: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.pole as
      | "patisserie"
      | "boulangerie"
      | "fastfood",
    enRupture: produitsEnRupture.has(p.id),
  }));

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const { data: commandesJour } = await supabase
    .from("commandes")
    .select("id, numero, canal, statut, total, created_at")
    .eq("restaurant_id", profile.restaurant_id)
    .gte("created_at", debutJournee.toISOString())
    .order("created_at", { ascending: false });

  const { data: commandesEnLigneBrut } = await supabase
    .from("commandes")
    .select(
      "id, numero, total, created_at, client_nom, client_telephone, adresse_livraison, lignes_commande(produit_id, quantite, produits(nom))",
    )
    .eq("restaurant_id", profile.restaurant_id)
    .eq("canal", "en_ligne")
    .is("confirmation_caisse", null)
    .neq("statut", "annulee")
    .order("created_at", { ascending: true });

  const commandesEnLigne: CommandeAValider[] = (commandesEnLigneBrut ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    total: Number(c.total),
    created_at: c.created_at,
    client_nom: c.client_nom,
    client_telephone: c.client_telephone,
    adresse_livraison: c.adresse_livraison,
    lignes: (
      c.lignes_commande as unknown as {
        produit_id: string;
        quantite: number;
        produits: { nom: string } | null;
      }[]
    ).map((l) => ({
      produitId: l.produit_id,
      nom: l.produits?.nom ?? "Article supprimé",
      quantite: l.quantite,
      enRupture: produitsEnRupture.has(l.produit_id),
    })),
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconCart className="h-6 w-6 text-orange" />
        Prise de commande
      </h1>

      {!lectureSeule && commandesEnLigne.length > 0 && (
        <CommandesEnLigneAValider commandes={commandesEnLigne} />
      )}

      {lectureSeule ? (
        <p className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-sm font-bold text-ink-soft">
          Mode lecture seule — vue supervision. Seules les commandes du jour sont affichées ci-dessous.
        </p>
      ) : (
        <PosClient produits={produitsPos} />
      )}

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
                    · {LABELS_CANAL[c.canal] ?? c.canal} ·{" "}
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

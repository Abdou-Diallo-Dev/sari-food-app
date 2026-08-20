import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveRestaurantId, listerRestaurants } from "@/lib/restaurant-actif";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";
import { definirProduction } from "./actions";
import { IconChefHat } from "@/components/icons";

const ROLES_CHEF = ["chef_patisserie", "chef_boulangerie", "chef_fastfood"] as const;
const ROLES_EQUIPIER = [
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
] as const;

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

const LABELS_POLE: Record<string, string> = {
  patisserie: "Pâtisserie",
  boulangerie: "Boulangerie",
  fastfood: "Fast-Food",
};

type Produit = {
  id: string;
  nom: string;
  pole: "patisserie" | "boulangerie" | "fastfood";
};

type Production = {
  produit_id: string;
  quantite_produite: number;
  quantite_restante: number;
};

type Contribution = { pole: string; quantite_produite: number };

export default async function ProductionPage() {
  const profile = await requireProfile();
  requireRole(profile, [
    "admin",
    "manager",
    "pdg",
    "caissiere",
    ...ROLES_CHEF,
    ...ROLES_EQUIPIER,
  ]);

  const vueTotale = ["admin", "manager", "pdg", "caissiere"].includes(profile.role);
  const peutModifier =
    profile.role === "admin" || profile.role === "manager" || (ROLES_CHEF as readonly string[]).includes(profile.role);
  const peutChoisirPole = profile.role === "admin" || profile.role === "manager";

  const estMultiSite = !profile.restaurant_id;
  const restaurantId = await resolveRestaurantId(profile);
  const restaurants = estMultiSite ? await listerRestaurants() : [];
  const switcher = estMultiSite ? (
    <RestaurantSwitcher restaurants={restaurants} restaurantActifId={restaurantId} chemin="/production" />
  ) : null;

  if (!restaurantId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {switcher}
        <p className="text-ink-soft">Choisissez un restaurant pour voir sa production.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [{ data: produitsData }, { data: productionData }, { data: contributionsData }, { data: objectifsData }] =
    await Promise.all([
      supabase
        .from("produits")
        .select("id, nom, categorie_id, categories_produits(pole)")
        .eq("restaurant_id", restaurantId)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("production_jour")
        .select("produit_id, quantite_produite, quantite_restante")
        .eq("restaurant_id", restaurantId)
        .eq("jour", aujourdhui),
      supabase
        .from("production_jour_contributions")
        .select("produit_id, pole, quantite_produite")
        .eq("restaurant_id", restaurantId)
        .eq("jour", aujourdhui),
      supabase
        .from("objectifs_production")
        .select("produit_id, pole")
        .eq("restaurant_id", restaurantId)
        .eq("jour", aujourdhui),
    ]);

  const tousProduits: Produit[] = (produitsData ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    pole: (p.categories_produits as unknown as { pole: Produit["pole"] } | null)?.pole ?? "patisserie",
  }));

  // Un chef voit ses produits catalogués + ceux pour lesquels le manager lui
  // a assigné une part d'objectif aujourd'hui, même catalogués sous un autre
  // pôle (ex: pain catalogué boulangerie, objectif partagé avec fast-food).
  const produitsAssignesAMonPole = new Set(
    (objectifsData ?? []).filter((o) => o.pole === profile.pole).map((o) => o.produit_id),
  );

  const produits = vueTotale
    ? tousProduits
    : tousProduits.filter((p) => p.pole === profile.pole || produitsAssignesAMonPole.has(p.id));

  const productionParProduit = new Map<string, Production>(
    (productionData ?? []).map((p) => [p.produit_id, p]),
  );

  const contributionsParProduit = new Map<string, Contribution[]>();
  for (const c of contributionsData ?? []) {
    const liste = contributionsParProduit.get(c.produit_id) ?? [];
    liste.push(c);
    contributionsParProduit.set(c.produit_id, liste);
  }

  const polesAffiches = vueTotale ? POLES : POLES.filter((p) => p.value === profile.pole);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconChefHat className="h-6 w-6 text-orange" />
        Production du jour
      </h1>

      {switcher}

      {polesAffiches.map((pole) => {
        // Vue chef : un seul pôle affiché de toute façon, mais la liste peut
        // inclure des produits catalogués ailleurs (assignation croisée) —
        // pas de filtre par pôle catalogue dans ce cas.
        const items = vueTotale ? produits.filter((p) => p.pole === pole.value) : produits;
        if (items.length === 0) return null;

        return (
          <section key={pole.value} className="rounded-card border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-lg font-extrabold text-orange">{pole.label}</h2>

            <div className="flex flex-col gap-2">
              {items.map((p) => {
                const prod = productionParProduit.get(p.id);
                const produite = prod ? Number(prod.quantite_produite) : null;
                const restante = prod ? Number(prod.quantite_restante) : null;
                const enRupture = prod !== undefined && restante === 0;
                const pourcentage =
                  produite && produite > 0 ? Math.min(100, Math.max(0, ((restante ?? 0) / produite) * 100)) : 0;

                const contributions = contributionsParProduit.get(p.id) ?? [];
                const plusieursPoles = contributions.length > 1;
                const maContribution = contributions.find((c) => c.pole === profile.pole);

                return (
                  <div
                    key={p.id}
                    className={`rounded-[10px] border p-3 ${
                      enRupture ? "border-red-300 bg-red-50" : "border-line bg-paper"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-bold text-ink">{p.nom}</span>
                      {prod ? (
                        <span className={`text-sm font-bold ${enRupture ? "text-red-600" : "text-ink"}`}>
                          {enRupture ? "Rupture" : `${restante} / ${produite}`}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-soft opacity-60">Non renseigné</span>
                      )}
                    </div>

                    {produite !== null && produite > 0 && (
                      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-line/40">
                        <div
                          className={`h-2 rounded-full transition-all ${enRupture ? "bg-red-500" : "bg-green"}`}
                          style={{ width: `${pourcentage}%` }}
                        />
                      </div>
                    )}

                    {plusieursPoles && (
                      <p className="mb-2 text-xs text-ink-soft opacity-80">
                        {contributions.map((c) => `${LABELS_POLE[c.pole]} : ${c.quantite_produite}`).join(" · ")}
                      </p>
                    )}

                    {peutModifier && (
                      <form action={definirProduction} className="flex flex-wrap items-center gap-2 pt-1">
                        <input type="hidden" name="produit_id" value={p.id} />
                        {peutChoisirPole ? (
                          <select
                            name="pole"
                            defaultValue={p.pole}
                            className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
                          >
                            {POLES.map((pl) => (
                              <option key={pl.value} value={pl.value}>
                                {pl.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input type="hidden" name="pole" value={profile.pole ?? p.pole} />
                        )}
                        <input
                          type="number"
                          name="quantite_produite"
                          required
                          min={0}
                          step={1}
                          defaultValue={peutChoisirPole ? "" : maContribution?.quantite_produite ?? ""}
                          placeholder="Quantité produite aujourd'hui"
                          className="w-48 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                        />
                        <button
                          type="submit"
                          className="rounded-[8px] bg-orange px-3 py-1 text-sm font-bold text-white"
                        >
                          {prod ? "Mettre à jour" : "Définir"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

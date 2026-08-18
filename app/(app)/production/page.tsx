import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

  if (!profile.restaurant_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-ink-soft">Aucun restaurant associé à ce compte.</p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: produitsData } = await supabase
    .from("produits")
    .select("id, nom, categorie_id, categories_produits(pole)")
    .eq("restaurant_id", profile.restaurant_id)
    .eq("actif", true)
    .order("nom");

  const tousProduits: Produit[] = (produitsData ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    pole: (p.categories_produits as unknown as { pole: Produit["pole"] } | null)?.pole ?? "patisserie",
  }));

  const produits = vueTotale ? tousProduits : tousProduits.filter((p) => p.pole === profile.pole);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data: productionData } = await supabase
    .from("production_jour")
    .select("produit_id, quantite_produite, quantite_restante")
    .eq("restaurant_id", profile.restaurant_id)
    .eq("jour", aujourdhui);

  const productionParProduit = new Map<string, Production>(
    (productionData ?? []).map((p) => [p.produit_id, p]),
  );

  const polesAffiches = vueTotale ? POLES : POLES.filter((p) => p.value === profile.pole);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconChefHat className="h-6 w-6 text-orange" />
        Production du jour
      </h1>

      {polesAffiches.map((pole) => {
        const items = produits.filter((p) => p.pole === pole.value);
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

                    {peutModifier && (
                      <form action={definirProduction} className="flex flex-wrap items-center gap-2 pt-1">
                        <input type="hidden" name="produit_id" value={p.id} />
                        <input
                          type="number"
                          name="quantite_produite"
                          required
                          min={0}
                          step={1}
                          defaultValue={produite ?? ""}
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

import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createIngredient, enregistrerMouvement } from "./actions";

const CATEGORIES = [
  { value: "matiere_premiere", label: "Matière première" },
  { value: "consommable_emballage", label: "Consommable / emballage" },
] as const;

export default async function StockPage() {
  const profile = await requireProfile();
  requireRole(profile, [
    "admin",
    "manager",
    "chef_patisserie",
    "chef_boulangerie",
    "chef_fastfood",
  ]);

  const peutCreerIngredient = profile.role === "admin" || profile.role === "manager";

  const supabase = await createClient();
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, nom, categorie, unite, stock_actuel, seuil_alerte")
    .order("nom");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold text-ink">Stock</h1>

      {CATEGORIES.map((cat) => {
        const items = (ingredients ?? []).filter((i) => i.categorie === cat.value);
        if (items.length === 0 && !peutCreerIngredient) return null;

        return (
          <section key={cat.value} className="rounded-card border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-lg font-extrabold text-orange">{cat.label}</h2>

            <div className="flex flex-col gap-2">
              {items.map((ing) => {
                const stock = Number(ing.stock_actuel);
                const seuil = Number(ing.seuil_alerte);
                const enAlerte = stock <= seuil;

                return (
                  <div
                    key={ing.id}
                    className={`rounded-[10px] border p-3 ${
                      enAlerte ? "border-red-300 bg-red-50" : "border-line bg-paper"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-bold text-ink">{ing.nom}</span>
                      <span
                        className={`text-sm font-bold ${enAlerte ? "text-red-600" : "text-ink"}`}
                      >
                        {stock.toLocaleString("fr-FR")} {ing.unite}
                        {enAlerte && " ⚠"}
                      </span>
                    </div>
                    <span className="mb-2 block text-xs text-ink-soft opacity-70">
                      Seuil d&apos;alerte : {seuil.toLocaleString("fr-FR")} {ing.unite}
                    </span>

                    <form action={enregistrerMouvement} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="ingredient_id" value={ing.id} />
                      <select
                        name="type"
                        required
                        className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
                      >
                        <option value="entree">Entrée</option>
                        <option value="sortie">Sortie</option>
                        <option value="ajustement">Ajustement (valeur exacte)</option>
                      </select>
                      <input
                        type="number"
                        name="quantite"
                        required
                        min={0}
                        step="0.01"
                        placeholder="Quantité"
                        className="w-24 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <input
                        type="text"
                        name="motif"
                        placeholder="Motif (optionnel)"
                        className="min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <button
                        type="submit"
                        className="rounded-[8px] bg-orange px-3 py-1 text-sm font-bold text-white"
                      >
                        Enregistrer
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>

            {peutCreerIngredient && (
              <form
                action={createIngredient}
                className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3"
              >
                <input type="hidden" name="categorie" value={cat.value} />
                <input
                  type="text"
                  name="nom"
                  required
                  placeholder="Nom de l'ingrédient"
                  className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                />
                <input
                  type="text"
                  name="unite"
                  required
                  placeholder="Unité (kg, L, pièce...)"
                  className="w-32 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                />
                <input
                  type="number"
                  name="seuil_alerte"
                  required
                  min={0}
                  step="0.01"
                  placeholder="Seuil d'alerte"
                  className="w-32 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                />
                <button
                  type="submit"
                  className="rounded-[9px] border border-line px-3 py-1.5 text-sm font-bold text-ink hover:border-orange hover:text-orange"
                >
                  Ajouter
                </button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}

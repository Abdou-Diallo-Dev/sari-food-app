import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveRestaurantId, listerRestaurants } from "@/lib/restaurant-actif";
import { RestaurantSwitcher } from "@/components/RestaurantSwitcher";
import {
  createIngredient,
  updateIngredient,
  deleteIngredient,
  enregistrerMouvement,
  declencherDemande,
} from "./actions";
import { IconBox, IconCheck, IconTrash } from "@/components/icons";

const CATEGORIES = [
  { value: "matiere_premiere", label: "Matière première" },
  { value: "consommable_emballage", label: "Consommable / emballage" },
] as const;

export default async function StockPage() {
  const profile = await requireProfile();
  requireRole(profile, [
    "admin",
    "manager",
    "pdg",
    "chef_patisserie",
    "chef_boulangerie",
    "chef_fastfood",
  ]);

  const lectureSeule = profile.role === "pdg";
  const peutCreerIngredient = profile.role === "admin" || profile.role === "manager";
  const peutDemanderAppro = [
    "chef_patisserie",
    "chef_boulangerie",
    "chef_fastfood",
    "manager",
    "admin",
  ].includes(profile.role);

  const estMultiSite = !profile.restaurant_id;
  const restaurantId = await resolveRestaurantId(profile);
  const restaurants = estMultiSite ? await listerRestaurants() : [];
  const switcher = estMultiSite ? (
    <RestaurantSwitcher restaurants={restaurants} restaurantActifId={restaurantId} chemin="/stock" />
  ) : null;

  const supabase = await createClient();

  if (!restaurantId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {switcher}
        <p className="text-ink-soft">Choisissez un restaurant pour voir son stock.</p>
      </div>
    );
  }

  const [{ data: ingredients }, { data: demandesEnCours }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, nom, categorie, unite, stock_actuel, seuil_alerte, stock_max, cout_unitaire, actif")
      .eq("restaurant_id", restaurantId)
      .eq("actif", true)
      .order("nom"),
    peutDemanderAppro
      ? supabase
          .from("demandes_approvisionnement")
          .select("ingredient_id")
          .eq("chef_id", profile.id)
          .not("statut", "in", "(rejetee,receptionnee)")
      : Promise.resolve({ data: [] as { ingredient_id: string }[] }),
  ]);

  const ingredientsAvecDemandeEnCours = new Set(
    (demandesEnCours ?? []).map((d) => d.ingredient_id),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconBox className="h-6 w-6 text-orange" />
        Stock
      </h1>

      {switcher}

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
                const reference =
                  ing.stock_max && Number(ing.stock_max) > 0
                    ? Number(ing.stock_max)
                    : Math.max(seuil * 2, stock, 1);
                const pourcentageStock = Math.min(100, Math.max(0, (stock / reference) * 100));
                const pourcentageSeuil = Math.min(100, Math.max(0, (seuil / reference) * 100));

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

                    <div className="relative mb-1 h-2 w-full overflow-visible rounded-full bg-line/40">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          enAlerte ? "bg-red-500" : "bg-green"
                        }`}
                        style={{ width: `${pourcentageStock}%` }}
                      />
                      <div
                        className="absolute top-[-2px] h-3 w-[2px] bg-ink-soft/70"
                        title={`Seuil d'alerte : ${seuil.toLocaleString("fr-FR")} ${ing.unite}`}
                        style={{ left: `${pourcentageSeuil}%` }}
                      />
                    </div>
                    <span className="mb-2 block text-xs text-ink-soft opacity-70">
                      Seuil d&apos;alerte : {seuil.toLocaleString("fr-FR")} {ing.unite}
                      {ing.stock_max ? ` · Référence : ${Number(ing.stock_max).toLocaleString("fr-FR")} ${ing.unite}` : ""}
                      {` · Coût : ${Number(ing.cout_unitaire).toLocaleString("fr-FR")} F/${ing.unite}`}
                    </span>

                    {peutCreerIngredient && (
                      <form
                        className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-line pb-2"
                      >
                        <input type="hidden" name="id" value={ing.id} />
                        <input
                          type="text"
                          name="nom"
                          defaultValue={ing.nom}
                          className="min-w-0 flex-1 rounded-[7px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-bold text-ink hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                        />
                        <input
                          type="text"
                          name="unite"
                          defaultValue={ing.unite}
                          className="w-16 rounded-[7px] border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                        />
                        <input
                          type="number"
                          name="seuil_alerte"
                          defaultValue={seuil}
                          min={0}
                          step="0.01"
                          title="Seuil d'alerte"
                          className="w-20 rounded-[7px] border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                        />
                        <input
                          type="number"
                          name="stock_max"
                          defaultValue={ing.stock_max ?? ""}
                          min={0}
                          step="0.01"
                          placeholder="Réf. max"
                          title="Quantité de référence pour la barre de suivi"
                          className="w-20 rounded-[7px] border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink placeholder:text-ink-soft placeholder:opacity-60 hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                        />
                        <input
                          type="number"
                          name="cout_unitaire"
                          defaultValue={ing.cout_unitaire}
                          min={0}
                          step="0.01"
                          placeholder="Coût/unité"
                          title="Coût d'achat par unité (F)"
                          className="w-20 rounded-[7px] border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink placeholder:text-ink-soft placeholder:opacity-60 hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                        />
                        <button
                          formAction={updateIngredient}
                          type="submit"
                          title="Enregistrer"
                          className="rounded-[7px] p-1 text-ink-soft hover:text-orange"
                        >
                          <IconCheck className="h-4 w-4" />
                        </button>
                        <button
                          formAction={deleteIngredient}
                          type="submit"
                          title="Supprimer l'ingrédient"
                          className="rounded-[7px] p-1 text-ink-soft hover:text-red-600"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </form>
                    )}

                    {!lectureSeule && (
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
                    )}

                    {peutDemanderAppro && (
                      <form
                        action={declencherDemande}
                        className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2"
                      >
                        <input type="hidden" name="ingredient_id" value={ing.id} />
                        {ingredientsAvecDemandeEnCours.has(ing.id) ? (
                          <span className="text-xs font-bold text-orange">
                            Demande de réapprovisionnement déjà en cours
                          </span>
                        ) : (
                          <>
                            <input
                              type="number"
                              name="quantite_demandee"
                              required
                              min={0.001}
                              step="0.001"
                              placeholder={`Quantité à demander (${ing.unite})`}
                              className="w-40 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                            />
                            <button
                              type="submit"
                              className="rounded-[8px] border border-orange px-3 py-1 text-sm font-bold text-orange hover:bg-orange hover:text-white"
                            >
                              Demander un réapprovisionnement
                            </button>
                          </>
                        )}
                      </form>
                    )}
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
                <input
                  type="number"
                  name="stock_max"
                  min={0}
                  step="0.01"
                  placeholder="Quantité de référence (optionnel)"
                  className="w-48 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                />
                <input
                  type="number"
                  name="cout_unitaire"
                  min={0}
                  step="0.01"
                  placeholder="Coût/unité (optionnel)"
                  title="Coût d'achat par unité (F)"
                  className="w-40 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
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

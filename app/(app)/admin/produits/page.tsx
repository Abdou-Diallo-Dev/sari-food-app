import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCategorie,
  createProduit,
  updateCategorie,
  deleteCategorie,
  updateProduit,
  deleteProduit,
  upsertRecetteIngredient,
  deleteRecetteIngredient,
} from "./actions";
import { IconBook, IconCheck, IconTrash, IconPlus } from "@/components/icons";

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

type Produit = {
  id: string;
  nom: string;
  prix: number;
  actif: boolean;
  categorie_id: string;
};

type Categorie = {
  id: string;
  nom: string;
  pole: string;
  produits: Produit[];
};

type Ingredient = { id: string; nom: string; unite: string };
type LigneRecette = { ingredient_id: string; quantite_utilisee: number };

export default async function ProduitsPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const supabase = await createClient();
  const [{ data: categories }, { data: produits }, { data: ingredients }, { data: recettes }] =
    await Promise.all([
      supabase
        .from("categories_produits")
        .select("id, nom, pole")
        .order("nom"),
      supabase
        .from("produits")
        .select("id, nom, prix, actif, categorie_id")
        .order("nom"),
      supabase
        .from("ingredients")
        .select("id, nom, unite")
        .order("nom"),
      supabase
        .from("recettes")
        .select("produit_id, ingredient_id, quantite_utilisee"),
    ]);

  const categoriesParPole: Record<string, Categorie[]> = {
    patisserie: [],
    boulangerie: [],
    fastfood: [],
  };

  for (const c of categories ?? []) {
    categoriesParPole[c.pole]?.push({
      ...c,
      produits: (produits ?? []).filter((p) => p.categorie_id === c.id),
    });
  }

  const ingredientsParId = new Map<string, Ingredient>((ingredients ?? []).map((i) => [i.id, i]));
  const recetteParProduit = new Map<string, LigneRecette[]>();
  for (const r of recettes ?? []) {
    const liste = recetteParProduit.get(r.produit_id) ?? [];
    liste.push(r);
    recetteParProduit.set(r.produit_id, liste);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconBook className="h-6 w-6 text-orange" />
        Catalogue produits
      </h1>

      {POLES.map((pole) => (
        <section
          key={pole.value}
          className="rounded-card border border-line bg-surface p-5"
        >
          <h2 className="mb-4 font-display text-lg font-extrabold text-orange">{pole.label}</h2>

          <div className="flex flex-col gap-4">
            {categoriesParPole[pole.value].map((cat) => (
              <div key={cat.id} className="rounded-[14px] border border-line bg-paper p-4">
                <form className="mb-2 flex items-center gap-2">
                  <input type="hidden" name="id" value={cat.id} />
                  <input
                    type="text"
                    name="nom"
                    defaultValue={cat.nom}
                    className="min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 font-bold text-ink hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                  />
                  <button
                    formAction={updateCategorie}
                    type="submit"
                    title="Enregistrer le nom"
                    className="rounded-[8px] p-1.5 text-ink-soft hover:text-orange"
                  >
                    <IconCheck className="h-4 w-4" />
                  </button>
                  <button
                    formAction={deleteCategorie}
                    type="submit"
                    disabled={cat.produits.length > 0}
                    title={
                      cat.produits.length > 0
                        ? "Retirez d'abord tous les produits de cette catégorie pour pouvoir la supprimer"
                        : "Supprimer la catégorie"
                    }
                    className="rounded-[8px] p-1.5 text-ink-soft hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-soft"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </form>

                {cat.produits.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {cat.produits.map((p) => {
                      const ligneRecette = recetteParProduit.get(p.id) ?? [];
                      const ingredientsDejaUtilises = new Set(
                        ligneRecette.map((l) => l.ingredient_id),
                      );
                      const ingredientsDisponibles = (ingredients ?? []).filter(
                        (i) => !ingredientsDejaUtilises.has(i.id),
                      );

                      return (
                        <li key={p.id}>
                          <form className="flex items-center gap-2 text-sm text-ink">
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="text"
                              name="nom"
                              defaultValue={p.nom}
                              className={`min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 hover:border-line focus:border-orange focus:bg-surface focus:outline-none ${p.actif ? "" : "text-ink-soft line-through"}`}
                            />
                            <input
                              type="number"
                              name="prix"
                              defaultValue={p.prix}
                              min={1}
                              step={1}
                              className="w-20 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-right font-bold hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                            />
                            <button
                              formAction={updateProduit}
                              type="submit"
                              title="Enregistrer"
                              className="rounded-[8px] p-1.5 text-ink-soft hover:text-orange"
                            >
                              <IconCheck className="h-4 w-4" />
                            </button>
                            <button
                              formAction={deleteProduit}
                              type="submit"
                              title="Supprimer le produit"
                              className="rounded-[8px] p-1.5 text-ink-soft hover:text-red-600"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </form>

                          <details className="ml-1.5 mt-1">
                            <summary className="cursor-pointer text-xs font-bold text-ink-soft hover:text-orange">
                              Recette ({ligneRecette.length} ingrédient{ligneRecette.length > 1 ? "s" : ""})
                            </summary>
                            <div className="mt-2 flex flex-col gap-1.5 rounded-[10px] bg-paper p-2.5">
                              {ligneRecette.length > 0 && (
                                <ul className="flex flex-col gap-1">
                                  {ligneRecette.map((l) => {
                                    const ing = ingredientsParId.get(l.ingredient_id);
                                    return (
                                      <li
                                        key={l.ingredient_id}
                                        className="flex items-center justify-between gap-2 text-xs text-ink"
                                      >
                                        <span>
                                          {ing?.nom ?? "Ingrédient supprimé"} — {l.quantite_utilisee}{" "}
                                          {ing?.unite}
                                        </span>
                                        <form action={deleteRecetteIngredient}>
                                          <input type="hidden" name="produit_id" value={p.id} />
                                          <input
                                            type="hidden"
                                            name="ingredient_id"
                                            value={l.ingredient_id}
                                          />
                                          <button
                                            type="submit"
                                            title="Retirer de la recette"
                                            className="rounded-[6px] p-1 text-ink-soft hover:text-red-600"
                                          >
                                            <IconTrash className="h-3.5 w-3.5" />
                                          </button>
                                        </form>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}

                              {ingredientsDisponibles.length > 0 && (
                                <form
                                  action={upsertRecetteIngredient}
                                  className="flex items-center gap-1.5"
                                >
                                  <input type="hidden" name="produit_id" value={p.id} />
                                  <select
                                    name="ingredient_id"
                                    required
                                    className="min-w-0 flex-1 rounded-[7px] border border-line bg-surface px-1.5 py-1 text-xs text-ink"
                                  >
                                    {ingredientsDisponibles.map((i) => (
                                      <option key={i.id} value={i.id}>
                                        {i.nom} ({i.unite})
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    name="quantite_utilisee"
                                    required
                                    min={0.001}
                                    step="0.001"
                                    placeholder="Qté"
                                    className="w-16 rounded-[7px] border border-line bg-surface px-1.5 py-1 text-xs text-ink placeholder:text-ink-soft placeholder:opacity-60"
                                  />
                                  <button
                                    type="submit"
                                    title="Ajouter à la recette"
                                    className="rounded-[7px] bg-orange p-1 text-white"
                                  >
                                    <IconPlus className="h-3.5 w-3.5" />
                                  </button>
                                </form>
                              )}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <form action={createProduit} className="flex gap-2">
                  <input type="hidden" name="categorie_id" value={cat.id} />
                  <input
                    type="text"
                    name="nom"
                    required
                    placeholder="Nom du produit"
                    className="min-w-0 flex-1 rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                  />
                  <input
                    type="number"
                    name="prix"
                    required
                    min={1}
                    step={1}
                    placeholder="Prix"
                    className="w-24 rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                  />
                  <button
                    type="submit"
                    title="Ajouter le produit"
                    className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white"
                  >
                    <IconPlus className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}

            <form
              action={createCategorie}
              className="flex gap-2 border-t border-line pt-3"
            >
              <input type="hidden" name="pole" value={pole.value} />
              <input
                type="text"
                name="nom"
                required
                placeholder="Nouvelle catégorie"
                className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
              />
              <button
                type="submit"
                className="rounded-[9px] border border-line px-3 py-1.5 text-sm font-bold text-ink hover:border-orange hover:text-orange"
              >
                Ajouter catégorie
              </button>
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}

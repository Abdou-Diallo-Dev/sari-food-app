import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCategorie,
  createProduit,
  updateCategorie,
  deleteCategorie,
  updateProduit,
  deleteProduit,
} from "./actions";

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

export default async function ProduitsPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const supabase = await createClient();
  const [{ data: categories }, { data: produits }] = await Promise.all([
    supabase
      .from("categories_produits")
      .select("id, nom, pole")
      .order("nom"),
    supabase
      .from("produits")
      .select("id, nom, prix, actif, categorie_id")
      .order("nom"),
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-2xl font-extrabold text-ink">Catalogue produits</h1>

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
                    className="rounded-[8px] px-1.5 py-1 text-xs font-bold text-ink-soft hover:text-orange"
                  >
                    ✓
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
                    className="rounded-[8px] px-1.5 py-1 text-xs font-bold text-ink-soft hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-soft"
                  >
                    ✕
                  </button>
                </form>

                {cat.produits.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {cat.produits.map((p) => (
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
                            className="rounded-[8px] px-1.5 py-1 text-xs font-bold text-ink-soft hover:text-orange"
                          >
                            ✓
                          </button>
                          <button
                            formAction={deleteProduit}
                            type="submit"
                            title="Supprimer le produit"
                            className="rounded-[8px] px-1.5 py-1 text-xs font-bold text-ink-soft hover:text-red-600"
                          >
                            ✕
                          </button>
                        </form>
                      </li>
                    ))}
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
                    className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white"
                  >
                    +
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

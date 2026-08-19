import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCategorie,
  createProduit,
  updateCategorie,
  deleteCategorie,
  updateProduit,
  deleteProduit,
  toggleProduitActif,
} from "./actions";
import { PhotoPicker } from "./photo-picker";
import { IconBook, IconCheck, IconTrash, IconImage } from "@/components/icons";

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
  image_url: string | null;
  cout_points: number | null;
};

type Categorie = {
  id: string;
  nom: string;
  pole: string;
  produits: Produit[];
};

export default async function ProduitsPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "pdg"]);
  const lectureSeule = profile.role === "pdg";

  const supabase = await createClient();
  const [{ data: categories }, { data: produits }] = await Promise.all([
    supabase
      .from("categories_produits")
      .select("id, nom, pole")
      .order("nom"),
    supabase
      .from("produits")
      .select("id, nom, prix, actif, categorie_id, image_url, cout_points")
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
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
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

          <div className="flex flex-col gap-5">
            {categoriesParPole[pole.value].map((cat) => (
              <div key={cat.id} className="rounded-[14px] border border-line bg-paper p-4">
                {lectureSeule ? (
                  <p className="mb-3 font-bold text-ink">{cat.nom}</p>
                ) : (
                  <form className="mb-3 flex items-center gap-2">
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
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {cat.produits.map((p) =>
                    lectureSeule ? (
                      <div
                        key={p.id}
                        className="flex flex-col items-center gap-2 rounded-[12px] border border-line bg-surface p-3 text-center"
                      >
                        <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[12px] bg-paper text-ink-soft">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image_url}
                              alt={p.nom}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <IconImage className="h-6 w-6 opacity-40" />
                          )}
                        </div>
                        <span
                          className={`text-sm font-bold text-ink ${p.actif ? "" : "text-ink-soft line-through"}`}
                        >
                          {p.nom}
                        </span>
                        <span className="text-xs font-bold text-orange">
                          {p.prix.toLocaleString("fr-FR")} F
                        </span>
                        {p.cout_points && (
                          <span className="text-[.65rem] font-bold text-green">
                            🎁 {p.cout_points} pts
                          </span>
                        )}
                      </div>
                    ) : (
                      <form
                        key={p.id}
                        className="flex flex-col items-center gap-2 rounded-[12px] border border-line bg-surface p-3 text-center"
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <PhotoPicker name="photo" currentUrl={p.image_url} />
                        <input
                          type="text"
                          name="nom"
                          defaultValue={p.nom}
                          className={`w-full min-w-0 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-center text-sm font-bold text-ink hover:border-line focus:border-orange focus:bg-paper focus:outline-none ${p.actif ? "" : "text-ink-soft line-through"}`}
                        />
                        <input
                          type="number"
                          name="prix"
                          defaultValue={p.prix}
                          min={1}
                          step={1}
                          className="w-full min-w-0 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-center text-sm font-bold text-orange hover:border-line focus:border-orange focus:bg-paper focus:outline-none"
                        />
                        <input
                          type="number"
                          name="cout_points"
                          defaultValue={p.cout_points ?? ""}
                          min={1}
                          step={1}
                          placeholder="Coût en points (optionnel)"
                          title="Coût en points pour l'échanger gratuitement — laisser vide pour ne pas le rendre échangeable"
                          className="w-full min-w-0 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-center text-xs text-green placeholder:text-ink-soft placeholder:opacity-60 hover:border-line focus:border-orange focus:bg-paper focus:outline-none"
                        />
                        <button
                          formAction={toggleProduitActif.bind(null, p.id, !p.actif)}
                          type="submit"
                          title={
                            p.actif
                              ? "En ligne — cliquer pour masquer du menu client"
                              : "Masqué — cliquer pour remettre en ligne"
                          }
                          className={`rounded-full px-2 py-0.5 text-[.65rem] font-bold uppercase tracking-wide transition ${
                            p.actif
                              ? "bg-green/15 text-green hover:bg-green/25"
                              : "bg-line/40 text-ink-soft hover:bg-line/60"
                          }`}
                        >
                          {p.actif ? "En ligne" : "Masqué"}
                        </button>

                        <div className="flex items-center gap-1">
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
                        </div>
                      </form>
                    ),
                  )}

                  {!lectureSeule && (
                    <form
                      action={createProduit}
                      className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-line p-3 text-center"
                    >
                      <input type="hidden" name="categorie_id" value={cat.id} />
                      <PhotoPicker name="photo" />
                      <input
                        type="text"
                        name="nom"
                        required
                        placeholder="Nom du produit"
                        className="w-full min-w-0 rounded-[8px] border border-line bg-paper px-2 py-1 text-center text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <input
                        type="number"
                        name="prix"
                        required
                        min={1}
                        step={1}
                        placeholder="Prix"
                        className="w-full min-w-0 rounded-[8px] border border-line bg-paper px-2 py-1 text-center text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <input
                        type="number"
                        name="cout_points"
                        min={1}
                        step={1}
                        placeholder="Coût en points (optionnel)"
                        className="w-full min-w-0 rounded-[8px] border border-line bg-paper px-2 py-1 text-center text-xs text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <button
                        type="submit"
                        title="Ajouter le produit"
                        className="rounded-[8px] bg-orange px-3 py-1 text-xs font-bold text-white"
                      >
                        Ajouter
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}

            {!lectureSeule && (
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
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

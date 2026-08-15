import { createPublicClient } from "@/lib/supabase/public";
import { MenuClient } from "./menu-client";
import type { ProduitMenu } from "@/lib/types";

export default async function AccueilPage() {
  const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID;

  if (!restaurantId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-ink-soft">Configuration manquante (NEXT_PUBLIC_RESTAURANT_ID).</p>
      </div>
    );
  }

  const supabase = createPublicClient();
  const { data: produits } = await supabase
    .from("produits")
    .select("id, nom, prix, actif, categorie_id, categories_produits(nom, pole)")
    .eq("restaurant_id", restaurantId)
    .eq("actif", true)
    .order("nom");

  const produitsMenu: ProduitMenu[] = (produits ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    prix: Number(p.prix),
    categorie: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.nom ?? "",
    pole: (p.categories_produits as unknown as { nom: string; pole: string } | null)?.pole as
      | "patisserie"
      | "boulangerie"
      | "fastfood",
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold text-ink">Sari Food</h1>
        <span className="text-sm text-ink-soft">Commander en ligne</span>
      </header>

      {produitsMenu.length === 0 ? (
        <p className="text-sm text-ink-soft opacity-70">
          Le menu n&apos;est pas disponible pour le moment.
        </p>
      ) : (
        <MenuClient produits={produitsMenu} />
      )}
    </div>
  );
}

import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ObjectifForm } from "./objectif-form";
import { IconTarget, IconArrowLeft } from "@/components/icons";

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

function decalerJour(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "pdg"]);
  const lectureSeule = profile.role === "pdg";

  if (!profile.restaurant_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-ink-soft">Aucun restaurant associé à ce compte.</p>
      </div>
    );
  }

  const { date } = await searchParams;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const jour = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : aujourdhui;

  const supabase = await createClient();
  const [{ data: produits }, { data: objectifs }, { data: contributions }] = await Promise.all([
    supabase
      .from("produits")
      .select("id, nom")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("actif", true)
      .order("nom"),
    supabase
      .from("objectifs_production")
      .select("produit_id, pole, quantite_prevue")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("jour", jour),
    supabase
      .from("production_jour_contributions")
      .select("produit_id, pole, quantite_produite")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("jour", jour),
  ]);

  const objectifsParProduit = new Map<string, Record<string, number>>();
  for (const o of objectifs ?? []) {
    const m = objectifsParProduit.get(o.produit_id) ?? {};
    m[o.pole] = Number(o.quantite_prevue);
    objectifsParProduit.set(o.produit_id, m);
  }

  const realiseParProduit = new Map<string, Record<string, number>>();
  for (const c of contributions ?? []) {
    const m = realiseParProduit.get(c.produit_id) ?? {};
    m[c.pole] = Number(c.quantite_produite);
    realiseParProduit.set(c.produit_id, m);
  }

  // Le manager voit tous les produits actifs pour pouvoir en planifier un
  // nouveau à tout moment. Le PDG (lecture seule) ne voit que ce qui est
  // déjà planifié pour cette date — pas d'intérêt à afficher des formulaires
  // vides qu'il ne peut pas remplir. La pâtisserie qui produit librement
  // sans objectif n'a pas besoin d'apparaître ici (cf. tâche 1) : elle reste
  // gérée sur /production.
  const produitsPlanifies = (produits ?? []).filter(
    (p) => objectifsParProduit.has(p.id) || realiseParProduit.has(p.id),
  );

  const produitsAffiches = lectureSeule ? produitsPlanifies : produits ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconTarget className="h-6 w-6 text-orange" />
        Planning production
      </h1>

      <div className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-3">
        <a
          href={`/admin/planning?date=${decalerJour(jour, -1)}`}
          className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-orange"
        >
          <IconArrowLeft className="h-4 w-4" /> Veille
        </a>
        <form action="/admin/planning" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={jour}
            max={aujourdhui}
            className="rounded-[8px] border border-line bg-paper px-2 py-1 text-sm text-ink"
          />
          <button type="submit" className="text-sm font-bold text-orange hover:underline">
            Voir
          </button>
        </form>
        {jour < aujourdhui ? (
          <a
            href={`/admin/planning?date=${decalerJour(jour, 1)}`}
            className="text-sm font-bold text-ink-soft hover:text-orange"
          >
            Lendemain →
          </a>
        ) : (
          <span className="text-sm font-bold text-ink">
            {jour === aujourdhui ? "Aujourd'hui" : jour}
          </span>
        )}
      </div>

      {lectureSeule ? (
        produitsAffiches.length === 0 && (
          <p className="text-sm text-ink-soft opacity-70">Aucun objectif défini pour cette date.</p>
        )
      ) : (
        <p className="text-xs text-ink-soft opacity-70">
          Renseignez une quantité prévue sur un ou plusieurs pôles pour planifier un produit —
          laissez à 0 les pôles non concernés.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(produitsAffiches ?? []).map((p) => {
          const prevu = objectifsParProduit.get(p.id) ?? {};
          const realise = realiseParProduit.get(p.id) ?? {};
          const totalPrevu = POLES.reduce((s, pl) => s + (prevu[pl.value] ?? 0), 0);
          const totalRealise = POLES.reduce((s, pl) => s + (realise[pl.value] ?? 0), 0);

          return (
            <div key={p.id} className="rounded-[12px] border border-line bg-paper p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold text-ink">{p.nom}</span>
                {totalPrevu > 0 && (
                  <span className="text-xs font-bold text-ink-soft">
                    Réalisé {totalRealise} / {totalPrevu}{" "}
                    <span className={totalRealise >= totalPrevu ? "text-green" : "text-ink-soft"}>
                      ({totalRealise - totalPrevu >= 0 ? "+" : ""}
                      {totalRealise - totalPrevu})
                    </span>
                  </span>
                )}
              </div>
              <ObjectifForm produitId={p.id} jour={jour} valeurs={prevu} lectureSeule={lectureSeule} />
              {Object.keys(realise).length > 0 && (
                <p className="mt-1.5 text-xs text-ink-soft opacity-70">
                  Réalisé par pôle :{" "}
                  {POLES.filter((pl) => realise[pl.value]).map((pl) => (
                    <span key={pl.value} className="mr-2">
                      {pl.label} {realise[pl.value]}
                      {prevu[pl.value] ? ` / ${prevu[pl.value]}` : ""}
                    </span>
                  ))}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

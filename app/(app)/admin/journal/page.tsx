import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconShield } from "@/components/icons";

const LABELS_ACTION: Record<string, string> = {
  activation_produit: "Activation produit",
  desactivation_produit: "Désactivation produit",
  modification_produit: "Modification produit",
  suppression_produit: "Suppression produit",
  modification_ingredient: "Modification ingrédient",
  suppression_ingredient: "Suppression ingrédient",
  desactivation_ingredient: "Désactivation ingrédient",
  mouvement_stock_entree: "Entrée de stock",
  mouvement_stock_sortie: "Sortie de stock",
  mouvement_stock_ajustement: "Ajustement de stock",
  annulation_vente: "Annulation de vente",
  cloture_caisse: "Clôture de caisse",
};

const ENTITES = [
  { value: "tous", label: "Tout" },
  { value: "produits", label: "Produits" },
  { value: "ingredients", label: "Ingrédients" },
  { value: "mouvements_stock", label: "Stock" },
  { value: "commandes", label: "Ventes" },
  { value: "sessions_caisse", label: "Caisse" },
];

type LigneAudit = {
  id: string;
  action: string;
  entite: string;
  entite_id: string;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  created_at: string;
  restaurant_id: string;
  restaurants: { nom: string } | null;
  utilisateurs: { nom: string } | null;
};

function decalerJour(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatChamps(obj: Record<string, unknown> | null): string {
  if (!obj) return "—";
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v === null ? "—" : String(v)}`)
    .join(" · ");
}

export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; entite?: string; restaurant?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "pdg"]);

  const {
    date: dateParam,
    entite: entiteParam,
    restaurant: restaurantParam,
  } = await searchParams;

  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);
  const entite = ENTITES.some((e) => e.value === entiteParam) ? (entiteParam as string) : "tous";

  const supabase = await createClient();

  const { data: tousRestaurants } = await supabase.from("restaurants").select("id, nom").order("nom");
  let restaurantsVisibles = tousRestaurants ?? [];
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsVisibles = restaurantsVisibles.filter((r) => r.id === profile.restaurant_id);
  }
  const restaurantSelectionneId =
    profile.role === "manager"
      ? (profile.restaurant_id ?? null)
      : restaurantParam && restaurantParam !== "tous"
        ? restaurantParam
        : "tous";

  const debut = new Date(date + "T00:00:00");
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  let requete = supabase
    .from("journal_audit")
    .select("id, action, entite, entite_id, avant, apres, created_at, restaurant_id, restaurants(nom), utilisateurs(nom)")
    .gte("created_at", debut.toISOString())
    .lt("created_at", fin.toISOString())
    .order("created_at", { ascending: false });

  if (entite !== "tous") {
    requete = requete.eq("entite", entite);
  }
  if (restaurantSelectionneId && restaurantSelectionneId !== "tous") {
    requete = requete.eq("restaurant_id", restaurantSelectionneId);
  }

  const { data } = await requete;
  const lignes = (data ?? []) as unknown as LigneAudit[];

  const lienAvec = (params: Record<string, string>) => {
    const q = new URLSearchParams({ date, entite, ...(restaurantSelectionneId ? { restaurant: restaurantSelectionneId } : {}), ...params });
    return `/admin/journal?${q.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconShield className="h-6 w-6 text-orange" />
        Journal d&apos;audit
      </h1>

      {restaurantsVisibles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={lienAvec({ restaurant: "tous" })}
            className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
              restaurantSelectionneId === "tous"
                ? "border-orange bg-orange text-white"
                : "border-line bg-surface text-ink-soft hover:border-orange"
            }`}
          >
            Tous les restaurants
          </Link>
          {restaurantsVisibles.map((r) => (
            <Link
              key={r.id}
              href={lienAvec({ restaurant: r.id })}
              className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
                restaurantSelectionneId === r.id
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-surface text-ink-soft hover:border-orange"
              }`}
            >
              {r.nom}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {ENTITES.map((e) => (
            <Link
              key={e.value}
              href={lienAvec({ entite: e.value })}
              className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
                entite === e.value
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-surface text-ink-soft hover:border-orange"
              }`}
            >
              {e.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={lienAvec({ date: decalerJour(date, -1) })}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
          >
            ‹
          </Link>
          <span className="rounded-[9px] border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink">
            {new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </span>
          <Link
            href={lienAvec({ date: decalerJour(date, 1) })}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
          >
            ›
          </Link>
        </div>
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3">
          <span className="font-bold text-ink">
            {lignes.length} événement{lignes.length > 1 ? "s" : ""}
          </span>
        </div>

        {lignes.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun événement ce jour-là.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lignes.map((l) => (
              <li key={l.id} className="rounded-[10px] border border-line bg-paper px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{LABELS_ACTION[l.action] ?? l.action}</span>
                  <span className="text-ink-soft">
                    {new Date(l.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {l.utilisateurs?.nom ?? "—"}
                    {l.restaurants?.nom && ` · ${l.restaurants.nom}`}
                  </span>
                </div>
                {(l.avant || l.apres) && (
                  <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-soft">
                    {l.avant && <span>Avant — {formatChamps(l.avant)}</span>}
                    {l.apres && <span>Après — {formatChamps(l.apres)}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

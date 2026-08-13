import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { demarrerLigne, terminerLigne } from "./actions";
import { IconChefHat } from "@/components/icons";
import { LABELS_CANAL } from "@/lib/commandes";

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

type LigneKds = {
  id: string;
  quantite: number;
  statut_preparation: "en_attente" | "en_preparation" | "pret" | "livre";
  pret_at: string | null;
  produits: { nom: string } | null;
  commandes: {
    id: string;
    numero: number;
    canal: "sur_place" | "emporter" | "livraison";
    created_at: string;
  } | null;
};

export default async function KdsPage({
  searchParams,
}: {
  searchParams: Promise<{ pole?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, [
    "admin",
    "manager",
    "chef_patisserie",
    "chef_boulangerie",
    "chef_fastfood",
    "equipier_patisserie",
    "equipier_boulangerie",
    "equipier_fastfood",
  ]);

  const peutChangerDePole = profile.role === "admin" || profile.role === "manager";
  const { pole: poleParam } = await searchParams;
  const pole = peutChangerDePole ? (poleParam ?? "patisserie") : profile.pole!;

  const supabase = await createClient();
  const selectLigne =
    "id, quantite, statut_preparation, pret_at, produits(nom), commandes!inner(id, numero, canal, created_at, restaurant_id)";

  let requete = supabase
    .from("lignes_commande")
    .select(selectLigne)
    .eq("pole", pole)
    .in("statut_preparation", ["en_attente", "en_preparation"])
    .neq("commandes.statut", "annulee")
    .order("created_at", { referencedTable: "commandes", ascending: true });

  if (profile.restaurant_id) {
    requete = requete.eq("commandes.restaurant_id", profile.restaurant_id);
  }

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  let requeteHistorique = supabase
    .from("lignes_commande")
    .select(selectLigne)
    .eq("pole", pole)
    .in("statut_preparation", ["pret", "livre"])
    .gte("commandes.created_at", debutJournee.toISOString())
    .order("pret_at", { ascending: false });

  if (profile.restaurant_id) {
    requeteHistorique = requeteHistorique.eq("commandes.restaurant_id", profile.restaurant_id);
  }

  const [{ data }, { data: dataHistorique }] = await Promise.all([requete, requeteHistorique]);
  const lignes = (data ?? []) as unknown as LigneKds[];
  const lignesHistorique = (dataHistorique ?? []) as unknown as LigneKds[];

  function grouperParCommande(source: LigneKds[]) {
    const commandesMap = new Map<
      string,
      { numero: number; canal: string; created_at: string; lignes: LigneKds[] }
    >();
    for (const l of source) {
      if (!l.commandes) continue;
      const existant = commandesMap.get(l.commandes.id);
      if (existant) {
        existant.lignes.push(l);
      } else {
        commandesMap.set(l.commandes.id, {
          numero: l.commandes.numero,
          canal: l.commandes.canal,
          created_at: l.commandes.created_at,
          lignes: [l],
        });
      }
    }
    return [...commandesMap.values()];
  }

  const commandes = grouperParCommande(lignes);
  const commandesHistorique = grouperParCommande(lignesHistorique);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconChefHat className="h-6 w-6 text-orange" />
        Cuisine
      </h1>

      {peutChangerDePole && (
        <div className="flex gap-2">
          {POLES.map((p) => (
            <a
              key={p.value}
              href={`/kds?pole=${p.value}`}
              className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
                pole === p.value
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-surface text-ink-soft hover:border-orange"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      )}

      {commandes.length === 0 ? (
        <p className="text-ink-soft opacity-70">Aucune commande en attente pour ce pôle.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {commandes.map((c) => (
            <div key={c.numero} className="rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-lg font-extrabold text-ink">
                  Commande n°{c.numero}
                </span>
                <span className="rounded-[7px] bg-paper px-2 py-0.5 text-xs font-bold text-ink-soft">
                  {LABELS_CANAL[c.canal] ?? c.canal}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {c.lignes.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 py-2"
                  >
                    <span className="text-sm font-bold text-ink">
                      {l.quantite}× {l.produits?.nom}
                    </span>
                    {l.statut_preparation === "en_attente" ? (
                      <form>
                        <button
                          formAction={demarrerLigne.bind(null, l.id)}
                          className="rounded-[8px] bg-orange px-2.5 py-1 text-xs font-bold text-white"
                        >
                          Démarrer
                        </button>
                      </form>
                    ) : (
                      <form>
                        <button
                          formAction={terminerLigne.bind(null, l.id)}
                          className="rounded-[8px] bg-green px-2.5 py-1 text-xs font-bold text-white"
                        >
                          Prêt
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <section className="mt-2 border-t border-line pt-5">
        <h2 className="mb-3 font-display text-lg font-extrabold text-ink">
          Historique du jour ({commandesHistorique.length})
        </h2>
        {commandesHistorique.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">
            Aucune commande terminée aujourd&apos;hui pour ce pôle.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {commandesHistorique.map((c) => (
              <div key={c.numero} className="rounded-card border border-line bg-paper p-4 opacity-80">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-display text-base font-extrabold text-ink">
                    Commande n°{c.numero}
                  </span>
                  <span className="rounded-[7px] bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft">
                    {LABELS_CANAL[c.canal] ?? c.canal}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {c.lignes.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm"
                    >
                      <span className="font-bold text-ink">
                        {l.quantite}× {l.produits?.nom}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-ink-soft">
                        {l.statut_preparation === "livre" ? "Livré" : "Prêt"}
                        {l.pret_at &&
                          new Date(l.pret_at).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

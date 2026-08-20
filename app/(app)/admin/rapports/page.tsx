import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconChart } from "@/components/icons";
import { BarChartCA } from "@/components/BarChartCA";
import { BoutonImprimer } from "@/components/BoutonImprimer";
import { PERIODES, resoudrePeriode, type TypePeriode } from "@/lib/rapports";

type ResumeRapport = {
  ca_total: number;
  nb_commandes: number;
  nb_commandes_payees: number;
  nb_commandes_annulees: number;
  panier_moyen: number;
  depenses_total: number;
  ecart_caisse_total: number;
  production_total: number;
  nb_sessions_caisse: number;
};

type ProduitVendu = { produit_id: string; nom: string; quantite: number; ca: number };
type MargeProduit = {
  produit_id: string;
  nom: string;
  quantite: number;
  ca: number;
  cout_matiere: number;
  marge: number;
  marge_pct: number;
};
type PerformanceCaissier = { utilisateur_id: string; nom: string; nb_ventes: number; ca: number };
type ProductionEmploye = {
  utilisateur_id: string;
  nom: string;
  quantite: number;
  nb_lignes: number;
  temps_moyen_minutes: number | null;
};
type CaQuotidien = { jour: string; ca: number };
type SessionEcart = {
  id: string;
  shift: "matin" | "soir";
  ecart: number;
  cloturee_at: string;
  utilisateurs: { nom: string } | null;
};

function CarteResume({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[10px] bg-paper p-3 text-center">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`font-bold ${accent ? "text-green" : "text-ink"}`}>{valeur}</div>
    </div>
  );
}

export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; debut?: string; fin?: string; restaurant?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const supabase = await createClient();
  const { periode: periodeParam, debut: debutParam, fin: finParam, restaurant: restaurantParam } =
    await searchParams;

  const periode: TypePeriode = PERIODES.some((p) => p.value === periodeParam)
    ? (periodeParam as TypePeriode)
    : "jour";

  const { data: tousRestaurants } = await supabase.from("restaurants").select("id, nom").order("nom");
  let restaurantsVisibles = tousRestaurants ?? [];
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsVisibles = restaurantsVisibles.filter((r) => r.id === profile.restaurant_id);
  }

  const restaurantSelectionneId =
    profile.role === "manager" && profile.restaurant_id
      ? profile.restaurant_id
      : restaurantParam && restaurantsVisibles.some((r) => r.id === restaurantParam)
        ? restaurantParam
        : (restaurantsVisibles[0]?.id ?? null);

  const restaurant = restaurantsVisibles.find((r) => r.id === restaurantSelectionneId) ?? null;

  const { debut, fin, label: labelPeriode } = resoudrePeriode(periode, debutParam, finParam);

  const lienAvec = (params: Record<string, string>) => {
    const q = new URLSearchParams({
      periode,
      ...(debutParam ? { debut: debutParam } : {}),
      ...(finParam ? { fin: finParam } : {}),
      ...(restaurantSelectionneId ? { restaurant: restaurantSelectionneId } : {}),
      ...params,
    });
    return `/admin/rapports?${q.toString()}`;
  };

  if (!restaurant) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-display text-2xl font-extrabold text-ink">Rapports</h1>
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      </div>
    );
  }

  const [
    { data: resumeData },
    { data: produitsData },
    { data: caissiersData },
    { data: employesData },
    { data: caQuotidienneData },
    { data: margeData },
    { data: ecartsData },
  ] = await Promise.all([
    supabase
      .rpc("rapport_resume", {
        p_restaurant_id: restaurant.id,
        p_debut: debut.toISOString(),
        p_fin: fin.toISOString(),
      })
      .single(),
    supabase.rpc("rapport_produits", {
      p_restaurant_id: restaurant.id,
      p_debut: debut.toISOString(),
      p_fin: fin.toISOString(),
    }),
    supabase.rpc("rapport_caissiers", {
      p_restaurant_id: restaurant.id,
      p_debut: debut.toISOString(),
      p_fin: fin.toISOString(),
    }),
    supabase.rpc("rapport_employes", {
      p_restaurant_id: restaurant.id,
      p_debut: debut.toISOString(),
      p_fin: fin.toISOString(),
    }),
    supabase.rpc("rapport_ca_quotidien", {
      p_restaurant_id: restaurant.id,
      p_debut: debut.toISOString(),
      p_fin: fin.toISOString(),
    }),
    supabase.rpc("rapport_marge", {
      p_restaurant_id: restaurant.id,
      p_debut: debut.toISOString(),
      p_fin: fin.toISOString(),
    }),
    supabase
      .from("sessions_caisse")
      .select("id, shift, ecart, cloturee_at, utilisateurs!caissiere_id(nom)")
      .eq("restaurant_id", restaurant.id)
      .not("ecart", "is", null)
      .gte("cloturee_at", debut.toISOString())
      .lt("cloturee_at", fin.toISOString())
      .order("cloturee_at", { ascending: false }),
  ]);

  const r = resumeData as ResumeRapport | null;
  const produits = ((produitsData ?? []) as ProduitVendu[]).slice(0, 10);
  const caissiers = (caissiersData ?? []) as PerformanceCaissier[];
  const employes = (employesData ?? []) as ProductionEmploye[];
  const graphJours = ((caQuotidienneData ?? []) as CaQuotidien[]).map((j) => ({
    label: new Date(`${j.jour}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    valeur: Number(j.ca),
  }));
  const marges = (margeData ?? []) as MargeProduit[];
  const ecarts = ((ecartsData ?? []) as unknown as SessionEcart[]).filter(
    (s) => Number(s.ecart) !== 0,
  );
  const coutMatiereTotal = marges.reduce((total, m) => total + Number(m.cout_matiere), 0);
  const margeBrute = marges.reduce((total, m) => total + Number(m.marge), 0);
  const caMarges = marges.reduce((total, m) => total + Number(m.ca), 0);
  const tauxMargeGlobal = caMarges > 0 ? Math.round((margeBrute / caMarges) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
          <IconChart className="h-6 w-6 text-orange" />
          Rapports
        </h1>
        <div className="no-print">
          <BoutonImprimer />
        </div>
      </div>

      {restaurantsVisibles.length > 1 && (
        <div className="no-print flex flex-wrap gap-2">
          {restaurantsVisibles.map((rest) => (
            <Link
              key={rest.id}
              href={lienAvec({ restaurant: rest.id })}
              className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
                rest.id === restaurant.id
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-surface text-ink-soft hover:border-orange"
              }`}
            >
              {rest.nom}
            </Link>
          ))}
        </div>
      )}

      <div className="no-print flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Link
            key={p.value}
            href={lienAvec({ periode: p.value })}
            className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
              periode === p.value
                ? "border-orange bg-orange text-white"
                : "border-line bg-surface text-ink-soft hover:border-orange"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {periode === "personnalise" && (
        <form className="no-print flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
          <input type="hidden" name="periode" value="personnalise" />
          {restaurantSelectionneId && (
            <input type="hidden" name="restaurant" value={restaurantSelectionneId} />
          )}
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-soft">
            Du
            <input
              type="date"
              name="debut"
              defaultValue={debutParam}
              className="rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-soft">
            Au
            <input
              type="date"
              name="fin"
              defaultValue={finParam}
              className="rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="rounded-[9px] bg-orange px-4 py-1.5 text-sm font-bold text-white"
          >
            Appliquer
          </button>
        </form>
      )}

      {!r ? (
        <p className="text-ink-soft opacity-70">Impossible de charger le rapport.</p>
      ) : (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-lg font-extrabold text-ink">
            {restaurant.nom} · {labelPeriode}
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[10px] bg-paper p-3">
              <div className="text-xs text-ink-soft">Chiffre d&apos;affaires</div>
              <div className="font-bold text-green">{Number(r.ca_total).toLocaleString("fr-FR")} F</div>
            </div>
            <CarteResume label="Panier moyen" valeur={`${Math.round(Number(r.panier_moyen)).toLocaleString("fr-FR")} F`} />
            <CarteResume label="Commandes" valeur={Number(r.nb_commandes)} />
            <CarteResume
              label="Ventes annulées"
              valeur={Number(r.nb_commandes_annulees)}
              accent={Number(r.nb_commandes_annulees) === 0}
            />
            <CarteResume label="Dépenses" valeur={`${Number(r.depenses_total).toLocaleString("fr-FR")} F`} />
            <CarteResume
              label="Écart de caisse"
              valeur={`${Number(r.ecart_caisse_total).toLocaleString("fr-FR")} F`}
            />
            <CarteResume label="Production" valeur={Number(r.production_total)} />
            <CarteResume label="Sessions de caisse" valeur={Number(r.nb_sessions_caisse)} />
          </div>

          {Number(r.ecart_caisse_total) !== 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Détail des écarts de caisse
              </h3>
              {ecarts.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">
                  Aucune session avec écart sur cette période.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {ecarts.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{s.utilisateurs?.nom ?? "—"}</span>
                      <span className="text-ink-soft">
                        {s.shift === "matin" ? "Matin" : "Soir"} ·{" "}
                        {new Date(s.cloturee_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                      <Link
                        href={`/admin/caisse?date=${s.cloturee_at.slice(0, 10)}`}
                        className={`font-bold hover:underline ${
                          Number(s.ecart) > 0 ? "text-green" : "text-red-600"
                        }`}
                      >
                        {Number(s.ecart) >= 0 ? "+" : ""}
                        {Number(s.ecart).toLocaleString("fr-FR")} F
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
              Chiffre d&apos;affaires par jour
            </h3>
            {graphJours.length === 0 ? (
              <p className="text-sm text-ink-soft opacity-70">Aucune donnée sur cette période.</p>
            ) : (
              <BarChartCA data={graphJours} />
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
              Produits les plus vendus
            </h3>
            {produits.length === 0 ? (
              <p className="text-sm text-ink-soft opacity-70">Aucune vente sur cette période.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {produits.map((p) => (
                  <li
                    key={p.produit_id}
                    className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                  >
                    <span className="text-ink">{p.nom}</span>
                    <span className="text-ink-soft">
                      {Number(p.quantite)} vendu{Number(p.quantite) > 1 ? "s" : ""}
                    </span>
                    <span className="font-bold text-ink">{Number(p.ca).toLocaleString("fr-FR")} F</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
              Marge / bénéfice
            </h3>
            {marges.length === 0 ? (
              <p className="text-sm text-ink-soft opacity-70">Aucune vente sur cette période.</p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <CarteResume label="Coût matière" valeur={`${coutMatiereTotal.toLocaleString("fr-FR")} F`} />
                  <div className="rounded-[10px] bg-paper p-3 text-center">
                    <div className="text-xs text-ink-soft">Marge brute</div>
                    <div className={`font-bold ${margeBrute >= 0 ? "text-green" : "text-red-600"}`}>
                      {margeBrute.toLocaleString("fr-FR")} F
                    </div>
                  </div>
                  <CarteResume label="Taux de marge" valeur={`${tauxMargeGlobal}%`} accent={tauxMargeGlobal >= 0} />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {marges.map((m) => (
                    <li
                      key={m.produit_id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{m.nom}</span>
                      <span className="text-ink-soft">
                        Coût : {Number(m.cout_matiere).toLocaleString("fr-FR")} F
                      </span>
                      <span className={`font-bold ${Number(m.marge) >= 0 ? "text-green" : "text-red-600"}`}>
                        {Number(m.marge).toLocaleString("fr-FR")} F ({Number(m.marge_pct)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Performance caissiers
              </h3>
              {caissiers.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucun encaissement sur cette période.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {caissiers.map((p) => (
                    <li
                      key={p.utilisateur_id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="text-ink-soft">
                        {Number(p.nb_ventes)} vente{Number(p.nb_ventes) > 1 ? "s" : ""}
                      </span>
                      <span className="font-bold text-green">{Number(p.ca).toLocaleString("fr-FR")} F</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Production par employé
              </h3>
              {employes.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucune ligne préparée sur cette période.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {employes.map((p) => (
                    <li
                      key={p.utilisateur_id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="text-ink-soft">
                        {Number(p.nb_lignes)} article{Number(p.nb_lignes) > 1 ? "s" : ""}
                        {p.temps_moyen_minutes !== null &&
                          ` · ${Math.round(Number(p.temps_moyen_minutes))} min/article`}
                      </span>
                      <span className="font-bold text-ink">{Number(p.quantite)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

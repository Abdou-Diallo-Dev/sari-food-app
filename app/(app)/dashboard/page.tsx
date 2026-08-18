import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { annulerCommande } from "./actions";
import { BoutonAnnulation } from "@/components/BoutonAnnulation";
import { BarChartCA } from "@/components/BarChartCA";
import { STATUTS_ORDRE, LABELS_STATUT, LABELS_CANAL } from "@/lib/commandes";
import { IconChart } from "@/components/icons";
import { debutJour, ajouterJours } from "@/lib/dashboard";
import { PERIODES, resoudrePeriode, type TypePeriode } from "@/lib/rapports";

type CommandeJour = {
  id: string;
  numero: number;
  canal: "sur_place" | "emporter" | "livraison";
  statut: string;
  motif_annulation: string | null;
  total: number;
  created_at: string;
};

type ResumeActuel = {
  commandes_en_attente: number;
  sessions_ouvertes: number;
  alertes_stock: number;
  production_jour: number;
};

type ProduitVendu = { produit_id: string; nom: string; quantite: number };
type ProductionEmploye = {
  utilisateur_id: string;
  nom: string;
  quantite: number;
  nb_lignes: number;
  temps_moyen_minutes: number | null;
};
type PerformanceCaissier = { utilisateur_id: string; nom: string; nb_ventes: number; ca: number };
type CaQuotidien = { jour: string; ca: number };
type ResumePeriode = {
  ca_total: number;
  nb_commandes: number;
  nb_commandes_annulees: number;
  panier_moyen: number;
  depenses_total: number;
  ecart_caisse_total: number;
  production_total: number;
};

function CarteStat({
  label,
  valeur,
  alerte,
}: {
  label: string;
  valeur: string | number;
  alerte?: boolean;
}) {
  return (
    <div className="rounded-[10px] bg-paper p-3 text-center">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`font-bold ${alerte ? "text-red-600" : "text-ink"}`}>{valeur}</div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string; periode?: string; debut?: string; fin?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const supabase = await createClient();
  const {
    restaurant: restaurantParam,
    periode: periodeParam,
    debut: debutParam,
    fin: finParam,
  } = await searchParams;

  const periode: TypePeriode = PERIODES.some((p) => p.value === periodeParam)
    ? (periodeParam as TypePeriode)
    : "jour";

  const { data: tousRestaurants } = await supabase.from("restaurants").select("id, nom").order("nom");
  let restaurantsVisibles = tousRestaurants ?? [];
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsVisibles = restaurantsVisibles.filter((r) => r.id === profile.restaurant_id);
  }

  const restaurantSelectionneId =
    profile.role === "manager"
      ? (profile.restaurant_id ?? null)
      : (restaurantParam && restaurantsVisibles.some((r) => r.id === restaurantParam)
          ? restaurantParam
          : (restaurantsVisibles[0]?.id ?? null));

  const restaurant = restaurantsVisibles.find((r) => r.id === restaurantSelectionneId) ?? null;

  const { debut: debutPeriode, fin: finPeriode, label: labelPeriode } = resoudrePeriode(
    periode,
    debutParam,
    finParam,
  );

  const lienAvec = (params: Record<string, string>) => {
    const q = new URLSearchParams({
      periode,
      ...(debutParam ? { debut: debutParam } : {}),
      ...(finParam ? { fin: finParam } : {}),
      ...(restaurantSelectionneId ? { restaurant: restaurantSelectionneId } : {}),
      ...params,
    });
    return `/dashboard?${q.toString()}`;
  };

  if (!restaurant) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-display text-2xl font-extrabold text-ink">Tableau de bord</h1>
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      </div>
    );
  }

  const jDebut = debutJour();
  const jFin = ajouterJours(jDebut, 1);

  const [
    { data: resumeActuelData, error: resumeError },
    { data: produitsMoisData },
    { data: productionData },
    { data: caissiersData },
    { data: graphData },
    { data: commandesJourData },
    { data: resumePeriodeData },
  ] = await Promise.all([
    supabase.rpc("dashboard_resume", { p_restaurant_id: restaurant.id }).single(),
    supabase.rpc("dashboard_produits_mois", { p_restaurant_id: restaurant.id }),
    supabase.rpc("dashboard_production_employes_jour", { p_restaurant_id: restaurant.id }),
    supabase.rpc("dashboard_performance_caissiers_jour", { p_restaurant_id: restaurant.id }),
    periode === "jour"
      ? supabase.rpc("dashboard_ca_quotidien", { p_restaurant_id: restaurant.id, p_jours: 14 })
      : supabase.rpc("rapport_ca_quotidien", {
          p_restaurant_id: restaurant.id,
          p_debut: debutPeriode.toISOString(),
          p_fin: finPeriode.toISOString(),
        }),
    supabase
      .from("commandes")
      .select("id, numero, canal, statut, total, motif_annulation, created_at")
      .eq("restaurant_id", restaurant.id)
      .gte("created_at", jDebut.toISOString())
      .lt("created_at", jFin.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .rpc("rapport_resume", {
        p_restaurant_id: restaurant.id,
        p_debut: debutPeriode.toISOString(),
        p_fin: finPeriode.toISOString(),
      })
      .single(),
  ]);

  const r = resumeActuelData as ResumeActuel | null;
  const produitsMois = (produitsMoisData ?? []) as ProduitVendu[];
  const production = (productionData ?? []) as ProductionEmploye[];
  const caissiers = (caissiersData ?? []) as PerformanceCaissier[];
  const graphJours = ((graphData ?? []) as CaQuotidien[]).map((j) => ({
    label: new Date(`${j.jour}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    valeur: Number(j.ca),
  }));
  const commandesJourListe = (commandesJourData ?? []) as CommandeJour[];
  const rPeriode = resumePeriodeData as ResumePeriode | null;
  const titreGraph =
    periode === "jour" ? "Chiffre d'affaires des 14 derniers jours" : "Chiffre d'affaires par jour";

  const topProduits = produitsMois.slice(0, 5);
  const flopProduits = [...produitsMois].reverse().slice(0, 5);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconChart className="h-6 w-6 text-orange" />
        Tableau de bord
      </h1>

      {restaurantsVisibles.length > 1 && (
        <div className="flex flex-wrap gap-2">
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

      <div className="flex flex-wrap gap-2">
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
        <form className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-surface p-3">
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
          <button type="submit" className="rounded-[9px] bg-orange px-4 py-1.5 text-sm font-bold text-white">
            Appliquer
          </button>
        </form>
      )}

      {!r ? (
        <div className="rounded-card border border-red-300 bg-red-50 p-4">
          <p className="font-bold text-red-600">Impossible de charger les indicateurs.</p>
          {resumeError && (
            <p className="mt-1 text-xs text-red-600 opacity-80">
              {resumeError.message}
              {resumeError.hint ? ` — ${resumeError.hint}` : ""}
            </p>
          )}
        </div>
      ) : !rPeriode ? (
        <div className="rounded-card border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft opacity-70">Aucune donnée pour cette période.</p>
        </div>
      ) : (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-lg font-extrabold text-ink">
            {restaurant.nom} · {labelPeriode}
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[10px] bg-paper p-3">
              <div className="text-xs text-ink-soft">Chiffre d&apos;affaires</div>
              <div className="font-bold text-green">{Number(rPeriode.ca_total).toLocaleString("fr-FR")} F</div>
            </div>
            <CarteStat
              label="Panier moyen"
              valeur={`${Math.round(Number(rPeriode.panier_moyen)).toLocaleString("fr-FR")} F`}
            />
            <CarteStat label="Commandes" valeur={Number(rPeriode.nb_commandes)} />
            <CarteStat
              label="Commandes annulées"
              valeur={Number(rPeriode.nb_commandes_annulees)}
              alerte={Number(rPeriode.nb_commandes_annulees) > 0}
            />
            <CarteStat label="Dépenses" valeur={`${Number(rPeriode.depenses_total).toLocaleString("fr-FR")} F`} />
            <CarteStat
              label="Écart de caisse"
              valeur={`${Number(rPeriode.ecart_caisse_total).toLocaleString("fr-FR")} F`}
              alerte={Number(rPeriode.ecart_caisse_total) !== 0}
            />
            <CarteStat label="Production" valeur={Number(rPeriode.production_total)} />
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
              État actuel (maintenant)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CarteStat
                label="Commandes en attente"
                valeur={Number(r.commandes_en_attente)}
                alerte={Number(r.commandes_en_attente) > 0}
              />
              <CarteStat label="Caisses ouvertes" valeur={Number(r.sessions_ouvertes)} />
              <CarteStat label="Production du jour" valeur={Number(r.production_jour)} />
              <CarteStat
                label="Alertes stock"
                valeur={Number(r.alertes_stock)}
                alerte={Number(r.alertes_stock) > 0}
              />
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">{titreGraph}</h3>
            <BarChartCA data={graphJours} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Produits les plus vendus (mois en cours)
              </h3>
              {topProduits.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucune vente ce mois-ci.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {topProduits.map((p) => (
                    <li
                      key={p.produit_id}
                      className="flex items-center justify-between rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="font-bold text-ink">{Number(p.quantite)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Produits les moins vendus (mois en cours)
              </h3>
              {flopProduits.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucune vente ce mois-ci.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {flopProduits.map((p) => (
                    <li
                      key={p.produit_id}
                      className="flex items-center justify-between rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="font-bold text-ink">{Number(p.quantite)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Performance caissiers (jour)
              </h3>
              {caissiers.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucun encaissement aujourd&apos;hui.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {caissiers.map((p) => (
                    <li
                      key={p.utilisateur_id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="text-ink-soft">
                        {Number(p.nb_ventes)} vente{Number(p.nb_ventes) > 1 ? "s" : ""} · panier{" "}
                        {Math.round(Number(p.ca) / Number(p.nb_ventes)).toLocaleString("fr-FR")} F
                      </span>
                      <span className="font-bold text-green">{Number(p.ca).toLocaleString("fr-FR")} F</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Production par employé (jour)
              </h3>
              {production.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">Aucune ligne préparée aujourd&apos;hui.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {production.map((p) => (
                    <li
                      key={p.utilisateur_id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink">{p.nom}</span>
                      <span className="text-ink-soft">
                        {Number(p.nb_lignes)} article{Number(p.nb_lignes) > 1 ? "s" : ""}
                        {p.temps_moyen_minutes !== null && ` · ${Math.round(Number(p.temps_moyen_minutes))} min/article`}
                      </span>
                      <span className="font-bold text-ink">{Number(p.quantite)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {commandesJourListe.length === 0 ? (
            <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft opacity-70">
              Aucune commande aujourd&apos;hui.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                Commandes du jour
              </h3>
              {STATUTS_ORDRE.map((statut) => {
                const groupe = commandesJourListe.filter((cmd) => cmd.statut === statut);
                if (groupe.length === 0) return null;

                return (
                  <div key={statut}>
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                      {LABELS_STATUT[statut] ?? statut}
                      <span className="rounded-[6px] bg-paper px-1.5 py-0.5 text-[.7rem] font-bold text-ink">
                        {groupe.length}
                      </span>
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {groupe.map((cmd) => (
                        <li
                          key={cmd.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                        >
                          <span className="font-bold text-ink">
                            n°{cmd.numero}{" "}
                            <span className="font-normal text-ink-soft">
                              · {LABELS_CANAL[cmd.canal] ?? cmd.canal} ·{" "}
                              {new Date(cmd.created_at).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {cmd.statut === "annulee" &&
                                cmd.motif_annulation &&
                                ` · Motif : ${cmd.motif_annulation}`}
                            </span>
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-ink">
                              {cmd.total.toLocaleString("fr-FR")} F
                            </span>
                            {cmd.statut !== "payee" && cmd.statut !== "annulee" && (
                              <form action={annulerCommande}>
                                <input type="hidden" name="id" value={cmd.id} />
                                <BoutonAnnulation
                                  numero={cmd.numero}
                                  className="rounded-[7px] px-2 py-1 text-xs font-bold text-ink-soft hover:text-red-600"
                                />
                              </form>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

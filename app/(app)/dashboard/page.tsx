import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { annulerCommande } from "./actions";
import { BoutonAnnulation } from "@/components/BoutonAnnulation";
import { BarChartCA } from "@/components/BarChartCA";
import { STATUTS_ORDRE, LABELS_STATUT, LABELS_CANAL } from "@/lib/commandes";
import { IconChart } from "@/components/icons";
import { ajouterJours, debutJour, variation } from "@/lib/dashboard";

type CommandeJour = {
  id: string;
  numero: number;
  canal: "sur_place" | "emporter" | "livraison";
  statut: string;
  motif_annulation: string | null;
  total: number;
  created_at: string;
};

type ResumeDashboard = {
  ca_jour: number;
  ca_hier: number;
  ca_semaine: number;
  ca_semaine_precedente: number;
  ca_mois: number;
  ca_mois_precedent: number;
  ca_annee: number;
  ca_annee_precedente: number;
  nb_commandes_jour: number;
  nb_commandes_payees_jour: number;
  commandes_en_attente: number;
  depenses_jour: number;
  sessions_ouvertes: number;
  ecart_jour: number;
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

function BadgeVariation({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-[.65rem] font-bold text-ink-soft opacity-60">Nouveau</span>;
  }
  const positif = pct >= 0;
  return (
    <span className={`text-[.65rem] font-bold ${positif ? "text-green" : "text-red-600"}`}>
      {positif ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function CarteCA({
  label,
  valeur,
  comparaisonLabel,
  pct,
}: {
  label: string;
  valeur: number;
  comparaisonLabel: string;
  pct: number | null;
}) {
  return (
    <div className="rounded-[10px] bg-paper p-3">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="font-bold text-green">{valeur.toLocaleString("fr-FR")} F</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <BadgeVariation pct={pct} />
        <span className="text-[.6rem] text-ink-soft opacity-60">vs {comparaisonLabel}</span>
      </div>
    </div>
  );
}

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
  searchParams: Promise<{ restaurant?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const supabase = await createClient();
  const { restaurant: restaurantParam } = await searchParams;

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
    { data: resume, error: resumeError },
    { data: produitsMoisData },
    { data: productionData },
    { data: caissiersData },
    { data: graphData },
    { data: commandesJourData },
  ] = await Promise.all([
    supabase.rpc("dashboard_resume", { p_restaurant_id: restaurant.id }).single(),
    supabase.rpc("dashboard_produits_mois", { p_restaurant_id: restaurant.id }),
    supabase.rpc("dashboard_production_employes_jour", { p_restaurant_id: restaurant.id }),
    supabase.rpc("dashboard_performance_caissiers_jour", { p_restaurant_id: restaurant.id }),
    supabase.rpc("dashboard_ca_quotidien", { p_restaurant_id: restaurant.id, p_jours: 14 }),
    supabase
      .from("commandes")
      .select("id, numero, canal, statut, total, motif_annulation, created_at")
      .eq("restaurant_id", restaurant.id)
      .gte("created_at", jDebut.toISOString())
      .lt("created_at", jFin.toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const r = resume as ResumeDashboard | null;
  const produitsMois = (produitsMoisData ?? []) as ProduitVendu[];
  const production = (productionData ?? []) as ProductionEmploye[];
  const caissiers = (caissiersData ?? []) as PerformanceCaissier[];
  const graphJours = ((graphData ?? []) as CaQuotidien[]).map((j) => ({
    label: new Date(`${j.jour}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    valeur: Number(j.ca),
  }));
  const commandesJourListe = (commandesJourData ?? []) as CommandeJour[];

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
              href={`/dashboard?restaurant=${rest.id}`}
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
      ) : (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-4 font-display text-lg font-extrabold text-ink">{restaurant.nom}</h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CarteCA
              label="CA du jour"
              valeur={Number(r.ca_jour)}
              comparaisonLabel="hier"
              pct={variation(Number(r.ca_jour), Number(r.ca_hier))}
            />
            <CarteCA
              label="CA de la semaine"
              valeur={Number(r.ca_semaine)}
              comparaisonLabel="sem. précédente"
              pct={variation(Number(r.ca_semaine), Number(r.ca_semaine_precedente))}
            />
            <CarteCA
              label="CA du mois"
              valeur={Number(r.ca_mois)}
              comparaisonLabel="mois précédent"
              pct={variation(Number(r.ca_mois), Number(r.ca_mois_precedent))}
            />
            <CarteCA
              label="CA de l'année"
              valeur={Number(r.ca_annee)}
              comparaisonLabel="année précédente"
              pct={variation(Number(r.ca_annee), Number(r.ca_annee_precedente))}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CarteStat label="Commandes du jour" valeur={Number(r.nb_commandes_jour)} />
            <CarteStat
              label="Panier moyen"
              valeur={`${
                Number(r.nb_commandes_payees_jour) > 0
                  ? Math.round(Number(r.ca_jour) / Number(r.nb_commandes_payees_jour)).toLocaleString("fr-FR")
                  : 0
              } F`}
            />
            <CarteStat
              label="Commandes en attente"
              valeur={Number(r.commandes_en_attente)}
              alerte={Number(r.commandes_en_attente) > 0}
            />
            <CarteStat label="Production du jour" valeur={Number(r.production_jour)} />
            <CarteStat label="Dépenses du jour" valeur={`${Number(r.depenses_jour).toLocaleString("fr-FR")} F`} />
            <CarteStat label="Caisses ouvertes" valeur={Number(r.sessions_ouvertes)} />
            <CarteStat
              label="Écart caisse (jour)"
              valeur={`${Number(r.ecart_jour).toLocaleString("fr-FR")} F`}
              alerte={Number(r.ecart_jour) !== 0}
            />
            <CarteStat label="Alertes stock" valeur={Number(r.alertes_stock)} alerte={Number(r.alertes_stock) > 0} />
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
              CA des 14 derniers jours
            </h3>
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
              {STATUTS_ORDRE.map((statut) => {
                const groupe = commandesJourListe.filter((cmd) => cmd.statut === statut);
                if (groupe.length === 0) return null;

                return (
                  <div key={statut}>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.05em] text-ink-soft">
                      {LABELS_STATUT[statut] ?? statut}
                      <span className="rounded-[6px] bg-paper px-1.5 py-0.5 text-[.7rem] font-bold text-ink">
                        {groupe.length}
                      </span>
                    </h3>
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

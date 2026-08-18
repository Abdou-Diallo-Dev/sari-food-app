import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconWallet } from "@/components/icons";
import { MOYENS_PAIEMENT_CAISSE, totauxParMoyen } from "@/lib/caisse";
import { RemiseAVerifier } from "./remise-a-verifier";

const LABELS_MOYEN: Record<string, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  wave: "Wave",
  carte: "Carte",
};

const LABELS_CATEGORIE_DEPENSE: Record<string, string> = {
  achat_stock: "Achat stock",
  produit_entretien: "Produit d'entretien",
  charge_operationnelle: "Charge opérationnelle",
  divers: "Divers",
};

type Transaction = {
  id: string;
  type: "encaissement" | "depense";
  montant: number;
  moyen_paiement: string | null;
  categorie_depense: string | null;
  libelle: string | null;
  created_at: string;
};

type Session = {
  id: string;
  shift: "matin" | "soir";
  fond_initial: number;
  fond_initial_especes: number;
  fond_initial_wave: number;
  fond_initial_orange_money: number;
  total_theorique: number | null;
  total_compte: number | null;
  total_compte_especes: number | null;
  ecart: number | null;
  ecart_especes: number | null;
  total_compte_wave: number | null;
  ecart_wave: number | null;
  total_compte_orange_money: number | null;
  ecart_orange_money: number | null;
  statut: "ouverte" | "cloturee";
  ouverte_at: string;
  cloturee_at: string | null;
  utilisateurs: { nom: string } | null;
  transactions: Transaction[];
};

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function decalerJour(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function AdminCaissePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const estAujourdhui = date === new Date().toISOString().slice(0, 10);

  const debutJournee = new Date(date + "T00:00:00");
  const finJournee = new Date(debutJournee);
  finJournee.setDate(finJournee.getDate() + 1);
  const debutJourneeIso = debutJournee.toISOString();
  const finJourneeIso = finJournee.toISOString();

  const supabase = await createClient();

  let restaurantsQuery = supabase.from("restaurants").select("id, nom").order("nom");
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsQuery = restaurantsQuery.eq("id", profile.restaurant_id);
  }
  const { data: restaurants } = await restaurantsQuery;

  const { data: remisesEnAttente } = await supabase
    .from("remises_caisse")
    .select("id, montant_remis, restaurant_id, utilisateurs(nom)")
    .eq("statut", "en_attente")
    .in("restaurant_id", (restaurants ?? []).map((r) => r.id))
    .order("created_at", { ascending: true });

  const parRestaurant = await Promise.all(
    (restaurants ?? []).map(async (r) => {
      const { data: sessions } = await supabase
        .from("sessions_caisse")
        .select(
          "id, shift, fond_initial, fond_initial_especes, fond_initial_wave, fond_initial_orange_money, total_theorique, total_compte, total_compte_especes, ecart, ecart_especes, total_compte_wave, ecart_wave, total_compte_orange_money, ecart_orange_money, statut, ouverte_at, cloturee_at, utilisateurs(nom)",
        )
        .eq("restaurant_id", r.id)
        .gte("ouverte_at", debutJourneeIso)
        .lt("ouverte_at", finJourneeIso)
        .order("ouverte_at", { ascending: false });

      const sessionsTypees = (sessions ?? []) as unknown as Omit<Session, "transactions">[];

      const sessionsAvecTransactions = await Promise.all(
        sessionsTypees.map(async (s) => {
          const { data: transactions } = await supabase
            .from("transactions_caisse")
            .select("id, type, montant, moyen_paiement, categorie_depense, libelle, created_at")
            .eq("session_id", s.id)
            .order("created_at", { ascending: true });
          return { ...s, transactions: (transactions ?? []) as Transaction[] };
        }),
      );

      return { restaurant: r, sessions: sessionsAvecTransactions };
    }),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconWallet className="h-6 w-6 text-orange" />
        Caisse — supervision
      </h1>

      <div className="flex items-center gap-2">
        <Link
          href={`/admin/caisse?date=${decalerJour(date, -1)}`}
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
        {!estAujourdhui && (
          <Link
            href={`/admin/caisse?date=${decalerJour(date, 1)}`}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
          >
            ›
          </Link>
        )}
      </div>

      {(remisesEnAttente ?? []).length > 0 && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold text-orange">
            Remises en attente de vérification
          </h2>
          <div className="flex flex-col gap-2">
            {(remisesEnAttente ?? []).map((r) => (
              <RemiseAVerifier
                key={r.id}
                remiseId={r.id}
                caissiereNom={(r.utilisateurs as unknown as { nom: string } | null)?.nom ?? "—"}
                montantRemis={Number(r.montant_remis)}
              />
            ))}
          </div>
        </section>
      )}

      {parRestaurant.length === 0 ? (
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {parRestaurant.map(({ restaurant, sessions }) => (
            <section key={restaurant.id} className="rounded-card border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-lg font-extrabold text-ink">{restaurant.nom}</h2>

              {sessions.length === 0 ? (
                <p className="text-sm text-ink-soft opacity-70">
                  Aucune session de caisse {estAujourdhui ? "aujourd'hui" : "ce jour-là"}.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sessions.map((s) => {
                    const totalEncaissements = s.transactions
                      .filter((t) => t.type === "encaissement")
                      .reduce((sum, t) => sum + Number(t.montant), 0);
                    const totalDepenses = s.transactions
                      .filter((t) => t.type === "depense")
                      .reduce((sum, t) => sum + Number(t.montant), 0);

                    return (
                      <details key={s.id} className="rounded-[14px] border border-line bg-paper p-4">
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-ink">
                            {s.shift === "matin" ? "Matin" : "Soir"} · {s.utilisateurs?.nom ?? "—"}{" "}
                            <span className="font-normal text-ink-soft">
                              · ouverte à {heure(s.ouverte_at)}
                              {s.cloturee_at && ` · clôturée à ${heure(s.cloturee_at)}`}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span
                              className={`rounded-[7px] px-2 py-0.5 text-xs font-bold ${
                                s.statut === "ouverte"
                                  ? "bg-green/15 text-green"
                                  : "bg-surface text-ink-soft"
                              }`}
                            >
                              {s.statut === "ouverte" ? "Ouverte" : "Clôturée"}
                            </span>
                            {s.statut === "cloturee" && s.ecart_especes !== null && (
                              <span
                                className={`text-xs font-bold ${
                                  Number(s.ecart_especes) === 0 ? "text-ink" : "text-red-600"
                                }`}
                              >
                                Écart espèces {Number(s.ecart_especes).toLocaleString("fr-FR")} F
                              </span>
                            )}
                          </span>
                        </summary>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                          <div className="rounded-[10px] bg-surface p-2">
                            <div className="text-ink-soft">Fond initial</div>
                            <div className="font-bold text-ink">
                              {Number(s.fond_initial).toLocaleString("fr-FR")} F
                            </div>
                          </div>
                          <div className="rounded-[10px] bg-surface p-2">
                            <div className="text-ink-soft">Encaissé</div>
                            <div className="font-bold text-green">
                              {totalEncaissements.toLocaleString("fr-FR")} F
                            </div>
                          </div>
                          <div className="rounded-[10px] bg-surface p-2">
                            <div className="text-ink-soft">Dépenses</div>
                            <div className="font-bold text-ink">
                              {totalDepenses.toLocaleString("fr-FR")} F
                            </div>
                          </div>
                          <div className="rounded-[10px] bg-surface p-2">
                            <div className="text-ink-soft">Compté</div>
                            <div className="font-bold text-ink">
                              {s.total_compte !== null
                                ? `${Number(s.total_compte).toLocaleString("fr-FR")} F`
                                : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {MOYENS_PAIEMENT_CAISSE.map((m) => {
                            const fondInitial =
                              m.value === "especes"
                                ? Number(s.fond_initial_especes)
                                : m.value === "wave"
                                  ? Number(s.fond_initial_wave)
                                  : Number(s.fond_initial_orange_money);
                            const { encaisse, depense } = totauxParMoyen(s.transactions, m.value);
                            const theorique = fondInitial + encaisse - depense;
                            const compte =
                              m.value === "especes"
                                ? s.total_compte_especes
                                : m.value === "wave"
                                  ? s.total_compte_wave
                                  : s.total_compte_orange_money;
                            const ecartMoyen =
                              m.value === "especes"
                                ? s.ecart_especes
                                : m.value === "wave"
                                  ? s.ecart_wave
                                  : s.ecart_orange_money;
                            return (
                              <div key={m.value} className="rounded-[10px] border border-line bg-surface p-2.5 text-sm">
                                <div className="mb-1 font-bold text-ink">{m.label}</div>
                                <div className="flex justify-between text-xs text-ink-soft">
                                  <span>Initial</span>
                                  <span>{fondInitial.toLocaleString("fr-FR")} F</span>
                                </div>
                                <div className="flex justify-between text-xs text-ink-soft">
                                  <span>Encaissé</span>
                                  <span className="text-green">{encaisse.toLocaleString("fr-FR")} F</span>
                                </div>
                                <div className="flex justify-between text-xs text-ink-soft">
                                  <span>Dépenses</span>
                                  <span>{depense.toLocaleString("fr-FR")} F</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold text-ink">
                                  <span>Théorique</span>
                                  <span>{theorique.toLocaleString("fr-FR")} F</span>
                                </div>
                                {s.statut === "cloturee" && compte !== null && (
                                  <div className="mt-1 flex justify-between border-t border-line pt-1 text-xs font-bold">
                                    <span className="text-ink-soft">Compté / Écart</span>
                                    <span className={Number(ecartMoyen) === 0 ? "text-ink" : "text-red-600"}>
                                      {Number(compte).toLocaleString("fr-FR")} F (
                                      {Number(ecartMoyen) >= 0 ? "+" : ""}
                                      {Number(ecartMoyen).toLocaleString("fr-FR")} F)
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {s.transactions.length > 0 && (
                          <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                            {s.transactions.map((t) => (
                              <li
                                key={t.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] bg-surface px-3 py-1.5 text-sm"
                              >
                                <span className="text-ink-soft">
                                  {heure(t.created_at)} ·{" "}
                                  {t.type === "encaissement"
                                    ? (LABELS_MOYEN[t.moyen_paiement ?? ""] ?? t.moyen_paiement)
                                    : `${LABELS_CATEGORIE_DEPENSE[t.categorie_depense ?? ""] ?? t.categorie_depense} (${
                                        LABELS_MOYEN[t.moyen_paiement ?? ""] ?? t.moyen_paiement
                                      })`}
                                  {t.libelle && ` · ${t.libelle}`}
                                </span>
                                <span
                                  className={`font-bold ${
                                    t.type === "encaissement" ? "text-green" : "text-red-600"
                                  }`}
                                >
                                  {t.type === "encaissement" ? "+" : "−"}
                                  {Number(t.montant).toLocaleString("fr-FR")} F
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

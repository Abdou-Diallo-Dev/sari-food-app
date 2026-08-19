import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconWallet } from "@/components/icons";
import { MOYENS_PAIEMENT_CAISSE, totauxParMoyen } from "@/lib/caisse";

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

type Periode = "jour" | "semaine" | "mois" | "annee" | "personnalise";

const PERIODES: { value: Periode; label: string }[] = [
  { value: "jour", label: "Jour" },
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "annee", label: "Année" },
  { value: "personnalise", label: "Personnalisé" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Transaction = {
  id: string;
  type: "encaissement" | "depense";
  montant: number;
  moyen_paiement: string | null;
  categorie_depense: string | null;
  libelle: string | null;
  created_at: string;
};

type TransactionAvecSession = Transaction & { session_id: string };

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

function jourCle(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function jourLabel(cle: string): string {
  return new Date(cle + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function lundiDeSemaine(date: string): string {
  const d = new Date(date + "T00:00:00");
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
}

function decalerPeriode(date: string, periode: "jour" | "semaine" | "mois" | "annee", delta: number): string {
  const d = new Date(date + "T00:00:00");
  if (periode === "jour") d.setDate(d.getDate() + delta);
  else if (periode === "semaine") d.setDate(d.getDate() + delta * 7);
  else if (periode === "mois") d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

function bornesPersonnalisees(debutIso: string, finIso: string): { debut: Date; fin: Date } {
  const debut = new Date(debutIso + "T00:00:00");
  const fin = new Date(finIso + "T00:00:00");
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

function labelPlage(debutIso: string, finIso: string): string {
  const debut = new Date(debutIso + "T00:00:00");
  const fin = new Date(finIso + "T00:00:00");
  if (debutIso === finIso) {
    return debut.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  return `${debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })} – ${fin.toLocaleDateString(
    "fr-FR",
    { day: "2-digit", month: "short", year: "numeric" },
  )}`;
}

function bornesPeriode(date: string, periode: "jour" | "semaine" | "mois" | "annee"): { debut: Date; fin: Date } {
  if (periode === "jour") {
    const debut = new Date(date + "T00:00:00");
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 1);
    return { debut, fin };
  }
  if (periode === "semaine") {
    const debut = new Date(lundiDeSemaine(date) + "T00:00:00");
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 7);
    return { debut, fin };
  }
  const d = new Date(date + "T00:00:00");
  if (periode === "mois") {
    return {
      debut: new Date(d.getFullYear(), d.getMonth(), 1),
      fin: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    };
  }
  return {
    debut: new Date(d.getFullYear(), 0, 1),
    fin: new Date(d.getFullYear() + 1, 0, 1),
  };
}

function labelPeriode(date: string, periode: "jour" | "semaine" | "mois" | "annee"): string {
  const { debut, fin } = bornesPeriode(date, periode);
  if (periode === "jour") {
    return debut.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
  }
  if (periode === "semaine") {
    const finInclusive = new Date(fin);
    finInclusive.setDate(finInclusive.getDate() - 1);
    return `${debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – ${finInclusive.toLocaleDateString(
      "fr-FR",
      { day: "2-digit", month: "short", year: "numeric" },
    )}`;
  }
  if (periode === "mois") {
    return debut.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  return String(debut.getFullYear());
}

function totauxSession(transactions: Transaction[]) {
  const totalEncaissements = transactions
    .filter((t) => t.type === "encaissement")
    .reduce((sum, t) => sum + Number(t.montant), 0);
  const totalDepenses = transactions
    .filter((t) => t.type === "depense")
    .reduce((sum, t) => sum + Number(t.montant), 0);
  return { totalEncaissements, totalDepenses };
}

function SessionCard({ s }: { s: Session }) {
  const { totalEncaissements, totalDepenses } = totauxSession(s.transactions);

  return (
    <details className="rounded-[14px] border border-line bg-paper p-4">
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
              s.statut === "ouverte" ? "bg-green/15 text-green" : "bg-surface text-ink-soft"
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
              {m.value === "especes" && s.statut === "cloturee" && (
                <div className="mt-1 flex justify-between border-t border-line pt-1 text-xs font-bold">
                  <span className="text-ink-soft">Compté / Écart</span>
                  <span className={Number(s.ecart_especes) === 0 ? "text-ink" : "text-red-600"}>
                    {Number(s.total_compte_especes).toLocaleString("fr-FR")} F (
                    {Number(s.ecart_especes) >= 0 ? "+" : ""}
                    {Number(s.ecart_especes).toLocaleString("fr-FR")} F)
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
                className={`font-bold ${t.type === "encaissement" ? "text-green" : "text-red-600"}`}
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
}

export default async function AdminCaissePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; periode?: string; debut?: string; fin?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const { date: dateParam, periode: periodeParam, debut: debutParam, fin: finParam } = await searchParams;
  const periode: Periode = (["jour", "semaine", "mois", "annee", "personnalise"] as const).includes(
    periodeParam as Periode,
  )
    ? (periodeParam as Periode)
    : "jour";
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : aujourdhui;

  let debutPerso = debutParam && DATE_RE.test(debutParam) ? debutParam : decalerPeriode(aujourdhui, "jour", -6);
  let finPerso = finParam && DATE_RE.test(finParam) ? finParam : aujourdhui;
  if (debutPerso > finPerso) {
    [debutPerso, finPerso] = [finPerso, debutPerso];
  }

  const { debut, fin } =
    periode === "personnalise" ? bornesPersonnalisees(debutPerso, finPerso) : bornesPeriode(date, periode);
  const estPeriodeCourante = fin.getTime() > Date.now();

  const supabase = await createClient();

  let restaurantsQuery = supabase.from("restaurants").select("id, nom").order("nom");
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsQuery = restaurantsQuery.eq("id", profile.restaurant_id);
  }
  const { data: restaurants } = await restaurantsQuery;

  const parRestaurant = await Promise.all(
    (restaurants ?? []).map(async (r) => {
      const { data: sessions } = await supabase
        .from("sessions_caisse")
        .select(
          "id, shift, fond_initial, fond_initial_especes, fond_initial_wave, fond_initial_orange_money, total_theorique, total_compte, total_compte_especes, ecart, ecart_especes, total_compte_wave, ecart_wave, total_compte_orange_money, ecart_orange_money, statut, ouverte_at, cloturee_at, utilisateurs(nom)",
        )
        .eq("restaurant_id", r.id)
        .gte("ouverte_at", debut.toISOString())
        .lt("ouverte_at", fin.toISOString())
        .order("ouverte_at", { ascending: false });

      const sessionsTypees = (sessions ?? []) as unknown as Omit<Session, "transactions">[];
      const sessionIds = sessionsTypees.map((s) => s.id);

      const { data: transactions } =
        sessionIds.length > 0
          ? await supabase
              .from("transactions_caisse")
              .select("id, session_id, type, montant, moyen_paiement, categorie_depense, libelle, created_at")
              .in("session_id", sessionIds)
              .order("created_at", { ascending: true })
          : { data: [] as TransactionAvecSession[] };

      const transactionsParSession = new Map<string, Transaction[]>();
      for (const t of (transactions ?? []) as unknown as TransactionAvecSession[]) {
        const liste = transactionsParSession.get(t.session_id) ?? [];
        liste.push(t);
        transactionsParSession.set(t.session_id, liste);
      }

      const sessionsAvecTransactions: Session[] = sessionsTypees.map((s) => ({
        ...s,
        transactions: transactionsParSession.get(s.id) ?? [],
      }));

      return { restaurant: r, sessions: sessionsAvecTransactions };
    }),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconWallet className="h-6 w-6 text-orange" />
        Caisse — supervision
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-[9px] border border-line bg-surface p-1">
          {PERIODES.map((p) => {
            const href =
              p.value === "personnalise"
                ? `/admin/caisse?periode=personnalise&debut=${debutPerso}&fin=${finPerso}`
                : `/admin/caisse?periode=${p.value}&date=${date}`;
            return (
              <Link
                key={p.value}
                href={href}
                className={`rounded-[7px] px-2.5 py-1 text-sm font-bold transition ${
                  periode === p.value
                    ? "bg-orange text-white"
                    : "text-ink-soft hover:text-orange"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>

        {periode === "personnalise" ? (
          <form action="/admin/caisse" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="periode" value="personnalise" />
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              Du
              <input
                type="date"
                name="debut"
                defaultValue={debutPerso}
                max={aujourdhui}
                className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              au
              <input
                type="date"
                name="fin"
                defaultValue={finPerso}
                max={aujourdhui}
                className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
              />
            </label>
            <button
              type="submit"
              className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white"
            >
              Afficher
            </button>
          </form>
        ) : (
          <>
            <Link
              href={`/admin/caisse?periode=${periode}&date=${decalerPeriode(date, periode, -1)}`}
              className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
            >
              ‹
            </Link>
            <span className="rounded-[9px] border border-line bg-surface px-3 py-1.5 text-sm font-bold capitalize text-ink">
              {labelPeriode(date, periode)}
            </span>
            {!estPeriodeCourante && (
              <Link
                href={`/admin/caisse?periode=${periode}&date=${decalerPeriode(date, periode, 1)}`}
                className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
              >
                ›
              </Link>
            )}
          </>
        )}
      </div>

      {periode === "personnalise" && (
        <p className="text-sm font-bold text-ink-soft">{labelPlage(debutPerso, finPerso)}</p>
      )}

      {parRestaurant.length === 0 ? (
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {parRestaurant.map(({ restaurant, sessions }) => {
            if (periode === "jour") {
              return (
                <section key={restaurant.id} className="rounded-card border border-line bg-surface p-5">
                  <h2 className="mb-4 font-display text-lg font-extrabold text-ink">{restaurant.nom}</h2>
                  {sessions.length === 0 ? (
                    <p className="text-sm text-ink-soft opacity-70">
                      Aucune session de caisse {estPeriodeCourante ? "aujourd'hui" : "ce jour-là"}.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {sessions.map((s) => (
                        <SessionCard key={s.id} s={s} />
                      ))}
                    </div>
                  )}
                </section>
              );
            }

            const totalEncaisseGlobal = sessions.reduce(
              (sum, s) => sum + totauxSession(s.transactions).totalEncaissements,
              0,
            );
            const totalDepensesGlobal = sessions.reduce(
              (sum, s) => sum + totauxSession(s.transactions).totalDepenses,
              0,
            );
            const totalEcartGlobal = sessions.reduce(
              (sum, s) => sum + (s.ecart_especes !== null ? Number(s.ecart_especes) : 0),
              0,
            );

            const sessionsParJour = new Map<string, Session[]>();
            for (const s of sessions) {
              const cle = jourCle(s.ouverte_at);
              const liste = sessionsParJour.get(cle) ?? [];
              liste.push(s);
              sessionsParJour.set(cle, liste);
            }
            const joursTries = [...sessionsParJour.keys()].sort((a, b) => (a < b ? 1 : -1));

            return (
              <section key={restaurant.id} className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-4 font-display text-lg font-extrabold text-ink">{restaurant.nom}</h2>

                {sessions.length === 0 ? (
                  <p className="text-sm text-ink-soft opacity-70">
                    Aucune session de caisse sur cette période.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-[10px] bg-paper p-2">
                        <div className="text-ink-soft">Encaissé</div>
                        <div className="font-bold text-green">
                          {totalEncaisseGlobal.toLocaleString("fr-FR")} F
                        </div>
                      </div>
                      <div className="rounded-[10px] bg-paper p-2">
                        <div className="text-ink-soft">Dépenses</div>
                        <div className="font-bold text-ink">
                          {totalDepensesGlobal.toLocaleString("fr-FR")} F
                        </div>
                      </div>
                      <div className="rounded-[10px] bg-paper p-2">
                        <div className="text-ink-soft">Écart cumulé</div>
                        <div
                          className={`font-bold ${totalEcartGlobal === 0 ? "text-ink" : "text-red-600"}`}
                        >
                          {totalEcartGlobal >= 0 ? "+" : ""}
                          {totalEcartGlobal.toLocaleString("fr-FR")} F
                        </div>
                      </div>
                    </div>

                    {joursTries.map((cle) => {
                      const sessionsJour = sessionsParJour.get(cle)!;
                      return (
                        <div key={cle}>
                          <h3 className="mb-2 text-sm font-bold capitalize text-ink-soft">
                            {jourLabel(cle)} · {sessionsJour.length} session
                            {sessionsJour.length > 1 ? "s" : ""}
                          </h3>
                          <div className="flex flex-col gap-3">
                            {sessionsJour.map((s) => (
                              <SessionCard key={s.id} s={s} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

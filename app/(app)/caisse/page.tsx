import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ouvrirSession, enregistrerDepense, cloturerSession, controlerCloture } from "./actions";
import { MOYENS_PAIEMENT_CAISSE, totauxParMoyen, type MoyenPaiementCaisse } from "@/lib/caisse";
import { IconWallet } from "@/components/icons";

const CATEGORIES_DEPENSE = [
  { value: "achat_stock", label: "Achat stock" },
  { value: "produit_entretien", label: "Produit d'entretien" },
  { value: "charge_operationnelle", label: "Charge opérationnelle" },
  { value: "divers", label: "Divers" },
] as const;

const LABELS_MOYEN: Record<string, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  wave: "Wave",
};

const LABELS_CATEGORIE_DEPENSE: Record<string, string> = {
  achat_stock: "Achat stock",
  produit_entretien: "Produit d'entretien",
  charge_operationnelle: "Charge opérationnelle",
  divers: "Divers",
};

type SessionPrecedente = {
  id: string;
  shift: "matin" | "soir";
  statut: "en_attente_controle" | "cloturee";
  fond_initial_especes: number;
  fond_initial_wave: number;
  fond_initial_orange_money: number;
  total_compte: number | null;
  total_compte_especes: number | null;
  ecart_especes: number | null;
  total_compte_wave: number | null;
  ecart_wave: number | null;
  total_compte_orange_money: number | null;
  ecart_orange_money: number | null;
  montant_garde_fonds_caisse: number | null;
  montant_transfere_comptable: number | null;
  ouverte_at: string;
  cloturee_at: string | null;
};

type SessionAControler = {
  id: string;
  shift: "matin" | "soir";
  total_compte_especes: number;
  restaurant_id: string;
  ouverte_at: string;
  utilisateurs: { nom: string } | null;
  restaurants: { nom: string } | null;
};

type TransactionSession = {
  id: string;
  session_id: string;
  type: "encaissement" | "depense";
  montant: number;
  moyen_paiement: string | null;
  categorie_depense: string | null;
  libelle: string | null;
  created_at: string;
};

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dateCourte(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function SectionSessionsPrecedentes({
  sessions,
  transactionsParSession,
}: {
  sessions: SessionPrecedente[];
  transactionsParSession: Map<string, TransactionSession[]>;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3 font-bold text-ink">Mes sessions précédentes</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-soft opacity-70">Aucune session clôturée pour le moment.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => {
            const txns = transactionsParSession.get(s.id) ?? [];
            return (
              <details key={s.id} className="rounded-[14px] border border-line bg-paper p-4">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">
                    {s.shift === "matin" ? "Matin" : "Soir"}{" "}
                    <span className="font-normal text-ink-soft">
                      · {dateCourte(s.ouverte_at)}
                      {s.statut === "en_attente_controle" && (
                        <span className="ml-1 rounded-full bg-orange/10 px-2 py-0.5 text-xs font-bold text-orange">
                          En attente de contrôle
                        </span>
                      )}
                      {s.statut === "cloturee" && s.cloturee_at && ` · clôturée à ${heure(s.cloturee_at)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-bold text-ink">
                      {s.total_compte !== null
                        ? `${Number(s.total_compte).toLocaleString("fr-FR")} F`
                        : "—"}
                    </span>
                    {s.ecart_especes !== null && (
                      <span
                        className={`text-xs font-bold ${
                          Number(s.ecart_especes) === 0 ? "text-ink" : "text-red-600"
                        }`}
                      >
                        Écart espèces {Number(s.ecart_especes) >= 0 ? "+" : ""}
                        {Number(s.ecart_especes).toLocaleString("fr-FR")} F
                      </span>
                    )}
                  </span>
                </summary>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {MOYENS_PAIEMENT_CAISSE.map((m) => {
                    const fondInitial =
                      m.value === "especes"
                        ? Number(s.fond_initial_especes)
                        : m.value === "wave"
                          ? Number(s.fond_initial_wave)
                          : Number(s.fond_initial_orange_money);
                    const { encaisse, depense } = totauxParMoyen(txns, m.value);
                    const theorique = fondInitial + encaisse - depense;
                    const compte =
                      m.value === "especes"
                        ? s.total_compte_especes
                        : m.value === "wave"
                          ? s.total_compte_wave
                          : s.total_compte_orange_money;
                    const ecart =
                      m.value === "especes"
                        ? s.ecart_especes
                        : m.value === "wave"
                          ? s.ecart_wave
                          : s.ecart_orange_money;
                    return (
                      <div
                        key={m.value}
                        className="rounded-[10px] border border-line bg-surface p-2.5 text-sm"
                      >
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
                        {compte !== null && (
                          <div className="mt-1 flex justify-between border-t border-line pt-1 text-xs font-bold">
                            <span className="text-ink-soft">Compté</span>
                            <span className={Number(ecart) === 0 ? "text-ink" : "text-red-600"}>
                              {Number(compte).toLocaleString("fr-FR")} F
                              {Number(ecart) !== 0 &&
                                ` (${Number(ecart) >= 0 ? "+" : ""}${Number(ecart).toLocaleString("fr-FR")})`}
                            </span>
                          </div>
                        )}
                        {m.value === "especes" && s.statut === "cloturee" && s.montant_garde_fonds_caisse !== null && (
                          <>
                            <div className="flex justify-between text-xs text-ink-soft">
                              <span>Gardé (fonds suivant)</span>
                              <span>{Number(s.montant_garde_fonds_caisse).toLocaleString("fr-FR")} F</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-green">
                              <span>Transféré comptable</span>
                              <span>
                                {Number(s.montant_transfere_comptable ?? 0).toLocaleString("fr-FR")} F
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {txns.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                    {txns.map((t) => (
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
  );
}

function SectionSessionsAControler({ sessions }: { sessions: SessionAControler[] }) {
  if (sessions.length === 0) return null;

  return (
    <section className="rounded-card border border-orange bg-orange/5 p-5">
      <h2 className="mb-3 font-bold text-ink">Sessions à contrôler</h2>
      <div className="flex flex-col gap-3">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-[14px] border border-line bg-surface p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-bold text-ink">
                {s.utilisateurs?.nom ?? "—"}
                <span className="font-normal text-ink-soft">
                  {" "}
                  · {s.shift === "matin" ? "Matin" : "Soir"} · {dateCourte(s.ouverte_at)}
                  {s.restaurants?.nom && ` · ${s.restaurants.nom}`}
                </span>
              </span>
              <span className="font-bold text-ink">
                Compté : {Number(s.total_compte_especes).toLocaleString("fr-FR")} F
              </span>
            </div>
            <form action={controlerCloture} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="session_id" value={s.id} />
              <input
                type="number"
                name="montant_garde_fonds_caisse"
                required
                min={0}
                max={s.total_compte_especes}
                step={1}
                placeholder="Fonds gardé pour la session suivante (F)"
                className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
              />
              <button
                type="submit"
                className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
              >
                Contrôler et transférer
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function CaissePage() {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const supabase = await createClient();
  const estGestion = profile.role === "manager" || profile.role === "admin";

  async function chargerSessionsAControler(): Promise<SessionAControler[]> {
    if (!estGestion) return [];
    let q = supabase
      .from("sessions_caisse")
      .select(
        "id, shift, total_compte_especes, restaurant_id, ouverte_at, utilisateurs!caissiere_id(nom), restaurants(nom)",
      )
      .eq("statut", "en_attente_controle")
      .order("ouverte_at", { ascending: true });
    if (profile.role === "manager" && profile.restaurant_id) {
      q = q.eq("restaurant_id", profile.restaurant_id);
    }
    const { data } = await q;
    return (data ?? []) as unknown as SessionAControler[];
  }

  const [{ data: session }, { data: sessionsPrecedentes }, sessionsAControler] = await Promise.all([
    supabase
      .from("sessions_caisse")
      .select(
        "id, shift, fond_initial_especes, fond_initial_wave, fond_initial_orange_money, ouverte_at",
      )
      .eq("caissiere_id", profile.id)
      .eq("statut", "ouverte")
      .maybeSingle(),
    supabase
      .from("sessions_caisse")
      .select(
        "id, shift, statut, fond_initial_especes, fond_initial_wave, fond_initial_orange_money, total_compte, total_compte_especes, ecart_especes, total_compte_wave, ecart_wave, total_compte_orange_money, ecart_orange_money, montant_garde_fonds_caisse, montant_transfere_comptable, ouverte_at, cloturee_at",
      )
      .eq("caissiere_id", profile.id)
      .in("statut", ["en_attente_controle", "cloturee"])
      .order("ouverte_at", { ascending: false })
      .limit(15),
    chargerSessionsAControler(),
  ]);

  const idsSessionsPrecedentes = (sessionsPrecedentes ?? []).map((s) => s.id);
  const { data: transactionsPrecedentes } =
    idsSessionsPrecedentes.length > 0
      ? await supabase
          .from("transactions_caisse")
          .select("id, session_id, type, montant, moyen_paiement, categorie_depense, libelle, created_at")
          .in("session_id", idsSessionsPrecedentes)
          .order("created_at", { ascending: true })
      : { data: [] as TransactionSession[] };

  const transactionsParSession = new Map<string, TransactionSession[]>();
  for (const t of (transactionsPrecedentes ?? []) as TransactionSession[]) {
    const liste = transactionsParSession.get(t.session_id) ?? [];
    liste.push(t);
    transactionsParSession.set(t.session_id, liste);
  }

  if (!session) {
    const { data: fondsDisponible } = profile.restaurant_id
      ? await supabase.rpc("fonds_caisse_disponible", { p_restaurant_id: profile.restaurant_id })
      : { data: 0 };
    const fondEspeces = Number(fondsDisponible ?? 0);

    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
          <IconWallet className="h-6 w-6 text-orange" />
          Caisse
        </h1>

        <form action={ouvrirSession} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <h2 className="font-bold text-ink">Ouvrir la caisse</h2>
          <select
            name="shift"
            required
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="matin">Matin</option>
            <option value="soir">Soir</option>
          </select>

          <p className="mt-1 text-xs font-bold text-ink-soft opacity-70">
            Solde initial par caisse
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col justify-center rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm">
              <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft opacity-70">
                Espèces (auto)
              </span>
              <span className="font-bold text-ink">{fondEspeces.toLocaleString("fr-FR")} F</span>
            </div>
            <input
              type="number"
              name="fond_initial_wave"
              defaultValue={0}
              min={0}
              step={1}
              placeholder="Wave"
              className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <input
              type="number"
              name="fond_initial_orange_money"
              defaultValue={0}
              min={0}
              step={1}
              placeholder="Orange Money"
              className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
          </div>
          <p className="text-xs text-ink-soft opacity-70">
            Le fonds espèces reprend automatiquement ce qui a été gardé lors de la dernière clôture
            contrôlée de ce restaurant.
          </p>

          <button
            type="submit"
            className="mt-1 rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
          >
            Ouvrir
          </button>
        </form>

        {estGestion && <SectionSessionsAControler sessions={sessionsAControler} />}

        <SectionSessionsPrecedentes
          sessions={sessionsPrecedentes ?? []}
          transactionsParSession={transactionsParSession}
        />
      </div>
    );
  }

  const [{ data: transactions }, { data: ingredients }] = await Promise.all([
    supabase
      .from("transactions_caisse")
      .select("id, type, montant, libelle, moyen_paiement, categorie_depense, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ingredients")
      .select("id, nom, unite")
      .eq("restaurant_id", profile.restaurant_id!)
      .eq("actif", true)
      .order("nom"),
  ]);

  const especes = totauxParMoyen(transactions ?? [], "especes");
  const wave = totauxParMoyen(transactions ?? [], "wave");
  const orangeMoney = totauxParMoyen(transactions ?? [], "orange_money");

  const soldes: { moyen: MoyenPaiementCaisse; label: string; fondInitial: number; encaisse: number; depense: number }[] = [
    {
      moyen: "especes",
      label: "Espèces",
      fondInitial: Number(session.fond_initial_especes),
      encaisse: especes.encaisse,
      depense: especes.depense,
    },
    {
      moyen: "wave",
      label: "Wave",
      fondInitial: Number(session.fond_initial_wave),
      encaisse: wave.encaisse,
      depense: wave.depense,
    },
    {
      moyen: "orange_money",
      label: "Orange Money",
      fondInitial: Number(session.fond_initial_orange_money),
      encaisse: orangeMoney.encaisse,
      depense: orangeMoney.depense,
    },
  ];

  const totalConsolide = soldes.reduce((s, m) => s + m.fondInitial + m.encaisse - m.depense, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold text-ink">Caisse</h1>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold text-ink">
            Session {session.shift === "matin" ? "matin" : "soir"} — ouverte
          </span>
          <span className="font-display text-lg font-extrabold text-orange">
            Total {totalConsolide.toLocaleString("fr-FR")} F
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {soldes.map((m) => {
            const theorique = m.fondInitial + m.encaisse - m.depense;
            return (
              <div key={m.moyen} className="rounded-[10px] bg-paper p-3 text-sm">
                <div className="mb-1 font-bold text-ink">{m.label}</div>
                <div className="text-ink-soft">
                  Initial <span className="font-bold text-ink">{m.fondInitial.toLocaleString("fr-FR")} F</span>
                </div>
                <div className="text-ink-soft">
                  Encaissé <span className="font-bold text-green">{m.encaisse.toLocaleString("fr-FR")} F</span>
                </div>
                <div className="text-ink-soft">
                  Dépenses <span className="font-bold text-ink">{m.depense.toLocaleString("fr-FR")} F</span>
                </div>
                <div className="mt-1 border-t border-line pt-1 font-bold text-ink">
                  Solde {theorique.toLocaleString("fr-FR")} F
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex gap-2">
        <Link
          href="/caisse/journal?type=encaissements"
          className="flex-1 rounded-[11px] border border-line bg-surface px-3 py-2.5 text-center text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
        >
          Journal des encaissements
        </Link>
        <Link
          href="/caisse/journal?type=depenses"
          className="flex-1 rounded-[11px] border border-line bg-surface px-3 py-2.5 text-center text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
        >
          Journal des dépenses
        </Link>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Enregistrer une dépense</h2>
        <form action={enregistrerDepense} className="flex flex-wrap gap-2">
          <input type="hidden" name="session_id" value={session.id} />
          <select
            name="categorie_depense"
            required
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          >
            {CATEGORIES_DEPENSE.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            name="moyen_paiement"
            required
            title="Caisse concernée par la dépense"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          >
            {MOYENS_PAIEMENT_CAISSE.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="libelle"
            placeholder="Libellé (optionnel)"
            className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <input
            type="number"
            name="montant"
            required
            min={1}
            step={1}
            placeholder="Montant"
            className="w-28 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <button
            type="submit"
            className="rounded-[9px] border border-line px-3 py-1.5 text-sm font-bold text-ink hover:border-orange hover:text-orange"
          >
            Ajouter
          </button>
          {(ingredients ?? []).length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2">
              <span className="text-xs text-ink-soft opacity-70">
                Si « Achat stock » : ingrédient concerné et quantité achetée —
              </span>
              <select
                name="ingredient_id"
                className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
              >
                <option value="">— ingrédient —</option>
                {(ingredients ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nom} ({i.unite})
                  </option>
                ))}
              </select>
              <input
                type="number"
                name="quantite_stock"
                min={0.001}
                step="0.001"
                placeholder="Quantité"
                className="w-28 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
              />
            </div>
          )}
        </form>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Historique de la session</h2>
        {(transactions ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun mouvement pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(transactions ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] bg-paper px-3 py-1.5 text-sm"
              >
                <span className="text-ink-soft">
                  {new Date(t.created_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ·{" "}
                  {t.type === "encaissement"
                    ? (LABELS_MOYEN[t.moyen_paiement ?? ""] ?? t.moyen_paiement)
                    : `${LABELS_CATEGORIE_DEPENSE[t.categorie_depense ?? ""] ?? t.categorie_depense} (${LABELS_MOYEN[t.moyen_paiement ?? ""] ?? t.moyen_paiement})`}
                  {t.libelle && ` · ${t.libelle}`}
                </span>
                <span className={`font-bold ${t.type === "encaissement" ? "text-green" : "text-red-600"}`}>
                  {t.type === "encaissement" ? "+" : "−"}
                  {Number(t.montant).toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Remettre la caisse</h2>
        <p className="mb-2 text-xs text-ink-soft opacity-70">
          Déclarez le montant détenu pour chaque moyen de paiement — un manager devra ensuite
          contrôler l&apos;espèces et fixer le fonds de la prochaine session avant que la caisse ne
          soit définitivement clôturée.
        </p>
        <form action={cloturerSession} className="flex flex-col gap-2">
          <input type="hidden" name="session_id" value={session.id} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="number"
              name="total_compte_especes"
              required
              min={0}
              step={1}
              placeholder="Espèces comptées (F)"
              className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <input
              type="number"
              name="total_compte_wave"
              required
              min={0}
              step={1}
              placeholder="Wave détenu (F)"
              className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <input
              type="number"
              name="total_compte_orange_money"
              required
              min={0}
              step={1}
              placeholder="Orange Money détenu (F)"
              className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
          </div>
          <button
            type="submit"
            className="mt-1 rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
          >
            Remettre au manager
          </button>
        </form>
      </section>

      {estGestion && <SectionSessionsAControler sessions={sessionsAControler} />}

      <SectionSessionsPrecedentes
        sessions={sessionsPrecedentes ?? []}
        transactionsParSession={transactionsParSession}
      />
    </div>
  );
}

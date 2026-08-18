import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconWallet } from "@/components/icons";
import { PERIODES, resoudrePeriode, type TypePeriode } from "@/lib/rapports";

const MOYENS = [
  { value: "especes", label: "Espèces" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
] as const;

type Moyen = (typeof MOYENS)[number]["value"];

type SessionPeriode = {
  id: string;
  fond_initial_especes: number;
  fond_initial_wave: number;
  fond_initial_orange_money: number;
  ecart_especes: number | null;
  ecart_wave: number | null;
  ecart_orange_money: number | null;
  statut: "ouverte" | "cloturee";
};

type Transaction = {
  id: string;
  session_id: string;
  type: "encaissement" | "depense";
  montant: number;
  moyen_paiement: Moyen | null;
  libelle: string | null;
  categorie_depense: string | null;
  created_at: string;
  sessions_caisse: { fond_initial_especes: number; fond_initial_wave: number; fond_initial_orange_money: number } | null;
};

type RemiseVerifiee = {
  id: string;
  montant_remis: number;
  fond_nouvelle_session: number;
  montant_transfere_comptable: number;
  verifiee_at: string;
  caissiere: { nom: string } | null;
  manager: { nom: string } | null;
};

function fondInitialMoyen(s: { fond_initial_especes: number; fond_initial_wave: number; fond_initial_orange_money: number }, moyen: Moyen) {
  return moyen === "especes"
    ? Number(s.fond_initial_especes)
    : moyen === "wave"
      ? Number(s.fond_initial_wave)
      : Number(s.fond_initial_orange_money);
}

function CarteSolde({ label, valeur, accent }: { label: string; valeur: string; accent?: "vert" | "rouge" }) {
  return (
    <div className="rounded-[10px] bg-paper p-3 text-center">
      <div className="text-xs text-ink-soft">{label}</div>
      <div
        className={`font-bold ${accent === "vert" ? "text-green" : accent === "rouge" ? "text-red-600" : "text-ink"}`}
      >
        {valeur}
      </div>
    </div>
  );
}

export default async function ComptablePage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; debut?: string; fin?: string; restaurant?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["comptable", "admin", "manager", "pdg"]);

  const supabase = await createClient();
  const { periode: periodeParam, debut: debutParam, fin: finParam, restaurant: restaurantParam } =
    await searchParams;

  const periode: TypePeriode = PERIODES.some((p) => p.value === periodeParam)
    ? (periodeParam as TypePeriode)
    : "jour";

  const { data: tousRestaurants } = await supabase.from("restaurants").select("id, nom").order("nom");
  let restaurantsVisibles = tousRestaurants ?? [];
  if ((profile.role === "manager" || profile.role === "comptable") && profile.restaurant_id) {
    restaurantsVisibles = restaurantsVisibles.filter((r) => r.id === profile.restaurant_id);
  }

  const restaurantSelectionneId =
    profile.role === "manager" || profile.role === "comptable"
      ? (profile.restaurant_id ?? null)
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
    return `/comptable?${q.toString()}`;
  };

  if (!restaurant) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-display text-2xl font-extrabold text-ink">Comptabilité</h1>
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      </div>
    );
  }

  const [{ data: sessionsPeriode }, { data: sessionsOuvertes }, { data: transactionsData }, { data: remisesData }] =
    await Promise.all([
      supabase
        .from("sessions_caisse")
        .select(
          "id, fond_initial_especes, fond_initial_wave, fond_initial_orange_money, ecart_especes, ecart_wave, ecart_orange_money, statut",
        )
        .eq("restaurant_id", restaurant.id)
        .gte("ouverte_at", debut.toISOString())
        .lt("ouverte_at", fin.toISOString()),
      // Fonds de caisse actuels : indépendant de la période, vue temps réel.
      supabase
        .from("sessions_caisse")
        .select("fond_initial_especes, fond_initial_wave, fond_initial_orange_money")
        .eq("restaurant_id", restaurant.id)
        .eq("statut", "ouverte"),
      supabase
        .from("transactions_caisse")
        .select(
          "id, session_id, type, montant, moyen_paiement, libelle, categorie_depense, created_at, sessions_caisse!inner(restaurant_id, fond_initial_especes, fond_initial_wave, fond_initial_orange_money)",
        )
        .eq("sessions_caisse.restaurant_id", restaurant.id)
        .gte("created_at", debut.toISOString())
        .lt("created_at", fin.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("remises_caisse")
        .select(
          "id, montant_remis, fond_nouvelle_session, montant_transfere_comptable, verifiee_at, caissiere:caissiere_id(nom), manager:manager_id(nom)",
        )
        .eq("restaurant_id", restaurant.id)
        .eq("statut", "verifiee")
        .gte("verifiee_at", debut.toISOString())
        .lt("verifiee_at", fin.toISOString())
        .order("verifiee_at", { ascending: false }),
    ]);

  const sessions = (sessionsPeriode ?? []) as SessionPeriode[];
  const transactions = (transactionsData ?? []) as unknown as Transaction[];
  const remises = (remisesData ?? []) as unknown as RemiseVerifiee[];

  function chiffresMoyen(moyen: Moyen) {
    const soldeInitial = sessions.reduce((s, ses) => s + fondInitialMoyen(ses, moyen), 0);
    const entrees = transactions
      .filter((t) => t.moyen_paiement === moyen && t.type === "encaissement")
      .reduce((s, t) => s + Number(t.montant), 0);
    const sorties = transactions
      .filter((t) => t.moyen_paiement === moyen && t.type === "depense")
      .reduce((s, t) => s + Number(t.montant), 0);
    const ecarts = sessions
      .filter((s) => s.statut === "cloturee")
      .reduce((s, ses) => {
        const e = moyen === "especes" ? ses.ecart_especes : moyen === "wave" ? ses.ecart_wave : ses.ecart_orange_money;
        return s + (e !== null ? Number(e) : 0);
      }, 0);
    const transferts = moyen === "especes" ? remises.reduce((s, r) => s + Number(r.montant_transfere_comptable), 0) : 0;
    const fondsCourants =
      (sessionsOuvertes ?? []).reduce((s, ses) => s + fondInitialMoyen(ses, moyen), 0);
    const soldeFinal = soldeInitial + entrees - sorties;
    return { soldeInitial, entrees, sorties, transferts, fondsCourants, soldeFinal, ecarts };
  }

  const chiffres: Record<Moyen, ReturnType<typeof chiffresMoyen>> = {
    especes: chiffresMoyen("especes"),
    wave: chiffresMoyen("wave"),
    orange_money: chiffresMoyen("orange_money"),
  };
  const global = {
    soldeInitial: MOYENS.reduce((s, m) => s + chiffres[m.value].soldeInitial, 0),
    entrees: MOYENS.reduce((s, m) => s + chiffres[m.value].entrees, 0),
    sorties: MOYENS.reduce((s, m) => s + chiffres[m.value].sorties, 0),
    transferts: chiffres.especes.transferts,
    fondsCourants: MOYENS.reduce((s, m) => s + chiffres[m.value].fondsCourants, 0),
    soldeFinal: MOYENS.reduce((s, m) => s + chiffres[m.value].soldeFinal, 0),
    ecarts: MOYENS.reduce((s, m) => s + chiffres[m.value].ecarts, 0),
  };

  // Solde avant/après par mouvement : cumul par moyen, à l'intérieur de sa
  // propre session (le fond initial de la session sert de point de départ),
  // puis remise dans l'ordre chronologique global pour l'affichage.
  const cumulsParSession = new Map<string, Record<Moyen, number>>();
  const historique = [...transactions]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((t) => {
      if (!cumulsParSession.has(t.session_id) && t.sessions_caisse) {
        cumulsParSession.set(t.session_id, {
          especes: Number(t.sessions_caisse.fond_initial_especes),
          wave: Number(t.sessions_caisse.fond_initial_wave),
          orange_money: Number(t.sessions_caisse.fond_initial_orange_money),
        });
      }
      const cumul = cumulsParSession.get(t.session_id);
      const moyen = t.moyen_paiement ?? "especes";
      const soldeAvant = cumul ? cumul[moyen] : 0;
      const delta = t.type === "encaissement" ? Number(t.montant) : -Number(t.montant);
      const soldeApres = soldeAvant + delta;
      if (cumul) cumul[moyen] = soldeApres;
      return { ...t, soldeAvant, soldeApres };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconWallet className="h-6 w-6 text-orange" />
        Comptabilité
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
        <form className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
          <input type="hidden" name="periode" value="personnalise" />
          {restaurantSelectionneId && <input type="hidden" name="restaurant" value={restaurantSelectionneId} />}
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-soft">
            Du
            <input type="date" name="debut" defaultValue={debutParam} className="rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-soft">
            Au
            <input type="date" name="fin" defaultValue={finParam} className="rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink" />
          </label>
          <button type="submit" className="rounded-[9px] bg-orange px-4 py-1.5 text-sm font-bold text-white">
            Appliquer
          </button>
        </form>
      )}

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-lg font-extrabold text-ink">
          Caisse globale · {restaurant.nom} · {labelPeriode}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CarteSolde label="Solde initial" valeur={`${global.soldeInitial.toLocaleString("fr-FR")} F`} />
          <CarteSolde label="Entrées" valeur={`${global.entrees.toLocaleString("fr-FR")} F`} accent="vert" />
          <CarteSolde label="Sorties" valeur={`${global.sorties.toLocaleString("fr-FR")} F`} accent="rouge" />
          <CarteSolde label="Transferts reçus" valeur={`${global.transferts.toLocaleString("fr-FR")} F`} accent="vert" />
          <CarteSolde label="Fonds de caisse actuels" valeur={`${global.fondsCourants.toLocaleString("fr-FR")} F`} />
          <CarteSolde label="Solde final" valeur={`${global.soldeFinal.toLocaleString("fr-FR")} F`} />
          <CarteSolde
            label="Écarts"
            valeur={`${global.ecarts >= 0 ? "+" : ""}${global.ecarts.toLocaleString("fr-FR")} F`}
            accent={global.ecarts === 0 ? undefined : "rouge"}
          />
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-lg font-extrabold text-orange">Sous-comptes</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MOYENS.map((m) => {
            const c = chiffres[m.value];
            return (
              <div key={m.value} className="rounded-[12px] border border-line bg-paper p-3">
                <h3 className="mb-2 font-bold text-ink">{m.label}</h3>
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between text-ink-soft">
                    <span>Initial</span>
                    <span className="text-ink">{c.soldeInitial.toLocaleString("fr-FR")} F</span>
                  </div>
                  <div className="flex justify-between text-ink-soft">
                    <span>Entrées</span>
                    <span className="text-green">{c.entrees.toLocaleString("fr-FR")} F</span>
                  </div>
                  <div className="flex justify-between text-ink-soft">
                    <span>Sorties</span>
                    <span className="text-red-600">{c.sorties.toLocaleString("fr-FR")} F</span>
                  </div>
                  {m.value === "especes" && (
                    <div className="flex justify-between text-ink-soft">
                      <span>Transferts reçus</span>
                      <span className="text-ink">{c.transferts.toLocaleString("fr-FR")} F</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-line pt-1 font-bold text-ink">
                    <span>Solde final</span>
                    <span>{c.soldeFinal.toLocaleString("fr-FR")} F</span>
                  </div>
                  {c.ecarts !== 0 && (
                    <div className="flex justify-between text-xs font-bold text-red-600">
                      <span>Écart</span>
                      <span>
                        {c.ecarts >= 0 ? "+" : ""}
                        {c.ecarts.toLocaleString("fr-FR")} F
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {remises.length > 0 && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold text-ink">Transferts reçus (espèces)</h2>
          <ul className="flex flex-col gap-1.5">
            {remises.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] bg-paper px-3 py-2 text-sm">
                <span className="text-ink-soft">
                  {new Date(r.verifiee_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {r.caissiere?.nom ?? "—"} → {r.manager?.nom ?? "—"}
                  {" · remis "}
                  {Number(r.montant_remis).toLocaleString("fr-FR")} F, fonds gardé{" "}
                  {Number(r.fond_nouvelle_session).toLocaleString("fr-FR")} F
                </span>
                <span className="font-bold text-green">
                  +{Number(r.montant_transfere_comptable).toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold text-ink">Historique détaillé</h2>
        {historique.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun mouvement sur cette période.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {historique.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] bg-paper px-3 py-1.5 text-xs">
                <span className="text-ink-soft">
                  {new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {MOYENS.find((m) => m.value === t.moyen_paiement)?.label ?? t.moyen_paiement}
                  {t.libelle && ` · ${t.libelle}`}
                  {" · réf. "}
                  {t.id.slice(0, 8)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-ink-soft">
                    {t.soldeAvant.toLocaleString("fr-FR")} → {t.soldeApres.toLocaleString("fr-FR")} F
                  </span>
                  <span className={`font-bold ${t.type === "encaissement" ? "text-green" : "text-red-600"}`}>
                    {t.type === "encaissement" ? "+" : "−"}
                    {Number(t.montant).toLocaleString("fr-FR")} F
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

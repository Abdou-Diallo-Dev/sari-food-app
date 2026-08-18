import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconWallet } from "@/components/icons";
import { MOYENS_PAIEMENT_CAISSE } from "@/lib/caisse";
import { enregistrerMouvementCaisseGlobale } from "./actions";

const LABELS_SOUS_CAISSE: Record<string, string> = {
  especes: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
};

const LABELS_CATEGORIE: Record<string, string> = {
  cloture_session: "Clôture de caisse",
  decaissement_appro: "Décaissement approvisionnement",
  salaire: "Salaire",
  depot: "Dépôt / apport",
  autre_entree: "Autre entrée",
  autre_sortie: "Autre sortie",
};

const CATEGORIES_MANUELLES = [
  { value: "depot", label: "Dépôt / apport (entrée)" },
  { value: "autre_entree", label: "Autre entrée" },
  { value: "salaire", label: "Salaire (sortie)" },
  { value: "autre_sortie", label: "Autre sortie" },
];

type Periode = "jour" | "semaine" | "mois" | "annee" | "personnalise";

const PERIODES: { value: Periode; label: string }[] = [
  { value: "jour", label: "Jour" },
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "annee", label: "Année" },
  { value: "personnalise", label: "Personnalisé" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Mouvement = {
  id: string;
  type: "entree" | "sortie";
  sous_caisse: "especes" | "wave" | "orange_money";
  categorie: string;
  montant: number;
  libelle: string | null;
  created_at: string;
  restaurants: { nom: string } | null;
  utilisateurs: { nom: string } | null;
  sessions_caisse: { shift: string } | null;
  demandes_approvisionnement: { ingredient: { nom: string } | null } | null;
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

function provenance(m: Mouvement): string | null {
  if (m.categorie === "cloture_session" && m.sessions_caisse) {
    return `Clôture ${m.sessions_caisse.shift === "matin" ? "du matin" : "du soir"}`;
  }
  if (m.categorie === "decaissement_appro") {
    const ingredient = m.demandes_approvisionnement?.ingredient?.nom;
    return ingredient ? `Décaissement — ${ingredient}` : "Décaissement approvisionnement";
  }
  return null;
}

export default async function CaisseGlobalePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    periode?: string;
    debut?: string;
    fin?: string;
    sous_caisse?: string;
    categorie?: string;
  }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "comptable", "pdg"]);
  const lectureSeule = profile.role === "pdg";

  const {
    date: dateParam,
    periode: periodeParam,
    debut: debutParam,
    fin: finParam,
    sous_caisse: sousCaisseFiltre,
    categorie: categorieFiltre,
  } = await searchParams;

  const periode: Periode = (["jour", "semaine", "mois", "annee", "personnalise"] as const).includes(
    periodeParam as Periode,
  )
    ? (periodeParam as Periode)
    : "mois";
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

  const [{ data: soldes }, { data: restaurants }] = await Promise.all([
    supabase.rpc("soldes_caisse_globale"),
    supabase.from("restaurants").select("id, nom").order("nom"),
  ]);

  const soldesParSousCaisse = new Map<string, number>(
    ((soldes ?? []) as { sous_caisse: string; solde: number }[]).map((s) => [s.sous_caisse, Number(s.solde)]),
  );
  const soldeTotal = MOYENS_PAIEMENT_CAISSE.reduce(
    (sum, m) => sum + (soldesParSousCaisse.get(m.value) ?? 0),
    0,
  );

  let requete = supabase
    .from("mouvements_caisse_globale")
    .select(
      "id, type, sous_caisse, categorie, montant, libelle, created_at, restaurants(nom), utilisateurs(nom), sessions_caisse(shift), demandes_approvisionnement(ingredient:ingredients(nom))",
    )
    .gte("created_at", debut.toISOString())
    .lt("created_at", fin.toISOString())
    .order("created_at", { ascending: false });

  if (sousCaisseFiltre && MOYENS_PAIEMENT_CAISSE.some((m) => m.value === sousCaisseFiltre)) {
    requete = requete.eq("sous_caisse", sousCaisseFiltre);
  }
  if (categorieFiltre && LABELS_CATEGORIE[categorieFiltre]) {
    requete = requete.eq("categorie", categorieFiltre);
  }

  const { data } = await requete;
  const mouvements = (data ?? []) as unknown as Mouvement[];

  const mouvementsParJour = new Map<string, Mouvement[]>();
  for (const m of mouvements) {
    const cle = jourCle(m.created_at);
    const liste = mouvementsParJour.get(cle) ?? [];
    liste.push(m);
    mouvementsParJour.set(cle, liste);
  }
  const joursTries = [...mouvementsParJour.keys()].sort((a, b) => (a < b ? 1 : -1));

  const lienAvec = (params: Record<string, string>) => {
    const q = new URLSearchParams({
      periode,
      date,
      ...(sousCaisseFiltre ? { sous_caisse: sousCaisseFiltre } : {}),
      ...(categorieFiltre ? { categorie: categorieFiltre } : {}),
      ...params,
    });
    return `/caisse-globale?${q.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconWallet className="h-6 w-6 text-orange" />
        Caisse globale
      </h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MOYENS_PAIEMENT_CAISSE.map((m) => (
          <div key={m.value} className="rounded-card border border-line bg-surface p-4 text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-soft opacity-70">
              {m.label}
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-ink">
              {(soldesParSousCaisse.get(m.value) ?? 0).toLocaleString("fr-FR")} F
            </div>
          </div>
        ))}
        <div className="rounded-card border border-orange bg-orange/5 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-orange opacity-80">Total</div>
          <div className="mt-1 font-display text-xl font-extrabold text-orange">
            {soldeTotal.toLocaleString("fr-FR")} F
          </div>
        </div>
      </div>

      {!lectureSeule && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold text-ink">Nouveau mouvement</h2>
          <form
            action={enregistrerMouvementCaisseGlobale}
            className="flex flex-wrap items-center gap-2"
          >
            <select
              name="categorie"
              required
              defaultValue=""
              className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="" disabled>
                — catégorie —
              </option>
              {CATEGORIES_MANUELLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              name="sous_caisse"
              required
              defaultValue=""
              className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="" disabled>
                — sous-caisse —
              </option>
              {MOYENS_PAIEMENT_CAISSE.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="montant"
              required
              min={1}
              step={1}
              placeholder="Montant (F)"
              className="w-32 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <input
              type="text"
              name="libelle"
              required
              placeholder="Libellé (ex: salaire équipe juillet)"
              className="min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            {restaurants && restaurants.length > 0 && (
              <select
                name="restaurant_id"
                defaultValue=""
                className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
              >
                <option value="">— restaurant (optionnel) —</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nom}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="rounded-[8px] bg-orange px-3 py-1 text-sm font-bold text-white"
            >
              Enregistrer
            </button>
          </form>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-[9px] border border-line bg-surface p-1">
          {PERIODES.map((p) => {
            const href =
              p.value === "personnalise"
                ? `/caisse-globale?periode=personnalise&debut=${debutPerso}&fin=${finPerso}`
                : lienAvec({ periode: p.value });
            return (
              <Link
                key={p.value}
                href={href}
                className={`rounded-[7px] px-2.5 py-1 text-sm font-bold transition ${
                  periode === p.value ? "bg-orange text-white" : "text-ink-soft hover:text-orange"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>

        {periode === "personnalise" ? (
          <form action="/caisse-globale" className="flex flex-wrap items-center gap-2">
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
            <button type="submit" className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white">
              Afficher
            </button>
          </form>
        ) : (
          <>
            <Link
              href={lienAvec({ date: decalerPeriode(date, periode, -1) })}
              className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
            >
              ‹
            </Link>
            <span className="rounded-[9px] border border-line bg-surface px-3 py-1.5 text-sm font-bold capitalize text-ink">
              {labelPeriode(date, periode)}
            </span>
            {!estPeriodeCourante && (
              <Link
                href={lienAvec({ date: decalerPeriode(date, periode, 1) })}
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

      <div className="flex flex-wrap gap-2">
        <Link
          href={lienAvec({ sous_caisse: "" })}
          className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
            !sousCaisseFiltre ? "border-orange bg-orange text-white" : "border-line bg-surface text-ink-soft hover:border-orange"
          }`}
        >
          Toutes les sous-caisses
        </Link>
        {MOYENS_PAIEMENT_CAISSE.map((m) => (
          <Link
            key={m.value}
            href={lienAvec({ sous_caisse: m.value })}
            className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
              sousCaisseFiltre === m.value
                ? "border-orange bg-orange text-white"
                : "border-line bg-surface text-ink-soft hover:border-orange"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Historique</h2>
        {mouvements.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun mouvement sur cette période.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {joursTries.map((cle) => (
              <div key={cle}>
                <h3 className="mb-2 text-sm font-bold capitalize text-ink-soft">{jourLabel(cle)}</h3>
                <ul className="flex flex-col gap-1.5">
                  {mouvementsParJour.get(cle)!.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <span className="text-ink-soft">
                        {heure(m.created_at)} · <span className="font-bold text-ink">{LABELS_CATEGORIE[m.categorie] ?? m.categorie}</span>{" "}
                        · {LABELS_SOUS_CAISSE[m.sous_caisse]}
                        {m.libelle && ` · ${m.libelle}`}
                        {provenance(m) && ` · ${provenance(m)}`}
                        {m.restaurants?.nom && ` · ${m.restaurants.nom}`}
                        {" · "}
                        {m.utilisateurs?.nom ?? "—"}
                      </span>
                      <span className={`font-bold ${m.type === "entree" ? "text-green" : "text-red-600"}`}>
                        {m.type === "entree" ? "+" : "−"}
                        {Number(m.montant).toLocaleString("fr-FR")} F
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

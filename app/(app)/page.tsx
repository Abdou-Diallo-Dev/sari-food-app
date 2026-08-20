import Link from "next/link";
import type { ComponentType } from "react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconAlert } from "@/components/icons";
import { navItemsPour, ROLES_CUISINE } from "@/lib/nav";
import { LABELS_ROLE } from "@/lib/roles";

const LABELS_POLE: Record<string, string> = {
  patisserie: "Pâtisserie",
  boulangerie: "Boulangerie",
  fastfood: "Fast-Food",
};

function KpiCard({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string;
  accent?: "orange" | "green" | "red";
}) {
  const couleur =
    accent === "green"
      ? "text-green"
      : accent === "red"
        ? "text-red-600"
        : accent === "orange"
          ? "text-orange"
          : "text-ink";
  return (
    <div className="rounded-[14px] bg-paper p-4 text-center">
      <div className="text-xs font-bold text-ink-soft">{label}</div>
      <div className={`mt-1 font-display text-xl font-extrabold ${couleur}`}>{valeur}</div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-4 py-5 text-center transition hover:border-orange hover:shadow-sm"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-orange">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-bold text-ink">{label}</span>
    </Link>
  );
}

export default async function Home() {
  const profile = await requireProfile();
  const role = profile.role;

  const isGestion = role === "admin" || role === "pdg" || role === "manager";

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);
  const debutJourneeIso = debutJournee.toISOString();

  const heure = new Date().getHours();
  const salutation = heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";

  const quickLinks = navItemsPour(role);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <p className="text-[.75rem] font-bold uppercase tracking-[.1em] text-orange">
          {LABELS_ROLE[role] ?? role}
        </p>
        <h1 className="font-display text-2xl font-extrabold text-ink">
          {salutation}, {profile.nom}
        </h1>
      </div>

      {isGestion && (
        <ResumeGestion
          role={role}
          restaurantId={profile.restaurant_id}
          debutJourneeIso={debutJourneeIso}
        />
      )}

      {role === "caissiere" && (
        <ResumeCaissiere caissiereId={profile.id} debutJourneeIso={debutJourneeIso} />
      )}

      {ROLES_CUISINE.includes(role) && profile.pole && (
        <ResumeCuisine
          pole={profile.pole}
          restaurantId={profile.restaurant_id}
          labelPole={LABELS_POLE[profile.pole] ?? profile.pole}
        />
      )}

      {quickLinks.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold text-ink-soft">Accès rapide</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickLinks.map((q) => (
              <QuickLink key={q.href} href={q.href} label={q.label} Icon={q.icon} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function ResumeGestion({
  role,
  restaurantId,
  debutJourneeIso,
}: {
  role: string;
  restaurantId: string | null;
  debutJourneeIso: string;
}) {
  const supabase = await createClient();

  let restaurantsQuery = supabase.from("restaurants").select("id");
  if (role === "manager" && restaurantId) {
    restaurantsQuery = restaurantsQuery.eq("id", restaurantId);
  }
  const { data: restaurants } = await restaurantsQuery;
  const ids = (restaurants ?? []).map((r) => r.id);

  if (ids.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface p-5">
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      </section>
    );
  }

  const [{ data: commandesJour }, { data: sessionsJour }, { data: ingredients }, { data: depensesJour }] =
    await Promise.all([
      supabase
        .from("commandes")
        .select("total, statut")
        .in("restaurant_id", ids)
        .gte("created_at", debutJourneeIso),
      supabase
        .from("sessions_caisse")
        .select("statut, ecart")
        .in("restaurant_id", ids)
        .gte("ouverte_at", debutJourneeIso),
      supabase.from("ingredients").select("stock_actuel, seuil_alerte").in("restaurant_id", ids),
      supabase
        .from("transactions_caisse")
        .select("montant, sessions_caisse!inner(restaurant_id)")
        .eq("type", "depense")
        .in("sessions_caisse.restaurant_id", ids)
        .gte("created_at", debutJourneeIso),
    ]);

  const caJour = (commandesJour ?? [])
    .filter((c) => c.statut === "payee")
    .reduce((s, c) => s + Number(c.total), 0);
  const nbCommandes = (commandesJour ?? []).length;
  const commandesAnnulees = (commandesJour ?? []).filter((c) => c.statut === "annulee").length;
  const sessionsOuvertes = (sessionsJour ?? []).filter((s) => s.statut === "ouverte").length;
  const ecartJour = (sessionsJour ?? []).reduce((s, x) => s + Number(x.ecart ?? 0), 0);
  const depensesTotal = (depensesJour ?? []).reduce((s, t) => s + Number(t.montant), 0);
  const alertesStock = (ingredients ?? []).filter(
    (i) => Number(i.stock_actuel) <= Number(i.seuil_alerte),
  ).length;

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink">Aujourd&apos;hui</h2>
        <Link href="/dashboard" className="text-sm font-bold text-orange hover:underline">
          Détails →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="CA du jour" valeur={`${caJour.toLocaleString("fr-FR")} F`} accent="green" />
        <KpiCard label="Commandes" valeur={String(nbCommandes)} />
        <KpiCard label="Dépenses" valeur={`${depensesTotal.toLocaleString("fr-FR")} F`} />
        <KpiCard
          label="Ventes annulées"
          valeur={String(commandesAnnulees)}
          accent={commandesAnnulees === 0 ? undefined : "red"}
        />
        <KpiCard label="Caisses ouvertes" valeur={String(sessionsOuvertes)} />
        <KpiCard
          label="Écart de caisse"
          valeur={`${ecartJour.toLocaleString("fr-FR")} F`}
          accent={ecartJour === 0 ? undefined : "red"}
        />
        <KpiCard
          label="Alertes stock"
          valeur={String(alertesStock)}
          accent={alertesStock === 0 ? undefined : "red"}
        />
      </div>
    </section>
  );
}

async function ResumeCaissiere({
  caissiereId,
  debutJourneeIso,
}: {
  caissiereId: string;
  debutJourneeIso: string;
}) {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("id, shift, fond_initial")
    .eq("caissiere_id", caissiereId)
    .eq("statut", "ouverte")
    .maybeSingle();

  if (!session) {
    const { count: sessionsJourFermees } = await supabase
      .from("sessions_caisse")
      .select("id", { count: "exact", head: true })
      .eq("caissiere_id", caissiereId)
      .gte("ouverte_at", debutJourneeIso);

    return (
      <section className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-ink">Caisse fermée</h2>
            <p className="text-sm text-ink-soft opacity-70">
              {sessionsJourFermees
                ? "Vous avez déjà clôturé une session aujourd'hui."
                : "Vous n'avez pas encore ouvert de session aujourd'hui."}
            </p>
          </div>
          <Link
            href="/caisse"
            className="shrink-0 rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
          >
            Ouvrir la caisse
          </Link>
        </div>
      </section>
    );
  }

  const { data: transactions } = await supabase
    .from("transactions_caisse")
    .select("type, montant")
    .eq("session_id", session.id);

  const totalEncaissements = (transactions ?? [])
    .filter((t) => t.type === "encaissement")
    .reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = (transactions ?? [])
    .filter((t) => t.type === "depense")
    .reduce((s, t) => s + Number(t.montant), 0);

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink">
          Caisse ouverte — {session.shift === "matin" ? "matin" : "soir"}
        </h2>
        <Link href="/caisse" className="text-sm font-bold text-orange hover:underline">
          Ouvrir la caisse →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Fond initial" valeur={`${Number(session.fond_initial).toLocaleString("fr-FR")} F`} />
        <KpiCard label="Encaissé" valeur={`${totalEncaissements.toLocaleString("fr-FR")} F`} accent="green" />
        <KpiCard label="Dépenses" valeur={`${totalDepenses.toLocaleString("fr-FR")} F`} />
      </div>
    </section>
  );
}

async function ResumeCuisine({
  pole,
  restaurantId,
  labelPole,
}: {
  pole: string;
  restaurantId: string | null;
  labelPole: string;
}) {
  const supabase = await createClient();

  let requete = supabase
    .from("lignes_commande")
    .select("statut_preparation, commandes!inner(restaurant_id)")
    .eq("pole", pole)
    .in("statut_preparation", ["en_attente", "en_preparation"]);

  if (restaurantId) {
    requete = requete.eq("commandes.restaurant_id", restaurantId);
  }

  const { data: lignes } = await requete;
  const enAttente = (lignes ?? []).filter((l) => l.statut_preparation === "en_attente").length;
  const enPreparation = (lignes ?? []).filter(
    (l) => l.statut_preparation === "en_preparation",
  ).length;

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink">Cuisine — {labelPole}</h2>
        <Link href="/kds" className="text-sm font-bold text-orange hover:underline">
          Voir la cuisine →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="En attente"
          valeur={String(enAttente)}
          accent={enAttente === 0 ? undefined : "red"}
        />
        <KpiCard label="En préparation" valeur={String(enPreparation)} accent="orange" />
      </div>
      {enAttente === 0 && enPreparation === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft opacity-70">
          <IconAlert className="h-4 w-4" /> Aucune commande en attente pour votre pôle.
        </p>
      )}
    </section>
  );
}

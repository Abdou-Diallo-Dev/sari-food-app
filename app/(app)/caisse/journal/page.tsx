import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IconWallet } from "@/components/icons";

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

type Ligne = {
  id: string;
  type: "encaissement" | "depense";
  montant: number;
  moyen_paiement: string | null;
  categorie_depense: string | null;
  libelle: string | null;
  created_at: string;
  sessions_caisse: {
    shift: "matin" | "soir";
    restaurants: { nom: string } | null;
    utilisateurs: { nom: string } | null;
  } | null;
};

function decalerJour(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function JournalCaissePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; date?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const { type: typeParam, date: dateParam } = await searchParams;
  const type = typeParam === "depenses" ? "depenses" : "encaissements";
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const debut = new Date(date + "T00:00:00");
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  const supabase = await createClient();

  let requete = supabase
    .from("transactions_caisse")
    .select(
      "id, type, montant, moyen_paiement, categorie_depense, libelle, created_at, sessions_caisse!inner(shift, restaurant_id, restaurants(nom), utilisateurs(nom))",
    )
    .eq("type", type === "depenses" ? "depense" : "encaissement")
    .gte("created_at", debut.toISOString())
    .lt("created_at", fin.toISOString())
    .order("created_at", { ascending: false });

  if (profile.restaurant_id) {
    requete = requete.eq("sessions_caisse.restaurant_id", profile.restaurant_id);
  }

  const { data } = await requete;
  const lignes = (data ?? []) as unknown as Ligne[];
  const total = lignes.reduce((s, l) => s + Number(l.montant), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconWallet className="h-6 w-6 text-orange" />
        Journal des {type === "depenses" ? "dépenses" : "encaissements"}
      </h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href={`/caisse/journal?type=encaissements&date=${date}`}
            className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
              type === "encaissements"
                ? "border-orange bg-orange text-white"
                : "border-line bg-surface text-ink-soft hover:border-orange"
            }`}
          >
            Encaissements
          </Link>
          <Link
            href={`/caisse/journal?type=depenses&date=${date}`}
            className={`rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
              type === "depenses"
                ? "border-orange bg-orange text-white"
                : "border-line bg-surface text-ink-soft hover:border-orange"
            }`}
          >
            Dépenses
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/caisse/journal?type=${type}&date=${decalerJour(date, -1)}`}
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
          <Link
            href={`/caisse/journal?type=${type}&date=${decalerJour(date, 1)}`}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-sm font-bold text-ink-soft hover:border-orange hover:text-orange"
          >
            ›
          </Link>
        </div>
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold text-ink">{lignes.length} mouvement{lignes.length > 1 ? "s" : ""}</span>
          <span className={`font-display text-lg font-extrabold ${type === "depenses" ? "text-ink" : "text-green"}`}>
            {total.toLocaleString("fr-FR")} F
          </span>
        </div>

        {lignes.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun mouvement ce jour-là.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lignes.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
              >
                <span className="text-ink-soft">
                  {new Date(l.created_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {l.sessions_caisse?.utilisateurs?.nom ?? "—"}
                  {l.sessions_caisse?.restaurants?.nom && ` · ${l.sessions_caisse.restaurants.nom}`}
                  {" · "}
                  {l.type === "encaissement"
                    ? (LABELS_MOYEN[l.moyen_paiement ?? ""] ?? l.moyen_paiement)
                    : `${LABELS_CATEGORIE_DEPENSE[l.categorie_depense ?? ""] ?? l.categorie_depense} (${
                        LABELS_MOYEN[l.moyen_paiement ?? ""] ?? l.moyen_paiement
                      })`}
                  {l.libelle && ` · ${l.libelle}`}
                </span>
                <span className={`font-bold ${l.type === "encaissement" ? "text-green" : "text-red-600"}`}>
                  {l.type === "encaissement" ? "+" : "−"}
                  {Number(l.montant).toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

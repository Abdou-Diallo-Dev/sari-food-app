import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ouvrirSession, encaisserCommande, enregistrerDepense, cloturerSession } from "./actions";

const MOYENS_PAIEMENT = [
  { value: "especes", label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "wave", label: "Wave" },
  { value: "carte", label: "Carte" },
] as const;

const CATEGORIES_DEPENSE = [
  { value: "achat_stock", label: "Achat stock" },
  { value: "produit_entretien", label: "Produit d'entretien" },
  { value: "charge_operationnelle", label: "Charge opérationnelle" },
  { value: "divers", label: "Divers" },
] as const;

export default async function CaissePage() {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere"]);

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("id, shift, fond_initial, ouverte_at")
    .eq("caissiere_id", profile.id)
    .eq("statut", "ouverte")
    .maybeSingle();

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <h1 className="font-display text-2xl font-extrabold text-ink">Caisse</h1>

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
          <input
            type="number"
            name="fond_initial"
            required
            min={0}
            step={1}
            placeholder="Fond de caisse initial (F)"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <button
            type="submit"
            className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
          >
            Ouvrir
          </button>
        </form>
      </div>
    );
  }

  const [{ data: commandes }, { data: transactions }] = await Promise.all([
    supabase
      .from("commandes")
      .select("id, numero, canal, total, statut")
      .eq("restaurant_id", profile.restaurant_id!)
      .not("statut", "in", "(payee,annulee)")
      .order("created_at"),
    supabase
      .from("transactions_caisse")
      .select("type, montant, libelle, moyen_paiement, created_at")
      .eq("session_id", session.id)
      .order("created_at"),
  ]);

  const totalEncaissements = (transactions ?? [])
    .filter((t) => t.type === "encaissement")
    .reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = (transactions ?? [])
    .filter((t) => t.type === "depense")
    .reduce((s, t) => s + Number(t.montant), 0);
  const totalTheorique = Number(session.fond_initial) + totalEncaissements - totalDepenses;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold text-ink">Caisse</h1>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold text-ink">
            Session {session.shift === "matin" ? "matin" : "soir"} — ouverte
          </span>
          <span className="text-sm text-ink-soft">
            Fond initial : {Number(session.fond_initial).toLocaleString("fr-FR")} F
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-[10px] bg-paper p-2">
            <div className="text-ink-soft">Encaissé</div>
            <div className="font-bold text-green">{totalEncaissements.toLocaleString("fr-FR")} F</div>
          </div>
          <div className="rounded-[10px] bg-paper p-2">
            <div className="text-ink-soft">Dépenses</div>
            <div className="font-bold text-ink">{totalDepenses.toLocaleString("fr-FR")} F</div>
          </div>
          <div className="rounded-[10px] bg-paper p-2">
            <div className="text-ink-soft">Théorique</div>
            <div className="font-bold text-ink">{totalTheorique.toLocaleString("fr-FR")} F</div>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Commandes à encaisser</h2>
        {(commandes ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucune commande en attente d&apos;encaissement.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(commandes ?? []).map((c) => (
              <li key={c.id} className="rounded-[10px] border border-line bg-paper p-3">
                <form action={encaisserCommande} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="commande_id" value={c.id} />
                  <input type="hidden" name="session_id" value={session.id} />
                  <span className="flex-1 text-sm font-bold text-ink">
                    n°{c.numero} · {c.canal === "sur_place" ? "Sur place" : "À emporter"} ·{" "}
                    {Number(c.total).toLocaleString("fr-FR")} F
                  </span>
                  <select
                    name="moyen_paiement"
                    required
                    className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
                  >
                    {MOYENS_PAIEMENT.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-[8px] bg-green px-3 py-1 text-sm font-bold text-white"
                  >
                    Encaisser
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
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
        </form>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold text-ink">Clôturer la caisse</h2>
        <form action={cloturerSession} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="session_id" value={session.id} />
          <input
            type="number"
            name="total_compte"
            required
            min={0}
            step={1}
            placeholder="Montant compté en caisse (F)"
            className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <button
            type="submit"
            className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
          >
            Clôturer
          </button>
        </form>
      </section>
    </div>
  );
}

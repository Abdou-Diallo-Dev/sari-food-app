import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteCommande } from "./actions";
import { BoutonConfirmation } from "@/components/BoutonConfirmation";
import { STATUTS_ORDRE, LABELS_STATUT } from "@/lib/commandes";

type CommandeJour = {
  id: string;
  numero: number;
  canal: "sur_place" | "emporter";
  statut: string;
  total: number;
  created_at: string;
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "pdg", "manager"]);

  const supabase = await createClient();

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);
  const debutJourneeIso = debutJournee.toISOString();

  let restaurantsQuery = supabase.from("restaurants").select("id, nom").order("nom");
  if (profile.role === "manager" && profile.restaurant_id) {
    restaurantsQuery = restaurantsQuery.eq("id", profile.restaurant_id);
  }
  const { data: restaurants } = await restaurantsQuery;

  const chiffres = await Promise.all(
    (restaurants ?? []).map(async (r) => {
      const [{ data: commandesJour }, { data: sessionsJour }, { data: ingredients }] =
        await Promise.all([
          supabase
            .from("commandes")
            .select("id, numero, canal, total, statut, created_at")
            .eq("restaurant_id", r.id)
            .gte("created_at", debutJourneeIso)
            .order("created_at", { ascending: false }),
          supabase
            .from("sessions_caisse")
            .select("statut, ecart")
            .eq("restaurant_id", r.id)
            .gte("ouverte_at", debutJourneeIso),
          supabase
            .from("ingredients")
            .select("stock_actuel, seuil_alerte")
            .eq("restaurant_id", r.id),
        ]);

      const caJour = (commandesJour ?? [])
        .filter((c) => c.statut === "payee")
        .reduce((s, c) => s + Number(c.total), 0);
      const nbCommandes = (commandesJour ?? []).length;
      const sessionsOuvertes = (sessionsJour ?? []).filter((s) => s.statut === "ouverte").length;
      const ecartCumule = (sessionsJour ?? [])
        .filter((s) => s.ecart !== null)
        .reduce((s, sess) => s + Number(sess.ecart), 0);
      const alertesStock = (ingredients ?? []).filter(
        (i) => Number(i.stock_actuel) <= Number(i.seuil_alerte),
      ).length;

      return {
        restaurant: r,
        caJour,
        nbCommandes,
        sessionsOuvertes,
        ecartCumule,
        alertesStock,
        commandesJour: (commandesJour ?? []) as CommandeJour[],
      };
    }),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold text-ink">Tableau de bord</h1>

      {chiffres.length === 0 ? (
        <p className="text-ink-soft opacity-70">Aucun restaurant à afficher.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {chiffres.map((c) => (
            <section key={c.restaurant.id} className="rounded-card border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-lg font-extrabold text-ink">
                {c.restaurant.nom}
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-[10px] bg-paper p-3 text-center">
                  <div className="text-xs text-ink-soft">CA du jour</div>
                  <div className="font-bold text-green">{c.caJour.toLocaleString("fr-FR")} F</div>
                </div>
                <div className="rounded-[10px] bg-paper p-3 text-center">
                  <div className="text-xs text-ink-soft">Commandes</div>
                  <div className="font-bold text-ink">{c.nbCommandes}</div>
                </div>
                <div className="rounded-[10px] bg-paper p-3 text-center">
                  <div className="text-xs text-ink-soft">Caisses ouvertes</div>
                  <div className="font-bold text-ink">{c.sessionsOuvertes}</div>
                </div>
                <div className="rounded-[10px] bg-paper p-3 text-center">
                  <div className="text-xs text-ink-soft">Écart caisse</div>
                  <div
                    className={`font-bold ${c.ecartCumule === 0 ? "text-ink" : "text-red-600"}`}
                  >
                    {c.ecartCumule.toLocaleString("fr-FR")} F
                  </div>
                </div>
                <div className="rounded-[10px] bg-paper p-3 text-center">
                  <div className="text-xs text-ink-soft">Alertes stock</div>
                  <div
                    className={`font-bold ${c.alertesStock === 0 ? "text-ink" : "text-red-600"}`}
                  >
                    {c.alertesStock}
                  </div>
                </div>
              </div>

              {c.commandesJour.length === 0 ? (
                <p className="mt-4 text-sm text-ink-soft opacity-70">
                  Aucune commande aujourd&apos;hui.
                </p>
              ) : (
                <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
                  {STATUTS_ORDRE.map((statut) => {
                    const groupe = c.commandesJour.filter((cmd) => cmd.statut === statut);
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
                                  · {cmd.canal === "sur_place" ? "Sur place" : "À emporter"} ·{" "}
                                  {new Date(cmd.created_at).toLocaleTimeString("fr-FR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-ink">
                                  {cmd.total.toLocaleString("fr-FR")} F
                                </span>
                                <form action={deleteCommande}>
                                  <input type="hidden" name="id" value={cmd.id} />
                                  <BoutonConfirmation
                                    label="Supprimer"
                                    confirmMessage={`Supprimer définitivement la commande n°${cmd.numero} ?`}
                                    className="rounded-[7px] px-2 py-1 text-xs font-bold text-ink-soft hover:text-red-600"
                                  />
                                </form>
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
          ))}
        </div>
      )}
    </div>
  );
}

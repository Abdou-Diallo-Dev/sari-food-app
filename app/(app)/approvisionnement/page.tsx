import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validerDemande,
  rejeterDemande,
  decaisserDemande,
  receptionnerDemande,
} from "./actions";
import { IconAlert } from "@/components/icons";

const ROLES_CHEF = ["chef_patisserie", "chef_boulangerie", "chef_fastfood"] as const;

const LABELS_STATUT: Record<string, string> = {
  declenchee: "Déclenchée",
  validee: "Validée",
  rejetee: "Rejetée",
  decaissee: "Décaissée",
  receptionnee: "Réceptionnée",
};

const COULEURS_STATUT: Record<string, string> = {
  declenchee: "bg-orange/10 text-orange",
  validee: "bg-blue-50 text-blue-700",
  rejetee: "bg-red-50 text-red-600",
  decaissee: "bg-yellow-50 text-yellow-700",
  receptionnee: "bg-green/10 text-green",
};

type Demande = {
  id: string;
  quantite_demandee: number;
  statut: string;
  motif_rejet: string | null;
  montant_decaisse: number | null;
  declenchee_at: string;
  chef_id: string;
  ingredient: { nom: string; unite: string } | null;
  chef: { nom: string } | null;
  manager: { nom: string } | null;
  comptable: { nom: string } | null;
  fournisseur: { nom: string } | null;
};

export default async function ApprovisionnementPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "comptable", ...ROLES_CHEF]);

  const canValider = profile.role === "admin" || profile.role === "manager";
  const canDecaisser = profile.role === "admin" || profile.role === "manager" || profile.role === "comptable";
  const isChef = (ROLES_CHEF as readonly string[]).includes(profile.role);
  const peutAvoirSesDemandes = isChef || profile.role === "manager" || profile.role === "admin";

  const supabase = await createClient();

  const [{ data: demandes }, { data: fournisseurs }] = await Promise.all([
    supabase
      .from("demandes_approvisionnement")
      .select(
        `id, quantite_demandee, statut, motif_rejet, montant_decaisse, declenchee_at, chef_id,
         ingredient:ingredients(nom, unite),
         chef:utilisateurs!chef_id(nom),
         manager:utilisateurs!manager_id(nom),
         comptable:utilisateurs!comptable_id(nom),
         fournisseur:fournisseurs(nom)`,
      )
      .order("declenchee_at", { ascending: false }),
    canDecaisser
      ? supabase.from("fournisseurs").select("id, nom").eq("actif", true).order("nom")
      : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
  ]);

  const toutes = (demandes ?? []) as unknown as Demande[];

  const aValider = toutes.filter((d) => d.statut === "declenchee");
  const aDecaisser = toutes.filter((d) => d.statut === "validee");
  const mesDemandes = peutAvoirSesDemandes
    ? toutes.filter((d) => d.chef_id === profile.id)
    : [];
  const historique = toutes.filter(
    (d) => !peutAvoirSesDemandes || d.chef_id !== profile.id,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconAlert className="h-6 w-6 text-orange" />
        Approvisionnement
      </h1>

      {canValider && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold text-ink">
            En attente de validation {aValider.length > 0 && `(${aValider.length})`}
          </h2>
          {aValider.length === 0 ? (
            <p className="text-sm text-ink-soft opacity-70">Aucune demande en attente.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {aValider.map((d) => (
                <li key={d.id} className="rounded-[10px] border border-line bg-paper p-3">
                  <div className="mb-2 text-sm">
                    <span className="font-bold text-ink">
                      {d.ingredient?.nom} — {Number(d.quantite_demandee).toLocaleString("fr-FR")}{" "}
                      {d.ingredient?.unite}
                    </span>
                    <span className="ml-2 text-ink-soft opacity-70">
                      demandé par {d.chef?.nom} le{" "}
                      {new Date(d.declenchee_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={validerDemande}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-[8px] bg-green px-3 py-1 text-sm font-bold text-white"
                      >
                        Valider
                      </button>
                    </form>
                    <form action={rejeterDemande} className="flex flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <input
                        type="text"
                        name="motif_rejet"
                        required
                        placeholder="Motif du rejet"
                        className="min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                      />
                      <button
                        type="submit"
                        className="rounded-[8px] border border-red-300 px-3 py-1 text-sm font-bold text-red-600"
                      >
                        Rejeter
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canDecaisser && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold text-ink">
            Validées — à décaisser {aDecaisser.length > 0 && `(${aDecaisser.length})`}
          </h2>
          {aDecaisser.length === 0 ? (
            <p className="text-sm text-ink-soft opacity-70">Aucune demande validée en attente.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {aDecaisser.map((d) => (
                <li key={d.id} className="rounded-[10px] border border-line bg-paper p-3">
                  <div className="mb-2 text-sm">
                    <span className="font-bold text-ink">
                      {d.ingredient?.nom} — {Number(d.quantite_demandee).toLocaleString("fr-FR")}{" "}
                      {d.ingredient?.unite}
                    </span>
                    <span className="ml-2 text-ink-soft opacity-70">
                      demandé par {d.chef?.nom}, validé par {d.manager?.nom}
                    </span>
                  </div>
                  <form action={decaisserDemande} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    {fournisseurs && fournisseurs.length > 0 && (
                      <select
                        name="fournisseur_id"
                        className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink"
                      >
                        <option value="">— fournisseur —</option>
                        {fournisseurs.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nom}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      name="montant_decaisse"
                      required
                      min={1}
                      step={1}
                      placeholder="Montant décaissé (F)"
                      className="w-40 rounded-[8px] border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
                    />
                    <button
                      type="submit"
                      className="rounded-[8px] bg-orange px-3 py-1 text-sm font-bold text-white"
                    >
                      Décaisser
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {peutAvoirSesDemandes && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold text-ink">Mes demandes</h2>
          {mesDemandes.length === 0 ? (
            <p className="text-sm text-ink-soft opacity-70">
              Aucune demande envoyée depuis la page Stock.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mesDemandes.map((d) => (
                <li key={d.id} className="rounded-[10px] border border-line bg-paper p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-ink">
                      {d.ingredient?.nom} — {Number(d.quantite_demandee).toLocaleString("fr-FR")}{" "}
                      {d.ingredient?.unite}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${COULEURS_STATUT[d.statut]}`}
                    >
                      {LABELS_STATUT[d.statut]}
                    </span>
                  </div>
                  {d.statut === "rejetee" && d.motif_rejet && (
                    <p className="text-xs text-red-600">Motif : {d.motif_rejet}</p>
                  )}
                  {d.statut === "decaissee" && (
                    <form action={receptionnerDemande} className="mt-1.5">
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-[8px] bg-green px-3 py-1 text-sm font-bold text-white"
                      >
                        Confirmer la réception
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(canValider || canDecaisser) && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold text-ink">Historique</h2>
          {historique.length === 0 ? (
            <p className="text-sm text-ink-soft opacity-70">Aucune demande pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-soft opacity-70">
                    <th className="py-1.5 pr-2">Date</th>
                    <th className="py-1.5 pr-2">Ingrédient</th>
                    <th className="py-1.5 pr-2">Chef</th>
                    <th className="py-1.5 pr-2">Statut</th>
                    <th className="py-1.5 pr-2">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map((d) => (
                    <tr key={d.id} className="border-t border-line">
                      <td className="py-1.5 pr-2 text-ink-soft">
                        {new Date(d.declenchee_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-1.5 pr-2 font-bold text-ink">
                        {d.ingredient?.nom} ({Number(d.quantite_demandee).toLocaleString("fr-FR")}{" "}
                        {d.ingredient?.unite})
                      </td>
                      <td className="py-1.5 pr-2 text-ink-soft">{d.chef?.nom}</td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${COULEURS_STATUT[d.statut]}`}
                        >
                          {LABELS_STATUT[d.statut]}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-ink-soft">
                        {d.statut === "rejetee" && d.motif_rejet}
                        {d.statut === "decaissee" &&
                          `${Number(d.montant_decaisse).toLocaleString("fr-FR")} F par ${d.comptable?.nom ?? ""}`}
                        {d.statut === "receptionnee" &&
                          `${d.montant_decaisse ? Number(d.montant_decaisse).toLocaleString("fr-FR") + " F — " : ""}reçu${d.fournisseur?.nom ? ` (${d.fournisseur.nom})` : ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

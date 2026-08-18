import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createZoneLivraison,
  updateZoneLivraison,
  toggleZoneLivraisonActif,
  deleteZoneLivraison,
} from "./actions";
import { IconTruck, IconCheck, IconTrash, IconPlus } from "@/components/icons";

export default async function LivraisonPage() {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "pdg"]);
  const lectureSeule = profile.role === "pdg";

  const supabase = await createClient();
  const { data: zones } = await supabase
    .from("zones_livraison")
    .select("id, nom, frais, actif")
    .order("nom");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <IconTruck className="h-6 w-6 text-orange" />
        Zones de livraison
      </h1>
      <p className="-mt-4 text-sm text-ink-soft opacity-80">
        Le frais de chaque zone est ajouté au total du client à la commande en ligne. Une zone
        masquée n&apos;apparaît plus dans le choix du client.
      </p>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="flex flex-col gap-2.5">
          {(zones ?? []).map((z) =>
            lectureSeule ? (
              <div
                key={z.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-sm"
              >
                <span className={`font-bold text-ink ${z.actif ? "" : "text-ink-soft line-through"}`}>
                  {z.nom}
                </span>
                <span className="font-bold text-orange">{Number(z.frais).toLocaleString("fr-FR")} F</span>
              </div>
            ) : (
              <form
                key={z.id}
                className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-paper px-3.5 py-2.5"
              >
                <input type="hidden" name="id" value={z.id} />
                <input
                  type="text"
                  name="nom"
                  defaultValue={z.nom}
                  className={`min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-bold hover:border-line focus:border-orange focus:bg-surface focus:outline-none ${
                    z.actif ? "text-ink" : "text-ink-soft line-through"
                  }`}
                />
                <input
                  type="number"
                  name="frais"
                  defaultValue={Number(z.frais)}
                  min={0}
                  step={1}
                  className="w-24 rounded-[8px] border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm font-bold text-orange hover:border-line focus:border-orange focus:bg-surface focus:outline-none"
                />
                <span className="text-xs text-ink-soft">F</span>

                <button
                  formAction={toggleZoneLivraisonActif.bind(null, z.id, !z.actif)}
                  type="submit"
                  title={z.actif ? "Masquer côté client" : "Réactiver côté client"}
                  className={`rounded-full px-2 py-0.5 text-[.65rem] font-bold uppercase tracking-wide transition ${
                    z.actif
                      ? "bg-green/15 text-green hover:bg-green/25"
                      : "bg-line/40 text-ink-soft hover:bg-line/60"
                  }`}
                >
                  {z.actif ? "Active" : "Masquée"}
                </button>

                <button
                  formAction={updateZoneLivraison}
                  type="submit"
                  title="Enregistrer"
                  className="rounded-[8px] p-1.5 text-ink-soft hover:text-orange"
                >
                  <IconCheck className="h-4 w-4" />
                </button>
                <button
                  formAction={deleteZoneLivraison}
                  type="submit"
                  title="Supprimer la zone"
                  className="rounded-[8px] p-1.5 text-ink-soft hover:text-red-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </form>
            ),
          )}

          {(zones ?? []).length === 0 && (
            <p className="text-sm text-ink-soft opacity-70">Aucune zone de livraison créée.</p>
          )}
        </div>

        {!lectureSeule && (
          <form action={createZoneLivraison} className="mt-4 flex gap-2 border-t border-line pt-4">
            <input
              type="text"
              name="nom"
              required
              placeholder="Nom de la zone (ex: Almadies)"
              className="min-w-0 flex-1 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <input
              type="number"
              name="frais"
              required
              min={0}
              step={1}
              placeholder="Frais (F)"
              className="w-32 rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
            />
            <button
              type="submit"
              title="Ajouter la zone"
              className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

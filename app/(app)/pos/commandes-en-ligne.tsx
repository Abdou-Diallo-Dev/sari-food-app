"use client";

import { useState, useTransition } from "react";
import { validerCommandeEnLigne, refuserCommandeEnLigne } from "./actions";
import { IconAlert, IconCheck, IconTrash, IconChevronDown } from "@/components/icons";

export type LigneAValider = {
  produitId: string;
  nom: string;
  quantite: number;
  enRupture: boolean;
};

export type CommandeAValider = {
  id: string;
  numero: number;
  total: number;
  created_at: string;
  client_nom: string | null;
  client_telephone: string | null;
  adresse_livraison: string | null;
  lignes: LigneAValider[];
};

// Repliée par défaut : avec plusieurs commandes en ligne en attente, la liste
// dépliée poussait la recherche produit et la grille loin sous la ligne de
// flottaison, forçant la caissière à scroller pour servir un client présent
// physiquement. Le repère de rupture reste visible même repliée (fond/point
// rouge) pour ne rien perdre du signal le plus important au premier coup d'œil.
function LigneCommandeEnLigne({ commande }: { commande: CommandeAValider }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [traitee, setTraitee] = useState(false);
  const [ouverte, setOuverte] = useState(false);
  const contientRupture = commande.lignes.some((l) => l.enRupture);

  function traiter(valider: boolean) {
    setError(null);
    startTransition(async () => {
      const res = valider
        ? await validerCommandeEnLigne(commande.id)
        : await refuserCommandeEnLigne(commande.id);
      if (res.error) setError(res.error);
      else setTraitee(true);
    });
  }

  if (traitee) return null;

  return (
    <li
      className={`overflow-hidden rounded-[12px] border ${
        contientRupture ? "border-red-300 bg-red-50" : "border-line bg-paper"
      }`}
    >
      <button
        onClick={() => setOuverte((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {contientRupture && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-red-600"
              title="Article en rupture dans cette commande"
            />
          )}
          <span className="truncate font-bold text-ink">
            n°{commande.numero}{" "}
            <span className="font-normal text-ink-soft">· {commande.client_nom ?? "client"}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-bold text-ink">{commande.total.toLocaleString("fr-FR")} F</span>
          <IconChevronDown
            className={`h-4 w-4 text-ink-soft transition-transform ${ouverte ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {ouverte && (
        <div className="border-t border-line/70 p-3 pt-2.5">
          <p className="mb-1.5 text-xs text-ink-soft">{commande.client_telephone}</p>

          {commande.adresse_livraison && (
            <p className="mb-1.5 text-xs text-ink-soft">Livraison : {commande.adresse_livraison}</p>
          )}

          <ul className="mb-2.5 flex flex-col gap-0.5 text-sm text-ink">
            {commande.lignes.map((l) => (
              <li key={l.produitId} className="flex items-center gap-1.5">
                <span>
                  {l.quantite}× {l.nom}
                </span>
                {l.enRupture && (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-600">
                    <IconAlert className="h-3.5 w-3.5" /> Rupture
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <button
              onClick={() => traiter(true)}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-[9px] bg-orange px-3 py-1.5 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconCheck className="h-3.5 w-3.5" /> Valider
            </button>
            <button
              onClick={() => traiter(false)}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconTrash className="h-3.5 w-3.5" /> Refuser
            </button>
          </div>

          {error && <p className="mt-1.5 text-xs font-bold text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}

export function CommandesEnLigneAValider({ commandes }: { commandes: CommandeAValider[] }) {
  return (
    <section className="rounded-card border border-orange bg-surface p-3.5 sm:p-5">
      <h2 className="mb-2.5 flex items-center gap-1.5 font-display text-base font-extrabold text-orange sm:text-lg">
        Commandes en ligne à valider ({commandes.length})
      </h2>
      <ul className="flex flex-col gap-1.5">
        {commandes.map((c) => (
          <LigneCommandeEnLigne key={c.id} commande={c} />
        ))}
      </ul>
    </section>
  );
}

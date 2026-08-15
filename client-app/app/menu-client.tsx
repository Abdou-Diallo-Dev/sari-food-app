"use client";

import { useMemo, useState, useTransition } from "react";
import { creerCommandeEnLigne } from "./actions";
import { MODES_PAIEMENT, type ModePaiement, type ProduitMenu } from "@/lib/types";

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

type LignePanier = { produit_id: string; quantite: number };

export function MenuClient({ produits }: { produits: ProduitMenu[] }) {
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("wave");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const produitsParPole = useMemo(() => {
    const groupes: Record<string, Record<string, ProduitMenu[]>> = {
      patisserie: {},
      boulangerie: {},
      fastfood: {},
    };
    for (const p of produits) {
      groupes[p.pole][p.categorie] ??= [];
      groupes[p.pole][p.categorie].push(p);
    }
    return groupes;
  }, [produits]);

  const lignes = Object.values(panier);
  const total = lignes.reduce((s, l) => {
    const p = produits.find((prod) => prod.id === l.produit_id);
    return s + (p?.prix ?? 0) * l.quantite;
  }, 0);

  function ajouter(p: ProduitMenu) {
    setMessage(null);
    setPanier((prev) => {
      const existant = prev[p.id];
      return { ...prev, [p.id]: { produit_id: p.id, quantite: (existant?.quantite ?? 0) + 1 } };
    });
  }

  function changerQuantite(produitId: string, delta: number) {
    setPanier((prev) => {
      const existant = prev[produitId];
      if (!existant) return prev;
      const quantite = existant.quantite + delta;
      if (quantite <= 0) {
        const { [produitId]: _retire, ...reste } = prev;
        return reste;
      }
      return { ...prev, [produitId]: { ...existant, quantite } };
    });
  }

  function payer() {
    setMessage(null);
    if (!clientNom.trim()) return setMessage("Indiquez votre nom.");
    if (!clientTelephone.trim()) return setMessage("Indiquez votre numéro de téléphone.");
    if (lignes.length === 0) return setMessage("Votre panier est vide.");

    startTransition(async () => {
      const res = await creerCommandeEnLigne({
        clientNom,
        clientTelephone,
        modePaiement,
        panier: lignes,
      });
      if (res.error) {
        setMessage(res.error);
      } else if (res.url) {
        window.location.href = res.url;
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        {POLES.map((pole) => {
          const categories = produitsParPole[pole.value];
          const nomsCategories = Object.keys(categories);
          if (nomsCategories.length === 0) return null;

          return (
            <section key={pole.value} className="rounded-card border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-lg font-extrabold text-orange">{pole.label}</h2>
              <div className="flex flex-col gap-4">
                {nomsCategories.map((nomCategorie) => (
                  <div key={nomCategorie}>
                    <h3 className="mb-2 text-sm font-bold text-ink-soft">{nomCategorie}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {categories[nomCategorie].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => ajouter(p)}
                          className="rounded-[11px] border border-line bg-paper px-3 py-2.5 text-left transition hover:border-orange"
                        >
                          <div className="text-sm font-bold text-ink">{p.nom}</div>
                          <div className="text-xs font-bold text-orange">
                            {p.prix.toLocaleString("fr-FR")} F
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-card border border-line bg-surface p-5 lg:sticky lg:top-6">
        <h2 className="font-display text-lg font-extrabold text-ink">Votre commande</h2>

        {lignes.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun article sélectionné.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lignes.map((l) => {
              const p = produits.find((prod) => prod.id === l.produit_id);
              return (
                <li key={l.produit_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{p?.nom}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => changerQuantite(l.produit_id, -1)}
                      className="rounded-[6px] border border-line px-1.5 text-ink-soft hover:text-orange"
                    >
                      −
                    </button>
                    <span className="w-4 text-center font-bold text-ink">{l.quantite}</span>
                    <button
                      onClick={() => changerQuantite(l.produit_id, 1)}
                      className="rounded-[6px] border border-line px-1.5 text-ink-soft hover:text-orange"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-16 text-right font-bold text-ink">
                    {((p?.prix ?? 0) * l.quantite).toLocaleString("fr-FR")} F
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="font-bold text-ink-soft">Total</span>
          <span className="font-display text-lg font-extrabold text-ink">
            {total.toLocaleString("fr-FR")} F
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={clientNom}
            onChange={(e) => setClientNom(e.target.value)}
            placeholder="Votre nom"
            className="rounded-[9px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-orange"
          />
          <input
            value={clientTelephone}
            onChange={(e) => setClientTelephone(e.target.value)}
            placeholder="Votre numéro de téléphone"
            type="tel"
            className="rounded-[9px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-orange"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-ink-soft">Moyen de paiement</p>
          <div className="flex gap-2">
            {MODES_PAIEMENT.map((m) => (
              <button
                key={m.value}
                onClick={() => setModePaiement(m.value)}
                className={`flex-1 rounded-[9px] border px-2 py-1.5 text-xs font-bold transition ${
                  modePaiement === m.value
                    ? "border-orange bg-orange text-white"
                    : "border-line bg-paper text-ink-soft"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={payer}
          disabled={lignes.length === 0 || isPending}
          className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Redirection..." : `Payer ${total.toLocaleString("fr-FR")} F`}
        </button>

        {message && <p className="text-sm font-bold text-red-600">{message}</p>}
      </aside>
    </div>
  );
}

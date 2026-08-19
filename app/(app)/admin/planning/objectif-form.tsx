"use client";

import { useState } from "react";
import { definirObjectifsProduction } from "./actions";

const POLES = [
  { value: "patisserie", label: "Pât." },
  { value: "boulangerie", label: "Boul." },
  { value: "fastfood", label: "F-Food" },
] as const;

export function ObjectifForm({
  produitId,
  jour,
  valeurs,
  lectureSeule,
}: {
  produitId: string;
  jour: string;
  valeurs: Record<string, number>;
  lectureSeule: boolean;
}) {
  const [quantites, setQuantites] = useState(valeurs);
  const total = POLES.reduce((s, p) => s + (quantites[p.value] || 0), 0);

  return (
    <form action={definirObjectifsProduction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="produit_id" value={produitId} />
      <input type="hidden" name="jour" value={jour} />
      {POLES.map((pole) => (
        <label key={pole.value} className="flex items-center gap-1 text-xs text-ink-soft">
          {pole.label}
          <input
            type="number"
            name={`quantite_${pole.value}`}
            min={0}
            step={1}
            disabled={lectureSeule}
            defaultValue={valeurs[pole.value] || ""}
            onChange={(e) =>
              setQuantites((q) => ({ ...q, [pole.value]: Number(e.target.value) || 0 }))
            }
            placeholder="0"
            className="w-16 rounded-[7px] border border-line bg-surface px-1.5 py-1 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-40 disabled:opacity-60"
          />
        </label>
      ))}
      <span className="ml-1 text-xs font-bold text-ink-soft">
        Total : <span className="text-ink">{total}</span>
      </span>
      {!lectureSeule && (
        <button
          type="submit"
          className="rounded-[8px] bg-orange px-3 py-1 text-xs font-bold text-white"
        >
          Enregistrer
        </button>
      )}
    </form>
  );
}

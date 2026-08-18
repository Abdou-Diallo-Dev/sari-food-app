"use client";

import { useState } from "react";
import { verifierRemise } from "@/app/(app)/caisse/actions";

export function RemiseAVerifier({
  remiseId,
  caissiereNom,
  montantRemis,
}: {
  remiseId: string;
  caissiereNom: string;
  montantRemis: number;
}) {
  const [fondNouvelleSession, setFondNouvelleSession] = useState(0);
  const montantTransfere = Math.max(0, montantRemis - fondNouvelleSession);

  return (
    <form
      action={verifierRemise}
      className="flex flex-wrap items-center gap-3 rounded-[12px] border border-orange/40 bg-orange/5 p-3"
    >
      <input type="hidden" name="remise_id" value={remiseId} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{caissiereNom}</p>
        <p className="text-xs text-ink-soft">
          Remet {montantRemis.toLocaleString("fr-FR")} F en espèces
        </p>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        Fonds nouvelle session
        <input
          type="number"
          name="fond_nouvelle_session"
          min={0}
          max={montantRemis}
          step={1}
          defaultValue={0}
          onChange={(e) => setFondNouvelleSession(Number(e.target.value) || 0)}
          className="w-24 rounded-[7px] border border-line bg-surface px-1.5 py-1 text-sm text-ink"
        />
      </label>
      <span className="text-xs font-bold text-ink-soft">
        Transféré au comptable : <span className="text-ink">{montantTransfere.toLocaleString("fr-FR")} F</span>
      </span>
      <button
        type="submit"
        className="rounded-[8px] bg-orange px-3 py-1.5 text-xs font-bold text-white"
      >
        Valider
      </button>
    </form>
  );
}

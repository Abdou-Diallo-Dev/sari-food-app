"use client";

import { useRef } from "react";

export function BoutonAnnulation({ numero, className }: { numero: number; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input ref={inputRef} type="hidden" name="motif" />
      <button
        type="submit"
        className={className}
        onClick={(e) => {
          const motif = window.prompt(`Motif d'annulation de la commande n°${numero} :`);
          if (!motif || !motif.trim()) {
            e.preventDefault();
            return;
          }
          if (inputRef.current) inputRef.current.value = motif.trim();
        }}
      >
        Annuler
      </button>
    </>
  );
}

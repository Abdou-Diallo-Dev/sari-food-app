"use client";

import { IconPrinter } from "@/components/icons";

export function BoutonImprimer() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink-soft transition hover:border-orange hover:text-orange"
    >
      <IconPrinter className="h-4 w-4" />
      Imprimer / Exporter en PDF
    </button>
  );
}

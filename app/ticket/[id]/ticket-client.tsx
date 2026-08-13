"use client";

import { LABELS_CANAL } from "@/lib/commandes";

export type TicketCommande = {
  numero: number;
  canal: "sur_place" | "emporter" | "livraison";
  total: number;
  created_at: string;
  restaurantNom: string;
  restaurantAdresse: string | null;
};

export type TicketLigne = {
  nom: string;
  quantite: number;
  prix_unitaire: number;
};

export function TicketClient({
  format,
  commande,
  lignes,
}: {
  format: "80mm" | "a4";
  commande: TicketCommande;
  lignes: TicketLigne[];
}) {
  const date = new Date(commande.created_at);
  const dateFormatee = date.toLocaleDateString("fr-FR");
  const heureFormatee = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-paper py-8">
      <style>{`
        @page {
          size: ${format === "80mm" ? "80mm auto" : "A4"};
          margin: ${format === "80mm" ? "2mm" : "15mm"};
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-md justify-center gap-2 px-4">
        <button
          onClick={() => window.print()}
          className="rounded-[9px] bg-orange px-4 py-2 text-sm font-bold text-white"
        >
          Imprimer
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-[9px] border border-line px-4 py-2 text-sm font-bold text-ink-soft"
        >
          Fermer
        </button>
      </div>

      <div
        className={`mx-auto flex flex-col gap-3 border border-line bg-white p-4 text-ink ${
          format === "80mm" ? "w-[80mm] text-xs" : "max-w-md text-sm"
        }`}
      >
        <div className="flex flex-col items-center gap-1 border-b border-dashed border-line pb-3 text-center">
          <span className="font-display text-lg font-extrabold">{commande.restaurantNom}</span>
          {commande.restaurantAdresse && (
            <span className="text-ink-soft">{commande.restaurantAdresse}</span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 border-b border-dashed border-line pb-3">
          <div className="flex justify-between">
            <span className="text-ink-soft">Commande</span>
            <span className="font-bold">n°{commande.numero}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Date</span>
            <span>{dateFormatee} à {heureFormatee}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Type</span>
            <span>{LABELS_CANAL[commande.canal] ?? commande.canal}</span>
          </div>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td className="py-1 align-top">
                  {l.quantite}× {l.nom}
                </td>
                <td className="py-1 text-right align-top font-bold">
                  {(l.quantite * l.prix_unitaire).toLocaleString("fr-FR")} F
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-dashed border-line pt-3">
          <span className="font-display font-extrabold">Total</span>
          <span className="font-display text-lg font-extrabold">
            {commande.total.toLocaleString("fr-FR")} F
          </span>
        </div>

        <p className="pt-2 text-center text-ink-soft">Merci de votre visite !</p>
      </div>
    </div>
  );
}

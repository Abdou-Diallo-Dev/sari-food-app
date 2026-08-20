"use client";

export function SupprimerRestaurantButton({ nom }: { nom: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(`Supprimer définitivement le restaurant "${nom}" ? Cette action est irréversible.`)) {
          e.preventDefault();
        }
      }}
      className="rounded-[7px] border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
    >
      Supprimer
    </button>
  );
}

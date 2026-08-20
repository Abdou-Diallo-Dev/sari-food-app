"use client";

export function SupprimerUtilisateurButton({ nom, disabled }: { nom: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      onClick={(e) => {
        if (!confirm(`Supprimer définitivement ${nom} ? Cette action est irréversible.`)) {
          e.preventDefault();
        }
      }}
      className="rounded-[8px] border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
      title={disabled ? "Vous ne pouvez pas supprimer votre propre compte" : undefined}
    >
      Supprimer
    </button>
  );
}

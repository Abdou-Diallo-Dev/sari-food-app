"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-card border border-line bg-surface p-8 text-center">
      <h1 className="font-display text-lg font-extrabold text-ink">Une erreur est survenue</h1>
      <p className="text-sm text-ink-soft">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white"
      >
        Réessayer
      </button>
    </div>
  );
}

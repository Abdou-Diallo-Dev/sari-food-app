"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const idNormalise = identifiant.trim().toLowerCase();

    // les comptes internes n'ont pas d'email : on le simule à partir de
    // l'identifiant. Les comptes récents ont un identifiant qui EST déjà
    // l'email complet (papesarr@sari.com) -> utilisé tel quel. Les comptes
    // plus anciens n'ont qu'un préfixe ("fatou.diop") : on tente d'abord
    // @sari.com, puis @sari.local pour ceux pas encore migrés (bouton
    // "Migrer les comptes" sur /admin/utilisateurs), pour ne jamais bloquer
    // un compte non migré.
    const candidats = idNormalise.includes("@")
      ? [idNormalise]
      : [`${idNormalise}@sari.com`, `${idNormalise}@sari.local`];

    let error: { message: string } | null = null;
    for (const email of candidats) {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
      if (!error) break;
    }

    setLoading(false);
    if (error) {
      setError("Identifiant ou mot de passe incorrect.");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-52 -top-36 h-[420px] w-[420px] rounded-full bg-orange opacity-[.16] blur-[60px]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-48 -bottom-32 h-[340px] w-[340px] rounded-full bg-green opacity-[.14] blur-[60px]"
      />

      <div className="relative w-full max-w-[400px] rounded-card border border-line bg-surface px-8 pb-7 pt-8 shadow-[0_1px_2px_rgba(33,28,23,.05),0_24px_48px_-20px_rgba(33,28,23,.28)]">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-white px-4 py-2.5 shadow-[0_6px_16px_-6px_rgba(248,80,0,.35)]">
            <Image
              src="/sari-logo.png"
              alt="Sari Food"
              width={168}
              height={74}
              className="h-[34px] w-auto"
              priority
            />
          </div>
          <p className="m-0 text-[.7rem] font-bold uppercase tracking-[.12em] text-orange">
            Système de gestion restaurant
          </p>
        </div>

        <div className="mb-5 h-px w-full bg-line" />

        <div className="mb-[18px]">
          <h1 className="font-display text-[1.4rem] font-extrabold tracking-[-0.01em] text-ink">
            Connexion
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <label className="mb-3 flex flex-col gap-1.5 text-[.75rem] font-bold uppercase tracking-[.05em] text-ink-soft">
            Identifiant
            <input
              type="text"
              required
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="ex : papesarr@sari.com"
              autoComplete="username"
              className="rounded-[11px] border border-line bg-paper px-3.5 py-2.5 text-[.98rem] font-medium normal-case tracking-normal text-ink placeholder:text-ink-soft placeholder:opacity-55 focus:border-orange focus:outline focus:outline-2 focus:outline-orange"
            />
          </label>

          <label className="mb-3 flex flex-col gap-1.5 text-[.75rem] font-bold uppercase tracking-[.05em] text-ink-soft">
            Mot de passe
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="rounded-[11px] border border-line bg-paper px-3.5 py-2.5 text-[.98rem] font-medium normal-case tracking-normal text-ink placeholder:text-ink-soft placeholder:opacity-55 focus:border-orange focus:outline focus:outline-2 focus:outline-orange"
            />
          </label>

          {error && (
            <p className="mb-3 text-[.85rem] text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 rounded-[11px] bg-orange py-3.5 font-display text-[1rem] font-bold text-white shadow-[0_10px_24px_-10px_rgba(248,80,0,.55)] transition hover:brightness-105 disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-4 text-center text-[.82rem] text-ink-soft">
          Mot de passe oublié ? Contactez votre Manager.
        </p>
      </div>
    </main>
  );
}

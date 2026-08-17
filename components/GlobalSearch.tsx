"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navItemsPour } from "@/lib/nav";
import { IconSearch } from "@/components/icons";
import type { RoleType } from "@/lib/auth";

type ResultatEntite = { id: string; label: string; href: string; groupe: string };

const GROUPES_ENTITES = ["Produits", "Stock", "Utilisateurs"] as const;

// "Barre de recherche pour les recherches rapides" : filtre instantanément
// les pages accessibles au rôle (ex: taper "caisse" retrouve Caisse, Suivi
// caisse...) et, à partir de 2 caractères, recherche aussi dans quelques
// entités clés (produits, ingrédients, utilisateurs pour l'admin) via une
// requête Supabase déjà cadrée par les policies RLS existantes -- aucune
// donnée hors du restaurant/rôle de l'utilisateur ne peut remonter ici.
export function GlobalSearch({ role }: { role: RoleType }) {
  const router = useRouter();
  const [terme, setTerme] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [resultatsEntites, setResultatsEntites] = useState<ResultatEntite[]>([]);
  const conteneurRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => [{ href: "/", label: "Accueil" }, ...navItemsPour(role)], [role]);

  const resultatsPages = useMemo(() => {
    const t = terme.trim().toLowerCase();
    if (!t) return [];
    return pages.filter((p) => p.label.toLowerCase().includes(t)).slice(0, 6);
  }, [pages, terme]);

  useEffect(() => {
    const t = terme.trim();
    if (t.length < 2) {
      setResultatsEntites([]);
      return;
    }

    let annule = false;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const requetes: Promise<ResultatEntite[]>[] = [
        (async () => {
          const { data } = await supabase
            .from("produits")
            .select("id, nom")
            .ilike("nom", `%${t}%`)
            .eq("actif", true)
            .limit(5);
          return (data ?? []).map((p) => ({ id: p.id, label: p.nom, href: "/pos", groupe: "Produits" }));
        })(),
        (async () => {
          const { data } = await supabase
            .from("ingredients")
            .select("id, nom")
            .ilike("nom", `%${t}%`)
            .eq("actif", true)
            .limit(5);
          return (data ?? []).map((i) => ({ id: i.id, label: i.nom, href: "/stock", groupe: "Stock" }));
        })(),
      ];

      if (role === "admin") {
        requetes.push(
          (async () => {
            const { data } = await supabase
              .from("utilisateurs")
              .select("id, nom")
              .ilike("nom", `%${t}%`)
              .limit(5);
            return (data ?? []).map((u) => ({
              id: u.id,
              label: u.nom,
              href: "/admin/utilisateurs",
              groupe: "Utilisateurs",
            }));
          })(),
        );
      }

      const groupes = await Promise.all(requetes);
      if (!annule) setResultatsEntites(groupes.flat());
    }, 250);

    return () => {
      annule = true;
      clearTimeout(timer);
    };
  }, [terme, role]);

  useEffect(() => {
    function onClickDehors(e: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener("mousedown", onClickDehors);
    return () => document.removeEventListener("mousedown", onClickDehors);
  }, []);

  function aller(href: string) {
    setOuvert(false);
    setTerme("");
    router.push(href);
  }

  const aResultats = resultatsPages.length > 0 || resultatsEntites.length > 0;

  return (
    <div ref={conteneurRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-[10px] border border-line bg-paper px-3 py-2">
        <IconSearch className="h-4 w-4 shrink-0 text-ink-soft" />
        <input
          type="text"
          value={terme}
          onChange={(e) => {
            setTerme(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          placeholder="Rechercher (caisse, stock, cuisine...)"
          className="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60 focus:outline-none"
        />
      </div>

      {ouvert && terme.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-[0_10px_30px_-10px_rgba(33,28,23,.35)]">
          {!aResultats ? (
            <p className="px-2 py-1.5 text-sm text-ink-soft opacity-70">Aucun résultat.</p>
          ) : (
            <>
              {resultatsPages.length > 0 && (
                <div className="mb-1.5">
                  <p className="px-2 pb-1 text-[.68rem] font-bold uppercase tracking-wide text-ink-soft opacity-60">
                    Pages
                  </p>
                  {resultatsPages.map((p) => (
                    <button
                      key={p.href}
                      onClick={() => aller(p.href)}
                      className="block w-full rounded-[8px] px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-paper"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              {GROUPES_ENTITES.map((groupe) => {
                const items = resultatsEntites.filter((r) => r.groupe === groupe);
                if (items.length === 0) return null;
                return (
                  <div key={groupe} className="mb-1.5">
                    <p className="px-2 pb-1 text-[.68rem] font-bold uppercase tracking-wide text-ink-soft opacity-60">
                      {groupe}
                    </p>
                    {items.map((r) => (
                      <button
                        key={groupe + r.id}
                        onClick={() => aller(r.href)}
                        className="block w-full rounded-[8px] px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-paper"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

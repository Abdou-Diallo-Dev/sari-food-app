"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCommande, type PanierItem } from "./actions";
import { MOYENS_PAIEMENT_CAISSE, type MoyenPaiementCaisse } from "@/lib/caisse";
import { IconImage, IconSearch, IconClose } from "@/components/icons";

export type ProduitPos = {
  id: string;
  nom: string;
  prix: number;
  imageUrl: string | null;
  categorie: string;
  pole: "patisserie" | "boulangerie" | "fastfood";
  enRupture: boolean;
};

const POLES = [
  { value: "patisserie", label: "Pâtisserie" },
  { value: "boulangerie", label: "Boulangerie" },
  { value: "fastfood", label: "Fast-Food" },
] as const;

export function PosClient({ produits }: { produits: ProduitPos[] }) {
  const router = useRouter();

  // Filet de sécurité pour les commandes en ligne à valider : le rafraîchissement
  // normal passe par NotificationSound (bip + router.refresh() sur notification
  // Realtime), mais un onglet en arrière-plan ou une notif manquée laisserait la
  // caissière face à une liste figée sans le savoir. Ce polling garantit qu'une
  // nouvelle commande en ligne apparaît au plus tard 15s après son paiement.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const [panier, setPanier] = useState<Record<string, PanierItem>>({});
  const [canal, setCanal] = useState<"sur_place" | "emporter" | "livraison">("sur_place");
  const [moyenPaiement, setMoyenPaiement] = useState<MoyenPaiementCaisse>("especes");
  const [message, setMessage] = useState<{ type: "success" | "error"; texte: string } | null>(
    null,
  );
  const [derniereCommandeId, setDerniereCommandeId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [recherche, setRecherche] = useState("");

  // Filtre par nom uniquement : simple et prévisible pour une caissière
  // pressée. Les pôles/catégories sans résultat disparaissent plutôt que de
  // rester affichés vides.
  const produitsAffiches = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return terme ? produits.filter((p) => p.nom.toLowerCase().includes(terme)) : produits;
  }, [produits, recherche]);

  const produitsParPole = useMemo(() => {
    const groupes: Record<string, Record<string, ProduitPos[]>> = {
      patisserie: {},
      boulangerie: {},
      fastfood: {},
    };
    for (const p of produitsAffiches) {
      groupes[p.pole][p.categorie] ??= [];
      groupes[p.pole][p.categorie].push(p);
    }
    return groupes;
  }, [produitsAffiches]);

  const polesVisibles = POLES.filter((pole) => Object.keys(produitsParPole[pole.value]).length > 0);
  const categoriesVisibles = polesVisibles.flatMap((pole) =>
    Object.keys(produitsParPole[pole.value]).map((nom) => ({ pole: pole.value, nom, cle: `${pole.value}::${nom}` })),
  );

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const categorieRefs = useRef<Record<string, HTMLElement | null>>({});
  const asideRef = useRef<HTMLElement | null>(null);
  const [poleActif, setPoleActif] = useState<string>(polesVisibles[0]?.value ?? POLES[0].value);
  const [categorieActive, setCategorieActive] = useState<string>(categoriesVisibles[0]?.cle ?? "");

  // Barre d'onglets figée : surligne le pôle actuellement visible pendant
  // le scroll (même pattern que le menu client, sari-foood-client).
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.find((e) => e.isIntersecting);
        if (visible) setPoleActif(visible.target.getAttribute("data-pole") ?? "");
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );

    for (const pole of polesVisibles) {
      const el = sectionRefs.current[pole.value];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sections stables tant que produits ne change pas
  }, [produits]);

  // Même principe pour les catégories : sans ça, seuls les 3 pôles se
  // surlignaient pendant le scroll, les catégories restaient toutes dans le
  // même état visuel quelle que soit la position réelle dans la page.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.find((e) => e.isIntersecting);
        if (visible) setCategorieActive(visible.target.getAttribute("data-categorie") ?? "");
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );

    for (const cat of categoriesVisibles) {
      const el = categorieRefs.current[cat.cle];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sections stables tant que produits ne change pas
  }, [produits]);

  // Barre figée = pas de scrollbar visible (cf. className du <nav>) : c'est
  // ce useEffect qui la fait suivre le scroll de la page, en ramenant le
  // bouton actif dans la zone visible plutôt que de forcer la caissière à
  // swiper elle-même pour retrouver où elle en est.
  const poleBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const categorieBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    poleBtnRefs.current[poleActif]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [poleActif]);

  useEffect(() => {
    categorieBtnRefs.current[categorieActive]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [categorieActive]);

  function allerAuPole(pole: string) {
    sectionRefs.current[pole]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function allerALaCategorie(cle: string) {
    categorieRefs.current[cle]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const lignes = Object.values(panier);
  const total = lignes.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0);

  function ajouter(p: ProduitPos) {
    if (p.enRupture) return;
    setMessage(null);
    setPanier((prev) => {
      const existant = prev[p.id];
      return {
        ...prev,
        [p.id]: {
          produit_id: p.id,
          pole: p.pole,
          prix_unitaire: p.prix,
          quantite: (existant?.quantite ?? 0) + 1,
        },
      };
    });
  }

  function changerQuantite(produitId: string, delta: number) {
    setPanier((prev) => {
      const existant = prev[produitId];
      if (!existant) return prev;
      const quantite = existant.quantite + delta;
      if (quantite <= 0) {
        const { [produitId]: _retire, ...reste } = prev;
        return reste;
      }
      return { ...prev, [produitId]: { ...existant, quantite } };
    });
  }

  function valider() {
    setMessage(null);
    setDerniereCommandeId(null);
    startTransition(async () => {
      const res = await createCommande(canal, lignes, moyenPaiement);
      if (res.error) {
        setMessage({ type: "error", texte: res.error });
      } else {
        setMessage({ type: "success", texte: `Commande n°${res.numero} envoyée en cuisine.` });
        setDerniereCommandeId(res.id ?? null);
        setPanier({});
      }
    });
  }

  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] ${lignes.length > 0 ? "pb-20 lg:pb-0" : ""}`}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft opacity-60" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full rounded-[11px] border border-line bg-surface py-3 pl-11 pr-11 text-base text-ink outline-none placeholder:text-ink-soft placeholder:opacity-60 focus:border-orange"
          />
          {recherche && (
            <button
              onClick={() => setRecherche("")}
              title="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-soft hover:text-orange"
            >
              <IconClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {recherche && produitsAffiches.length === 0 && (
          <p className="rounded-card border border-line bg-surface p-5 text-center text-sm text-ink-soft opacity-70">
            Aucun produit ne correspond à « {recherche} ».
          </p>
        )}

        {!recherche && (polesVisibles.length > 1 || categoriesVisibles.length > 1) && (
          <nav className="sticky top-0 z-10 -mx-4 flex max-w-[100vw] items-center gap-2 overflow-x-auto border-b border-line bg-paper/95 px-4 py-3 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:rounded-card sm:border sm:px-3 [&::-webkit-scrollbar]:hidden">
            {polesVisibles.length > 1 &&
              polesVisibles.map((pole) => (
                <button
                  key={pole.value}
                  ref={(el) => {
                    poleBtnRefs.current[pole.value] = el;
                  }}
                  onClick={() => allerAuPole(pole.value)}
                  className="shrink-0 rounded-[9px] px-3 py-1.5 text-sm font-bold text-ink-soft transition hover:bg-surface hover:text-ink"
                >
                  {pole.label}
                </button>
              ))}

            {polesVisibles.length > 1 && categoriesVisibles.length > 0 && (
              <span className="h-5 w-px shrink-0 bg-line" />
            )}

            {categoriesVisibles.map((cat) => (
              <button
                key={cat.cle}
                ref={(el) => {
                  categorieBtnRefs.current[cat.cle] = el;
                }}
                onClick={() => allerALaCategorie(cat.cle)}
                className={`shrink-0 rounded-[9px] border px-2.5 py-1 text-xs font-bold transition ${
                  categorieActive === cat.cle
                    ? "border-orange bg-orange/10 text-orange"
                    : "border-line text-ink-soft hover:border-orange hover:text-orange"
                }`}
              >
                {cat.nom}
              </button>
            ))}
          </nav>
        )}

        {POLES.map((pole) => {
          const categories = produitsParPole[pole.value];
          const nomsCategories = Object.keys(categories);
          if (nomsCategories.length === 0) return null;

          return (
            <section
              key={pole.value}
              ref={(el) => {
                sectionRefs.current[pole.value] = el;
              }}
              data-pole={pole.value}
              className="scroll-mt-16 rounded-card border border-line bg-surface p-5"
            >
              <h2 className="mb-4 font-display text-lg font-extrabold text-orange">
                {pole.label}
              </h2>
              <div className="flex flex-col gap-4">
                {nomsCategories.map((nomCategorie) => (
                  <div
                    key={nomCategorie}
                    ref={(el) => {
                      categorieRefs.current[`${pole.value}::${nomCategorie}`] = el;
                    }}
                    data-categorie={`${pole.value}::${nomCategorie}`}
                    className="scroll-mt-16"
                  >
                    <h3 className="mb-2 text-sm font-bold text-ink-soft">{nomCategorie}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {categories[nomCategorie].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => ajouter(p)}
                          disabled={p.enRupture}
                          className={`overflow-hidden rounded-[11px] border text-left transition ${
                            p.enRupture
                              ? "cursor-not-allowed border-line bg-line/20 opacity-60"
                              : "border-line bg-paper hover:border-orange"
                          }`}
                        >
                          <div className="relative aspect-square w-full bg-line/20">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt={p.nom}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-ink-soft opacity-30">
                                <IconImage className="h-8 w-8" />
                              </div>
                            )}
                            {p.enRupture && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[.65rem] font-bold uppercase text-white">
                                  Rupture
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="px-3 py-2.5">
                            <div className="text-sm font-bold text-ink">{p.nom}</div>
                            <div className="text-xs font-bold text-orange">
                              {p.prix.toLocaleString("fr-FR")} F
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <aside
        ref={asideRef}
        className="flex h-fit flex-col gap-4 rounded-card border border-line bg-surface p-5 lg:sticky lg:top-6"
      >
        <h2 className="font-display text-lg font-extrabold text-ink">Panier</h2>

        <div className="flex gap-2">
          {(["sur_place", "emporter", "livraison"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCanal(c)}
              className={`flex-1 rounded-[9px] border px-3 py-1.5 text-sm font-bold transition ${
                canal === c
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-paper text-ink-soft"
              }`}
            >
              {c === "sur_place" ? "Sur place" : c === "emporter" ? "À emporter" : "Livraison"}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-ink-soft">Moyen de paiement</p>
          <div className="flex gap-2">
            {MOYENS_PAIEMENT_CAISSE.map((m) => (
              <button
                key={m.value}
                onClick={() => setMoyenPaiement(m.value)}
                className={`flex-1 rounded-[9px] border px-2 py-1.5 text-xs font-bold transition ${
                  moyenPaiement === m.value
                    ? "border-orange bg-orange text-white"
                    : "border-line bg-paper text-ink-soft"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {lignes.length === 0 ? (
          <p className="text-sm text-ink-soft opacity-70">Aucun article sélectionné.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lignes.map((l) => {
              const p = produits.find((prod) => prod.id === l.produit_id);
              return (
                <li key={l.produit_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{p?.nom}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => changerQuantite(l.produit_id, -1)}
                      className="rounded-[6px] border border-line px-1.5 text-ink-soft hover:text-orange"
                    >
                      −
                    </button>
                    <span className="w-4 text-center font-bold text-ink">{l.quantite}</span>
                    <button
                      onClick={() => changerQuantite(l.produit_id, 1)}
                      className="rounded-[6px] border border-line px-1.5 text-ink-soft hover:text-orange"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-16 text-right font-bold text-ink">
                    {(l.prix_unitaire * l.quantite).toLocaleString("fr-FR")} F
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="font-bold text-ink-soft">Total</span>
          <span className="font-display text-lg font-extrabold text-ink">
            {total.toLocaleString("fr-FR")} F
          </span>
        </div>

        <button
          onClick={valider}
          disabled={lignes.length === 0 || isPending}
          className="rounded-[11px] bg-orange px-4 py-2.5 text-center font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Envoi..." : "Valider la commande"}
        </button>

        {message && (
          <div className="flex flex-col gap-2">
            <p
              className={`text-sm font-bold ${
                message.type === "success" ? "text-green" : "text-red-600"
              }`}
            >
              {message.texte}
            </p>
            {derniereCommandeId && (
              <div className="flex gap-2">
                <a
                  href={`/ticket/${derniereCommandeId}?format=80mm`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-[9px] border border-line px-3 py-1.5 text-center text-xs font-bold text-ink-soft hover:border-orange hover:text-orange"
                >
                  Ticket 80mm
                </a>
                <a
                  href={`/ticket/${derniereCommandeId}?format=a4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-[9px] border border-line px-3 py-1.5 text-center text-xs font-bold text-ink-soft hover:border-orange hover:text-orange"
                >
                  Ticket A4
                </a>
              </div>
            )}
          </div>
        )}
      </aside>

      {lignes.length > 0 && (
        <button
          onClick={() => asideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-[13px] bg-orange px-4 py-3.5 text-white shadow-lg lg:hidden"
        >
          <span className="text-sm font-bold">
            {lignes.reduce((s, l) => s + l.quantite, 0)} article{lignes.reduce((s, l) => s + l.quantite, 0) > 1 ? "s" : ""}
          </span>
          <span className="font-display text-lg font-extrabold">{total.toLocaleString("fr-FR")} F</span>
        </button>
      )}
    </div>
  );
}

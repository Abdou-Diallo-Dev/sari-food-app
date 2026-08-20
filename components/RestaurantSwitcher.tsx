"use client";

import { definirRestaurantActif } from "@/app/(app)/restaurant-actif-actions";

export function RestaurantSwitcher({
  restaurants,
  restaurantActifId,
  chemin,
}: {
  restaurants: { id: string; nom: string }[];
  restaurantActifId: string | null;
  chemin: string;
}) {
  return (
    <form
      action={definirRestaurantActif}
      className="flex items-center gap-2 rounded-card border border-orange/40 bg-orange/5 px-4 py-3"
    >
      <input type="hidden" name="chemin" value={chemin} />
      <span className="text-sm font-bold text-ink">Vous opérez pour :</span>
      <select
        name="restaurant_id"
        defaultValue={restaurantActifId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-[8px] border border-line bg-surface px-2 py-1 text-sm font-bold text-ink"
      >
        <option value="" disabled>
          Choisir un restaurant…
        </option>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nom}
          </option>
        ))}
      </select>
    </form>
  );
}

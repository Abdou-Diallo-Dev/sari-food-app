import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createRestaurant,
  createUtilisateur,
  updateUtilisateur,
  toggleActifUtilisateur,
  reinitialiserMotDePasse,
  migrerEmailsSariCom,
} from "./actions";
import { RolePoleSelect } from "@/components/RolePoleSelect";
import type { RoleUtilisateur } from "@/lib/roles";

type Utilisateur = {
  id: string;
  nom: string;
  identifiant: string | null;
  role: string;
  pole: string | null;
  restaurant_id: string | null;
  actif: boolean;
};

export default async function UtilisateursPage({
  searchParams,
}: {
  searchParams: Promise<{ migration?: string; count?: string; details?: string; erreur?: string }>;
}) {
  const profile = await requireProfile();
  requireRole(profile, ["admin"]);

  const { migration, count, details, erreur } = await searchParams;

  const supabase = await createClient();
  const [{ data: utilisateurs }, { data: restaurants }] = await Promise.all([
    supabase
      .from("utilisateurs")
      .select("id, nom, identifiant, role, pole, restaurant_id, actif")
      .order("nom"),
    supabase.from("restaurants").select("id, nom").order("nom"),
  ]);

  const restaurantsList = restaurants ?? [];
  const nomRestaurant = (id: string | null) =>
    id ? (restaurantsList.find((r) => r.id === id)?.nom ?? "—") : "Multi-site";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold text-ink">Utilisateurs</h1>
        <form action={migrerEmailsSariCom}>
          <button
            type="submit"
            className="rounded-[9px] border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-orange hover:text-orange"
            title="Réaligne l'email de connexion de tous les comptes existants sur @sari.com"
          >
            Migrer les comptes vers @sari.com
          </button>
        </form>
      </div>

      {erreur && (
        <p className="rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-600">
          {erreur}
        </p>
      )}
      {migration === "ok" && (
        <p className="rounded-[10px] border border-green/30 bg-green/10 px-3.5 py-2.5 text-sm font-bold text-green">
          Migration réussie : {count} compte(s) basculé(s) vers @sari.com.
        </p>
      )}
      {migration === "erreur" && (
        <p className="rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-600">
          Migration partielle — {details}
        </p>
      )}

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-lg font-extrabold text-orange">Restaurants</h2>

        <div className="mb-4 flex flex-col gap-2">
          {restaurantsList.length === 0 ? (
            <p className="text-sm text-ink-soft opacity-70">Aucun restaurant pour le moment.</p>
          ) : (
            restaurantsList.map((r) => (
              <div
                key={r.id}
                className="rounded-[10px] border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
              >
                {r.nom}
              </div>
            ))
          )}
        </div>

        <form action={createRestaurant} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            type="text"
            name="nom"
            required
            placeholder="Nom (ex : Sari Food — Almadies)"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <input
            type="text"
            name="adresse"
            placeholder="Adresse (optionnel)"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <button
            type="submit"
            className="rounded-[9px] border border-line px-3 py-1.5 text-sm font-bold text-ink hover:border-orange hover:text-orange sm:col-span-2"
          >
            Ajouter un restaurant
          </button>
        </form>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-4 font-display text-lg font-extrabold text-orange">
          Créer un utilisateur
        </h2>
        <form action={createUtilisateur} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            type="text"
            name="nom"
            required
            placeholder="Nom complet"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <input
            type="text"
            name="identifiant"
            required
            placeholder="Identifiant (ex : votre@sari.com)"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <input
            type="password"
            name="mot_de_passe"
            required
            minLength={8}
            placeholder="Mot de passe (8 caractères min.)"
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft placeholder:opacity-60"
          />
          <RolePoleSelect
            rolePlaceholder="Rôle"
            selectClassName="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          />
          <select
            name="restaurant_id"
            defaultValue=""
            className="rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="">Multi-site (admin/PDG)</option>
            {restaurantsList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-[9px] bg-orange px-3 py-1.5 text-sm font-bold text-white sm:col-span-2"
          >
            Créer l&apos;utilisateur
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-extrabold text-orange">
          Comptes existants ({(utilisateurs ?? []).length})
        </h2>

        {(utilisateurs ?? []).map((u: Utilisateur) => (
          <div key={u.id} className="rounded-card border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-ink">{u.nom}</span>
                {u.identifiant && (
                  <span className="ml-2 text-xs text-ink-soft opacity-70">
                    {u.identifiant.includes("@") ? u.identifiant : `@${u.identifiant}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-[7px] px-2 py-0.5 text-xs font-bold ${
                    u.actif ? "bg-green/10 text-green" : "bg-red-50 text-red-600"
                  }`}
                >
                  {u.actif ? "Actif" : "Désactivé"}
                </span>
                <span className="text-xs text-ink-soft opacity-70">{nomRestaurant(u.restaurant_id)}</span>
              </div>
            </div>

            <form
              action={updateUtilisateur}
              className="flex flex-wrap items-center gap-2 border-t border-line pt-3"
            >
              <input type="hidden" name="id" value={u.id} />
              <input
                type="text"
                name="nom"
                defaultValue={u.nom}
                required
                className="min-w-0 flex-1 rounded-[8px] border border-line bg-paper px-2 py-1 text-sm text-ink"
              />
              <RolePoleSelect
                roleDefaultValue={u.role as RoleUtilisateur}
                poleDefaultValue={u.pole ?? ""}
                selectClassName="rounded-[8px] border border-line bg-paper px-2 py-1 text-sm text-ink"
              />
              <select
                name="restaurant_id"
                defaultValue={u.restaurant_id ?? ""}
                className="rounded-[8px] border border-line bg-paper px-2 py-1 text-sm text-ink"
              >
                <option value="">Multi-site</option>
                {restaurantsList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nom}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-[8px] bg-orange px-3 py-1 text-sm font-bold text-white"
              >
                Enregistrer
              </button>
            </form>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <form action={toggleActifUtilisateur}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="actif" value={String(u.actif)} />
                <button
                  type="submit"
                  disabled={u.id === profile.id}
                  className="rounded-[8px] border border-line px-3 py-1 text-xs font-bold text-ink-soft hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-30"
                  title={u.id === profile.id ? "Vous ne pouvez pas désactiver votre propre compte" : undefined}
                >
                  {u.actif ? "Désactiver" : "Activer"}
                </button>
              </form>

              <form action={reinitialiserMotDePasse} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input
                  type="password"
                  name="mot_de_passe"
                  minLength={8}
                  placeholder="Nouveau mot de passe"
                  className="rounded-[8px] border border-line bg-paper px-2 py-1 text-xs text-ink placeholder:text-ink-soft placeholder:opacity-60"
                />
                <button
                  type="submit"
                  className="rounded-[8px] border border-line px-3 py-1 text-xs font-bold text-ink-soft hover:border-orange hover:text-orange"
                >
                  Réinitialiser le mot de passe
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

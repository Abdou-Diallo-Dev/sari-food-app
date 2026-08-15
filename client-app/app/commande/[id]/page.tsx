import { createAdminClient } from "@/lib/supabase/admin";
import { StatutPolling } from "./statut-polling";

type CommandeEnLigne = {
  statut: "en_attente" | "payee" | "echouee" | "expiree";
  commande_id: string | null;
};

export default async function StatutCommandePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: commandeEnLigne } = await supabase
    .from("commandes_en_ligne")
    .select("statut, commande_id")
    .eq("id", id)
    .maybeSingle<CommandeEnLigne>();

  let numero: number | null = null;
  if (commandeEnLigne?.commande_id) {
    const { data: commande } = await supabase
      .from("commandes")
      .select("numero")
      .eq("id", commandeEnLigne.commande_id)
      .maybeSingle();
    numero = commande?.numero ?? null;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <StatutPolling enAttente={commandeEnLigne?.statut === "en_attente"} />

      {!commandeEnLigne ? (
        <p className="text-ink-soft">Commande introuvable.</p>
      ) : commandeEnLigne.statut === "en_attente" ? (
        <>
          <h1 className="font-display text-xl font-extrabold text-ink">
            Vérification du paiement...
          </h1>
          <p className="text-sm text-ink-soft">Merci de patienter quelques instants.</p>
        </>
      ) : commandeEnLigne.statut === "payee" ? (
        <>
          <h1 className="font-display text-xl font-extrabold text-green">Paiement confirmé</h1>
          <p className="text-sm text-ink-soft">
            {numero
              ? `Votre commande n°${numero} a été transmise en cuisine.`
              : "Votre commande a été transmise en cuisine."}
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-xl font-extrabold text-red-600">Paiement échoué</h1>
          <p className="text-sm text-ink-soft">
            Le paiement n&apos;a pas abouti. Vous pouvez réessayer depuis l&apos;accueil.
          </p>
        </>
      )}
    </div>
  );
}

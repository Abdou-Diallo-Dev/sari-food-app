-- Les commandes en ligne sont matérialisées "payee" dès le paiement
-- confirmé (0021_commandes_en_ligne_fn.sql) et partent aussitôt en cuisine
-- (trigger KDS). Or le client ne voit pas le stock réel (production_jour) au
-- moment de commander : un article peut être en rupture sans que rien ne
-- l'empêche. Cette colonne donne à la caissière un point de contrôle pour
-- valider ou refuser la commande après coup, sans toucher au statut de
-- paiement/cuisine existant. "refusee" met aussi à jour `statut` vers
-- 'annulee', ce qui la retire automatiquement du KDS (déjà filtré sur
-- statut <> 'annulee').
alter table commandes
  add column confirmation_caisse text check (confirmation_caisse in ('validee', 'refusee'));

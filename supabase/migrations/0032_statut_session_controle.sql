-- Nouveau statut intermédiaire pour le workflow de contrôle manager de la
-- clôture de caisse (0033). Une valeur d'enum ne peut pas être utilisée dans
-- la même transaction que celle qui l'ajoute : ce fichier ne fait donc QUE
-- ça, comme pour l'extension de statut_session en 0020/0021.

alter type statut_session add value 'en_attente_controle';

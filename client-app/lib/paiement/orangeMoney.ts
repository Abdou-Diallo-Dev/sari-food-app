// Intégration contre le schéma habituel de l'API Orange Money Web Payment
// (OAuth2 client-credentials puis appel "webpayment"). Contrairement à Wave,
// Orange Money n'a pas une API unique documentée publiquement : l'intégration
// exacte (endpoints, pays, format webhook) dépend du contrat/agrégateur
// obtenu auprès d'Orange. Ce module DOIT être ajusté avec la doc réelle une
// fois le compte marchand créé — considérer ce qui suit comme un squelette
// fonctionnel, pas une intégration vérifiée.

const OM_TOKEN_URL = "https://api.orange.com/oauth/v3/token";
const OM_PAYMENT_URL =
  process.env.ORANGE_MONEY_PAYMENT_URL ?? "https://api.orange.com/orange-money-webpay/dev/v1/webpayment";

async function obtenirJetonOrangeMoney(): Promise<string> {
  const clientId = process.env.ORANGE_MONEY_CLIENT_ID;
  const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Identifiants Orange Money manquants.");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(OM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Orange Money : échec de l'authentification (${res.status}).`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function creerCheckoutOrangeMoney(params: {
  montant: number;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  notifUrl: string;
}): Promise<{ url: string; token: string }> {
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY;
  if (!merchantKey) throw new Error("ORANGE_MONEY_MERCHANT_KEY manquante.");

  const accessToken = await obtenirJetonOrangeMoney();

  const res = await fetch(OM_PAYMENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      currency: "OUV",
      order_id: params.reference,
      amount: Math.round(params.montant),
      return_url: params.successUrl,
      cancel_url: params.cancelUrl,
      notif_url: params.notifUrl,
      lang: "fr",
      reference: params.reference,
    }),
  });

  if (!res.ok) {
    throw new Error(`Orange Money a refusé la création du paiement (${res.status}).`);
  }

  const data = (await res.json()) as { payment_url: string; pay_token: string };
  return { url: data.payment_url, token: data.pay_token };
}

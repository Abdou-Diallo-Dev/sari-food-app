import crypto from "node:crypto";

// Intégration contre l'API "Checkout Sessions" publique de Wave
// (https://developer.wave.com). Les noms de champs ci-dessous reflètent la
// documentation publique au moment de l'écriture, mais DOIVENT être
// revérifiés une fois la clé API sandbox obtenue — c'est le point du plan le
// plus susceptible de demander un ajustement en conditions réelles.

const WAVE_API_URL = "https://api.wave.com/v1/checkout/sessions";

export async function creerCheckoutWave(params: {
  montant: number;
  reference: string;
  successUrl: string;
  errorUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const apiKey = process.env.WAVE_API_KEY;
  if (!apiKey) throw new Error("WAVE_API_KEY manquante.");

  const res = await fetch(WAVE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(Math.round(params.montant)),
      currency: "XOF",
      client_reference: params.reference,
      success_url: params.successUrl,
      error_url: params.errorUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(`Wave a refusé la création du paiement (${res.status}).`);
  }

  const data = (await res.json()) as { id: string; wave_launch_url: string };
  return { url: data.wave_launch_url, sessionId: data.id };
}

// Wave signe ses webhooks via l'en-tête "Wave-Signature" (format
// "t=<timestamp>,v1=<hmac_sha256_hex>" du corps brut concaténé au
// timestamp, avec le webhook secret dédié). À revérifier contre la doc au
// moment de configurer l'endpoint dans le dashboard Wave.
export function verifierSignatureWave(payloadBrut: string, signatureHeader: string | null): boolean {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const attendu = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payloadBrut}`)
    .digest("hex");

  const bufSignature = Buffer.from(signature);
  const bufAttendu = Buffer.from(attendu);
  if (bufSignature.length !== bufAttendu.length) return false;

  return crypto.timingSafeEqual(bufSignature, bufAttendu);
}

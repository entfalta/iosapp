const { initAdmin, json } = require("./auth-shared");
const GIFT_VOUCHER_VALIDITY_MS = 3 * 365 * 24 * 60 * 60 * 1000;

async function stripeSessionPaid(sessionId, expectedTotal) {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY fehlt in Netlify.");
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY hat kein gültiges Format.");
  }
  if (!String(sessionId || "").startsWith("cs_")) throw new Error("Ungültige Stripe Session.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error?.message || "Stripe Session konnte nicht geprüft werden.");
  const expectedCents = Math.max(0, Math.round(Number(expectedTotal || 0) * 100));
  return session.payment_status === "paid"
    && session.currency === "eur"
    && Number(session.amount_total || 0) === expectedCents
    && Number(session.metadata?.checkout_total_cents || 0) === expectedCents;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  const code = String(payload.code || "").trim().toUpperCase();
  const amount = Number(payload.amount || 0);
  const sessionId = String(payload.sessionId || "").trim();
  const expectedTotal = Number(payload.expectedTotal || 0);
  if (!code || amount <= 0) return json(400, { error: "Gutscheincode oder Betrag fehlt." });

  let admin;
  try {
    admin = initAdmin();
    const paid = await stripeSessionPaid(sessionId, expectedTotal);
    if (!paid) return json(402, { error: "Stripe-Zahlung wurde nicht bestätigt." });
  } catch (error) {
    return json(500, { error: error.message || "Gutschein konnte nicht geprüft werden." });
  }

  const db = admin.firestore();
  try {
    await db.runTransaction(async (transaction) => {
      const ref = db.collection("giftVouchers").doc(code);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error("Gutschein wurde nicht gefunden.");
      const voucher = snap.data() || {};
      const remaining = Number(voucher.remainingAmount ?? voucher.amount ?? 0);
      const createdAtMs = Number(voucher.createdAtMs || 0);
      if (createdAtMs && Date.now() - createdAtMs > GIFT_VOUCHER_VALIDITY_MS) {
        transaction.update(ref, { status: "expired", expiredAtMs: Date.now() });
        throw new Error("Gutschein ist abgelaufen.");
      }
      if (voucher.status !== "active" || remaining <= 0) throw new Error("Gutschein ist nicht aktiv oder leer.");
      if (remaining + 0.0001 < amount) throw new Error("Gutschein hat nicht mehr genug Restguthaben.");
      const redeemAmount = amount;
      const nextRemaining = Math.max(0, remaining - redeemAmount);
      const redemptions = Array.isArray(voucher.redemptions) ? voucher.redemptions : [];
      if (redemptions.some((entry) => entry.stripeSessionId === sessionId)) return;
      transaction.update(ref, {
        remainingAmount: nextRemaining,
        used: nextRemaining <= 0,
        status: nextRemaining <= 0 ? "used" : "active",
        emptiedAtMs: nextRemaining <= 0 ? Date.now() : (voucher.emptiedAtMs || null),
        redeemedAmount: Number(voucher.redeemedAmount || 0) + redeemAmount,
        lastRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        redemptions: admin.firestore.FieldValue.arrayUnion({
          amount: redeemAmount,
          stripeSessionId: sessionId,
          customerEmail: String(payload.customerEmail || ""),
          customerName: String(payload.customerName || ""),
          redeemedAtMs: Date.now()
        })
      });
    });
  } catch (error) {
    return json(400, { error: error.message || "Gutschein konnte nicht eingelöst werden." });
  }

  return json(200, { ok: true });
};

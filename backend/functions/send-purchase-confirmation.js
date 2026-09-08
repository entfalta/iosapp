const { initAdmin, json, siteOrigin } = require("./auth-shared");
const { sendOrderEmailInternal } = require("./mail-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }
  const checkout = payload.checkout || {};
  if (!checkout?.cart?.length && checkout.type !== "giftVoucher") return json(400, { error: "Checkout-Daten fehlen." });

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }
  const db = admin.firestore();
  const origin = siteOrigin(event, payload.origin);

  try {
    await sendOrderEmailInternal(db, { checkout, origin });
    return json(200, { ok: true });
  } catch (error) {
    console.error("Order email error:", error.message);
    return json(500, { error: error.message });
  }
}

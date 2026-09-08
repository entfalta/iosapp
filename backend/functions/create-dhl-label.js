const { initAdmin, json } = require("./auth-shared");
const { createDHLLabel } = require("./dhl-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { orderId } = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    if (!orderId) return json(400, { error: "Bestell-ID fehlt." });

    const admin = initAdmin();
    const db = admin.firestore();

    const doc = await db.collection("orders").doc(orderId).get();
    if (!doc.exists) return json(404, { error: "Bestellung nicht gefunden." });

    const order = doc.data();

    // Call DHL Private Shipping API
    const dhlRes = await createDHLLabel(order);

    await doc.ref.update({
      dhlShoppingCartId: dhlRes.shoppingCartId || "",
      shippingLabelUrl: dhlRes.entryUrl || "",
      shipmentStatus: "DHL Vorbereitet"
    });

    return json(200, {
      ok: true,
      message: "DHL Label erfolgreich erstellt.",
      shoppingCartId: dhlRes.shoppingCartId,
      labelUrl: dhlRes.entryUrl
    });
  } catch (error) {
    console.error("DHL Label Error:", error);
    return json(500, { ok: false, error: error.message });
  }
};

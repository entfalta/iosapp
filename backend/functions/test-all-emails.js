const { initAdmin, json, siteOrigin } = require("./auth-shared");
const { sendAuthEmailInternal, sendOrderEmailInternal } = require("./mail-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  const testEmail = String(payload.email || "").trim().toLowerCase();
  if (!testEmail || !testEmail.includes("@")) return json(400, { error: "Gültige Test-E-Mail erforderlich." });

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(String(payload.idToken || ""));
    const profile = await admin.firestore().collection("users").doc(decoded.uid).get();
    if (!profile.exists || !profile.data().admin) return json(403, { error: "Nur Admins können E-Mail-Tests ausführen." });
  } catch {
    return json(403, { error: "Bitte melde dich erneut als Admin an." });
  }

  const db = admin.firestore();
  const origin = siteOrigin(event, payload.origin);
  const results = [];

  const scenarios = [
    {
      name: "Passwort zurücksetzen",
      fn: async () => sendAuthEmailInternal(db, { action: "passwordReset", email: testEmail, name: "Test Admin", authLink: `${origin}/auth.html?test=1`, origin })
    },
    {
      name: "E-Mail bestätigen",
      fn: async () => sendAuthEmailInternal(db, { action: "emailVerification", email: testEmail, name: "Test Admin", authLink: `${origin}/auth.html?test=1`, origin })
    },
    {
      name: "Bestellbestätigung",
      fn: async () => {
        const mockCheckout = {
          orderNumber: "BE-TEST-123",
          customer: { name: "Test Kunde", email: testEmail },
          total: 29.80,
          cart: [
            { title: "Das kleine Wunder", quantity: 1, price: 14.90 },
            { title: "Entfalta Malbuch", quantity: 1, price: 9.90 }
          ],
          fees: [{ name: "Versand", price: 5.00 }],
          discounts: [{ code: "TEST-10", amount: 2.48 }],
          stripeInvoiceUrl: `${origin}/rechnung-test.pdf`
        };
        return sendOrderEmailInternal(db, { checkout: mockCheckout, origin });
      }
    }
  ];

  for (const s of scenarios) {
    try {
      await s.fn();
      results.push({ scenario: s.name, ok: true });
    } catch (err) {
      results.push({ scenario: s.name, ok: false, error: err.message });
    }
  }

  return json(200, { ok: true, results });
};

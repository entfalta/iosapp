exports.handler = async (event) => {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(payload)
  });

  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) return json(500, { error: "STRIPE_SECRET_KEY fehlt im Backend-Netlify-Projekt." });
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    return json(500, { error: "STRIPE_SECRET_KEY hat kein gültiges Stripe-Secret-Key-Format." });
  }

  async function stripe(path) {
    const response = await fetch(`https://api.stripe.com${path}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const data = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => "Stripe Fehler") } }));
    if (!response.ok) throw new Error(data.error?.message || "Stripe Fehler");
    return data;
  }

  try {
    const view = String(event.queryStringParameters?.view || "home");
    if (view === "transactions") {
      const transactions = await stripe("/v1/balance_transactions?limit=30");
      return json(200, { view, transactions: transactions.data || [] });
    }
    if (view === "customers") {
      const customers = await stripe("/v1/customers?limit=30");
      return json(200, { view, customers: customers.data || [] });
    }
    if (view === "payouts") {
      const payouts = await stripe("/v1/payouts?limit=30");
      return json(200, { view, payouts: payouts.data || [] });
    }
    const balance = await stripe("/v1/balance");
    const charges = await stripe("/v1/charges?limit=8");
    return json(200, { view: "home", balance, recentCharges: charges.data || [] });
  } catch (error) {
    return json(500, { error: error.message || "Stripe-Daten konnten nicht geladen werden." });
  }
};

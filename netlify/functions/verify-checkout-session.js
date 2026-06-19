exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }) };
  }

  const sessionId = event.queryStringParameters?.session_id || "";
  if (!sessionId.startsWith("cs_")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid session_id" }) };
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`
    }
  });
  const session = await response.json();
  if (!response.ok) {
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: session.error?.message || "Stripe session error" })
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: session.id,
      paid: session.payment_status === "paid",
      payment_status: session.payment_status,
      status: session.status,
      customer_email: session.customer_details?.email || session.customer_email || ""
    })
  };
};

function inferPaymentOutcome(session = {}) {
  const paymentStatus = String(session.payment_status || session.status || "").trim().toLowerCase();
  const status = String(session.status || "").trim().toLowerCase();
  const livemode = Boolean(session.livemode);
  if (paymentStatus === "paid") {
    return {
      paid: true,
      paymentStatus,
      paymentState: "paid",
      paymentMode: livemode ? "stripe-live-paid" : "stripe-test-paid",
      livemode
    };
  }
  if (["canceled", "expired", "failed", "requires_payment_method"].includes(paymentStatus) || ["canceled", "expired", "failed"].includes(status)) {
    return {
      paid: false,
      paymentStatus: paymentStatus || status,
      paymentState: "error",
      paymentMode: "stripe-payment-error",
      livemode
    };
  }
  return {
    paid: false,
    paymentStatus: paymentStatus || status,
    paymentState: "pending",
    paymentMode: livemode ? "stripe-live-pending" : "stripe-test-pending",
    livemode
  };
}

exports.handler = async (event) => {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(payload)
  });

  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) {
    return json(500, { error: "Missing STRIPE_SECRET_KEY" });
  }
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    return json(500, { error: "Invalid STRIPE_SECRET_KEY format" });
  }

  const sessionId = event.queryStringParameters?.session_id || "";
  if (!sessionId.startsWith("cs_")) {
    return json(400, { error: "Invalid session_id" });
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=invoice`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": "2024-06-20"
    }
  });
  const session = await response.json();
  if (!response.ok) {
    return json(response.status, { error: session.error?.message || "Stripe session error" });
  }

  const outcome = inferPaymentOutcome(session);
  return json(200, {
    id: session.id,
    paid: outcome.paid,
    payment_status: outcome.paymentStatus,
    paymentStatus: outcome.paymentStatus,
    payment_state: outcome.paymentState,
    paymentState: outcome.paymentState,
    payment_mode: outcome.paymentMode,
    paymentMode: outcome.paymentMode,
    status: session.status,
    livemode: outcome.livemode,
    amount_total: Number(session.amount_total || 0),
    currency: session.currency || "",
    checkout_total_cents: Number(session.metadata?.checkout_total_cents || 0),
    customer_email: session.customer_details?.email || session.customer_email || "",
    stripeInvoiceUrl: session.invoice?.hosted_invoice_url || "",
    stripeInvoicePdf: session.invoice?.invoice_pdf || ""
  });
};

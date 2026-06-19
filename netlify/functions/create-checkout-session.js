exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }) };
  }

  let checkout;
  try {
    checkout = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const origin = event.headers.origin || `https://${event.headers.host}`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/success.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${origin}/index.html?checkout=cancel`);
  if (checkout.customer?.email) params.set("customer_email", checkout.customer.email);

  const items = [...(checkout.cart || []), ...(checkout.fees || []).map((fee) => ({
    title: fee.name || "Zusatzkosten",
    price: fee.price,
    quantity: 1
  }))];

  if (!items.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty" }) };
  }

  const subtotalCents = items.reduce((sum, item) => {
    const amount = Math.max(0, Math.round(Number(item.price || 0) * 100));
    return sum + amount * Number(item.quantity || 1);
  }, 0);

  items.forEach((item, index) => {
    const amount = Math.max(0, Math.round(Number(item.price || 0) * 100));
    params.set(`line_items[${index}][quantity]`, String(item.quantity || 1));
    params.set(`line_items[${index}][price_data][currency]`, "eur");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.title || "Artikel");
  });

  const discountCents = Math.min(subtotalCents, Math.max(0, Math.round(Number(checkout.discountTotal || 0) * 100)));
  if (discountCents > 0) {
    const couponParams = new URLSearchParams();
    couponParams.set("duration", "once");
    couponParams.set("currency", "eur");
    couponParams.set("amount_off", String(discountCents));
    couponParams.set("name", (checkout.discounts || []).map((discount) => discount.code).filter(Boolean).join(" + ") || "Rabatt");

    const couponResponse = await fetch("https://api.stripe.com/v1/coupons", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: couponParams
    });
    const coupon = await couponResponse.json();
    if (!couponResponse.ok) {
      return { statusCode: couponResponse.status, body: JSON.stringify({ error: coupon.error?.message || "Stripe coupon error" }) };
    }
    params.set("discounts[0][coupon]", coupon.id);
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await stripeResponse.json();
  if (!stripeResponse.ok) {
    return { statusCode: stripeResponse.status, body: JSON.stringify({ error: data.error?.message || "Stripe error" }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: data.url })
  };
};

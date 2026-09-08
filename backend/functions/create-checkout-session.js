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

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();

  let checkout;
  try {
    checkout = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Checkout-Daten." });
  }

  const headers = event.headers || {};
  const requestOrigin = String(headers.origin || headers.Origin || "").trim();
  const referer = String(headers.referer || headers.Referrer || headers.referrer || "").trim();
  const payloadOrigin = String(checkout.siteOrigin || checkout.origin || "").trim();
  const forwardedHost = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  const forwardedProto = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const configuredSiteUrl = String(process.env.SHOP_SITE_URL || process.env.SITE_URL || "https://entfalta.com").trim();
  let origin;
  try {
    origin = payloadOrigin
      ? new URL(payloadOrigin).origin
      : (requestOrigin
        ? new URL(requestOrigin).origin
        : (referer
          ? new URL(referer).origin
          : (configuredSiteUrl ? new URL(configuredSiteUrl).origin : new URL(`${forwardedProto}://${forwardedHost}`).origin)));
  } catch {
    return json(500, { error: "Die sichere Shop-Adresse konnte nicht ermittelt werden." });
  }
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("invoice_creation[enabled]", "true");
  params.set("success_url", `${origin}/success.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", checkout.type === "giftVoucher" ? `${origin}/gutschein.html?checkout=cancel` : `${origin}/index.html?checkout=cancel`);
  if (checkout.customer?.email) {
    params.set("customer_email", checkout.customer.email);
    params.set("payment_intent_data[receipt_email]", checkout.customer.email);
  }

  const cartItems = Array.isArray(checkout.cart) ? checkout.cart : [];
  const cartSubtotalCents = cartItems.reduce((sum, item) => {
    const amount = Math.max(0, Math.round(Number(item.price || 0) * 100));
    return sum + amount * Number(item.quantity || 1);
  }, 0);

  const freeShippingThresholdCents = 2500;
  const isFreeShipping = cartSubtotalCents >= freeShippingThresholdCents;

  if (!Array.isArray(checkout.cart) || (checkout.fees !== undefined && !Array.isArray(checkout.fees))) {
    return json(400, { error: "Der Warenkorb hat ein ungültiges Datenformat." });
  }

  const processedFees = (checkout.fees || []).map((fee) => {
    let price = Number(fee.price || 0);
    if (isFreeShipping && (fee.kind === "shipping" || String(fee.name || "").toLowerCase().includes("versand"))) {
      price = 0;
    }
    return {
      title: fee.name || "Zusatzkosten",
      price: price,
      quantity: 1
    };
  });

  const items = [...cartItems, ...processedFees];

  if (!items.length) {
    return json(400, { error: "Der Warenkorb ist leer." });
  }

  const invalidItem = items.find((item) => {
    const price = Number(item.price);
    const quantity = Number(item.quantity || 1);
    return !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100;
  });
  if (invalidItem) {
    return json(400, { error: "Der Warenkorb enthält einen ungültigen Preis oder eine ungültige Menge." });
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

  const discountValue = Number(checkout.discountTotal || 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return json(400, { error: "Der Rabattwert ist ungültig." });
  }

  // Calculate total discount from details to be more precise
  let totalDiscountCents = 0;
  if (Array.isArray(checkout.discountDetails)) {
      totalDiscountCents = checkout.discountDetails.reduce((sum, d) => sum + Math.round(Number(d.amount || 0) * 100), 0);
  } else {
      totalDiscountCents = Math.round(discountValue * 100);
  }

  const finalDiscountCents = Math.min(subtotalCents, totalDiscountCents);

  if (!secretKey) {
    return json(500, { error: "STRIPE_SECRET_KEY fehlt im Backend-Netlify-Projekt fuer backend.entfalta.com. Bitte dort unter Site configuration > Environment variables setzen und danach neu deployen." });
  }
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    return json(500, { error: "STRIPE_SECRET_KEY hat kein gültiges Stripe-Secret-Key-Format." });
  }
  params.set("metadata[checkout_total_cents]", String(subtotalCents - finalDiscountCents));
  if (checkout.orderNumber) {
    params.set("metadata[order_number]", String(checkout.orderNumber));
  }
  if (checkout.type) {
    params.set("metadata[checkout_type]", String(checkout.type));
  }

  if (finalDiscountCents > 0) {
    const couponParams = new URLSearchParams();
    couponParams.set("duration", "once");
    couponParams.set("currency", "eur");
    couponParams.set("amount_off", String(finalDiscountCents));
    const codes = (checkout.discounts || []).map((discount) => discount.code).filter(Boolean);
    couponParams.set("name", codes.length ? codes.join(" + ") : "Rabatt");

    const couponResponse = await fetch("https://api.stripe.com/v1/coupons", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: couponParams
    });
    const coupon = await couponResponse.json().catch(async () => ({ error: { message: await couponResponse.text().catch(() => "Stripe coupon error") } }));
    if (!couponResponse.ok) {
      return json(couponResponse.status, { error: coupon.error?.message || "Stripe coupon error" });
    }
    params.set("discounts[0][coupon]", coupon.id);
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20"
    },
    body: params
  });

  const data = await stripeResponse.json().catch(async () => ({ error: { message: await stripeResponse.text().catch(() => "Stripe error") } }));
  if (!stripeResponse.ok) {
    return json(stripeResponse.status, { error: data.error?.message || "Stripe error" });
  }

  return json(200, { url: data.url });
};

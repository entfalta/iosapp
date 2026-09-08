const { initAdmin, json } = require("./auth-shared");

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

async function fetchStripeSessionSummary(sessionId, expectedTotal) {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY fehlt in Netlify.");
  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY hat kein gültiges Format.");
  }
  if (!String(sessionId || "").startsWith("cs_")) throw new Error("Ungültige Stripe Session.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=invoice`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": "2024-06-20"
    }
  });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error?.message || "Stripe Session konnte nicht geprüft werden.");
  const expectedCents = Math.max(0, Math.round(Number(expectedTotal || 0) * 100));
  const amountCents = Number(session.amount_total || 0);
  const metadataCents = Number(session.metadata?.checkout_total_cents || 0);
  const outcome = inferPaymentOutcome(session);
  return {
    ...outcome,
    amount_total: Number(session.amount_total || 0),
    currency: session.currency || "",
    checkout_total_cents: metadataCents,
    customer_email: session.customer_details?.email || session.customer_email || "",
    stripeInvoiceUrl: session.invoice?.hosted_invoice_url || "",
    stripeInvoicePdf: session.invoice?.invoice_pdf || "",
    metadata: session.metadata || {},
    paid: outcome.paid && session.currency === "eur" && (Math.abs(amountCents - expectedCents) <= 1 || (metadataCents > 0 && Math.abs(metadataCents - expectedCents) <= 1))
  };
}

function createDownloadSession() {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 48 * 60 * 60 * 1000,
    used: false,
    usedAtMs: null
  };
}

function fulfillmentLabel(fulfillment) {
  if (fulfillment === "download") return "PDF-Download";
  if (fulfillment === "print") return "Gedruckte Papierseiten";
  if (fulfillment === "ebook") return "E-Book";
  return "Standard";
}

async function redeemGiftVouchers(db, admin, checkout, sessionId) {
  const vouchers = (checkout.discounts || []).filter((discount) => discount.kind === "voucher" || discount.giftVoucher);
  for (const discount of vouchers) {
    const code = String(discount.code || "").trim().toUpperCase();
    const amount = Number(discount.amount || 0);
    if (!code || amount <= 0) continue;
    await db.runTransaction(async (transaction) => {
      const ref = db.collection("giftVouchers").doc(code);
      const snap = await transaction.get(ref);
      if (!snap.exists) return;
      const voucher = snap.data() || {};
      const redemptions = Array.isArray(voucher.redemptions) ? voucher.redemptions : [];
      if (redemptions.some((entry) => entry.stripeSessionId === sessionId)) return;
      const remaining = Number(voucher.remainingAmount ?? voucher.amount ?? 0);
      const nextRemaining = Math.max(0, remaining - amount);
      transaction.update(ref, {
        remainingAmount: nextRemaining,
        used: nextRemaining <= 0,
        status: nextRemaining <= 0 ? "used" : "active",
        emptiedAtMs: nextRemaining <= 0 ? Date.now() : (voucher.emptiedAtMs || null),
        redeemedAmount: Number(voucher.redeemedAmount || 0) + amount,
        lastRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        redemptions: admin.firestore.FieldValue.arrayUnion({
          amount,
          stripeSessionId: sessionId,
          customerEmail: String(checkout.customer?.email || ""),
          customerName: String(checkout.customer?.name || ""),
          redeemedAtMs: Date.now()
        })
      });
    });
  }
}

async function incrementPromoCodeUsage(db, admin, checkout) {
    const promo = (checkout.discounts || []).find(d => d.kind === 'promo');
    if (!promo || !promo.id) return;

    try {
        const ref = db.collection("discountCodes").doc(promo.id);
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists) return;
            const data = snap.data();
            transaction.update(ref, {
                usageCount: (data.usageCount || 0) + 1,
                lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
    } catch (error) {
        console.error("STATS: Promo Update Error:", error.message);
    }
}

async function updateGlobalStats(db, amount) {
  try {
    const statsRef = db.collection("stats").doc("global");
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(statsRef);
      const data = snap.exists ? snap.data() : { totalRevenue: 0, orderCount: 0 };
      transaction.set(statsRef, {
        totalRevenue: (Number(data.totalRevenue) || 0) + Number(amount),
        orderCount: (Number(data.orderCount) || 0) + 1,
        lastUpdateMs: Date.now()
      }, { merge: true });
    });
    console.log("STATS: Global stats updated.");
  } catch (error) {
    console.error("STATS: Update Error:", error.message);
  }
}

async function triggerAutoParcel(db, orderId) {
  try {
    // 1. Check if Manual Mode is enabled
    const settingsSnap = await db.collection("settings").doc("payment").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    if (settings.manualShippingMode === true) {
        console.log(`PARCEL: Manual mode active. Skipping auto creation for order ${orderId}.`);
        return;
    }

    // 2. Trigger Parcel Creation
    const baseUrl = process.env.URL || "https://backend.entfalta.com";
    await fetch(`${baseUrl}/.netlify/functions/create-sendcloud-parcel`, {
      method: "POST",
      body: JSON.stringify({ orderId })
    });
  } catch (error) {
    console.error("Auto Parcel Error:", error);
  }
}

async function saveOrder(db, admin, checkout, sessionId, paymentSummary = {}) {
  let existing = await db.collection("orders").where("stripeSessionId", "==", sessionId).limit(1).get();
  if (existing.empty && paymentSummary.metadata?.order_number) {
    existing = await db.collection("orders").where("orderNumber", "==", paymentSummary.metadata.order_number).limit(1).get();
  }

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    const existingOrder = { id: existingDoc.id, ...existingDoc.data() };
    const orderItems = existingOrder.items || [];
    const update = {
      stripeSessionId: sessionId,
      stripeInvoiceUrl: paymentSummary.stripeInvoiceUrl || existingOrder.stripeInvoiceUrl || "",
      stripeInvoicePdf: paymentSummary.stripeInvoicePdf || existingOrder.stripeInvoicePdf || "",
      paymentStatus: paymentSummary.paymentStatus || "paid",
      paymentMode: paymentSummary.paymentMode || existingOrder.paymentMode || "stripe-paid",
      paymentState: paymentSummary.paymentState || "paid",
      status: "paid"
    };
    await existingDoc.ref.update(update);
    return {
      alreadySaved: true,
      items: orderItems,
      dhl: { skipped: true, reason: "disabled" },
      stripeInvoiceUrl: update.stripeInvoiceUrl,
      stripeInvoicePdf: update.stripeInvoicePdf
    };
  }

  const orderItems = [];
  let savedOrderId = "";
  let savedOrderData = null;
  const orderBase = {
    orderNumber: checkout.orderNumber || `RE-${Math.floor(100000 + Math.random() * 900000)}`,
    customer: checkout.customer || {},
    fees: checkout.fees || [],
    discounts: checkout.discounts || [],
    discountTotal: Number(checkout.discountTotal || 0),
    total: Number(checkout.total || 0),
    archived: false,
    status: "open",
    fulfillmentStatus: "wird vorbereitet",
    shippingCarrier: checkout.shippingCarrier || "",
    shippingCarrierCustom: "",
    shippingMethod: checkout.shippingMethod || null,
    trackingNumber: "",
    paymentMode: paymentSummary.paymentMode || checkout.paymentMode || "stripe-paid",
    paymentStatus: paymentSummary.paymentStatus || "paid",
    paymentState: paymentSummary.paymentState || "paid",
    livemode: Boolean(paymentSummary.livemode ?? checkout.livemode),
    stripeSessionId: sessionId,
    stripeInvoiceUrl: paymentSummary.stripeInvoiceUrl || "",
    stripeInvoicePdf: paymentSummary.stripeInvoicePdf || "",
    legalAcceptance: checkout.legalAcceptance || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now()
  };

  try {
    await db.runTransaction(async (transaction) => {
      const requestedByBook = new Map();
      for (const item of checkout.cart || []) {
        const physicalQuantity = item.fulfillment === "download" ? 0 : Number(item.quantity || 0);
        requestedByBook.set(item.bookId, Number(requestedByBook.get(item.bookId) || 0) + physicalQuantity);
      }
      const snapshots = new Map();
      for (const [bookId, requested] of requestedByBook.entries()) {
        const ref = db.collection("books").doc(bookId);
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error("Artikel wurde nicht gefunden.");
        const book = { id: snap.id, ...snap.data() };
        if (requested > Number(book.stock || 0)) throw new Error("Nicht genug Lagerbestand.");
        snapshots.set(bookId, { ref, book, requested });
      }
      for (const entry of snapshots.values()) {
        if (entry.requested <= 0) continue;
        transaction.update(entry.ref, {
          stock: Number(entry.book.stock || 0) - entry.requested,
          sold: Number(entry.book.sold || 0) + entry.requested
        });
      }
      for (const item of checkout.cart || []) {
        const entry = snapshots.get(item.bookId);
        const fulfillment = item.fulfillment || "default";
        orderItems.push({
          bookId: item.bookId,
          title: entry?.book?.title || item.title || "Artikel",
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          itemType: entry?.book?.itemType || item.itemType || "book",
          fulfillment,
          fulfillmentLabel: fulfillmentLabel(fulfillment),
          pdf: fulfillment === "download" ? entry?.book?.pdf || item.pdf || "" : "",
          downloaded: false,
          downloadedAt: null,
          downloadSession: fulfillment === "download" ? createDownloadSession() : null
        });
      }
      const orderRef = db.collection("orders").doc();
      savedOrderId = orderRef.id;
      savedOrderData = { ...orderBase, items: orderItems, stockSynced: true };
      transaction.set(orderRef, savedOrderData);

      // Save to user inventory for persistent access even if order is deleted
      const userId = String(checkout.customer?.userId || "");
      if (userId) {
        for (const item of orderItems) {
          if (item.fulfillment === "download" || item.fulfillment === "ebook") {
            const inventoryRef = db.collection("userInventory").doc(userId).collection("items").doc(item.bookId);
            transaction.set(inventoryRef, {
              bookId: item.bookId,
              title: item.title,
              purchasedAtMs: Date.now(),
              orderId: savedOrderId,
              orderNumber: orderBase.orderNumber
            }, { merge: true });
          }
        }
      }
    });
  } catch (error) {
    for (const item of checkout.cart || []) {
      const fulfillment = item.fulfillment || "default";
      orderItems.push({
        bookId: item.bookId,
        title: item.title || "Artikel",
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),
        itemType: item.itemType || "book",
        fulfillment,
        fulfillmentLabel: fulfillmentLabel(fulfillment),
        pdf: fulfillment === "download" ? item.pdf || "" : "",
        downloaded: false,
        downloadedAt: null,
        downloadSession: fulfillment === "download" ? createDownloadSession() : null
      });
    }
    const created = await db.collection("orders").add({
      ...orderBase,
      items: orderItems,
      stockSynced: false,
      status: "paid-needs-stock-check",
      saveWarning: error.message || "stock-sync-failed"
    });
    savedOrderId = created.id;
    savedOrderData = {
      ...orderBase,
      items: orderItems,
      stockSynced: false,
      status: "paid-needs-stock-check",
      saveWarning: error.message || "stock-sync-failed"
    };

    // Save to user inventory even if stock sync failed
    const userId = String(checkout.customer?.userId || "");
    if (userId) {
      for (const item of orderItems) {
        if (item.fulfillment === "download" || item.fulfillment === "ebook") {
          await db.collection("userInventory").doc(userId).collection("items").doc(item.bookId).set({
            bookId: item.bookId,
            title: item.title,
            purchasedAtMs: Date.now(),
            orderId: savedOrderId,
            orderNumber: orderBase.orderNumber,
            stockSyncWarning: true
          }, { merge: true });
        }
      }
    }
  }
  await redeemGiftVouchers(db, admin, checkout, sessionId);
  await incrementPromoCodeUsage(db, admin, checkout);

  return {
    alreadySaved: false,
    items: orderItems,
    orderId: savedOrderId,
    dhl: { skipped: true, reason: "disabled" },
    stripeInvoiceUrl: paymentSummary.stripeInvoiceUrl || "",
    stripeInvoicePdf: paymentSummary.stripeInvoicePdf || ""
  };
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

  const checkout = payload.checkout || {};
  const sessionId = String(payload.sessionId || "").trim();
  if (!sessionId || !checkout?.cart?.length) return json(400, { error: "Checkout-Daten fehlen." });

  let admin;
  try {
    admin = initAdmin();
    const paymentSummary = await fetchStripeSessionSummary(sessionId, Number(checkout.total || 0));
    if (!paymentSummary.paid) return json(402, { error: "Stripe-Zahlung wurde nicht bestätigt." });
    const result = await saveOrder(admin.firestore(), admin, checkout, sessionId, paymentSummary);

    if (!result.alreadySaved) {
        // Trigger Stats and Parcel in background
        updateGlobalStats(admin.firestore(), checkout.total);
        triggerAutoParcel(admin.firestore(), result.orderId);
    }

    return json(200, { ok: true, ...result });
  } catch (error) {
    return json(500, { error: error.message || "Bestellung konnte nicht gespeichert werden." });
  }
};

const { initAdmin, json } = require("./auth-shared");
const { friendlySmtpError, hasUsableSmtpSettings, htmlFromText, loadCentralEmailSettings, mailFrom, sendMailWithFallback } = require("./mail-shared");

function defaultSettings() {
  return {
    subject: "Dein Entfalta-Gutschein %CODE%",
    body: "Hallo %NAME%,\n\nvielen Dank für den Gutscheinkauf.\n\nGutscheincode: %CODE%\nWert: %AMOUNT%\n\nViele Grüße\nEntfalta"
  };
}

function applyTemplate(template, voucher) {
  const values = {
    "%NAME%": voucher.recipientName || "Kunde",
    "%CODE%": voucher.code || "",
    "%AMOUNT%": `${Number(voucher.amount || 0).toFixed(2)} EUR`,
    "%InvoiceUrl%": voucher.stripeInvoiceUrl || ""
  };
  return Object.entries(values).reduce((text, [token, value]) => text.replaceAll(token, value), String(template || ""));
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
  if (!code.startsWith("GS-")) return json(400, { error: "Ungültiger Gutscheincode." });

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }

  const db = admin.firestore();
  const voucherRef = db.collection("giftVouchers").doc(code);
  const voucherSnap = await voucherRef.get();
  if (!voucherSnap.exists) return json(404, { error: "Gutschein nicht gefunden." });
  const voucher = { id: voucherSnap.id, ...voucherSnap.data() };
  if (voucher.sentAtMs && !payload.force) return json(200, { ok: true, alreadySent: true });

  if (payload.force) {
    try {
      const decoded = await admin.auth().verifyIdToken(String(payload.idToken || ""));
      const profile = await db.collection("users").doc(decoded.uid).get();
      if (!profile.exists || !profile.data().admin) return json(403, { error: "Nur Admins können Gutscheine erneut senden." });
    } catch {
      return json(403, { error: "Bitte melde dich erneut als Admin an." });
    }
  }

  const mail = await loadCentralEmailSettings(db);
  if (!hasUsableSmtpSettings(mail)) {
    await voucherRef.set({ sendError: "SMTP ist noch nicht vollständig eingerichtet.", lastSendTryMs: Date.now() }, { merge: true });
    return json(500, { error: "SMTP ist noch nicht vollständig in email-config.html eingerichtet." });
  }

  const settingsSnap = await db.collection("settings").doc("giftVoucherMail").get();
  const settings = { ...defaultSettings(), ...(settingsSnap.exists ? settingsSnap.data() : {}) };
  const subject = applyTemplate(settings.subject, voucher);
  const text = applyTemplate(settings.body, voucher);

  const origin = siteOrigin(event, payload.origin);
  const html = getModernEmailWrapper(
    `<div style="font-size: 18px; text-align: center; color: #3f6f45; font-weight: bold; margin-bottom: 20px;">Dein Gutschein-Code</div>` +
    `<div style="font-size: 32px; text-align: center; background: #fffaf0; padding: 20px; border: 2px dashed #d77d32; border-radius: 16px; color: #2b241f; font-family: monospace; letter-spacing: 2px; margin-bottom: 30px;">${htmlFromText(voucher.code)}</div>` +
    `<div style="font-size: 16px;">${applyTemplate(settings.body, voucher).replace(/\n/g, "<br>")}</div>`,
    {
      title: "Dein Gutschein",
      origin,
      ctaText: "Zum Shop",
      ctaUrl: `${origin}/index.html`
    }
  );

  const to = voucher.recipientEmail || voucher.buyerEmail;
  if (!to || !String(to).includes("@")) return json(400, { error: "Empfänger-E-Mail fehlt." });

  try {
    await sendMailWithFallback(mail, {
      from: mailFrom(mail, "giftVoucher"),
      to,
      subject,
      text,
      html
    });
  } catch (error) {
    const message = friendlySmtpError(error, mail);
    await voucherRef.set({ sendError: message, lastSendTryMs: Date.now() }, { merge: true });
    return json(500, { error: message });
  }

  await voucherRef.set({
    sentAtMs: Date.now(),
    sendError: "",
    lastSendTryMs: Date.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return json(200, { ok: true });
};

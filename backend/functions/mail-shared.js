const nodemailer = require("nodemailer");

function htmlFromText(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function smtpTransportOptions(settings, secureOverride) {
  const port = Number(settings.smtpPort || 587);
  const secure = secureOverride !== undefined ? secureOverride : (settings.smtpSecure === undefined ? port === 465 : Boolean(settings.smtpSecure));
  return {
    host: settings.smtpHost,
    port,
    secure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  };
}

function envEmailSettings() {
  return {
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1",
    smtpUser: process.env.SMTP_USER || "",
    smtpPassword: process.env.SMTP_PASSWORD || "",
    fromName: process.env.MAIL_FROM_NAME || process.env.FROM_NAME || "Entfalta",
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.FROM_EMAIL || "",
    authFromName: process.env.AUTH_MAIL_FROM_NAME || "",
    authFromEmail: process.env.AUTH_MAIL_FROM_EMAIL || "",
    giftVoucherFromName: process.env.GIFT_VOUCHER_FROM_NAME || "",
    giftVoucherFromEmail: process.env.GIFT_VOUCHER_FROM_EMAIL || "",
    customFromName: process.env.CUSTOM_MAIL_FROM_NAME || "",
    customFromEmail: process.env.CUSTOM_MAIL_FROM_EMAIL || ""
  };
}

function hasUsableSmtpSettings(settings) {
  return Boolean(settings?.smtpHost && settings?.smtpUser && settings?.smtpPassword && settings?.fromEmail);
}

async function loadCentralEmailSettings(db) {
  const emailSnap = await db.collection("settings").doc("emailConfig").get();
  if (emailSnap.exists && hasUsableSmtpSettings(emailSnap.data())) return emailSnap.data() || {};
  const legacySnap = await db.collection("settings").doc("authMail").get();
  if (legacySnap.exists && hasUsableSmtpSettings(legacySnap.data())) return legacySnap.data() || {};
  return envEmailSettings();
}

function senderFor(settings, type = "default") {
  const prefix = type === "auth" ? "auth" : type === "giftVoucher" ? "giftVoucher" : type === "custom" ? "custom" : "";
  const nameKey = prefix ? `${prefix}FromName` : "fromName";
  const emailKey = prefix ? `${prefix}FromEmail` : "fromEmail";
  return {
    name: settings?.[nameKey] || settings?.fromName || "Entfalta",
    email: settings?.[emailKey] || settings?.fromEmail || ""
  };
}

function mailFrom(settings, type = "default") {
  const sender = senderFor(settings, type);
  return `${sender.name || "Entfalta"} <${sender.email}>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getModernEmailWrapper(content, options = {}) {
  const title = options.title || "Entfalta";
  const ctaText = options.ctaText || "";
  const ctaUrl = options.ctaUrl || "";
  let origin = options.origin || "https://entfalta.com";

  // For images in emails, we need a public URL.
  // If testing locally, fallback to the main production domain for assets.
  const assetBase = (origin.includes("localhost") || origin.includes("127.0.0.1"))
    ? "https://entfalta.com"
    : origin.replace(/\/+$/, "");

  let ctaHtml = "";
  if (ctaText && ctaUrl) {
    ctaHtml = `
      <div style="margin: 30px 0; text-align: center;">
        <a href="${ctaUrl}" style="background-color: #3f6f45; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(63, 111, 69, 0.2);">
          ${ctaText}
        </a>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7eedc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2b241f; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7eedc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 12px 30px rgba(46, 35, 24, 0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 30px 40px; background-color: #ffffff; border-bottom: 1px solid rgba(63, 48, 37, 0.1);">
              <img src="${assetBase}/assets/icon.jpeg" alt="Entfalta Logo" width="80" height="80" style="border-radius: 20px; margin-bottom: 12px; display: block; object-fit: cover;">
              <div style="font-size: 26px; font-weight: bold; color: #3f6f45; letter-spacing: -0.5px;">Entfalta</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; line-height: 1.6; font-size: 16px;">
              ${content}
              ${ctaHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fffaf0; border-top: 1px solid rgba(63, 48, 37, 0.05); text-align: center; font-size: 13px; color: #8a5637;">
              <p style="margin: 0 0 10px 0;"><strong>Entfalta Admin-Team</strong></p>
              <div style="margin-bottom: 15px;">
                <a href="${origin}/impressum.html" style="color: #8a5637; text-decoration: underline;">Impressum</a> &nbsp; | &nbsp;
                <a href="${origin}/datenschutz.html" style="color: #8a5637; text-decoration: underline;">Datenschutz</a> &nbsp; | &nbsp;
                <a href="${origin}/kontakt.html" style="color: #8a5637; text-decoration: underline;">Kontakt</a>
              </div>
              <p style="margin: 0; opacity: 0.6;">© 2026 Entfalta. Alle Rechte vorbehalten.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Shared logic for Auth Emails
 */
async function sendAuthEmailInternal(db, values) {
  const { action, email, name, newEmail, authLink, origin } = values;
  const ACTION_TITLES = {
    passwordReset: "Passwort zurücksetzen",
    emailChange: "E-Mail-Adresse ändern",
    emailVerification: "E-Mail-Adresse bestätigen"
  };

  const templateSnap = await db.collection("settings").doc("authMail").get();
  const templateSettings = templateSnap.exists ? templateSnap.data() : {};
  const mailSettings = await loadCentralEmailSettings(db);
  const settings = { ...mailSettings, templates: templateSettings.templates || mailSettings.templates || {} };

  if (!hasUsableSmtpSettings(settings)) throw new Error("SMTP nicht konfiguriert.");

  const bodyFallback = `Hallo %NAME%,\n\nbitte bestätige diese Aktion über folgenden Link:\n%AUTHCODE%\n\nDer Link ist 14 Minuten gültig.\n\nViele Grüße\nEntfalta`;
  const bodyTemplate = settings?.templates?.[action]?.body || bodyFallback;
  const subjectFallback = ACTION_TITLES[action] || "Bestätigung";
  const rawSubject = settings?.templates?.[action]?.subject || subjectFallback;

  const replaceTokens = (t) => String(t || "").replaceAll("%NAME%", name || "Kunde").replaceAll("%EMAIL%", email || "").replaceAll("%NEW_EMAIL%", newEmail || "").replaceAll("%AUTHCODE%", authLink || "");
  const subject = replaceTokens(rawSubject);
  const text = replaceTokens(bodyTemplate);

  const tokens = { "%NAME%": escapeHtml(name || "Kunde"), "%EMAIL%": escapeHtml(email || ""), "%NEW_EMAIL%": escapeHtml(newEmail || ""), "%AUTHCODE%": "" };
  const content = String(bodyTemplate || "")
    .split(/(%NAME%|%EMAIL%|%NEW_EMAIL%|%AUTHCODE%)/g)
    .map((part) => (part === "%AUTHCODE%" ? "" : (tokens[part] ?? escapeHtml(part))))
    .join("")
    .replace(/\n/g, "<br>");

  const html = getModernEmailWrapper(content, {
    title: ACTION_TITLES[action],
    origin,
    ctaText: action === "passwordReset" ? "Passwort jetzt ändern" : "Jetzt bestätigen",
    ctaUrl: authLink
  });

  return await sendMailWithFallback(settings, { from: mailFrom(settings, "auth"), to: email, subject, text, html });
}

/**
 * Shared logic for Purchase Confirmation
 */
async function sendOrderEmailInternal(db, values) {
  const { checkout, origin } = values;
  const snap = await db.collection("settings").doc("purchaseConfirmationMail").get();
  const settings = {
    enabled: true,
    recipientEmail: "entfalta@gmail.com",
    customerEnabled: true,
    ...(snap.exists ? snap.data() : {})
  };

  const central = await loadCentralEmailSettings(db);
  const smtp = hasUsableSmtpSettings(settings) ? { ...central, ...settings } : central;
  if (!hasUsableSmtpSettings(smtp)) throw new Error("SMTP nicht konfiguriert.");

  const productLines = (c) => {
    const lines = [];
    (c.cart || []).forEach(i => lines.push(`${i.title || "Artikel"} x ${Number(i.quantity || 1)} = ${(Number(i.price || 0) * Number(i.quantity || 1)).toFixed(2)} EUR`));
    (c.fees || []).forEach(f => lines.push(`${f.name || "Zusatzkosten"} = ${Number(f.price || 0).toFixed(2)} EUR`));
    (c.discounts || []).forEach(d => lines.push(`${d.code || "Rabatt/Gutschein"} = -${Number(d.amount || d.value || 0).toFixed(2)} EUR`));
    if (Number(c.discountTotal || 0) > 0 && !(c.discounts || []).length) lines.push(`Rabatt/Gutschein = -${Number(c.discountTotal || 0).toFixed(2)} EUR`);
    return lines.join("\n");
  };

  const productTableHtml = (c) => {
    let r = "";
    (c.cart || []).forEach(i => r += `<tr><td style="padding:12px 0; border-bottom:1px solid #eee;"><div style="font-weight:bold;">${htmlFromText(i.title || "Artikel")}</div><div style="font-size:13px; color:#666;">${Number(i.quantity || 1)}x ${Number(i.price || 0).toFixed(2)} EUR</div></td><td align="right" style="padding:12px 0; border-bottom:1px solid #eee; font-weight:bold;">${(Number(i.price || 0) * Number(i.quantity || 1)).toFixed(2)} EUR</td></tr>`);
    (c.fees || []).forEach(f => r += `<tr><td style="padding:10px 0; border-bottom:1px solid #eee; color: #666;">${htmlFromText(f.name || "Zusatzkosten")}</td><td align="right" style="padding:10px 0; border-bottom:1px solid #eee;">${Number(f.price || 0).toFixed(2)} EUR</td></tr>`);
    (c.discounts || []).forEach(d => r += `<tr style="color:#3f6f45;"><td style="padding:10px 0; border-bottom:1px solid #eee;">${htmlFromText(d.code || "Rabatt/Gutschein")}</td><td align="right" style="padding:10px 0; border-bottom:1px solid #eee; font-weight:bold;">-${Number(d.amount || d.value || 0).toFixed(2)} EUR</td></tr>`);
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">${r}<tr><td style="padding:20px 0 0 0; font-size:18px; font-weight:bold;">Gesamtbetrag</td><td align="right" style="padding:20px 0 0 0; font-size:20px; font-weight:bold; color:#3f6f45;">${Number(c.total || 0).toFixed(2)} EUR</td></tr></table>`;
  };

  const applyTemplate = (t, c) => String(t || "").replaceAll("%Bestellnr%", c.orderNumber || "").replaceAll("%Name%", c.customer?.name || "").replaceAll("%Amount%", `${Number(c.total || 0).toFixed(2)} EUR`).replaceAll("%products%", productLines(c)).replaceAll("%InvoiceUrl%", c.stripeInvoiceUrl || "");

  // Send to Admin
  if (settings.enabled !== false) {
    const subject = applyTemplate(settings.subject || "Neue Bestellung %Bestellnr%", checkout);
    const text = applyTemplate(settings.body || "Neue Bestellung...", checkout);
    const html = getModernEmailWrapper(`<h2>Bestell-Benachrichtigung</h2><p>Es ist eine neue Bestellung eingegangen:</p><p><b>Kunde:</b> ${escapeHtml(checkout.customer?.name)} (${escapeHtml(checkout.customer?.email)})</p><p><b>Bestellnr.:</b> ${escapeHtml(checkout.orderNumber)}</p>${productTableHtml(checkout)}`, { title: "Neue Bestellung", origin });
    await sendMailWithFallback(smtp, { from: hasUsableSmtpSettings(settings) ? `${settings.fromName || central.fromName || "Entfalta"} <${settings.fromEmail || central.fromEmail}>` : mailFrom(central, "custom"), to: settings.recipientEmail || "entfalta@gmail.com", subject, text, html }).catch(e => console.warn("Admin mail failed:", e.message));
  }

  // Send to Customer
  const customerEmail = checkout.customer?.email || "";
  if (settings.customerEnabled !== false && customerEmail?.includes("@")) {
    const custSubject = applyTemplate(settings.customerSubject || "Deine Bestellung %Bestellnr%", checkout);
    const rawTemplate = settings.customerBody || "Hallo %Name%,\n\nvielen Dank für deine Bestellung.\n\n%products%";
    const bodyParts = rawTemplate.split("%products%");
    const customerHtml = getModernEmailWrapper(`<div style="font-size: 16px;">${applyTemplate(bodyParts[0] || "", checkout).replace(/\n/g, "<br>")}${productTableHtml(checkout)}${applyTemplate(bodyParts[1] || "", checkout).replace(/\n/g, "<br>")}</div>`, { title: "Bestellbestätigung", origin, ctaText: "Bestellung verfolgen", ctaUrl: `${origin}/konto.html` });
    await sendMailWithFallback(smtp, { from: hasUsableSmtpSettings(settings) ? `${settings.fromName || central.fromName || "Entfalta"} <${settings.fromEmail || central.fromEmail}>` : mailFrom(central, "custom"), to: customerEmail, subject: custSubject, text: applyTemplate(rawTemplate, checkout), html: customerHtml });
  }
}

function isWrongSslVersion(error) {
  const text = `${error?.message || ""} ${error?.stack || ""}`.toLowerCase();
  return text.includes("wrong version number") || text.includes("ssl routines");
}

function friendlySmtpError(error, settings) {
  if (isWrongSslVersion(error)) {
    return `SMTP-SSL passt nicht zu Port ${settings.smtpPort || 587}. Deaktiviere "SSL/TLS direkt verwenden" und nutze meistens Port 587, oder nutze Port 465 mit aktivem SSL/TLS.`;
  }
  const code = error?.code || error?.command || "";
  if (String(code).includes("EAUTH") || String(error?.message || "").toLowerCase().includes("auth")) {
    return "SMTP-Anmeldung fehlgeschlagen. Prüfe SMTP-Benutzername, Passwort und ob beim Anbieter SMTP erlaubt ist.";
  }
  if (String(code).includes("ECONNECTION") || String(code).includes("ETIMEDOUT")) {
    return "SMTP-Verbindung fehlgeschlagen. Prüfe Host, Port und SSL/TLS-Einstellung.";
  }
  return error?.message || "E-Mail konnte nicht gesendet werden.";
}

async function sendMailWithFallback(settings, mail) {
  try {
    console.log(`MAIL: Versuche Versand via ${settings.smtpHost}:${settings.smtpPort} (Secure: ${Boolean(settings.smtpSecure)})`);
    const transporter = nodemailer.createTransport(smtpTransportOptions(settings));
    const result = await transporter.sendMail(mail);
    console.log(`MAIL: Erfolg! MessageID: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error("MAIL: SMTP Fehler:", error.message);
    if (Boolean(settings.smtpSecure) && isWrongSslVersion(error)) {
      console.log("MAIL: SSL Fehler erkannt. Versuche Fallback ohne Secure...");
      const fallbackTransporter = nodemailer.createTransport(smtpTransportOptions(settings, false));
      return await fallbackTransporter.sendMail(mail);
    }
    throw error;
  }
}

module.exports = {
  friendlySmtpError,
  hasUsableSmtpSettings,
  htmlFromText,
  getModernEmailWrapper,
  loadCentralEmailSettings,
  mailFrom,
  senderFor,
  sendMailWithFallback,
  smtpTransportOptions,
  sendAuthEmailInternal,
  sendOrderEmailInternal
};

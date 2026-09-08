const { initAdmin, json } = require("./auth-shared");
const { friendlySmtpError, hasUsableSmtpSettings, htmlFromText, loadCentralEmailSettings, mailFrom, sendMailWithFallback } = require("./mail-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const text = String(payload.text || "").trim();
  if (!to || !to.includes("@")) return json(400, { error: "Empfänger-E-Mail fehlt oder ist ungültig." });
  if (!subject) return json(400, { error: "Bitte einen Betreff eintragen." });
  if (text.length < 2) return json(400, { error: "Bitte einen E-Mail-Text eintragen." });

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(String(payload.idToken || ""));
    const profile = await admin.firestore().collection("users").doc(decoded.uid).get();
    if (!profile.exists || !profile.data().admin) {
      return json(403, { error: "Nur Admins können benutzerdefinierte E-Mails senden." });
    }
  } catch {
    return json(403, { error: "Bitte melde dich erneut als Admin an." });
  }

  const settings = await loadCentralEmailSettings(admin.firestore());
  if (!hasUsableSmtpSettings(settings)) {
    return json(500, { error: "SMTP ist noch nicht vollständig in email-config.html eingerichtet." });
  }

  try {
    await sendMailWithFallback(settings, {
      from: mailFrom(settings, "custom"),
      to,
      subject,
      text,
      html: htmlFromText(text)
    });
  } catch (error) {
    return json(500, { error: friendlySmtpError(error, settings) });
  }

  return json(200, { ok: true });
};

const crypto = require("crypto");
const { initAdmin, json, siteOrigin } = require("./auth-shared");
const { sendAuthEmailInternal } = require("./mail-shared");

const ACTION_TITLES = {
  passwordReset: "Passwort zurücksetzen",
  emailChange: "E-Mail-Adresse ändern",
  emailVerification: "E-Mail-Adresse bestätigen"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  const action = String(payload.action || "");
  const email = String(payload.email || "").trim().toLowerCase();
  const newEmail = String(payload.newEmail || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const uid = String(payload.uid || "").trim();
  if (!ACTION_TITLES[action]) return json(400, { error: "Unbekannte Auth-Aktion." });
  if (!email || !email.includes("@")) return json(400, { error: "E-Mail-Adresse fehlt." });
  if (action === "emailChange" && (!newEmail || !newEmail.includes("@"))) {
    return json(400, { error: "Neue E-Mail-Adresse fehlt." });
  }

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }
  if (action === "emailChange") {
    try {
      const decoded = await admin.auth().verifyIdToken(String(payload.idToken || ""));
      if (decoded.uid !== uid || String(decoded.email || "").toLowerCase() !== email) {
        return json(403, { error: "Dieser E-Mail-Änderungslink gehört nicht zu diesem Nutzer." });
      }
    } catch {
      return json(403, { error: "Bitte melde dich erneut an, bevor du die E-Mail-Adresse änderst." });
    }
  }
  const db = admin.firestore();
  const origin = siteOrigin(event, payload.origin);
  const code = crypto.randomBytes(24).toString("base64url");
  const authLink = `${origin}/auth.html?authCode=${encodeURIComponent(code)}`;
  const expiresAtMs = Date.now() + 14 * 60 * 1000;

  await db.collection("authActionCodes").doc(code).set({
    action,
    email,
    newEmail,
    name,
    uid,
    used: false,
    expiresAtMs,
    createdAtMs: Date.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    await sendAuthEmailInternal(db, { action, email, name, newEmail, authLink, origin });
  } catch (error) {
    return json(500, { error: error.message });
  }

  return json(200, { ok: true, expiresAtMs });
};

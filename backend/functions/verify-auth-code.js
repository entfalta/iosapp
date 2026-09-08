const { authActionSettings, initAdmin, json, siteOrigin } = require("./auth-shared");

function extractAction(link) {
  const parsed = new URL(link);
  return {
    mode: parsed.searchParams.get("mode") || "",
    oobCode: parsed.searchParams.get("oobCode") || ""
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

  const code = String(payload.code || "").trim();
  if (!code) return json(400, { error: "Auth-Code fehlt." });

  let admin;
  try {
    admin = initAdmin();
  } catch (error) {
    return json(500, { error: error.message });
  }

  const db = admin.firestore();
  const ref = db.collection("authActionCodes").doc(code);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: "Dieser Auth-Code wurde nicht gefunden." });
  const record = snap.data();
  if (record.used) return json(410, { error: "Dieser Auth-Code wurde bereits benutzt." });
  if (Date.now() > Number(record.expiresAtMs || 0)) {
    await ref.set({ used: true, expired: true, usedAtMs: Date.now() }, { merge: true });
    return json(410, { error: "Dieser Auth-Code ist abgelaufen. Bitte fordere einen neuen Link an." });
  }

  const origin = siteOrigin(event, payload.origin);
  const settings = authActionSettings(origin);
  let link;
  if (record.action === "passwordReset") {
    link = await admin.auth().generatePasswordResetLink(record.email, settings);
  } else if (record.action === "emailVerification") {
    link = await admin.auth().generateEmailVerificationLink(record.email, settings);
  } else if (record.action === "emailChange") {
    link = await admin.auth().generateVerifyAndChangeEmailLink(record.email, record.newEmail, settings);
  } else {
    return json(400, { error: "Unbekannte Auth-Aktion." });
  }

  const action = extractAction(link);
  if (!action.mode || !action.oobCode) return json(500, { error: "Firebase hat keinen gültigen Action-Link erzeugt." });

  await ref.set({
    used: true,
    usedAtMs: Date.now(),
    usedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return json(200, {
    ok: true,
    action: record.action,
    email: record.email,
    newEmail: record.newEmail || "",
    mode: action.mode,
    oobCode: action.oobCode
  });
};

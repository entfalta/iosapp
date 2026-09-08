const admin = require("firebase-admin");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

function initAdmin() {
  if (admin.apps.length) return admin;

  // Support for split environment variables to bypass Netlify 4KB limit
  const part1 = process.env.FIREBASE_SERVICE_ACCOUNT_P1 || "";
  const part2 = process.env.FIREBASE_SERVICE_ACCOUNT_P2 || "";
  const combined = part1 + part2;

  const raw = combined || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT fehlt in Netlify.");
  }
  let serviceAccount;
  try {
    const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    serviceAccount = JSON.parse(decoded);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON/Base64-JSON.");
  }
  if (serviceAccount.client && serviceAccount.project_info) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT ist eine google-services.json. Netlify braucht den Firebase Admin SDK Service Account mit project_id, client_email und private_key.");
  }
  if (typeof serviceAccount.project_id !== "string" || typeof serviceAccount.client_email !== "string" || typeof serviceAccount.private_key !== "string") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT muss der Firebase Admin SDK Service Account sein und project_id, client_email und private_key enthalten.");
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return admin;
}

function siteOrigin(event, explicitOrigin) {
  if (explicitOrigin) {
    try {
      return new URL(explicitOrigin).origin;
    } catch {}
  }
  const headers = event.headers || {};
  const host = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  const proto = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const configured = String(process.env.URL || process.env.DEPLOY_PRIME_URL || "").trim();
  return configured ? new URL(configured).origin : new URL(`${proto}://${host}`).origin;
}

function authActionSettings(origin) {
  return {
    url: `${origin}/auth.html`,
    handleCodeInApp: false
  };
}

module.exports = {
  authActionSettings,
  initAdmin,
  json,
  siteOrigin
};

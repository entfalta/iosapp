const { initAdmin, json } = require("./auth-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let admin;
  try {
    admin = initAdmin();
    const payload = JSON.parse(event.body || "{}");
    const targetUid = String(payload.uid || "").trim();
    const adminUid = String(payload.adminUid || "").trim();

    if (!targetUid || !adminUid) {
      return json(400, { error: "UIDs fehlen." });
    }

    // Verify requesting user is admin
    const adminDoc = await admin.firestore().collection("users").doc(adminUid).get();
    if (!adminDoc.exists || !adminDoc.data().admin) {
      return json(403, { error: "Nur Admins dürfen Passwörter zurücksetzen." });
    }

    // Reset password to 00000000
    await admin.auth().updateUser(targetUid, {
      password: "00000000"
    });

    // Also log this action in user document
    await admin.firestore().collection("users").doc(targetUid).update({
      passwordResetByAdminAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordResetByAdminUid: adminUid,
      temporaryPasswordSet: true
    });

    return json(200, { ok: true, message: "Passwort wurde auf 00000000 zurückgesetzt." });
  } catch (error) {
    console.error("Admin Password Reset Error:", error);
    return json(500, { error: error.message || "Fehler beim Zurücksetzen des Passworts." });
  }
};

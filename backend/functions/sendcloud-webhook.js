const crypto = require("crypto");
const { initAdmin, json } = require("./auth-shared");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const signature = event.headers["sendcloud-signature"];
    const secretKey = process.env.SENDCLOUD_SECRET_KEY;

    if (!signature || !secretKey) {
        return json(401, { error: "Missing signature or secret key." });
    }

    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(event.body);
    const calculatedSignature = hmac.digest("hex");

    if (signature !== calculatedSignature) {
        return json(403, { error: "Invalid signature." });
    }

    try {
        const { action, parcel } = JSON.parse(event.body);
        if (action !== "parcel_status_changed") return json(200, { ok: true });

        const admin = initAdmin();
        const db = admin.firestore();

        const snap = await db.collection("orders").where("sendcloudParcelId", "==", parcel.id).limit(1).get();
        if (snap.empty) return json(200, { ok: true, message: "Order not found." });

        const doc = snap.docs[0];
        const statusMsg = parcel.status?.message || "Unbekannt";
        const statusId = parcel.status?.id;

        const updateData = {
            shipmentStatus: statusMsg,
            trackingNumber: parcel.tracking_number || "",
            trackingUrl: parcel.tracking_url || "",
            lastStatusUpdateMs: Date.now()
        };

        // Auto-Archiving if delivered
        if (statusId === 3 || statusMsg.toLowerCase().includes("zugestellt")) {
            updateData.archived = true;
            updateData.archivedAtMs = Date.now();
            updateData.fulfillmentStatus = "abgeschickt";
        }

        await doc.ref.update(updateData);
        return json(200, { ok: true });

    } catch (error) {
        return json(500, { error: error.message });
    }
};

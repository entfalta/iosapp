const { initAdmin, json } = require("./auth-shared");

function buildToAddress(customer) {
    const rawStreet = String(customer?.street || "Musterstraße 1").trim();
    const match = rawStreet.match(/^(.+?)\s+(\d+[\w-]*)$/);
    const street = match ? match[1] : rawStreet;
    const houseNum = match ? match[2] : "1";

    return {
        name: String(customer?.name || "Kunde").trim(),
        company_name: "",
        address_line_1: street,
        house_number: houseNum,
        postal_code: String(customer?.zip || "10115").trim(),
        city: String(customer?.city || "Berlin").trim(),
        country_code: "DE",
        email: String(customer?.email || "kunde@entfalta.com").trim(),
        phone_number: "+49123456789"
    };
}

async function createReturn(orderId, orderData) {
    const publicKey = process.env.SENDCLOUD_PUBLIC_KEY;
    const secretKey = process.env.SENDCLOUD_SECRET_KEY;

    if (!publicKey || !secretKey) {
        throw new Error("Sendcloud API Keys fehlen.");
    }

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    const customer = orderData.customer || {};

    const fromAddress = buildToAddress(customer);

    const payload = {
        from_address: fromAddress,
        ship_with: {
            type: "shipping_option_code",
            properties: {
                shipping_option_code: "dhl_de:warenpost"
            }
        },
        order_number: String(orderData.orderNumber || orderId),
        request_label: true
    };

    const response = await fetch("https://panel.sendcloud.sc/api/v3/returns", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        let errMsg = "Sendcloud Return failed.";
        if (Array.isArray(result.errors) && result.errors.length) {
            errMsg = result.errors.map(e => `${e.detail || e.code || e.title}`).join(", ");
        } else if (result.error?.message) {
            errMsg = result.error.message;
        }
        throw new Error(errMsg);
    }

    return result;
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const rawBody = event.body || "{}";
        const payload = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
        const orderId = payload.orderId;

        if (!orderId) {
            return json(400, { error: "Bestell-ID fehlt." });
        }

        const admin = initAdmin();
        const db = admin.firestore();
        const doc = await db.collection("orders").doc(orderId).get();
        if (!doc.exists) return json(404, { error: "Bestellung nicht gefunden." });

        const order = doc.data() || {};
        const orderData = {
            ...(order || {}),
            ...(payload.order || {}),
            customer: payload.customer || order.customer || {},
            items: payload.items || order.items || [],
            shippingMethod: payload.shippingMethod || order.shippingMethod || {},
            orderNumber: payload.order?.orderNumber || order.orderNumber || orderId
        };

        const ret = await createReturn(orderId, orderData);

        await doc.ref.update({
            "returnRequest.sendcloudReturnId": ret.id,
            "returnRequest.labelUrl": ret.label_url || "",
            "returnRequest.status": "label_uploaded",
            "returnRequest.trackingNumber": ret.tracking_number || "",
            "returnRequest.createdAtMs": Date.now(),
            "returnRequest.message": ret.message || "Sendcloud Return angelegt."
        });

        return json(200, {
            ok: true,
            returnId: ret.id,
            trackingNumber: ret.tracking_number || "",
            labelUrl: ret.label_url || "",
            qrCodeUrl: ret.qr_code_url || "",
            message: ret.message || "Return wurde erfolgreich in Sendcloud angelegt."
        });
    } catch (error) {
        console.error("create-sendcloud-return error:", error);
        return json(500, { error: error.message });
    }
};

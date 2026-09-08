const { initAdmin, json } = require("./auth-shared");

async function getSenderAddress(db, auth) {
    // Try fetching official registered sender address from Sendcloud API
    if (auth) {
        try {
            const scRes = await fetch("https://panel.sendcloud.sc/api/v2/user/addresses/sender", {
                headers: { "Authorization": `Basic ${auth}` }
            });
            if (scRes.ok) {
                const scData = await scRes.json();
                const primary = scData.sender_addresses?.[0];
                if (primary && primary.street && primary.postal_code) {
                    return {
                        name: primary.contact_name || primary.company_name || "Lara Arfaoui",
                        company_name: primary.company_name || "Entfalta",
                        address_line_1: primary.street,
                        house_number: String(primary.house_number || "10s"),
                        postal_code: String(primary.postal_code || "23556").trim(),
                        city: String(primary.city || "Lübeck").trim(),
                        country_code: primary.country || "DE",
                        email: primary.email || "entfalta@gmail.com",
                        phone_number: primary.telephone || "+4915731360125"
                    };
                }
            }
        } catch (e) {
            console.warn("Could not fetch Sendcloud sender address dynamically:", e.message);
        }
    }

    // Fallback to real registered address from Sendcloud account
    let emailSettings = {};
    try {
        const snap = await db.collection("settings").doc("emailConfig").get();
        if (snap.exists) emailSettings = snap.data();
    } catch {}

    const street = String(emailSettings.street || process.env.SENDER_STREET || "Richard-Wagner-Straße 10s").trim();
    const match = street.match(/^(.+?)\s+(\d+[\w-]*)$/);

    return {
        name: emailSettings.fromName || process.env.MAIL_FROM_NAME || "Lara Arfaoui",
        company_name: "Entfalta",
        address_line_1: match ? match[1] : "Richard-Wagner-Straße",
        house_number: match ? match[2] : "10s",
        postal_code: String(emailSettings.zip || process.env.SENDER_ZIP || "23556").trim(),
        city: String(emailSettings.city || process.env.SENDER_CITY || "Lübeck").trim(),
        country_code: "DE",
        email: emailSettings.fromEmail || process.env.MAIL_FROM_EMAIL || "entfalta@gmail.com",
        phone_number: "+4915731360125"
    };
}

function buildToAddress(orderData) {
    const customer = orderData?.customer || {};
    const shipping = orderData?.shippingAddress || orderData?.deliveryAddress || {};
    const stripeShipping = orderData?.stripeSession?.shipping_details?.address || orderData?.stripeSession?.customer_details?.address || {};
    const stripeShippingName = orderData?.stripeSession?.shipping_details?.name || orderData?.stripeSession?.customer_details?.name || "";

    const name = String(customer.name || customer.fullName || shipping.name || stripeShippingName || "Kunde").trim();
    const email = String(customer.email || shipping.email || orderData?.stripeSession?.customer_details?.email || "kunde@entfalta.com").trim();

    const rawStreet = String(
        customer.street || customer.address || customer.address_line_1 ||
        shipping.street || shipping.address || shipping.address_line_1 ||
        stripeShipping.line1 || "Musterstraße 1"
    ).trim();

    let houseNumFromLine2 = String(stripeShipping.line2 || customer.houseNumber || shipping.houseNumber || "").trim();
    const match = rawStreet.match(/^(.+?)\s+(\d+[\w-]*)$/);
    const street = match ? match[1] : rawStreet;
    const houseNum = houseNumFromLine2 || (match ? match[2] : "1");

    const zip = String(
        customer.zip || customer.postal_code || customer.postcode || customer.plz ||
        shipping.zip || shipping.postal_code || shipping.postcode || shipping.plz ||
        stripeShipping.postal_code || ""
    ).trim();

    const city = String(
        customer.city || customer.town || customer.ort ||
        shipping.city || shipping.town || shipping.ort ||
        stripeShipping.city || "Berlin"
    ).trim();

    const country = String(
        customer.country || customer.country_code ||
        shipping.country || shipping.country_code ||
        stripeShipping.country || "DE"
    ).trim().toUpperCase();

    return {
        name,
        company_name: String(customer.company || shipping.company || "").trim(),
        address_line_1: street,
        house_number: houseNum,
        postal_code: zip,
        city: city,
        country_code: country.length === 2 ? country : "DE",
        email,
        phone_number: String(customer.phone || shipping.phone || "+49123456789").trim()
    };
}

async function resolveShippingOptionCode(auth, methodId) {
    const raw = String(methodId || "").trim();
    if (!raw) return "dhl_de:warenpost";

    // Direct dictionary map: ONLY ID 2830 for DHL Kleinpaket 0-1kg
    const V2_TO_V3_MAP = {
        "2830": "dhl_de:warenpost",
        "78": "dpd:parcelletter",
        "342": "dhl_de:dhl_paket",
        "343": "dhl_de:dhl_paket",
        "94": "dhl_de:weltpaket",
        "8": "sendcloud:letter"
    };

    if (V2_TO_V3_MAP[raw]) return V2_TO_V3_MAP[raw];
    if (raw.includes(":")) return raw;

    // Call Sendcloud compat API to translate any other numeric ID
    if (!isNaN(Number(raw))) {
        try {
            const compatRes = await fetch("https://panel.sendcloud.sc/api/v3/compat/shipping-options", {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    shipping_method_ids: [Number(raw)]
                })
            });

            if (compatRes.ok) {
                const compatData = await compatRes.json();
                const matched = compatData.data?.[raw]
                    || compatData.data?.[Number(raw)]
                    || compatData.shipping_options?.[0]?.shipping_option_code;

                if (matched) return matched;
            }
        } catch (e) {
            console.warn("Sendcloud compat lookup failed:", e.message);
        }
    }

    return "dhl_de:warenpost";
}

async function buildShipWith(auth, methodId) {
    const code = await resolveShippingOptionCode(auth, methodId);
    return {
        type: "shipping_option_code",
        properties: {
            shipping_option_code: code || "dhl_de:warenpost"
        }
    };
}

async function getSendcloudCredentials(db) {
    let scPublic = (
        process.env.SENDCLOUD_PUBLIC_KEY ||
        process.env.SENDCLOUD_PUBLIC ||
        process.env.SENDCLOUD_KEY ||
        process.env.SENDCLOUD_API_KEY ||
        ""
    ).trim();

    let scSecret = (
        process.env.SENDCLOUD_SECRET_KEY ||
        process.env.SENDCLOUD_SECRET ||
        process.env.SENDCLOUD_API_SECRET ||
        ""
    ).trim();

    if (!scPublic) {
        for (const [key, val] of Object.entries(process.env)) {
            const k = String(key || "").toUpperCase();
            if (k.includes("SENDCLOUD") && (k.includes("PUBLIC") || k.includes("PUB"))) {
                if (val && String(val).trim()) {
                    scPublic = String(val).trim();
                    break;
                }
            }
        }
    }

    if (!scSecret) {
        for (const [key, val] of Object.entries(process.env)) {
            const k = String(key || "").toUpperCase();
            if (k.includes("SENDCLOUD") && (k.includes("SECRET") || k.includes("SEC"))) {
                if (val && String(val).trim()) {
                    scSecret = String(val).trim();
                    break;
                }
            }
        }
    }

    if ((!scPublic || !scSecret) && db) {
        try {
            const snap = await db.collection("settings").doc("sendcloud").get();
            if (snap.exists) {
                const d = snap.data();
                if (!scPublic) scPublic = String(d.publicKey || d.scPublic || d.public || "").trim();
                if (!scSecret) scSecret = String(d.secretKey || d.scSecret || d.secret || "").trim();
            }
        } catch (e) {}
    }

    return { publicKey: scPublic, secretKey: scSecret };
}

async function createParcel(orderId, orderData, db) {
    const { publicKey, secretKey } = await getSendcloudCredentials(db);

    if (!publicKey || !secretKey) {
        throw new Error("Sendcloud API Keys fehlen in der Konfiguration.");
    }

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

    // Check if order has physical items
    const hasPhysical = (orderData.items || []).some(item => item.fulfillment !== "download");
    if (!hasPhysical) return null;

    const fromAddress = await getSenderAddress(db, auth);
    const toAddress = buildToAddress(orderData);
    const methodId = orderData.shippingMethod?.sendcloudMethodId || orderData.shippingMethod?.id;

    const shipWith = await buildShipWith(auth, methodId);

    const payload = {
        from_address: fromAddress,
        to_address: toAddress,
        ship_with: shipWith,
        order_number: String(orderData.orderNumber || orderId),
        apply_shipping_rules: true,
        request_label: true,
        parcels: [
            {
                weight: {
                    value: "0.500",
                    unit: "kg"
                }
            }
        ]
    };

    // Call Sendcloud API v3
    let response = await fetch("https://panel.sendcloud.sc/api/v3/shipments/announce", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    let result = await response.json();

    // Fallback Loop 1: Try valid v3 option codes ("dhl_de:warenpost", "dhl_de:dhl_paket", "dpd:parcelletter")
    if (!response.ok && (result.errors?.some(e => String(e.source?.pointer || "").includes("ship_with") || String(e.detail || "").includes("ShippingOptionCode")) || String(result.error?.message || result.detail || "").includes("ShippingOptionCode"))) {
        const fallbacks = ["dhl_de:warenpost", "dhl_de:dhl_paket", "dpd:parcelletter"];
        for (const fbCode of fallbacks) {
            if (fbCode === payload.ship_with?.properties?.shipping_option_code) continue;
            payload.ship_with = {
                type: "shipping_option_code",
                properties: {
                    shipping_option_code: fbCode
                }
            };
            const fbResponse = await fetch("https://panel.sendcloud.sc/api/v3/shipments/announce", {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const fbResult = await fbResponse.json();
            if (fbResponse.ok) {
                response = fbResponse;
                result = fbResult;
                break;
            }
        }
    }

    // Fallback Loop 2: Omit ship_with completely and rely on Sendcloud merchant panel shipping rules!
    if (!response.ok && (result.errors?.some(e => String(e.source?.pointer || "").includes("ship_with") || String(e.detail || "").includes("ShippingOptionCode")) || String(result.error?.message || result.detail || "").includes("ShippingOptionCode"))) {
        const noShipWithPayload = { ...payload };
        delete noShipWithPayload.ship_with;
        const fbResponse = await fetch("https://panel.sendcloud.sc/api/v3/shipments/announce", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(noShipWithPayload)
        });
        const fbResult = await fbResponse.json();
        if (fbResponse.ok) {
            response = fbResponse;
            result = fbResult;
        }
    }

    if (!response.ok) {
        let errMsg = "Sendcloud Fehler";
        if (Array.isArray(result.errors) && result.errors.length) {
            errMsg = result.errors.map(e => `${e.detail || e.code || e.title} (${e.source?.pointer || ""})`).join(", ");
        } else if (result.error?.message) {
            errMsg = result.error.message;
        } else if (result.message) {
            errMsg = result.message;
        } else {
            errMsg = JSON.stringify(result);
        }
        throw new Error(errMsg);
    }

    const dataObj = result.data || result;
    const firstParcel = dataObj.parcels?.[0] || dataObj.shipment?.parcels?.[0] || dataObj;
    const labelUrl = dataObj.label?.label_printer || dataObj.label?.public_url || firstParcel?.label?.label_printer || firstParcel?.label?.normal_printer?.[0] || firstParcel?.label?.public_url || "";

    return {
        id: dataObj.id || firstParcel.id || orderId,
        tracking_number: firstParcel.tracking_number || dataObj.tracking_number || "",
        tracking_url: firstParcel.tracking_url || dataObj.tracking_url || "",
        label: {
            label_printer: labelUrl,
            normal_printer: [labelUrl]
        }
    };
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const { orderId, force } = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
        const admin = initAdmin();
        const db = admin.firestore();

        const doc = await db.collection("orders").doc(orderId).get();
        if (!doc.exists) return json(404, { error: "Bestellung nicht gefunden." });

        const order = doc.data();
        if (order.sendcloudParcelId && !force) return json(200, { ok: true, message: "Bereits erstellt." });

        const parcel = await createParcel(orderId, order, db);
        if (!parcel) return json(200, { ok: true, message: "Keine physischen Produkte." });

        await doc.ref.update({
            sendcloudParcelId: parcel.id,
            trackingNumber: parcel.tracking_number || "",
            trackingUrl: parcel.tracking_url || "",
            shippingLabelUrl: parcel.label?.label_printer || parcel.label?.normal_printer?.[0] || "",
            shipmentStatus: "Vorbereitet"
        });

        return json(200, { ok: true, parcelId: parcel.id });
    } catch (error) {
        console.error("Parcel Error:", error);
        return json(500, { error: error.message });
    }
};

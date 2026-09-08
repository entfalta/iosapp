const { initAdmin, json } = require("./auth-shared");
const Stripe = require("stripe");

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
        } catch (e) {
            console.warn("Firestore sendcloud check:", e.message);
        }
    }

    return { publicKey: scPublic, secretKey: scSecret };
}

async function getStripeSecretKey(db) {
    let stripeSecret = (
        process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET ||
        process.env.STRIPE_KEY ||
        ""
    ).trim();

    if (!stripeSecret) {
        for (const [key, val] of Object.entries(process.env)) {
            const k = String(key || "").toUpperCase();
            if (k.includes("STRIPE") && (k.includes("SECRET") || k.includes("SEC") || k.includes("KEY"))) {
                if (val && String(val).trim()) {
                    stripeSecret = String(val).trim();
                    break;
                }
            }
        }
    }

    if (!stripeSecret && db) {
        try {
            const snap = await db.collection("settings").doc("stripe").get();
            if (snap.exists) {
                const d = snap.data();
                stripeSecret = String(d.secretKey || d.stripeSecret || d.secret || "").trim();
            }
        } catch (e) {}
    }

    return stripeSecret;
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    const results = {
        firebase: { status: "gray", message: "Pending" },
        stripe: { status: "gray", message: "Pending" },
        sendcloud: { status: "gray", message: "Pending" },
        timestamp: Date.now()
    };

    let admin;
    let db;
    try {
        admin = initAdmin();
        db = admin.firestore();
        await db.collection("settings").doc("website").get();
        results.firebase = { status: "green", message: "APPROVED" };
    } catch (error) {
        results.firebase = { status: "red", message: `DENIED: ${error.message}` };
    }

    try {
        const stripeSecret = await getStripeSecretKey(db);
        if (!stripeSecret) throw new Error("STRIPE_SECRET_KEY fehlt.");
        const stripe = new Stripe(stripeSecret);
        await stripe.balance.retrieve();
        results.stripe = { status: "green", message: "APPROVED" };
    } catch (error) {
        results.stripe = { status: "red", message: `DENIED: ${error.message}` };
    }

    try {
        const { publicKey: scPublic, secretKey: scSecret } = await getSendcloudCredentials(db);
        if (!scPublic || !scSecret) {
            const missing = [];
            if (!scPublic) missing.push("SENDCLOUD_PUBLIC_KEY");
            if (!scSecret) missing.push("SENDCLOUD_SECRET_KEY");
            throw new Error(`${missing.join(" & ")} fehlt.`);
        }

        const auth = Buffer.from(`${scPublic}:${scSecret}`).toString("base64");
        const response = await fetch("https://panel.sendcloud.sc/api/v2/shipping_methods", {
            headers: { "Authorization": `Basic ${auth}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        results.sendcloud = { status: "green", message: "APPROVED" };
    } catch (error) {
        results.sendcloud = { status: "red", message: `DENIED: ${error.message}` };
    }

    return json(200, results);
};

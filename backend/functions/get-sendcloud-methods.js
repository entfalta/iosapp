const { initAdmin, json } = require("./auth-shared");

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const publicKey = process.env.SENDCLOUD_PUBLIC_KEY;
        const secretKey = process.env.SENDCLOUD_SECRET_KEY;

        if (!publicKey || !secretKey) {
            return json(500, { error: "Sendcloud API Keys fehlen in Netlify." });
        }

        const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

        const response = await fetch("https://panel.sendcloud.sc/api/v2/shipping_methods", {
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error?.message || "Failed to fetch Sendcloud methods.");
        }

        // Map to a simpler format for the UI
        const methods = (result.shipping_methods || []).map(m => ({
            id: m.id,
            name: m.name,
            carrier: m.carrier
        }));

        return json(200, { ok: true, methods });

    } catch (error) {
        console.error("Fetch Methods Error:", error);
        return json(500, { error: error.message });
    }
};

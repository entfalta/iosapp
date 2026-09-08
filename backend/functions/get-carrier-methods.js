const { json } = require("./auth-shared");

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    try {
        const payload = JSON.parse(event.body || "{}");
        const carrierSlug = String(payload.carrier || "").toLowerCase();

        const scPublic = process.env.SENDCLOUD_PUBLIC_KEY;
        const scSecret = process.env.SENDCLOUD_SECRET_KEY;
        if (!scPublic || !scSecret) throw new Error("Sendcloud API Keys fehlen.");

        const auth = Buffer.from(`${scPublic}:${scSecret}`).toString("base64");

        let response = await fetch("https://panel.sendcloud.sc/api/v3/shipping_methods", {
            headers: {
                "Authorization": `Basic ${auth}`,
                "Accept": "application/json"
            }
        });

        if (response.status === 404) {
            console.log("SC: v3 not found, falling back to v2...");
            response = await fetch("https://panel.sendcloud.sc/api/v2/shipping_methods", {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Accept": "application/json"
                }
            });
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || `HTTP ${response.status}`);
        }

        const allMethods = result.shipping_methods || [];

        // Find all available carrier codes for debugging
        const availableCarriers = [...new Set(allMethods.map(m => m.carrier?.code || m.carrier))];

        // Flexible matching
        const carrierMethods = allMethods.filter(m => {
            const code = (m.carrier?.code || m.carrier || "").toLowerCase();
            const name = (m.carrier?.name || "").toLowerCase();
            return code.includes(carrierSlug) || carrierSlug.includes(code) || name.includes(carrierSlug);
        });

        // Map IDs and Names
        const shipping = carrierMethods
            .filter(m => m.is_return === false || m.is_return === undefined)
            .map(m => ({ id: m.id, name: m.name }));

        const returns = carrierMethods
            .filter(m => m.is_return === true)
            .map(m => ({ id: m.id, name: m.name }));

        return json(200, { ok: true, shipping, returns, availableCarriers });

    } catch (error) {
        return json(500, { error: error.message });
    }
};

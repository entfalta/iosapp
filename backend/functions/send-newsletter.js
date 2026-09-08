const { initAdmin, json } = require("./auth-shared");
const nodemailer = require("nodemailer");

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const { title, text, image } = JSON.parse(event.body);
        const admin = initAdmin();
        const db = admin.firestore();

        // 1. Get SMTP Settings
        const { loadCentralEmailSettings, sendMailWithFallback, mailFrom } = require("./mail-shared");
        const settings = await loadCentralEmailSettings(db);

        // 2. Get Subscribers
        const subSnap = await db.collection("newsletterSubscriptions").get();
        const subscribers = subSnap.docs.map(doc => doc.data());

        const emailRecipients = subscribers.map(s => s.email).filter(Boolean);
        const pushTokens = subscribers.map(s => s.pushToken).filter(Boolean);

        // 3. Send Emails via SMTP
        if (emailRecipients.length > 0) {
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h1 style="color: #3f6f45;">${title}</h1>
                    ${image ? `<img src="${image}" style="width: 100%; border-radius: 10px; margin-bottom: 20px;">` : ""}
                    <p style="font-size: 16px; line-height: 1.6; color: #333;">${text.replace(/\n/g, "<br>")}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="font-size: 12px; color: #999;">Du erhältst diese Mail, weil du den Entfalta Newsletter abonniert hast.</p>
                </div>
            `;

            await sendMailWithFallback(settings, {
                from: mailFrom(settings),
                bcc: emailRecipients.join(","),
                subject: title,
                html: html
            });
        }

        // 4. Send Push Notifications (FCM)
        if (pushTokens.length > 0) {
            const message = {
                notification: {
                    title: title,
                    body: text.substring(0, 100) + (text.length > 100 ? "..." : "")
                },
                tokens: pushTokens
            };

            // Note: Sending to multiple tokens requires the Firebase Admin SDK Messaging API
            await admin.messaging().sendEachForMulticast(message).catch(e => console.error("Push Error:", e));
        }

        return json(200, { success: true, recipients: emailRecipients.length, pushCount: pushTokens.length });

    } catch (error) {
        console.error("Newsletter Dispatch Error:", error);
        return json(500, { error: error.message });
    }
};

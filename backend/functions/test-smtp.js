const nodemailer = require("nodemailer");
const { json } = require("./auth-shared");
const { smtpTransportOptions } = require("./mail-shared");

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const config = JSON.parse(event.body);

        // Normalize names (handles both 'host' and 'smtpHost')
        const settings = {
            smtpHost: config.host || config.smtpHost,
            smtpPort: config.port || config.smtpPort,
            smtpUser: config.user || config.smtpUser,
            smtpPassword: config.pass || config.smtpPassword || config.password,
            smtpSecure: config.secure !== undefined ? config.secure : config.smtpSecure
        };

        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
            return json(400, { error: "SMTP Host, Benutzer und Passwort werden benötigt." });
        }

        const transporter = nodemailer.createTransport(smtpTransportOptions(settings));

        try {
            await transporter.verify();
            return json(200, { success: true, message: "SMTP-Verbindung erfolgreich!" });
        } catch (verifyError) {
            console.error("SMTP Verify Error:", verifyError);
            return json(200, {
                success: false,
                error: verifyError.message,
                code: verifyError.code,
                command: verifyError.command
            });
        }

    } catch (error) {
        console.error("SMTP Handler Error:", error.message);
        return json(500, { error: error.message });
    }
};

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * Creates a DHL shipping draft (shopping cart) using the Private Shipping API.
 * Uses only the API Key (Client ID) for authentication.
 */
async function createDHLLabel(order) {
  try {
    const apiUrl = clean(process.env.DHL_API_URL);
    const clientId = clean(process.env.DHL_CLIENT_ID || process.env.DHL_SECRET_KEY);

    if (!apiUrl) throw new Error("DHL_API_URL fehlt in Netlify.");
    if (!clientId) throw new Error("DHL_CLIENT_ID fehlt in Netlify.");

    const senderName = clean(process.env.DHL_SENDER_NAME);
    const senderStreet = clean(process.env.DHL_SENDER_STREET);
    const senderZip = clean(process.env.DHL_SENDER_ZIP);
    const senderCity = clean(process.env.DHL_SENDER_CITY);
    const senderEmail = clean(process.env.DHL_SENDER_EMAIL);

    if (!senderName || !senderStreet || !senderZip || !senderCity) {
      throw new Error("Absenderdaten (Name, Street, Zip, City) fehlen in Netlify.");
    }

    const customer = order.customer || {};
    const rawStreet = clean(customer.street);
    const match = rawStreet.match(/^(.+?)\s*(\d+.*)$/);
    const streetName = match ? match[1] : rawStreet;
    const streetNumber = match ? match[2] : "1";

    const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
    const endpoint = baseUrl.includes("/shopping-carts") ? baseUrl : `${baseUrl}/shopping-carts`;

    const payload = {
      items: [{
        product: "V01PAK",
        address: {
          receiver: {
            name1: clean(customer.name),
            street: clean(streetName),
            streetNumber: clean(streetNumber),
            plz: clean(customer.zip),
            city: clean(customer.city),
            email: clean(customer.email),
            country: "DEU"
          },
          sender: {
            name1: senderName,
            street: senderStreet,
            streetNumber: clean(process.env.DHL_SENDER_STREET_NUMBER) || "1",
            plz: senderZip,
            city: senderCity,
            email: senderEmail,
            country: "DEU"
          }
        }
      }]
    };

    console.log(`DHL Request an: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "dhl-api-key": clientId
      },
      body: JSON.stringify(payload)
    });

    const resText = await response.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch (e) {
      data = { rawResponse: resText };
    }

    if (!response.ok) {
      let errorDetail = "";
      if (data.detail) errorDetail = data.detail;
      else if (data.message) errorDetail = data.message;
      else if (Array.isArray(data.items) && data.items[0]?.validationMessages) {
        errorDetail = data.items[0].validationMessages.map(m => m.validationMessage).join(", ");
      } else if (data.rawResponse) {
        errorDetail = data.rawResponse.length > 100 ? data.rawResponse.substring(0, 100) + "..." : data.rawResponse;
      } else {
        errorDetail = JSON.stringify(data);
      }
      throw new Error(`DHL meldet Fehler ${response.status}: ${errorDetail}`);
    }

    return {
      shoppingCartId: data.shoppingCartId || data.id || "",
      entryUrl: data.entryUrl || data.url || ""
    };
  } catch (error) {
    console.error("DHL Error:", error.message);
    throw error;
  }
}

module.exports = {
  clean,
  createDHLLabel
};

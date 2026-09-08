# Entfalta Backend

Hier liegen die Netlify Functions fuer Checkout, E-Mails, Gutscheine und bezahlte Bestellungen.

Netlify nutzt diesen Ordner ueber `netlify.toml`:

```toml
[functions]
  directory = "backend/functions"
```

Die Webseite nutzt `window.BUCHMARKT_BACKEND_BASE_URL` aus `firebase-config.js`.

- Leer (`""`): Functions liegen auf derselben Domain wie die Webseite.
- Eigene URL: Functions liegen auf einem separaten Backend-Deploy, z.B. `https://entfalta-backend.netlify.app`.

Die Android-App nutzt `backend_base_url` in `app/android/app/src/main/res/values/firebase.xml`.

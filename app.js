const sampleCover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#3f6f45"/><stop offset=".5" stop-color="#d77d32"/><stop offset="1" stop-color="#8a5637"/>
      </linearGradient></defs>
      <rect width="600" height="800" fill="#fff4dd"/>
      <path d="M0 120 C120 40 210 180 320 95 C430 10 505 115 600 55 V800 H0Z" fill="url(#g)" opacity=".86"/>
      <rect x="90" y="150" width="420" height="510" rx="18" fill="rgba(255,250,240,.84)" stroke="#8a5637" stroke-width="8"/>
      <text x="300" y="315" text-anchor="middle" font-size="62" font-family="Arial" fill="#2b241f" font-weight="700">Buch</text>
      <text x="300" y="385" text-anchor="middle" font-size="34" font-family="Arial" fill="#3f6f45">Cover</text>
    </svg>
  `);

let auth;
let db;
let storage;
let currentUser = null;
let currentProfile = null;
let authReady = false;
let books = [];
let orders = [];
let customerOrders = [];
let cart = [];
let activeCategory = "all";
let paymentSettings = { fees: [], discounts: [] };
let showArchivedOrders = false;
let coverOptions = [];
let pdfOptions = [];
let productOptions = [];
let previewOptions = [];
let newsletterImageOptions = [];
let newsletterPosts = [];
let appliedDiscounts = { discount: null, voucher: null };
let liveSessions = [];
let showStatsPanel = false;
const STRIPE_PUBLISHABLE_KEY = "";
const STRIPE_CHECKOUT_ENDPOINT = "/.netlify/functions/create-checkout-session";
const CART_STORAGE_KEY = "buchmarkt_cart";
const CHECKOUT_STORAGE_KEY = "buchmarkt_checkout";
const REVIEW_ACCESS_KEY = "buchmarkt_review_access";
const NEWSLETTER_KEY = "buchmarkt_newsletter";
const NEWSLETTER_SEEN_KEY = "buchmarkt_newsletter_seen";
const WISHLIST_KEY = "buchmarkt_wishlist";
const DISCOUNT_STORAGE_KEY = "buchmarkt_discounts";
const LIVE_SESSION_KEY = "buchmarkt_live_session";
const COOKIE_CONSENT_KEY = "entfalta_cookie_consent";
const GA_MEASUREMENT_ID = "G-EVXWLFFWDN";
const ARCHIVE_RETENTION_DAYS = 90;
const postcodeCache = new Map();

function $(selector) {
  return document.querySelector(selector);
}

function formField(form, name) {
  return form.elements.namedItem(name);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function extractGermanPostcode(value) {
  return String(value || "").match(/\b\d{5}\b/)?.[0] || "";
}

function cityPartIsFilled(value, postcode) {
  return String(value || "").replace(postcode, "").trim().length > 1;
}

async function lookupGermanPostcode(postcode) {
  if (!/^\d{5}$/.test(postcode)) return null;
  if (postcodeCache.has(postcode)) return postcodeCache.get(postcode);
  try {
    const response = await fetch(`https://api.zippopotam.us/de/${postcode}`, { cache: "force-cache" });
    if (!response.ok) {
      postcodeCache.set(postcode, null);
      return null;
    }
    const data = await response.json();
    const place = data?.places?.[0]?.["place name"] || "";
    postcodeCache.set(postcode, place || null);
    return place || null;
  } catch {
    return null;
  }
}

async function autofillCityFromPostcode(field, options = {}) {
  if (!field) return;
  const postcode = extractGermanPostcode(field.value);
  field.setCustomValidity("");
  if (!postcode || cityPartIsFilled(field.value, postcode)) return;

  field.setAttribute("aria-busy", "true");
  const city = await lookupGermanPostcode(postcode);
  field.removeAttribute("aria-busy");

  if (city) {
    field.value = `${postcode} ${city}`;
    field.setCustomValidity("");
    field.dispatchEvent(new Event("change", { bubbles: true }));
    if (!options.silent) showToast(`Stadt automatisch ergänzt: ${city}`);
    return;
  }

  field.setCustomValidity("Diese Postleitzahl wurde nicht gefunden.");
  if (!options.silent) showToast("Diese Postleitzahl wurde nicht gefunden.");
}

function streetHasHouseNumber(value) {
  return /\b\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?\b/.test(String(value || ""));
}

function validateStreetField(field, options = {}) {
  if (!field) return true;
  const value = String(field.value || "").trim();
  field.setCustomValidity("");
  if (!value) return !field.required;
  if (streetHasHouseNumber(value)) return true;
  field.setCustomValidity("Bitte gib die Adresse mit Hausnummer ein.");
  if (!options.silent) showToast("Bitte gib die Adresse mit Hausnummer ein.");
  return false;
}

function validateStreetFieldsInForm(form, options = {}) {
  const fields = Array.from(form?.elements || []).filter((field) => field?.name === "street");
  const invalid = fields.find((field) => !validateStreetField(field, { silent: true }));
  if (!invalid) return true;
  invalid.reportValidity();
  if (!options.silent) showToast("Bitte gib die Adresse mit Hausnummer ein.");
  return false;
}

function renderAdminFees() {}

async function loadCoverOptions() {
  try {
    const response = await fetch("covers/list.json", { cache: "no-store" });
    coverOptions = response.ok ? await response.json() : [];
  } catch {
    coverOptions = [];
  }
  renderCoverOptions();
}

function renderCoverOptions(selected = "") {
  const select = $("#coverChoice");
  const preview = $("#coverPreview");
  if (!select) return;
  select.innerHTML = coverOptions.length
    ? coverOptions.map((cover) => `<option value="${escapeHtml(cover.src)}">${escapeHtml(cover.name || cover.src)}</option>`).join("")
    : `<option value="${sampleCover}">Standard-Cover</option>`;
  if (selected) select.value = selected;
  const value = select.value || sampleCover;
  if (preview) {
    preview.src = value;
    preview.classList.remove("hidden");
  }
  renderNewsletterImageOptions();
}

function renderNewsletterImageOptions(selected = "") {
  const select = $("#newsletterImageChoice");
  const preview = $("#newsletterImagePreview");
  if (!select) return;
  const choices = newsletterImageOptions.length ? newsletterImageOptions : [{ name: "Standard-Bild", src: sampleCover }];
  select.innerHTML = choices.map((image) => `<option value="${escapeHtml(image.src)}">${escapeHtml(image.name || image.src)}</option>`).join("");
  if (selected && choices.some((image) => image.src === selected)) select.value = selected;
  const value = select.value || sampleCover;
  if (preview) {
    preview.src = value;
    preview.classList.remove("hidden");
  }
}

function selectedDesignMode() {
  return currentProfile?.designMode === "classic" ? "classic" : "modern";
}

function applyDesignMode() {
  const mode = selectedDesignMode();
  document.body.classList.toggle("design-classic", mode === "classic");
  document.body.classList.toggle("design-modern", mode !== "classic");
  applyPerformanceMode();
}

function shouldUseLightMotion() {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isSmallScreen = window.matchMedia?.("(max-width: 760px)")?.matches;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const lowMemory = memory > 0 && memory <= 4;
  const lowCpu = cores > 0 && cores <= 4;
  return Boolean(prefersReducedMotion || (isSmallScreen && (lowMemory || lowCpu || !memory)));
}

function applyPerformanceMode() {
  if (!document.body) return;
  document.body.classList.toggle("perf-light", shouldUseLightMotion());
}

function firebaseReady() {
  const config = window.BUCHMARKT_FIREBASE_CONFIG;
  return window.firebase && config?.apiKey && !config.apiKey.startsWith("DEINE_");
}

if (firebaseReady()) {
  firebase.initializeApp(window.BUCHMARKT_FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  bootFirebase();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    authReady = true;
    showToast("Firebase ist noch nicht konfiguriert. Trage deine Daten in firebase-config.js ein.");
    renderAll();
  });
}

function bootFirebase() {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    currentProfile = user ? await safeEnsureUserProfile(user) : null;
    authReady = true;
    listenToCustomerOrders(user);
    listenToBooks();
    listenToNewsletter();
    listenToPaymentSettings();
    startLiveSession();
    if (currentProfile?.admin) {
      listenToOrders();
      listenToLiveSessions();
    } else {
      if (listenToOrders.unsubscribe) {
        listenToOrders.unsubscribe();
        listenToOrders.unsubscribe = null;
      }
      if (listenToLiveSessions.unsubscribe) {
        listenToLiveSessions.unsubscribe();
        listenToLiveSessions.unsubscribe = null;
      }
      orders = [];
      liveSessions = [];
    }
    renderAll();
  });
}

async function safeEnsureUserProfile(user, extra = {}) {
  try {
    return await ensureUserProfile(user, extra);
  } catch (error) {
    console.error(error);
    showToast("Konto ist angemeldet, aber Firestore blockiert das Profil. Bitte Firestore aktivieren und Regeln prüfen.");
    return {
      id: user.uid,
      name: extra.name || user.displayName || user.email?.split("@")[0] || "Kunde",
      email: user.email || extra.email || "",
      street: extra.street || "",
      city: extra.city || "",
      admin: false
    };
  }
}

async function ensureUserProfile(user, extra = {}) {
  const isAnonymousGuest = Boolean(user.isAnonymous);
  const userRef = db.collection("users").doc(user.uid);
  const snap = await userRef.get();
  if (snap.exists) {
    const profile = { id: snap.id, ...snap.data() };
    if (!isAnonymousGuest && !profile.admin && await noAdminExists()) {
      await userRef.update({ admin: true, promotedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { ...profile, admin: true };
    }
    return profile;
  }

  const firstUser = (await db.collection("users").limit(1).get()).empty;
  const profile = {
    name: extra.name || user.displayName || user.email?.split("@")[0] || (isAnonymousGuest ? "Gast" : "Kunde"),
    email: user.email || extra.email || "",
    street: extra.street || "",
    city: extra.city || "",
    admin: !isAnonymousGuest && firstUser,
    anonymous: isAnonymousGuest,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await userRef.set(profile, { merge: true });
  return { id: user.uid, ...profile };
}

async function noAdminExists() {
  const adminSnap = await db.collection("users").where("admin", "==", true).limit(1).get();
  return adminSnap.empty;
}

function listenToBooks() {
  if (!db || listenToBooks.unsubscribe) return;
  listenToBooks.unsubscribe = db.collection("books").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    books = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    checkWishlistStockNotifications();
    renderAll();
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function listenToPaymentSettings() {
  if (!db || listenToPaymentSettings.unsubscribe) return;
  listenToPaymentSettings.unsubscribe = db.collection("settings").doc("payment").onSnapshot((snapshot) => {
    paymentSettings = snapshot.exists ? { fees: [], discounts: [], ...snapshot.data() } : { fees: [], discounts: [] };
    renderAdminFees();
    renderAdminDiscounts();
    renderBooks();
    renderCart();
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function listenToOrders() {
  if (!db || listenToOrders.unsubscribe) return;
  listenToOrders.unsubscribe = db.collection("orders").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    cleanupOldArchivedOrders();
    renderAdminBooks();
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function listenToCustomerOrders(user) {
  if (listenToCustomerOrders.unsubscribe) {
    listenToCustomerOrders.unsubscribe();
    listenToCustomerOrders.unsubscribe = null;
  }
  customerOrders = [];
  if (!db || !user) {
    renderAccount();
    return;
  }
  listenToCustomerOrders.unsubscribe = db.collection("orders").where("customer.userId", "==", user.uid).onSnapshot((snapshot) => {
    customerOrders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));
    renderAccount();
  }, (error) => {
    console.error(error);
    customerOrders = [];
    renderAccount();
  });
}

function listenToNewsletter() {
  if (!db || listenToNewsletter.unsubscribe) return;
  listenToNewsletter.unsubscribe = db.collection("newsletterPosts").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    const previousLatest = newsletterPosts[0]?.id || localStorage.getItem(NEWSLETTER_SEEN_KEY);
    newsletterPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderNewsletter();
    notifyNewsletterPost(previousLatest);
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function liveSessionId() {
  const existing = localStorage.getItem(LIVE_SESSION_KEY);
  if (existing) return existing;
  const id = newId();
  localStorage.setItem(LIVE_SESSION_KEY, id);
  return id;
}

function liveCartItems() {
  return cart.map((item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    return {
      bookId: item.bookId,
      title: book?.title || item.title || "Buch",
      quantity: Number(item.quantity || 0),
      price: Number(item.price ?? book?.price ?? 0)
    };
  }).filter((item) => item.quantity > 0);
}

async function updateLiveSession() {
  if (!db) return;
  try {
    await db.collection("liveSessions").doc(liveSessionId()).set({
      userId: currentUser?.uid || null,
      name: currentProfile?.name || currentUser?.email || "Gast",
      email: currentUser?.email || "",
      path: window.location.pathname || "index.html",
      cart: liveCartItems(),
      cartTotal: cartTotalFromItems(cart),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now()
    }, { merge: true });
  } catch (error) {
    console.warn("Live-Statistik konnte nicht gespeichert werden.", error);
  }
}

function scheduleLiveSessionUpdate() {
  window.clearTimeout(scheduleLiveSessionUpdate.timer);
  scheduleLiveSessionUpdate.timer = window.setTimeout(updateLiveSession, 650);
}

function startLiveSession() {
  if (!db) return;
  if (startLiveSession.started) {
    updateLiveSession();
    return;
  }
  startLiveSession.started = true;
  updateLiveSession();
  window.setInterval(updateLiveSession, 30000);
  window.addEventListener("beforeunload", () => {
    try {
      db.collection("liveSessions").doc(liveSessionId()).set({ updatedAtMs: Date.now() - 180000 }, { merge: true });
    } catch {}
  });
}

function listenToLiveSessions() {
  if (!db || listenToLiveSessions.unsubscribe) return;
  listenToLiveSessions.unsubscribe = db.collection("liveSessions").onSnapshot((snapshot) => {
    liveSessions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAdminStats();
  }, (error) => {
    console.error(error);
  });
}

async function createSampleBookOnce() {
  const marker = await db.collection("settings").doc("sample").get();
  if (marker.exists) return;
  await db.collection("books").add({
    title: "Der leise Garten",
    description: "Ein ruhiger Roman über Neuanfang, Familie und einen alten Buchladen.",
    price: 14.9,
    cover: sampleCover,
    category: "Sonstige",
    stock: 48,
    sold: 7,
    lowStockEnabled: true,
    lowStockLimit: 20,
    reviews: [{ id: newId(), name: "Mara", rating: 5, text: "Sehr schön geschrieben und liebevoll verpackt." }],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await db.collection("settings").doc("sample").set({ created: true });
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAdmin() {
  return Boolean(currentProfile?.admin);
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 3500);
}

function analyticsConsentValue() {
  return localStorage.getItem(COOKIE_CONSENT_KEY);
}

function loadGoogleAnalytics() {
  if (window.entfaltaAnalyticsLoaded || analyticsConsentValue() !== "accepted") return;
  window.entfaltaAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

function createCookieBanner() {
  if ($("#cookieConsentOverlay")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="cookieConsentOverlay" class="cookie-consent-overlay hidden" aria-hidden="true"></div>
    <section id="cookieConsentBanner" class="cookie-consent-banner hidden" role="dialog" aria-modal="true" aria-labelledby="cookieConsentTitle">
      <h2 id="cookieConsentTitle">Cookies & Analyse</h2>
      <p>Wir nutzen Google Analytics, um zu sehen, wie die Webseite genutzt wird. Erst wenn du akzeptierst, wird Google Analytics geladen.</p>
      <div class="cookie-consent-actions">
        <button type="button" id="rejectCookies">Ablehnen</button>
        <button type="button" id="acceptCookies">Akzeptieren</button>
      </div>
    </section>
  `);
  $("#acceptCookies")?.addEventListener("click", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    hideCookieBanner();
    loadGoogleAnalytics();
  });
  $("#rejectCookies")?.addEventListener("click", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    hideCookieBanner();
  });
}

function showCookieBanner() {
  createCookieBanner();
  $("#cookieConsentOverlay")?.classList.remove("hidden");
  $("#cookieConsentBanner")?.classList.remove("hidden");
  $("#cookieConsentOverlay")?.setAttribute("aria-hidden", "false");
  document.body.classList.add("cookie-consent-open");
}

function hideCookieBanner() {
  $("#cookieConsentOverlay")?.classList.add("hidden");
  $("#cookieConsentBanner")?.classList.add("hidden");
  $("#cookieConsentOverlay")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cookie-consent-open");
}

function initCookieConsent() {
  createCookieBanner();
  const consent = analyticsConsentValue();
  if (consent === "accepted") {
    hideCookieBanner();
    loadGoogleAnalytics();
    return;
  }
  if (consent === "rejected") {
    hideCookieBanner();
    return;
  }
  showCookieBanner();
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") return "Diese E-Mail ist schon registriert. Bitte einloggen.";
  if (code === "auth/configuration-not-found") return "Firebase Authentication ist für dieses Projekt noch nicht eingerichtet. Öffne Firebase > Authentication > Get started und aktiviere E-Mail/Passwort.";
  if (code === "auth/invalid-email") return "Die E-Mail-Adresse ist ungültig.";
  if (code === "auth/admin-restricted-operation") return "Aktiviere in Firebase Authentication den Anbieter 'Anonym', damit Gäste den Live-Chat nutzen können.";
  if (code === "auth/operation-not-allowed") return "E-Mail/Passwort ist in Firebase Authentication noch nicht aktiviert.";
  if (code === "auth/weak-password") return "Das Passwort ist für Firebase zu schwach.";
  if (code === "auth/popup-closed-by-user") return "Google-Anmeldung wurde geschlossen.";
  if (code === "auth/unauthorized-domain") return "Diese Domain ist in Firebase Authentication noch nicht autorisiert.";
  if (code === "permission-denied" || error?.message?.includes("Missing or insufficient permissions")) {
    return "Firestore blockiert den Zugriff. Prüfe, ob Firestore aktiviert ist und passende Regeln veröffentlicht sind.";
  }
  return error?.message || "Es ist ein Fehler passiert.";
}

function passwordIsStrong(password) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function stockText(stock = 0) {
  if (stock <= 0) return "ausverkauft";
  if (stock <= 5) return "nur noch wenige verfügbar";
  if (stock <= 20) return "ungefähr 20 verfügbar";
  if (stock <= 50) return "ungefähr 50 verfügbar";
  if (stock <= 100) return "ungefähr 100 verfügbar";
  return "über 100 verfügbar";
}

function averageRating(book) {
  if (!book.reviews?.length) return 0;
  return book.reviews.reduce((sum, review) => sum + Number(review.rating), 0) / book.reviews.length;
}

function stars(value) {
  const rounded = Math.round(value);
  return "\u2605\u2605\u2605\u2605\u2605".slice(0, rounded) + "\u2606\u2606\u2606\u2606\u2606".slice(0, 5 - rounded);
}

function getFilteredBooks() {
  const query = $("#searchInput")?.value.trim().toLowerCase() || "";
  const filtered = books.filter((book) => {
    const matchesQuery = `${book.title} ${book.description}`.toLowerCase().includes(query);
    const category = normalizeCategory(book.category);
    const matchesCategory = activeCategory === "all" || category === activeCategory;
    return matchesQuery && matchesCategory;
  });
  const sort = $("#sortSelect")?.value || "new";
  if (sort === "priceLow") filtered.sort((a, b) => a.price - b.price);
  if (sort === "priceHigh") filtered.sort((a, b) => b.price - a.price);
  if (sort === "rating") filtered.sort((a, b) => averageRating(b) - averageRating(a));
  return filtered;
}

function renderBooks() {
  const booksEl = $("#books");
  if (!booksEl) return;
  const filtered = getFilteredBooks();
  booksEl.innerHTML = filtered.length ? filtered.map(bookCardTemplate).join("") : `<p class="panel">Noch keine passenden Bücher gefunden.</p>`;
}

function bookCardTemplate(book) {
  const rating = averageRating(book);
  const category = normalizeCategory(book.category);
  return `
    <article class="book-card">
      <img src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div class="book-body">
        <h2 class="book-title">${escapeHtml(book.title)}</h2>
        <span class="stock-pill">${escapeHtml(category)}</span>
        <span class="stock-pill">${stockText(book.stock)}</span>
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${Number(book.price).toFixed(2)} EUR</span>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-open="${book.id}">Details</button>
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
      </div>
    </article>
  `;
}

function wishlistItems() {
  return readJsonStorage(WISHLIST_KEY, []);
}

function saveWishlist(items) {
  writeJsonStorage(WISHLIST_KEY, items);
}

function isWishlisted(bookId) {
  return wishlistItems().some((item) => item.bookId === bookId);
}

function toggleWishlist(bookId) {
  const items = wishlistItems();
  const existing = items.find((item) => item.bookId === bookId);
  if (existing) {
    saveWishlist(items.filter((item) => item.bookId !== bookId));
    showToast("Vom Wunschzettel entfernt.");
  } else {
    const book = books.find((entry) => entry.id === bookId);
    items.push({ bookId, notifyStock: true, wasOutOfStock: Number(book?.stock || 0) <= 0, createdAt: Date.now() });
    saveWishlist(items);
    showToast("Auf den Wunschzettel gesetzt.");
  }
  renderBooks();
  renderWishlist();
}

function renderWishlist() {
  const list = $("#wishlistList");
  if (!list) return;
  const items = wishlistItems();
  list.innerHTML = items.length ? items.map((item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    return `
      <div class="admin-item">
        <strong>${escapeHtml(book?.title || "Buch")}</strong>
        <p>${book ? stockText(book.stock) : "Nicht mehr gefunden"}</p>
        <label class="checkbox-line">
          <input type="checkbox" data-wishlist-notify="${item.bookId}" ${item.notifyStock ? "checked" : ""}>
          Benachrichtigen, wenn wieder auf Lager
        </label>
        <div class="admin-actions">
          <button type="button" data-open="${item.bookId}">Details</button>
          <button type="button" data-wishlist="${item.bookId}">Entfernen</button>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Dein Wunschzettel ist leer.</p>`;
}

function checkWishlistStockNotifications() {
  if (!("Notification" in window)) return;
  const items = wishlistItems();
  let changed = false;
  for (const item of items) {
    const book = books.find((entry) => entry.id === item.bookId);
    if (!book || !item.notifyStock) continue;
    const inStock = Number(book.stock || 0) > 0;
    if (item.wasOutOfStock && inStock && Notification.permission === "granted") {
      new Notification("Wieder auf Lager", { body: `${book.title} ist wieder verfügbar.`, icon: book.cover || "favicon.png" });
      item.wasOutOfStock = false;
      changed = true;
    }
    if (!inStock && !item.wasOutOfStock) {
      item.wasOutOfStock = true;
      changed = true;
    }
  }
  if (changed) saveWishlist(items);
}

function renderAccount() {
  const box = $("#currentUserBox");
  const adminPanel = $("#adminPanel");
  const adminHint = $("#adminLoginHint");
  setAuthFormsVisible(!currentUser);
  if (!box) {
    if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
    if (adminHint) adminHint.classList.toggle("hidden", isAdmin());
    return;
  }

  if (!currentUser) {
    box.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    if (adminHint) adminHint.classList.remove("hidden");
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="account-header-row">
      <a class="mini-link-button" href="konto.html">Benutzerverwaltung</a>
    </div>
    <strong>${escapeHtml(currentProfile?.name || currentUser.email)}</strong><br>
    ${escapeHtml(currentUser.email || "")}<br>
    ${escapeHtml([currentProfile?.street, currentProfile?.city].filter(Boolean).join(", ") || "Keine Adresse gespeichert")}<br>
    Rolle: ${isAdmin() ? "Admin" : "Kunde"}
    <div class="admin-actions">
      ${isAdmin() ? `<a class="secondary-link" href="admin.html">Admin-Panel</a>` : ""}
      <button type="button" id="logoutButton">Ausloggen</button>
    </div>
    ${renderCustomerOrders()}
  `;
  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
  if (adminHint) adminHint.classList.toggle("hidden", isAdmin());
  renderAdminBooks();
}

function renderCustomerOrders() {
  if (!currentUser) return "";
  const visibleOrders = (customerOrders || []).filter((order) => !order.archived);
  return `
    <section class="customer-orders">
      <h3>Aktuelle Bestellungen</h3>
      <p class="muted">Hinweis: Der angezeigte Status ist eine Orientierung und kann vom echten Versandstatus abweichen.</p>
      ${visibleOrders.length ? visibleOrders.map((order) => `
        <article class="customer-order-card">
          <strong>${escapeHtml(orderDateText(order.createdAt))}</strong>
          <p><b>Status:</b> ${escapeHtml(orderFulfillmentStatus(order))}</p>
          <p><b>${escapeHtml(shippingLine(order))}</b></p>
          <p>${(order.items || []).map((item) => `${escapeHtml(item.title || "Artikel")} (${Number(item.quantity || 1)}x)`).join(", ")}</p>
        </article>
      `).join("") : `<p class="muted">Du hast gerade keine offenen Bestellungen.</p>`}
    </section>
  `;
}

function setAuthFormsVisible(visible) {
  ["#registerForm", "#loginForm"].forEach((selector) => {
    const form = $(selector);
    if (!form) return;
    form.classList.toggle("hidden", !visible);
    form.setAttribute("aria-hidden", visible ? "false" : "true");
  });
}

async function saveOwnProfile(form) {
  if (!firebaseReady() || !currentUser) return showToast("Bitte erst einloggen.");
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const street = String(data.get("street") || "").trim();
  const city = String(data.get("city") || "").trim();
  const designMode = data.get("designMode") === "classic" ? "classic" : "modern";
  const canReceiveSupport = Boolean(currentProfile?.admin || currentProfile?.support);
  const supportNotificationField = form.elements.namedItem("supportNotifications");
  const supportNotifications = supportNotificationField ? data.get("supportNotifications") === "on" : currentProfile?.supportNotifications !== false;
  if (!name) return showToast("Bitte einen Namen eintragen.");

  const profileUpdate = {
    name,
    email: currentUser.email || currentProfile?.email || "",
    street,
    city,
    designMode,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (canReceiveSupport && supportNotificationField) profileUpdate.supportNotifications = supportNotifications;

  await currentUser.updateProfile({ displayName: name });
  await db.collection("users").doc(currentUser.uid).set(profileUpdate, { merge: true });

  currentProfile = {
    ...(currentProfile || {}),
    id: currentUser.uid,
    name,
    email: currentUser.email || currentProfile?.email || "",
    street,
    city,
    designMode,
    ...(canReceiveSupport && supportNotificationField ? { supportNotifications } : {})
  };
  applyDesignMode();
  renderAll();
  prefillCheckoutFromProfile();
  showToast("Benutzerdaten gespeichert.");
}

function renderOwnAccountPage() {
  const page = $("#accountManagementPage");
  if (!page) return;

  if (!currentUser) {
    page.innerHTML = `
      <section class="panel account-page-panel">
        <h1>Benutzerverwaltung</h1>
        <p class="muted">Bitte melde dich an, um deine Adresse und Kontodaten zu bearbeiten.</p>
        <button type="button" id="openAccountLogin">Einloggen oder registrieren</button>
      </section>
    `;
    return;
  }

  page.innerHTML = `
    <section class="panel account-page-panel">
      <div class="account-page-heading">
        <div>
          <h1>Benutzerverwaltung</h1>
          <p class="muted">Hier kannst du deine gespeicherten Kundendaten bearbeiten.</p>
        </div>
        <span class="role-pill">${isAdmin() ? "Admin" : "Kunde"}</span>
      </div>
      <form id="profileManageForm" class="stacked-form profile-manage-form">
        <h2>Meine Daten</h2>
        <label>
          Name
          <input name="name" autocomplete="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || currentUser.displayName || "")}" required>
        </label>
        <label>
          E-Mail
          <input name="email" type="email" autocomplete="email" placeholder="E-Mail" value="${escapeHtml(currentUser.email || currentProfile?.email || "")}" disabled>
        </label>
        <label>
          Adresse
          <input name="street" autocomplete="street-address" placeholder="Adresse" value="${escapeHtml(currentProfile?.street || "")}">
        </label>
        <label>
          PLZ und Ort
          <input name="city" autocomplete="address-level2" placeholder="PLZ und Ort" value="${escapeHtml(currentProfile?.city || "")}">
        </label>
        <label>
          Design
          <select name="designMode">
            <option value="modern" ${selectedDesignMode() === "modern" ? "selected" : ""}>Neues Design</option>
            <option value="classic" ${selectedDesignMode() === "classic" ? "selected" : ""}>Klassisches Design</option>
          </select>
        </label>
        <button type="submit">Daten speichern</button>
      </form>
      <div class="account-tools">
        <button type="button" id="sendOwnPasswordReset">Passwort zurücksetzen</button>
        <button type="button" id="accountPageLogout">Ausloggen</button>
      </div>
    </section>
  `;
}

function renderAdminBooks() {
  const list = $("#adminBookList");
  const orderList = $("#adminOrderList");
  const orderSummary = $("#adminOrderSummary");
  if (!list || !orderList) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    orderList.innerHTML = "";
    if (orderSummary) orderSummary.innerHTML = "";
    return;
  }

  const filteredOrders = showArchivedOrders ? orders : orders.filter((order) => !order.archived);
  const activeCount = orders.filter((order) => !order.archived).length;
  const archivedCount = orders.filter((order) => order.archived).length;
  if (orderSummary) {
    orderSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${activeCount}</strong><span>Offen</span></div>
        <div><strong>${archivedCount}</strong><span>Archiv</span></div>
        <div><strong>${orders.length}</strong><span>Gesamt</span></div>
      </div>
    `;
  }

  list.innerHTML = books.map((book) => `
    <div class="admin-item">
      <strong>${escapeHtml(book.title)}</strong>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Warnung: ${book.lowStockEnabled ? `ab ${book.lowStockLimit}` : "aus"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `).join("");

  orderList.innerHTML = filteredOrders.length ? filteredOrders.map((order) => {
    const archived = Boolean(order.archived);
    return `
      <div class="admin-item">
        <strong>${escapeHtml(order.customer?.name || "")}</strong>
        <p>${escapeHtml(order.customer?.email || "")} | ${escapeHtml(order.customer?.street || "")}, ${escapeHtml(order.customer?.city || "")}</p>
        <p>${(order.items || []).map((item) => `${escapeHtml(item.title)} (${item.quantity})`).join(", ")}</p>
        <p>Status: ${archived ? "Archiviert" : "Aktiv"}</p>
        <div class="admin-actions">
          <button type="button" data-order-archive="${order.id}">${archived ? "Wiederherstellen" : "Archivieren"}</button>
          <button type="button" data-order-delete="${order.id}">Löschen</button>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Noch keine Bestellungen${showArchivedOrders ? " (auch keine archivierten)" : ""}.</p>`;
}

renderAdminBooks = function renderAdminBooks() {
  const list = $("#adminBookList");
  const orderList = $("#adminOrderList");
  const orderSummary = $("#adminOrderSummary");
  if (!list || !orderList) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    orderList.innerHTML = "";
    if (orderSummary) orderSummary.innerHTML = "";
    renderAdminStats();
    return;
  }

  const visibleOrders = showArchivedOrders ? orders : orders.filter((order) => !order.archived);
  const activeCount = orders.filter((order) => !order.archived).length;
  const archivedCount = orders.filter((order) => order.archived).length;
  if (orderSummary) {
    orderSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${activeCount}</strong><span>Offen</span></div>
        <div><strong>${archivedCount}</strong><span>Archiv</span></div>
        <div><strong>${orders.length}</strong><span>Gesamt</span></div>
      </div>
    `;
  }

  list.innerHTML = books.map((book) => `
    <div class="admin-item">
      <strong>${escapeHtml(book.title)}</strong>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Warnung: ${book.lowStockEnabled ? `ab ${book.lowStockLimit}` : "aus"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `).join("");

  orderList.innerHTML = visibleOrders.length ? visibleOrders.map((order) => {
    const archived = Boolean(order.archived);
    return `
      <div class="admin-item">
        <strong>${escapeHtml(order.customer?.name || "")}</strong>
        <p>${escapeHtml(order.customer?.email || "")}</p>
        <p>${escapeHtml(order.customer?.street || "")}, ${escapeHtml(order.customer?.city || "")}</p>
        <p>${(order.items || []).map((item) => `${escapeHtml(item.title)} (${item.quantity})`).join(", ")}</p>
        <p>Status: ${archived ? "Archiviert" : "Offen"}${archived ? " | wird nach 90 Tagen gelöscht" : ""}</p>
        <div class="admin-actions">
          <button type="button" data-order-complete="${order.id}" ${archived ? "disabled" : ""}>Fertig markieren</button>
          <button type="button" data-order-archive="${order.id}">${archived ? "Wiederherstellen" : "Ins Archiv"}</button>
          <button type="button" data-order-delete="${order.id}">Löschen</button>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Noch keine Bestellungen${showArchivedOrders ? " im Archiv" : ""}.</p>`;
};

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  return Date.parse(value) || 0;
}

function publishedDateText(value) {
  const timestamp = timestampToMs(value);
  if (!timestamp) return "Veröffentlicht: Datum nicht verfügbar";
  return `Veröffentlicht: ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(timestamp))}`;
}

function orderDateText(value) {
  const timestamp = timestampToMs(value);
  if (!timestamp) return "Bestelldatum: nicht verfuegbar";
  return `Bestellt am: ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp))}`;
}

function orderFulfillmentStatus(order) {
  const status = order?.fulfillmentStatus || order?.shippingStatus || "";
  return ["wird vorbereitet", "in bearbeitung", "abgeschickt"].includes(status) ? status : "wird vorbereitet";
}

function shippingCarrierName(order) {
  const carrier = order?.shippingCarrier || "";
  if (carrier === "Weitere") return order?.shippingCarrierCustom || "Weitere";
  return carrier;
}

function shippingLine(order) {
  const carrier = shippingCarrierName(order);
  const tracking = order?.trackingNumber || "";
  if (!carrier && !tracking) return "Noch keine Sendungsnummer";
  if (carrier && tracking) return `Versand durch ${carrier}: ${tracking}`;
  if (carrier) return `Versand durch ${carrier}`;
  return `Sendungsnummer: ${tracking}`;
}

async function cleanupOldArchivedOrders() {
  if (!isAdmin() || !db) return;
  const maxAge = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const oldOrders = orders.filter((order) => order.archived && timestampToMs(order.archivedAt) && Date.now() - timestampToMs(order.archivedAt) > maxAge);
  await Promise.all(oldOrders.map((order) => db.collection("orders").doc(order.id).delete()));
}

function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${Number(book.price).toFixed(2)} EUR</p>
            <div class="quantity-row">
              <button type="button" data-qty-minus="${book.id}">-</button>
              <button type="button" data-qty-plus="${book.id}" ${item.quantity >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-remove-cart="${book.id}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountDetails.map((entry) => `
        <div class="cart-item">
          <strong>${escapeHtml(entry.discount.kind === "voucher" ? "Gutschein" : "Rabattcode")} ${escapeHtml(entry.discount.code)}</strong>
          <p>-${entry.amount.toFixed(2)} EUR</p>
        </div>
      `).join("")}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Rabatt/Gutschein</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
}

function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        <form class="stacked-form" id="reviewForm">
          <h3>Bewertung schreiben</h3>
          <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
          <select name="rating" required>
            <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
          </select>
          <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
          <button type="submit">Bewertung speichern</button>
        </form>
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm").addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
}

function reviewTemplate(bookId, review) {
  return `
    <div class="review-item">
      <strong>${escapeHtml(review.name)}</strong>
      <span class="stars">${stars(Number(review.rating))}</span>
      <p>${escapeHtml(review.text)}</p>
      ${isAdmin() ? `<button type="button" data-delete-review="${bookId}:${review.id}">Rezension löschen</button>` : ""}
    </div>
  `;
}

async function submitReview(event, bookId) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const text = data.get("text").trim();
  if (text.length < 10) return showToast("Die Bewertungsbeschreibung braucht mindestens 10 Zeichen.");
  const book = books.find((entry) => entry.id === bookId);
  const reviews = [{ id: newId(), name: data.get("name").trim(), rating: Number(data.get("rating")), text }, ...(book.reviews || [])];
  await db.collection("books").doc(bookId).update({ reviews });
  openBook(bookId);
  showToast("Bewertung gespeichert.");
}

function rememberReviewAccess(orderItems) {
  const access = readJsonStorage(REVIEW_ACCESS_KEY, []);
  const now = Date.now();
  for (const item of orderItems) {
    access.push({ bookId: item.bookId, boughtAt: now, userId: currentUser?.uid || null });
  }
  writeJsonStorage(REVIEW_ACCESS_KEY, access);
}

function canReviewBook(bookId) {
  const access = readJsonStorage(REVIEW_ACCESS_KEY, []);
  return access.some((entry) => {
    const sameBook = entry.bookId === bookId;
    const sameUser = !entry.userId || !currentUser || entry.userId === currentUser.uid;
    return sameBook && sameUser;
  });
}

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  const mayReview = canReviewBook(book.id);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${mayReview ? `
          <form class="stacked-form" id="reviewForm">
            <h3>Bewertung schreiben</h3>
            <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
            <select name="rating" required>
              <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
            </select>
            <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
            <button type="submit">Bewertung speichern</button>
          </form>
        ` : `<p class="muted">Bewertungen sind nur nach einem Kauf möglich.</p>`}
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

submitReview = async function submitReview(event, bookId) {
  event.preventDefault();
  if (!canReviewBook(bookId)) return showToast("Du kannst dieses Buch nur nach einem Kauf bewerten.");
  const data = new FormData(event.currentTarget);
  const text = data.get("text").trim();
  if (text.length < 10) return showToast("Die Bewertungsbeschreibung braucht mindestens 10 Zeichen.");
  const book = books.find((entry) => entry.id === bookId);
  const reviews = [{ id: newId(), name: data.get("name").trim(), rating: Number(data.get("rating")), text }, ...(book.reviews || [])];
  await db.collection("books").doc(bookId).update({ reviews });
  openBook(bookId);
  showToast("Bewertung gespeichert.");
};

function addToCart(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  if (!book || book.stock <= 0) return;
  const item = cart.find((entry) => entry.bookId === bookId);
  if (item) {
    if (item.quantity >= book.stock) return showToast("Mehr sind aktuell nicht auf Lager.");
    item.quantity += 1;
  } else {
    cart.push({ bookId, quantity: 1 });
  }
  renderCart();
  showToast("Buch wurde in den Warenkorb gelegt.");
}

function updateCartQuantity(bookId, delta) {
  const item = cart.find((entry) => entry.bookId === bookId);
  const book = books.find((entry) => entry.id === bookId);
  if (!item || !book) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter((entry) => entry.bookId !== bookId);
  if (item.quantity > book.stock) item.quantity = book.stock;
  renderCart();
}

async function uploadCover(file, bookId) {
  if (!storage) throw new Error("Firebase Storage ist nicht verfügbar.");
  const ref = storage.ref().child(`covers/${bookId}/${Date.now()}-${file.name}`);
  await withTimeout(ref.put(file), 12000, "Cover-Upload dauert zu lange.");
  return withTimeout(ref.getDownloadURL(), 8000, "Cover-URL dauert zu lange.");
}

async function updateCoverAfterSave(file, id) {
  if (!file) return;
  try {
    const cover = await uploadCover(file, id);
    await withTimeout(
      db.collection("books").doc(id).update({
        cover,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }),
      10000,
      "Cover konnte nicht in Firestore gespeichert werden."
    );
    showToast("Cover wurde hochgeladen.");
  } catch (error) {
    console.error(error);
    showToast("Buch ist gespeichert, aber das Cover konnte nicht hochgeladen werden.");
  }
}

async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Bücher speichern.");
  const form = event.currentTarget;
  const saveButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = data.get("description").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");
  const coverInput = formField(form, "cover");
  const idInput = formField(form, "id");
  const file = coverInput?.files?.[0] || null;
  if (file && data.get("coverLicense") !== "on") {
    return showToast("Bitte bestätige, dass das Coverbild CC0 oder freigegeben ist.");
  }
  const existing = books.find((book) => book.id === id);
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: data.get("title").trim(),
      description,
      category: normalizeCategory(data.get("category")),
      price: Number(data.get("price")),
      cover: existing?.cover || sampleCover,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Internet, Firestore und Regeln.");
    form.reset();
    idInput.value = "";
    $("#cancelEdit")?.classList.add("hidden");
    showToast("Buch gespeichert.");
    updateCoverAfterSave(file, id);
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Buch speichern";
    }
  }
}

function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  if (!book) return;
  const form = $("#bookForm");
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title;
  formField(form, "description").value = book.description;
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "price").value = book.price;
  formField(form, "stock").value = book.stock;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  $("#cancelEdit").classList.remove("hidden");
  location.hash = "";
}

submitBook = async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Bücher speichern.");
  const form = event.currentTarget;
  const saveButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = data.get("description").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");
  const existing = books.find((book) => book.id === id);
  const cover = data.get("coverChoice") || existing?.cover || sampleCover;

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: data.get("title").trim(),
      description,
      category: normalizeCategory(data.get("category")),
      price: Number(data.get("price")),
      cover,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Internet, Firestore und Regeln.");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    renderCoverOptions();
    showToast("Buch gespeichert und veröffentlicht.");
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Buch speichern";
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  if (!book) return;
  const form = $("#bookForm");
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title;
  formField(form, "description").value = book.description;
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "price").value = book.price;
  formField(form, "stock").value = book.stock;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  renderCoverOptions(book.cover || "");
  $("#cancelEdit")?.classList.remove("hidden");
};

async function checkout(event) {
  event.preventDefault();
  if (!cart.length) return showToast("Der Warenkorb ist leer.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const orderItems = [];

  await db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const item of cart) {
      const ref = db.collection("books").doc(item.bookId);
      const snap = await transaction.get(ref);
      if (!snap.exists || item.quantity > Number(snap.data().stock || 0)) throw new Error("stock");
      snapshots.push({ item, ref, book: { id: snap.id, ...snap.data() } });
    }
    for (const entry of snapshots) {
      const stock = Number(entry.book.stock || 0) - entry.item.quantity;
      const sold = Number(entry.book.sold || 0) + entry.item.quantity;
      transaction.update(entry.ref, { stock, sold });
      orderItems.push({ bookId: entry.book.id, title: entry.book.title, quantity: entry.item.quantity, price: entry.book.price });
      maybeNotifyLowStock({ ...entry.book, stock });
    }
    transaction.set(db.collection("orders").doc(), {
      customer: {
        name: data.get("name"),
        email: data.get("email"),
        street: data.get("street"),
        city: data.get("city"),
        userId: currentUser?.uid || null
      },
      items: orderItems,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  rememberReviewAccess(orderItems);
  cart = [];
  form.reset();
  renderCart();
  showToast("Bestellung gespeichert. Bestand wurde aktualisiert.");
}

function maybeNotifyLowStock(book) {
  if (!book.lowStockEnabled || book.stock > book.lowStockLimit) return;
  const message = `Lagerwarnung: "${book.title}" hat nur noch ${book.stock} Stück.`;
  showToast(message);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Entfalta Lagerwarnung", { body: message });
  } else if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") new Notification("Entfalta Lagerwarnung", { body: message });
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCategory(category) {
  const value = String(category || "Sonstige");
  if (value === "Aufklaerung") return "Aufklärung";
  return value;
}

function renderLegalFromHash() {
  document.querySelectorAll(".legal-page").forEach((section) => section.classList.add("hidden"));
  if (!location.hash) return;
  const section = document.querySelector(location.hash);
  if (section?.classList.contains("legal-page")) section.classList.remove("hidden");
}

function renderAdminHeaderLink() {
  const header = $(".site-header");
  const nav = header?.querySelector(".main-nav");
  const accountButton = nav?.querySelector("#accountButton");
  if (!nav) return;
  let link = nav.querySelector("#adminHeaderLink");
  if (!isAdmin()) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("a");
    link.id = "adminHeaderLink";
    link.className = "admin-header-link";
    link.href = "admin.html";
    link.textContent = "Admin";
    if (accountButton) accountButton.insertAdjacentElement("beforebegin", link);
    else nav.appendChild(link);
  }
}

function initMobileHeaderAutoHide() {
  const header = $(".site-header");
  if (!header) return;
  const mobile = window.matchMedia("(max-width: 760px)");
  let lastY = window.scrollY;

  const updateHeader = () => {
    if (!mobile.matches) {
      header.classList.remove("is-hidden-mobile");
      lastY = window.scrollY;
      return;
    }
    const currentY = window.scrollY;
    const scrollingDown = currentY > lastY;
    const modalOpen = Boolean(document.querySelector(".modal:not(.hidden), .cart-drawer:not(.hidden)"));
    if (modalOpen || currentY < 72 || !scrollingDown) {
      header.classList.remove("is-hidden-mobile");
    } else if (currentY > 120) {
      header.classList.add("is-hidden-mobile");
    }
    lastY = Math.max(currentY, 0);
  };

  window.addEventListener("scroll", updateHeader, { passive: true });
  mobile.addEventListener?.("change", updateHeader);
  updateHeader();
}

function initPageScrollIndicator() {
  if ($("#pageScrollIndicator")) return;
  const indicator = document.createElement("div");
  indicator.id = "pageScrollIndicator";
  indicator.className = "page-scroll-indicator";
  document.body.appendChild(indicator);

  const update = () => {
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    const modalOpen = Boolean(document.querySelector(".modal:not(.hidden)"));
    const cartOpen = Boolean($("#cartDrawer") && !$("#cartDrawer").classList.contains("hidden"));
    document.body.classList.toggle("has-modal-open", modalOpen);
    document.body.classList.toggle("has-cart-open", cartOpen);
    if (scrollMax <= 8 || modalOpen || cartOpen) {
      indicator.classList.remove("is-visible");
      return;
    }
    const visibleRatio = window.innerHeight / document.documentElement.scrollHeight;
    const height = Math.max(34, Math.min(96, window.innerHeight * visibleRatio));
    const track = window.innerHeight - height - 24;
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollMax));
    indicator.style.height = `${height}px`;
    indicator.style.transform = `translateY(${Math.round(progress * track)}px)`;
    indicator.classList.add("is-visible");
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  window.setInterval(update, 800);
}

function renderAll() {
  applyDesignMode();
  renderAdminHeaderLink();
  renderBooks();
  renderAccount();
  renderOwnAccountPage();
  renderCart();
  renderNewsletter();
  renderWishlist();
}

function prefillCheckoutFromProfile() {
  const form = $("#checkoutForm");
  if (!form || !currentUser) return;
  const values = {
    name: currentProfile?.name || currentUser.displayName || "",
    email: currentProfile?.email || currentUser.email || "",
    street: currentProfile?.street || "",
    city: currentProfile?.city || ""
  };
  for (const [name, value] of Object.entries(values)) {
    const field = formField(form, name);
    if (field && value && !field.value) field.value = value;
  }
}

function newsletterSubscribed() {
  return readJsonStorage(NEWSLETTER_KEY, { subscribed: false }).subscribed === true;
}

function unsubscribeNewsletter() {
  localStorage.removeItem(NEWSLETTER_KEY);
  localStorage.removeItem(NEWSLETTER_SEEN_KEY);
  renderNewsletter();
  showToast("Newsletter abbestellt.");
}

function renderNewsletter() {
  const list = $("#newsletterPosts");
  const adminPanel = $("#newsletterAdminPanel");
  const subscribeButton = $("#newsletterSubscribe");
  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
  if (subscribeButton) subscribeButton.textContent = newsletterSubscribed() ? "Newsletter abbestellen" : "Newsletter abonnieren";
  if (!list) return;
  list.innerHTML = newsletterPosts.length ? newsletterPosts.map((post) => `
    <article class="newsletter-card">
      <img src="${post.image || sampleCover}" alt="">
      <div>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.text)}</p>
      </div>
    </article>
  `).join("") : `<p class="panel">Noch keine Newsletter-Posts.</p>`;
}

function notifyNewsletterPost(previousLatest) {
  if (!newsletterSubscribed() || !newsletterPosts.length || !("Notification" in window)) return;
  const latest = newsletterPosts[0];
  if (!previousLatest || previousLatest === latest.id) {
    localStorage.setItem(NEWSLETTER_SEEN_KEY, latest.id);
    return;
  }
  if (Notification.permission === "granted") {
    new Notification(latest.title || "Neuer Newsletter", {
      body: latest.text || "Es gibt einen neuen Newsletter-Post.",
      icon: latest.image || "favicon.png"
    });
    localStorage.setItem(NEWSLETTER_SEEN_KEY, latest.id);
  }
}

async function subscribeNewsletter() {
  if (newsletterSubscribed()) return unsubscribeNewsletter();
  if (!("Notification" in window)) return showToast("Dieser Browser unterstützt keine Benachrichtigungen.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return showToast("Benachrichtigungen wurden nicht erlaubt.");
  writeJsonStorage(NEWSLETTER_KEY, { subscribed: true, subscribedAt: Date.now() });
  if (newsletterPosts[0]) localStorage.setItem(NEWSLETTER_SEEN_KEY, newsletterPosts[0].id);
  renderNewsletter();
  showToast("Newsletter abonniert.");
}

async function submitNewsletterPost(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Newsletter posten.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = data.get("title").trim();
  const text = data.get("text").trim();
  if (text.length < 10) return showToast("Der Newsletter-Text braucht mindestens 10 Zeichen.");
  await db.collection("newsletterPosts").add({
    title,
    text,
    image: data.get("image") || sampleCover,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    authorId: currentUser?.uid || null
  });
  form.reset();
  renderNewsletterImageOptions();
  showToast("Newsletter-Post veröffentlicht.");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.category) {
    event.preventDefault();
    activeCategory = target.dataset.category;
    document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item.dataset.category === activeCategory));
    renderBooks();
    $("#books")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (target.dataset.open) openBook(target.dataset.open);
  if (target.dataset.add) addToCart(target.dataset.add, "default", buyQuantityValue(target.dataset.add, "default"));
  if (target.dataset.wishlist) toggleWishlist(target.dataset.wishlist);
  if (target.dataset.edit) editBook(target.dataset.edit);
  if (target.dataset.delete && isAdmin() && confirm("Dieses Buch wirklich löschen?")) {
    await db.collection("books").doc(target.dataset.delete).delete();
    return;
  }
  if (target.dataset.deleteReview && isAdmin()) {
    const [bookId, reviewId] = target.dataset.deleteReview.split(":");
    const book = books.find((entry) => entry.id === bookId);
    const reviews = (book.reviews || []).filter((review) => review.id !== reviewId);
    await db.collection("books").doc(bookId).update({ reviews });
    openBook(bookId);
  }
  if (target.dataset.orderDelete && isAdmin() && confirm("Diese Bestellung wirklich löschen?")) {
    await db.collection("orders").doc(target.dataset.orderDelete).delete();
    showToast("Bestellung gelöscht.");
    renderAdminBooks();
    return;
  }
  if (target.dataset.orderArchive && isAdmin()) {
    const order = orders.find((entry) => entry.id === target.dataset.orderArchive);
    if (order) {
      const archived = Boolean(order.archived);
      await db.collection("orders").doc(order.id).update({ archived: !archived });
      showToast(archived ? "Bestellung wiederhergestellt." : "Bestellung archiviert.");
      renderAdminBooks();
    }
  }
  if (target.dataset.qtyMinus) updateCartQuantity(target.dataset.qtyMinus, -1);
  if (target.dataset.qtyPlus) updateCartQuantity(target.dataset.qtyPlus, 1);
  if (target.dataset.removeCart) {
    cart = cart.filter((item) => item.bookId !== target.dataset.removeCart);
    renderCart();
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!target?.dataset?.wishlistNotify) return;
  const items = wishlistItems();
  const item = items.find((entry) => entry.bookId === target.dataset.wishlistNotify);
  if (!item) return;
  item.notifyStock = target.checked;
  if (target.checked && "Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  saveWishlist(items);
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.orderComplete && !target.dataset.orderArchive) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (target.dataset.orderComplete) {
    await db.collection("orders").doc(target.dataset.orderComplete).update({
      archived: true,
      status: "done",
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      archivedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("Bestellung als fertig markiert und archiviert.");
    return;
  }

  const order = orders.find((entry) => entry.id === target.dataset.orderArchive);
  if (!order) return;
  const archived = Boolean(order.archived);
  await db.collection("orders").doc(order.id).update({
    archived: !archived,
    status: archived ? "open" : "done",
    archivedAt: archived ? null : firebase.firestore.FieldValue.serverTimestamp()
  });
  showToast(archived ? "Bestellung wiederhergestellt." : "Bestellung archiviert.");
}, true);

document.addEventListener("DOMContentLoaded", () => {
  initCookieConsent();
  applyPerformanceMode();
  window.addEventListener("resize", applyPerformanceMode, { passive: true });
  initMobileHeaderAutoHide();
  initPageScrollIndicator();
  loadCoverOptions();
  $("#registerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady()) return showToast("Firebase fehlt noch.");
    const data = new FormData(event.currentTarget);
    const email = data.get("email").trim().toLowerCase();
    const password = data.get("password");
    if (!passwordIsStrong(password)) return showToast("Passwort: mindestens 8 Zeichen, groß/klein, Zahl und Sonderzeichen.");
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName: data.get("name").trim() });
      currentUser = result.user;
      currentProfile = await safeEnsureUserProfile(result.user, {
        name: data.get("name").trim(),
        street: data.get("street").trim(),
        city: data.get("city").trim()
      });
      event.currentTarget.reset();
      renderAll();
      showToast(currentProfile.admin ? "Konto erstellt. Du bist Admin." : "Konto erstellt.");
    } catch (error) {
      showToast(authErrorMessage(error));
    }
  });

  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady()) return showToast("Firebase fehlt noch.");
    const data = new FormData(event.currentTarget);
    try {
      await auth.signInWithEmailAndPassword(data.get("email").trim().toLowerCase(), data.get("password"));
      showToast("Eingeloggt.");
    } catch (error) {
      showToast(authErrorMessage(error));
    }
  });

  $("#googleLogin")?.addEventListener("click", async () => {
    if (!firebaseReady()) return showToast("Firebase fehlt noch.");
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
      showToast("Mit Google angemeldet.");
    } catch (error) {
      showToast(authErrorMessage(error));
    }
  });

  $("#bookForm")?.addEventListener("submit", submitBook);
  $("#newsletterForm")?.addEventListener("submit", submitNewsletterPost);
  $("#newsletterSubscribe")?.addEventListener("click", subscribeNewsletter);
  $("#coverChoice")?.addEventListener("change", () => renderCoverOptions($("#coverChoice").value));
  $("#newsletterImageChoice")?.addEventListener("change", () => renderNewsletterImageOptions($("#newsletterImageChoice").value));
  $("#checkoutForm")?.addEventListener("submit", checkout);
  formField($("#checkoutForm") || document.createElement("form"), "discountCode")?.addEventListener("input", () => {
    appliedDiscounts.discount = null;
    renderCart();
  });
  formField($("#checkoutForm") || document.createElement("form"), "voucherCode")?.addEventListener("input", () => {
    appliedDiscounts.voucher = null;
    renderCart();
  });
  $("#searchInput")?.addEventListener("input", renderBooks);
  $("#sortSelect")?.addEventListener("change", renderBooks);
  $("#cartButton")?.addEventListener("click", () => {
    $("#cartDrawer")?.classList.remove("hidden");
    prefillCheckoutFromProfile();
    renderCustomerSupportWidget();
  });
  $("#closeCart")?.addEventListener("click", () => {
    $("#cartDrawer")?.classList.add("hidden");
    renderCustomerSupportWidget();
  });
  $("#closeModal")?.addEventListener("click", () => $("#bookModal")?.classList.add("hidden"));
  $("#accountButton")?.addEventListener("click", () => $("#authModal")?.classList.toggle("hidden"));
  $("#closeAuth")?.addEventListener("click", () => $("#authModal")?.classList.add("hidden"));
  $("#cancelEdit")?.addEventListener("click", () => {
    const form = $("#bookForm");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit").classList.add("hidden");
  });
  $("#toggleArchivedOrders")?.addEventListener("click", () => {
    showArchivedOrders = !showArchivedOrders;
    $("#toggleArchivedOrders").textContent = showArchivedOrders ? "Archivierte ausblenden" : "Archivierte anzeigen";
    renderAdminBooks();
  });
  document.addEventListener("click", async (event) => {
    if (event.target.id === "logoutButton" && auth) await auth.signOut();
    if (event.target.id === "accountPageLogout" && auth) {
      await auth.signOut();
      showToast("Ausgeloggt.");
    }
    if (event.target.id === "openAccountLogin") {
      $("#authModal")?.classList.remove("hidden");
    }
    if (event.target.id === "sendOwnPasswordReset") {
      if (!auth || !currentUser?.email) return showToast("Keine E-Mail-Adresse gefunden.");
      await auth.sendPasswordResetEmail(currentUser.email);
      showToast("Passwort-Link wurde per E-Mail gesendet.");
    }
    if (event.target.id === "resetStatsButton") {
      await resetAdminStatistics();
    }
  });
  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "profileManageForm") return;
    event.preventDefault();
    try {
      await saveOwnProfile(event.target);
    } catch (error) {
      showToast(error.message || "Benutzerdaten konnten nicht gespeichert werden.");
    }
  });
  document.addEventListener("submit", (event) => {
    if (!event.target?.elements?.street) return;
    if (validateStreetFieldsInForm(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("input", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "city") return;
    field.setCustomValidity("");
    if (/^\s*\d{5}\s*$/.test(field.value)) autofillCityFromPostcode(field);
  });
  document.addEventListener("input", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "street") return;
    validateStreetField(field, { silent: true });
  });
  document.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "city") return;
    autofillCityFromPostcode(field);
  });
  document.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "street") return;
    validateStreetField(field);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-check-code]");
    if (!button) return;
    event.preventDefault();
    checkCartCode(button.dataset.checkCode);
  });
  document.querySelector('[data-category="all"]')?.classList.add("active");
  completeStripeCheckoutReturn();
  renderAll();
});

async function completeStripeCheckoutReturn() {
  const status = $("#stripeSuccessStatus");
  if (!status || !new URLSearchParams(window.location.search).has("checkout")) return;
  const checkoutData = readJsonStorage(CHECKOUT_STORAGE_KEY, null);
  if (!checkoutData?.cart?.length) {
    status.textContent = "Keine gespeicherten Checkout-Daten gefunden.";
    return;
  }
  status.textContent = "Bestellung wird gespeichert...";
  try {
    await createOrderFromCheckout(checkoutData);
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    localStorage.removeItem(CART_STORAGE_KEY);
    cart = [];
    status.textContent = "Danke. Deine Bestellung wurde gespeichert.";
  } catch (error) {
    console.error(error);
    status.textContent = "Zahlung war erfolgreich, aber die Bestellung konnte nicht gespeichert werden. Bitte kontaktiere den Support.";
  }
}

// Final stabilized overrides for cover selection, order archive, and review access.
// These run after the older handlers above and keep the current static Firebase setup usable.
function getLocalPurchaseKeys() {
  return readJsonStorage(REVIEW_ACCESS_KEY, []);
}

function setLocalPurchaseKeys(keys) {
  writeJsonStorage(REVIEW_ACCESS_KEY, keys);
}

function rememberPurchasedBooks(items) {
  const now = Date.now();
  const keys = getLocalPurchaseKeys();
  for (const item of items || []) {
    keys.push({
      bookId: item.bookId,
      boughtAt: now,
      userId: currentUser?.uid || null
    });
  }
  setLocalPurchaseKeys(keys);
}

function mayReviewBook(bookId) {
  return getLocalPurchaseKeys().some((entry) => {
    const sameBook = entry.bookId === bookId;
    const sameUser = entry.userId ? currentUser?.uid === entry.userId : true;
    return sameBook && sameUser;
  });
}

renderCoverOptions = function renderCoverOptions(selected = "") {
  const select = $("#coverChoice");
  const preview = $("#coverPreview");
  if (!select) return;
  const choices = coverOptions.length ? coverOptions : [{ name: "Standard-Cover", src: sampleCover }];
  select.innerHTML = choices.map((cover) => {
    return `<option value="${escapeHtml(cover.src)}">${escapeHtml(cover.name || cover.src)}</option>`;
  }).join("");
  if (selected && choices.some((cover) => cover.src === selected)) select.value = selected;
  const value = select.value || sampleCover;
  if (preview) {
    preview.src = value;
    preview.classList.remove("hidden");
  }
};

submitBook = async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Bücher speichern.");

  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = String(data.get("description") || "").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");

  const existing = books.find((book) => book.id === id);
  const cover = data.get("coverChoice") || existing?.cover || sampleCover;
  const saveButton = form.querySelector('button[type="submit"]');

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: String(data.get("title") || "").trim(),
      description,
      category: normalizeCategory(data.get("category")),
      price: Number(data.get("price")),
      cover,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Firestore und Regeln.");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    renderCoverOptions();
    showToast("Buch gespeichert und im Shop veröffentlicht.");
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Buch speichern";
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const form = $("#bookForm");
  if (!book || !form) return;
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title || "";
  formField(form, "description").value = book.description || "";
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "price").value = book.price || "";
  formField(form, "stock").value = book.stock || 0;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  renderCoverOptions(book.cover || "");
  $("#cancelEdit")?.classList.remove("hidden");
};

function orderIsPaid(order) {
  return Boolean(
    order?.stripeSessionId ||
    order?.status === "paid" ||
    order?.status === "paid-needs-stock-check" ||
    ["stripe-paid", "stripe-ready", "test-local"].includes(order?.paymentMode)
  );
}

function orderItemKind(item) {
  return item?.fulfillment === "download" ? "Download" : "Gedruckt";
}

function isDownloadOnlyOrder(order) {
  const items = order?.items || [];
  return items.length > 0 && items.every((item) => item.fulfillment === "download");
}

function orderKindLabel(order) {
  const items = order?.items || [];
  if (!items.length) return "Unbekannt";
  if (items.every((item) => item.fulfillment === "download")) return "Download";
  if (items.every((item) => item.fulfillment !== "download")) return "Gedruckt";
  return "Gemischt";
}

function renderAdminOrderCard(order) {
  const address = [order.customer?.street, order.customer?.city].filter(Boolean).join(", ");
  const total = Number(order.total || 0).toFixed(2);
  const fulfillmentStatus = orderFulfillmentStatus(order);
  const carrier = order.shippingCarrier || "";
  return `
    <div class="admin-item order-card">
      <strong>Name: ${escapeHtml(order.customer?.name || "Unbekannt")}</strong>
      <p><b>${escapeHtml(orderDateText(order.createdAt))}</b></p>
      <p><b>E-Mail:</b> ${escapeHtml(order.customer?.email || "Keine E-Mail")}</p>
      <p><b>Adresse:</b> ${escapeHtml(address || "Keine Adresse")}</p>
      <p><b>Bezahlt:</b> ${orderIsPaid(order) ? "Ja" : "Nein"} | <b>Betrag:</b> ${total} EUR</p>
      <p><b>Bestellung:</b> ${orderKindLabel(order)}</p>
      <div class="order-detail-list">
        ${(order.items || []).map((item) => `
          <p>
            <b>${escapeHtml(item.title || "Artikel")}</b>
            ${Number(item.quantity || 1)} x
            ${escapeHtml(item.fulfillmentLabel || itemFulfillmentLabel(item.fulfillment || "default"))}
            <span>${orderItemKind(item)}</span>
            ${item.fulfillment === "download" ? `<span class="download-status ${item.downloaded ? "downloaded" : "pending"}">${item.downloaded ? "Download: heruntergeladen" : "Download: noch nicht heruntergeladen"}</span>` : ""}
          </p>
        `).join("") || `<p class="muted">Keine Artikel gespeichert.</p>`}
      </div>
      <p><b>Status:</b> ${order.archived ? "Archiviert" : "Offen"}${order.archived ? " | wird nach 90 Tagen gelöscht" : ""}</p>
      <div class="order-shipping-form" data-order-shipping="${order.id}">
        <label>
          Bestellstatus
          <select name="fulfillmentStatus">
            <option value="wird vorbereitet" ${fulfillmentStatus === "wird vorbereitet" ? "selected" : ""}>wird vorbereitet</option>
            <option value="in bearbeitung" ${fulfillmentStatus === "in bearbeitung" ? "selected" : ""}>in bearbeitung</option>
            <option value="abgeschickt" ${fulfillmentStatus === "abgeschickt" ? "selected" : ""}>abgeschickt</option>
          </select>
        </label>
        <label>
          Versanddienst
          <select name="shippingCarrier">
            <option value="" ${!carrier ? "selected" : ""}>Noch nicht ausgewaehlt</option>
            <option value="DHL" ${carrier === "DHL" ? "selected" : ""}>DHL</option>
            <option value="Hermes" ${carrier === "Hermes" ? "selected" : ""}>Hermes</option>
            <option value="GLS" ${carrier === "GLS" ? "selected" : ""}>GLS</option>
            <option value="Weitere" ${carrier === "Weitere" ? "selected" : ""}>Weitere</option>
          </select>
        </label>
        <label>
          Eigener Versanddienst
          <input name="shippingCarrierCustom" value="${escapeHtml(order.shippingCarrierCustom || "")}" placeholder="Nur bei Weitere">
        </label>
        <label>
          Sendungsnummer
          <input name="trackingNumber" value="${escapeHtml(order.trackingNumber || "")}" placeholder="z.B. 000000000">
        </label>
        <button type="button" data-order-shipping-save="${order.id}">Status / Versand speichern</button>
      </div>
      <div class="admin-actions">
        ${order.archived ? `<button type="button" data-order-restore="${order.id}">Wiederherstellen</button>` : `<button type="button" data-order-complete="${order.id}">Fertig markieren</button>`}
        <button type="button" data-order-delete="${order.id}">Löschen</button>
      </div>
    </div>
  `;
}

function renderAdminOrderGroup(title, groupOrders, emptyText, collapsed = false) {
  const content = groupOrders.length ? groupOrders.map(renderAdminOrderCard).join("") : `<p class="muted">${escapeHtml(emptyText)}</p>`;
  if (collapsed) {
    return `
      <details class="order-group order-group-collapsible">
        <summary>
          <span>${escapeHtml(title)}</span>
          <strong>${groupOrders.length}</strong>
        </summary>
        <div class="order-group-content">
          ${content}
        </div>
      </details>
    `;
  }
  return `
    <section class="order-group">
      <h3>${escapeHtml(title)} <span>(${groupOrders.length})</span></h3>
      ${content}
    </section>
  `;
}

async function saveOrderShipping(orderId) {
  if (!db || !isAdmin()) return showToast("Nur Admins koennen Bestellungen bearbeiten.");
  const box = document.querySelector(`[data-order-shipping="${CSS.escape(orderId)}"]`);
  if (!box) return;
  const fulfillmentStatus = box.querySelector('[name="fulfillmentStatus"]')?.value || "wird vorbereitet";
  const shippingCarrier = box.querySelector('[name="shippingCarrier"]')?.value || "";
  const shippingCarrierCustom = String(box.querySelector('[name="shippingCarrierCustom"]')?.value || "").trim();
  const trackingNumber = String(box.querySelector('[name="trackingNumber"]')?.value || "").trim();
  await db.collection("orders").doc(orderId).set({
    fulfillmentStatus,
    shippingCarrier,
    shippingCarrierCustom: shippingCarrier === "Weitere" ? shippingCarrierCustom : "",
    trackingNumber,
    shippingUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  showToast("Bestellstatus und Versand gespeichert.");
}

renderAdminBooks = function renderAdminBooks() {
  const list = $("#adminBookList");
  const orderList = $("#adminOrderList");
  const orderSummary = $("#adminOrderSummary");
  if (!list || !orderList) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    orderList.innerHTML = "";
    if (orderSummary) orderSummary.innerHTML = "";
    return;
  }

  const visibleOrders = showArchivedOrders ? orders.filter((order) => order.archived) : orders.filter((order) => !order.archived);
  const openCount = orders.filter((order) => !order.archived).length;
  const archivedCount = orders.filter((order) => order.archived).length;
  if (orderSummary) {
    orderSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${openCount}</strong><span>Offen</span></div>
        <div><strong>${archivedCount}</strong><span>Archiv</span></div>
        <div><strong>${orders.length}</strong><span>Gesamt</span></div>
      </div>
    `;
  }

  list.innerHTML = books.map((book) => `
    <div class="admin-item">
      <strong>${escapeHtml(book.title)}</strong>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Warnung: ${book.lowStockEnabled ? `ab ${book.lowStockLimit}` : "aus"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `).join("");

  orderList.innerHTML = visibleOrders.length ? visibleOrders.map((order) => `
    <div class="admin-item">
      <strong>${escapeHtml(order.customer?.name || "")}</strong>
      <p>${escapeHtml(order.customer?.email || "")}</p>
      <p>${escapeHtml(order.customer?.street || "")}, ${escapeHtml(order.customer?.city || "")}</p>
      <p>${(order.items || []).map((item) => `${escapeHtml(item.title)} (${item.quantity})`).join(", ")}</p>
        <p>Status: ${order.archived ? "Archiviert" : "Offen"}${order.archived ? " | wird nach 90 Tagen gelöscht" : ""}</p>
      <div class="admin-actions">
        ${order.archived ? `<button type="button" data-order-restore="${order.id}">Wiederherstellen</button>` : `<button type="button" data-order-complete="${order.id}">Fertig markieren</button>`}
        <button type="button" data-order-delete="${order.id}">Löschen</button>
      </div>
    </div>
  `).join("") : `<p class="muted">Keine ${showArchivedOrders ? "archivierten" : "offenen"} Bestellungen.</p>`;
  renderAdminStats();
};

async function finalizeOrder(orderId) {
  await db.collection("orders").doc(orderId).update({
    archived: true,
    status: "done",
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    archivedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showToast("Bestellung als fertig markiert und archiviert.");
}

async function restoreOrder(orderId) {
  await db.collection("orders").doc(orderId).update({
    archived: false,
    status: "open",
    archivedAt: null
  });
  showToast("Bestellung wiederhergestellt.");
}

async function deleteOldArchivedOrders() {
  if (!db || !isAdmin()) return;
  const maxAge = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const oldOrders = orders.filter((order) => order.archived && timestampToMs(order.archivedAt) && Date.now() - timestampToMs(order.archivedAt) > maxAge);
  await Promise.all(oldOrders.map((order) => db.collection("orders").doc(order.id).delete()));
}

cleanupOldArchivedOrders = deleteOldArchivedOrders;

function activeLiveSessions() {
  const cutoff = Date.now() - 120000;
  return liveSessions.filter((session) => {
    const seen = timestampToMs(session.lastSeen) || Number(session.updatedAtMs || 0);
    return seen >= cutoff;
  });
}

function soldByBookFromOrders() {
  const sold = new Map();
  for (const order of orders) {
    const totals = orderMoneyTotals(order);
    const itemRevenuePool = Math.min(totals.itemSubtotal, totals.paidTotal);
    for (const item of order.items || []) {
      const key = item.bookId || item.title || "unknown";
      const current = sold.get(key) || { title: item.title || "Buch", quantity: 0, revenue: 0 };
      const lineSubtotal = Number(item.price || 0) * Number(item.quantity || 0);
      const revenueShare = totals.itemSubtotal > 0 ? itemRevenuePool * (lineSubtotal / totals.itemSubtotal) : 0;
      current.quantity += Number(item.quantity || 0);
      current.revenue += revenueShare;
      sold.set(key, current);
    }
  }
  return [...sold.values()].sort((a, b) => b.quantity - a.quantity);
}

function orderMoneyTotals(order) {
  const itemSubtotal = (order.items || []).reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 0);
  }, 0);
  const feeTotal = (order.fees || []).reduce((sum, fee) => sum + Number(fee.price || 0), 0);
  const discountTotal = Number(order.discountTotal || 0);
  const calculatedTotal = Math.max(0, itemSubtotal + feeTotal - discountTotal);
  const hasStoredTotal = order.total !== undefined && order.total !== null && order.total !== "";
  const paidTotal = hasStoredTotal ? Math.max(0, Number(order.total || 0)) : calculatedTotal;
  return { itemSubtotal, feeTotal, discountTotal, paidTotal };
}

function averageShopRating() {
  const reviews = books.flatMap((book) => book.reviews || []);
  if (!reviews.length) return { value: 0, count: 0 };
  const value = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  return { value, count: reviews.length };
}

async function resetAdminStatistics() {
  if (!db || !isAdmin()) return showToast("Nur Admins können Statistiken zurücksetzen.");
  const warning1 = confirm("Warnung 1/3: Statistiken wirklich zurücksetzen? Bestellungen werden gelöscht und Verkäufe auf 0 gesetzt. Zusatzkosten bleiben erhalten.");
  if (!warning1) return;
  const warning2 = confirm("Warnung 2/3: Dadurch werden Umsatz, verkaufte Bücher und Bestellzahlen zurückgesetzt. Zusatzkosten und Shop-Rabatt bleiben erhalten. Fortfahren?");
  if (!warning2) return;
  const warning3 = confirm("Warnung 3/3: Letzte Chance. Statistik-Reset endgültig ausführen?");
  if (!warning3) return;

  const batch = db.batch();
  orders.forEach((order) => batch.delete(db.collection("orders").doc(order.id)));
  books.forEach((book) => batch.update(db.collection("books").doc(book.id), { sold: 0 }));
  await batch.commit();
  showToast("Statistiken wurden zurückgesetzt.");
  renderAdminStats();
}

function renderStatsResetButton() {
  const stats = $("#adminStats");
  if (!stats || !isAdmin() || stats.querySelector("#resetStatsButton")) return;
  const box = document.createElement("div");
  box.className = "stats-reset-box";
  box.innerHTML = `
    <button type="button" id="resetStatsButton">Statistiken zurücksetzen</button>
    <p class="muted">Setzt Verkäufe und Umsatz zurück. Lagerbestand, Produkte und Nutzer bleiben erhalten.</p>
  `;
  stats.appendChild(box);
}

function renderAdminStats() {
  const stats = $("#adminStats");
  const liveCarts = $("#adminLiveCarts");
  const panel = $("#adminStatsPanel");
  const button = $("#toggleStats");
  if (panel) panel.classList.toggle("hidden", !showStatsPanel);
  if (button) button.textContent = showStatsPanel ? "Statistiken ausblenden" : "Statistiken anzeigen";
  if (!stats || !liveCarts) return;
  if (!isAdmin()) {
    stats.innerHTML = "";
    liveCarts.innerHTML = "";
    return;
  }

  const activeSessions = activeLiveSessions();
  const sessionsWithCart = activeSessions.filter((session) => (session.cart || []).length);
  const soldBooks = soldByBookFromOrders();
  const totalSold = soldBooks.reduce((sum, item) => sum + item.quantity, 0) || books.reduce((sum, book) => sum + Number(book.sold || 0), 0);
  const topBook = soldBooks[0] || [...books].sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))[0];
  const revenue = orders.reduce((sum, order) => sum + orderMoneyTotals(order).paidTotal, 0);
  const discountsGiven = orders.reduce((sum, order) => sum + orderMoneyTotals(order).discountTotal, 0);
  const openOrders = orders.filter((order) => !order.archived).length;
  const lowStock = books.filter((book) => Number(book.stock || 0) <= Number(book.lowStockLimit || 5)).length;
  const rating = averageShopRating();
  const cartValue = sessionsWithCart.reduce((sum, session) => sum + Number(session.cartTotal || 0), 0);
  const activeCodes = currentShopDiscount().enabled ? 1 : 0;

  stats.innerHTML = `
    <div class="summary-grid stats-grid">
      <div><strong>${totalSold}</strong><span>Artikel verkauft</span></div>
      <div><strong>${activeSessions.length}</strong><span>gerade live</span></div>
      <div><strong>${sessionsWithCart.length}</strong><span>mit Warenkorb</span></div>
      <div><strong>${topBook ? escapeHtml(topBook.title) : "-"}</strong><span>Beliebtester Artikel</span></div>
      <div><strong>${revenue.toFixed(2)} EUR</strong><span>Eingenommen</span></div>
      <div><strong>${discountsGiven.toFixed(2)} EUR</strong><span>Rabatte/Gutscheine abgezogen</span></div>
      <div><strong>${openOrders}</strong><span>Offene Bestellungen</span></div>
      <div><strong>${lowStock}</strong><span>Niedriger Lagerbestand</span></div>
      <div><strong>${rating.count ? rating.value.toFixed(1) : "-"}</strong><span>Ø Bewertung (${rating.count})</span></div>
      <div><strong>${activeCodes ? shopDiscountLabel() : "-"}</strong><span>Shop-Rabatt</span></div>
      <div><strong>${cartValue.toFixed(2)} EUR</strong><span>Live-Warenkorbwert</span></div>
    </div>
    <div class="admin-list stats-list">
      ${soldBooks.slice(0, 6).map((item) => `
        <div class="admin-item">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${item.quantity} verkauft | ${item.revenue.toFixed(2)} EUR Umsatz</p>
        </div>
      `).join("") || `<p class="muted">Noch keine verkauften Bücher.</p>`}
    </div>
  `;

  liveCarts.innerHTML = sessionsWithCart.length ? sessionsWithCart.map((session) => `
    <div class="admin-item">
      <strong>${escapeHtml(session.name || "Gast")}</strong>
      <p>${escapeHtml(session.email || "Gast/ohne Login")} | ${Number(session.cartTotal || 0).toFixed(2)} EUR im Warenkorb</p>
      <p>${(session.cart || []).map((item) => `${escapeHtml(item.title)} (${Number(item.quantity || 0)})`).join(", ")}</p>
    </div>
  `).join("") : `<p class="muted">Gerade hat niemand sichtbare Artikel im Warenkorb.</p>`;
  renderStatsResetButton();
}

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${allowed ? `
          <form class="stacked-form" id="reviewForm">
            <h3>Bewertung schreiben</h3>
            <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
            <select name="rating" required>
              <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
            </select>
            <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
            <button type="submit">Bewertung speichern</button>
          </form>
        ` : `<p class="muted">Bewertungen sind nur nach einem Kauf auf diesem Gerät möglich.</p>`}
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

submitReview = async function submitReview(event, bookId) {
  event.preventDefault();
  if (!mayReviewBook(bookId)) return showToast("Bewerten geht nur nach Kauf.");
  const data = new FormData(event.currentTarget);
  const text = String(data.get("text") || "").trim();
  if (text.length < 10) return showToast("Die Bewertungsbeschreibung braucht mindestens 10 Zeichen.");
  const book = books.find((entry) => entry.id === bookId);
  const reviews = [{ id: newId(), name: data.get("name").trim(), rating: Number(data.get("rating")), text }, ...(book.reviews || [])];
  await db.collection("books").doc(bookId).update({ reviews });
  openBook(bookId);
  showToast("Bewertung gespeichert.");
};

function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      return {
        ...item,
        title: book?.title || "Buch",
        price: Number(book?.price || 0)
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    customerKey: customerDiscountKey(),
    createdAt: Date.now()
  };
}

function cartTotalFromItems(items) {
  return (items || []).reduce((sum, item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    const price = Number(item.price ?? book?.price ?? 0);
    return sum + price * Number(item.quantity || 0);
  }, 0);
}

function activeFees() {
  return normalizedFees().filter((fee) => !fee.disabled);
}

function feesTotal() {
  return activeFees().reduce((sum, fee) => sum + Number(fee.price || 0), 0);
}

function checkoutTotal(items) {
  return discountSummary(items).total;
}

async function createOrderFromCheckout(checkout) {
  const orderItems = [];
  await db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const item of checkout.cart || []) {
      const ref = db.collection("books").doc(item.bookId);
      const snap = await transaction.get(ref);
      if (!snap.exists || item.quantity > Number(snap.data().stock || 0)) throw new Error("stock");
      snapshots.push({ item, ref, book: { id: snap.id, ...snap.data() } });
    }
    for (const entry of snapshots) {
      const stock = Number(entry.book.stock || 0) - entry.item.quantity;
      const sold = Number(entry.book.sold || 0) + entry.item.quantity;
      transaction.update(entry.ref, { stock, sold });
      orderItems.push({ bookId: entry.book.id, title: entry.book.title, quantity: entry.item.quantity, price: entry.book.price });
      maybeNotifyLowStock({ ...entry.book, stock });
    }
    transaction.set(db.collection("orders").doc(), {
      customer: checkout.customer,
      items: orderItems,
      fees: checkout.fees || activeFees(),
      discounts: checkout.discounts || [],
      discountTotal: Number(checkout.discountTotal || 0),
      total: checkout.total !== undefined && checkout.total !== null ? Number(checkout.total) : checkoutTotal(checkout.cart),
      archived: false,
      status: "open",
      paymentMode: STRIPE_PUBLISHABLE_KEY ? "stripe-ready" : "test-local",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  if (checkout.discounts?.length) {
    const discounts = normalizedDiscounts();
    for (const usedDiscount of checkout.discounts) {
      const discount = discounts.find((entry) => entry.id === usedDiscount.id);
      if (!discount) continue;
      discount.used += 1;
      if (discount.singleUsePerCustomer && checkout.customerKey && !discount.usedBy.includes(checkout.customerKey)) {
        discount.usedBy.push(checkout.customerKey);
      }
    }
    await saveDiscounts(discounts);
  }
  rememberPurchasedBooks(orderItems);
}

async function startStripeCheckout(checkoutData) {
  const response = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutData)
  });
  if (!response.ok) throw new Error("stripe-checkout");
  const data = await response.json();
  if (!data.url) throw new Error("stripe-checkout");
  window.location.href = data.url;
}

checkout = async function checkout(event) {
  event.preventDefault();
  if (!cart.length) return showToast("Der Warenkorb ist leer.");
  const form = event.currentTarget;
  const discountCode = formField(form, "discountCode")?.value || "";
  const voucherCode = formField(form, "voucherCode")?.value || "";
  if (discountCode.trim() && !checkedCodeMatches("discount", discountCode)) {
    return showToast("Bitte prüfe den Rabattcode zuerst.");
  }
  if (voucherCode.trim() && !checkedCodeMatches("voucher", voucherCode)) {
    return showToast("Bitte prüfe den Gutscheincode zuerst.");
  }
  writeJsonStorage(CART_STORAGE_KEY, cart);
  const checkoutData = buildCheckoutPayload(form);
  writeJsonStorage(CHECKOUT_STORAGE_KEY, checkoutData);
  try {
    await startStripeCheckout(checkoutData);
  } catch (error) {
    console.error(error);
    showToast("Stripe Checkout ist noch nicht verbunden. Prüfe Netlify Function und STRIPE_SECRET_KEY.");
  }
};

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.orderComplete && !target.dataset.orderRestore) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (target.dataset.orderComplete) await finalizeOrder(target.dataset.orderComplete);
  if (target.dataset.orderRestore) await restoreOrder(target.dataset.orderRestore);
}, true);

renderNewsletter = function renderNewsletter() {
  const list = $("#newsletterPosts");
  const adminPanel = $("#newsletterAdminPanel");
  const subscribeButton = $("#newsletterSubscribe");
  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
  if (subscribeButton) subscribeButton.textContent = newsletterSubscribed() ? "Newsletter deabonnieren" : "Newsletter abonnieren";
  if (!list) return;

  const visiblePosts = isAdmin() ? newsletterPosts : newsletterPosts.filter((post) => !post.hidden);
  list.innerHTML = visiblePosts.length ? visiblePosts.map((post) => `
    <article class="newsletter-card ${post.hidden ? "is-hidden-post" : ""}">
      <img src="${post.image || sampleCover}" alt="">
      <div>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.text)}</p>
        ${post.hidden ? `<p class="muted">Dieser Post ist für Kunden ausgeblendet.</p>` : ""}
        ${isAdmin() ? `
          <div class="admin-actions">
            <button type="button" data-newsletter-toggle="${post.id}">${post.hidden ? "Wieder sichtbar machen" : "Unsichtbar machen"}</button>
            <button type="button" data-newsletter-delete="${post.id}">Für alle löschen</button>
          </div>
        ` : ""}
      </div>
    </article>
  `).join("") : `<p class="panel">Noch keine sichtbaren Newsletter-Posts.</p>`;
};

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.newsletterToggle && !target.dataset.newsletterDelete) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (target.dataset.newsletterToggle) {
    const post = newsletterPosts.find((entry) => entry.id === target.dataset.newsletterToggle);
    if (!post) return;
    await db.collection("newsletterPosts").doc(post.id).update({
      hidden: !Boolean(post.hidden),
      hiddenAt: post.hidden ? null : firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(post.hidden ? "Newsletter-Post ist wieder sichtbar." : "Newsletter-Post ist unsichtbar.");
  }

  if (target.dataset.newsletterDelete) {
    if (!confirm("Diesen Newsletter-Post für alle endgültig löschen?")) return;
    await db.collection("newsletterPosts").doc(target.dataset.newsletterDelete).delete();
    showToast("Newsletter-Post wurde für alle gelöscht.");
  }
}, true);

function normalizedFees() {
  return (paymentSettings.fees || []).map((fee) => ({
    id: fee.id || newId(),
    name: fee.name || "Zusatzkosten",
    price: Number(fee.price || 0),
    description: fee.description || "",
    disabled: Boolean(fee.disabled)
  }));
}

function normalizedDiscounts() {
  return (paymentSettings.discounts || []).map((discount) => ({
    id: discount.id || newId(),
    code: String(discount.code || "").trim().toUpperCase(),
    kind: discount.kind === "voucher" ? "voucher" : "discount",
    valueType: discount.valueType === "fixed" ? "fixed" : "percent",
    value: Number(discount.value || 0),
    startsAt: discount.startsAt || "",
    endsAt: discount.endsAt || "",
    appliesToFees: Boolean(discount.appliesToFees),
    freeFees: Boolean(discount.freeFees),
    limitUses: discount.limitUses === true,
    maxUses: Number(discount.maxUses || 0),
    used: Number(discount.used || 0),
    singleUsePerCustomer: Boolean(discount.singleUsePerCustomer),
    disabled: Boolean(discount.disabled),
    usedBy: Array.isArray(discount.usedBy) ? discount.usedBy : []
  }));
}

function customerDiscountKey() {
  return currentUser?.uid || localStorage.getItem("buchmarkt_customer_key") || (() => {
    const key = newId();
    localStorage.setItem("buchmarkt_customer_key", key);
    return key;
  })();
}

function discountIsActive(discount) {
  const now = Date.now();
  const start = discount.startsAt ? Date.parse(discount.startsAt) : 0;
  const end = discount.endsAt ? Date.parse(discount.endsAt) : 0;
  if (discount.disabled) return false;
  if (start && now < start) return false;
  if (end && now > end) return false;
  if (discount.limitUses && discount.maxUses > 0 && discount.used >= discount.maxUses) return false;
  if (discount.singleUsePerCustomer && discount.usedBy.includes(customerDiscountKey())) return false;
  return true;
}

function findDiscount(code, kind) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  return normalizedDiscounts().find((discount) => discount.kind === kind && discount.code === clean && discountIsActive(discount)) || null;
}

function codeInputName(kind) {
  return kind === "voucher" ? "voucherCode" : "discountCode";
}

function checkedCodeMatches(kind, value) {
  const normalizedKind = kind === "voucher" ? "voucher" : "discount";
  const discount = appliedDiscounts[normalizedKind];
  return Boolean(discount && discount.code === String(value || "").trim().toUpperCase());
}

function checkCartCode(kind, options = {}) {
  const normalizedKind = kind === "voucher" ? "voucher" : "discount";
  const form = $("#checkoutForm");
  const field = form ? formField(form, codeInputName(normalizedKind)) : null;
  const code = String(field?.value || "").trim();

  if (!code) {
    appliedDiscounts[normalizedKind] = null;
    renderCart();
    if (!options.silent) showToast(normalizedKind === "voucher" ? "Bitte gib einen Gutscheincode ein." : "Bitte gib einen Rabattcode ein.");
    return false;
  }

  const discount = findDiscount(code, normalizedKind);
  if (!discount) {
    appliedDiscounts[normalizedKind] = null;
    renderCart();
    if (!options.silent) showToast(normalizedKind === "voucher" ? "Gutscheincode ist ungültig oder nicht aktiv." : "Rabattcode ist ungültig oder nicht aktiv.");
    return false;
  }

  appliedDiscounts[normalizedKind] = discount;
  if (field) field.value = discount.code;
  renderCart();
  if (!options.silent) showToast(`${normalizedKind === "voucher" ? "Gutschein" : "Rabattcode"} wurde angewendet.`);
  return true;
}

function calculateDiscountValue(discount, itemTotal, feeTotal) {
  if (!discount) return 0;
  const maxDiscount = itemTotal + feeTotal;
  const base = itemTotal + (discount.appliesToFees && !discount.freeFees ? feeTotal : 0);
  let valueDiscount = 0;
  if (discount.value > 0) {
    valueDiscount = discount.valueType === "percent" ? base * (discount.value / 100) : Math.min(base, discount.value);
  }
  const feeDiscount = discount.freeFees ? feeTotal : 0;
  return Math.min(maxDiscount, valueDiscount + feeDiscount);
}

function discountSummary(items = cart) {
  const itemTotal = cartTotalFromItems(items);
  const feeTotal = feesTotal();
  const discounts = [appliedDiscounts.discount, appliedDiscounts.voucher].filter(Boolean);
  const discountDetails = [];
  let discountTotal = 0;
  let remainingItems = itemTotal;
  let remainingFees = feeTotal;
  for (const discount of discounts) {
    const amount = calculateDiscountValue(discount, remainingItems, remainingFees);
    if (amount <= 0) continue;
    discountTotal += amount;
    discountDetails.push({ discount, amount });
    if (discount.freeFees) {
      const feePart = remainingFees;
      remainingFees = Math.max(0, remainingFees - feePart);
      remainingItems = Math.max(0, remainingItems - (amount - feePart));
    } else if (discount.appliesToFees) {
      const itemPart = Math.min(remainingItems, amount);
      remainingItems = Math.max(0, remainingItems - itemPart);
      remainingFees = Math.max(0, remainingFees - (amount - itemPart));
    } else {
      remainingItems = Math.max(0, remainingItems - amount);
    }
  }
  discountTotal = Math.min(itemTotal + feeTotal, discountTotal);
  return {
    itemTotal,
    feeTotal,
    discountTotal,
    total: Math.max(0, itemTotal + feeTotal - discountTotal),
    discounts,
    discountDetails
  };
}

async function saveDiscounts(discounts) {
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  await db.collection("settings").doc("payment").set({ discounts }, { merge: true });
}

async function saveFees(fees) {
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  await db.collection("settings").doc("payment").set({ fees }, { merge: true });
}

renderAdminFees = function renderAdminFees() {
  const list = $("#adminFeeList");
  if (!list) return;
  const fees = normalizedFees();
  if (!isAdmin()) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = fees.length ? fees.map((fee) => `
    <div class="admin-item">
      <strong>${escapeHtml(fee.name)}</strong>
      <p>${Number(fee.price || 0).toFixed(2)} EUR${fee.disabled ? " | deaktiviert" : ""}</p>
      ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
      <div class="admin-actions">
        <button type="button" data-fee-edit="${fee.id}">Bearbeiten</button>
        <button type="button" data-fee-toggle="${fee.id}">${fee.disabled ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-fee-delete="${fee.id}">Löschen</button>
      </div>
    </div>
  `).join("") : `<p class="muted">Keine Zusatzkosten eingerichtet.</p>`;
};

async function submitFee(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können Zusatzkosten speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || newId();
  const fees = normalizedFees();
  const nextFee = {
    id,
    name: String(data.get("name") || "").trim(),
    price: Number(data.get("price") || 0),
    description: String(data.get("description") || "").trim(),
    disabled: false
  };
  if (!nextFee.name) return showToast("Bitte gib einen Namen für die Zusatzkosten ein.");
  if (nextFee.price < 0) return showToast("Der Preis darf nicht negativ sein.");
  const index = fees.findIndex((fee) => fee.id === id);
  if (index >= 0) {
    nextFee.disabled = fees[index].disabled;
    fees[index] = nextFee;
  } else {
    fees.push(nextFee);
  }
  await saveFees(fees);
  form.reset();
  formField(form, "id").value = "";
  $("#cancelFeeEdit")?.classList.add("hidden");
  showToast("Zusatzkosten gespeichert.");
}

function editFee(id) {
  const form = $("#feeForm");
  const fee = normalizedFees().find((entry) => entry.id === id);
  if (!form || !fee) return;
  formField(form, "id").value = fee.id;
  formField(form, "name").value = fee.name;
  formField(form, "price").value = fee.price;
  formField(form, "description").value = fee.description || "";
  $("#cancelFeeEdit")?.classList.remove("hidden");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.feeEdit && !target.dataset.feeToggle && !target.dataset.feeDelete) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const fees = normalizedFees();

  if (target.dataset.feeEdit) {
    editFee(target.dataset.feeEdit);
    return;
  }

  if (target.dataset.feeToggle) {
    const fee = fees.find((entry) => entry.id === target.dataset.feeToggle);
    if (!fee) return;
    fee.disabled = !fee.disabled;
    await saveFees(fees);
    showToast(fee.disabled ? "Zusatzkosten deaktiviert." : "Zusatzkosten aktiviert.");
  }

  if (target.dataset.feeDelete) {
    if (!confirm("Diese Zusatzkosten wirklich löschen?")) return;
    await saveFees(fees.filter((fee) => fee.id !== target.dataset.feeDelete));
    showToast("Zusatzkosten gelöscht.");
  }
}, true);

document.addEventListener("DOMContentLoaded", () => {
  $("#feeForm")?.addEventListener("submit", submitFee);
  $("#cancelFeeEdit")?.addEventListener("click", () => {
    const form = $("#feeForm");
    if (!form) return;
    form.reset();
    formField(form, "id").value = "";
    $("#cancelFeeEdit")?.classList.add("hidden");
  });
  renderAdminFees();
});

function renderAdminDiscounts() {
  const list = $("#adminDiscountList");
  if (!list) return;
  const discounts = normalizedDiscounts();
  if (!isAdmin()) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = discounts.length ? discounts.map((discount) => `
    <div class="admin-item">
      <strong>${escapeHtml(discount.code)} (${discount.kind === "voucher" ? "Gutschein" : "Rabatt"})</strong>
      <p>${discount.valueType === "percent" ? `${discount.value}%` : `${discount.value.toFixed(2)} EUR`} | genutzt: ${discount.used}${discount.limitUses && discount.maxUses ? ` / ${discount.maxUses}` : " / unbegrenzt"}${discount.disabled ? " | deaktiviert" : ""}</p>
      <p>${discount.startsAt ? `Ab: ${escapeHtml(discount.startsAt)} ` : ""}${discount.endsAt ? `Bis: ${escapeHtml(discount.endsAt)}` : ""}</p>
      <p>${discount.freeFees ? "Rabatt auf Warenwert, Zusatz-/Versandkosten entfallen zusätzlich" : discount.appliesToFees ? "Rabatt auf Warenwert + Zusatz-/Versandkosten" : "Rabatt nur auf Warenwert"}</p>
      <div class="admin-actions">
        <button type="button" data-discount-edit="${discount.id}">Bearbeiten</button>
        <button type="button" data-discount-toggle="${discount.id}">${discount.disabled ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-discount-delete="${discount.id}">Löschen</button>
      </div>
    </div>
  `).join("") : `<p class="muted">Keine Rabattcodes oder Gutscheine eingerichtet.</p>`;
}

async function submitDiscount(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können Rabattcodes speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || newId();
  const discounts = normalizedDiscounts();
  const nextDiscount = {
    id,
    code: String(data.get("code") || "").trim().toUpperCase(),
    kind: data.get("kind") === "voucher" ? "voucher" : "discount",
    valueType: data.get("valueType") === "fixed" ? "fixed" : "percent",
    value: Number(data.get("value") || 0),
    startsAt: data.get("startsAt") || "",
    endsAt: data.get("endsAt") || "",
    appliesToFees: data.get("appliesToFees") === "on",
    freeFees: data.get("freeFees") === "on",
    limitUses: data.get("limitUses") === "on",
    maxUses: data.get("limitUses") === "on" ? Number(data.get("maxUses") || 0) : 0,
    used: 0,
    singleUsePerCustomer: data.get("singleUsePerCustomer") === "on",
    disabled: false,
    usedBy: []
  };
  if (!nextDiscount.code) return showToast("Bitte gib einen Code ein.");
  if (nextDiscount.value <= 0 && !nextDiscount.freeFees) return showToast("Bitte gib einen Rabattwert ein.");
  if (nextDiscount.limitUses && nextDiscount.maxUses <= 0) return showToast("Bitte gib ein Nutzungslimit größer als 0 ein oder deaktiviere das Limit.");
  const index = discounts.findIndex((discount) => discount.id === id);
  if (index >= 0) {
    nextDiscount.used = discounts[index].used;
    nextDiscount.usedBy = discounts[index].usedBy;
    nextDiscount.disabled = discounts[index].disabled;
    discounts[index] = nextDiscount;
  } else {
    discounts.push(nextDiscount);
  }
  await saveDiscounts(discounts);
  form.reset();
  formField(form, "id").value = "";
  $("#cancelDiscountEdit")?.classList.add("hidden");
  showToast("Code gespeichert.");
}

function editDiscount(id) {
  const form = $("#discountForm");
  const discount = normalizedDiscounts().find((entry) => entry.id === id);
  if (!form || !discount) return;
  formField(form, "id").value = discount.id;
  formField(form, "code").value = discount.code;
  formField(form, "kind").value = discount.kind;
  formField(form, "valueType").value = discount.valueType;
  formField(form, "value").value = discount.value;
  formField(form, "startsAt").value = discount.startsAt || "";
  formField(form, "endsAt").value = discount.endsAt || "";
  formField(form, "appliesToFees").checked = discount.appliesToFees;
  formField(form, "freeFees").checked = discount.freeFees;
  formField(form, "limitUses").checked = discount.limitUses;
  formField(form, "maxUses").value = discount.maxUses || "";
  formField(form, "singleUsePerCustomer").checked = discount.singleUsePerCustomer;
  $("#cancelDiscountEdit")?.classList.remove("hidden");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.discountEdit && !target.dataset.discountToggle && !target.dataset.discountDelete) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const discounts = normalizedDiscounts();
  if (target.dataset.discountEdit) return editDiscount(target.dataset.discountEdit);
  if (target.dataset.discountToggle) {
    const discount = discounts.find((entry) => entry.id === target.dataset.discountToggle);
    if (!discount) return;
    discount.disabled = !discount.disabled;
    await saveDiscounts(discounts);
    showToast(discount.disabled ? "Code deaktiviert." : "Code aktiviert.");
  }
  if (target.dataset.discountDelete) {
    if (!confirm("Diesen Code wirklich löschen?")) return;
    await saveDiscounts(discounts.filter((discount) => discount.id !== target.dataset.discountDelete));
    showToast("Code gelöscht.");
  }
}, true);

document.addEventListener("DOMContentLoaded", () => {
  $("#discountForm")?.addEventListener("submit", submitDiscount);
  $("#cancelDiscountEdit")?.addEventListener("click", () => {
    const form = $("#discountForm");
    if (!form) return;
    form.reset();
    formField(form, "id").value = "";
    $("#cancelDiscountEdit")?.classList.add("hidden");
  });
  $("#toggleStats")?.addEventListener("click", () => {
    showStatsPanel = !showStatsPanel;
    renderAdminStats();
  });
  renderAdminDiscounts();
  renderAdminStats();
});

const worksheetCover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
      <rect width="600" height="800" fill="#fffaf0"/>
      <path d="M0 90 C120 32 190 145 310 82 C420 24 515 110 600 58 V800 H0Z" fill="#6f8f55" opacity=".24"/>
      <rect x="88" y="92" width="424" height="616" rx="18" fill="#fffaf0" stroke="#3f6f45" stroke-width="8"/>
      <line x1="145" y1="225" x2="455" y2="225" stroke="#d77d32" stroke-width="10" stroke-linecap="round"/>
      <line x1="145" y1="310" x2="455" y2="310" stroke="#8a5637" stroke-width="8" stroke-linecap="round" opacity=".72"/>
      <line x1="145" y1="392" x2="390" y2="392" stroke="#8a5637" stroke-width="8" stroke-linecap="round" opacity=".72"/>
      <text x="300" y="555" text-anchor="middle" font-size="54" font-family="Arial" fill="#3f6f45" font-weight="700">PDF</text>
    </svg>
  `);

async function loadAssetList(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

loadCoverOptions = async function loadCoverOptions() {
  const [covers, pdfs, products] = await Promise.all([
    loadAssetList("covers/list.json"),
    loadAssetList("pdf/list.json"),
    loadAssetList("Product/list.json")
  ]);
  coverOptions = Array.isArray(covers) ? covers : [];
  pdfOptions = Array.isArray(pdfs) ? pdfs : [];
  productOptions = Array.isArray(products) ? products : [];
  renderCoverOptions();
  renderPdfOptions();
  renderProductOptions();
  updateMaterialFields();
};

renderCoverOptions = function renderCoverOptions(selected = "") {
  const select = $("#coverChoice");
  const preview = $("#coverPreview");
  if (!select) return;
  const choices = coverOptions.length ? coverOptions : [{ name: "Standard-Cover", src: sampleCover }];
  select.innerHTML = choices.map((cover) => `<option value="${escapeHtml(cover.src)}">${escapeHtml(cover.name || cover.src)}</option>`).join("");
  if (selected && choices.some((cover) => cover.src === selected)) select.value = selected;
  const value = select.value || sampleCover;
  if (preview) {
    preview.src = value;
    preview.classList.remove("hidden");
  }
  renderNewsletterImageOptions();
};

function renderPdfOptions(selected = "") {
  const select = $("#pdfChoice");
  if (!select) return;
  select.innerHTML = pdfOptions.length
    ? pdfOptions.map((pdf) => `<option value="${escapeHtml(pdf.src)}">${escapeHtml(pdf.name || pdf.src)}</option>`).join("")
    : `<option value="">Keine PDFs in pdf/list.json</option>`;
  if (selected && pdfOptions.some((pdf) => pdf.src === selected)) select.value = selected;
}

function renderProductOptions(selected = []) {
  const select = $("#productImages");
  if (!select) return;
  const selectedSet = new Set(selected);
  select.innerHTML = productOptions.length
    ? productOptions.map((image) => `<option value="${escapeHtml(image.src)}" ${selectedSet.has(image.src) ? "selected" : ""}>${escapeHtml(image.name || image.src)}</option>`).join("")
    : `<option value="">Keine Produktbilder in Product/list.json</option>`;
  renderProductPreview();
}

function selectedProductImages() {
  const select = $("#productImages");
  if (!select) return [];
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean).slice(0, 10);
}

function renderProductPreview() {
  const preview = $("#productPreview");
  if (!preview) return;
  const images = selectedProductImages();
  preview.classList.toggle("hidden", !images.length);
  preview.innerHTML = images.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("");
}

function effectiveItemType(category, rawType) {
  const normalized = normalizeCategory(category);
  if (normalized === "Lernhelfer") return "worksheet";
  if (normalized === "Sonstige") return rawType || "book";
  return "book";
}

function itemTypeLabel(type) {
  if (type === "worksheet") return "Arbeitsblätter";
  if (type === "product") return "Produkt";
  return "Buch";
}

function itemImage(book) {
  if (book.itemType === "worksheet") return book.cover || worksheetCover;
  if (book.itemType === "product") return book.productImages?.[0] || book.cover || sampleCover;
  return book.cover || sampleCover;
}

function updateMaterialFields() {
  const form = $("#bookForm");
  if (!form) return;
  const category = formField(form, "category")?.value || "Sonstige";
  const itemType = effectiveItemType(category, formField(form, "itemType")?.value);
  const isSonstige = normalizeCategory(category) === "Sonstige";
  $("#itemTypeWrap")?.classList.toggle("hidden", !isSonstige);
  $("#coverChoiceWrap")?.classList.toggle("hidden", itemType !== "book");
  $("#pdfChoiceWrap")?.classList.toggle("hidden", itemType !== "worksheet");
  $("#productImagesWrap")?.classList.toggle("hidden", itemType !== "product");
  $("#productPreview")?.classList.toggle("hidden", itemType !== "product" || !selectedProductImages().length);
  const stock = formField(form, "stock");
  if (stock) stock.placeholder = itemType === "worksheet" ? "Arbeitsblatt-Pakete verfügbar" : itemType === "product" ? "Produkte auf Lager" : "Bücher auf Lager";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = itemType === "worksheet" ? "Arbeitsblätter speichern" : itemType === "product" ? "Produkt speichern" : "Buch speichern";
}

bookCardTemplate = function bookCardTemplate(book) {
  const rating = averageRating(book);
  const category = normalizeCategory(book.category);
  const type = book.itemType || "book";
  const canQuickAdd = Number(book.stock || 0) > 0 && !availableFulfillmentOptions(book).length;
  return `
    <article class="book-card">
      <img src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div class="book-body">
        <h2 class="book-title">${escapeHtml(book.title)}</h2>
        <span class="stock-pill">${escapeHtml(category)}</span>
        <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span>
        <span class="stock-pill">${stockText(book.stock)}</span>
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${Number(book.price).toFixed(2)} EUR</span>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-open="${book.id}">Details</button>
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
      </div>
    </article>
  `;
};

submitBook = async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Inhalte speichern.");

  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = String(data.get("description") || "").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");

  const category = normalizeCategory(data.get("category"));
  const itemType = effectiveItemType(category, data.get("itemType"));
  const existing = books.find((book) => book.id === id);
  const productImages = itemType === "product" ? selectedProductImages() : [];
  const pdf = itemType === "worksheet" ? String(data.get("pdfChoice") || existing?.pdf || "") : "";
  const cover = itemType === "product"
    ? productImages[0] || existing?.cover || sampleCover
    : itemType === "worksheet"
      ? worksheetCover
      : data.get("coverChoice") || existing?.cover || sampleCover;

  if (itemType === "worksheet" && !pdf) return showToast("Bitte wähle eine PDF aus dem pdf-Ordner aus.");
  if (itemType === "product" && productImages.length > 10) return showToast("Bitte maximal 10 Produktbilder auswählen.");

  const saveButton = form.querySelector('button[type="submit"]');
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: String(data.get("title") || "").trim(),
      description,
      category,
      itemType,
      price: Number(data.get("price")),
      cover,
      pdf,
      productImages,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Firestore und Regeln.");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    renderCoverOptions();
    renderPdfOptions();
    renderProductOptions();
    updateMaterialFields();
    showToast(`${itemTypeLabel(itemType)} gespeichert und veröffentlicht.`);
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      updateMaterialFields();
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const form = $("#bookForm");
  if (!book || !form) return;
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title || "";
  formField(form, "description").value = book.description || "";
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "itemType").value = book.itemType || effectiveItemType(book.category, "book");
  formField(form, "price").value = book.price || "";
  formField(form, "stock").value = book.stock || 0;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  renderCoverOptions(book.cover || "");
  renderPdfOptions(book.pdf || "");
  renderProductOptions(book.productImages || []);
  updateMaterialFields();
  $("#cancelEdit")?.classList.remove("hidden");
};

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.slice(0, 10).map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
    : "";
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${escapeHtml(normalizeCategory(book.category))}</span> <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span> <span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        ${type === "worksheet" && book.pdf ? `<p><a class="secondary-link" href="${escapeHtml(book.pdf)}" target="_blank" rel="noopener">PDF ansehen</a></p>` : ""}
        ${gallery}
        <div class="card-actions">
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${allowed ? `
          <form class="stacked-form" id="reviewForm">
            <h3>Bewertung schreiben</h3>
            <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
            <select name="rating" required>
              <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
            </select>
            <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
            <button type="submit">Bewertung speichern</button>
          </form>
        ` : `<p class="muted">Bewertungen sind nur nach einem Kauf auf diesem Gerät möglich.</p>`}
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#bookForm");
  formField(form || document.createElement("form"), "category")?.addEventListener("change", updateMaterialFields);
  formField(form || document.createElement("form"), "itemType")?.addEventListener("change", updateMaterialFields);
  $("#productImages")?.addEventListener("change", () => {
    const select = $("#productImages");
    const selected = selectedProductImages();
    if (select && select.selectedOptions.length > 10) {
      [...select.options].forEach((option) => {
        if (!selected.includes(option.value)) option.selected = false;
      });
      showToast("Es sind maximal 10 Produktbilder möglich.");
    }
    renderProductPreview();
  });
  updateMaterialFields();
});

function selectedPreviewPages() {
  const select = $("#previewPages");
  if (!select) return [];
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean).slice(0, 2);
}

function renderPreviewPageOptions(selected = []) {
  const select = $("#previewPages");
  if (!select) return;
  const selectedSet = new Set(selected);
  select.innerHTML = previewOptions.length
    ? previewOptions.map((page) => `<option value="${escapeHtml(page.src)}" ${selectedSet.has(page.src) ? "selected" : ""}>${escapeHtml(page.name || page.src)}</option>`).join("")
    : `<option value="">Keine Vorschauseiten in previewsite/list.json</option>`;
  renderPreviewPagePreview();
}

function renderPreviewPagePreview() {
  const preview = $("#previewPagesPreview");
  if (!preview) return;
  const pages = selectedPreviewPages();
  preview.classList.toggle("hidden", !pages.length);
  preview.innerHTML = pages.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("");
}

renderPdfOptions = function renderPdfOptions(selected = "") {
  const select = $("#pdfChoice");
  if (!select) return;
  select.innerHTML = `<option value="">Keine PDF auswählen</option>` + (pdfOptions.length
    ? pdfOptions.map((pdf) => `<option value="${escapeHtml(pdf.src)}">${escapeHtml(pdf.name || pdf.src)}</option>`).join("")
    : "");
  if (selected && pdfOptions.some((pdf) => pdf.src === selected)) select.value = selected;
};

function itemFulfillmentLabel(value) {
  if (value === "download") return "PDF-Download";
  if (value === "print") return "Gedruckte Papierseiten";
  if (value === "ebook") return "E-Book";
  return "Standard";
}

function cartKey(item) {
  return `${item.bookId}:${item.fulfillment || "default"}`;
}

loadCoverOptions = async function loadCoverOptions() {
  const [covers, pdfs, products, previews, newsletterImages] = await Promise.all([
    loadAssetList("covers/list.json"),
    loadAssetList("pdf/list.json"),
    loadAssetList("Product/list.json"),
    loadAssetList("previewsite/list.json"),
    loadAssetList("newsbild/list.json")
  ]);
  coverOptions = Array.isArray(covers) ? covers : [];
  pdfOptions = Array.isArray(pdfs) ? pdfs : [];
  productOptions = Array.isArray(products) ? products : [];
  previewOptions = Array.isArray(previews) ? previews : [];
  newsletterImageOptions = Array.isArray(newsletterImages) ? newsletterImages : [];
  renderCoverOptions();
  renderPdfOptions();
  renderProductOptions();
  renderPreviewPageOptions();
  renderNewsletterImageOptions();
  updateMaterialFields();
};

updateMaterialFields = function updateMaterialFields() {
  const form = $("#bookForm");
  if (!form) return;
  const category = formField(form, "category")?.value || "Sonstige";
  const itemType = effectiveItemType(category, formField(form, "itemType")?.value);
  const isSonstige = normalizeCategory(category) === "Sonstige";
  const usesCoverAndPdf = itemType === "book" || itemType === "worksheet";
  $("#itemTypeWrap")?.classList.toggle("hidden", !isSonstige);
  $("#coverChoiceWrap")?.classList.toggle("hidden", itemType === "product");
  $("#pdfChoiceWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesPreview")?.classList.toggle("hidden", !usesCoverAndPdf || !selectedPreviewPages().length);
  $("#fulfillmentOptionsWrap")?.classList.toggle("hidden", itemType !== "worksheet");
  $("#productImagesWrap")?.classList.toggle("hidden", itemType !== "product");
  $("#productPreview")?.classList.toggle("hidden", itemType !== "product" || !selectedProductImages().length);

  const pdfLabel = $("#pdfChoiceWrap");
  if (pdfLabel?.firstChild) {
    pdfLabel.firstChild.textContent = itemType === "book" ? "E-Book-PDF aus pdf-Ordner" : "PDF-Datei für Arbeitsblätter";
  }
  const stock = formField(form, "stock");
  if (stock) stock.placeholder = itemType === "worksheet" ? "Arbeitsblatt-Pakete verfügbar" : itemType === "product" ? "Produkte auf Lager" : "Bücher auf Lager";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = itemType === "worksheet" ? "Lernmittel speichern" : itemType === "product" ? "Produkt speichern" : "Buch speichern";
};

itemImage = function itemImage(book) {
  if (book.itemType === "product") return book.productImages?.[0] || book.cover || sampleCover;
  return book.cover || sampleCover;
};

submitBook = async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Inhalte speichern.");

  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = String(data.get("description") || "").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");

  const category = normalizeCategory(data.get("category"));
  const itemType = effectiveItemType(category, data.get("itemType"));
  const existing = books.find((book) => book.id === id);
  const productImages = itemType === "product" ? selectedProductImages() : [];
  const previewPages = itemType === "product" ? [] : selectedPreviewPages();
  const pdf = itemType === "book" || itemType === "worksheet" ? String(data.get("pdfChoice") || existing?.pdf || "") : "";
  const cover = itemType === "product"
    ? productImages[0] || existing?.cover || sampleCover
    : data.get("coverChoice") || existing?.cover || sampleCover;
  const fulfillmentOptions = itemType === "worksheet"
    ? [
        data.get("downloadAvailable") === "on" ? "download" : "",
        data.get("printAvailable") === "on" ? "print" : ""
      ].filter(Boolean)
    : [];

  if (itemType === "worksheet" && !fulfillmentOptions.length) return showToast("Bitte Download oder Papierseiten aktivieren.");
  if (itemType === "worksheet" && fulfillmentOptions.includes("download") && !pdf) return showToast("Bitte eine PDF für den Download auswählen.");
  if (previewPages.length > 2) return showToast("Bitte maximal 2 Vorschauseiten auswählen.");
  if (itemType === "product" && productImages.length > 10) return showToast("Bitte maximal 10 Produktbilder auswählen.");

  const saveButton = form.querySelector('button[type="submit"]');
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: String(data.get("title") || "").trim(),
      description,
      category,
      itemType,
      price: Number(data.get("price")),
      cover,
      pdf,
      previewPages,
      fulfillmentOptions,
      productImages,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Firestore und Regeln.");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    renderCoverOptions();
    renderPdfOptions();
    renderProductOptions();
    renderPreviewPageOptions();
    updateMaterialFields();
    showToast(`${itemTypeLabel(itemType)} gespeichert und veröffentlicht.`);
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      updateMaterialFields();
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const form = $("#bookForm");
  if (!book || !form) return;
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title || "";
  formField(form, "description").value = book.description || "";
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "itemType").value = book.itemType || effectiveItemType(book.category, "book");
  formField(form, "price").value = book.price || "";
  formField(form, "stock").value = book.stock || 0;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  if (formField(form, "downloadAvailable")) formField(form, "downloadAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("download");
  if (formField(form, "printAvailable")) formField(form, "printAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("print");
  renderCoverOptions(book.cover || "");
  renderPdfOptions(book.pdf || "");
  renderProductOptions(book.productImages || []);
  renderPreviewPageOptions(book.previewPages || []);
  updateMaterialFields();
  $("#cancelEdit")?.classList.remove("hidden");
};

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.slice(0, 10).map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
    : "";
  const previews = type !== "product" && book.previewPages?.length
    ? `<section class="preview-section"><h3>Vorschau</h3><div class="preview-pages">${book.previewPages.slice(0, 2).map((src) => `<img src="${escapeHtml(src)}" alt="Vorschauseite">`).join("")}</div></section>`
    : "";
  const worksheetOptions = type === "worksheet" ? (book.fulfillmentOptions?.length ? book.fulfillmentOptions : ["download", "print"]) : [];
  const addActions = type === "worksheet"
    ? worksheetOptions.map((option) => `<button type="button" data-add-option="${book.id}:${option}" ${book.stock <= 0 ? "disabled" : ""}>${option === "download" ? "PDF-Download kaufen" : "Gedruckt kaufen"}</button>`).join("")
    : `<button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>`;
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${escapeHtml(normalizeCategory(book.category))}</span> <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span> <span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        ${type === "book" && book.pdf ? `<p class="muted">Dieses Buch ist auch als E-Book-PDF hinterlegt. Der Zugriff erfolgt nach dem Kauf.</p>` : ""}
        ${type === "worksheet" ? `<p class="muted">Lernmittel werden je nach Auswahl als PDF-Download oder als gedruckte Papierseiten bestellt.</p>` : ""}
        ${previews}
        ${gallery}
        <div class="card-actions">
          ${addActions}
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${allowed ? `
          <form class="stacked-form" id="reviewForm">
            <h3>Bewertung schreiben</h3>
            <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
            <select name="rating" required>
              <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
            </select>
            <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
            <button type="submit">Bewertung speichern</button>
          </form>
        ` : `<p class="muted">Bewertungen sind nur nach einem Kauf auf diesem Gerät möglich.</p>`}
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

addToCart = function addToCart(bookId, fulfillment = "default", quantity = 1) {
  const book = books.find((entry) => entry.id === bookId);
  if (!book || book.stock <= 0) return;
  const item = cart.find((entry) => entry.bookId === bookId && (entry.fulfillment || "default") === fulfillment);
  const requestedQuantity = fulfillment === "download" ? 1 : Math.max(1, Math.floor(Number(quantity || 1)));
  const currentQuantity = cart.filter((entry) => entry.bookId === bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  if (fulfillment === "download" && item) {
    showToast("Download-Artikel ist bereits im Warenkorb.");
    return;
  }
  if (item) {
    if (currentQuantity >= book.stock) return showToast("Mehr sind aktuell nicht auf Lager.");
    item.quantity += Math.min(requestedQuantity, Math.max(0, Number(book.stock || 0) - currentQuantity));
  } else {
    const quantityToAdd = Math.min(requestedQuantity, Math.max(1, Number(book.stock || 1) - currentQuantity));
    cart.push({ bookId, quantity: quantityToAdd, fulfillment });
  }
  renderCart();
  showToast(`${itemTypeLabel(book.itemType || "book")} wurde in den Warenkorb gelegt.`);
};

function updateCartLine(key, delta) {
  const item = cart.find((entry) => cartKey(entry) === key);
  if (!item) return;
  const book = books.find((entry) => entry.id === item.bookId);
  if (!book) return;
  if ((item.fulfillment || "default") === "download" && delta > 0) {
    showToast("Download-Artikel kann pro Bestellung nur einmal gekauft werden.");
    return;
  }
  const otherQuantity = cart.filter((entry) => entry.bookId === item.bookId && cartKey(entry) !== key).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter((entry) => cartKey(entry) !== key);
  if (item.quantity + otherQuantity > book.stock) item.quantity = Math.max(1, Number(book.stock || 0) - otherQuantity);
  renderCart();
}

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${Number(book.price).toFixed(2)} EUR${item.fulfillment && item.fulfillment !== "default" ? ` | ${itemFulfillmentLabel(item.fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountDetails.map((entry) => `
        <div class="cart-item">
          <strong>${escapeHtml(entry.discount.kind === "voucher" ? "Gutschein" : "Rabattcode")} ${escapeHtml(entry.discount.code)}</strong>
          <p>-${entry.amount.toFixed(2)} EUR</p>
        </div>
      `).join("")}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Rabatt/Gutschein</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

buildCheckoutPayload = function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      return {
        ...item,
        title: book?.title || "Buch",
        price: Number(book?.price || 0),
        itemType: book?.itemType || "book"
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    customerKey: customerDiscountKey(),
    createdAt: Date.now()
  };
};

function finalSafeBookCardTemplate(book) {
  try {
    return bookCardTemplate(book);
  } catch (error) {
    console.error("Produktkarte konnte nicht gerendert werden.", error, book);
    const price = Number(book?.price || 0);
    const image = typeof itemImage === "function" ? itemImage(book) : book?.cover || sampleCover;
    return `
      <article class="book-card">
        <img src="${escapeHtml(image || sampleCover)}" alt="${escapeHtml(book?.title || "Artikel")}">
        <div class="book-body">
          <h2 class="book-title">${escapeHtml(book?.title || "Artikel")}</h2>
          <span class="price">${price.toFixed(2)} EUR</span>
          <p>${escapeHtml(book?.description || "")}</p>
          <div class="card-actions">
            <button type="button" data-open="${escapeHtml(book?.id || "")}">Details</button>
          </div>
        </div>
      </article>
    `;
  }
}

renderBooks = function renderBooks() {
  const booksEl = $("#books");
  if (!booksEl) return;
  let filtered = [];
  try {
    filtered = getFilteredBooks();
  } catch (error) {
    console.error("Shop-Filter konnte nicht geladen werden.", error);
    filtered = books || [];
  }
  booksEl.innerHTML = filtered.length
    ? filtered.map(finalSafeBookCardTemplate).join("")
    : `<p class="panel">Noch keine passenden Bücher gefunden.</p>`;
};

function safeBookCardTemplate(book) {
  try {
    return bookCardTemplate(book);
  } catch (error) {
    console.error("Produktkarte konnte nicht gerendert werden.", error, book);
    const price = Number(book?.price || 0);
    const image = typeof itemImage === "function" ? itemImage(book) : book?.cover || sampleCover;
    return `
      <article class="book-card">
        <img src="${escapeHtml(image || sampleCover)}" alt="${escapeHtml(book?.title || "Artikel")}">
        <div class="book-body">
          <h2 class="book-title">${escapeHtml(book?.title || "Artikel")}</h2>
          <span class="price">${price.toFixed(2)} EUR</span>
          <p>${escapeHtml(book?.description || "")}</p>
          <div class="card-actions">
            <button type="button" data-open="${escapeHtml(book?.id || "")}">Details</button>
          </div>
        </div>
      </article>
    `;
  }
}

renderBooks = function renderBooks() {
  const booksEl = $("#books");
  if (!booksEl) return;
  let filtered = [];
  try {
    filtered = getFilteredBooks();
  } catch (error) {
    console.error("Shop-Filter konnte nicht geladen werden.", error);
    filtered = books || [];
  }
  booksEl.innerHTML = filtered.length
    ? filtered.map(safeBookCardTemplate).join("")
    : `<p class="panel">Noch keine passenden Bücher gefunden.</p>`;
};

createOrderFromCheckout = async function createOrderFromCheckout(checkout) {
  const orderItems = [];
  await db.runTransaction(async (transaction) => {
    const requestedByBook = new Map();
    for (const item of checkout.cart || []) {
      requestedByBook.set(item.bookId, Number(requestedByBook.get(item.bookId) || 0) + Number(item.quantity || 0));
    }
    const snapshots = new Map();
    for (const [bookId, requested] of requestedByBook.entries()) {
      const ref = db.collection("books").doc(bookId);
      const snap = await transaction.get(ref);
      if (!snap.exists || requested > Number(snap.data().stock || 0)) throw new Error("stock");
      snapshots.set(bookId, { ref, book: { id: snap.id, ...snap.data() }, requested });
    }
    for (const entry of snapshots.values()) {
      const stock = Number(entry.book.stock || 0) - entry.requested;
      const sold = Number(entry.book.sold || 0) + entry.requested;
      transaction.update(entry.ref, { stock, sold });
      maybeNotifyLowStock({ ...entry.book, stock });
    }
    for (const item of checkout.cart || []) {
      const entry = snapshots.get(item.bookId);
      orderItems.push({
        bookId: entry.book.id,
        title: entry.book.title,
        quantity: item.quantity,
        price: entry.book.price,
        itemType: entry.book.itemType || "book",
        fulfillment: item.fulfillment || "default",
        fulfillmentLabel: itemFulfillmentLabel(item.fulfillment || "default"),
        pdf: item.fulfillment === "download" || entry.book.itemType === "book" ? entry.book.pdf || "" : ""
      });
    }
    transaction.set(db.collection("orders").doc(), {
      customer: checkout.customer,
      items: orderItems,
      fees: checkout.fees || activeFees(),
      discounts: checkout.discounts || [],
      discountTotal: Number(checkout.discountTotal || 0),
      total: checkout.total !== undefined && checkout.total !== null ? Number(checkout.total) : checkoutTotal(checkout.cart),
      archived: false,
      status: "open",
      paymentMode: STRIPE_PUBLISHABLE_KEY ? "stripe-ready" : "test-local",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  if (checkout.discounts?.length) {
    const discounts = normalizedDiscounts();
    for (const usedDiscount of checkout.discounts) {
      const discount = discounts.find((entry) => entry.id === usedDiscount.id);
      if (!discount) continue;
      discount.used += 1;
      if (discount.singleUsePerCustomer && checkout.customerKey && !discount.usedBy.includes(checkout.customerKey)) {
        discount.usedBy.push(checkout.customerKey);
      }
    }
    await saveDiscounts(discounts);
  }
  rememberPurchasedBooks(orderItems);
  return orderItems;
};

function itemDiscountAmount(item) {
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0 || discount.appliesTo === "fees") return 0;
  const book = books.find((entry) => entry.id === item.bookId);
  const unitPrice = Number(item.price ?? variantPrice(book, item.fulfillment || "default"));
  const quantity = Number(item.quantity || 0);
  if (discount.valueType === "percent") return Math.max(0, unitPrice * (discount.value / 100) * quantity);
  return Math.max(0, Math.min(unitPrice, discount.value) * quantity);
}

function feeDiscountAmount(feeTotal) {
  const discount = currentShopDiscount();
  const value = Number(feeTotal || 0);
  if (!discount.enabled || discount.value <= 0 || discount.appliesTo === "items" || value <= 0) return 0;
  if (discount.valueType === "percent") return Math.max(0, value * (discount.value / 100));
  return Math.max(0, Math.min(value, discount.value));
}

normalizedDiscounts = function normalizedDiscounts() {
  return [];
};

discountSummary = function discountSummary(items = cart) {
  const itemTotal = cartTotalFromItems(items);
  const feeTotal = feesTotal();
  const discount = currentShopDiscount();
  const amount = (items || []).reduce((sum, item) => sum + itemDiscountAmount(item), 0);
  const discountDetails = amount > 0 ? [{
    discount: {
      id: "shop-discount",
      code: "Shop-Rabatt",
      kind: "shop",
      valueType: discount.valueType,
      value: discount.value
    },
    amount
  }] : [];
  return {
    itemTotal,
    feeTotal,
    discountTotal: Math.min(itemTotal, amount),
    total: Math.max(0, itemTotal + feeTotal - Math.min(itemTotal, amount)),
    discounts: discountDetails.map((entry) => entry.discount),
    discountDetails
  };
};

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".code-check-row").forEach((row) => row.remove());
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const fulfillment = item.fulfillment || "default";
        const price = variantPrice(book, fulfillment);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${price.toFixed(2)} EUR${fulfillment !== "default" ? ` | ${itemFulfillmentLabel(fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountTotal > 0 ? `
        <div class="cart-item">
          <strong>${escapeHtml(shopDiscountLabel())}</strong>
          <p>-${totals.discountTotal.toFixed(2)} EUR</p>
        </div>
      ` : ""}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Shop-Rabatt</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

buildCheckoutPayload = function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      const fulfillment = item.fulfillment || "default";
      const quantity = fulfillment === "download" ? 1 : Number(item.quantity || 1);
      return {
        ...item,
        quantity,
        title: book?.title || "Buch",
        price: variantPrice(book, fulfillment),
        itemType: book?.itemType || "book",
        fulfillment,
        pdf: fulfillment === "download" ? book?.pdf || "" : ""
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      appliesTo: entry.discount.appliesTo,
      itemAmount: entry.discount.itemAmount || 0,
      feeAmount: entry.discount.feeAmount || 0,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    createdAt: Date.now()
  };
};

normalizedDiscounts = function normalizedDiscounts() {
  return [];
};

discountSummary = function discountSummary(items = cart) {
  const itemTotal = cartTotalFromItems(items);
  const feeTotal = feesTotal();
  const discount = currentShopDiscount();
  const amount = shopDiscountAmount(itemTotal);
  const discountDetails = amount > 0 ? [{
    discount: {
      id: "shop-discount",
      code: "Shop-Rabatt",
      kind: "shop",
      valueType: discount.valueType,
      value: discount.value
    },
    amount
  }] : [];
  return {
    itemTotal,
    feeTotal,
    discountTotal: amount,
    total: Math.max(0, itemTotal + feeTotal - amount),
    discounts: discountDetails.map((entry) => entry.discount),
    discountDetails
  };
};

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".code-check-row").forEach((row) => row.remove());
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const fulfillment = item.fulfillment || "default";
        const price = variantPrice(book, fulfillment);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${price.toFixed(2)} EUR${fulfillment !== "default" ? ` | ${itemFulfillmentLabel(fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountTotal > 0 ? `
        <div class="cart-item">
          <strong>Shop-Rabatt</strong>
          <p>-${totals.discountTotal.toFixed(2)} EUR</p>
        </div>
      ` : ""}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Shop-Rabatt</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

buildCheckoutPayload = function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      const fulfillment = item.fulfillment || "default";
      const quantity = fulfillment === "download" ? 1 : Number(item.quantity || 1);
      return {
        ...item,
        quantity,
        title: book?.title || "Buch",
        price: variantPrice(book, fulfillment),
        itemType: book?.itemType || "book",
        fulfillment,
        pdf: fulfillment === "download" ? book?.pdf || "" : ""
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    createdAt: Date.now()
  };
};

function currentShopDiscount() {
  const discount = paymentSettings?.shopDiscount || {};
  const value = Number(discount.value || 0);
  const appliesTo = ["items", "fees", "both"].includes(discount.appliesTo) ? discount.appliesTo : "items";
  return {
    enabled: Boolean(discount.enabled),
    valueType: discount.valueType === "fixed" ? "fixed" : "percent",
    value: Number.isFinite(value) ? value : 0,
    appliesTo
  };
}

function shopDiscountAmount(itemTotal) {
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0 || itemTotal <= 0) return 0;
  if (discount.valueType === "percent") return Math.min(itemTotal, itemTotal * (discount.value / 100));
  return Math.min(itemTotal, discount.value);
}

function shopDiscountLabel() {
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0) return "Kein Shop-Rabatt aktiv";
  const targetLabel = discount.appliesTo === "fees"
    ? "Zusatzkosten"
    : discount.appliesTo === "both"
      ? "Artikel und Zusatzkosten"
      : "Artikel";
  return discount.valueType === "percent"
    ? `${discount.value}% auf ${targetLabel}`
    : `${discount.value.toFixed(2)} EUR auf ${targetLabel}`;
}

normalizedDiscounts = function normalizedDiscounts() {
  return [];
};

discountSummary = function discountSummary(items = cart) {
  const itemTotal = cartTotalFromItems(items);
  const feeTotal = feesTotal();
  const discount = currentShopDiscount();
  const amount = shopDiscountAmount(itemTotal);
  const discountDetails = amount > 0 ? [{
    discount: {
      id: "shop-discount",
      code: "Shop-Rabatt",
      kind: "shop",
      valueType: discount.valueType,
      value: discount.value
    },
    amount
  }] : [];
  return {
    itemTotal,
    feeTotal,
    discountTotal: amount,
    total: Math.max(0, itemTotal + feeTotal - amount),
    discounts: discountDetails.map((entry) => entry.discount),
    discountDetails
  };
};

renderAdminDiscounts = function renderAdminDiscounts() {
  const list = $("#adminDiscountList");
  const form = $("#discountForm");
  if (!list && !form) return;

  if (form && !form.dataset.shopDiscountReady) {
    const heading = form.previousElementSibling;
    if (heading?.tagName === "H2") heading.textContent = "Shop-Rabatt";
    form.dataset.shopDiscountReady = "true";
    form.innerHTML = `
      <p class="muted">Dieser Rabatt gilt automatisch für alle Produkte, Bücher und Artikel im Shop. Zusatzkosten bleiben normal.</p>
      <label class="checkbox-line">
        <input name="enabled" type="checkbox">
        Shop-Rabatt aktivieren
      </label>
      <select name="valueType" required>
        <option value="percent">Prozent</option>
        <option value="fixed">Fester Euro-Betrag</option>
      </select>
      <select name="appliesTo" required>
        <option value="items">Nur normale Artikelpreise</option>
        <option value="fees">Nur Zusatzkosten</option>
        <option value="both">Artikelpreise und Zusatzkosten</option>
      </select>
      <input name="value" type="number" min="0" step="0.01" placeholder="Wert, z.B. 20 oder 5" required>
      <button type="submit">Shop-Rabatt speichern</button>
    `;
    const hint = form.querySelector(".muted");
    if (hint) hint.textContent = "Dieser Rabatt gilt automatisch im Shop. Du kannst auswÃ¤hlen, ob Artikel, Zusatzkosten oder beides reduziert werden.";
  }

  const discount = currentShopDiscount();
  if (form) {
    formField(form, "enabled").checked = discount.enabled;
    formField(form, "valueType").value = discount.valueType;
    formField(form, "appliesTo").value = discount.appliesTo;
    formField(form, "value").value = discount.value || "";
  }

  if (!list) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = `
    <div class="admin-item">
      <strong>Aktueller Shop-Rabatt</strong>
      <p>${escapeHtml(shopDiscountLabel())}</p>
      <p class="muted">Gilt automatisch auf den Warenwert aller Artikel. Zusatzkosten werden nicht reduziert.</p>
    </div>
  `;
};

submitDiscount = async function submitDiscount(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können den Shop-Rabatt speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const shopDiscount = {
    enabled: data.get("enabled") === "on",
    valueType: data.get("valueType") === "fixed" ? "fixed" : "percent",
    appliesTo: ["items", "fees", "both"].includes(data.get("appliesTo")) ? data.get("appliesTo") : "items",
    value: Number(data.get("value") || 0)
  };
  if (shopDiscount.enabled && shopDiscount.value <= 0) return showToast("Bitte gib einen Rabattwert größer als 0 ein.");
  await db.collection("settings").doc("payment").set({
    shopDiscount,
    discounts: []
  }, { merge: true });
  paymentSettings = { ...paymentSettings, shopDiscount, discounts: [] };
  renderAdminDiscounts();
  renderCart();
  showToast("Shop-Rabatt gespeichert.");
};

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".code-check-row").forEach((row) => row.remove());
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const fulfillment = item.fulfillment || "default";
        const price = variantPrice(book, fulfillment);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${price.toFixed(2)} EUR${fulfillment !== "default" ? ` | ${itemFulfillmentLabel(fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountTotal > 0 ? `
        <div class="cart-item">
          <strong>Shop-Rabatt</strong>
          <p>-${totals.discountTotal.toFixed(2)} EUR</p>
        </div>
      ` : ""}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Shop-Rabatt</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

const buildCheckoutPayloadBeforeShopDiscount = buildCheckoutPayload;
buildCheckoutPayload = function buildCheckoutPayload(form) {
  const payload = buildCheckoutPayloadBeforeShopDiscount(form);
  const totals = discountSummary(cart);
  payload.discounts = totals.discountDetails.map((entry) => ({
    id: entry.discount.id,
    code: entry.discount.code,
    kind: entry.discount.kind,
    valueType: entry.discount.valueType,
    value: entry.discount.value,
    amount: entry.amount
  }));
  payload.discountTotal = totals.discountTotal;
  payload.total = totals.total;
  delete payload.customerKey;
  return payload;
};

renderAdminBooks = function renderAdminBooks() {
  const list = $("#adminBookList");
  const orderList = $("#adminOrderList");
  const orderSummary = $("#adminOrderSummary");
  if (!list || !orderList) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    orderList.innerHTML = "";
    if (orderSummary) orderSummary.innerHTML = "";
    renderAdminStats();
    return;
  }

  const visibleOrders = showArchivedOrders ? orders.filter((order) => order.archived) : orders.filter((order) => !order.archived);
  const openCount = orders.filter((order) => !order.archived).length;
  const archivedCount = orders.filter((order) => order.archived).length;
  if (orderSummary) {
    orderSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${openCount}</strong><span>Offen</span></div>
        <div><strong>${archivedCount}</strong><span>Archiv</span></div>
        <div><strong>${orders.length}</strong><span>Gesamt</span></div>
      </div>
    `;
  }

  list.innerHTML = books.map((book) => `
    <div class="admin-item">
      <strong>${escapeHtml(book.title)}</strong>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Warnung: ${book.lowStockEnabled ? `ab ${book.lowStockLimit}` : "aus"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `).join("");

  const printOrders = visibleOrders.filter((order) => !isDownloadOnlyOrder(order));
  const downloadOrders = visibleOrders.filter(isDownloadOnlyOrder);
  orderList.innerHTML = visibleOrders.length ? `
    ${renderAdminOrderGroup("Normale Bestellungen mit gedruckten Artikeln", printOrders, "Keine normalen Bestellungen.")}
    ${renderAdminOrderGroup("Nur Download-Bestellungen", downloadOrders, "Keine reinen Download-Bestellungen.", true)}
  ` : `<p class="muted">Keine ${showArchivedOrders ? "archivierten" : "offenen"} Bestellungen.</p>`;
  renderAdminStats();
};

function downloadableOrderItems(items = []) {
  return items.filter((item) => item.fulfillment === "download" && item.pdf);
}

async function markDownloadAsUsed(bookId) {
  if (!db || !bookId) return;
  const checkoutData = readJsonStorage(CHECKOUT_STORAGE_KEY, null);
  const sessionId = checkoutData?.stripeSessionId || new URLSearchParams(window.location.search).get("session_id") || "";
  if (!sessionId) return;
  const snapshot = await db.collection("orders").where("stripeSessionId", "==", sessionId).limit(1).get();
  if (snapshot.empty) return;
  const doc = snapshot.docs[0];
  const order = doc.data();
  const now = new Date().toISOString();
  const items = (order.items || []).map((item) => {
    if (item.fulfillment === "download" && item.bookId === bookId) {
      return { ...item, downloaded: true, downloadedAt: item.downloadedAt || now };
    }
    return item;
  });
  await doc.ref.update({
    items,
    downloadUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function renderDownloadLinks(items = []) {
  const box = $("#downloadLinks");
  if (!box) return;
  const downloads = downloadableOrderItems(items);
  box.classList.toggle("hidden", !downloads.length);
  if (!downloads.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <h2>Deine Downloads</h2>
    <p class="muted">Diese Links gehören nur zu den Download-Artikeln aus dieser bezahlten Bestellung.</p>
    <div class="admin-list">
      ${downloads.map((item) => `
        <div class="admin-item">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${Number(item.quantity || 1)} x ${escapeHtml(item.fulfillmentLabel || "PDF-Download")}</p>
          <a class="secondary-link" href="${escapeHtml(item.pdf)}" download target="_blank" rel="noopener" data-download-book="${escapeHtml(item.bookId)}">PDF herunterladen</a>
        </div>
      `).join("")}
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-download-book]");
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute("href");
  try {
    await markDownloadAsUsed(link.dataset.downloadBook);
  } catch (error) {
    console.warn("Downloadstatus konnte nicht gespeichert werden.", error);
  }
  const downloadLink = document.createElement("a");
  downloadLink.href = href;
  downloadLink.download = "";
  downloadLink.target = "_blank";
  downloadLink.rel = "noopener";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
});

async function verifyStripeCheckoutSession(sessionId) {
  const response = await fetch(`/.netlify/functions/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error("stripe-session-unverified");
  const data = await response.json();
  return data?.paid === true;
}

completeStripeCheckoutReturn = async function completeStripeCheckoutReturn() {
  const status = $("#stripeSuccessStatus");
  if (!status) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("checkout")) return;
  const sessionId = params.get("session_id") || "";
  if (!sessionId) {
    status.textContent = "Keine Zahlungsbestätigung von Stripe gefunden.";
    renderDownloadLinks([]);
    return;
  }
  const checkoutData = readJsonStorage(CHECKOUT_STORAGE_KEY, null);
  if (!checkoutData?.cart?.length) {
    status.textContent = "Keine gespeicherten Checkout-Daten gefunden.";
    renderDownloadLinks([]);
    return;
  }
  status.textContent = "Zahlung wird bei Stripe geprüft...";
  try {
    let paid = false;
    try {
      paid = await verifyStripeCheckoutSession(sessionId);
    } catch (verifyError) {
      console.warn("Stripe-Session konnte nicht geprüft werden, Success-Return wird trotzdem verarbeitet.", verifyError);
      paid = sessionId.startsWith("cs_");
    }
    if (!paid) {
      status.textContent = "Die Zahlung wurde noch nicht als erfolgreich bestätigt.";
      renderDownloadLinks([]);
      return;
    }
    status.textContent = "Bestellung wird gespeichert...";
    checkoutData.stripeSessionId = sessionId;
    const orderItems = await createOrderFromCheckout(checkoutData);
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    localStorage.removeItem(CART_STORAGE_KEY);
    cart = [];
    status.textContent = "Danke. Deine Bestellung wurde gespeichert.";
    renderDownloadLinks(orderItems);
  } catch (error) {
    console.error(error);
    status.textContent = "Zahlung war erfolgreich, aber die Bestellung konnte nicht gespeichert werden. Bitte kontaktiere den Support.";
    renderDownloadLinks([]);
  }
};

let managedUsers = [];

function isUserManagementPage() {
  return Boolean($("#userManagementList"));
}

function userSearchQuery() {
  const form = $("#userSearchForm");
  return String(formField(form || document.createElement("form"), "query")?.value || "").trim().toLowerCase();
}

function userMatchesSearch(user, query) {
  if (!query) return true;
  return `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(query);
}

function userRoleText(user) {
  if (user.disabled) return "Gesperrt";
  return user.admin ? "Admin" : "Kunde";
}

async function loadManagedUsers() {
  if (!isUserManagementPage() || !db || !isAdmin()) return;
  const list = $("#userManagementList");
  if (list) list.innerHTML = `<p class="muted">Nutzer werden geladen...</p>`;
  try {
    const snapshot = await db.collection("users").get();
    managedUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderUserManagement();
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = `<p class="muted">Nutzer konnten nicht geladen werden. Prüfe deine Firestore-Regeln für Admins.</p>`;
  }
}

function renderUserManagement() {
  const list = $("#userManagementList");
  if (!list) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    return;
  }
  const query = userSearchQuery();
  const users = managedUsers.filter((user) => userMatchesSearch(user, query));
  list.innerHTML = users.length ? users.map((user) => {
    const isSelf = currentUser?.uid === user.id;
    return `
      <div class="admin-item ${user.disabled ? "is-hidden-post" : ""}">
        <strong>${escapeHtml(user.name || "Ohne Name")}</strong>
        <p>${escapeHtml(user.email || "Keine E-Mail")} | Rolle: ${userRoleText(user)}</p>
        <p>${escapeHtml([user.street, user.city].filter(Boolean).join(", ") || "Keine Adresse gespeichert")}</p>
        ${isSelf ? `<p class="muted">Das bist du. Du kannst dich nicht selbst sperren oder zum Kunden machen.</p>` : ""}
        <div class="admin-actions">
          <button type="button" data-user-role="${user.id}" ${isSelf ? "disabled" : ""}>${user.admin ? "Zum Kunden machen" : "Zum Admin machen"}</button>
          <button type="button" data-user-reset="${user.id}" ${user.email ? "" : "disabled"}>Passwort zurücksetzen</button>
          <button type="button" data-user-disable="${user.id}" ${isSelf ? "disabled" : ""}>${user.disabled ? "Profil entsperren" : "Profil sperren"}</button>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Keine Nutzer gefunden.</p>`;
}

async function toggleUserRole(userId) {
  if (!isAdmin() || userId === currentUser?.uid) return;
  const user = managedUsers.find((entry) => entry.id === userId);
  if (!user) return;
  await db.collection("users").doc(userId).update({
    admin: !Boolean(user.admin),
    roleChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
    roleChangedBy: currentUser?.uid || null
  });
  user.admin = !Boolean(user.admin);
  renderUserManagement();
  showToast(user.admin ? "Nutzer ist jetzt Admin." : "Nutzer ist jetzt Kunde.");
}

async function sendManagedPasswordReset(userId) {
  if (!isAdmin()) return;
  const user = managedUsers.find((entry) => entry.id === userId);
  if (!user?.email) return showToast("Für diesen Nutzer ist keine E-Mail gespeichert.");
  try {
    await auth.sendPasswordResetEmail(user.email);
    showToast("Passwort-Reset-Mail wurde gesendet.");
  } catch (error) {
    showToast(authErrorMessage(error));
  }
}

async function toggleUserDisabled(userId) {
  if (!isAdmin() || userId === currentUser?.uid) return;
  const user = managedUsers.find((entry) => entry.id === userId);
  if (!user) return;
  const nextDisabled = !Boolean(user.disabled);
  const message = nextDisabled
    ? "Dieses Nutzerprofil sperren? Das Firebase-Auth-Konto selbst kann ohne Cloud Function nicht endgültig gelöscht werden."
    : "Dieses Nutzerprofil wieder entsperren?";
  if (!confirm(message)) return;
  await db.collection("users").doc(userId).set({
    disabled: nextDisabled,
    admin: nextDisabled ? false : Boolean(user.admin),
    disabledAt: nextDisabled ? firebase.firestore.FieldValue.serverTimestamp() : null,
    disabledBy: nextDisabled ? currentUser?.uid || null : null
  }, { merge: true });
  user.disabled = nextDisabled;
  if (nextDisabled) user.admin = false;
  renderUserManagement();
  showToast(nextDisabled ? "Nutzerprofil wurde gesperrt." : "Nutzerprofil wurde entsperrt.");
}

const renderAllBeforeUserManagement = renderAll;
renderAll = function renderAll() {
  if (currentProfile?.disabled && auth?.currentUser) {
    showToast("Dieses Konto wurde gesperrt.");
    auth.signOut();
    return;
  }
  renderAllBeforeUserManagement();
  prefillCheckoutFromProfile();
  if (isUserManagementPage()) {
    if (isAdmin() && !managedUsers.length) loadManagedUsers();
    renderUserManagement();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  $("#userSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderUserManagement();
  });
  formField($("#userSearchForm") || document.createElement("form"), "query")?.addEventListener("input", renderUserManagement);
  if (isUserManagementPage() && isAdmin()) loadManagedUsers();
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (target.dataset.orderShippingSave) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await saveOrderShipping(target.dataset.orderShippingSave);
    return;
  }
  if (!target.dataset.userRole && !target.dataset.userReset && !target.dataset.userDisable) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (target.dataset.userRole) await toggleUserRole(target.dataset.userRole);
  if (target.dataset.userReset) await sendManagedPasswordReset(target.dataset.userReset);
  if (target.dataset.userDisable) await toggleUserDisabled(target.dataset.userDisable);
}, true);

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.addOption) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const [bookId, fulfillment] = target.dataset.addOption.split(":");
    addToCart(bookId, fulfillment, buyQuantityValue(bookId, fulfillment));
  }
  if (target.dataset.buyQtyMinus) {
    event.preventDefault();
    event.stopImmediatePropagation();
    adjustBuyQuantity(target.dataset.buyQtyMinus, -1);
  }
  if (target.dataset.buyQtyPlus) {
    event.preventDefault();
    event.stopImmediatePropagation();
    adjustBuyQuantity(target.dataset.buyQtyPlus, 1);
  }
  if (target.dataset.cartMinus) {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateCartLine(target.dataset.cartMinus, -1);
  }
  if (target.dataset.cartPlus) {
    event.preventDefault();
    event.stopImmediatePropagation();
    updateCartLine(target.dataset.cartPlus, 1);
  }
  if (target.dataset.cartRemove) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cart = cart.filter((item) => cartKey(item) !== target.dataset.cartRemove);
    renderCart();
  }
}, true);

document.addEventListener("DOMContentLoaded", () => {
  $("#previewPages")?.addEventListener("change", () => {
    const select = $("#previewPages");
    const selected = selectedPreviewPages();
    if (select && select.selectedOptions.length > 2) {
      [...select.options].forEach((option) => {
        if (!selected.includes(option.value)) option.selected = false;
      });
      showToast("Es sind maximal 2 Vorschauseiten möglich.");
    }
    renderPreviewPagePreview();
  });
});

function variantPrice(book, fulfillment = "default") {
  const normal = Number(book?.price || 0);
  if (fulfillment === "download") {
    const value = Number(book?.downloadPrice);
    return Number.isFinite(value) && value > 0 ? value : normal;
  }
  if (fulfillment === "print") {
    const value = Number(book?.printPrice);
    return Number.isFinite(value) && value > 0 ? value : normal;
  }
  return normal;
}

function availableFulfillmentOptions(book) {
  const type = book?.itemType || "book";
  if (type === "product") return [];
  if (Array.isArray(book?.fulfillmentOptions) && book.fulfillmentOptions.length) return book.fulfillmentOptions;
  return book?.pdf ? ["download", "print"] : ["print"];
}

function priceRangeText(book) {
  const options = availableFulfillmentOptions(book);
  const prices = options.length ? options.map((option) => variantPrice(book, option)) : [variantPrice(book)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0 || discount.appliesTo === "fees") {
    return min === max ? `${min.toFixed(2)} EUR` : `${min.toFixed(2)} - ${max.toFixed(2)} EUR`;
  }
  const discountedPrices = prices.map((price) => discountedUnitPrice(price));
  const discountedMin = Math.min(...discountedPrices);
  const discountedMax = Math.max(...discountedPrices);
  const originalText = min === max ? `${min.toFixed(2)} EUR` : `${min.toFixed(2)} - ${max.toFixed(2)} EUR`;
  const discountText = discount.valueType === "percent" ? `-${discount.value}%` : `-${discount.value.toFixed(2)} EUR`;
  const newText = discountedMin === discountedMax
    ? `${discountedMin.toFixed(2)} EUR`
    : `${discountedMin.toFixed(2)} - ${discountedMax.toFixed(2)} EUR`;
  return `
    <span class="price-sale">
      <span class="sale-label">Shop-Rabatt</span>
      <s>${originalText}</s>
      <strong>${newText}</strong>
      <em>${discountText}</em>
    </span>
  `;
}

function discountedUnitPrice(price) {
  const discount = currentShopDiscount();
  const value = Number(price || 0);
  if (!discount.enabled || discount.value <= 0 || discount.appliesTo === "fees") return value;
  if (discount.valueType === "percent") return Math.max(0, value - value * (discount.value / 100));
  return Math.max(0, value - discount.value);
}

function optionButtonLabel(book, option) {
  const original = variantPrice(book, option);
  const discounted = discountedUnitPrice(original);
  const label = discounted < original
    ? `${discounted.toFixed(2)} EUR statt ${original.toFixed(2)} EUR`
    : `${original.toFixed(2)} EUR`;
  if (option === "download") return `Download kaufen (${label})`;
  if (option === "print") return `Gedruckt kaufen (${label})`;
  return `In den Warenkorb (${label})`;
}

function buyQuantityKey(bookId, fulfillment = "default") {
  return `${bookId}:${fulfillment || "default"}`;
}

function buyQuantityValue(bookId, fulfillment = "default") {
  if (fulfillment === "download") return 1;
  const key = buyQuantityKey(bookId, fulfillment);
  const input = document.querySelector(`[data-buy-qty-input="${CSS.escape(key)}"]`);
  const value = Number(input?.value || 1);
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

function setBuyQuantity(key, nextValue) {
  const [bookId] = key.split(":");
  const book = books.find((entry) => entry.id === bookId);
  const max = Math.max(1, Number(book?.stock || 1));
  const value = Math.max(1, Math.min(max, Math.floor(Number(nextValue || 1))));
  document.querySelectorAll(`[data-buy-qty-input="${CSS.escape(key)}"]`).forEach((input) => {
    input.value = String(value);
  });
}

function adjustBuyQuantity(key, delta) {
  const input = document.querySelector(`[data-buy-qty-input="${CSS.escape(key)}"]`);
  setBuyQuantity(key, Number(input?.value || 1) + delta);
}

function buyQuantityControl(book, fulfillment = "default") {
  if (fulfillment === "download") return "";
  const key = buyQuantityKey(book.id, fulfillment);
  const max = Math.max(1, Number(book.stock || 1));
  return `
    <div class="buy-quantity" aria-label="Menge auswählen">
      <button type="button" data-buy-qty-minus="${escapeHtml(key)}" aria-label="Menge verringern">-</button>
      <input type="number" min="1" max="${max}" value="1" inputmode="numeric" data-buy-qty-input="${escapeHtml(key)}" aria-label="Menge">
      <button type="button" data-buy-qty-plus="${escapeHtml(key)}" aria-label="Menge erhöhen">+</button>
    </div>
  `;
}

function buyActionMarkup(book, fulfillment = "default") {
  const isVariant = fulfillment !== "default";
  const disabled = Number(book.stock || 0) <= 0 ? "disabled" : "";
  const dataAttr = isVariant ? `data-add-option="${book.id}:${fulfillment}"` : `data-add="${book.id}"`;
  const label = isVariant ? optionButtonLabel(book, fulfillment) : "In den Warenkorb";
  return `
    <div class="buy-action-row">
      ${buyQuantityControl(book, fulfillment)}
      <button type="button" ${dataAttr} ${disabled}>${label}</button>
    </div>
  `;
}

updateMaterialFields = function updateMaterialFields() {
  const form = $("#bookForm");
  if (!form) return;
  const category = formField(form, "category")?.value || "Sonstige";
  const itemType = effectiveItemType(category, formField(form, "itemType")?.value);
  const isSonstige = normalizeCategory(category) === "Sonstige";
  const hasVariants = itemType === "book" || itemType === "worksheet";
  const usesCoverAndPdf = hasVariants;
  $("#itemTypeWrap")?.classList.toggle("hidden", !isSonstige);
  $("#variantPricesWrap")?.classList.toggle("hidden", !hasVariants);
  $("#coverChoiceWrap")?.classList.toggle("hidden", itemType === "product");
  $("#pdfChoiceWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesPreview")?.classList.toggle("hidden", !usesCoverAndPdf || !selectedPreviewPages().length);
  $("#fulfillmentOptionsWrap")?.classList.toggle("hidden", !hasVariants);
  $("#productImagesWrap")?.classList.toggle("hidden", itemType !== "product");
  $("#productPreview")?.classList.toggle("hidden", itemType !== "product" || !selectedProductImages().length);

  const pdfLabel = $("#pdfChoiceWrap");
  if (pdfLabel?.firstChild) {
    pdfLabel.firstChild.textContent = itemType === "book" ? "E-Book-PDF aus pdf-Ordner" : "PDF-Datei für Arbeitsblätter";
  }
  const stock = formField(form, "stock");
  if (stock) stock.placeholder = itemType === "worksheet" ? "Arbeitsblatt-Pakete verfügbar" : itemType === "product" ? "Produkte auf Lager" : "Bücher auf Lager";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = itemType === "worksheet" ? "Lernmittel speichern" : itemType === "product" ? "Produkt speichern" : "Buch speichern";
};

bookCardTemplate = function bookCardTemplate(book) {
  const rating = averageRating(book);
  const category = normalizeCategory(book.category);
  const type = book.itemType || "book";
  const canQuickAdd = Number(book.stock || 0) > 0 && !availableFulfillmentOptions(book).length;
  return `
    <article class="book-card">
      <img src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div class="book-body">
        <h2 class="book-title">${escapeHtml(book.title)}</h2>
        <span class="stock-pill">${escapeHtml(category)}</span>
        <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span>
        <span class="stock-pill">${stockText(book.stock)}</span>
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${priceRangeText(book)}</span>
        <p>${escapeHtml(book.description)}</p>
        <div class="card-actions">
          <button type="button" data-open="${book.id}">Details</button>
          ${canQuickAdd ? buyActionMarkup(book) : ""}
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
      </div>
    </article>
  `;
};

submitBook = async function submitBook(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Inhalte speichern.");

  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || db.collection("books").doc().id;
  const description = String(data.get("description") || "").trim();
  if (description.length < 10) return showToast("Die Beschreibung braucht mindestens 10 Zeichen.");

  const category = normalizeCategory(data.get("category"));
  const itemType = effectiveItemType(category, data.get("itemType"));
  const existing = books.find((book) => book.id === id);
  const price = Number(data.get("price"));
  const productImages = itemType === "product" ? selectedProductImages() : [];
  const previewPages = itemType === "product" ? [] : selectedPreviewPages();
  const pdf = itemType === "book" || itemType === "worksheet" ? String(data.get("pdfChoice") || existing?.pdf || "") : "";
  const cover = itemType === "product"
    ? productImages[0] || existing?.cover || sampleCover
    : data.get("coverChoice") || existing?.cover || sampleCover;
  const fulfillmentOptions = itemType === "book" || itemType === "worksheet"
    ? [
        data.get("downloadAvailable") === "on" ? "download" : "",
        data.get("printAvailable") === "on" ? "print" : ""
      ].filter(Boolean)
    : [];
  const downloadPrice = data.get("downloadPrice") !== "" ? Number(data.get("downloadPrice")) : price;
  const printPrice = data.get("printPrice") !== "" ? Number(data.get("printPrice")) : price;

  if ((itemType === "book" || itemType === "worksheet") && !fulfillmentOptions.length) return showToast("Bitte Download oder gedruckt aktivieren.");
  if (fulfillmentOptions.includes("download") && !pdf) return showToast("Bitte eine PDF für den Download auswählen.");
  if (previewPages.length > 2) return showToast("Bitte maximal 2 Vorschauseiten auswählen.");
  if (itemType === "product" && productImages.length > 10) return showToast("Bitte maximal 10 Produktbilder auswählen.");

  const saveButton = form.querySelector('button[type="submit"]');
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }
    await withTimeout(db.collection("books").doc(id).set({
      title: String(data.get("title") || "").trim(),
      description,
      category,
      itemType,
      price,
      downloadPrice,
      printPrice,
      cover,
      pdf,
      previewPages,
      fulfillmentOptions,
      productImages,
      stock: Number(data.get("stock")),
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 12000, "Firebase antwortet nicht. Prüfe Firestore und Regeln.");
    form.reset();
    formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    renderCoverOptions();
    renderPdfOptions();
    renderProductOptions();
    renderPreviewPageOptions();
    updateMaterialFields();
    showToast(`${itemTypeLabel(itemType)} gespeichert und veröffentlicht.`);
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      updateMaterialFields();
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const form = $("#bookForm");
  if (!book || !form) return;
  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title || "";
  formField(form, "description").value = book.description || "";
  formField(form, "category").value = normalizeCategory(book.category);
  formField(form, "itemType").value = book.itemType || effectiveItemType(book.category, "book");
  formField(form, "price").value = book.price || "";
  if (formField(form, "downloadPrice")) formField(form, "downloadPrice").value = book.downloadPrice ?? "";
  if (formField(form, "printPrice")) formField(form, "printPrice").value = book.printPrice ?? "";
  formField(form, "stock").value = book.stock || 0;
  formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  if (formField(form, "downloadAvailable")) formField(form, "downloadAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("download");
  if (formField(form, "printAvailable")) formField(form, "printAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("print");
  renderCoverOptions(book.cover || "");
  renderPdfOptions(book.pdf || "");
  renderProductOptions(book.productImages || []);
  renderPreviewPageOptions(book.previewPages || []);
  updateMaterialFields();
  $("#cancelEdit")?.classList.remove("hidden");
};

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.slice(0, 10).map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
    : "";
  const previews = type !== "product" && book.previewPages?.length
    ? `<section class="preview-section"><h3>Vorschau</h3><div class="preview-pages">${book.previewPages.slice(0, 2).map((src) => `<img src="${escapeHtml(src)}" alt="Vorschauseite">`).join("")}</div></section>`
    : "";
  const fulfillmentOptions = availableFulfillmentOptions(book);
  const addActions = fulfillmentOptions.length
    ? fulfillmentOptions.map((option) => buyActionMarkup(book, option)).join("")
    : buyActionMarkup(book);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="published-date">${escapeHtml(publishedDateText(book.createdAt))}</p>
        <p class="price">${priceRangeText(book)}</p>
        <p><span class="stock-pill">${escapeHtml(normalizeCategory(book.category))}</span> <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span> <span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        ${type === "book" && book.pdf ? `<p class="muted">Dieses Buch ist als Download und/oder gedruckt verfügbar.</p>` : ""}
        ${type === "worksheet" ? `<p class="muted">Lernmittel werden je nach Auswahl als PDF-Download oder als gedruckte Papierseiten bestellt.</p>` : ""}
        ${previews}
        ${gallery}
        <div class="card-actions">
          ${addActions}
          <button type="button" data-wishlist="${book.id}">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${allowed ? `
          <form class="stacked-form" id="reviewForm">
            <h3>Bewertung schreiben</h3>
            <input name="name" placeholder="Name" value="${escapeHtml(currentProfile?.name || "")}" required>
            <select name="rating" required>
              <option value="5">5 Sterne</option><option value="4">4 Sterne</option><option value="3">3 Sterne</option><option value="2">2 Sterne</option><option value="1">1 Stern</option>
            </select>
            <textarea name="text" minlength="10" placeholder="Beschreibung, mindestens 10 Zeichen" required></textarea>
            <button type="submit">Bewertung speichern</button>
          </form>
        ` : `<p class="muted">Bewertungen sind nur nach einem Kauf auf diesem Gerät möglich.</p>`}
        <div class="review-list">
          <h3>Rezensionen</h3>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </div>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

cartTotalFromItems = function cartTotalFromItems(items) {
  return (items || []).reduce((sum, item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    const price = Number(item.price ?? variantPrice(book, item.fulfillment || "default"));
    return sum + price * Number(item.quantity || 0);
  }, 0);
};

liveCartItems = function liveCartItems() {
  return cart.map((item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    const fulfillment = item.fulfillment || "default";
    return {
      bookId: item.bookId,
      title: `${book?.title || item.title || "Buch"}${fulfillment !== "default" ? ` (${itemFulfillmentLabel(fulfillment)})` : ""}`,
      quantity: Number(item.quantity || 0),
      price: variantPrice(book, fulfillment)
    };
  }).filter((item) => item.quantity > 0);
};

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const fulfillment = item.fulfillment || "default";
        const price = variantPrice(book, fulfillment);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${price.toFixed(2)} EUR${fulfillment !== "default" ? ` | ${itemFulfillmentLabel(fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountDetails.map((entry) => `
        <div class="cart-item">
          <strong>${escapeHtml(entry.discount.kind === "voucher" ? "Gutschein" : "Rabattcode")} ${escapeHtml(entry.discount.code)}</strong>
          <p>-${entry.amount.toFixed(2)} EUR</p>
        </div>
      `).join("")}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Rabatt/Gutschein</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

buildCheckoutPayload = function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      const fulfillment = item.fulfillment || "default";
      const quantity = fulfillment === "download" ? 1 : Number(item.quantity || 1);
      return {
        ...item,
        quantity,
        title: book?.title || "Buch",
        price: variantPrice(book, fulfillment),
        itemType: book?.itemType || "book",
        fulfillment,
        pdf: fulfillment === "download" ? book?.pdf || "" : ""
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    customerKey: customerDiscountKey(),
    createdAt: Date.now()
  };
};

createOrderFromCheckout = async function createOrderFromCheckout(checkout) {
  const orderItems = [];
  const orderBase = {
    customer: checkout.customer,
    fees: checkout.fees || activeFees(),
    discounts: checkout.discounts || [],
    discountTotal: Number(checkout.discountTotal || 0),
    total: checkout.total !== undefined && checkout.total !== null ? Number(checkout.total) : checkoutTotal(checkout.cart),
    archived: false,
    status: "open",
    fulfillmentStatus: checkout.fulfillmentStatus || "wird vorbereitet",
    shippingCarrier: checkout.shippingCarrier || "",
    shippingCarrierCustom: checkout.shippingCarrierCustom || "",
    trackingNumber: checkout.trackingNumber || "",
    paymentMode: "stripe-paid",
    stripeSessionId: checkout.stripeSessionId || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.runTransaction(async (transaction) => {
      const requestedByBook = new Map();
      for (const item of checkout.cart || []) {
        requestedByBook.set(item.bookId, Number(requestedByBook.get(item.bookId) || 0) + Number(item.quantity || 0));
      }
      const snapshots = new Map();
      for (const [bookId, requested] of requestedByBook.entries()) {
        const ref = db.collection("books").doc(bookId);
        const snap = await transaction.get(ref);
        if (!snap.exists || requested > Number(snap.data().stock || 0)) throw new Error("stock");
        snapshots.set(bookId, { ref, book: { id: snap.id, ...snap.data() }, requested });
      }
      for (const entry of snapshots.values()) {
        const stock = Number(entry.book.stock || 0) - entry.requested;
        const sold = Number(entry.book.sold || 0) + entry.requested;
        transaction.update(entry.ref, { stock, sold });
        maybeNotifyLowStock({ ...entry.book, stock });
      }
      for (const item of checkout.cart || []) {
        const entry = snapshots.get(item.bookId);
        const fulfillment = item.fulfillment || "default";
        const price = Number(item.price ?? variantPrice(entry.book, fulfillment));
        orderItems.push({
          bookId: entry.book.id,
          title: entry.book.title,
          quantity: item.quantity,
          price,
          itemType: entry.book.itemType || "book",
          fulfillment,
          fulfillmentLabel: itemFulfillmentLabel(fulfillment),
          pdf: fulfillment === "download" ? entry.book.pdf || item.pdf || "" : "",
          downloaded: fulfillment === "download" ? Boolean(item.downloaded) : false,
          downloadedAt: fulfillment === "download" ? item.downloadedAt || null : null
        });
      }
      transaction.set(db.collection("orders").doc(), {
        ...orderBase,
        items: orderItems,
        stockSynced: true
      });
    });
  } catch (transactionError) {
    console.warn("Bestellung wird ohne Lager-Sync gespeichert.", transactionError);
    const fallbackItems = (checkout.cart || []).map((item) => ({
      bookId: item.bookId,
      title: item.title || "Artikel",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      itemType: item.itemType || "book",
      fulfillment: item.fulfillment || "default",
      fulfillmentLabel: itemFulfillmentLabel(item.fulfillment || "default"),
      pdf: item.fulfillment === "download" ? item.pdf || "" : "",
      downloaded: item.fulfillment === "download" ? Boolean(item.downloaded) : false,
      downloadedAt: item.fulfillment === "download" ? item.downloadedAt || null : null
    }));
    orderItems.push(...fallbackItems);
    await db.collection("orders").add({
      ...orderBase,
      items: orderItems,
      stockSynced: false,
      status: "paid-needs-stock-check",
      saveWarning: transactionError?.message || "stock-sync-failed"
    });
  }
  if (checkout.discounts?.length) {
    const discounts = normalizedDiscounts();
    for (const usedDiscount of checkout.discounts) {
      const discount = discounts.find((entry) => entry.id === usedDiscount.id);
      if (!discount) continue;
      discount.used += 1;
      if (discount.singleUsePerCustomer && checkout.customerKey && !discount.usedBy.includes(checkout.customerKey)) {
        discount.usedBy.push(checkout.customerKey);
      }
    }
    await saveDiscounts(discounts);
  }
  rememberPurchasedBooks(orderItems);
  return orderItems;
};

function itemDiscountAmount(item) {
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0) return 0;
  const book = books.find((entry) => entry.id === item.bookId);
  const unitPrice = Number(item.price ?? variantPrice(book, item.fulfillment || "default"));
  const quantity = Number(item.quantity || 0);
  if (discount.valueType === "percent") return Math.max(0, unitPrice * (discount.value / 100) * quantity);
  return Math.max(0, Math.min(unitPrice, discount.value) * quantity);
}

normalizedDiscounts = function normalizedDiscounts() {
  return [];
};

discountSummary = function discountSummary(items = cart) {
  const itemTotal = cartTotalFromItems(items);
  const feeTotal = feesTotal();
  const discount = currentShopDiscount();
  const itemAmount = Math.min(itemTotal, (items || []).reduce((sum, item) => sum + itemDiscountAmount(item), 0));
  const feeAmount = Math.min(feeTotal, feeDiscountAmount(feeTotal));
  const amount = Math.min(itemTotal + feeTotal, itemAmount + feeAmount);
  const discountDetails = amount > 0 ? [{
    discount: {
      id: "shop-discount",
      code: "Shop-Rabatt",
      kind: "shop",
      valueType: discount.valueType,
      value: discount.value,
      appliesTo: discount.appliesTo,
      itemAmount,
      feeAmount
    },
    amount
  }] : [];
  return {
    itemTotal,
    feeTotal,
    discountTotal: amount,
    total: Math.max(0, itemTotal + feeTotal - amount),
    discounts: discountDetails.map((entry) => entry.discount),
    discountDetails
  };
};

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  if (cartCount) cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".code-check-row").forEach((row) => row.remove());
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = `<p class="muted">Dein Warenkorb ist leer.</p>`;
    scheduleLiveSessionUpdate();
    return;
  }
  const totals = discountSummary(cart);
  cartItems.innerHTML = `
    <div class="cart-list">
      ${cart.map((item) => {
        const book = books.find((entry) => entry.id === item.bookId);
        if (!book) return "";
        const key = cartKey(item);
        const fulfillment = item.fulfillment || "default";
        const price = variantPrice(book, fulfillment);
        const totalForBook = cart.filter((entry) => entry.bookId === item.bookId).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        return `
          <div class="cart-item">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${item.quantity} x ${price.toFixed(2)} EUR${fulfillment !== "default" ? ` | ${itemFulfillmentLabel(fulfillment)}` : ""}</p>
            <div class="quantity-row">
              <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
              <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= book.stock ? "disabled" : ""}>+</button>
              <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
            </div>
          </div>
        `;
      }).join("")}
      ${activeFees().map((fee) => `
        <div class="cart-item">
          <strong>${escapeHtml(fee.name || "Zusatzkosten")}</strong>
          <p>${Number(fee.price || 0).toFixed(2)} EUR</p>
          ${fee.description ? `<p class="muted">${escapeHtml(fee.description)}</p>` : ""}
        </div>
      `).join("")}
      ${totals.discountTotal > 0 ? `
        <div class="cart-item">
          <strong>Shop-Rabatt</strong>
          <p>-${totals.discountTotal.toFixed(2)} EUR</p>
        </div>
      ` : ""}
    </div>
    <div class="cart-summary">
      <p><span>Warenwert</span><strong>${totals.itemTotal.toFixed(2)} EUR</strong></p>
      <p><span>Zusatzkosten</span><strong>${totals.feeTotal.toFixed(2)} EUR</strong></p>
      <p><span>Shop-Rabatt</span><strong>-${totals.discountTotal.toFixed(2)} EUR</strong></p>
      <h3>Endbetrag: ${totals.total.toFixed(2)} EUR</h3>
    </div>
  `;
  scheduleLiveSessionUpdate();
};

buildCheckoutPayload = function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: cart.map((item) => {
      const book = books.find((entry) => entry.id === item.bookId);
      const fulfillment = item.fulfillment || "default";
      const quantity = fulfillment === "download" ? 1 : Number(item.quantity || 1);
      return {
        ...item,
        quantity,
        title: book?.title || "Buch",
        price: variantPrice(book, fulfillment),
        itemType: book?.itemType || "book",
        fulfillment,
        pdf: fulfillment === "download" ? book?.pdf || "" : ""
      };
    }),
    fees: activeFees().map((fee) => ({
      id: fee.id || newId(),
      name: fee.name || "Zusatzkosten",
      price: Number(fee.price || 0),
      description: fee.description || ""
    })),
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    createdAt: Date.now()
  };
};
// Final safety override: keep the shop list visible even if one card has bad data.
function finalSafeBookCardTemplate(book) {
  try {
    return bookCardTemplate(book);
  } catch (error) {
    console.error("Produktkarte konnte nicht gerendert werden.", error, book);
    const price = Number(book?.price || 0);
    const image = typeof itemImage === "function" ? itemImage(book) : book?.cover || sampleCover;
    const priceHtml = typeof priceRangeText === "function" ? priceRangeText(book) : `${price.toFixed(2)} EUR`;
    return `
      <article class="book-card">
        <img src="${escapeHtml(image || sampleCover)}" alt="${escapeHtml(book?.title || "Artikel")}">
        <div class="book-body">
          <h2 class="book-title">${escapeHtml(book?.title || "Artikel")}</h2>
          <span class="price">${priceHtml}</span>
          <p>${escapeHtml(book?.description || "")}</p>
          <div class="card-actions">
            <button type="button" data-open="${escapeHtml(book?.id || "")}">Details</button>
          </div>
        </div>
      </article>
    `;
  }
}

renderBooks = function renderBooks() {
  const booksEl = $("#books");
  if (!booksEl) return;
  let filtered = [];
  try {
    filtered = getFilteredBooks();
  } catch (error) {
    console.error("Shop-Filter konnte nicht geladen werden.", error);
    filtered = books || [];
  }
  booksEl.innerHTML = filtered.length
    ? filtered.map(finalSafeBookCardTemplate).join("")
    : `<p class="panel">Noch keine passenden Bücher gefunden.</p>`;
};
renderCustomerOrders = function renderCustomerOrders() {
  if (!currentUser) return "";
  const visibleOrders = (customerOrders || []).filter((order) => !order.archived);
  return `
    <section class="customer-orders">
      <h3>Aktuelle Bestellungen</h3>
      <p class="muted">Hinweis: Der angezeigte Status ist nur eine Orientierung und kann vom echten Versandstatus abweichen.</p>
      ${visibleOrders.length ? visibleOrders.map((order) => `
        <details class="customer-order-card">
          <summary>
            <span>${escapeHtml(orderDateText(order.createdAt))}</span>
            <strong>${escapeHtml(orderFulfillmentStatus(order))}</strong>
          </summary>
          <div class="customer-order-detail">
            <p><b>Status:</b> ${escapeHtml(orderFulfillmentStatus(order))}</p>
            <p><b>${escapeHtml(shippingLine(order))}</b></p>
            <p>${(order.items || []).map((item) => `${escapeHtml(item.title || "Artikel")} (${Number(item.quantity || 1)}x)`).join(", ")}</p>
          </div>
        </details>
      `).join("") : `<p class="muted">Du hast gerade keine offenen Bestellungen.</p>`}
    </section>
  `;
};

renderAdminOrderCard = function renderAdminOrderCard(order) {
  const address = [order.customer?.street, order.customer?.city].filter(Boolean).join(", ");
  const total = Number(order.total || 0).toFixed(2);
  const fulfillmentStatus = orderFulfillmentStatus(order);
  const carrier = order.shippingCarrier || "";
  const title = order.customer?.name || order.customer?.email || "Unbekannte Bestellung";
  return `
    <details class="admin-item order-card">
      <summary class="order-card-summary">
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(orderDateText(order.createdAt))}</small>
        </span>
        <b>${escapeHtml(fulfillmentStatus)}</b>
      </summary>
      <div class="order-card-content">
        <p><b>E-Mail:</b> ${escapeHtml(order.customer?.email || "Keine E-Mail")}</p>
        <p><b>Adresse:</b> ${escapeHtml(address || "Keine Adresse")}</p>
        <p><b>Bezahlt:</b> ${orderIsPaid(order) ? "Ja" : "Nein"} | <b>Betrag:</b> ${total} EUR</p>
        <p><b>Bestellung:</b> ${orderKindLabel(order)}</p>
        <div class="order-detail-list">
          ${(order.items || []).map((item) => `
            <p>
              <b>${escapeHtml(item.title || "Artikel")}</b>
              ${Number(item.quantity || 1)} x
              ${escapeHtml(item.fulfillmentLabel || itemFulfillmentLabel(item.fulfillment || "default"))}
              <span>${orderItemKind(item)}</span>
            </p>
          `).join("") || `<p class="muted">Keine Artikel gespeichert.</p>`}
        </div>
        <p><b>Archiv:</b> ${order.archived ? "Archiviert | wird nach 90 Tagen geloescht" : "Offen"}</p>
        <div class="order-shipping-form" data-order-shipping="${order.id}">
          <label>
            Bestellstatus
            <select name="fulfillmentStatus">
              <option value="wird vorbereitet" ${fulfillmentStatus === "wird vorbereitet" ? "selected" : ""}>wird vorbereitet</option>
              <option value="in bearbeitung" ${fulfillmentStatus === "in bearbeitung" ? "selected" : ""}>in bearbeitung</option>
              <option value="abgeschickt" ${fulfillmentStatus === "abgeschickt" ? "selected" : ""}>abgeschickt</option>
            </select>
          </label>
          <label>
            Versanddienst
            <select name="shippingCarrier">
              <option value="" ${!carrier ? "selected" : ""}>Noch nicht ausgewaehlt</option>
              <option value="DHL" ${carrier === "DHL" ? "selected" : ""}>DHL</option>
              <option value="Hermes" ${carrier === "Hermes" ? "selected" : ""}>Hermes</option>
              <option value="GLS" ${carrier === "GLS" ? "selected" : ""}>GLS</option>
              <option value="Weitere" ${carrier === "Weitere" ? "selected" : ""}>Weitere</option>
            </select>
          </label>
          <label>
            Eigener Versanddienst
            <input name="shippingCarrierCustom" value="${escapeHtml(order.shippingCarrierCustom || "")}" placeholder="Nur bei Weitere">
          </label>
          <label>
            Sendungsnummer
            <input name="trackingNumber" value="${escapeHtml(order.trackingNumber || "")}" placeholder="z.B. 000000000">
          </label>
          <button type="button" data-order-shipping-save="${order.id}">Status / Versand speichern</button>
        </div>
        <div class="admin-actions">
          ${order.archived ? `<button type="button" data-order-restore="${order.id}">Wiederherstellen</button>` : `<button type="button" data-order-complete="${order.id}">Fertig markieren</button>`}
          <button type="button" data-order-delete="${order.id}">Loeschen</button>
        </div>
      </div>
    </details>
  `;
};
let bookkeepingEntries = [];
let bookkeepingSettings = { autoEnabled: false, fixedFeePerItem: 0, providerPercent: 0 };
let unsubscribeBookkeepingEntries = null;
let unsubscribeBookkeepingSettings = null;

function isBookkeepingPage() {
  return Boolean($("#bookkeepingPanel"));
}

function normalizedBookkeepingSettings(data = {}) {
  return {
    autoEnabled: Boolean(data.autoEnabled),
    fixedFeePerItem: Number(data.fixedFeePerItem || 0),
    providerPercent: Number(data.providerPercent || 0)
  };
}

function signedBookkeepingAmount(entry) {
  const amount = Number(entry.amount || 0);
  return entry.kind === "expense" ? -amount : amount;
}

function bookkeepingVisibleEntries() {
  return bookkeepingEntries.filter((entry) => !entry.feeForEntry);
}

function bookkeepingFeeInfo(entry) {
  const directFixed = Number(entry.fixedFees || 0);
  const directProvider = Number(entry.providerFees || 0);
  const linkedFees = bookkeepingEntries
    .filter((fee) => fee.feeForEntry === entry.id)
    .reduce((sum, fee) => {
      return {
        fixed: sum.fixed + Number(fee.fixedFees || 0),
        provider: sum.provider + Number(fee.providerFees || 0),
        total: sum.total + Number(fee.amount || 0)
      };
    }, { fixed: 0, provider: 0, total: 0 });
  const fixed = directFixed + linkedFees.fixed;
  const provider = directProvider + linkedFees.provider;
  const total = fixed + provider + Math.max(0, linkedFees.total - linkedFees.fixed - linkedFees.provider);
  return { fixed, provider, total };
}

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bookkeepingDateFromInput(value) {
  if (!value) return firebase.firestore.FieldValue.serverTimestamp();
  const today = todayDateInputValue();
  if (value > today) return null;
  return new Date(`${value}T12:00:00`);
}

function bookkeepingDateText(value) {
  const timestamp = timestampToMs(value);
  if (!timestamp) return "Datum: nicht verfuegbar";
  return `Datum: ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(timestamp))}`;
}

function renderBookkeeping() {
  const panel = $("#bookkeepingPanel");
  const hint = $("#bookkeepingLoginHint");
  if (!panel && !hint) return;
  const allowed = isAdmin();
  panel?.classList.toggle("hidden", !allowed);
  hint?.classList.toggle("hidden", allowed);
  if (!allowed) return;

  const settingsForm = $("#bookkeepingSettingsForm");
  if (settingsForm) {
    formField(settingsForm, "autoEnabled").checked = Boolean(bookkeepingSettings.autoEnabled);
    formField(settingsForm, "fixedFeePerItem").value = bookkeepingSettings.fixedFeePerItem || "";
    formField(settingsForm, "providerPercent").value = bookkeepingSettings.providerPercent || "";
  }

  const visibleEntries = bookkeepingVisibleEntries();
  const income = visibleEntries.filter((entry) => entry.kind !== "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const normalExpense = visibleEntries.filter((entry) => entry.kind === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const hiddenFeeExpense = visibleEntries.reduce((sum, entry) => sum + bookkeepingFeeInfo(entry).total, 0);
  const expense = normalExpense + hiddenFeeExpense;
  const balance = income - expense;
  const summary = $("#bookkeepingSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${income.toFixed(2)} EUR</strong><span>Einnahmen</span></div>
        <div><strong>${expense.toFixed(2)} EUR</strong><span>Ausgaben</span></div>
        <div><strong>${balance.toFixed(2)} EUR</strong><span>Saldo</span></div>
      </div>
    `;
  }

  const list = $("#bookkeepingList");
  if (list) {
    list.innerHTML = visibleEntries.length ? visibleEntries.map((entry) => {
      const fees = bookkeepingFeeInfo(entry);
      return `
      <details class="admin-item bookkeeping-entry">
        <summary>
          <span>
            <strong>${escapeHtml(entry.name || "Eintrag")}</strong>
            <small>${escapeHtml(bookkeepingDateText(entry.createdAt))}</small>
          </span>
          <b>${entry.kind === "expense" ? "Ausgabe" : "Einnahme"}: ${Number(entry.amount || 0).toFixed(2)} EUR</b>
        </summary>
        <div class="bookkeeping-entry-detail">
          ${entry.kind !== "expense" && fees.total > 0 ? `<p class="muted">Gebuehren: ${fees.total.toFixed(2)} EUR (${fees.fixed.toFixed(2)} EUR fix + ${fees.provider.toFixed(2)} EUR Zahlungsanbieter)</p>` : ""}
          ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
          ${entry.auto ? `<span class="stock-pill">Automatisch</span>` : ""}
          <div class="admin-actions">
            <button type="button" data-bookkeeping-delete="${entry.id}">Eintrag loeschen</button>
          </div>
        </div>
      </details>
    `;
    }).join("") : `<p class="muted">Noch keine Buchhaltungs-Eintraege.</p>`;
  }
}

async function deleteBookkeepingEntry(entryId) {
  if (!db || !isAdmin()) return showToast("Nur Admins koennen Buchhaltung loeschen.");
  if (!confirm("Diesen Buchhaltungs-Eintrag wirklich loeschen?")) return;
  const batch = db.batch();
  batch.delete(db.collection("bookkeepingEntries").doc(entryId));
  bookkeepingEntries
    .filter((entry) => entry.feeForEntry === entryId)
    .forEach((entry) => batch.delete(db.collection("bookkeepingEntries").doc(entry.id)));
  await batch.commit();
  showToast("Buchhaltungs-Eintrag geloescht.");
}

function listenToBookkeeping() {
  if (!db || !isBookkeepingPage() || !isAdmin()) return;
  if (!unsubscribeBookkeepingEntries) {
    unsubscribeBookkeepingEntries = db.collection("bookkeepingEntries").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
      bookkeepingEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderBookkeeping();
    }, (error) => {
      console.error(error);
      showToast(authErrorMessage(error));
    });
  }
  if (!unsubscribeBookkeepingSettings) {
    unsubscribeBookkeepingSettings = db.collection("settings").doc("bookkeeping").onSnapshot((snapshot) => {
      bookkeepingSettings = normalizedBookkeepingSettings(snapshot.exists ? snapshot.data() : {});
      renderBookkeeping();
    }, (error) => {
      console.error(error);
      showToast(authErrorMessage(error));
    });
  }
}

async function submitBookkeepingEntry(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins koennen Buchhaltung speichern.");
  const data = new FormData(event.currentTarget);
  const amount = Number(data.get("amount") || 0);
  const kind = data.get("kind") === "expense" ? "expense" : "income";
  const applyAutoFees = kind === "income" && data.get("applyAutoFees") === "on";
  const fixedFees = applyAutoFees ? Number(bookkeepingSettings.fixedFeePerItem || 0) : 0;
  const providerFees = applyAutoFees ? amount * (Number(bookkeepingSettings.providerPercent || 0) / 100) : 0;
  const createdAt = bookkeepingDateFromInput(String(data.get("entryDate") || ""));
  if (!createdAt) return showToast("Bitte kein Datum in der Zukunft auswählen.");
  if (amount <= 0) return showToast("Bitte einen Betrag groesser als 0 eintragen.");
  await db.collection("bookkeepingEntries").add({
    name: String(data.get("name") || "").trim(),
    kind,
    amount,
    note: String(data.get("note") || "").trim(),
    applyAutoFees,
    gross: null,
    fixedFees,
    providerFees,
    auto: false,
    createdAt,
    createdBy: currentUser?.uid || null
  });
  clearBookkeepingEntryForm(event.currentTarget);
  showToast("Buchhaltungs-Eintrag gespeichert.");
}

function clearBookkeepingEntryForm(form) {
  if (!form) return;
  form.reset();
  const name = formField(form, "name");
  const kind = formField(form, "kind");
  const amount = formField(form, "amount");
  const entryDate = formField(form, "entryDate");
  const note = formField(form, "note");
  const checkbox = formField(form, "applyAutoFees");
  if (name) name.value = "";
  if (kind) kind.value = "income";
  if (amount) amount.value = "";
  if (entryDate) entryDate.value = "";
  if (note) note.value = "";
  if (checkbox) checkbox.checked = true;
}

async function submitBookkeepingSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins koennen Buchhaltung speichern.");
  const data = new FormData(event.currentTarget);
  const next = {
    autoEnabled: data.get("autoEnabled") === "on",
    fixedFeePerItem: Number(data.get("fixedFeePerItem") || 0),
    providerPercent: Number(data.get("providerPercent") || 0)
  };
  await db.collection("settings").doc("bookkeeping").set(next, { merge: true });
  bookkeepingSettings = normalizedBookkeepingSettings(next);
  renderBookkeeping();
  showToast("Buchhaltungs-Einstellungen gespeichert.");
}

function bookkeepingCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportBookkeepingCsv() {
  const rows = bookkeepingExportRows();
  const csv = rows.map((row) => row.map(bookkeepingCsvValue).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `buchhaltung-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bookkeepingExportRows() {
  const rows = [["Datum", "Name", "Einnahmen EUR", "Ausgaben EUR", "Notiz"]];
  let incomeTotal = 0;
  let expenseTotal = 0;
  bookkeepingVisibleEntries().forEach((entry) => {
    const fees = bookkeepingFeeInfo(entry);
    const income = entry.kind === "expense" ? 0 : Math.max(0, Number(entry.amount || 0) - fees.total);
    const expense = entry.kind === "expense" ? Number(entry.amount || 0) : 0;
    incomeTotal += income;
    expenseTotal += expense;
    rows.push([
      bookkeepingDateText(entry.createdAt).replace("Datum: ", ""),
      entry.name || "",
      income ? income.toFixed(2) : "",
      expense ? expense.toFixed(2) : "",
      entry.note || ""
    ]);
  });
  rows.push(["", "", "", "", ""]);
  rows.push(["", "Summe", incomeTotal.toFixed(2), expenseTotal.toFixed(2), ""]);
  rows.push(["", "Saldo", (incomeTotal - expenseTotal).toFixed(2), "", ""]);
  return rows;
}

function exportBookkeepingPdf() {
  const rows = bookkeepingExportRows();
  const lines = [
    "Buchhaltung",
    `Export: ${new Date().toLocaleDateString("de-DE")}`,
    "",
    ...rows.map((row) => row.join(" | "))
  ];
  const pdf = createSimpleTextPdf(lines);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `buchhaltung-${new Date().toISOString().slice(0, 10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function pdfText(value) {
  return String(value ?? "")
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")
    .replaceAll("Ä", "Ae").replaceAll("Ö", "Oe").replaceAll("Ü", "Ue")
    .replaceAll("ß", "ss")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\()]/g, "\\$&");
}

function createSimpleTextPdf(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const lineHeight = 15;
  const maxChars = 96;
  const pages = [];
  let current = [];
  for (const line of lines) {
    const text = String(line || "");
    const chunks = text.length ? text.match(new RegExp(`.{1,${maxChars}}`, "g")) : [""];
    for (const chunk of chunks) {
      if (current.length >= 48) {
        pages.push(current);
        current = [];
      }
      current.push(chunk);
    }
  }
  if (current.length) pages.push(current);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const contentIds = [];

  pages.forEach((pageLines) => {
    const content = [
      "BT",
      `/F1 10 Tf`,
      `${margin} ${pageHeight - margin} Td`,
      "14 TL",
      ...pageLines.map((line, index) => `${index ? "T*" : ""} (${pdfText(line)}) Tj`),
      "ET"
    ].join("\n");
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    contentIds.push(contentId);
    pageIds.push(pageId);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

async function addAutomaticBookkeepingIncome(checkout, orderItems) {
  if (!db) return;
  const snap = await db.collection("settings").doc("bookkeeping").get();
  const settings = normalizedBookkeepingSettings(snap.exists ? snap.data() : {});
  if (!settings.autoEnabled) return;
  const gross = Number(checkout.total || 0);
  const quantity = (orderItems || checkout.cart || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const fixedFees = quantity * Number(settings.fixedFeePerItem || 0);
  const providerFees = gross * (Number(settings.providerPercent || 0) / 100);
  await db.collection("bookkeepingEntries").add({
    name: "Artikel verkauft",
    kind: "income",
    amount: gross,
    note: "Automatischer Umsatz aus Bestellung",
    auto: true,
    gross: null,
    fixedFees,
    providerFees,
    orderSessionId: checkout.stripeSessionId || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

const createOrderFromCheckoutBeforeBookkeeping = createOrderFromCheckout;
createOrderFromCheckout = async function createOrderFromCheckout(checkout) {
  const orderItems = await createOrderFromCheckoutBeforeBookkeeping(checkout);
  try {
    await addAutomaticBookkeepingIncome(checkout, orderItems);
  } catch (error) {
    console.warn("Automatische Buchhaltung konnte nicht gespeichert werden.", error);
  }
  return orderItems;
};

const renderAccountBeforeBookkeepingLinks = renderAccount;
renderAccount = function renderAccount() {
  renderAccountBeforeBookkeepingLinks();
  const actions = $("#currentUserBox .admin-actions");
  if (actions && isAdmin() && !actions.querySelector('[href="buchhaltung.html"]')) {
    actions.insertAdjacentHTML("afterbegin", `
      <a class="secondary-link" href="buchhaltung.html">Buchhaltung</a>
      <a class="secondary-link" href="upload-buecher.html">Bücher hochladen</a>
    `);
  }
};

const renderAllBeforeBookkeeping = renderAll;
renderAll = function renderAll() {
  renderAllBeforeBookkeeping();
  renderBookkeeping();
  listenToBookkeeping();
};

document.addEventListener("DOMContentLoaded", () => {
  const bookkeepingDateInput = formField($("#bookkeepingEntryForm") || document.createElement("form"), "entryDate");
  if (bookkeepingDateInput) bookkeepingDateInput.max = todayDateInputValue();
  $("#bookkeepingEntryForm")?.addEventListener("submit", submitBookkeepingEntry);
  $("#bookkeepingSettingsForm")?.addEventListener("submit", submitBookkeepingSettings);
  $("#exportBookkeepingCsv")?.addEventListener("click", exportBookkeepingCsv);
  $("#exportBookkeepingPdf")?.addEventListener("click", exportBookkeepingPdf);
  $("#bookkeepingList")?.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-bookkeeping-delete]");
    if (!target) return;
    await deleteBookkeepingEntry(target.dataset.bookkeepingDelete);
  });
});
let supportPresence = [];
let supportChats = [];
let supportMessages = [];
let supportAssignees = [];
let activeSupportChatId = localStorage.getItem("entfalta_support_chat") || "";
let unsubscribeSupportPresence = null;
let unsubscribeSupportChats = null;
let unsubscribeSupportAssignees = null;
let unsubscribeSupportMessages = null;
let unsubscribeActiveSupportChat = null;
let lastSupportMessageId = "";
let supportTypingTimer = null;
let showArchivedSupportChats = false;
let supportWidgetMode = localStorage.getItem("entfalta_support_widget_mode") || "customer";
let supportChatClosedNotice = "";
let supportChatClosedTimer = null;

function isSupportPage() {
  return Boolean($("#supportMessages"));
}

function isSupportTeam() {
  return Boolean(isAdmin());
}

function canHandleSupportChats() {
  return Boolean(isAdmin() || currentProfile?.support);
}

function shouldShowCustomerSupportWidget() {
  const cartOpen = Boolean($("#cartDrawer") && !$("#cartDrawer").classList.contains("hidden"));
  return !isSupportPage() && !cartOpen;
}

function protectSupportPage() {
  if (!isSupportPage()) return;
  if (!authReady) {
    const adminPanel = $("#supportAdminPanel");
    const chatPanel = $(".support-chat-panel");
    adminPanel?.classList.add("hidden");
    chatPanel?.classList.add("hidden");
    const info = $("#supportAvailability");
    if (info) info.textContent = "Admin-Zugang wird geprüft...";
    return;
  }
  if (currentUser && isAdmin()) return;
  if (currentUser && !isAdmin()) {
    showToast("Support.html ist nur für Admins. Kunden nutzen den Live-Chat unten rechts.");
    window.setTimeout(() => {
      window.location.href = "index.html";
    }, 900);
    return;
  }
  const adminPanel = $("#supportAdminPanel");
  const chatPanel = $(".support-chat-panel");
  adminPanel?.classList.add("hidden");
  chatPanel?.classList.add("hidden");
  const info = $("#supportAvailability");
  if (info) info.textContent = "Bitte als Admin anmelden. Diese Seite ist nicht für Kunden.";
}

function supportVisitorId() {
  const key = "entfalta_support_visitor";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = newId();
  localStorage.setItem(key, id);
  return id;
}

function supportStatusRank(status) {
  if (status === "present") return 3;
  if (status === "standby") return 2;
  if (status === "away") return 1;
  return 0;
}

function bestSupportStatus() {
  return supportPresence.reduce((best, entry) => supportStatusRank(entry.status) > supportStatusRank(best) ? entry.status : best, "away");
}

function supportStatusText(status) {
  if (status === "present") return "Anwesend";
  if (status === "standby") return "In Bereitschaft";
  return "Abwesend";
}

function supportAvailabilityText() {
  const status = bestSupportStatus();
  if (status === "present") return "Support ist gerade anwesend. Du kannst direkt schreiben.";
  if (status === "standby") return "Support ist in Bereitschaft. Wir antworten so schnell wie moeglich.";
  return "Gerade ist kein Support anwesend. Du kannst trotzdem schreiben, wir melden uns so schnell wie moeglich.";
}

function currentSupportSender(roleOverride = "") {
  const role = roleOverride || (canHandleSupportChats() ? "support" : "customer");
  return {
    id: currentUser?.uid || supportVisitorId(),
    name: currentProfile?.name || currentUser?.displayName || currentUser?.email || "Gast",
    email: currentUser?.email || currentProfile?.email || "",
    role
  };
}

function supportWidgetSenderRole() {
  return canHandleSupportChats() && supportWidgetMode === "support" ? "support" : "customer";
}

async function ensureSupportWriteAuth() {
  if (!auth || currentUser) return currentUser;
  const result = await auth.signInAnonymously();
  currentUser = result.user;
  currentProfile = await safeEnsureUserProfile(result.user);
  return currentUser;
}

async function ensureSupportChat(roleOverride = "") {
  if (!db) return "";
  if (activeSupportChatId) return activeSupportChatId;
  const sender = currentSupportSender(roleOverride || supportWidgetSenderRole());
  if (sender.role === "support") return "";
  const ref = db.collection("supportChats").doc();
  await ref.set({
    status: "open",
    customerId: sender.role === "customer" ? sender.id : "",
    customerName: sender.role === "customer" ? sender.name : "Support-Chat",
    customerEmail: sender.email || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    closedAt: null,
    closedBy: null,
    typingCustomerAt: null,
    typingSupportAt: null
  });
  activeSupportChatId = ref.id;
  localStorage.setItem("entfalta_support_chat", activeSupportChatId);
  listenToSupportMessages();
  return activeSupportChatId;
}

function listenToSupportPresence() {
  if (!db || unsubscribeSupportPresence) return;
  unsubscribeSupportPresence = db.collection("supportPresence").onSnapshot((snapshot) => {
    supportPresence = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderSupport();
    renderCustomerSupportWidget();
  }, (error) => {
    console.warn("Support-Anwesenheit konnte nicht geladen werden.", error);
    supportPresence = [];
    renderSupport();
    renderCustomerSupportWidget();
  });
}

function listenToSupportChats() {
  if (!db || unsubscribeSupportChats || !canHandleSupportChats()) return;
  unsubscribeSupportChats = db.collection("supportChats").orderBy("updatedAt", "desc").limit(30).onSnapshot((snapshot) => {
    supportChats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    cleanupArchivedSupportChats();
    renderSupport();
  });
}

function listenToSupportAssignees() {
  if (!db || unsubscribeSupportAssignees || !canHandleSupportChats()) return;
  unsubscribeSupportAssignees = db.collection("users").onSnapshot((snapshot) => {
    supportAssignees = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((user) => (user.admin || user.support) && !user.disabled && user.id !== currentUser?.uid);
    renderSupport();
    renderCustomerSupportWidget();
  }, (error) => {
    console.warn("Support-Empfänger konnten nicht geladen werden.", error);
    supportAssignees = [];
  });
}

function listenToActiveSupportChat() {
  if (!db || !activeSupportChatId) return;
  if (unsubscribeActiveSupportChat) unsubscribeActiveSupportChat();
  unsubscribeActiveSupportChat = db.collection("supportChats").doc(activeSupportChatId).onSnapshot((snapshot) => {
    if (!snapshot.exists) return;
    const chat = { id: snapshot.id, ...snapshot.data() };
    if (chat.status === "closed") {
      const closedByMe = chat.closedBy && chat.closedBy === currentSupportSender().id;
      clearActiveSupportChatAfterNotice(closedByMe ? "Chat beendet." : "Chat wurde von Gegenüber beendet.");
      return;
    }
    const index = supportChats.findIndex((entry) => entry.id === chat.id);
    if (index >= 0) supportChats[index] = chat;
    else supportChats.unshift(chat);
    renderSupportTyping(chat);
  });
}

function listenToSupportMessages() {
  if (!db || !activeSupportChatId) return;
  if (unsubscribeSupportMessages) unsubscribeSupportMessages();
  listenToActiveSupportChat();
  unsubscribeSupportMessages = db.collection("supportChats").doc(activeSupportChatId).collection("messages").orderBy("createdAt", "asc").onSnapshot((snapshot) => {
    supportMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const latest = supportMessages[supportMessages.length - 1];
    if (latest && latest.id !== lastSupportMessageId) {
      if (lastSupportMessageId && canHandleSupportChats() && latest.senderRole === "customer") notifySupportMessage(latest);
      lastSupportMessageId = latest.id;
    }
    renderSupportMessages();
    renderCustomerSupportMessages();
  });
}

function notifySupportMessage(message) {
  if (currentProfile?.supportNotifications === false) return;
  const activeChat = supportChats.find((chat) => chat.id === activeSupportChatId);
  if (activeChat?.assignedTo && activeChat.assignedTo !== currentUser?.uid) return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") Notification.requestPermission();
  if (Notification.permission === "granted") {
    new Notification("Neue Support-Nachricht", {
      body: `${message.senderName || "Kunde"}: ${message.text || ""}`,
      icon: "favicon.png"
    });
  }
}

async function updateSupportPresence(status) {
  if (!db || !isSupportTeam() || !currentUser) return;
  await db.collection("supportPresence").doc(currentUser.uid).set({
    name: currentProfile?.name || currentUser.email || "Support",
    email: currentUser.email || "",
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  showToast(`Support-Status: ${supportStatusText(status)}`);
}

async function updateSupportNotificationSetting(enabled) {
  if (!db || !currentUser || !canHandleSupportChats()) return;
  await db.collection("users").doc(currentUser.uid).set({
    supportNotifications: Boolean(enabled),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  currentProfile = { ...(currentProfile || {}), supportNotifications: Boolean(enabled) };
  showToast(enabled ? "Support-Benachrichtigungen aktiviert." : "Support-Benachrichtigungen deaktiviert.");
}

function renderSupport() {
  if (!isSupportPage()) return;
  protectSupportPage();
  if (!isSupportTeam()) return;
  const adminPanel = $("#supportAdminPanel");
  const chatPanel = $(".support-chat-panel");
  if (!isSupportTeam()) {
    $("#supportAvailability").textContent = "Diese Support-Ansicht ist nur für Admins und Support-Mitarbeiter. Für Kunden ist der Live-Chat unten rechts auf der Webseite.";
    adminPanel?.classList.add("hidden");
    chatPanel?.classList.add("hidden");
    return;
  }

  $("#supportAvailability").textContent = supportAvailabilityText();
  adminPanel?.classList.remove("hidden");
  chatPanel?.classList.remove("hidden");
  const select = $("#supportPresenceSelect");
  if (select && currentUser) {
    const mine = supportPresence.find((entry) => entry.id === currentUser.uid);
    select.value = mine?.status || "away";
  }
  const notificationToggle = $("#supportNotificationsToggle");
  if (notificationToggle) notificationToggle.checked = currentProfile?.supportNotifications !== false;
  const archiveButton = $("#toggleSupportArchive");
  if (archiveButton) archiveButton.textContent = showArchivedSupportChats ? "Offene Fälle anzeigen" : "Archivierte Fälle anzeigen";
  renderSupportChatList();
  renderSupportMessages();
}

function renderSupportChatList() {
  const list = $("#supportChatList");
  if (!list || !isSupportTeam()) return;
  const visibleChats = supportChats.filter((chat) => showArchivedSupportChats ? chat.status === "closed" : chat.status !== "closed");
  list.innerHTML = visibleChats.length ? visibleChats.map((chat) => `
    <div class="admin-item support-chat-list-item ${chat.id === activeSupportChatId ? "is-active" : ""}">
      <strong>${escapeHtml(chat.customerName || "Chat")}</strong>
      <p>${escapeHtml(chat.customerEmail || "")}</p>
      ${supportAssignmentText(chat)}
      <p>Status: ${chat.status === "closed" ? `Archiviert${supportClosedText(chat)}` : "Offen"}</p>
      <div class="admin-actions">
        <button type="button" data-support-open="${chat.id}">Verlauf ansehen</button>
        ${chat.status !== "closed" && chat.assignedTo !== currentUser?.uid ? `<button type="button" data-support-take="${chat.id}">Den nehme ich</button>` : ""}
        ${chat.status !== "closed" ? supportAssignmentControls(chat) : ""}
        ${chat.status === "closed"
          ? `<button type="button" data-support-delete="${chat.id}">Endgültig löschen</button>`
          : `<button type="button" data-support-close="${chat.id}">Fall schließen</button>`}
      </div>
    </div>
  `).join("") : `<p class="muted">${showArchivedSupportChats ? "Keine archivierten Fälle." : "Keine offenen Support-Fälle."}</p>`;
}

function supportAssignmentText(chat) {
  if (!chat.assignedToName) return `<p class="muted">Nicht zugewiesen</p>`;
  return `<p class="muted">Zugewiesen an: ${escapeHtml(chat.assignedToName)}</p>`;
}

function supportAssignmentControls(chat) {
  const options = supportAssignees.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.email || "Support")}</option>`).join("");
  return `
    <select data-support-assign-select="${chat.id}">
      <option value="">Bestimmten Support wählen</option>
      ${options}
    </select>
    <button type="button" data-support-assign-random="${chat.id}">Zufällig weitergeben</button>
    <button type="button" data-support-assign-selected="${chat.id}">Weitergeben</button>
  `;
}

function renderSupportMessages() {
  const box = $("#supportMessages");
  if (!box) return;
  if (supportChatClosedNotice) {
    box.innerHTML = `<p class="support-ended-notice">${escapeHtml(supportChatClosedNotice)}</p>`;
    return;
  }
  box.innerHTML = supportMessages.length ? supportMessages.map((message) => `
    <div class="support-message ${message.senderRole === "support" ? "is-support" : "is-customer"}">
      <strong>${escapeHtml(message.senderName || (message.senderRole === "support" ? "Support" : "Kunde"))}</strong>
      <p>${escapeHtml(message.text || "")}</p>
    </div>
  `).join("") : `<p class="muted">Schreibe uns eine Nachricht. Wenn niemand anwesend ist, melden wir uns so schnell wie möglich.</p>`;
  box.scrollTop = box.scrollHeight;
}

function renderSupportTyping(chat) {
  const typing = $("#supportTyping");
  if (!typing || !chat) return;
  const now = Date.now();
  const customerTyping = timestampToMs(chat.typingCustomerAt) > now - 5000;
  const supportTyping = timestampToMs(chat.typingSupportAt) > now - 5000;
  const shouldShow = canHandleSupportChats() ? customerTyping : supportTyping;
  typing.classList.toggle("hidden", !shouldShow);
  renderCustomerSupportTyping(chat);
}

function clearActiveSupportChatAfterNotice(message) {
  supportChatClosedNotice = message;
  renderCustomerSupportMessages();
  if (isSupportPage()) renderSupportMessages();
  window.clearTimeout(supportChatClosedTimer);
  supportChatClosedTimer = window.setTimeout(() => {
    activeSupportChatId = "";
    supportMessages = [];
    supportChatClosedNotice = "";
    localStorage.removeItem("entfalta_support_chat");
    if (unsubscribeSupportMessages) {
      unsubscribeSupportMessages();
      unsubscribeSupportMessages = null;
    }
    if (unsubscribeActiveSupportChat) {
      unsubscribeActiveSupportChat();
      unsubscribeActiveSupportChat = null;
    }
    renderCustomerSupportMessages();
    if (isSupportPage()) renderSupportMessages();
  }, 2600);
}

function ensureCustomerSupportWidget() {
  if ($("#customerSupportWidget")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <aside id="customerSupportWidget" class="customer-support-widget hidden" aria-live="polite">
      <button id="customerSupportToggle" class="customer-support-toggle" type="button" aria-expanded="false" aria-controls="customerSupportPanel">
        <span class="customer-support-dot" aria-hidden="true"></span>
        <span>Live-Chat</span>
      </button>
      <section id="customerSupportPanel" class="customer-support-panel hidden" aria-label="Live-Chat Support">
        <div class="customer-support-head">
          <div>
            <strong>Live-Chat</strong>
            <p id="customerSupportAvailability">Support wird geladen...</p>
          </div>
          <button id="customerSupportMinimize" class="icon-button" type="button" aria-label="Chat minimieren">X</button>
        </div>
        <div id="supportWidgetAdminTools" class="support-widget-admin-tools hidden">
          <div class="support-widget-mode" role="group" aria-label="Chat-Modus">
            <button type="button" data-support-widget-mode="customer">Ich brauche Hilfe</button>
            <button type="button" data-support-widget-mode="support">Support helfen</button>
          </div>
          <div id="supportWidgetChatList" class="support-widget-chat-list hidden"></div>
          <div id="supportWidgetAssignBox" class="support-widget-assign-box hidden"></div>
        </div>
        <div id="customerSupportMessages" class="support-messages customer-support-messages"></div>
        <p id="customerSupportTyping" class="muted support-typing hidden">Support schreibt<span>.</span><span>.</span><span>.</span></p>
        <form id="customerSupportForm" class="support-chat-form">
          <textarea name="message" rows="2" placeholder="Nachricht schreiben..." required></textarea>
          <div class="customer-support-actions">
            <button type="submit">Senden</button>
            <button type="button" id="customerSupportClose">Chat beenden</button>
          </div>
        </form>
      </section>
    </aside>
  `);

  $("#customerSupportToggle")?.addEventListener("click", () => {
    const panel = $("#customerSupportPanel");
    const toggle = $("#customerSupportToggle");
    const isOpen = panel?.classList.toggle("hidden") === false;
    toggle?.setAttribute("aria-expanded", String(isOpen));
    if (isOpen && canHandleSupportChats()) listenToSupportChats();
    if (isOpen && activeSupportChatId && !unsubscribeSupportMessages) listenToSupportMessages();
    renderCustomerSupportMessages();
  });
  $("#customerSupportMinimize")?.addEventListener("click", () => {
    $("#customerSupportPanel")?.classList.add("hidden");
    $("#customerSupportToggle")?.setAttribute("aria-expanded", "false");
  });
  $("#customerSupportForm")?.addEventListener("submit", sendSupportMessage);
  $("#customerSupportForm textarea")?.addEventListener("input", () => {
    window.clearTimeout(supportTypingTimer);
    supportTypingTimer = window.setTimeout(setSupportTyping, 120);
  });
  $("#customerSupportClose")?.addEventListener("click", () => closeSupportChat());
  $("#supportWidgetAdminTools")?.addEventListener("click", (event) => {
    const modeTarget = event.target.closest("[data-support-widget-mode]");
    const chatTarget = event.target.closest("[data-support-widget-open]");
    const takeTarget = event.target.closest("[data-support-widget-take]");
    const assignRandomTarget = event.target.closest("[data-support-widget-assign-random]");
    const assignSelectedTarget = event.target.closest("[data-support-widget-assign-selected]");
    if (modeTarget) {
      supportWidgetMode = modeTarget.dataset.supportWidgetMode;
      localStorage.setItem("entfalta_support_widget_mode", supportWidgetMode);
      if (supportWidgetMode === "customer") {
        activeSupportChatId = "";
        supportMessages = [];
        localStorage.removeItem("entfalta_support_chat");
      }
      renderCustomerSupportWidget();
      return;
    }
    if (chatTarget) openSupportChat(chatTarget.dataset.supportWidgetOpen);
    if (takeTarget) takeSupportChat(takeTarget.dataset.supportWidgetTake);
    if (assignRandomTarget) assignSupportChat(assignRandomTarget.dataset.supportWidgetAssignRandom, "random");
    if (assignSelectedTarget) assignSupportChat(assignSelectedTarget.dataset.supportWidgetAssignSelected, $("#supportWidgetAssignSelect")?.value || "");
  });
}

function renderCustomerSupportWidget() {
  ensureCustomerSupportWidget();
  const widget = $("#customerSupportWidget");
  if (!widget) return;
  if (canHandleSupportChats() && !["customer", "support"].includes(supportWidgetMode)) supportWidgetMode = "customer";
  widget.classList.toggle("hidden", !shouldShowCustomerSupportWidget());
  $("#customerSupportAvailability").textContent = supportAvailabilityText();
  const status = bestSupportStatus();
  widget.dataset.status = status;
  if (activeSupportChatId && shouldShowCustomerSupportWidget() && !unsubscribeSupportMessages) listenToSupportMessages();
  renderSupportWidgetAdminTools();
  renderCustomerSupportMessages();
}

function renderSupportWidgetAdminTools() {
  const tools = $("#supportWidgetAdminTools");
  const list = $("#supportWidgetChatList");
  const assignBox = $("#supportWidgetAssignBox");
  if (!tools || !list || !assignBox) return;
  tools.classList.toggle("hidden", !canHandleSupportChats());
  if (!canHandleSupportChats()) {
    list.classList.add("hidden");
    assignBox.classList.add("hidden");
    return;
  }
  tools.querySelectorAll("[data-support-widget-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.supportWidgetMode === supportWidgetMode);
  });
  list.classList.toggle("hidden", supportWidgetMode !== "support");
  assignBox.classList.toggle("hidden", supportWidgetMode !== "support" || !activeSupportChatId);
  if (supportWidgetMode === "support" && activeSupportChatId) {
    const options = supportAssignees.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.email || "Support")}</option>`).join("");
    assignBox.innerHTML = `
      <select id="supportWidgetAssignSelect">
        <option value="">Weitergeben an...</option>
        ${options}
      </select>
      <button type="button" data-support-widget-assign-random="${activeSupportChatId}">Zufällig</button>
      <button type="button" data-support-widget-assign-selected="${activeSupportChatId}">Weitergeben</button>
    `;
  } else {
    assignBox.innerHTML = "";
  }
  if (supportWidgetMode !== "support") return;
  const openChats = supportChats.filter((chat) => chat.status !== "closed");
  list.innerHTML = openChats.length ? openChats.map((chat) => `
    <div class="support-widget-chat-entry ${chat.id === activeSupportChatId ? "is-active" : ""}">
      <button type="button" data-support-widget-open="${chat.id}">
        <strong>${escapeHtml(chat.customerName || "Chat")}</strong>
        <span>${escapeHtml(chat.lastMessage || chat.customerEmail || "Offener Fall")}</span>
        <small>${chat.assignedToName ? `Bei ${escapeHtml(chat.assignedToName)}` : "Noch frei"}</small>
      </button>
      ${chat.assignedTo !== currentUser?.uid ? `<button type="button" data-support-widget-take="${chat.id}">Den nehme ich</button>` : ""}
    </div>
  `).join("") : `<p class="muted">Keine offenen Fälle.</p>`;
}

function renderCustomerSupportMessages() {
  const box = $("#customerSupportMessages");
  if (!box) return;
  if (supportChatClosedNotice) {
    box.innerHTML = `<p class="support-ended-notice">${escapeHtml(supportChatClosedNotice)}</p>`;
    return;
  }
  if (canHandleSupportChats() && supportWidgetMode === "support" && !activeSupportChatId) {
    box.innerHTML = `<p class="muted">Wähle oben einen offenen Support-Fall aus.</p>`;
    return;
  }
  if (!activeSupportChatId) {
    box.innerHTML = `<p class="muted">${escapeHtml(supportAvailabilityText())}</p>`;
    return;
  }
  box.innerHTML = supportMessages.length ? supportMessages.map((message) => `
    <div class="support-message ${message.senderRole === "support" ? "is-support" : "is-customer"}">
      <strong>${escapeHtml(message.senderName || (message.senderRole === "support" ? "Support" : "Du"))}</strong>
      <p>${escapeHtml(message.text || "")}</p>
    </div>
  `).join("") : `<p class="muted">${escapeHtml(supportAvailabilityText())}</p>`;
  box.scrollTop = box.scrollHeight;
}

function renderCustomerSupportTyping(chat) {
  const typing = $("#customerSupportTyping");
  if (!typing || !chat) return;
  const isTyping = timestampToMs(chat.typingSupportAt) > Date.now() - 5000;
  typing.classList.toggle("hidden", !isTyping);
}

async function sendSupportMessage(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const text = String(new FormData(form).get("message") || "").trim();
  if (!text) return;
  if (canHandleSupportChats() && supportWidgetMode === "support" && !activeSupportChatId) {
    showToast("Bitte erst einen Support-Fall auswählen.");
    return;
  }
  submitButton?.setAttribute("disabled", "disabled");
  try {
    await ensureSupportWriteAuth();
    const role = form.id === "supportChatForm" ? "support" : supportWidgetSenderRole();
    const chatId = activeSupportChatId || await ensureSupportChat(role);
    if (!chatId) {
      showToast("Bitte erst einen Support-Fall auswählen.");
      return;
    }
    const sender = currentSupportSender(role);
    await db.collection("supportChats").doc(chatId).collection("messages").add({
      text,
      senderId: sender.id,
      senderName: sender.name,
      senderRole: sender.role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection("supportChats").doc(chatId).set({
      status: "open",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: text,
      lastSenderRole: sender.role
    }, { merge: true });
    form.reset();
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

async function setSupportTyping() {
  if (!db || !activeSupportChatId) return;
  const field = canHandleSupportChats() && supportWidgetMode === "support" ? "typingSupportAt" : "typingCustomerAt";
  await db.collection("supportChats").doc(activeSupportChatId).set({
    [field]: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function closeSupportChat(chatId = activeSupportChatId) {
  if (!chatId && !(canHandleSupportChats() && supportWidgetMode === "support")) chatId = await ensureSupportChat();
  if (!chatId || !confirm("Diesen Support-Chat wirklich beenden?")) return;
  await db.collection("supportChats").doc(chatId).set({
    status: "closed",
    closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    closedAtMs: Date.now(),
    closedBy: currentSupportSender().id,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  clearActiveSupportChatAfterNotice("Chat beendet.");
}

function supportClosedText(chat) {
  const closedMs = Number(chat.closedAtMs || 0) || timestampToMs(chat.closedAt);
  if (!closedMs) return "";
  return ` seit ${new Date(closedMs).toLocaleDateString("de-DE")}`;
}

async function cleanupArchivedSupportChats() {
  if (!db || !isSupportTeam()) return;
  const maxAge = Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const expired = await db.collection("supportChats").where("closedAtMs", "<", maxAge).limit(20).get();
  for (const doc of expired.docs) {
    if (doc.data()?.status === "closed") await deleteSupportChat(doc.id, { silent: true });
  }
}

async function deleteSupportChat(chatId, options = {}) {
  if (!db || !isSupportTeam() || !chatId) return;
  if (!options.silent && !confirm("Diesen Support-Fall endgültig für alle löschen?")) return;
  const chatRef = db.collection("supportChats").doc(chatId);
  const messages = await chatRef.collection("messages").limit(450).get();
  const batch = db.batch();
  messages.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(chatRef);
  await batch.commit();
  supportChats = supportChats.filter((chat) => chat.id !== chatId);
  if (activeSupportChatId === chatId) {
    activeSupportChatId = "";
    supportMessages = [];
    localStorage.removeItem("entfalta_support_chat");
    renderSupportMessages();
  }
  renderSupport();
  if (!options.silent) showToast("Support-Fall endgültig gelöscht.");
}

async function assignSupportChat(chatId, assigneeId = "") {
  if (!db || !canHandleSupportChats() || !chatId) return;
  let assignee = assigneeId === currentUser?.uid
    ? { id: currentUser.uid, name: currentProfile?.name || currentUser.email || "Support" }
    : supportAssignees.find((user) => user.id === assigneeId);
  if (!assignee && assigneeId === "random") {
    const choices = supportAssignees.length ? supportAssignees : [{ id: currentUser.uid, name: currentProfile?.name || currentUser.email || "Support" }];
    assignee = choices[Math.floor(Math.random() * choices.length)];
  }
  if (!assignee) return showToast("Bitte einen Support auswählen.");
  await db.collection("supportChats").doc(chatId).set({
    assignedTo: assignee.id,
    assignedToName: assignee.name || assignee.email || "Support",
    assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
    assignedBy: currentUser?.uid || null
  }, { merge: true });
  showToast("Support-Fall intern weitergegeben.");
}

async function takeSupportChat(chatId) {
  if (!currentUser || !canHandleSupportChats()) return;
  await assignSupportChat(chatId, currentUser.uid);
  openSupportChat(chatId);
  showToast("Support-Fall übernommen.");
}

function openSupportChat(chatId) {
  activeSupportChatId = chatId;
  localStorage.setItem("entfalta_support_chat", chatId);
  supportMessages = [];
  listenToSupportMessages();
  renderSupport();
}

const userRoleTextBeforeSupport = userRoleText;
userRoleText = function userRoleText(user) {
  if (user.disabled) return "Gesperrt";
  if (user.admin) return "Admin";
  if (user.support) return "Support";
  return userRoleTextBeforeSupport(user);
};

const renderUserManagementBeforeSupport = renderUserManagement;
renderUserManagement = function renderUserManagement() {
  renderUserManagementBeforeSupport();
  document.querySelectorAll("[data-user-support-ready]").forEach((node) => node.remove());
  document.querySelectorAll("#userManagementList .admin-item").forEach((item, index) => {
    const user = managedUsers.filter((entry) => userMatchesSearch(entry, userSearchQuery()))[index];
    if (!user) return;
    const actions = item.querySelector(".admin-actions");
    if (!actions || actions.querySelector("[data-user-support]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.userSupport = user.id;
    button.dataset.userSupportReady = "true";
    button.disabled = currentUser?.uid === user.id;
    button.textContent = user.support ? "Support entfernen" : "Zum Support machen";
    actions.insertBefore(button, actions.children[1] || null);
  });
};

async function toggleUserSupport(userId) {
  if (!isAdmin() || userId === currentUser?.uid) return;
  const user = managedUsers.find((entry) => entry.id === userId);
  if (!user) return;
  const nextSupport = !Boolean(user.support);
  await db.collection("users").doc(userId).set({
    support: nextSupport,
    admin: nextSupport ? false : Boolean(user.admin),
    roleChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
    roleChangedBy: currentUser?.uid || null
  }, { merge: true });
  user.support = nextSupport;
  if (nextSupport) user.admin = false;
  renderUserManagement();
  showToast(nextSupport ? "Nutzer ist jetzt Support." : "Support-Rolle entfernt.");
}

const renderAllBeforeSupport = renderAll;
renderAll = function renderAll() {
  renderAllBeforeSupport();
  listenToSupportPresence();
  if (canHandleSupportChats()) {
    listenToSupportChats();
    listenToSupportAssignees();
  }
  if (isSupportPage()) {
    if (activeSupportChatId) listenToSupportMessages();
    renderSupport();
  }
  renderCustomerSupportWidget();
};

document.addEventListener("DOMContentLoaded", () => {
  protectSupportPage();
  renderCustomerSupportWidget();
  $("#supportPresenceSelect")?.addEventListener("change", (event) => updateSupportPresence(event.target.value));
  $("#supportNotificationsToggle")?.addEventListener("change", (event) => updateSupportNotificationSetting(event.target.checked));
  $("#supportChatForm")?.addEventListener("submit", sendSupportMessage);
  $("#supportChatForm textarea")?.addEventListener("input", () => {
    window.clearTimeout(supportTypingTimer);
    supportTypingTimer = window.setTimeout(setSupportTyping, 120);
  });
  $("#closeSupportChat")?.addEventListener("click", () => closeSupportChat());
  $("#toggleSupportArchive")?.addEventListener("click", () => {
    showArchivedSupportChats = !showArchivedSupportChats;
    renderSupport();
  });
  $("#supportChatList")?.addEventListener("click", (event) => {
    const openTarget = event.target.closest("[data-support-open]");
    const closeTarget = event.target.closest("[data-support-close]");
    const deleteTarget = event.target.closest("[data-support-delete]");
    const takeTarget = event.target.closest("[data-support-take]");
    const assignRandomTarget = event.target.closest("[data-support-assign-random]");
    const assignSelectedTarget = event.target.closest("[data-support-assign-selected]");
    if (openTarget) openSupportChat(openTarget.dataset.supportOpen);
    if (closeTarget) closeSupportChat(closeTarget.dataset.supportClose);
    if (deleteTarget) deleteSupportChat(deleteTarget.dataset.supportDelete);
    if (takeTarget) takeSupportChat(takeTarget.dataset.supportTake);
    if (assignRandomTarget) assignSupportChat(assignRandomTarget.dataset.supportAssignRandom, "random");
    if (assignSelectedTarget) {
      const chatId = assignSelectedTarget.dataset.supportAssignSelected;
      const select = document.querySelector(`[data-support-assign-select="${CSS.escape(chatId)}"]`);
      assignSupportChat(chatId, select?.value || "");
    }
  });
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-user-support]");
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await toggleUserSupport(target.dataset.userSupport);
}, true);

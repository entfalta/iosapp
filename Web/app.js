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
let realtimeDb = null;
const firebaseApps = {};
const firebaseStores = {};
const firebaseRealtimeDbs = {};
let websiteSettings = { appPromoEnabled: false };
let currentUser = null;
let currentProfile = null;
let authReady = false;
let profileReady = false;
let books = [];
let orders = [];
let customerOrders = [];
let cart = [];
let cartStorageRestored = false;
let activeCategory = "all";
let paymentSettings = { fees: [], discounts: [] };
let showArchivedOrders = false;
let coverOptions = [];
let pdfOptions = [];
let productOptions = [];
let previewOptions = [];
let newsletterImageOptions = [];
let newsletterPosts = [];
let appliedDiscounts = { discount: null, voucher: null, promo: null };
let liveSessions = [];
let errorReports = [];
let showStatsPanel = false;
let isbnFilterMode = "all";
let giftVoucherCodeFilterMode = "all";
let checkoutRequestInProgress = false;
const STRIPE_PUBLISHABLE_KEY = "";
const BACKEND_BASE_STORAGE_KEY = "entfalta_backend_base_url";
function backendUrl(functionName) {
  let configured = "";
  try {
    configured = String(localStorage.getItem(BACKEND_BASE_STORAGE_KEY) || "").trim();
  } catch {}

  let configuredBase = String(configured || window.BUCHMARKT_BACKEND_BASE_URL || "").trim().replace(/\/+$/, "");
  let configuredBase = String(configured || window.BUCHMARKT_BACKEND_BASE_URL || "https://entfalta-back.netlify.app").trim().replace(/\/+$/, "");

  if (configuredBase.includes("backend.entfalta.com") || configuredBase.includes("dein-backend.netlify.app") || configuredBase.includes("entfalta-back.netlify.app")) {
  if (configuredBase.includes("backend.entfalta.com") || configuredBase.includes("dein-backend.netlify.app")) {
    configuredBase = "";
    try {
      localStorage.removeItem(BACKEND_BASE_STORAGE_KEY);
    } catch {}
  }

  if (configuredBase) {
    return `${configuredBase}/.netlify/functions/${functionName}`;
  }

  const isLocal = window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (isLocal) {
    return `http://localhost:8888/.netlify/functions/${functionName}`;
  }

  return `/.netlify/functions/${functionName}`;
}

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
const ARCHIVE_RETENTION_DAYS = 3650;
const postcodeCache = new Map();

(function setDefaultAnalyticsConsent() {
  let granted = false;
  try {
    granted = localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {}
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = !granted;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: granted ? "granted" : "denied",
    wait_for_update: 500
  });
})();

function $(selector) {
  return document.querySelector(selector);
}

function pageHref(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `/${cleanPath}`;
}

function formField(form, name) {
  if (!form || typeof form !== "object" || !form.elements || typeof form.elements.namedItem !== "function") {
    return null;
  }
  return form.elements.namedItem(name);
}

async function postToBackend(functionName, payload) {
  const response = await fetch(backendUrl(functionName), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload)
  });
  const data = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) throw new Error(data.error || `Backend-Fehler: ${response.status}`);
  return data;
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

function publicProfilePhoto(profile = currentProfile) {
  return profile?.profilePhotoPublic && profile?.profilePhotoDataUrl ? profile.profilePhotoDataUrl : "";
}

function renderAccountAvatars() {
  const photo = currentProfile?.profilePhotoDataUrl || "";
  document.querySelectorAll(".user-button").forEach((button) => {
    button.classList.toggle("has-profile-photo", Boolean(photo));
    if (photo) button.style.setProperty("--profile-photo", `url(${photo})`);
    else button.style.removeProperty("--profile-photo");
  });
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

async function resizeImageForFirestore(file, options = {}) {
  if (!file) return "";
  const label = options.label || "Bild";
  const maxBytes = Number(options.maxBytes || 5 * 1024 * 1024);
  const maxDimension = Number(options.maxDimension || 512);
  const maxOutputLength = Number(options.maxOutputLength || 650000); // Higher safety for 1MB Firestore limit
  if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
  if (file.size > maxBytes) throw new Error(`${label} darf maximal ${Math.round(maxBytes / 1024 / 1024)} MB groß sein.`);
  const dataUrl = await readImageFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  let quality = 0.82;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > maxOutputLength && quality > 0.4) {
    quality -= 0.1;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  if (output.length > 950000) throw new Error("Das Bild ist trotz Komprimierung zu groß für Firestore (Limit 1MB). Bitte ein kleineres Bild wählen.");
  return output;
}

async function resizeProfileImage(file) {
  return resizeImageForFirestore(file, { label: "Profilbild", maxDimension: 512, maxOutputLength: 850000 });
}

async function resizeNewsletterImage(file) {
  return resizeImageForFirestore(file, { label: "Newsletterbild", maxDimension: 1000, maxOutputLength: 600000 });
}

async function resizeShopAssetImage(file, label = "Bild") {
  return resizeImageForFirestore(file, { label, maxDimension: 1000, maxOutputLength: 600000 });
}

async function lookupGermanPostcode(postcode) {
  if (!/^\d{5}$/.test(postcode)) return null;
  postcodeCache.set(postcode, null);
  return null;
}

async function autofillCityFromPostcode(field, options = {}) {
  if (!field) return;
  field.setCustomValidity("");
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
  coverOptions = await loadAssetList("covers");
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
  select.innerHTML = choices.map((image) => `<option value="${escapeHtml(image.src)}">${escapeHtml(image.name || image.src)}${image.label ? ` (${escapeHtml(image.label)})` : ""}</option>`).join("");
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

function selectedThemeMode() {
  return ["light", "dark", "system"].includes(currentProfile?.themeMode) ? currentProfile.themeMode : "system";
}

function preferredDarkMode() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
}

function applyDesignMode() {
  const mode = selectedDesignMode();
  document.body.classList.toggle("design-classic", mode === "classic");
  document.body.classList.toggle("design-modern", mode !== "classic");
  applyThemeMode();
  applyPerformanceMode();
}

function applyThemeMode() {
  if (!document.body) return;
  const mode = selectedThemeMode();
  const dark = mode === "dark" || (mode === "system" && preferredDarkMode());
  document.body.classList.toggle("theme-dark", dark);
  document.body.dataset.themeMode = mode;
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

function ensureDefaultFirebaseApp() {
  if (!window.firebase) return false;
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(window.BUCHMARKT_FIREBASE_CONFIG);
    }
    return true;
  } catch (error) {
    console.warn("Firebase-Default-App konnte nicht initialisiert werden.", error);
    return false;
  }
}

function firebaseReady() {
  const config = window.BUCHMARKT_FIREBASE_CONFIG;
  return window.firebase && config?.apiKey && !config.apiKey.startsWith("DEINE_");
}

function projectConfigReady(project) {
  const config = project?.config || project;
  return Boolean(config?.apiKey && config?.projectId && config?.appId);
}

function initializeNamedFirebaseApps() {
  const projects = window.BUCHMARKT_FIREBASE_PROJECTS || {};
  Object.entries(projects).forEach(([name, project]) => {
    if (!projectConfigReady(project)) return;
    const config = project.config || project;
    try {
      let app;
      if (name === "main") {
        app = firebase.apps?.length ? firebase.app() : null;
      } else {
        app = firebase.apps?.find(a => a.name === name) || firebase.initializeApp(config, name);
      }
      if (!app && name === "main") return;
      firebaseApps[name] = app;
      firebaseStores[name] = firebase.firestore(app);
      if (firebase.database && config.databaseURL) firebaseRealtimeDbs[name] = firebase.database(app);
    } catch (error) {
      console.warn(`Firebase-Projekt ${name} konnte nicht initialisiert werden.`, error);
    }
  });
  realtimeDb = firebaseRealtimeDbs.main || null;
}

if (firebaseReady()) {
  if (ensureDefaultFirebaseApp()) {
    auth = firebase.auth();
    db = firebase.firestore();
    window.auth = auth;
    window.db = db;
    initializeNamedFirebaseApps();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(() => {})
      .finally(bootFirebase);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      authReady = true;
      showToast("Firebase konnte nicht initialisiert werden. Bitte Seite neu laden.");
      renderAll();
    });
  }
} else {
  document.addEventListener("DOMContentLoaded", () => {
    authReady = true;
    showToast("Firebase ist noch nicht konfiguriert. Trage deine Daten in firebase-config.js ein.");
    renderAll();
  });
}

function listenToWebsiteSettings() {
  if (!db || listenToWebsiteSettings.unsubscribe) return;
  listenToWebsiteSettings.unsubscribe = db.collection("settings").doc("website").onSnapshot((snapshot) => {
    websiteSettings = snapshot.exists ? snapshot.data() : { appPromoEnabled: false };
    renderAppPromoBanner();
    renderAdminWebsiteSettings();
  }, (error) => {
    console.error(error);
  });
}

function bootFirebase() {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    window.currentUser = currentUser;
    profileReady = !user;

    if (user) {
      safeEnsureUserProfile(user).then((profile) => {
        currentProfile = profile;
        window.currentProfile = currentProfile;

        // ADMIN LISTENERS - Start immediately when admin profile is known
        if (profile?.admin) {
          listenToOrders();
          listenToLiveSessions();
          listenToIsbnEntries();
        }
      }).catch((error) => {
        console.error(error);
      }).finally(() => {
        profileReady = true;
        renderAccountAvatars();
        renderAll();
      });
    } else {
      currentProfile = null;
      window.currentProfile = null;
    }

    authReady = true;
    window.authReady = true;
    listenToWebsiteSettings();
    listenToBackendSettings();
    listenToCustomerOrders(user);
    listenToBooks();
    listenToNewsletter();
    listenToPaymentSettings();
    if (optionalStorageAllowed()) startLiveSession();

    renderAccountAvatars();
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
      zip: extra.zip || "",
      city: extra.city || "",
      admin: false
    };
  }
}

async function ensureUserProfile(user, extra = {}) {
  const isAnonymousGuest = Boolean(user.isAnonymous);
  const providerIds = (user.providerData || []).map((provider) => provider?.providerId).filter(Boolean);
  const userRef = db.collection("users").doc(user.uid);
  const snap = await userRef.get();
  if (snap.exists) {
    let profile = { id: snap.id, ...snap.data() };
    if (!isAnonymousGuest && user.email && profile.email !== user.email) {
      await userRef.set({
        email: user.email,
        emailSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      profile = { ...profile, email: user.email };
    }
    if (!isAnonymousGuest && providerIds.length) {
      await userRef.set({
        authProviders: firebase.firestore.FieldValue.arrayUnion(...providerIds),
        primaryAuthProvider: providerIds.includes("google.com") ? "google.com" : providerIds[0],
        authProvidersSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      profile = {
        ...profile,
        authProviders: [...new Set([...(profile.authProviders || []), ...providerIds])],
        primaryAuthProvider: providerIds.includes("google.com") ? "google.com" : (profile.primaryAuthProvider || providerIds[0])
      };
    }
    if (!isAnonymousGuest && (extra.street || extra.zip || extra.city)) {
      const addrUpdate = {};
      if (extra.street && extra.street !== profile.street) addrUpdate.street = extra.street;
      if (extra.zip && extra.zip !== profile.zip) addrUpdate.zip = extra.zip;
      if (extra.city && extra.city !== profile.city) addrUpdate.city = extra.city;
      if (Object.keys(addrUpdate).length) {
        addrUpdate.address = {
          street: extra.street || profile.street || "",
          zip: extra.zip || profile.zip || "",
          city: extra.city || profile.city || ""
        };
        await userRef.set(addrUpdate, { merge: true });
        profile = { ...profile, ...addrUpdate };
      }
    }
    if (!isAnonymousGuest && !profile.shortId) {
      profile.shortId = await getUniqueShortId(5);
      await userRef.set({ shortId: profile.shortId }, { merge: true });
    }
    if (!isAnonymousGuest && !profile.admin && await noAdminExists()) {
      await userRef.update({ admin: true, promotedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { ...profile, admin: true };
    }
    return profile;
  }

  const firstUser = (await db.collection("users").limit(1).get()).empty;
  const shortId = await getUniqueShortId(5);
  const profile = {
    name: extra.name || user.displayName || user.email?.split("@")[0] || (isAnonymousGuest ? "Gast" : "Kunde"),
    email: user.email || extra.email || "",
    shortId,
    street: extra.street || "",
    zip: extra.zip || "",
    city: extra.city || "",
    address: {
      street: extra.street || "",
      zip: extra.zip || "",
      city: extra.city || ""
    },
    admin: !isAnonymousGuest && firstUser,
    anonymous: isAnonymousGuest,
    authProviders: providerIds,
    primaryAuthProvider: providerIds.includes("google.com") ? "google.com" : (providerIds[0] || ""),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await userRef.set(profile, { merge: true });
  return { id: user.uid, ...profile };
}

async function noAdminExists() {
  const adminSnap = await db.collection("users").where("admin", "==", true).limit(1).get();
  return adminSnap.empty;
}

async function emailAlreadyUsesGoogle(email) {
  if (!db || !email) return false;
  try {
    const snap = await db.collection("users").where("email", "==", email).limit(5).get();
    return snap.docs.some((doc) => {
      const data = doc.data() || {};
      const providers = Array.isArray(data.authProviders) ? data.authProviders : [];
      return data.primaryAuthProvider === "google.com" || providers.includes("google.com");
    });
  } catch (error) {
    console.warn("Google-E-Mail-Prüfung über Firestore fehlgeschlagen.", error);
    return false;
  }
}

function listenToBooks() {
  if (!db || listenToBooks.unsubscribe) return;
  listenToBooks.unsubscribe = db.collection("books").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    books = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    checkWishlistStockNotifications();
    applyProductRouteFromPath();
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
    renderAdminShippingMethods();
    renderAdminDiscounts();
    renderBooks();
    renderCart();
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function normalizeBackendBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function applyBackendBaseUrl(value) {
  const normalized = normalizeBackendBaseUrl(value);
  if (!normalized) return false;
  window.BUCHMARKT_BACKEND_BASE_URL = normalized;
  try {
    localStorage.setItem(BACKEND_BASE_STORAGE_KEY, normalized);
  } catch {}
  return true;
}

function listenToBackendSettings() {
  if (!db || listenToBackendSettings.unsubscribe) return;
  listenToBackendSettings.unsubscribe = db.collection("settings").doc("backend").onSnapshot((snapshot) => {
    const baseUrl = snapshot.exists ? snapshot.data()?.baseUrl : "";
    if (baseUrl) applyBackendBaseUrl(baseUrl);
    renderBackendSettings();
  }, (error) => {
    console.error(error);
    renderBackendSettings();
  });
}

function listenToOrders() {
  if (!db || listenToOrders.unsubscribe) return;
  listenToOrders.unsubscribe = db.collection("orders").onSnapshot((snapshot) => {
    orders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
          // Use createdAtMs (client-side) or Firestore timestamp or a very high number for new ones
          const tA = a.createdAt?.toMillis?.() || a.createdAtMs || a.createdAt?.seconds * 1000 || Date.now() + 10000;
          const tB = b.createdAt?.toMillis?.() || b.createdAtMs || b.createdAt?.seconds * 1000 || Date.now() + 10000;
          return tB - tA;
      });
    cleanupOldArchivedOrders();
    renderAdminBooks();
  }, (error) => {
    console.error("Orders listener error:", error);
    showToast("Bestellungen konnten nicht geladen werden.");
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
      .filter((order) => orderIsPaid(order))
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
  return availableCartItems(cart).map((item) => {
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
  if (!db || !optionalStorageAllowed()) return;
  try {
    await db.collection("liveSessions").doc(liveSessionId()).set({
      userId: currentUser?.uid || null,
      name: currentProfile?.name || currentUser?.email || "Gast",
      email: currentUser?.email || "",
      platform: "web",
      area: "web",
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
  if (!optionalStorageAllowed()) return;
  window.clearTimeout(scheduleLiveSessionUpdate.timer);
  scheduleLiveSessionUpdate.timer = window.setTimeout(updateLiveSession, 650);
}

function startLiveSession() {
  if (!db || !optionalStorageAllowed()) return;
  if (startLiveSession.started) {
    updateLiveSession();
    return;
  }
  startLiveSession.started = true;
  updateLiveSession();
  startLiveSession.intervalId = window.setInterval(updateLiveSession, 30000);
  window.addEventListener("beforeunload", () => {
    try {
      db.collection("liveSessions").doc(liveSessionId()).set({ updatedAtMs: Date.now() - 180000 }, { merge: true });
    } catch {}
  });
}

function stopLiveSession() {
  window.clearTimeout(scheduleLiveSessionUpdate.timer);
  if (startLiveSession.intervalId) {
    window.clearInterval(startLiveSession.intervalId);
    startLiveSession.intervalId = null;
  }
  startLiveSession.started = false;
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

function generateShortId(length = 5) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function getUniqueShortId(length = 5) {
  const id = generateShortId(length);
  const snap = await db.collection("users").where("shortId", "==", id).limit(1).get();
  if (snap.empty) return id;
  return getUniqueShortId(length);
}

function isAdmin() {
  return Boolean(currentProfile?.admin);
}

function checkAdminAccess() {
  const adminPages = [
    "admin.html", "gutschein-admin.html", "lager.html", "isbn.html",
    "login-code.html", "check.html", "backend.html", "dangerzone.html",
    "upload-buecher.html", "firebase-handle.html", "nutzerverwaltung.html",
    "fehlermeldungen.html", "todo.html", "kauf-bestaetigung.html",
    "email-config.html", "auth-admin.html"
  ];
  const currentPage = window.location.pathname.split("/").pop();
  if (!adminPages.includes(currentPage)) return;

  if (!authReady) return;
  if (!currentUser) {
    window.location.href = pageHref("index.html");
    return;
  }

  // Warten, bis das Profil vollständig geladen ist. Solange ist kein Redirect erlaubt.
  if (!profileReady) return;

  if (!isAdmin()) {
    console.warn("Admin access denied for profile:", window.currentProfile?.email || currentUser.email);
    window.location.href = pageHref("index.html");
  }
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  const isError = shouldLogErrorMessage(message);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.toggle("is-success", !isError);
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 3500);
  if (isError) logErrorReport(message, "toast");
}

function showAuthMessage(message, type = "error") {
  const modal = $("#authModal .auth-modal-content");
  if (!modal) return showToast(message);
  let box = $("#authMessage");
  if (!box) {
    box = document.createElement("div");
    box.id = "authMessage";
    box.className = "auth-message hidden";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    const closeButton = modal.querySelector("#closeAuth");
    closeButton?.insertAdjacentElement("afterend", box) || modal.prepend(box);
  }
  box.textContent = message;
  box.classList.remove("hidden", "is-error", "is-success");
  box.classList.add(type === "success" ? "is-success" : "is-error");
  showToast(message);
}

function clearAuthMessage() {
  const box = $("#authMessage");
  if (!box) return;
  box.textContent = "";
  box.classList.add("hidden");
  box.classList.remove("is-error", "is-success");
}

function isErrorReportsPage() {
  return Boolean($("#errorReportsList"));
}

function shouldLogErrorMessage(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  const successWords = [
    "gespeichert", "erstellt", "eingeloggt", "angemeldet", "ausgeloggt", "gelöscht",
    "geloescht", "aktiviert", "deaktiviert", "abonniert", "abbestellt", "veröffentlicht",
    "wiederhergestellt", "archiviert", "übernommen", "weitergegeben", "gesendet",
    "ergänzt", "angewendet"
  ];
  if (successWords.some((word) => lower.includes(word))) return false;
  const errorWords = [
    "fehler", "firebase", "blockiert", "nicht bereit", "nicht konfiguriert", "nicht gefunden",
    "ungültig", "ungueltig", "fehl", "konnte nicht", "bitte", "nur admins", "leer",
    "erforderlich", "verweigert", "permission", "missing or insufficient permissions",
    "stripe", "passwort", "adresse", "hausnummer", "warenkorb ist leer"
  ];
  return errorWords.some((word) => lower.includes(word));
}

function errorReportUser() {
  return {
    userId: currentUser?.uid || "",
    name: currentProfile?.name || currentUser?.displayName || "",
    email: currentUser?.email || currentProfile?.email || "",
    role: isAdmin() ? "Admin" : currentProfile?.support ? "Support" : currentUser ? "Kunde" : "Gast"
  };
}

function errorReportPayload(message, source = "toast", details = {}) {
  return {
    message: String(message || "").slice(0, 1200),
    source,
    ...errorReportUser(),
    path: window.location.pathname || "index.html",
    url: window.location.href || "",
    userAgent: navigator.userAgent || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    resolved: false,
    ...details
  };
}

function logToastError(message) {
  if (!shouldLogErrorMessage(message)) return;
  logErrorReport(message, "toast");
}

function logErrorReport(message, source = "javascript", details = {}) {
  if (!db || !firebaseReady()) return;
  if (!currentUser) return;
  const key = `${source}:${message}:${window.location.pathname}:${currentUser.uid}`;
  const now = Date.now();
  if (logErrorReport.lastKey === key && now - Number(logErrorReport.lastAt || 0) < 6000) return;
  logErrorReport.lastKey = key;
  logErrorReport.lastAt = now;
  db.collection("errorReports").add(errorReportPayload(message, source, details)).catch((error) => {
    console.warn("Fehlermeldung konnte nicht gespeichert werden.", error);
  });
}

window.addEventListener("error", (event) => {
  const message = event.message || event.error?.message || "Unbekannter JavaScript-Fehler";
  logErrorReport(message, "javascript", {
    file: event.filename || "",
    line: event.lineno || null,
    column: event.colno || null,
    stack: String(event.error?.stack || "").slice(0, 2500)
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason?.message || String(reason || "Unbehandelte Promise-Fehlermeldung");
  logErrorReport(message, "promise", {
    stack: String(reason?.stack || "").slice(0, 2500)
  });
});

function analyticsConsentValue() {
  return localStorage.getItem(COOKIE_CONSENT_KEY);
}

function optionalStorageAllowed() {
  return analyticsConsentValue() === "accepted";
}

function restorePersistedCart() {
  if (cartStorageRestored) return;
  const storedCart = readJsonStorage(CART_STORAGE_KEY, []);
  if (!cart.length && Array.isArray(storedCart)) cart = storedCart;
  cartStorageRestored = true;
  renderCart();
}

function persistCartIfAllowed() {
  writeJsonStorage(CART_STORAGE_KEY, cart);
}

function availableCartItems(items = cart) {
  if (!Array.isArray(items)) return [];
  if (!books.length) {
    return items.filter((item) => item?.bookId && Number(item.quantity || 0) > 0);
  }
  return items.filter((item) => item?.bookId && Number(item.quantity || 0) > 0 && books.some((book) => book.id === item.bookId));
}

function cleanUnavailableCartItems() {
  if (!books.length || !Array.isArray(cart)) return;
  const cleaned = availableCartItems(cart);
  if (cleaned.length === cart.length) return;
  cart = cleaned;
  persistCartIfAllowed();
}

function cartVisibleCount(items = cart) {
  return availableCartItems(items).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function writeCheckoutData(value) {
  writeJsonStorage(CHECKOUT_STORAGE_KEY, value);
  try {
    sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

function readCheckoutData(fallback = null) {
  const localValue = readJsonStorage(CHECKOUT_STORAGE_KEY, null);
  if (localValue) return localValue;
  try {
    return JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

function clearCheckoutData() {
  localStorage.removeItem(CHECKOUT_STORAGE_KEY);
  sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}

function disableGoogleAnalytics() {
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: "denied" });
  }
  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.split("=")[0].trim();
    if (!name.startsWith("_ga") && !["_gid", "_gat"].includes(name)) return;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${window.location.hostname}; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname}; SameSite=Lax`;
  });
}

function loadGoogleAnalytics() {
  if (window.entfaltaAnalyticsLoaded || analyticsConsentValue() !== "accepted") return;
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  window.entfaltaAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("config", GA_MEASUREMENT_ID);
  if (document.querySelector(`script[src*="${GA_MEASUREMENT_ID}"]`)) return;
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
      <h2 id="cookieConsentTitle">Cookies & Browser-Speicher</h2>
      <p>Dein Warenkorb bleibt technisch notwendig im Browser gespeichert, damit er beim Seitenwechsel erhalten bleibt. Mit „Zulassen“ aktivierst du zusätzlich Google Analytics. Ohne Zustimmung wird Analytics nicht geladen.</p>
      <div class="cookie-consent-actions">
        <button type="button" id="rejectCookies">Ablehnen</button>
        <button type="button" id="acceptCookies">Zulassen</button>
      </div>
    </section>
  `);
  $("#acceptCookies")?.addEventListener("click", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    restorePersistedCart();
    persistCartIfAllowed();
    startLiveSession();
    if (isAdmin()) listenToLiveSessions();
    hideCookieBanner();
    loadGoogleAnalytics();
  });
  $("#rejectCookies")?.addEventListener("click", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    stopLiveSession();
    disableGoogleAnalytics();
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
    restorePersistedCart();
    hideCookieBanner();
    loadGoogleAnalytics();
    return;
  }
  if (consent === "rejected") {
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    stopLiveSession();
    disableGoogleAnalytics();
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
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "E-Mail oder Passwort ist falsch.";
  if (code === "auth/popup-blocked") return "Der Browser hat das Google-Popup blockiert. Erlaube Popups oder versuche es erneut.";
  if (code === "auth/network-request-failed") return "Netzwerkfehler. Prüfe deine Internetverbindung oder ob Firebase/Backend erreichbar ist.";
  if (code === "auth/admin-restricted-operation") return "Bitte melde dich mit einem Konto an, um dem Support zu schreiben.";
  if (code === "auth/operation-not-allowed") return "E-Mail/Passwort ist in Firebase Authentication noch nicht aktiviert.";
  if (code === "auth/weak-password") return "Das Passwort ist für Firebase zu schwach.";
  if (code === "auth/requires-recent-login") return "Bitte ausloggen und erneut anmelden, bevor du diese Sicherheitseinstellung änderst.";
  if (code === "auth/invalid-action-code") return "Dieser Bestätigungslink ist ungültig oder wurde bereits benutzt.";
  if (code === "auth/expired-action-code") return "Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen Link an.";
  if (code === "auth/invalid-verification-code") return "Der Bestätigungscode ist falsch.";
  if (code === "auth/code-expired") return "Der Bestätigungscode ist abgelaufen. Bitte fordere einen neuen an.";
  if (code === "auth/missing-verification-code") return "Bitte gib den Bestätigungscode ein.";
  if (code === "auth/too-many-requests") return "Zu viele Versuche. Bitte warte kurz und versuche es später erneut.";
  if (code === "auth/unsupported-first-factor") return "Dieser Anmeldeanbieter kann nicht kombiniert werden.";
  if (code === "auth/popup-closed-by-user") return "Google-Anmeldung wurde geschlossen.";
  if (code === "auth/unauthorized-domain") return "Diese Domain ist in Firebase Authentication noch nicht autorisiert.";
  if (error?.message === "support-login-required") return "Bitte melde dich an, um dem Support zu schreiben.";
  if (code === "permission-denied" || error?.message?.includes("Missing or insufficient permissions")) {
    return "Firestore blockiert den Zugriff. Prüfe, ob Firestore aktiviert ist und passende Regeln veröffentlicht sind.";
  }
  return error?.message || "Es ist ein Fehler passiert.";
}

function readableErrorText(error) {
  const raw = error?.message || String(error || "");
  try {
    const parsed = JSON.parse(raw);
    return parsed.errorMessage || parsed.error || parsed.message || raw;
  } catch {}
  return raw;
}

function passwordIsStrong(password) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function hasPasswordProvider(user = currentUser) {
  return Boolean((user?.providerData || []).some((provider) => provider?.providerId === "password"));
}

function emailVerificationRequired() {
  return Boolean(currentUser && hasPasswordProvider(currentUser) && !currentUser.emailVerified);
}

function requireVerifiedEmailForShop() {
  if (!emailVerificationRequired()) return true;
  showToast("Bitte bestätige zuerst deine E-Mail-Adresse. Danach kannst du mit deinem Konto einkaufen.");
  return false;
}

function stockText(stock = 0) {
  const value = Math.max(0, Number(stock) || 0);
  if (value <= 0) return "ausverkauft";
  if (value < 10) return `${value} verfügbar`;
  if (value < 100) return `ungefähr ${Math.floor(value / 10) * 10} verfügbar`;
  if (value < 1000) return `ungefähr ${Math.floor(value / 100) * 100} verfügbar`;
  return `ungefähr ${Math.floor(value / 1000) * 1000} verfügbar`;
}

function displayStockForBook(book, variantName = null) {
  const variants = Array.isArray(book?.variants) ? book.variants : [];
  const selectedVariant = variantName
    ? variants.find((entry) => entry.name === variantName)
    : variants[0] || null;
  if (book?.itemType === "product" && selectedVariant) {
    if (selectedVariant.stock === "-" && variants.length > 0) {
      return Number(variants[0].stock || 0);
    }
    return Number(selectedVariant.stock || 0);
  }
  return Number(book?.stock || 0);
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
  const now = Date.now();
  const filtered = books.filter((book) => {
    if (book.disabled || book.hidden) return false;
    const release = Number(book.releaseDateMs || 0);
    if (release > now && !isAdmin()) return false;
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
  booksEl.innerHTML = filtered.length ? filtered.map(bookCardTemplate).join("") : `<div class="shop-empty-state" role="status"><strong>Keine passenden Artikel gefunden</strong><span>Versuche einen anderen Suchbegriff oder Filter.</span></div>`;
}

function bookCardTemplate(book) {
  const rating = averageRating(book);
  const category = normalizeCategory(book.category);
  const stockValue = displayStockForBook(book);
  const summary = `
    <div class="book-meta-row">
      <span class="stock-pill">${escapeHtml(category)}</span>
      <span class="stock-pill">${escapeHtml(stockText(stockValue))}</span>
    </div>
  `;
  return `
    <article class="book-card">
      <img src="${itemImage(book)}" alt="Cover von ${escapeHtml(book.title)}" data-open="${book.id}" style="cursor: pointer;">
      <div class="book-body">
        <h2 class="book-title" data-open="${book.id}" style="cursor: pointer;">${escapeHtml(book.title)}</h2>
        ${summary}
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${Number(book.price).toFixed(2)} EUR</span>
        <div class="card-actions">
          <button type="button" data-open="${book.id}">Details</button>
          <button type="button" data-add="${book.id}" ${stockValue <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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

function addVariantRow(name = "", price = "", image = "", stock = 0, title = "") {
  const container = $("#variantList");
  if (!container) return;
  const id = "var-" + Math.random().toString(36).slice(2, 9);

  // Combine all relevant assets and ensure they are unique by their source URL
  const allAssets = uniqueAssetsBySrc([...(productOptions || []), ...(coverOptions || [])]);

  const assetOptions = [
    '<option value="">Kein Bild</option>',
    ...allAssets.map((asset) => {
      const name = asset.name || asset.title || asset.id || asset.src || "Bild";
      return `<option value="${escapeHtml(asset.src)}" ${asset.src === image ? "selected" : ""}>${escapeHtml(name)}</option>`;
    })
  ].join("");

  const html = `
    <div class="variant-row" id="${id}" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 10px; align-items: center;">
      <div style="flex: 1; min-width: 150px;">
        <label style="font-size: 0.8em; display: block; margin-bottom: 4px;">Varianten-Name (z.B. Größe L)</label>
        <input type="text" placeholder="Name" value="${escapeHtml(name)}" class="var-name" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc;" required>
      </div>
      <div style="flex: 1; min-width: 150px;">
        <label style="font-size: 0.8em; display: block; margin-bottom: 4px;">Zusatztitel (optional)</label>
        <input type="text" placeholder="Titel oben" value="${escapeHtml(title)}" class="var-title" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc;">
      </div>
      <div style="width: 100px;">
        <label style="font-size: 0.8em; display: block; margin-bottom: 4px;">Preis (€)</label>
        <input type="number" min="0" step="0.01" placeholder="Preis" value="${price}" class="var-price" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc;" required>
      </div>
      <div style="flex: 1; min-width: 150px;">
        <label style="font-size: 0.8em; display: block; margin-bottom: 4px;">Bild wählen</label>
        <select class="var-image" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc;">${assetOptions}</select>
      </div>
      <div style="width: 80px;">
        <label style="font-size: 0.8em; display: block; margin-bottom: 4px;">Lager</label>
        <input type="text" placeholder="Lager" value="${stock === "-" ? "-" : Number(stock || 0)}" class="var-stock" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #ccc;" required>
      </div>
      <button type="button" class="danger-button" onclick="document.getElementById('${id}').remove()" style="padding: 10px; border-radius: 8px; align-self: flex-end; margin-bottom: 2px;">X</button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", html);
}

function getSelectedVariants() {
  const rows = document.querySelectorAll(".variant-row");
  return Array.from(rows).map(row => {
    const stockVal = row.querySelector(".var-stock").value.trim();
    return {
      name: row.querySelector(".var-name").value.trim(),
      title: row.querySelector(".var-title").value.trim(),
      price: Number(row.querySelector(".var-price").value),
      image: row.querySelector(".var-image")?.value || "",
      stock: stockVal === "-" ? "-" : Math.max(0, Number(stockVal || 0))
    };
  }).filter(v => v.name && v.price >= 0);
}

function renderVariantsInForm(variants = []) {
  const container = $("#variantList");
  if (!container) return;
  container.innerHTML = "";
  if (Array.isArray(variants) && variants.length > 1) {
    // Skip the first variant as it's the "Main" variant managed via top fields
    variants.slice(1).forEach(v => {
      addVariantRow(v.name, v.price, v.image || "", v.stock, v.title || "");
    });
  }
}

document.getElementById("addVariantBtn")?.addEventListener("click", () => addVariantRow());

function ensureWishlistWidget() {
  if (!$("#books") && !$("#wishlistList")) return;
  if ($("#wishlistWidget")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <aside id="wishlistWidget" class="wishlist-widget">
      <button id="wishlistToggle" class="wishlist-toggle" type="button" aria-expanded="false" aria-controls="wishlistWidgetPanel" title="Wunschzettel">
        <span class="wishlist-bookmark" aria-hidden="true"></span>
        <span id="wishlistWidgetCount">0</span>
      </button>
      <section id="wishlistWidgetPanel" class="wishlist-widget-panel hidden" aria-label="Wunschzettel">
        <div class="wishlist-widget-head">
          <h2>Wunschzettel</h2>
          <button id="wishlistClose" class="icon-button" type="button" aria-label="Wunschzettel schließen">X</button>
        </div>
        <div id="wishlistWidgetList" class="admin-list"></div>
      </section>
    </aside>
  `);
  $("#wishlistToggle")?.addEventListener("click", () => {
    const panel = $("#wishlistWidgetPanel");
    const open = panel?.classList.toggle("hidden") === false;
    $("#wishlistToggle")?.setAttribute("aria-expanded", String(open));
  });
  $("#wishlistClose")?.addEventListener("click", () => {
    $("#wishlistWidgetPanel")?.classList.add("hidden");
    $("#wishlistToggle")?.setAttribute("aria-expanded", "false");
  });
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
    items.push({ bookId, notifyStock: true, wasOutOfStock: Number(book?.stock || 0) <= 0, lastPrice: Number(book?.price || 0), createdAt: Date.now() });
    saveWishlist(items);
    showToast("Auf den Wunschzettel gesetzt.");
  }
  renderBooks();
  renderWishlist();
}

function renderWishlist() {
  ensureWishlistWidget();
  const lists = [$("#wishlistList"), $("#wishlistWidgetList")].filter(Boolean);
  if (!lists.length) return;
  const items = wishlistItems();
  const count = $("#wishlistWidgetCount");
  if (count) count.textContent = String(items.length);
  const html = items.length ? items.map((item) => {
    const book = books.find((entry) => entry.id === item.bookId);
    return `
      <div class="admin-item wishlist-entry">
        <strong>${escapeHtml(book?.title || "Buch")}</strong>
        <p>${book ? stockText(book.stock) : "Nicht mehr gefunden"}</p>
        <label class="checkbox-line">
          <input type="checkbox" data-wishlist-notify="${item.bookId}" ${item.notifyStock ? "checked" : ""}>
          Melden, wenn wieder verfügbar oder der Preis sich ändert
        </label>
        <div class="admin-actions">
          <button type="button" data-open="${item.bookId}">Details</button>
          <button type="button" data-wishlist="${item.bookId}">Entfernen</button>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Dein Wunschzettel ist leer.</p>`;
  lists.forEach((list) => {
    list.innerHTML = html;
  });
}

function checkWishlistStockNotifications() {
  if (!("Notification" in window)) return;
  const items = wishlistItems();
  let changed = false;
  for (const item of items) {
    const book = books.find((entry) => entry.id === item.bookId);
    if (!book || !item.notifyStock) continue;
    const inStock = Number(book.stock || 0) > 0;
    const currentPrice = Number(book.price || 0);
    if (item.wasOutOfStock && inStock && Notification.permission === "granted") {
      new Notification("Wieder auf Lager", { body: `${book.title} ist wieder verfügbar.`, icon: book.cover || "favicon.png" });
      item.wasOutOfStock = false;
      changed = true;
    }
    if (Number(item.lastPrice || 0) > 0 && currentPrice > 0 && Number(item.lastPrice || 0) !== currentPrice && Notification.permission === "granted") {
      new Notification("Preisänderung", { body: `${book.title} kostet jetzt ${currentPrice.toFixed(2)} EUR.`, icon: book.cover || "favicon.png" });
      item.lastPrice = currentPrice;
      changed = true;
    }
    if (Number(item.lastPrice || 0) !== currentPrice) {
      item.lastPrice = currentPrice;
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
  renderAccountAvatars();
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
      <a class="mini-link-button" href="${pageHref("konto.html")}">Kontoeinstellungen</a>
    </div>
    <strong>${escapeHtml(currentProfile?.name || currentUser.email)}</strong><br>
    ${escapeHtml(currentUser.email || "")}<br>
    ${emailVerificationRequired() ? `<p class="auth-warning">E-Mail noch nicht bestätigt. Bitte bestätige sie, bevor du einkaufst.</p>` : ""}
    ${escapeHtml(addressLine(currentProfile || {}) || "Keine Adresse gespeichert")}<br>
    Rolle: ${isAdmin() ? "Admin" : "Kunde"}
    <div class="admin-actions">
      ${isAdmin() ? `<a class="secondary-link" href="${pageHref("admin.html")}">Admin-Panel</a>` : ""}
      ${emailVerificationRequired() ? `<button type="button" id="resendVerificationEmail">Bestätigungsmail erneut senden</button>` : ""}
      <button type="button" id="logoutButton">Ausloggen</button>
    </div>
    ${renderCustomerOrders()}
  `;
  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
  if (adminHint) adminHint.classList.toggle("hidden", isAdmin());
  renderAdminBooks();
}

function renderCustomerOrders() {
  if (!currentUser || !isAdmin()) return `<p class="panel">Diese Sektion ist nur für Administratoren sichtbar.</p>`;
  const visibleOrders = (customerOrders || []).filter((order) => !order.archived);
  return `
    <section class="customer-orders">
      <h3>Aktuelle Bestellungen</h3>
      <p class="muted">Hinweis: Der angezeigte Status ist eine Orientierung und kann vom echten Versandstatus abweichen.</p>
      ${visibleOrders.length ? visibleOrders.map((order) => {
        const deliveredAt = order.deliveredAtMs || 0;
        const now = Date.now();
        const fourteenDays = 14 * 24 * 60 * 60 * 1000;
        const canReturn = deliveredAt > 0 && (now - deliveredAt) < fourteenDays && !order.returnRequest;
        const returnLabelUrl = order.returnRequest?.labelUrl || "";

        return `
          <article class="customer-order-card">
            <strong>${escapeHtml(orderDateText(order.createdAt))}</strong>
            <p><b>Status:</b> ${escapeHtml(orderFulfillmentStatus(order))}</p>
            <p><b>${escapeHtml(shippingLine(order))}</b></p>
            <p>${(order.items || []).map((item) => `${escapeHtml(item.title || "Artikel")} (${Number(item.quantity || 1)}x)`).join(", ")}</p>
            <div class="admin-actions">
              ${canReturn ? `<button type="button" data-request-return="${order.id}">Rücksendung beantragen (14 Tage)</button>` : ""}
              ${order.returnRequest ? `<p class="stock-pill">Rücksendung: ${escapeHtml(order.returnRequest.status === 'requested' ? 'Beantragt' : 'Label bereit')}</p>` : ""}
              ${returnLabelUrl ? `<a href="${returnLabelUrl}" target="_blank" class="mini-link-button">Rücksendelabel laden</a>` : ""}
            </div>
          </article>
        `;
      }).join("") : `<p class="muted">Du hast gerade keine offenen Bestellungen.</p>`}
      <p><a href="ruecksendungen.html" class="secondary-link">Rücksendung ohne Konto beantragen</a></p>
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
  const addressParts = normalizeAddressParts({
    street: String(data.get("street") || "").trim(),
    zip: String(data.get("zip") || "").trim(),
    city: String(data.get("city") || "").trim()
  });
  const street = addressParts.street;
  const zip = addressParts.zip;
  const city = addressParts.city;
  const designMode = data.get("designMode") === "classic" ? "classic" : "modern";
  const themeMode = ["light", "dark", "system"].includes(data.get("themeMode")) ? data.get("themeMode") : "system";
  const profilePhotoPublic = data.get("profilePhotoPublic") === "on";
  const removeProfilePhoto = data.get("removeProfilePhoto") === "on";
  const photoFile = form.elements.namedItem("profilePhoto")?.files?.[0] || null;
  const canReceiveSupport = Boolean(currentProfile?.admin || currentProfile?.support);
  const supportNotificationField = form.elements.namedItem("supportNotifications");
  const supportNotifications = supportNotificationField ? data.get("supportNotifications") === "on" : currentProfile?.supportNotifications !== false;
  if (!name) return showToast("Bitte einen Namen eintragen.");
  let profilePhotoDataUrl = removeProfilePhoto ? "" : (currentProfile?.profilePhotoDataUrl || "");
  if (photoFile) {
    try {
      profilePhotoDataUrl = await resizeProfileImage(photoFile);
    } catch (error) {
      return showToast(error.message || "Profilbild konnte nicht gespeichert werden.");
    }
  }

  const profileUpdate = {
    name,
    email: currentUser.email || currentProfile?.email || "",
    street,
    zip,
    city,
    address: { street, zip, city },
    designMode,
    themeMode,
    profilePhotoDataUrl,
    profilePhotoPublic,
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
    zip,
    city,
    address: { street, zip, city },
    designMode,
    themeMode,
    profilePhotoDataUrl,
    profilePhotoPublic,
    ...(canReceiveSupport && supportNotificationField ? { supportNotifications } : {})
  };
  window.currentProfile = currentProfile;
  await syncPublicGameProfile();
  applyDesignMode();
  renderAccountAvatars();
  renderAll();
  prefillCheckoutFromProfile();
  showToast("Benutzerdaten gespeichert.");
}

async function syncPublicGameProfile() {
  if (!db || !currentUser) return;
  const avatarDataUrl = publicProfilePhoto();
  const ref = db.collection("gameNicknames").doc(currentUser.uid);
  const snap = await ref.get().catch(() => null);
  if (snap?.exists) {
    await ref.set({
      email: currentUser.email || "",
      avatarDataUrl,
      avatarPublic: Boolean(currentProfile?.profilePhotoPublic),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  const friendSnap = await db.collection("gameFriends").where("users", "array-contains", currentUser.uid).get().catch(() => null);
  if (friendSnap && !friendSnap.empty) {
    const batch = db.batch();
    friendSnap.docs.forEach((doc) => batch.set(doc.ref, { avatars: { [currentUser.uid]: avatarDataUrl } }, { merge: true }));
    await batch.commit();
  }
  const fromRequests = await db.collection("gameFriendRequests").where("fromUid", "==", currentUser.uid).get().catch(() => null);
  if (fromRequests && !fromRequests.empty) {
    const batch = db.batch();
    fromRequests.docs.forEach((doc) => batch.set(doc.ref, { fromAvatar: avatarDataUrl }, { merge: true }));
    await batch.commit();
  }
  const toRequests = await db.collection("gameFriendRequests").where("toUid", "==", currentUser.uid).get().catch(() => null);
  if (toRequests && !toRequests.empty) {
    const batch = db.batch();
    toRequests.docs.forEach((doc) => batch.set(doc.ref, { toAvatar: avatarDataUrl }, { merge: true }));
    await batch.commit();
  }
}

function copyProfileLink() {
  const sid = currentProfile?.shortId || currentUser?.uid;
  if (!sid) return;
  const url = `${window.location.origin}/user/${sid}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Link in die Zwischenablage kopiert!");
    }).catch(() => {
      prompt("Kopiere deinen Profil-Link:", url);
    });
  } else {
    prompt("Kopiere deinen Profil-Link:", url);
  }
}

function renderOwnAccountPage() {
  const page = $("#accountManagementPage");
  if (!page) return;

  const profileAddress = normalizeAddressParts(currentProfile || {});

  if (!currentUser) {
    page.innerHTML = `
      <section class="panel account-page-panel">
        <h1>Kontoeinstellungen</h1>
        <p class="muted">Bitte melde dich an, um deine Adresse und Kontodaten zu bearbeiten.</p>
        <button class="account-login-button" type="button" id="openAccountLogin">Einloggen oder registrieren</button>
      </section>
    `;
    return;
  }

  page.innerHTML = `
    <section class="panel account-page-panel">
      <div class="account-page-heading">
        <div>
          <h1>Kontoeinstellungen</h1>
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
          <input name="street" autocomplete="street-address" placeholder="Adresse" value="${escapeHtml(profileAddress.street || "")}">
        </label>
        <div class="form-two">
          <label>
            PLZ
            <input name="zip" autocomplete="postal-code" inputmode="numeric" placeholder="PLZ" value="${escapeHtml(profileAddress.zip || "")}">
          </label>
          <label>
            Stadt
            <input name="city" autocomplete="address-level2" placeholder="Stadt" value="${escapeHtml(profileAddress.city || "")}">
          </label>
        </div>
        <section class="profile-photo-settings">
          <div class="profile-photo-preview ${currentProfile?.profilePhotoDataUrl ? "has-image" : ""}" style="${currentProfile?.profilePhotoDataUrl ? `--profile-photo:url('${currentProfile.profilePhotoDataUrl}')` : ""}" aria-hidden="true"></div>
          <div>
            <label class="profile-file-label">
              <span>Profilbild</span>
              <span class="profile-file-picker">
                <input name="profilePhoto" type="file" accept="image/*">
                <span class="profile-file-button">Bild auswählen</span>
                <span class="profile-file-name">Keine Datei ausgewählt</span>
              </span>
            </label>
            <p class="muted">Optional, maximal 5 MB. Das Bild wird verkleinert und in Firestore gespeichert.</p>
            <label class="checkbox-line">
              <input name="profilePhotoPublic" type="checkbox" ${currentProfile?.profilePhotoPublic ? "checked" : ""}>
              Profilbild öffentlich für Freunde anzeigen
            </label>
            ${currentProfile?.profilePhotoDataUrl ? `
              <label class="checkbox-line">
                <input name="removeProfilePhoto" type="checkbox">
                Profilbild entfernen
              </label>
            ` : ""}
          </div>
        </section>
        <label>
          Design
          <select name="designMode">
            <option value="modern" ${selectedDesignMode() === "modern" ? "selected" : ""}>Neues Design</option>
            <option value="classic" ${selectedDesignMode() === "classic" ? "selected" : ""}>Klassisches Design</option>
          </select>
        </label>
        <label>
          Farbmodus
          <select name="themeMode">
            <option value="system" ${selectedThemeMode() === "system" ? "selected" : ""}>Wie Systemeinstellung</option>
            <option value="light" ${selectedThemeMode() === "light" ? "selected" : ""}>Hell</option>
            <option value="dark" ${selectedThemeMode() === "dark" ? "selected" : ""}>Dunkel</option>
          </select>
        </label>
        <button type="submit">Daten speichern</button>
      </form>
      <div class="account-tools">
        <button type="button" id="sendOwnPasswordReset">Passwort zurücksetzen</button>
        ${emailVerificationRequired() ? `<button type="button" id="resendVerificationEmail">Bestätigungsmail erneut senden</button>` : ""}
        <button type="button" id="accountPageLogout">Ausloggen</button>
      </div>
      ${renderCustomerOrders()}
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

  const now = Date.now();
  list.innerHTML = books.map((book) => {
    const release = Number(book.releaseDateMs || 0);
    const isFuture = release > now;
    const releaseText = isFuture ? `<span class="release-badge">Veröffentlichung am ${new Date(release).toLocaleDateString("de-DE")}</span>` : "";
    return `
    <div class="admin-item ${book.disabled || book.hidden ? "is-hidden-post" : ""} ${isFuture ? "is-future-release" : ""}">
      ${releaseText}
      <strong>${escapeHtml(book.title)}</strong>
      <p>${book.itemType === 'book' || !book.itemType ? `<b>ISBN:</b> ${escapeHtml(book.isbn || "-")} | ` : ""}<b>Preis:</b> ${Number(book.price || 0).toFixed(2)} €</p>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Status: ${book.disabled || book.hidden ? "Inaktiv" : "Aktiv"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-book-toggle="${book.id}">${book.disabled || book.hidden ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `;
  }).join("");

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

renderAdminBooks_OLD_1 = function renderAdminBooks() {
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

  const now = Date.now();
  list.innerHTML = books.map((book) => {
    const release = Number(book.releaseDateMs || 0);
    const isFuture = release > now;
    const releaseText = isFuture ? `<span class="release-badge">Veröffentlichung am ${new Date(release).toLocaleDateString("de-DE")}</span>` : "";
    return `
    <div class="admin-item ${book.disabled || book.hidden ? "is-hidden-post" : ""} ${isFuture ? "is-future-release" : ""}">
      ${releaseText}
      <strong>${escapeHtml(book.title)}</strong>
      <p>${book.itemType === 'book' || !book.itemType ? `<b>ISBN:</b> ${escapeHtml(book.isbn || "-")} | ` : ""}<b>Preis:</b> ${Number(book.price || 0).toFixed(2)} €</p>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Status: ${book.disabled || book.hidden ? "Inaktiv" : "Aktiv"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-book-toggle="${book.id}">${book.disabled || book.hidden ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
      </div>
    </div>
  `;
  }).join("");

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
  if (!timestamp) return "";
  return `Veröffentlicht: ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(timestamp))}`;
}

function bookPublicationMarkup(book) {
  const timestamp = Number(book?.releaseDateMs || timestampToMs(book?.releaseDate) || timestampToMs(book?.publishedAt) || 0);
  if (!timestamp) return "";
  return `<p class="published-date">${escapeHtml(publishedDateText(timestamp))}</p>`;
}

function orderDateText(value) {
  const timestamp = timestampToMs(value);
  if (!timestamp) return "Bestelldatum: nicht verfügbar";
  return `Bestellt am: ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp))}`;
}

function formatDateTime(value) {
  const timestamp = timestampToMs(value);
  if (!timestamp) return "nicht verfügbar";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function orderFulfillmentStatus(order) {
  const status = order?.fulfillmentStatus || order?.shippingStatus || "";
  return String(status || "wird vorbereitet").trim() || "wird vorbereitet";
}

function normalizeAddressParts(value = {}) {
  const street = String(value?.street || value?.address?.street || "").trim();
  let zip = String(value?.zip || value?.postalCode || value?.address?.zip || "").trim();
  let city = String(value?.city || value?.address?.city || "").trim();
  const zipFromCity = extractGermanPostcode(city);
  if (!zip && zipFromCity) zip = zipFromCity;
  if (zip && city) {
    const escapedZip = String(zip).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    city = city.replace(new RegExp(`^${escapedZip}\\s*`), "").trim();
  }
  if (!zip && zipFromCity) zip = zipFromCity;
  return { street, zip, city };
}

function addressLine(value = {}) {
  const { street, zip, city } = normalizeAddressParts(value);
  const cityLine = [zip, city].filter(Boolean).join(" ");
  return [street, cityLine].filter(Boolean).join(", ");
}

function shippingCarrierName(order) {
  const carrier = order?.shippingCarrier || "";
  if (carrier === "Weitere") return order?.shippingCarrierCustom || "Weitere";
  return carrier;
}

function shippingCarrierOptionsMarkup(currentCarrier = "", shippingMethods = normalizedShippingMethods()) {
  const methods = Array.isArray(shippingMethods) ? shippingMethods : [];
  const normalizedCurrent = String(currentCarrier || "").trim();
  const seen = new Set();
  const options = [];
  const addOption = (value, label) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) return;
    const key = normalizedValue.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const selected = normalizedValue === normalizedCurrent;
    options.push(`<option value="${escapeHtml(normalizedValue)}" ${selected ? "selected" : ""}>${escapeHtml(label || normalizedValue)}</option>`);
  };

  options.push(`<option value="" ${!normalizedCurrent ? "selected" : ""}>Noch nicht ausgewählt</option>`);
  methods.forEach((method) => addOption(method?.name, method?.name));
  if (normalizedCurrent && normalizedCurrent !== "Weitere" && !methods.some((method) => String(method?.name || "").trim().toLowerCase() === normalizedCurrent.toLowerCase())) {
    addOption(normalizedCurrent, normalizedCurrent);
  }
  addOption("Weitere", "Weitere");
  return options.join("");
}

function shippingLine(order) {
  const method = order?.shippingMethod || null;
  const methodLine = method?.name ? `Lieferdienst: ${method.name} (${Number(method.price || 0).toFixed(2)} EUR)` : "";
  const carrier = shippingCarrierName(order);
  const tracking = order?.trackingNumber || "";
  let trackingLine = "";
  if (carrier && tracking) trackingLine = `Versand durch ${carrier}: ${tracking}`;
  else if (carrier) trackingLine = `Versand durch ${carrier}`;
  else if (tracking) trackingLine = `Sendungsnummer: ${tracking}`;
  if (methodLine && trackingLine) return `${methodLine} | ${trackingLine}`;
  if (methodLine) return methodLine;
  return trackingLine || "Noch keine Sendungsnummer";
}

function shippingMethodChangeNotice(order) {
  const notice = order?.shippingMethodChangeNotice || null;
  if (!notice?.reason && !notice?.nextName) return "";
  const next = notice.nextName ? `Neue Versandart: ${notice.nextName}. ` : "";
  const reason = notice.reason ? `Grund: ${notice.reason}` : "";
  return `${next}${reason}`.trim();
}

function trackingUrl(order) {
  const carrier = shippingCarrierName(order);
  const tracking = String(order?.trackingNumber || "").trim();
  if (!carrier || !tracking) return "";
  const encoded = encodeURIComponent(tracking);
  if (carrier === "Hermes") return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#${encoded}`;
  if (carrier === "GLS") return `https://gls-group.com/DE/de/paketverfolgung?match=${encoded}`;
  return "";
}

function trackingLinkMarkup(order) {
  const url = trackingUrl(order);
  if (!url) return "";

  // Check if it's a Sendcloud URL to show the iframe
  if (url.includes("sendcloud.sc") || url.includes("tracking.sc")) {
      return `
        <div class="tracking-container" style="margin-top: 15px;">
            <p><b>Live-Sendungsverfolgung:</b></p>
            <iframe src="${escapeHtml(url)}" width="100%" height="450px" frameBorder="0" style="border: 1px solid rgba(0,0,0,0.1); border-radius: 15px;"></iframe>
            <p><a class="secondary-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">In neuem Fenster öffnen</a></p>
        </div>
      `;
  }

  return `<a class="secondary-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Sendung verfolgen (${order.trackingNumber || 'Paket'})</a>`;
}

function deliveryProofMarkup(order) {
  const proof = order?.deliveryProof || null;
  if (!proof?.signature) return "";
  return `
    <section class="delivery-proof-preview">
      <h4>Übergabe-Unterschrift</h4>
      <p>Gespeichert: ${escapeHtml(formatDateTime(proof.signedAtMs || order.archivedAtMs))}</p>
      ${proof.localSignaturePath ? `<p class="muted">${escapeHtml(proof.localSignaturePath)}</p>` : ""}
      <img src="${escapeHtml(proof.signature)}" alt="Unterschrift zur Übergabe">
    </section>
  `;
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

function slugifyBookTitle(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[#?&%/\\\[\](){}]+/g, " ")
    .replace(/[-_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleaned || "produkt";
}

function findBookBySlug(slug) {
  if (!slug) return null;
  const target = slugifyBookTitle(slug);
  if (!target) return null;
  return books.find((book) => {
    const titleSlug = slugifyBookTitle(book.slug || book.title || book.id);
    return titleSlug === target || slugifyBookTitle(book.id) === target;
  }) || null;
}

function syncProductUrl(book) {
  if (!book) return;
  const slug = slugifyBookTitle(book.slug || book.title || book.id);
  if (!slug) return;

  const currentHash = window.location.hash.slice(1);
  const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const isIndexPage = /(?:^|\/)index\.html$/i.test(window.location.pathname);
  const isRootPage = currentPath === "" || currentPath === "index.html" || currentPath === "index";
  const baseUrl = isIndexPage || isRootPage ? window.location.pathname.replace(/index\.html$/i, "") || "/" : window.location.pathname;

  if (currentHash !== slug) {
    window.history.pushState({ productId: book.id }, "", `${baseUrl}#${slug}`);
  }
}

function closeProductModal() {
  const bookModal = $("#bookModal");
  if (bookModal) bookModal.classList.add("hidden");

  const currentPath = window.location.pathname || "/";
  const normalizedPath = currentPath.replace(/^\/+|\/+$/g, "");
  const rootPath = normalizedPath === "" || normalizedPath === "index" || normalizedPath === "index.html" ? "/" : currentPath;

  try {
    window.history.pushState(null, "", rootPath + window.location.search);
  } catch {}

  try {
    if (window.location.hash) {
      window.location.hash = "";
    }
  } catch {}
}

function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  syncProductUrl(book);
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
        <div class="buy-action-row">
          ${buyQuantityControl(book, "default")}
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
      </div>
    </div>
  `;
  $("#reviewForm").addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
}

function applyProductRouteFromPath() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const route = rawHash || rawPath;
  if (!route) return;

  const reservedRoutes = new Set([
    "admin", "auth", "login", "konto", "warenkorb", "kontakt", "impressum", "datenschutz",
    "agb", "newsletter", "support", "unterstuetzung", "ruecksendungen", "games", "user",
    "kauf-bestaetigung", "success", "404", "check", "backend", "email-config", "upload-buecher",
    "gutschein", "gutschein-admin", "nutzerverwaltung", "lager", "social-media", "isbn",
    "code-list", "dangerzone", "firebase-handle", "login-code", "auth-admin", "fehlermeldungen"
  ]);

  const firstSegment = route.split("/")[0].toLowerCase();
  if (!firstSegment || reservedRoutes.has(firstSegment)) return;

  const match = findBookBySlug(firstSegment);
  if (match) {
    if (isAdmin() || isBookPublished(match)) {
      openBook(match.id);
    } else {
      console.warn("Zugriff auf unveröffentlichtes Produkt verweigert.");
      if (window.location.hash) {
        window.history.replaceState(null, null, window.location.pathname);
      }
    }
  }
}

window.addEventListener("popstate", () => {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const route = rawHash || rawPath;
  if (!route) return;
  const match = findBookBySlug(route.split("/")[0]);
  if (match) openBook(match.id);
});

window.addEventListener("hashchange", applyProductRouteFromPath);

window.addEventListener("DOMContentLoaded", () => {
  applyProductRouteFromPath();
});

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
  syncProductUrl(book);
  const rating = averageRating(book);
  const mayReview = canReviewBook(book.id);
  const publishedMarkup = bookPublicationMarkup(book);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        ${publishedMarkup}
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="buy-action-row">
          ${buyQuantityControl(book, "default")}
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
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





submitBook = async function submitBook(event) {
  if (event) event.preventDefault();
  showToast("DEBUG: Speichern gestartet...");

  if (!db) {
    showToast("Fehler: Datenbankverbindung nicht bereit.");
    return;
  }
  if (!isAdmin()) {
    showToast("Fehler: Keine Admin-Rechte.");
    return;
  }

  const form = event?.currentTarget || $("#bookForm");
  if (!form) return;

  const data = new FormData(form);
  const id = data.get("id") || "";
  const existing = id ? books.find((book) => book.id === id) : null;

  const saveButton = form.querySelector('button[type="submit"]');
  const originalButtonText = saveButton ? saveButton.textContent : "Speichern";

  try {
    const description = String(data.get("description") || "").trim();
    if (description.length < 10) {
      showToast("Die Beschreibung braucht mindestens 10 Zeichen.");
      return;
    }

    const category = normalizeCategory(data.get("category"));
    let itemType = data.get("itemType");
    if (!itemType || itemType === "undefined" || itemType === "") {
      if (existing?.itemType) itemType = existing.itemType;
      else if (category === "Sonstige" || category === "Lernhelfer") itemType = "worksheet";
      else itemType = "book";
    }

    // Price Lock Check (only for books/ebooks)
    if (existing && typeof isBookPriceLocked === "function" && isBookPriceLocked(existing)) {
      const nextDownload = data.get("downloadPrice") !== "" ? Number(data.get("downloadPrice")) : 0;
      const nextPrint = data.get("printPrice") !== "" ? Number(data.get("printPrice")) : 0;
      const oldDownload = Number(existing.downloadPrice || 0);
      const oldPrint = Number(existing.printPrice || existing.price || 0);
      if (Math.abs(nextDownload - oldDownload) > 0.001 || Math.abs(nextPrint - oldPrint) > 0.001) {
        showToast("Dieser Buchpreis ist noch 18 Monate ab Veröffentlichung gesperrt.");
        return;
      }
    }

    const productImages = itemType === "product" ? selectedProductImages() : [];
    const previewPages = itemType === "product" ? [] : selectedPreviewPages();

    const downloadAvailable = data.get("downloadAvailable") === "on";
    const printAvailable = data.get("printAvailable") === "on" || itemType === "product";

    const pdf = (itemType === "book" || itemType === "worksheet") && downloadAvailable
      ? String(data.get("pdfChoice") || existing?.pdf || "")
      : "";

    const cover = itemType === "product"
      ? (productImages[0] || existing?.cover || sampleCover)
      : (data.get("coverChoice") || existing?.cover || sampleCover);

    const fulfillmentOptions = (itemType === "book" || itemType === "worksheet")
      ? [
          downloadAvailable ? "download" : "",
          printAvailable ? "print" : ""
        ].filter(Boolean)
      : ["print"];

    const downloadPrice = (downloadAvailable && (itemType === "book" || itemType === "worksheet"))
      ? (data.get("downloadPrice") !== "" ? Number(data.get("downloadPrice")) : 0)
      : 0;

    const printPrice = data.get("printPrice") !== "" ? Number(data.get("printPrice")) : 0;
    const price = (itemType === "product" || fulfillmentOptions.includes("print")) ? printPrice : downloadPrice;

    // Validation
    if (itemType === "product") {
      if (printPrice <= 0) {
        showToast("Bitte einen Produkt-Preis eintragen.");
        return;
      }
    } else {
      if (!fulfillmentOptions.length) {
        showToast("Bitte Download oder gedruckt aktivieren.");
        return;
      }
      if (downloadAvailable && !pdf) {
        showToast("Bitte eine PDF für den Download auswählen.");
        return;
      }
      if (downloadAvailable && downloadPrice <= 0) {
        showToast("Bitte einen Download-Preis eintragen.");
        return;
      }
      if (fulfillmentOptions.includes("print") && printPrice <= 0) {
        showToast("Bitte einen gedruckten Preis eintragen.");
        return;
      }
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Speichert...";
    }

    const releaseDate = String(data.get("releaseDate") || "").trim();
    const releaseDateMs = releaseDate ? new Date(releaseDate).getTime() : 0;
    const productTitle = String(data.get("title") || "").trim();
    const productStock = data.get("stock") === "-" ? "-" : Math.max(0, Number(data.get("stock") || 0));

    const isBook = itemType === "book";
    const isbnPrint = isBook ? data.get("isbnPrint") : "";
    const isbnEbook = (isBook && downloadAvailable) ? data.get("isbnEbook") : "";

    if (isBook) {
      if (!isbnPrint) {
        showToast("Bitte wähle eine ISBN für das gedruckte Buch.");
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalButtonText; }
        return;
      }
      if (downloadAvailable && !isbnEbook) {
        showToast("Bitte wähle eine ISBN für das E-Book.");
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalButtonText; }
        return;
      }
    }

    const finalId = id || db.collection("books").doc().id;
    const variants = [
      { name: "Variante 1", title: productTitle, description, price, image: cover, stock: productStock },
      ...getSelectedVariants().filter(variant => variant.name !== "Variante 1")
    ];

    const bookData = {
      title: productTitle,
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
      releaseDate,
      releaseDateMs,
      variants,
      isbn: isbnPrint || "",
      isbnPrint: isbnPrint || "",
      isbnEbook: isbnEbook || "",
      stock: productStock,
      sold: existing?.sold || 0,
      lowStockEnabled: data.get("lowStockEnabled") === "on",
      lowStockLimit: Number(data.get("lowStockLimit")) || 0,
      isGift: data.get("isGift") === "on",
      giftThreshold: Number(data.get("giftThreshold")) || 0,
      giftRequirementType: data.get("giftRequirementType") || "none",
      reviews: existing?.reviews || [],
      createdAt: existing?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await withTimeout(db.collection("books").doc(finalId).set(bookData, { merge: true }), 15000, "Speichern fehlgeschlagen (Timeout).");

    if (isBook) {
      // Release old ISBNs if changed
      if (existing?.isbnPrint && existing.isbnPrint !== isbnPrint) {
        const snap = await db.collection("isbnEntries").where("isbn", "==", existing.isbnPrint).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.update({ used: false, usedByBookId: "" });
      }
      if (existing?.isbnEbook && existing.isbnEbook !== isbnEbook) {
        const snap = await db.collection("isbnEntries").where("isbn", "==", existing.isbnEbook).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.update({ used: false, usedByBookId: "" });
      }
      // Mark new ISBNs as used
      if (isbnPrint) {
        const snap = await db.collection("isbnEntries").where("isbn", "==", isbnPrint).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.update({ used: true, usedByBookId: finalId });
      }
      if (isbnEbook) {
        const snap = await db.collection("isbnEntries").where("isbn", "==", isbnEbook).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.update({ used: true, usedByBookId: finalId });
      }
    }

    form.reset();
    if (formField(form, "id")) formField(form, "id").value = "";
    $("#cancelEdit")?.classList.add("hidden");
    loadCoverOptions();
    showToast(`${itemTypeLabel(itemType)} wurde erfolgreich gespeichert!`);
  } catch (error) {
    console.error("Critical Save Error:", error);
    showToast("Fehler beim Speichern: " + error.message);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
      updateMaterialFields();
    }
  }
};

editBook = function editBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const form = $("#bookForm");
  if (!book || !form) return;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  formField(form, "id").value = book.id;
  formField(form, "title").value = book.title || "";
  formField(form, "description").value = book.description || "";
  formField(form, "category").value = normalizeCategory(book.category);

  // Reliably detect itemType
  let type = book.itemType;
  if (!type) {
    if (book.productImages?.length || (book.variants?.length > 1 && !book.pdf)) type = "product";
    else if (book.pdf && book.category === "Sonstige") type = "worksheet";
    else type = "book";
  }
  formField(form, "itemType").value = type;

  if (formField(form, "downloadPrice")) formField(form, "downloadPrice").value = book.downloadPrice ?? "";
  if (formField(form, "printPrice")) formField(form, "printPrice").value = book.printPrice ?? book.price ?? "";
  if (formField(form, "stock")) formField(form, "stock").value = book.stock || 0;
  if (formField(form, "releaseDate")) formField(form, "releaseDate").value = book.releaseDate || "";
  if (formField(form, "lowStockEnabled")) formField(form, "lowStockEnabled").checked = Boolean(book.lowStockEnabled);
  if (formField(form, "lowStockLimit")) formField(form, "lowStockLimit").value = book.lowStockLimit || "";
  if (formField(form, "isGift")) formField(form, "isGift").checked = Boolean(book.isGift);
  if (formField(form, "giftThreshold")) formField(form, "giftThreshold").value = book.giftThreshold || "";
  if (formField(form, "giftRequirementType")) formField(form, "giftRequirementType").value = book.giftRequirementType || "none";

  if (formField(form, "downloadAvailable")) {
    formField(form, "downloadAvailable").checked = book.fulfillmentOptions?.includes("download") ?? (type === "book" && Boolean(book.pdf));
  }
  if (formField(form, "printAvailable")) {
    formField(form, "printAvailable").checked = book.fulfillmentOptions?.includes("print") ?? true;
  }

  if (type === "book") {
    updateIsbnPickerDisplay(book);
  }

  renderCoverOptions(book.cover || "");
  renderPdfOptions(book.pdf || "");
  renderProductOptions(book.productImages || []);
  renderVariantsInForm(book.variants || []);
  renderPreviewPageOptions(book.previewPages || []);
  updateMaterialFields();
  syncGiftSettingsVisibility();
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
        zip: data.get("zip"),
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
    updateHeaderHeightVar();
    return;
  }
  if (!link) {
    link = document.createElement("a");
    link.id = "adminHeaderLink";
    link.className = "admin-header-link";
    link.href = pageHref("admin.html");
    link.textContent = "Admin";
    if (accountButton) accountButton.insertAdjacentElement("beforebegin", link);
    else nav.appendChild(link);
  }
  updateHeaderHeightVar();
}

function updateHeaderHeightVar() {
  const header = $(".site-header");
  if (!header) return;
  const height = Math.ceil(header.getBoundingClientRect().height || 0);
  if (height > 0) document.documentElement.style.setProperty("--header-height", `${height}px`);
}

function initMobileHeaderAutoHide() {
  const header = $(".site-header");
  if (!header) return;
  const mobile = window.matchMedia("(max-width: 760px)");
  let lastY = window.scrollY;
  let framePending = false;

  const updateHeader = () => {
    if (!mobile.matches) {
      header.classList.remove("is-hidden-mobile");
      lastY = window.scrollY;
      updateHeaderHeightVar();
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
    updateHeaderHeightVar();
  };

  const requestHeaderUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(() => {
      updateHeader();
      framePending = false;
    });
  };

  window.addEventListener("scroll", requestHeaderUpdate, { passive: true });
  window.addEventListener("resize", requestHeaderUpdate, { passive: true });
  mobile.addEventListener?.("change", updateHeader);
  updateHeader();
}

function initPageScrollIndicator() {
  if ($("#pageScrollIndicator")) return;
  const indicator = document.createElement("div");
  indicator.id = "pageScrollIndicator";
  indicator.className = "page-scroll-indicator";
  document.body.appendChild(indicator);
  let framePending = false;

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

  const requestUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(() => {
      update();
      framePending = false;
    });
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
}

renderAll = function renderAll() {
  const path = window.location.pathname;

  // Global Security Checks
  if (currentProfile?.disabled && auth?.currentUser) {
    showToast("Dieses Konto wurde gesperrt.");
    auth.signOut();
    return;
  }
  checkAdminAccess();

  const isCheckPage = path.includes("check.html") || path.endsWith("/check") || Boolean($("#healthResults"));
  if (isCheckPage) runHealthCheck();

  const isMainAdminPage = path.includes("admin.html");
  const isUploadPage = path.includes("upload-buecher.html");
  const isLagerPage = path.includes("lager.html");
  const isUserPage = isUserManagementPage();
  const isSupport = isSupportPage();
  const isErrors = isErrorReportsPage();
  const isAuthAdmin = isAuthAdminPage();
  const isEmailConfig = isEmailConfigPage();
  const isBackend = isBackendConfigPage();
  const isPurchaseConfirm = isPurchaseConfirmationPage();
  const isVoucherAdmin = isGiftVoucherAdminPage();
  const isVoucherList = isGiftVoucherCodeListPage();
  const isTodo = isAdminTodoPage();
  const isAppLogin = isAdminAppLoginCodePage();

  if (isAdmin()) {
    // Core Listeners for Admin Pages
    if (isMainAdminPage || isUploadPage || isLagerPage || isUserPage || isSupport || isVoucherAdmin || isVoucherList || isTodo) {
      listenToOrders();
      listenToLiveSessions();
      listenToIsbnEntries();
      listenToPaymentSettings();
    }

    if (isMainAdminPage) {
      ensureShippingAdminSection();
      renderAdminFees();
      renderAdminShippingMethods();
      renderAdminDiscounts();
      renderAdminBooks();
    }

    if (isUploadPage) {
        renderAdminBooks();
    }
    if (isLagerPage) renderLager();

    if (isUserPage) {
      if (!managedUsers.length) loadManagedUsers();
      renderUserManagement();
    }

    if (isErrors) {
      listenToErrorReports();
      renderErrorReportsPage();
    }

    if (isAuthAdmin) loadAuthMailSettings();
    if (isEmailConfig) loadEmailConfigSettings();
    if (isBackend) renderBackendSettings();
    if (isPurchaseConfirm) loadPurchaseConfirmationSettings();
    if (isVoucherAdmin) loadGiftVoucherSettings();
    if (isVoucherList) listenGiftVoucherCodes();
    if (isTodo) listenToAdminTodos();
    if (isAppLogin) loadAdminAppLoginCode();

    if ($("#firebaseAssetList")) renderFirebaseHandle();
  }

  if (canHandleSupportChats()) {
    listenToSupportChats();
    listenToSupportAssignees();
  }

  if (isSupport) {
    if (activeSupportChatId) listenToSupportMessages();
    renderSupport();
  }

  renderCustomerSupportWidget();
  ensureGiftVoucherFooterLink();
  loadGiftVoucherTemplates();

  applyDesignMode();
  renderAdminHeaderLink();
  renderAccountAvatars();
  renderBooks();
  renderAccount();
  renderOwnAccountPage();
  renderCart();
  renderNewsletter();
  renderWishlist();
  prefillCheckoutFromProfile();
};

function prefillCheckoutFromProfile() {
  const form = $("#checkoutForm");
  if (!form || !currentUser) return;
  const profileAddress = normalizeAddressParts(currentProfile || {});
  const values = {
    name: currentProfile?.name || currentUser.displayName || "",
    email: currentProfile?.email || currentUser.email || "",
    street: profileAddress.street || "",
    zip: profileAddress.zip || "",
    city: profileAddress.city || ""
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
  const settings = readJsonStorage(NEWSLETTER_KEY, {});
  const subscriptionId = settings.subscriptionId || settings.email;
  if (db && subscriptionId) {
    db.collection("newsletterSubscriptions").doc(subscriptionId).delete().catch((error) => {
      console.warn("Newsletter-Abonnement konnte nicht aus Firebase gelöscht werden.", error);
    });
  }
  localStorage.removeItem(NEWSLETTER_KEY);
  localStorage.removeItem(NEWSLETTER_SEEN_KEY);
  renderNewsletter();
  showToast("Newsletter abbestellt.");
}

function normalizeSmtpSettingsFromForm(form) {
  if (!form) return null;
  const data = new FormData(form);
  const portValue = Number(String(data.get("port") ?? data.get("smtpPort") ?? "587"));
  return {
    smtpHost: String(data.get("host") ?? data.get("smtpHost") ?? "").trim(),
    smtpPort: Number.isFinite(portValue) ? portValue : 587,
    smtpUser: String(data.get("user") ?? data.get("smtpUser") ?? "").trim(),
    smtpPassword: String(data.get("pass") ?? data.get("smtpPassword") ?? "").trim(),
    smtpSecure: (data.get("secure") ?? data.get("smtpSecure") ?? "") === "on"
  };
}

async function loadStoredSmtpConfigIntoForm(form) {
  if (!form || !db) return;
  const snap = await db.collection("settings").doc("emailConfig").get().catch(() => null);
  const settings = snap?.exists ? snap.data() : {};
  const hostField = formField(form, "host") || form.elements.namedItem("smtpHost");
  const portField = formField(form, "port") || form.elements.namedItem("smtpPort");
  const userField = formField(form, "user") || form.elements.namedItem("smtpUser");
  const passField = formField(form, "pass") || form.elements.namedItem("smtpPassword");
  const secureField = form.elements.namedItem("secure") || form.elements.namedItem("smtpSecure");
  if (hostField) hostField.value = settings.smtpHost || "";
  if (portField) portField.value = settings.smtpPort || "";
  if (userField) userField.value = settings.smtpUser || "";
  if (passField) passField.value = settings.smtpPassword || "";
  if (secureField) secureField.checked = Boolean(settings.smtpSecure);
  if (settings.smtpHost || settings.smtpUser) {
    checkSmtpStatus({
      host: settings.smtpHost,
      port: settings.smtpPort,
      user: settings.smtpUser,
      pass: settings.smtpPassword,
      secure: settings.smtpSecure
    });
  }
}

async function saveNewsletterSmtpSettings(form, { silent = false } = {}) {
  if (!form || !db || !isAdmin()) return;
  const values = normalizeSmtpSettingsFromForm(form);
  if (!values || !values.smtpHost || !values.smtpUser || !values.smtpPassword) return;
  const previousSnap = await db.collection("settings").doc("emailConfig").get().catch(() => null);
  const previous = previousSnap?.exists ? previousSnap.data() : {};
  await db.collection("settings").doc("emailConfig").set({
    ...previous,
    ...values,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  if (!silent) showToast("SMTP-Daten gespeichert.");
  checkSmtpStatus(values);
}

function renderNewsletter() {
  const list = $("#newsletterPosts");
  const adminPanel = $("#newsletterAdminPanel");
  const subForm = $("#subscriptionForm");
  const pushToggle = $("#pushToggle");

  if (adminPanel) {
    adminPanel.classList.toggle("hidden", !isAdmin());
    if (isAdmin()) {
      listenToSubscribers();
    }
  }

  if (subForm) {
    const settings = readJsonStorage(NEWSLETTER_KEY, { subscribed: false, push: false });
    if (pushToggle) pushToggle.checked = settings.push === true;
  }

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
  const settings = readJsonStorage(NEWSLETTER_KEY, {});
  if (!newsletterSubscribed() || settings.push !== true || !newsletterPosts.length || !("Notification" in window)) return;
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

function listenToSubscribers() {
    if (!isAdmin() || listenToSubscribers.unsubscribe) return;
    listenToSubscribers.unsubscribe = db.collection("newsletterSubscriptions").onSnapshot(snap => {
        const count = $("#subscriberCount");
        if (count) count.textContent = snap.size;
    });
}

async function subscribeNewsletter() {
  const pushToggle = $("#pushToggle");
  const pushEnabled = pushToggle ? pushToggle.checked : false;
  if (newsletterSubscribed()) return unsubscribeNewsletter();

  try {
    if (pushEnabled) {
      if (!("Notification" in window)) {
        showToast("Browser-Push wird in diesem Browser nicht unterstützt.");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          showToast("Browser-Push wurde nicht aktiviert.");
        }
      }
    }

    const email = currentProfile?.email || currentUser?.email || "";
    const subscriptionId = currentUser?.uid || (email ? email.replace(/[^a-zA-Z0-9]/g, "_") : `browser-${newId()}`);

    const sub = {
      push: pushEnabled,
      userId: currentUser?.uid || null,
      email: email,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!db) return showToast("Firebase ist noch nicht bereit.");
    await db.collection("newsletterSubscriptions").doc(subscriptionId).set(sub, { merge: true });

    writeJsonStorage(NEWSLETTER_KEY, { subscribed: true, subscriptionId, push: pushEnabled });
    showToast(pushEnabled ? "Newsletter abonniert (mit Benachrichtigungen)." : "Newsletter abonniert.");
    renderNewsletter();
  } catch (error) {
    console.error(error);
    showToast("Fehler: " + error.message);
  }
}

function unsubscribeNewsletter() {
  const settings = readJsonStorage(NEWSLETTER_KEY, {});
  const subscriptionId = settings.subscriptionId;

  if (db && subscriptionId) {
    db.collection("newsletterSubscriptions").doc(subscriptionId).delete().catch((error) => {
      console.warn("Newsletter-Abo konnte nicht gelöscht werden.", error);
    });
  }

  localStorage.removeItem(NEWSLETTER_KEY);
  localStorage.removeItem(NEWSLETTER_SEEN_KEY);
  renderNewsletter();
  showToast("Newsletter abbestellt.");
}

async function checkSmtpStatus(config) {
    const dot = $("#smtpStatusDot");
    const host = config.smtpHost || config.host;
    const user = config.smtpUser || config.user;
    const port = Number(config.smtpPort || config.port);
    const pass = config.smtpPassword || config.pass || config.password;
    const secure = config.smtpSecure || config.secure;

    if (!dot || !host || !user) return;

    dot.className = "status-dot scanning";

    try {
        const res = await postToBackend("test-smtp", {
            host,
            port,
            user,
            pass,
            secure
        });

        if (res.success || res.ok) {
            dot.className = "status-dot green";
            dot.title = "Verbindung erfolgreich!";
        } else {
            dot.className = "status-dot red";
            dot.title = "Fehler: " + (res.error || "Unbekannter SMTP-Fehler");
            showToast("SMTP Test fehlgeschlagen: " + (res.error || "Server nicht erreichbar"));
        }
    } catch (error) {
        dot.className = "status-dot red";
        dot.title = "Verbindungsfehler";
        console.error("SMTP Check Error:", error);
    }
}

async function requestCustomAuthEmail(action, options = {}) {
  const idToken = currentUser ? await currentUser.getIdToken().catch(() => "") : "";
  const response = await fetch(backendUrl("send-auth-action"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      email: options.email || currentUser?.email || currentProfile?.email || "",
      newEmail: options.newEmail || "",
      name: options.name || currentProfile?.name || currentUser?.displayName || "",
      uid: options.uid || currentUser?.uid || "",
      idToken,
      origin: window.location.origin
    })
  });
  const data = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) throw new Error(data.error || "Auth-Mail konnte nicht gesendet werden.");
  return data;
}

async function resendOwnVerificationEmail() {
  if (!currentUser?.email) return showToast("Keine E-Mail-Adresse gefunden.");
  if (!emailVerificationRequired()) return showToast("Deine E-Mail-Adresse ist bereits bestätigt.");
  try {
    await requestCustomAuthEmail("emailVerification", {
      email: currentUser.email,
      name: currentProfile?.name || currentUser.displayName || currentUser.email,
      uid: currentUser.uid
    });
    showToast("Bestätigungsmail wurde erneut gesendet (bitte auch im Spam-Ordner nachsehen).");
  } catch (error) {
    showToast(readableErrorText(error) || authErrorMessage(error));
  }
}

const RETURN_SHIPMENT_METHODS = {
  dhl: {
    id: "dhl",
    label: "DHL Retoure Online (QR Code)",
    code: "dhl_de:retoure/kg=0-31.5,labelless",
    price: 4.9,
    description: "Mit QR-Code / einfacher Rücksendung"
  },
  dpd: {
    id: "dpd",
    label: "DPD Shop Return (Labelless)",
    code: "dpd:return/kg=0-20,return",
    price: 3.9,
    description: "Mit Shop-Return / labelless"
  }
};

function returnShipmentsForDisplay() {
  return Object.values(RETURN_SHIPMENT_METHODS)
    .map((method) => ({
      ...method,
      priceText: `${Number(method.price).toFixed(2).replace(".", ",")} €`
    }));
}

function normalizeReturnItem(item) {
  const quantity = Number(item?.quantity || item?.qty || item?.amount || 1);
  return {
    id: item?.id || item?.bookId || item?.productId || item?.title || Math.random().toString(16).slice(2),
    title: item?.title || item?.name || item?.bookTitle || "Artikel",
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    price: Number(item?.price || item?.unitPrice || 0),
    reason: item?.reason || "Sonstiges"
  };
}

function renderReturnOrderSelection(order) {
  const panel = $("#returnOrderSelection");
  const summary = $("#returnOrderSummary");
  const itemsContainer = $("#returnItemsContainer");
  const methodsWrap = $("#returnShippingMethods");
  if (!panel || !summary || !itemsContainer || !methodsWrap) return;

  const items = Array.isArray(order.items) ? order.items : [];
  summary.innerHTML = `
    <p><strong>Bestellnummer:</strong> ${escapeHtml(order.orderNumber || "-")}</p>
    <p><strong>Kunde:</strong> ${escapeHtml(order.customer?.name || "-")}</p>
    <p><strong>E-Mail:</strong> ${escapeHtml(order.customer?.email || "-")}</p>
    <p><strong>Lieferadresse:</strong> ${escapeHtml([order.customer?.street || order.shippingAddress?.street || "", order.customer?.zip || order.shippingAddress?.zip || "", order.customer?.city || order.shippingAddress?.city || ""].filter(Boolean).join(", ") || "-")}</p>
  `;

  itemsContainer.innerHTML = items.length
    ? items.map((item) => {
        const normalized = normalizeReturnItem(item);
        const itemId = encodeURIComponent(String(normalized.id));
        return `
          <div class="panel" style="padding: 16px; margin-bottom: 12px;">
            <label class="checkbox-line" style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
              <input type="checkbox" data-return-item="${escapeHtml(String(normalized.id))}" checked>
              <span><strong>${escapeHtml(normalized.title)}</strong> — ${Number(normalized.quantity)}x</span>
            </label>
            <div class="form-two" style="margin-top: 8px;">
              <label>
                Menge zurücksenden
                <input type="number" min="1" max="${normalized.quantity}" value="${normalized.quantity}" data-return-qty="${escapeHtml(String(normalized.id))}">
              </label>
              <label>
                Rücksendegrund
                <select data-return-reason="${escapeHtml(String(normalized.id))}">
                  <option value="Defekt">Defekt</option>
                  <option value="Falsche Ware">Falsche Ware</option>
                  <option value="Nicht gefallen">Nicht gefallen</option>
                  <option value="Zu groß">Zu groß</option>
                  <option value="Zu klein">Zu klein</option>
                  <option value="Sonstiges" selected>Sonstiges</option>
                </select>
              </label>
            </div>
          </div>
        `;
      }).join("")
    : "<p class='muted'>Für diese Bestellung wurden keine Artikel gefunden.</p>";

  methodsWrap.innerHTML = returnShipmentsForDisplay().map((method) => `
    <label class="panel" style="padding: 16px; display: block; cursor: pointer;">
      <input type="radio" name="returnShipmentMethod" value="${escapeHtml(method.id)}" ${method.id === "dhl" ? "checked" : ""}>
      <strong>${escapeHtml(method.label)}</strong>
      <div class="muted">${escapeHtml(method.description)}</div>
      <div><strong>${escapeHtml(method.priceText)}</strong></div>
    </label>
  `).join("");

  panel.classList.remove("hidden");
}

async function findOrderForReturn({ orderNumber, email, zip }) {
  const normalizedOrderNumber = String(orderNumber || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedZip = String(zip || "").trim();

  if (!normalizedOrderNumber && !normalizedEmail && !normalizedZip) return null;

  if (db && normalizedOrderNumber) {
    try {
      const snap = await db.collection("orders").where("orderNumber", "==", normalizedOrderNumber).limit(1).get();
      if (!snap.empty) {
        const order = snap.docs[0].data();
        const orderId = snap.docs[0].id;
        if (!normalizedEmail && !normalizedZip) return { id: orderId, ...order };
        const customerEmail = String(order.customer?.email || "").trim().toLowerCase();
        const customerZip = String(order.customer?.zip || order.shippingAddress?.zip || "").trim();
        const byEmail = !normalizedEmail || customerEmail === normalizedEmail;
        const byZip = !normalizedZip || customerZip === normalizedZip;
        if (byEmail && byZip) return { id: orderId, ...order };
      }
    } catch (error) {
      console.warn("Bestellung per Bestellnummer konnte nicht geladen werden.", error);
    }
  }

  const fromStorage = readJsonStorage("entfalta_mock_return_order", null);
  if (fromStorage && (normalizedOrderNumber ? fromStorage.orderNumber === normalizedOrderNumber : true)) {
    const byEmail = !normalizedEmail || String(fromStorage.customer?.email || "").toLowerCase() === normalizedEmail;
    const byZip = !normalizedZip || String(fromStorage.customer?.zip || fromStorage.shippingAddress?.zip || "") === normalizedZip;
    if (byEmail && byZip) return fromStorage;
  }

  if (!normalizedOrderNumber && (normalizedEmail || normalizedZip)) {
    const allOrders = [...orders, ...customerOrders];
    const match = allOrders.find((order) => {
      const customerEmail = String(order.customer?.email || "").trim().toLowerCase();
      const customerZip = String(order.customer?.zip || order.shippingAddress?.zip || "").trim();
      return (!normalizedEmail || customerEmail === normalizedEmail) && (!normalizedZip || customerZip === normalizedZip);
    });
    if (match) return match;
  }

  return null;
}

async function createSendcloudReturnRequest(payload) {
  const orderId = payload?.orderId || payload?.order?.id || payload?.order?.orderNumber;
  if (!orderId) {
    throw new Error("Für die Retoure fehlt die Bestell-ID.");
  }

  const backendResult = await postToBackend("create-sendcloud-return", {
    orderId,
    order: payload?.order || null,
    items: payload?.items || [],
    shipmentMethod: payload?.shipmentMethod || "dhl",
    customer: payload?.customer || null
  });

  return {
    ok: true,
    returnId: backendResult.returnId || backendResult.id || `RET-${Date.now()}`,
    trackingNumber: backendResult.trackingNumber || backendResult.tracking_number || "",
    shipment: backendResult.shipment || { id: payload?.shipmentMethod || "dhl", label: "Sendcloud Return" },
    labelUrl: backendResult.labelUrl || backendResult.label_url || "",
    qrCodeUrl: backendResult.qrCodeUrl || backendResult.qr_code_url || "",
    createdAt: backendResult.createdAt || new Date().toISOString(),
    mock: false,
    message: backendResult.message || "Return wurde erfolgreich in Sendcloud angelegt."
  };
}

async function submitReturnRequest({ order, selectedItems, shipmentMethodId, reasonMap, customer }) {
  if (!order) throw new Error("Keine Bestellung gefunden.");
  const selected = selectedItems
    .map((item) => normalizeReturnItem(item))
    .filter((item) => Number(item.quantity) > 0);

  if (!selected.length) throw new Error("Bitte mindestens einen Artikel für die Retoure auswählen.");

  const method = RETURN_SHIPMENT_METHODS[shipmentMethodId] || RETURN_SHIPMENT_METHODS.dhl;
  const items = selected.map((item) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    reason: reasonMap?.[item.id] || item.reason || "Sonstiges",
    price: item.price
  }));

  const result = await createSendcloudReturnRequest({
    shipmentMethod: method.id,
    customer,
    orderId: order.id || order.orderNumber,
    items
  });

  const returnInfo = {
    orderId: order.id || order.orderNumber,
    orderNumber: order.orderNumber || "",
    shipmentMethod: method.id,
    shipmentCode: method.code,
    customer: {
      name: customer.name || order.customer?.name || "",
      email: customer.email || order.customer?.email || "",
      zip: customer.zip || order.customer?.zip || "",
      street: customer.street || order.customer?.street || ""
    },
    items,
    returnId: result.returnId,
    trackingNumber: result.trackingNumber,
    labelUrl: result.labelUrl,
    qrCodeUrl: result.qrCodeUrl,
    createdAt: result.createdAt,
    message: result.message
  };

  if (order.id && db) {
    await db.collection("orders").doc(order.id).set({
      returnRequest: {
        status: "requested",
        requestedAtMs: Date.now(),
        returnId: result.returnId,
        trackingNumber: result.trackingNumber,
        shipmentMethod: method.id,
        labelUrl: result.labelUrl,
        qrCodeUrl: result.qrCodeUrl,
        items,
        carrier: method.label
      }
    }, { merge: true }).catch(() => {});
  }

  return returnInfo;
}

async function requestReturn(orderId) {
  const order = [...orders, ...customerOrders].find((entry) => entry.id === orderId) || null;
  const params = new URLSearchParams();
  if (order?.id) params.set("orderId", order.id);
  if (order?.orderNumber) params.set("orderNumber", order.orderNumber);
  if (order?.customer?.email) params.set("email", order.customer.email);
  if (order?.customer?.zip || order?.shippingAddress?.zip) params.set("zip", order.customer?.zip || order.shippingAddress?.zip || "");
  const target = `${pageHref("ruecksendungen.html")}${params.toString() ? `?${params.toString()}` : ""}`;
  window.location.href = target;
}

async function verifyAnonymousReturn(event) {
    event.preventDefault();
    const form = event.target;
    const orderNumber = form.elements.orderNumber.value.trim();
    const firstName = form.elements.firstName.value.trim();
    const lastName = form.elements.lastName.value.trim();
    const email = form.elements.email.value.trim();
    const fullName = `${firstName} ${lastName}`.trim();

    try {
        const snap = await db.collection("orders").where("orderNumber", "==", orderNumber).limit(1).get();
        if (snap.empty) return showToast("Bestellung nicht gefunden.");

        const doc = snap.docs[0];
        const order = doc.data();

        // Verify Name and Email (case-insensitive for email)
        const nameMatches = order.customer?.name?.toLowerCase() === fullName.toLowerCase();
        const emailMatches = order.customer?.email?.toLowerCase() === email.toLowerCase();

        if (!nameMatches || !emailMatches) {
            return showToast("Verifizierung fehlgeschlagen. Bitte Name und E-Mail prüfen.");
        }

        $("#returnRequestSection").classList.remove("hidden");
        form.classList.add("hidden");

        const deliveredAt = order.deliveredAtMs || 0;
        const now = Date.now();
        const fourteenDays = 14 * 24 * 60 * 60 * 1000;
        const isEligible = deliveredAt > 0 && (now - deliveredAt) < fourteenDays;

        const info = $("#returnEligibilityInfo");
        if (order.returnRequest) {
            info.innerHTML = `Status deiner Rücksendung: <b>${order.returnRequest.status === 'requested' ? 'In Bearbeitung' : 'Label bereit'}</b>`;
            if (order.returnRequest.labelUrl) {
                $("#returnLabelBox").classList.remove("hidden");
                $("#downloadReturnLabel").href = order.returnRequest.labelUrl;
            }
        } else if (isEligible) {
            info.textContent = "Deine Bestellung ist für eine Rücksendung berechtigt.";
            $("#returnActionBox").classList.remove("hidden");
            $("#submitReturnRequest").onclick = () => submitAnonymousReturnRequest(doc.id, $("#returnEmailNotify").checked);
        } else {
            info.textContent = "Die 14-tägige Rücksendefrist ist leider abgelaufen oder die Bestellung wurde noch nicht als zugestellt markiert.";
        }

    } catch (error) {
        showToast("Fehler bei der Verifizierung: " + error.message);
    }
}

async function submitAnonymousReturnRequest(orderId, notifyEmail) {
    try {
        const now = Date.now();
        const orderRef = db.collection("orders").doc(orderId);

        const returnRequest = {
            requestedAtMs: now,
            status: 'requested',
            notifyEmail: notifyEmail
        };

        await orderRef.update({ returnRequest });
        showToast("Rücksendung beantragt!");
        location.reload(); // Refresh to show status
    } catch (error) {
        showToast("Fehler beim Senden der Anfrage: " + error.message);
    }
}

async function renderAdminReturns() {
  const panel = $("#adminReturnPanel");
  const list = $("#adminReturnList");
  if (!panel || !list) return;

  if (!isAdmin()) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  $("#adminBookList")?.classList.add("hidden");
  $("#adminOrderList")?.classList.add("hidden");
  $("#bookForm")?.classList.add("hidden");
  $("#feeForm")?.classList.add("hidden");
  $("#discountForm")?.classList.add("hidden");
  $("#websiteSettingsForm")?.classList.add("hidden");

  try {
    const snap = await db.collection("orders")
      .where("returnRequest.status", "in", ["requested", "label_uploaded"])
      .get();

    if (snap.empty) {
      list.innerHTML = `<p class="muted">Keine Rücksendungen vorhanden.</p>`;
      return;
    }

    list.innerHTML = snap.docs.map(doc => {
      const order = doc.data();
      const rr = order.returnRequest;
      return `
        <div class="admin-item">
          <strong>Bestellung: ${escapeHtml(order.orderNumber)}</strong>
          <p>Kunde: ${escapeHtml(order.customer?.name)} (${escapeHtml(order.customer?.email)})</p>
          <p>Status: <b>${escapeHtml(rr.status === 'requested' ? 'Neu beantragt' : 'Label hochgeladen')}</b></p>
          <p>Rücksende-Dienstleister: <b>${escapeHtml(rr.carrier || "DHL")}</b></p>
          <div class="admin-actions">
            <label class="profile-file-label">
                Neues Label hochladen (PDF)
                <span class="profile-file-picker">
                    <input type="file" accept="application/pdf" data-return-label-upload="${doc.id}">
                    <span class="profile-file-button">Label wählen</span>
                </span>
            </label>
            ${rr.labelUrl ? `<a href="${rr.labelUrl}" target="_blank" class="mini-link-button">Label öffnen</a>` : ""}
            <button type="button" data-complete-return="${doc.id}">Abschließen / Erstattet</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    showToast("Fehler beim Laden: " + error.message);
  }
}

async function uploadReturnLabel(input, orderId) {
    const file = input.files[0];
    if (!file) return;

    try {
        showToast("Lade Label hoch...");
        // Use Project 2 (pdfAssets) for return labels
        const pdfApp = firebaseApps.pdfAssets;
        if (!pdfApp) throw new Error("PDF-Projekt nicht initialisiert.");

        const storage = firebase.storage(pdfApp);
        const ref = storage.ref(`return-labels/${orderId}-${Date.now()}.pdf`);
        await ref.put(file);
        const labelUrl = await ref.getDownloadURL();

        await db.collection("orders").doc(orderId).update({
            "returnRequest.labelUrl": labelUrl,
            "returnRequest.status": "label_uploaded",
            "returnRequest.labelUploadedAtMs": Date.now()
        });

        showToast("Label erfolgreich hochgeladen!");
        renderAdminReturns();

        // Trigger email if requested (via backend)
        const orderSnap = await db.collection("orders").doc(orderId).get();
        if (orderSnap.data()?.returnRequest?.notifyEmail) {
            postToBackend("send-custom-email", {
                email: orderSnap.data().customer.email,
                subject: "Rücksende-Label bereit",
                body: `Hallo ${orderSnap.data().customer.name},\ndein Rücksende-Label für die Bestellung ${orderSnap.data().orderNumber} ist jetzt bereit und kann unter entfalta.com/ruecksendungen heruntergeladen werden.`
            }).catch(console.error);
        }

    } catch (error) {
        showToast("Upload fehlgeschlagen: " + error.message);
    }
}

async function submitNewsletterPost(event) {
  event.preventDefault();
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  if (!isAdmin()) return showToast("Nur Admins können Newsletter posten.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = data.get("title").trim();
  const text = data.get("text").trim();
  const uploadedImage = form.elements.namedItem("uploadedImage")?.files?.[0] || null;
  if (text.length < 10) return showToast("Der Newsletter-Text braucht mindestens 10 Zeichen.");
  let image = data.get("image") || sampleCover;
  if (uploadedImage) {
    try {
      const asset = await uploadFirebaseAsset("newsletter", uploadedImage);
      image = asset.src;
      await loadCoverOptions();
    } catch (error) {
      return showToast(error.message || "Newsletterbild konnte nicht gespeichert werden.");
    }
  }
  await db.collection("newsletterPosts").add({
    title,
    text,
    image,
    imageSource: uploadedImage ? "firestore-upload" : "newsletter-image",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    authorId: currentUser?.uid || null
  });

  form.reset();
  form.querySelector(".profile-file-name") && (form.querySelector(".profile-file-name").textContent = "Keine Datei ausgewählt");
  renderNewsletterImageOptions();
  showToast("Newsletter-Post veröffentlicht.");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a, [data-open]");
  if (!target) return;

  if (target.id === "refreshOrders") {
    if (typeof listenToOrders === "function") {
      if (listenToOrders.unsubscribe) {
        listenToOrders.unsubscribe();
        listenToOrders.unsubscribe = null;
      }
      listenToOrders();
      showToast("Bestellungen werden aktualisiert...");
    }
  }
  if (target.dataset.createSendcloudLabel) {
    const orderId = target.dataset.createSendcloudLabel;
    const originalHtml = target.innerHTML;
    target.disabled = true;
    target.innerHTML = `⏳ Bitte warten...`;

    // Grab the chosen shipping method from the dropdown (if any)
    const card = target.closest(".order-card");
    const methodSelect = card?.querySelector('[name="shippingMethodId"]');
    const selectedMethodId = methodSelect?.value;

    let updatePromise = Promise.resolve();
    if (selectedMethodId && selectedMethodId !== "") {
      const methodObj = normalizedShippingMethods().find(m => m.id === selectedMethodId);
      if (methodObj) {
        updatePromise = db.collection("orders").doc(orderId).update({
          shippingMethod: methodObj
        });
      }
    }

    updatePromise
      .then(() => postToBackend("create-sendcloud-parcel", { orderId, force: true }))
      .then(res => {
        if (res.ok) {
          target.innerHTML = `👍 Erfolgreich!`;
          showToast("Sendcloud-Auftrag erfolgreich!");
          setTimeout(() => {
            renderAll();
          }, 1500);
        } else {
          const errMsg = res.error || "Unbekannter Fehler";
          target.disabled = false;
          target.innerHTML = `❌ Fehler!`;
          showToast(`Fehler: ${errMsg}`);
          alert(`Fehler beim Erstellen des Sendcloud-Labels:\n\n${errMsg}`);
        }
      })
      .catch(e => {
        target.disabled = false;
        target.innerHTML = `❌ Fehler!`;
        showToast(`Backend-Fehler: ${e.message}`);
        alert(`Backend-Fehler beim Erstellen des Sendcloud-Labels:\n\n${e.message}`);
      });
  }

  if (target.dataset.markExternalLabel) {
    const orderId = target.dataset.markExternalLabel;
    if (confirm("Als 'Woanders erstellt' vermerken?\n\nEs wird kein Sendcloud-Label generiert und die Bestellung wird intern markiert.")) {
      target.disabled = true;
      target.innerHTML = `⏳ Speichern...`;

      db.collection("orders").doc(orderId).update({
        shippingLabelUrl: "extern",
        shipmentStatus: "Woanders erstellt"
      })
      .then(() => {
        showToast("Als 'Woanders erstellt' vermerkt.");
        setTimeout(() => {
          renderAll();
        }, 800);
      })
      .catch(e => {
        target.disabled = false;
        target.innerHTML = `Woanders erstellen`;
        showToast(`Fehler: ${e.message}`);
      });
    }
  }
  if (target.dataset.deleteLabel) {
    const orderId = target.dataset.deleteLabel;
    if (confirm("Versandetikett wirklich löschen?")) {
      db.collection("orders").doc(orderId).update({ shippingLabelUrl: null })
        .then(() => {
          showToast("Etikett gelöscht.");
          renderAll();
        })
        .catch(e => showToast("Fehler beim Löschen: " + e.message));
    }
  }

  if (target.dataset.category) {
    event.preventDefault();
    activeCategory = target.dataset.category;
    document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item.dataset.category === activeCategory));
    renderBooks();
    $("#books")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (target.closest("[data-description-toggle]")) {
    const toggle = target.closest("[data-description-toggle]");
    const wrapper = toggle?.closest(".description-toggle") || toggle;
    if (!wrapper) return;
    const desc = wrapper.querySelector(".product-description");
    const expanded = wrapper.classList.toggle("is-expanded");
    if (desc) desc.classList.toggle("is-expanded", expanded);
    const button = wrapper.querySelector(".text-toggle");
    if (button) button.textContent = expanded ? "Weniger anzeigen" : "Mehr anzeigen";
    return;
  }
  if (target.dataset.open) openBook(target.dataset.open);
  if (target.dataset.productVariant) {
    const [bookId, ...variantParts] = target.dataset.productVariant.split(":");
    const variantName = variantParts.join(":");
    const book = books.find((entry) => entry.id === bookId);
    const variant = book?.variants?.find((entry) => entry.name === variantName);
    if (book && variant) {
      document.querySelectorAll("[data-product-variant]").forEach((option) => option.classList.toggle("is-selected", option === target));
      const title = $("#modalTitle");
      const price = $("#modalVariantPrice");
      const image = $("#modalVariantImage");
      const description = $("#modalVariantDescription");
      const addButton = $("[data-add-variant]");
      const stockTag = $("#modalVariantStock");
      if (title) title.textContent = variant.title || book.title;
      if (price) price.textContent = `${Number(variant.price || 0).toFixed(2)} EUR`;
      if (image) image.src = variant.image || itemImage(book);
      if (description) {
        description.innerHTML = formatDescriptionHtml(variant.description || book.description || "", book.id);
      }
      if (stockTag) stockTag.innerHTML = stockPillMarkup(book, variant.name);
      if (addButton) addButton.dataset.addVariant = `${book.id}:${variant.name}`;
    }
  }
  if (target.dataset.addVariant) {
    const [bookId, ...variantParts] = target.dataset.addVariant.split(":");
    addToCart(bookId, "default", 1, variantParts.join(":"));
  }
  if (target.dataset.add) addToCart(target.dataset.add, "default", buyQuantityValue(target.dataset.add, "default"));
  if (target.dataset.wishlist) toggleWishlist(target.dataset.wishlist);
  if (target.dataset.edit) editBook(target.dataset.edit);
  if (target.dataset.bookToggle && isAdmin()) {
    const book = books.find((entry) => entry.id === target.dataset.bookToggle);
    if (!book) return;
    const nextDisabled = !Boolean(book.disabled || book.hidden);
    await db.collection("books").doc(book.id).set({
      disabled: nextDisabled,
      hidden: nextDisabled,
      disabledAt: nextDisabled ? firebase.firestore.FieldValue.serverTimestamp() : null,
      disabledBy: nextDisabled ? currentUser?.uid || null : null
    }, { merge: true });
    showToast(nextDisabled ? "Artikel deaktiviert und im Shop ausgeblendet." : "Artikel aktiviert und im Shop sichtbar.");
    return;
  }
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
  if (target?.matches?.('input[type="file"][name="profilePhoto"]')) {
    const label = target.closest(".profile-file-picker")?.querySelector(".profile-file-name");
    if (label) label.textContent = target.files?.[0]?.name || "Keine Datei ausgewählt";
    return;
  }
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
      deliveredAtMs: Date.now(),
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

function renderAdminWebsiteSettings() {
  const form = $("#websiteSettingsForm");
  if (!form || !isAdmin()) return;
  const enabled = form.elements.namedItem("appPromoEnabled");
  if (enabled) enabled.checked = Boolean(websiteSettings.appPromoEnabled);
}

async function saveWebsiteSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Website-Einstellungen speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const settings = {
    appPromoEnabled: data.get("appPromoEnabled") === "on",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  };
  await db.collection("settings").doc("website").set(settings, { merge: true });
  showToast("Website-Einstellungen gespeichert.");
}

function renderAppPromoBanner() {
  const existing = $("#appPromoBanner");
  const dismissedAt = localStorage.getItem("entfalta_app_promo_dismissed");
  const isDismissed = dismissedAt && Date.now() - Number(dismissedAt) < 30 * 60 * 1000;

  if (!websiteSettings.appPromoEnabled || isDismissed) {
    existing?.remove();
    return;
  }

  if (existing) return;

  const header = $(".site-header");
  if (!header) return;

  const banner = document.createElement("aside");
  banner.id = "appPromoBanner";
  banner.className = "app-promo-banner";
  banner.innerHTML = `
    <div class="app-promo-content">
      <img src="/assets/icon.jpeg" alt="" class="app-promo-icon">
      <div class="app-promo-text">
        <strong>Entfalta App nutzen</strong>
        <span>Hol dir alle Inhalte, Spiele und Offline-E-Books direkt aufs Handy.</span>
      </div>
      <div class="app-promo-actions">
        <a href="https://entfalta.com/app" class="app-promo-link">Mehr erfahren</a>
        <button type="button" id="closeAppPromo" class="app-promo-close" aria-label="Werbung schließen">X</button>
      </div>
    </div>
  `;

  header.insertAdjacentElement("afterend", banner);

  $("#closeAppPromo")?.addEventListener("click", () => {
    localStorage.setItem("entfalta_app_promo_dismissed", String(Date.now()));
    banner.remove();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const bf = document.getElementById("bookForm");
  if (bf) {
    bf.addEventListener("invalid", (e) => {
      e.preventDefault();
      const name = e.target.name || e.target.id;
      console.error("Form validation failed on field:", name, e.target);
      if (typeof showToast === "function") {
        showToast("Fehler: Bitte das Feld '" + name + "' ausfüllen.");
      }
    }, true);
  }
  $("#websiteSettingsForm")?.addEventListener("submit", saveWebsiteSettings);
  initCookieConsent();
  applyPerformanceMode();
  applyThemeMode();
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", applyThemeMode);
  window.addEventListener("resize", applyPerformanceMode, { passive: true });
  initMobileHeaderAutoHide();
  initPageScrollIndicator();
  loadCoverOptions();
  const giftCheckbox = formField($("#bookForm"), "isGift");
  giftCheckbox?.addEventListener("change", syncGiftSettingsVisibility);
  syncGiftSettingsVisibility();
  $("#registerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessage();
    if (!firebaseReady()) return showAuthMessage("Firebase fehlt noch.");
    const data = new FormData(event.currentTarget);
    const email = data.get("email").trim().toLowerCase();
    const password = data.get("password");
    if (!passwordIsStrong(password)) return showAuthMessage("Passwort: mindestens 8 Zeichen, groß/klein, Zahl und Sonderzeichen.");
    try {
      const methods = await auth.fetchSignInMethodsForEmail(email);
      if ((methods.includes("google.com") && !methods.includes("password")) || await emailAlreadyUsesGoogle(email)) {
        return showAuthMessage("Diese E-Mail wird bereits mit Google genutzt. Bitte melde dich mit „Mit Google anmelden“ an.");
      }
      const result = await auth.createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName: data.get("name").trim() });
      currentUser = result.user;
      currentProfile = await safeEnsureUserProfile(result.user, {
        name: data.get("name").trim(),
        street: data.get("street").trim(),
        zip: String(data.get("zip") || "").trim(),
        city: data.get("city").trim()
      });
      await requestCustomAuthEmail("emailVerification", {
        email: result.user.email,
        name: data.get("name").trim() || result.user.email,
        uid: result.user.uid
      }).catch((mailError) => {
        console.warn("Bestätigungsmail konnte nicht gesendet werden.", mailError);
        return result.user.sendEmailVerification().catch(() => {
          showAuthMessage(readableErrorText(mailError) || "Bestätigungsmail konnte nicht gesendet werden.");
        });
      });
      event.currentTarget.reset();
      renderAll();
      showAuthMessage(currentProfile.admin ? "Konto erstellt. Du bist Admin. Bitte bestätige trotzdem deine E-Mail (auch im Spam-Ordner nachsehen)." : "Konto erstellt. Bitte bestätige deine E-Mail (auch im Spam-Ordner nachsehen), bevor du einkaufst.", "success");
    } catch (error) {
      if (error?.code === "auth/email-already-in-use") {
        if (await emailAlreadyUsesGoogle(email)) return showAuthMessage("Diese E-Mail gehört bereits zu einem Google-Konto. Bitte nutze „Mit Google anmelden“.");
        try {
          const methods = await auth.fetchSignInMethodsForEmail(email);
          if (methods.includes("google.com") || await emailAlreadyUsesGoogle(email)) return showAuthMessage("Diese E-Mail gehört bereits zu einem Google-Konto. Bitte nutze „Mit Google anmelden“.");
        } catch {}
      }
      showAuthMessage(authErrorMessage(error));
    }
  });

  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessage();
    if (!firebaseReady()) return showAuthMessage("Firebase fehlt noch.");
    const data = new FormData(event.currentTarget);
    try {
      await auth.signInWithEmailAndPassword(data.get("email").trim().toLowerCase(), data.get("password"));
      if (emailVerificationRequired()) {
        showAuthMessage("Eingeloggt. Bitte bestätige deine E-Mail-Adresse, bevor du einkaufst.", "success");
      } else {
        showAuthMessage("Eingeloggt.", "success");
      }
    } catch (error) {
      showAuthMessage(authErrorMessage(error));
    }
  });

  $("#googleLogin")?.addEventListener("click", async () => {
    clearAuthMessage();
    if (!firebaseReady()) return showAuthMessage("Firebase fehlt noch.");
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
      showAuthMessage("Mit Google angemeldet.", "success");
    } catch (error) {
      if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
        return auth.signInWithRedirect(provider);
      }
      showAuthMessage(authErrorMessage(error));
    }
  });

  $("#bookForm")?.addEventListener("submit", (e) => {
    if (typeof submitBook === "function") submitBook(e);
  });
  formField($("#bookForm"), "downloadAvailable")?.addEventListener("change", () => {
    if (typeof updateMaterialFields === "function") updateMaterialFields();
  });

  $("#closeIsbnPicker")?.addEventListener("click", () => $("#isbnPickerModal")?.classList.add("hidden"));
  $("#isbnPickerSearch")?.addEventListener("input", (e) => renderIsbnPickerList(e.target.value));
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-isbn]");
    if (btn) {
      e.preventDefault();
      openIsbnPicker(btn.dataset.pickIsbn);
    }
  });

  $("#newsletterForm")?.addEventListener("submit", submitNewsletterPost);
  $("#firebaseHandleForm")?.addEventListener("submit", submitFirebaseHandleUpload);
  $("#firebaseAssetRefresh")?.addEventListener("click", renderFirebaseHandle);
  $("#firebaseAssetList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-firebase-asset]");
    if (!button) return;
    const asset = window.__firebaseHandleAssets?.[Number(button.dataset.deleteFirebaseAsset)];
    if (!asset) return showToast("Datei wurde nicht gefunden.");
    if (!confirm("Diese Datei aus Firebase löschen? Produkte/Newsletter, die sie schon verwenden, können danach ein leeres Bild zeigen.")) return;
    try {
      await deleteFirebaseAsset(asset);
      await loadCoverOptions();
      await renderFirebaseHandle();
      showToast("Firebase-Datei gelöscht.");
    } catch (error) {
      showToast(error.message || "Datei konnte nicht gelöscht werden.");
    }
  });
  $("#newsletterSubscribe")?.addEventListener("click", subscribeNewsletter);
  $("#coverChoice")?.addEventListener("change", () => renderCoverOptions($("#coverChoice").value));
  $("#newsletterImageChoice")?.addEventListener("change", () => renderNewsletterImageOptions($("#newsletterImageChoice").value));
  $("#newsletterImageUpload")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0] || null;
    const nameLabel = event.currentTarget.closest(".profile-file-picker")?.querySelector(".profile-file-name");
    if (nameLabel) nameLabel.textContent = file?.name || "Keine Datei ausgewählt";
    if (!file) return renderNewsletterImageOptions($("#newsletterImageChoice")?.value || "");
    try {
      const preview = $("#newsletterImagePreview");
      const dataUrl = await resizeNewsletterImage(file);
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      }
    } catch (error) {
      showToast(error.message || "Bildvorschau konnte nicht geladen werden.");
      event.currentTarget.value = "";
      if (nameLabel) nameLabel.textContent = "Keine Datei ausgewählt";
    }
  });
  $("#checkoutForm")?.addEventListener("submit", checkout);
  formField($("#checkoutForm") || document.createElement("form"), "discountCode")?.addEventListener("input", () => {
    checkCartCode("promo");
  });
  formField($("#checkoutForm") || document.createElement("form"), "voucherCode")?.addEventListener("input", () => {
    checkCartCode("voucher");
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
  const closeModalButton = $("#closeModal");
  if (closeModalButton) {
    closeModalButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeProductModal();
    });
    closeModalButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeProductModal();
    };
  }
  $("#accountButton")?.addEventListener("click", () => $("#authModal")?.classList.toggle("hidden"));
  $("#showReturns")?.addEventListener("click", renderAdminReturns);
  $("#anonymousReturnVerifyForm")?.addEventListener("submit", verifyAnonymousReturn);
  $("#returnLookupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const orderNumber = String(data.get("orderNumber") || "").trim();
    const email = String(data.get("email") || "").trim();
    const zip = String(data.get("zip") || "").trim();
    const statusBox = $("#returnLookupStatus");

    if (!orderNumber && !email && !zip) {
      statusBox?.classList.remove("hidden");
      statusBox.className = "auth-message is-error";
      statusBox.textContent = "Bitte Bestellnummer, E-Mail oder PLZ angeben.";
      return;
    }

    try {
      const order = await findOrderForReturn({ orderNumber, email, zip });
      if (!order) {
        statusBox?.classList.remove("hidden");
        statusBox.className = "auth-message is-error";
        statusBox.textContent = "Bestellung konnte nicht gefunden werden. Bitte prüfe die Daten.";
        $("#returnOrderSelection")?.classList.add("hidden");
        $("#returnResultSection")?.classList.add("hidden");
        return;
      }

      window.__activeReturnOrder = order;
      renderReturnOrderSelection(order);
      statusBox?.classList.add("hidden");
    } catch (error) {
      statusBox?.classList.remove("hidden");
      statusBox.className = "auth-message is-error";
      statusBox.textContent = error.message || "Bestellung konnte nicht geprüft werden.";
    }
  });

  $("#createReturnBtn")?.addEventListener("click", async () => {
    const order = window.__activeReturnOrder;
    if (!order) return showToast("Bitte zuerst eine Bestellung auswählen.");

    const selectedItems = Array.from(document.querySelectorAll("[data-return-item]"))
      .filter((input) => input.checked)
      .map((input) => {
        const itemId = input.dataset.returnItem;
        const item = (order.items || []).find((entry) => String(entry.id || entry.bookId || entry.title) === String(itemId));
        const qtyInput = document.querySelector(`[data-return-qty="${itemId}"]`);
        return {
          ...item,
          quantity: Number(qtyInput?.value || item?.quantity || 1),
          id: itemId
        };
      });

    const reasonMap = {};
    for (const item of selectedItems) {
      const select = document.querySelector(`[data-return-reason="${item.id}"]`);
      reasonMap[item.id] = String(select?.value || "Sonstiges");
    }

    const shipmentMethod = document.querySelector('input[name="returnShipmentMethod"]:checked')?.value || "dhl";
    const customer = {
      name: order.customer?.name || order.customerName || "",
      email: order.customer?.email || order.customerEmail || "",
      zip: order.customer?.zip || order.shippingAddress?.zip || "",
      street: order.customer?.street || order.shippingAddress?.street || ""
    };

    try {
      const result = await submitReturnRequest({
        order,
        selectedItems,
        shipmentMethodId: shipmentMethod,
        reasonMap,
        customer
      });

      const resultHtml = `
        <p><strong>Return ID:</strong> ${escapeHtml(result.returnId)}</p>
        <p><strong>Trackingnummer:</strong> ${escapeHtml(result.trackingNumber)}</p>
        <p><strong>Versandmethode:</strong> ${escapeHtml(result.shipmentMethod)} (${escapeHtml(result.shipmentCode)})</p>
        <p><strong>Label / QR:</strong> <a href="${result.labelUrl}" target="_blank" rel="noopener">Label herunterladen</a> | <a href="${result.qrCodeUrl}" target="_blank" rel="noopener">QR-Code öffnen</a></p>
        <p><strong>Hinweis:</strong> ${escapeHtml(result.message)}</p>
      `;
      $("#returnResultContent").innerHTML = resultHtml;
      $("#returnResultSection")?.classList.remove("hidden");
      showToast("Retoure erfolgreich erstellt.");
    } catch (error) {
      showToast(error.message || "Retoure konnte nicht erstellt werden.");
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (target.dataset.requestReturn) {
      const orderId = target.dataset.requestReturn;
      const order = [...orders, ...customerOrders].find((entry) => entry.id === orderId) || null;
      const params = new URLSearchParams();
      if (order?.id) params.set("orderId", order.id);
      if (order?.orderNumber) params.set("orderNumber", order.orderNumber);
      if (order?.customer?.email) params.set("email", order.customer.email);
      if (order?.customer?.zip || order?.shippingAddress?.zip) params.set("zip", order.customer?.zip || order.shippingAddress?.zip || "");
      if (confirm("Du wirst zur Selbstbedienung für die Retoure weitergeleitet.")) {
        window.location.href = `${pageHref("ruecksendungen.html")}${params.toString() ? `?${params.toString()}` : ""}`;
      }
    }
    if (target.dataset.completeReturn) {
        if (confirm("Rücksendung als abgeschlossen / erstattet markieren?")) {
            await db.collection("orders").doc(target.dataset.completeReturn).update({
                "returnRequest.status": "completed",
                "returnRequest.completedAtMs": Date.now()
            });
            renderAdminReturns();
            showToast("Abgeschlossen!");
        }
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.dataset.returnLabelUpload) {
        await uploadReturnLabel(target, target.dataset.returnLabelUpload);
    }
  });
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
      try {
        await requestCustomAuthEmail("passwordReset", {
          email: currentUser.email,
          name: currentProfile?.name || currentUser.displayName || currentUser.email,
          uid: currentUser.uid
        });
        showToast("Passwort-Link wurde per E-Mail gesendet.");
      } catch (error) {
        showToast(readableErrorText(error) || authErrorMessage(error));
      }
    }
    if (event.target.id === "resendVerificationEmail") {
      await resendOwnVerificationEmail();
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
  const checkoutData = readCheckoutData(null);
  if (!checkoutData?.cart?.length) {
    status.textContent = "Keine gespeicherten Checkout-Daten gefunden.";
    return;
  }
  status.textContent = "Bestellung wird gespeichert...";
  try {
    await createOrderFromCheckout(checkoutData);
    clearCheckoutData();
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

;

// removed OLD submitBook_2

editBook_OLD_2 = function editBook(bookId) {
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
  formField(form, "isGift").checked = Boolean(book.isGift);
  formField(form, "giftThreshold").value = book.giftThreshold || "";
  formField(form, "giftRequirementType").value = book.giftRequirementType || "none";
  renderCoverOptions(book.cover || "");
  $("#cancelEdit")?.classList.remove("hidden");
};

function paymentIndicatorState(order) {
  const mode = String(order?.paymentMode || "").trim().toLowerCase();
  const paymentStatus = String(order?.paymentStatus || order?.status || "").trim().toLowerCase();
  const status = String(order?.status || "").trim().toLowerCase();
  const paymentIntent = order?.paymentIntent || {};
  const hasInvoice = Boolean(order?.stripeInvoiceUrl || order?.hosted_invoice_url || order?.stripeResponse?.hosted_invoice_url);

  // Block known failure states
  if (mode.includes("error") || paymentStatus === "failed" || paymentStatus === "canceled" || paymentStatus === "expired" || paymentStatus === "requires_payment_method" || status === "failed") return "error";

  if (mode.includes("test") || order?.livemode === false || mode === "test-local" || paymentStatus === "test" || paymentIntent.livemode === false) return "test";

  if (order?.stripeSessionId || order?.stripePaymentIntentId || hasInvoice ||
      ["paid", "succeeded", "complete"].includes(paymentStatus) ||
      ["paid", "paid-needs-stock-check", "succeeded"].includes(status) ||
      ["stripe-paid", "stripe-ready", "stripe-live-paid", "stripe-test-paid", "test-local"].includes(mode) ||
      mode.includes("success")) return "paid";

  // If it's a new order with some status but no explicit failure, treat as paid/visible
  if (paymentStatus !== "" || status !== "") return "paid";

  return "error";
}

function paymentIndicatorMarkup(order) {
  const state = paymentIndicatorState(order);
  const color = state === "paid" ? "#2e7d32" : state === "test" ? "#ffa500" : "#c62828";
  const label = state === "paid" ? "Zahlung erfolgreich" : state === "test" ? "Test-Zahlung" : "Zahlungsfehler";
  return `<span style="color:${color}; font-weight:700;" title="${escapeHtml(label)}">●</span>`;
}

function orderIsPaid(order) {
  // Check if we are in admin mode or have admin privileges
  if (isAdmin() || (typeof isIsbnPage === "function" && isIsbnPage())) return true;
  return paymentIndicatorState(order) === "paid" || paymentIndicatorState(order) === "test";
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

function randomDownloadSessionId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_-";
  if (window.crypto?.getRandomValues) {
    const values = new Uint8Array(14);
    window.crypto.getRandomValues(values);
    return Array.from(values, (value) => chars[value % chars.length]).join("");
  }
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function createDownloadSession() {
  const now = Date.now();
  return {
    id: randomDownloadSessionId(),
    createdAtMs: now,
    expiresAtMs: now + 48 * 60 * 60 * 1000,
    usedAtMs: null
  };
}

function downloadSessionStatus(item) {
  if (item?.downloaded) return "downloaded";
  const session = item?.downloadSession || {};
  if (!session.id) return "missing";
  if (Number(session.expiresAtMs || 0) <= Date.now()) return "expired";
  return "active";
}

function downloadSessionStatusText(item) {
  const status = downloadSessionStatus(item);
  if (status === "downloaded") return `Download: heruntergeladen${item.downloadedAt ? ` (${escapeHtml(formatDateTime(item.downloadedAt))})` : ""}`;
  if (status === "expired") return "Download: Link abgelaufen";
  if (status === "missing") return "Download: keine Session";
  return `Download: offen bis ${escapeHtml(formatDateTime(item.downloadSession?.expiresAtMs))}`;
}

function formatOrderAddress(order) {
  const c = order?.customer || {};
  const s = order?.shippingAddress || order?.deliveryAddress || {};
  const stripe = order?.stripeSession?.shipping_details?.address || order?.stripeSession?.customer_details?.address || {};

  const street = String(c.street || c.address || s.street || s.address || stripe.line1 || order?.street || "").trim();
  const zip = String(c.zip || c.postal_code || c.plz || c.zipCode || s.zip || s.postal_code || s.plz || s.zipCode || stripe.postal_code || order?.zip || order?.postal_code || order?.plz || "").trim();
  const city = String(c.city || c.town || c.ort || s.city || s.town || s.ort || stripe.city || order?.city || "").trim();
  const country = String(c.country || s.country || stripe.country || order?.country || "DE").trim();

  const parts = [];
  if (street) parts.push(street);
  if (zip && city) {
    parts.push(`${zip} ${city}`);
  } else if (zip) {
    parts.push(`PLZ: ${zip}`);
  } else if (city) {
    parts.push(city);
  }
  if (country && country !== "DE") parts.push(country);

  return parts.length ? parts.join(", ") : "Keine Adresse angegeben";
}

function renderAdminOrderCard(order) {
  const address = formatOrderAddress(order);
  const total = Number(order.total || 0).toFixed(2);
  const fulfillmentStatus = orderFulfillmentStatus(order);
  const carrier = order.shippingCarrier || "";
  return `
    <div class="admin-item order-card">
      <strong>Name: ${escapeHtml(order.customer?.name || "Unbekannt")}</strong>
      <p><b>${escapeHtml(orderDateText(order.createdAt))}</b></p>
      <p><b>E-Mail:</b> ${escapeHtml(order.customer?.email || "Keine E-Mail")}</p>
      <p><b>Adresse:</b> ${escapeHtml(address || "Keine Adresse")}</p>
      ${orderAddressEditorMarkup(order)}
      <p><b>Bezahlt:</b> ${orderIsPaid(order) ? "Ja" : "Nein"} | <b>Betrag:</b> ${total} EUR</p>
      <p><b>Bestellung:</b> ${orderKindLabel(order)}</p>
      ${order.sendcloudParcelId ? `<p><b>Sendcloud ID:</b> ${escapeHtml(order.sendcloudParcelId)}</p>` : ""}
      <div class="order-detail-list">
        ${(order.items || []).map((item) => `
          <p>
            <b>${escapeHtml(item.title || "Artikel")}</b>
            ${Number(item.quantity || 1)} x
            ${escapeHtml(item.fulfillmentLabel || itemFulfillmentLabel(item.fulfillment || "default"))}
            <span>${orderItemKind(item)}</span>
            ${item.fulfillment === "download" ? `
              <span class="download-status ${item.downloaded ? "downloaded" : "pending"}">${downloadSessionStatusText(item)}</span>
              <small>Session: ${escapeHtml(item.downloadSession?.id || "fehlt")}</small>
            ` : ""}
          </p>
        `).join("") || `<p class="muted">Keine Artikel gespeichert.</p>`}
      </div>
      <p><b>Status:</b> ${order.archived ? "Archiviert" : "Offen"}${order.archived ? " | wird nach 90 Tagen gelöscht" : ""}</p>

      <div class="shipment-status-display" style="padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px; margin-bottom: 12px;">
        <p><b>Versand-Status (Live):</b> ${escapeHtml(order.shipmentStatus || "Wartet auf Bearbeitung")}</p>
        ${order.trackingNumber ? `
          <p><b>Tracking:</b> <a href="${escapeHtml(order.trackingUrl || "#")}" target="_blank" style="text-decoration: underline;">${escapeHtml(order.trackingNumber)}</a></p>
        ` : ""}
      </div>

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
          Tracking-Anbieter
          <select name="shippingCarrier" data-shipping-carrier-select>
            ${shippingCarrierOptionsMarkup(carrier)}
          </select>
        </label>
        <label class="shipping-carrier-custom-field ${carrier === "Weitere" ? "" : "hidden"}">
          Eigener Tracking-Anbieter
          <input name="shippingCarrierCustom" value="${escapeHtml(order.shippingCarrierCustom || "")}" placeholder="Nur bei Weitere">
        </label>
        <label>
          Sendungsnummer
          <input name="trackingNumber" value="${escapeHtml(order.trackingNumber || "")}" placeholder="z.B. 000000000">
        </label>
        <button type="button" data-order-shipping-save="${order.id}">Status / Versand speichern</button>
      </div>
      <div class="shipping-label-tools" style="margin-top: 12px; display: grid; gap: 8px;">
        ${!order.shippingLabelUrl ? `
          <div class="admin-actions">
            <button type="button" data-create-sendcloud-label="${order.id}">Sendcloud Label erstellen${paymentIndicatorState(order) === "test" ? " (Test)" : ""}</button>
            <button type="button" class="secondary-button" data-mark-external-label="${order.id}">Woanders erstellen</button>
            <label class="profile-file-label" style="margin: 0;">
                <span class="profile-file-picker">
                    <input type="file" accept="application/pdf" data-upload-shipping-label="${order.id}">
                    <span class="profile-file-button" style="min-height: 34px; padding: 6px 12px;">Manuell hochladen</span>
                </span>
            </label>
          </div>
        ` : `
          <div class="admin-actions">
            ${order.shippingLabelUrl === "extern" ? `<span style="background:#e0e0e0; color:#333; padding: 6px 12px; border-radius: 8px; font-weight: bold; display: inline-block;">Woanders erstellt</span>` : `<a href="${order.shippingLabelUrl}" target="_blank" class="mini-link-button">Etikett ansehen/drucken</a>`}
            <button type="button" data-delete-label="${order.id}" class="secondary-button" style="color: #c62828;">${order.shippingLabelUrl === "extern" ? "Zurücksetzen" : "Löschen"}</button>
          </div>
        `}
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
  if (!db || !isAdmin()) return showToast("Nur Admins können Bestellungen bearbeiten.");
  const box = document.querySelector(`[data-order-shipping="${CSS.escape(orderId)}"]`);
  if (!box) return;
  const order = orders.find((entry) => entry.id === orderId) || {};
  const selectedStatus = box.querySelector('[name="fulfillmentStatus"]')?.value || "wird vorbereitet";
  const customStatus = String(box.querySelector('[name="customFulfillmentStatus"]')?.value || "").trim();
  const fulfillmentStatus = selectedStatus === "custom" ? (customStatus || "wird vorbereitet") : selectedStatus;
  const shippingCarrier = box.querySelector('[name="shippingCarrier"]')?.value || "";
  const shippingCarrierCustom = String(box.querySelector('[name="shippingCarrierCustom"]')?.value || "").trim();
  const trackingNumber = String(box.querySelector('[name="trackingNumber"]')?.value || "").trim();
  const shippingMethodId = box.querySelector('[name="shippingMethodId"]')?.value || "";
  const shippingMethodReason = String(box.querySelector('[name="shippingMethodReason"]')?.value || "").trim();
  const currentMethodId = String(order.shippingMethod?.id || "");
  const selectedMethod = activeShippingMethods().find((method) => method.id === shippingMethodId);
  const methodChanged = Boolean(selectedMethod && shippingMethodId && shippingMethodId !== currentMethodId);
  if (methodChanged && shippingMethodReason.length < 3) {
    return showToast("Bitte kurz begründen, warum die Versandart geändert wird.");
  }
  const update = {
    fulfillmentStatus,
    shippingCarrier,
    shippingCarrierCustom: shippingCarrier === "Weitere" ? shippingCarrierCustom : "",
    trackingNumber,
    shippingUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (methodChanged) {
    const previousMethod = order.shippingMethod || {};
    const notice = {
      type: "shipping-method-changed",
      previousId: previousMethod.id || "",
      previousName: previousMethod.name || "",
      nextId: selectedMethod.id,
      nextName: selectedMethod.name,
      reason: shippingMethodReason,
      createdAtMs: Date.now()
    };
    update.shippingMethod = {
      id: selectedMethod.id,
      name: selectedMethod.name,
      price: Number(selectedMethod.price || 0),
      description: selectedMethod.description || ""
    };
    update.shippingMethodChangeReason = shippingMethodReason;
    update.shippingMethodChangeNotice = notice;
    update.customerNotifications = firebase.firestore.FieldValue.arrayUnion(notice);
  }
  await db.collection("orders").doc(orderId).set(update, { merge: true });
  showToast("Bestellstatus und Versand gespeichert.");
}

renderAdminBooks_OLD_2 = function renderAdminBooks() {
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
    deliveredAtMs: Date.now(),
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
  const webLive = activeSessions.filter((session) => session.platform !== "app").length;
  const appLive = activeSessions.filter((session) => session.platform === "app").length;
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
      <div><strong>${webLive}</strong><span>Webseite live</span></div>
      <div><strong>${appLive}</strong><span>App live</span></div>
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
  syncProductUrl(book);
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const publishedMarkup = bookPublicationMarkup(book);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img class="modal-cover" src="${book.cover || sampleCover}" alt="Cover von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        ${publishedMarkup}
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="buy-action-row">
          ${buyQuantityControl(book, "default")}
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

submitReview = async function submitReview(event, bookId) {
  event.preventDefault();
  if (!requireVerifiedEmailForShop()) return;
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

function cartRequiresAddress() {
  return (cart || []).some((item) => String(item?.fulfillment || "").trim() !== "download");
}

function updateCheckoutAddressRequirements() {
  const form = $("#checkoutForm");
  if (!form) return;
  const requiresAddress = cartRequiresAddress();
  ["street", "zip", "city"].forEach((name) => {
    const field = formField(form, name);
    if (!field) return;
    field.required = requiresAddress;
    field.toggleAttribute("required", requiresAddress);
    field.setAttribute("aria-required", requiresAddress ? "true" : "false");
  });
}

function buildCheckoutPayload(form) {
  const data = new FormData(form);
  const totals = discountSummary(cart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      zip: data.get("zip"),
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
      giftVoucher: Boolean(entry.discount.giftVoucher),
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
  checkoutData.siteOrigin = window.location.origin;
  const response = await fetch(backendUrl("create-checkout-session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutData)
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { error: await response.text().catch(() => "") };
  if (!response.ok) {
    throw new Error(response.status === 404
      ? "Die Netlify Stripe Function wurde nicht deployed (404). Bitte über Git oder Netlify CLI neu deployen."
      : data.error || `Stripe Checkout Fehler (${response.status}).`);
  }
  if (!data.url) throw new Error("Stripe hat keine Checkout-Adresse zurückgegeben.");
  window.location.assign(data.url);
}

checkout = async function checkout(event) {
  event.preventDefault();
  if (checkoutRequestInProgress) return;
  const form = event.currentTarget;
  updateCheckoutAddressRequirements();
  checkoutRequestInProgress = true;
  setCheckoutStatus("Stripe Checkout wird erstellt ...", "loading", form);
  syncCheckoutConsentButton();
  try {
    if (!requireVerifiedEmailForShop()) throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
    cleanUnavailableCartItems();
    if (!availableCartItems(cart).length) throw new Error("Der Warenkorb ist leer.");
    const legalConsent = formField(form, "legalConsent");
    if (!legalConsent?.checked) {
      legalConsent?.reportValidity();
      throw new Error("Bitte stimme den AGB zu und bestätige die Datenschutzerklärung.");
    }
    const discountCode = formField(form, "discountCode")?.value || "";
    const voucherCode = formField(form, "voucherCode")?.value || "";
    if (discountCode.trim() && !checkedCodeMatches("discount", discountCode)) {
      throw new Error("Bitte prüfe den Rabattcode zuerst.");
    }
    if (voucherCode.trim() && !checkedCodeMatches("voucher", voucherCode)) {
      throw new Error("Bitte prüfe den Gutscheincode zuerst.");
    }
    const checkoutData = buildCheckoutPayload(form);

    // Save address entered at checkout to currentUser profile in Firestore
    if (currentUser && (checkoutData.customer?.street || checkoutData.customer?.zip || checkoutData.customer?.city)) {
      const uStreet = String(checkoutData.customer?.street || "").trim();
      const uZip = String(checkoutData.customer?.zip || "").trim();
      const uCity = String(checkoutData.customer?.city || "").trim();
      if (uStreet || uZip || uCity) {
        db.collection("users").doc(currentUser.uid).set({
          street: uStreet,
          zip: uZip,
          city: uCity,
          address: { street: uStreet, zip: uZip, city: uCity },
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch((err) => console.warn("Konnte Adresse nicht im Profil speichern:", err));

        currentProfile = {
          ...(currentProfile || {}),
          street: uStreet,
          zip: uZip,
          city: uCity,
          address: { street: uStreet, zip: uZip, city: uCity }
        };
        window.currentProfile = currentProfile;
      }
    }
    checkoutData.legalAcceptance = {
      agbAccepted: true,
      privacyAcknowledged: true,
      acceptedAt: new Date().toISOString(),
      agbVersion: "2026-06-19",
      privacyVersion: "2026-06-19"
    };
    writeCheckoutData(checkoutData);
    await startStripeCheckout(checkoutData);
  } catch (error) {
    console.error(error);
    const message = error?.message || "Stripe Checkout konnte nicht gestartet werden.";
    setCheckoutStatus(message, "error", form);
    showToast(message);
    checkoutRequestInProgress = false;
    syncCheckoutConsentButton();
    return;
  }
};

function orderAddressEditorMarkup(order) {
  const c = order.customer || {};
  const s = order.shippingAddress || {};
  const name = c.name || "";
  const street = c.street || s.street || s.address || "";
  const zip = c.zip || c.postal_code || c.plz || s.zip || s.postal_code || s.plz || "";
  const city = c.city || c.town || c.ort || s.city || s.town || s.ort || "";

  return `
    <details class="admin-address-editor" style="margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.03); border: 1px dashed rgba(79,137,85,0.4); border-radius: 8px;">
      <summary style="cursor: pointer; font-weight: bold; color: var(--leaf, #4f8955);">✏️ Kundenadresse bearbeiten / PLZ korrigieren</summary>
      <div style="display: grid; gap: 8px; margin-top: 10px;" data-order-address-form="${order.id}">
        <label style="font-size: 0.85em; font-weight: bold;">
          Kundenname:
          <input type="text" name="customerName" value="${escapeHtml(name)}" placeholder="Max Mustermann" style="width: 100%; padding: 6px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px;">
        </label>
        <label style="font-size: 0.85em; font-weight: bold;">
          Straße & Hausnummer:
          <input type="text" name="customerStreet" value="${escapeHtml(street)}" placeholder="Musterstraße 12" style="width: 100%; padding: 6px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px;">
        </label>
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px;">
          <label style="font-size: 0.85em; font-weight: bold;">
            PLZ:
            <input type="text" name="customerZip" value="${escapeHtml(zip)}" placeholder="12345" style="width: 100%; padding: 6px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px;">
          </label>
          <label style="font-size: 0.85em; font-weight: bold;">
            Ort:
            <input type="text" name="customerCity" value="${escapeHtml(city)}" placeholder="Musterstadt" style="width: 100%; padding: 6px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px;">
          </label>
        </div>
        <button type="button" data-save-order-address="${order.id}" style="padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 6px;">
          💾 Adresse speichern & synchronisieren
        </button>
      </div>
    </details>
  `;
}

async function saveOrderCustomerAddress(orderId, button) {
  if (!orderId || !isAdmin()) return;
  const container = document.querySelector(`[data-order-address-form="${orderId}"]`);
  if (!container) return;

  const nameInput = container.querySelector('input[name="customerName"]');
  const streetInput = container.querySelector('input[name="customerStreet"]');
  const zipInput = container.querySelector('input[name="customerZip"]');
  const cityInput = container.querySelector('input[name="customerCity"]');

  const name = String(nameInput?.value || "").trim();
  const street = String(streetInput?.value || "").trim();
  const zip = String(zipInput?.value || "").trim();
  const city = String(cityInput?.value || "").trim();

  if (!name && !street && !zip && !city) {
    return showToast("Bitte mindestens ein Adressfeld ausfüllen.");
  }

  const originalText = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Wird gespeichert...";
  }

  try {
    const updateData = {
      "customer.name": name,
      "customer.street": street,
      "customer.zip": zip,
      "customer.city": city,
      "shippingAddress.street": street,
      "shippingAddress.zip": zip,
      "shippingAddress.city": city,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("orders").doc(orderId).update(updateData);

    const orderObj = orders.find((o) => o.id === orderId);
    if (orderObj) {
      if (!orderObj.customer) orderObj.customer = {};
      orderObj.customer.name = name;
      orderObj.customer.street = street;
      orderObj.customer.zip = zip;
      orderObj.customer.city = city;

      if (!orderObj.shippingAddress) orderObj.shippingAddress = {};
      orderObj.shippingAddress.street = street;
      orderObj.shippingAddress.zip = zip;
      orderObj.shippingAddress.city = city;
    }

    showToast("Adresse erfolgreich gespeichert & synchronisiert!");
    if (typeof renderAdminBooks === "function") renderAdminBooks();
  } catch (error) {
    console.error("Fehler beim Speichern der Kundenadresse:", error);
    showToast("Fehler beim Speichern: " + (error?.message || "Unbekannter Fehler"));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (target.dataset.saveOrderAddress) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await saveOrderCustomerAddress(target.dataset.saveOrderAddress, target);
    return;
  }
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
  const pushToggle = $("#pushToggle");
  if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin());
  if (subscribeButton) subscribeButton.textContent = newsletterSubscribed() ? "Newsletter deabonnieren" : "Newsletter abonnieren";
  if (pushToggle) pushToggle.checked = readJsonStorage(NEWSLETTER_KEY, {}).push === true;
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

async function saveShippingMethods(shippingMethods) {
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  await db.collection("settings").doc("payment").set({ shippingMethods }, { merge: true });
}

function normalizeSendcloudMethodPayload(payload = {}) {
  const rawShipping = Array.isArray(payload.shipping)
    ? payload.shipping
    : Array.isArray(payload.methods)
      ? payload.methods
      : Array.isArray(payload.data?.shipping)
        ? payload.data.shipping
        : Array.isArray(payload.data?.methods)
          ? payload.data.methods
          : [];

  const rawReturns = Array.isArray(payload.returns)
    ? payload.returns
    : Array.isArray(payload.returnMethods)
      ? payload.returnMethods
      : Array.isArray(payload.return_methods)
        ? payload.return_methods
        : Array.isArray(payload.data?.returns)
          ? payload.data.returns
          : Array.isArray(payload.data?.returnMethods)
            ? payload.data.returnMethods
            : Array.isArray(payload.data?.return_methods)
              ? payload.data.return_methods
              : [];

  const normalizeMethod = (entry) => {
    if (!entry || typeof entry !== "object") return null;
    return {
      id: entry.id ?? entry.method_id ?? entry.methodId ?? entry.code ?? "",
      name: entry.name ?? entry.label ?? entry.title ?? "Unbenannt",
      carrier: entry.carrier ?? entry.provider ?? entry.company ?? "Sendcloud"
    };
  };

  return {
    shipping: rawShipping.map(normalizeMethod).filter(Boolean),
    returns: rawReturns.map(normalizeMethod).filter(Boolean)
  };
}

async function fetchSendcloudMethods() {
    const list = $("#scMethodsList");
    const items = $("#scMethodsItems");
    if (!list || !items) return;

    try {
        showToast("Lade Sendcloud Tarife...");
        const res = await postToBackend("get-sendcloud-methods", {});
        if (!res.ok) throw new Error(res.error || "Sendcloud-Methoden konnten nicht geladen werden.");

        const normalized = normalizeSendcloudMethodPayload(res);
        list.classList.remove("hidden");
        items.innerHTML = normalized.shipping.length
          ? normalized.shipping.map(m => `
              <li style="padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                  <strong>${escapeHtml(m.id)}</strong>: ${escapeHtml(m.name)} (${escapeHtml(m.carrier)})
              </li>
            `).join("")
          : "<li>Keine normalen Versand-Methoden gefunden.</li>";

        if (normalized.returns.length) {
          items.insertAdjacentHTML("beforeend", `
            <li style="padding: 8px 0 0; margin-top: 8px; border-top: 1px solid rgba(0,0,0,0.08); color: var(--muted, #555);">
              <strong>Retoure-IDs:</strong>
              ${normalized.returns.map((m) => `${escapeHtml(m.id)} (${escapeHtml(m.name)})`).join(", ")}
            </li>
          `);
        } else {
          items.insertAdjacentHTML("beforeend", `
            <li style="padding: 8px 0 0; margin-top: 8px; border-top: 1px solid rgba(0,0,0,0.08); color: var(--muted, #555);">
              Keine Retoure-Methoden für diesen Account/Carrier gefunden. Sendcloud liefert diese oft separat oder nur für bestimmte Carrier.
            </li>
          `);
        }

    } catch (error) {
        showToast("Fehler beim Laden: " + error.message);
    }
}

function ensureShippingAdminSection() {
  const feeList = $("#adminFeeList");
  if (!feeList?.parentElement) return;

  if (!$("#shippingMethodForm")) {
    const section = document.createElement("section");
    section.className = "shipping-admin-section";
    section.innerHTML = `
      <h2>Lieferung / Versandarten</h2>
      <p class="muted">Lege fest, welche Lieferdienste Kunden im Checkout auswählen können.</p>
      <div class="admin-actions" style="margin-bottom: 20px;">
          <label class="checkbox-line">
              <input id="manualShippingMode" type="checkbox">
              <span>Manueller Versand-Modus (Etiketten einzeln erstellen)</span>
          </label>
          <button id="fetchSendcloudMethods" type="button">Sendcloud Tarife/IDs abrufen</button>
      </div>
      <div id="scMethodsList" class="panel hidden" style="margin-bottom: 20px; font-size: 14px; max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.03);">
          <strong>Verfügbare Sendcloud-IDs:</strong>
          <ul id="scMethodsItems" style="list-style: none; padding: 10px 0; margin: 0;"></ul>
      </div>
      <form id="shippingMethodForm" class="stacked-form">
        <input type="hidden" name="id">
        <input name="name" placeholder="Lieferdienst Name (z.B. DHL, Hermes)" required>
        <div class="form-two">
            <input name="price" type="number" min="0" step="0.01" placeholder="Preis in EUR" required>
            <input name="sendcloudMethodId" placeholder="Sendcloud Method ID (optional)">
        </div>
        <div class="form-two">
          <input name="minItems" type="number" min="0" placeholder="Min. Artikel (optional)">
          <input name="maxItems" type="number" min="0" placeholder="Max. Artikel (optional)">
        </div>
        <textarea name="description" placeholder="Hinweis für Kunden (z.B. Lieferzeit)"></textarea>
        <button type="submit">Versandart speichern</button>
        <button id="cancelShippingMethodEdit" type="button" class="secondary-button hidden">Abbrechen</button>
      </form>
      <div id="adminShippingMethodList" class="admin-list"></div>
    `;
    feeList.insertAdjacentElement("afterend", section);
    $("#shippingMethodForm")?.addEventListener("submit", submitShippingMethod);
    $("#fetchSendcloudMethods")?.addEventListener("click", fetchSendcloudMethods);
    $("#manualShippingMode")?.addEventListener("change", async (e) => {
        if (!db || !isAdmin()) return;
        await db.collection("settings").doc("payment").set({ manualShippingMode: e.target.checked }, { merge: true });
        showToast("Versand-Modus aktualisiert.");
    });

    db.collection("settings").doc("payment").get().then(doc => {
        const mode = $("#manualShippingMode");
        if (mode && doc.exists) mode.checked = doc.data().manualShippingMode === true;
    });

    $("#cancelShippingMethodEdit")?.addEventListener("click", () => {
      const form = $("#shippingMethodForm");
      if (!form) return;
      form.reset();
      formField(form, "id").value = "";
      $("#cancelShippingMethodEdit")?.classList.add("hidden");
    });
  }
}

function renderAdminShippingMethods() {
  const isMainAdminPage = window.location.pathname.includes("admin.html");
  if (!isMainAdminPage) return;

  ensureShippingAdminSection();
  const list = $("#adminShippingMethodList");
  if (!list) return;

  const methods = normalizedShippingMethods();
  if (!isAdmin()) {
    list.innerHTML = "";
    return;
  }

  if (methods.length === 0) {
    list.innerHTML = "";
    list.classList.add("hidden");
    return;
  }

  list.classList.remove("hidden");
  list.innerHTML = methods.map((method) => `
    <div class="admin-item">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <strong>${escapeHtml(method.name)}</strong> [${method.type === 'return' ? 'RETOURE' : 'Versand'}]
          <p>${Number(method.price || 0).toFixed(2)} EUR${method.disabled ? " | deaktiviert" : ""}</p>
          ${(method.minItems || method.maxItems) ? `<p class="muted">Limit: ${method.minItems || 0} bis ${method.maxItems || '∞'} Artikel</p>` : ""}
          ${method.sendcloudMethodId ? `<p class="muted"><b>Sendcloud ID:</b> ${escapeHtml(method.sendcloudMethodId)}</p>` : ""}
        </div>
      </div>
      ${method.description ? `<p class="muted">${escapeHtml(method.description)}</p>` : ""}
      <div class="admin-actions">
        <button type="button" data-shipping-edit="${escapeHtml(method.id)}">Bearbeiten</button>
        <button type="button" data-shipping-toggle="${escapeHtml(method.id)}">${method.disabled ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-shipping-delete="${escapeHtml(method.id)}">Löschen</button>
      </div>
    </div>
  `).join("");
}

async function submitShippingMethod(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können Versandarten speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("id") || newId();
  const methods = normalizedShippingMethods();
  const nextMethod = {
    id,
    name: String(data.get("name") || "").trim(),
    type: "shipping",
    price: Number(data.get("price") || 0),
    minItems: data.get("minItems") ? Number(data.get("minItems")) : null,
    maxItems: data.get("maxItems") ? Number(data.get("maxItems")) : null,
    sendcloudMethodId: String(data.get("sendcloudMethodId") || "").trim(),
    description: String(data.get("description") || "").trim(),
    disabled: false
  };
  if (!nextMethod.name) return showToast("Bitte gib einen Namen ein.");
  if (nextMethod.price < 0) return showToast("Der Preis darf nicht negativ sein.");
  const index = methods.findIndex((method) => method.id === id);
  if (index >= 0) {
    nextMethod.disabled = methods[index].disabled;
    nextMethod.deliveryTab = methods[index].deliveryTab;
    methods[index] = nextMethod;
  } else {
    methods.push(nextMethod);
  }
  await saveShippingMethods(methods);
  form.reset();
  formField(form, "id").value = "";
  $("#cancelShippingMethodEdit")?.classList.add("hidden");
  renderAdminShippingMethods();
  renderCart();
  showToast("Versandart gespeichert.");
}

function editShippingMethod(id) {
  const form = $("#shippingMethodForm");
  const method = normalizedShippingMethods().find((entry) => entry.id === id);
  if (!form || !method) return;
  formField(form, "id").value = method.id;
  formField(form, "name").value = method.name || "";
  formField(form, "price").value = method.price || 0;
  formField(form, "minItems").value = method.minItems || "";
  formField(form, "maxItems").value = method.maxItems || "";

  // Robustly set sendcloudMethodId using querySelector
  const scField = form.querySelector('[name="sendcloudMethodId"]');
  if (scField) scField.value = method.sendcloudMethodId || "";

  formField(form, "description").value = method.description || "";
  $("#cancelShippingMethodEdit")?.classList.remove("hidden");
  window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
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

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !isAdmin()) return;
  if (!target.dataset.shippingEdit && !target.dataset.shippingToggle && !target.dataset.shippingDelete) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const methods = normalizedShippingMethods();

  if (target.dataset.shippingEdit) {
    editShippingMethod(target.dataset.shippingEdit);
    return;
  }

  if (target.dataset.shippingToggle) {
    const method = methods.find((entry) => entry.id === target.dataset.shippingToggle);
    if (!method) return;
    method.disabled = !method.disabled;
    await saveShippingMethods(methods);
    renderAdminShippingMethods();
    renderCart();
    showToast(method.disabled ? "Lieferdienst deaktiviert." : "Lieferdienst aktiviert.");
  }

  if (target.dataset.shippingDelete) {
    if (!confirm("Diesen Lieferdienst wirklich löschen?")) return;
    await saveShippingMethods(methods.filter((method) => method.id !== target.dataset.shippingDelete));
    renderAdminShippingMethods();
    renderCart();
    showToast("Lieferdienst gelöscht.");
  }
}, true);

document.addEventListener("change", (event) => {
  const select = event.target.closest('select[name="shippingCarrier"]');
  if (select) {
    const form = select.closest(".order-shipping-form");
    if (form) {
      const customField = form.querySelector(".shipping-carrier-custom-field");
      if (customField) customField.classList.toggle("hidden", select.value !== "Weitere");
    }
  }

  const shippingMethodSelect = event.target.closest('select[name="shippingMethodId"]');
  if (shippingMethodSelect) {
    const form = shippingMethodSelect.closest(".order-shipping-form");
    const reasonField = form?.querySelector('[name="shippingMethodReason"]');
    if (reasonField) {
      const currentId = String(shippingMethodSelect.dataset.currentShippingMethodId || "");
      const requiresReason = Boolean(shippingMethodSelect.value && String(shippingMethodSelect.value) !== currentId);
      reasonField.required = requiresReason;
      reasonField.setAttribute("aria-required", requiresReason ? "true" : "false");
      reasonField.placeholder = requiresReason ? "Pflichtangabe für Kundenhinweis" : "Wird dem Kunden angezeigt";
    }
  }
});

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
  renderAdminShippingMethods();
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
  return loadFirebaseAssetList(path);
}

function assetListConfig(path) {
  if (path === "covers") return { firestoreProject: "mediaAssets", collection: "coverAssets" };
  if (path === "products") return { firestoreProject: "mediaAssets", collection: "productAssets" };
  if (path === "previews") return { realtimeProject: "mediaAssets", path: "previewPages" };
  if (path === "pdfs") return { realtimeProject: "pdfAssets", path: "pdfAssets" };
  if (path === "newsletterImages") return { firestoreProject: "main", collection: "newsletterImages" };
  return null;
}

function assetUploadConfig(type) {
  if (type === "cover") return assetListConfig("covers");
  if (type === "product") return assetListConfig("products");
  if (type === "preview") return assetListConfig("previews");
  if (type === "pdf") return assetListConfig("pdfs");
  if (type === "newsletter") return assetListConfig("newsletterImages");
  return null;
}

function assetSourceConfigs(path) {
  const images = [
    { kind: "cover", label: "Cover", firestoreProject: "mediaAssets", collection: "coverAssets" },
    { kind: "product", label: "Produktbild", firestoreProject: "mediaAssets", collection: "productAssets" },
    { kind: "newsletter", label: "Newsletterbild", firestoreProject: "main", collection: "newsletterImages" },
    { kind: "preview", label: "Vorschauseite", realtimeProject: "mediaAssets", path: "previewPages" }
  ];
  if (["covers", "products", "newsletterImages", "previews"].includes(path)) return images;
  if (path === "pdfs") return [{ kind: "pdf", label: "PDF", realtimeProject: "pdfAssets", path: "pdfAssets" }];
  return assetListConfig(path) ? [{ kind: path, label: path, ...assetListConfig(path) }] : [];
}

function uniqueAssetsBySrc(assets) {
  const seen = new Set();
  return assets.filter((asset) => {
    if (!asset?.src || seen.has(asset.src)) return false;
    seen.add(asset.src);
    return true;
  });
}

async function loadFirebaseAssetList(path) {
  const configs = assetSourceConfigs(path);
  if (!configs.length) return [];
  const loaded = [];
  for (const config of configs) {
    loaded.push(...await loadFirebaseAssetSource(config));
  }
  return uniqueAssetsBySrc(loaded);
}

async function loadFirebaseAssetSource(config) {
  try {
    if (config.collection) {
      const store = firebaseStores[config.firestoreProject] || (config.firestoreProject === "main" ? db : null);
      if (!store) return [];
      const snapshot = await store.collection(config.collection).limit(300).get();
      return snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: data.name || data.title || doc.id,
          src: data.src || data.url || data.path || "",
          active: data.active,
          kind: config.kind || "",
          label: config.label || "",
          backend: "firestore",
          firestoreProject: config.firestoreProject,
          collection: config.collection
        };
      }).filter((asset) => asset.src && asset.active !== false);
    }
    const rtdb = firebaseRealtimeDbs[config.realtimeProject] || (config.realtimeProject === "main" ? realtimeDb : null);
    if (!rtdb) return [];
    const snapshot = await rtdb.ref(config.path).once("value");
    const value = snapshot.val();
    const list = Array.isArray(value) ? value : Object.entries(value || {}).map(([id, data]) => ({ id, ...(data || {}) }));
    return list.map((asset) => ({
      id: asset.id || asset.name || asset.src,
      name: asset.name || asset.title || asset.id || asset.src,
      src: asset.src || asset.url || asset.path || "",
      active: asset.active,
      kind: config.kind || "",
      label: config.label || "",
      backend: "realtime",
      realtimeProject: config.realtimeProject,
      path: config.path
    })).filter((asset) => asset.src);
  } catch (error) {
    console.warn("Firebase-Assets konnten nicht geladen werden.", error);
    return [];
  }
}

async function deleteFirebaseAsset(asset) {
  if (!asset || !isAdmin()) throw new Error("Nur Admins können Dateien löschen.");
  if (asset.backend === "firestore") {
    const store = firebaseStores[asset.firestoreProject] || (asset.firestoreProject === "main" ? db : null);
    if (!store || !asset.collection || !asset.id) throw new Error("Asset-Ort ist unvollständig.");
    await store.collection(asset.collection).doc(asset.id).delete();
    return;
  }
  if (asset.backend === "realtime") {
    const rtdb = firebaseRealtimeDbs[asset.realtimeProject] || (asset.realtimeProject === "main" ? realtimeDb : null);
    if (!rtdb || !asset.path || !asset.id) throw new Error("Asset-Ort ist unvollständig.");
    await rtdb.ref(asset.path).child(asset.id).remove();
    return;
  }
  throw new Error("Asset kann nicht gelöscht werden.");
}

async function uploadFirebaseAsset(type, file) {
  if (!file) throw new Error("Bitte eine Datei auswählen.");
  const config = assetUploadConfig(type);
  if (!config) throw new Error("Unbekannter Asset-Typ.");
  let src = "";
  if (type === "pdf") {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Bitte eine PDF-Datei auswählen.");
    if (file.size > 2 * 1024 * 1024) throw new Error("PDF ist zu groß. Bitte maximal 2 MB verwenden, weil die Datei in Firebase gespeichert wird.");
    src = await readFileAsDataUrl(file);
  } else {
    src = await resizeShopAssetImage(file, file.name || "Bild");
  }
  const payload = {
    name: file.name || `${type}-${Date.now()}`,
    src,
    active: true,
    createdAtMs: Date.now(),
    createdBy: currentUser?.uid || ""
  };
  if (config.collection) {
    const store = firebaseStores[config.firestoreProject] || (config.firestoreProject === "main" ? db : null);
    if (!store) {
      console.error("Firestore Store not found for project:", config.firestoreProject);
      throw new Error(`Der Firebase-Bereich für ${config.label || type} ist nicht bereit oder falsch konfiguriert.`);
    }
    const ref = await store.collection(config.collection).add({
      ...payload,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
      console.error("Firestore error during add:", err);
      if (err.message?.includes("exceeds the maximum allowed size")) {
        throw new Error("Das Bild ist zu groß für die Datenbank. Bitte verkleinere es.");
      }
      throw err;
    });
    return { id: ref.id, ...payload };
  }
  const rtdb = firebaseRealtimeDbs[config.realtimeProject] || (config.realtimeProject === "main" ? realtimeDb : null);
  if (!rtdb) throw new Error("Der Firebase-Bereich für diesen Upload ist noch nicht konfiguriert.");
  const ref = await rtdb.ref(config.path).push(payload);
  return { id: ref.key, ...payload };
}

async function handleAssetUpload(input, type, options = {}) {
  if (!isAdmin()) return showToast("Nur Admins können Dateien hochladen.");
  const files = Array.from(input.files || []);
  const nameLabel = input.closest(".profile-file-picker")?.querySelector(".profile-file-name");
  if (nameLabel) nameLabel.textContent = files.length ? files.map((file) => file.name).join(", ") : "Keine Datei ausgewählt";
  if (!files.length) return;
  try {
    const uploaded = [];
    for (const file of files.slice(0, options.maxFiles || 999)) {
      uploaded.push(await uploadFirebaseAsset(type, file));
    }
    await loadCoverOptions();
    options.afterUpload?.(uploaded);
    showToast(`${uploaded.length} Datei(en) in Firebase gespeichert.`);
  } catch (error) {
    showToast(error.message || "Upload konnte nicht gespeichert werden.");
  } finally {
    input.value = "";
    if (nameLabel) nameLabel.textContent = "Keine Datei ausgewählt";
  }
}

async function renderFirebaseHandle() {
  const list = $("#firebaseAssetList");
  if (!list) return;
  if (!isAdmin()) {
    list.innerHTML = `<p class="muted">Diese Seite ist nur für Admins.</p>`;
    return;
  }
  list.innerHTML = `<p class="muted">Firebase-Dateien werden geladen...</p>`;
  const [images, pdfs] = await Promise.all([
    Promise.all(["covers", "products", "newsletterImages", "previews"].map(loadAssetList)).then((groups) => uniqueAssetsBySrc(groups.flat())),
    loadAssetList("pdfs")
  ]);
  const assets = [...images, ...pdfs];
  list.innerHTML = assets.length ? assets.map((asset, index) => `
    <article class="admin-row asset-row">
      <div>
        <strong>${escapeHtml(asset.name || "Datei")}</strong>
        <p class="muted">${escapeHtml(asset.label || asset.kind || "Asset")} | ${escapeHtml(asset.backend || "")}</p>
      </div>
      ${String(asset.src || "").startsWith("data:image/") ? `<img class="asset-thumb" src="${escapeHtml(asset.src)}" alt="">` : `<span class="stock-pill">PDF</span>`}
      <button type="button" data-delete-firebase-asset="${index}">Löschen</button>
    </article>
  `).join("") : `<p class="muted">Noch keine Firebase-Dateien gefunden.</p>`;
  window.__firebaseHandleAssets = assets;
}

async function submitFirebaseHandleUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = formField(form, "assetType")?.value || "cover";
  const input = formField(form, "assetFile");
  if (!input?.files?.length) return showToast("Bitte eine Datei auswählen.");
  await handleAssetUpload(input, type, {
    maxFiles: type === "product" ? 10 : type === "preview" ? 2 : 1,
    afterUpload: async () => {
      await loadCoverOptions();
      await renderFirebaseHandle();
    }
  });
  form.reset();
}

loadCoverOptions = async function loadCoverOptions() {
  const [covers, pdfs, products] = await Promise.all([
    loadAssetList("covers"),
    loadAssetList("pdfs"),
    loadAssetList("products")
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
  let choices = [...coverOptions];
  if (!choices.length) choices = [{ name: "Standard-Cover", src: sampleCover }];

  if (selected && !choices.some(c => c.src === selected)) {
    choices.push({ name: "Aktuelles Bild", src: selected });
  }

  select.innerHTML = choices.map((cover) => {
    const name = cover.name || cover.title || cover.id || cover.src || "Bild";
    const label = cover.label && cover.label !== name ? ` (${cover.label})` : "";
    return `<option value="${escapeHtml(cover.src)}">${escapeHtml(name)}${escapeHtml(label)}</option>`;
  }).join("");

  if (selected) select.value = selected;
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
  let choices = [...pdfOptions];
  if (selected && !choices.some(c => c.src === selected)) {
    choices.push({ name: "Aktuelle Datei", src: selected });
  }
  select.innerHTML = choices.length
    ? choices.map((pdf) => `<option value="${escapeHtml(pdf.src)}">${escapeHtml(pdf.name || pdf.src)}</option>`).join("")
    : `<option value="">Keine PDFs in Firebase hinterlegt</option>`;
  if (selected) select.value = selected;
}

function renderProductOptions(selected = []) {
  const select = $("#productImages");
  if (!select) return;
  const selectedSet = new Set(selected);
  let choices = [...productOptions];

  selected.forEach(url => {
    if (url && !choices.some(c => c.src === url)) {
      choices.push({ name: "Aktuelles Bild", src: url });
    }
  });

  select.innerHTML = choices.length
    ? choices.map((image) => {
        const name = image.name || image.title || image.id || image.src || "Produktbild";
        const label = image.label && image.label !== name ? ` (${image.label})` : "";
        const isSelected = selectedSet.has(image.src);
        return `<option value="${escapeHtml(image.src)}" ${isSelected ? "selected" : ""}>${escapeHtml(name)}${escapeHtml(label)}</option>`;
      }).join("")
    : `<option value="">Keine Produktbilder in Firebase hinterlegt</option>`;

  // Force property state for browsers
  Array.from(select.options).forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });

  renderProductPreview();
}

function selectedProductImages() {
  const select = $("#productImages");
  if (!select) return [];
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

function renderProductPreview() {
  const preview = $("#productPreview");
  if (!preview) return;
  const images = selectedProductImages();
  preview.classList.toggle("hidden", !images.length);
  preview.innerHTML = images.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("");
}

function effectiveItemType(category, rawType) {
  if (rawType && rawType !== "undefined" && rawType !== "") return rawType;
  const cat = normalizeCategory(category);
  if (cat === "Sonstige" || cat === "Lernhelfer") return "worksheet";
  if (cat === "Alltagshelfer") return "product";
  return "book";
}

function itemTypeLabel(type) {
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
  const canQuickAdd = Number(book.stock || 0) > 0 && (!availableFulfillmentOptions(book).length || (availableFulfillmentOptions(book).length === 1 && availableFulfillmentOptions(book)[0] === 'print'));
  return `
    <article class="book-card">
      <img src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}" data-open="${book.id}" style="cursor: pointer;">
      <div class="book-body">
        <h2 class="book-title" data-open="${book.id}" style="cursor: pointer;">${escapeHtml(book.title)}</h2>
        <span class="stock-pill">${escapeHtml(category)}</span>
        <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span>
        <span class="stock-pill">${stockText(book.stock)}</span>
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${Number(book.price).toFixed(2)} EUR</span>
        <div class="card-actions">
          <button type="button" data-open="${book.id}">Details</button>
          ${canQuickAdd ? `
            <div class="quick-add-row" style="display: flex; gap: 5px; align-items: center;">
              <input type="number" min="1" max="${book.stock}" value="1" style="width: 50px; padding: 5px;" id="qty-${book.id}">
              <button type="button" class="quick-add-button" onclick="addToCart('${book.id}', document.getElementById('qty-${book.id}').value)">In den Warenkorb</button>
            </div>
          ` : ""}
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
      </div>
    </article>
  `;
};

// removed OLD submitBook_3

editBook_OLD_3 = function editBook(bookId) {
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
  formField(form, "isGift").checked = Boolean(book.isGift);
  formField(form, "giftThreshold").value = book.giftThreshold || "";
  formField(form, "giftRequirementType").value = book.giftRequirementType || "none";
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
  syncProductUrl(book);
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
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
        <div class="buy-action-row">
          ${buyQuantityControl(book, "default")}
          <button type="button" data-add="${book.id}" ${book.stock <= 0 ? "disabled" : ""}>In den Warenkorb</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
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
  $("#coverAssetUpload")?.addEventListener("change", (event) => {
    handleAssetUpload(event.currentTarget, "cover", {
      maxFiles: 1,
      afterUpload: ([asset]) => renderCoverOptions(asset?.src || "")
    });
  });
  $("#pdfAssetUpload")?.addEventListener("change", (event) => {
    handleAssetUpload(event.currentTarget, "pdf", {
      maxFiles: 1,
      afterUpload: ([asset]) => renderPdfOptions(asset?.src || "")
    });
  });
  $("#previewAssetUpload")?.addEventListener("change", (event) => {
    handleAssetUpload(event.currentTarget, "preview", {
      maxFiles: 2,
      afterUpload: (assets) => renderPreviewPageOptions(assets.map((asset) => asset.src))
    });
  });
  $("#productAssetUpload")?.addEventListener("change", (event) => {
    handleAssetUpload(event.currentTarget, "product", {
      maxFiles: 999,
      afterUpload: (assets) => renderProductOptions([...selectedProductImages(), ...assets.map((asset) => asset.src)])
    });
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
    ? previewOptions.map((page) => `<option value="${escapeHtml(page.src)}" ${selectedSet.has(page.src) ? "selected" : ""}>${escapeHtml(page.name || page.src)}${page.label ? ` (${escapeHtml(page.label)})` : ""}</option>`).join("")
    : `<option value="">Keine Vorschauseiten in Firebase hinterlegt</option>`;
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
    ? pdfOptions.map((pdf) => {
        const name = pdf.name || pdf.title || pdf.id || pdf.src || "PDF-Datei";
        const label = pdf.label && pdf.label !== name ? ` (${pdf.label})` : "";
        return `<option value="${escapeHtml(pdf.src)}">${escapeHtml(name)}${escapeHtml(label)}</option>`;
      }).join("")
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
  return `${item.bookId}:${item.fulfillment || "default"}:${item.variant || "none"}`;
}

loadCoverOptions = async function loadCoverOptions() {
  const [covers, pdfs, products, previews, newsletterImages] = await Promise.all([
    loadAssetList("covers"),
    loadAssetList("pdfs"),
    loadAssetList("products"),
    loadAssetList("previews"),
    loadAssetList("newsletterImages")
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
  $("#coverUploadWrap")?.classList.toggle("hidden", itemType === "product");
  $("#pdfChoiceWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#pdfUploadWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewUploadWrap")?.classList.toggle("hidden", !usesCoverAndPdf);
  $("#previewPagesPreview")?.classList.toggle("hidden", !usesCoverAndPdf || !selectedPreviewPages().length);
  $("#fulfillmentOptionsWrap")?.classList.toggle("hidden", itemType !== "worksheet");
  $("#productImagesWrap")?.classList.toggle("hidden", itemType !== "product");
  $("#productUploadWrap")?.classList.toggle("hidden", itemType !== "product");
  $("#productPreview")?.classList.toggle("hidden", itemType !== "product" || !selectedProductImages().length);
  $("#productVariantsSection")?.classList.toggle("hidden", itemType !== "product");
  $("#variantsSection")?.classList.remove("hidden");

  const pdfLabel = $("#pdfChoiceWrap");
  if (pdfLabel?.firstChild) {
    pdfLabel.firstChild.textContent = itemType === "book" ? "E-Book-PDF" : "PDF-Datei für Arbeitsblätter";
  }
  const stock = formField(form, "stock");
  if (stock) stock.placeholder = itemType === "worksheet" ? "Arbeitsblatt-Pakete verfügbar" : itemType === "product" ? "Produkte auf Lager" : "Bücher auf Lager";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = itemType === "product" ? "Produkt speichern" : "Buch speichern";
};

itemImage = function itemImage(book) {
  if (book.itemType === "product") return book.productImages?.[0] || book.cover || sampleCover;
  return book.cover || sampleCover;
};

// removed OLD submitBook_4

editBook_OLD_4 = function editBook(bookId) {
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
  formField(form, "isGift").checked = Boolean(book.isGift);
  formField(form, "giftThreshold").value = book.giftThreshold || "";
  formField(form, "giftRequirementType").value = book.giftRequirementType || "none";
  if (formField(form, "downloadAvailable")) formField(form, "downloadAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("download");
  if (formField(form, "printAvailable")) formField(form, "printAvailable").checked = !book.fulfillmentOptions?.length || book.fulfillmentOptions.includes("print");

  // ISBN selection pre-filling
  if (book.itemType === "book") {
    updateIsbnPickerDisplay(book);
  }

  renderCoverOptions(book.cover || "");
  renderPdfOptions(book.pdf || "");
  renderProductOptions(book.productImages || []);
  renderVariantsInForm(book.variants || []);
  renderPreviewPageOptions(book.previewPages || []);
  updateMaterialFields();
  syncGiftSettingsVisibility();
  $("#cancelEdit")?.classList.remove("hidden");
};

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  syncProductUrl(book);
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const publishedMarkup = bookPublicationMarkup(book);
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
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
        ${publishedMarkup}
        <p class="price">${Number(book.price).toFixed(2)} EUR</p>
        <p><span class="stock-pill">${escapeHtml(normalizeCategory(book.category))}</span> <span class="stock-pill">${escapeHtml(itemTypeLabel(type))}</span> <span class="stock-pill">${stockText(book.stock)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <p>${escapeHtml(book.description)}</p>
        ${type === "book" && book.pdf ? `<p class="muted">Dieses Buch ist auch als E-Book-PDF hinterlegt. Der Zugriff erfolgt nach dem Kauf.</p>` : ""}
        ${""}
        ${previews}
        ${gallery}
        <div class="buy-action-row">
          ${addActions}
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
      </div>
    </div>
  `;
  $("#reviewForm")?.addEventListener("submit", (event) => submitReview(event, book.id));
  bookModal.classList.remove("hidden");
};

addToCart = function addToCart(bookId, fulfillment = "default", quantity = 1, variant = null) {
  if (!requireVerifiedEmailForShop()) return;
  const book = books.find((entry) => entry.id === bookId);
  if (!book) return;
  if (!canPurchaseFulfillment(book, fulfillment)) {
    if (fulfillment !== "download") showToast("Gedruckt ist aktuell ausverkauft.");
    return;
  }

  const requestedQuantity = fulfillment === "download" ? 1 : Math.max(1, Math.floor(Number(quantity || 1)));
  const selectedVariant = variant ? book.variants?.find(entry => entry.name === variant) : null;
  const availableStock = selectedVariant ? Number(selectedVariant.stock || 0) : Number(book.stock || 0);
  const currentQuantity = cart
    .filter(entry => entry.bookId === bookId && (entry.variant || null) === (variant || null) && entry.fulfillment !== "download")
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);

  if (fulfillment !== "download" && currentQuantity + requestedQuantity > availableStock) {
    return showToast("Mehr sind aktuell nicht auf Lager.");
  }

  const item = cart.find((entry) =>
    entry.bookId === bookId &&
    (entry.fulfillment || "default") === fulfillment &&
    (entry.variant === variant || (!entry.variant && !variant))
  );

  if (item) {
    item.quantity = Number(item.quantity || 0) + requestedQuantity;
  } else {
    cart.push({
      bookId,
      quantity: requestedQuantity,
      fulfillment,
      variant: variant || null,
      price: variant ? (selectedVariant?.price ?? book.price) : variantPrice(book, fulfillment),
      title: variant ? (selectedVariant?.title || book.title) : book.title
    });
  }
  renderCart();
  showToast(`${requestedQuantity}x ${book.title}${variant ? ` (${variant})` : ""} im Warenkorb.`);
};
window.addToCart = addToCart;


function updateCartLine(key, delta) {
  const item = cart.find((entry) => cartKey(entry) === key);
  if (!item) return;
  const book = books.find((entry) => entry.id === item.bookId);
  if (!book) return;
  if ((item.fulfillment || "default") === "download" && delta > 0) {
    showToast("Download-Artikel kann pro Bestellung nur einmal gekauft werden.");
    return;
  }
  const otherQuantity = physicalCartQuantity(item.bookId, key);
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
  cleanUnavailableCartItems();
  const checkoutCart = availableCartItems(cart);
  const totals = discountSummary(checkoutCart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      zip: data.get("zip"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: checkoutCart.map((item) => {
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
      giftVoucher: Boolean(entry.discount.giftVoucher),
      amount: entry.amount
    })),
    discountTotal: totals.discountTotal,
    total: totals.total,
    customerKey: customerDiscountKey(),
    createdAt: Date.now()
  };
};

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
    : `<div class="shop-empty-state" role="status"><strong>Keine passenden Artikel gefunden</strong><span>Versuche einen anderen Suchbegriff oder Filter.</span></div>`;
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
        <img src="${escapeHtml(image || sampleCover)}" alt="${escapeHtml(book?.title || "Artikel")}" data-open="${escapeHtml(book?.id || "")}" style="cursor: pointer;">
        <div class="book-body">
          <h2 class="book-title" data-open="${escapeHtml(book?.id || "")}" style="cursor: pointer;">${escapeHtml(book?.title || "Artikel")}</h2>
          <span class="price">${price.toFixed(2)} EUR</span>
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
    : `<div class="shop-empty-state" role="status"><strong>Keine passenden Artikel gefunden</strong><span>Versuche einen anderen Suchbegriff oder Filter.</span></div>`;
};

createOrderFromCheckout = async function createOrderFromCheckout(checkout) {
  const orderItems = [];
  await db.runTransaction(async (transaction) => {
    const requestedByStockKey = new Map();
    for (const item of checkout.cart || []) {
      const stockKey = `${item.bookId}:${item.variant || "default"}`;
      requestedByStockKey.set(stockKey, {
        bookId: item.bookId,
        variant: item.variant || null,
        quantity: Number(requestedByStockKey.get(stockKey)?.quantity || 0) + Number(item.quantity || 0)
      });
    }
    const snapshots = new Map();
    for (const [stockKey, request] of requestedByStockKey.entries()) {
      const { bookId, variant, quantity } = request;
      const ref = db.collection("books").doc(bookId);
      const snap = await transaction.get(ref);
      const book = snap.exists ? { id: snap.id, ...snap.data() } : null;
      if (!book) throw new Error("notfound");

      const variants = Array.isArray(book.variants) ? book.variants : [];
      const selectedVariant = variant ? variants.find(entry => entry.name === variant) : null;

      // Determine effective stock
      let stock = Number(book.stock || 0);
      if (selectedVariant) {
        stock = selectedVariant.stock === "-" && variants.length > 0
          ? Number(variants[0].stock || 0)
          : Number(selectedVariant.stock || 0);
      }

      if (quantity > stock) throw new Error("stock");
      snapshots.set(stockKey, { ref, book, variant, selectedVariant, requested: quantity });
    }
    for (const entry of snapshots.values()) {
      if (entry.selectedVariant) {
        const variants = (entry.book.variants || []).map((variant, index) => {
          const isTarget = variant.name === entry.variant;
          const isSharedPool = entry.selectedVariant.stock === "-" && index === 0;

          if (isTarget && variant.stock !== "-") {
            return { ...variant, stock: Number(variant.stock || 0) - entry.requested };
          }
          if (isSharedPool) {
            return { ...variant, stock: Number(variant.stock || 0) - entry.requested };
          }
          return variant;
        });
        const mainStock = (variants.length > 0) ? Number(variants[0].stock || 0) : entry.book.stock;
        transaction.update(entry.ref, { variants, stock: mainStock });
      } else {
        const stock = Number(entry.book.stock || 0) - entry.requested;
        const sold = Number(entry.book.sold || 0) + entry.requested;
        transaction.update(entry.ref, { stock, sold });
        maybeNotifyLowStock({ ...entry.book, stock });
      }
    }
    for (const item of checkout.cart || []) {
      const entry = snapshots.get(`${item.bookId}:${item.variant || "default"}`);
      const itemVariant = entry.selectedVariant;
      orderItems.push({
        bookId: entry.book.id,
        title: itemVariant?.title || entry.book.title,
        quantity: item.quantity,
        price: itemVariant?.price ?? entry.book.price,
        variant: item.variant || null,
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
  cleanUnavailableCartItems();
  const checkoutCart = availableCartItems(cart);
  const totals = discountSummary(checkoutCart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: checkoutCart.map((item) => {
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
  const shopAmount = shopDiscountAmount(items);

  const discountDetails = [];
  if (shopAmount > 0) {
    discountDetails.push({
      discount: {
        id: "shop-discount",
        code: "Shop-Rabatt",
        kind: "shop",
        valueType: discount.valueType,
        value: discount.value
      },
      amount: shopAmount
    });
  }

  if (appliedDiscounts.promo) {
      const promo = appliedDiscounts.promo;
      let amount = 0;
      if (promo.valueType === "percent") amount = (itemTotal - shopAmount) * (promo.value / 100);
      else amount = Math.min(itemTotal - shopAmount, promo.value);

      if (amount > 0) {
          discountDetails.push({
              discount: { id: promo.id, code: promo.code, kind: "promo", valueType: promo.valueType, value: promo.value },
              amount
          });
      }
  }

  const totalDiscount = discountDetails.reduce((sum, d) => sum + d.amount, 0);

  return {
    itemTotal,
    feeTotal,
    discountTotal: totalDiscount,
    total: Math.max(0, itemTotal + feeTotal - totalDiscount),
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
          <strong>${escapeHtml(entry.discount.kind === "voucher" ? `Gutschein ${entry.discount.code}` : "Shop-Rabatt")}</strong>
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
  cleanUnavailableCartItems();
  const checkoutCart = availableCartItems(cart);
  const totals = discountSummary(checkoutCart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: checkoutCart.map((item) => {
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
      giftVoucher: Boolean(entry.discount.giftVoucher),
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
  const bookPriceLockMonths = Number(discount.bookPriceLockMonths || 0);
  return {
    enabled: Boolean(discount.enabled),
    valueType: discount.valueType === "fixed" ? "fixed" : "percent",
    value: Number.isFinite(value) ? value : 0,
    appliesTo,
    bookPriceLockMonths
  };
}

function shopDiscountAmount(items = cart) {
  const discount = currentShopDiscount();
  if (!discount.enabled || discount.value <= 0) return 0;

  const eligibleTotal = items.reduce((sum, item) => {
    if (Number(item.price) <= 0) return sum; // Skip gifts
    const book = books.find(b => b.id === item.bookId);
    if (book && !isBookOldEnoughForShopDiscount(book)) return sum;
    return sum + (Number(item.price) * Number(item.quantity || 1));
  }, 0);

  if (eligibleTotal <= 0) return 0;
  if (discount.valueType === "percent") return eligibleTotal * (discount.value / 100);
  return Math.min(eligibleTotal, discount.value);
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
  const shopAmount = shopDiscountAmount(items);

  const discountDetails = [];
  if (shopAmount > 0) {
    discountDetails.push({
      discount: {
        id: "shop-discount",
        code: "Shop-Rabatt",
        kind: "shop",
        valueType: discount.valueType,
        value: discount.value
      },
      amount: shopAmount
    });
  }

  if (appliedDiscounts.promo) {
      const promo = appliedDiscounts.promo;
      let amount = 0;
      if (promo.valueType === "percent") amount = (itemTotal - shopAmount) * (promo.value / 100);
      else amount = Math.min(itemTotal - shopAmount, promo.value);

      if (amount > 0) {
          discountDetails.push({
              discount: { id: promo.id, code: promo.code, kind: "promo", valueType: promo.valueType, value: promo.value },
              amount
          });
      }
  }

  const totalDiscount = discountDetails.reduce((sum, d) => sum + d.amount, 0);

  return {
    itemTotal,
    feeTotal,
    discountTotal: totalDiscount,
    total: Math.max(0, itemTotal + feeTotal - totalDiscount),
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
      <label>
        Preisbindung für Bücher (Monate)
        <input name="bookPriceLockMonths" type="number" min="0" step="1" placeholder="z.B. 18" required>
      </label>
      <button type="submit">Shop-Rabatt speichern</button>
    `;
    const hint = form.querySelector(".muted");
    if (hint) hint.textContent = "Dieser Rabatt gilt automatisch im Shop. Du kannst auswählen, ob Artikel, Zusatzkosten oder beides reduziert werden.";
  }

  const discount = currentShopDiscount();
  if (form) {
    formField(form, "enabled").checked = discount.enabled;
    formField(form, "valueType").value = discount.valueType;
    formField(form, "appliesTo").value = discount.appliesTo;
    formField(form, "value").value = discount.value || "";
    formField(form, "bookPriceLockMonths").value = discount.bookPriceLockMonths || 0;
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
      <p class="muted">${discount.appliesTo === "fees" ? "Gilt nur für Zusatzkosten." : discount.appliesTo === "both" ? "Gilt für Artikelpreise und Zusatzkosten." : "Gilt nur für normale Artikelpreise."}</p>
      ${discount.bookPriceLockMonths > 0 ? `<p class="muted">Preisbindung für Bücher: ${discount.bookPriceLockMonths} Monate nach Veröffentlichung.</p>` : ""}
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
    value: Number(data.get("value") || 0),
    bookPriceLockMonths: Math.max(0, Number(data.get("bookPriceLockMonths") || 0))
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
  if (!list) return;
  if (!isAdmin()) {
    list.innerHTML = "";
    if (orderList) orderList.innerHTML = "";
    if (orderSummary) orderSummary.innerHTML = "";
    renderAdminStats();
    return;
  }

  // ORDERS SUMMARY & FILTERING
  const openCount = orders.filter((o) => !o.archived).length;
  const archivedCount = orders.filter((o) => o.archived).length;

  if (orderSummary) {
    orderSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>${openCount}</strong><span>Offen</span></div>
        <div><strong>${archivedCount}</strong><span>Archiv</span></div>
        <div><strong>${orders.length}</strong><span>Gesamt</span></div>
      </div>
    `;
  }

  // Show all when toggle is on, or only active when off
  const visibleOrders = showArchivedOrders ? orders : orders.filter((o) => !o.archived);

  // BOOKS LIST
  const now = Date.now();
  list.innerHTML = books.map((book) => {
    const release = Number(book.releaseDateMs || 0);
    const isFuture = release > now;
    const releaseText = isFuture ? `<span class="release-badge">Veröffentlichung am ${new Date(release).toLocaleDateString("de-DE")}</span>` : "";
    return `
    <div class="admin-item ${book.disabled || book.hidden ? "is-hidden-post" : ""} ${isFuture ? "is-future-release" : ""}">
      ${releaseText}
      <strong>${escapeHtml(book.title)}</strong>
      <p>${book.itemType === 'book' || !book.itemType ? `<b>ISBN:</b> ${escapeHtml(book.isbn || "-")} | ` : ""}<b>Preis:</b> ${Number(book.price || 0).toFixed(2)} €</p>
      <p>Lager: ${book.stock || 0} | Verkauft: ${book.sold || 0} | Status: ${book.disabled || book.hidden ? "Inaktiv" : "Aktiv"}</p>
      <div class="admin-actions">
        <button type="button" data-edit="${book.id}">Bearbeiten</button>
        <button type="button" data-book-toggle="${book.id}">${book.disabled || book.hidden ? "Aktivieren" : "Deaktivieren"}</button>
        <button type="button" data-delete="${book.id}">Löschen</button>
        <button type="button" title="Produkt-Link kopieren" onclick="copyProductLink('${book.id}')" style="background: rgba(63, 111, 69, 0.1); border-color: rgba(63, 111, 69, 0.2); color: #3f6f45; font-size: 1.2em; padding: 5px 10px;">🔗</button>
      </div>
    </div>
  `;
  }).join("");

  // ORDERS LIST
  if (orderList) {
    const printOrders = visibleOrders.filter((order) => !isDownloadOnlyOrder(order));
    const downloadOrders = visibleOrders.filter(isDownloadOnlyOrder);

    orderList.innerHTML = visibleOrders.length ? `
      ${renderAdminOrderGroup("Normale Bestellungen (Versand)", printOrders, "Keine offenen Versand-Bestellungen.")}
      ${renderAdminOrderGroup("Nur Download-Bestellungen", downloadOrders, "Keine reinen Download-Bestellungen.", true)}
    ` : `<p class="muted">Keine ${showArchivedOrders ? "" : "offenen"} Bestellungen gefunden.</p>`;
  }

  renderAdminStats();
};

function copyProductLink(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;
  const slug = slugifyBookTitle(book.slug || book.title || book.id);
  const url = `${window.location.origin}/#${slug}`;

  navigator.clipboard.writeText(url).then(() => {
    showToast("Link in Zwischenablage kopiert! 🔗");
  }).catch(err => {
    console.error("Copy failed:", err);
    showToast("Link konnte nicht kopiert werden.");
  });
}

function downloadableOrderItems(items = []) {
  return items.filter((item) => item.fulfillment === "download" && item.pdf);
}

async function markDownloadAsUsed(bookId, downloadSessionId) {
  if (!db) throw new Error("Firebase ist noch nicht bereit.");
  if (!bookId || !downloadSessionId) throw new Error("Download-Session fehlt.");
  const checkoutData = readCheckoutData(null);
  const sessionId = checkoutData?.stripeSessionId || new URLSearchParams(window.location.search).get("session_id") || "";
  if (!sessionId) throw new Error("Keine Zahlungs-Session gefunden.");
  const snapshot = await db.collection("orders").where("stripeSessionId", "==", sessionId).limit(1).get();
  if (snapshot.empty) throw new Error("Bestellung wurde nicht gefunden.");
  const doc = snapshot.docs[0];
  const order = doc.data();
  const now = new Date().toISOString();
  const nowMs = Date.now();
  let pdf = "";
  let matched = false;
  const items = (order.items || []).map((item) => {
    if (item.fulfillment === "download" && item.bookId === bookId && item.downloadSession?.id === downloadSessionId) {
      matched = true;
      if (item.downloaded) throw new Error("Dieser Download-Link wurde bereits verwendet.");
      if (Number(item.downloadSession?.expiresAtMs || 0) <= nowMs) throw new Error("Dieser Download-Link ist abgelaufen.");
      pdf = item.pdf || "";
      return {
        ...item,
        downloaded: true,
        downloadedAt: now,
        downloadSession: {
          ...item.downloadSession,
          usedAtMs: nowMs
        }
      };
    }
    return item;
  });
  if (!matched) throw new Error("Download-Session ist ungültig.");
  if (!pdf) throw new Error("PDF-Datei wurde nicht gefunden.");
  await doc.ref.update({
    items,
    downloadUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return pdf;
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
          ${downloadSessionStatus(item) === "active"
            ? `<a class="secondary-link" href="#" data-download-book="${escapeHtml(item.bookId)}" data-download-session="${escapeHtml(item.downloadSession?.id || "")}">PDF herunterladen</a>`
            : `<span class="download-status ${item.downloaded ? "downloaded" : "pending"}">${downloadSessionStatusText(item)}</span>`}
        </div>
      `).join("")}
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-download-book]");
  if (!link) return;
  event.preventDefault();
  let href = "";
  try {
    href = await markDownloadAsUsed(link.dataset.downloadBook, link.dataset.downloadSession);
  } catch (error) {
    showToast(error.message || "Download-Link konnte nicht geöffnet werden.");
    console.warn("Downloadstatus konnte nicht gespeichert werden.", error);
    return;
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

async function verifyStripeCheckoutSession(sessionId, expectedTotal) {
  const response = await fetch(`${backendUrl("verify-checkout-session")}?session_id=${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error("stripe-session-unverified");
  const data = await response.json();
  const expectedCents = Math.max(0, Math.round(Number(expectedTotal || 0) * 100));
  const amountCents = Number(data?.amount_total || 0);
  const metadataCents = Number(data?.checkout_total_cents || 0);
  const amountMatches = Math.abs(amountCents - expectedCents) <= 1;
  const metadataMatches = metadataCents > 0 && Math.abs(metadataCents - expectedCents) <= 1;
  const paid = data?.paid === true
    && data?.currency === "eur"
    && (amountMatches || metadataMatches);
  return paid ? data : null;
}

async function savePaidOrderFromCheckout(checkoutData, sessionId) {
  try {
    const response = await fetch(backendUrl("save-paid-order"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout: checkoutData, sessionId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Bestellung konnte nicht serverseitig gespeichert werden.");
    return data;
  } catch (error) {
    console.warn("Serverseitiges Speichern fehlgeschlagen, Browser-Fallback wird versucht.", error);
    const orderItems = await createOrderFromCheckout(checkoutData);
    return { items: orderItems };
  }
}

let stripeReturnInProgress = false;

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
  if (!authReady) {
    status.textContent = "Anmeldung wird geprüft ...";
    window.setTimeout(completeStripeCheckoutReturn, 150);
    return;
  }
  if (stripeReturnInProgress) return;
  stripeReturnInProgress = true;
  try {
    const existingOrder = await db.collection("orders").where("stripeSessionId", "==", sessionId).limit(1).get();
    if (!existingOrder.empty) {
      const order = existingOrder.docs[0].data();
      clearCheckoutData();
      localStorage.removeItem(CART_STORAGE_KEY);
      cart = [];
      status.textContent = "Danke. Diese Bestellung wurde bereits gespeichert.";
      renderDownloadLinks(order.items || []);
      stripeReturnInProgress = false;
      return;
    }
  } catch (error) {
    console.warn("Vorhandene Bestellung konnte nicht geprüft werden.", error);
  }
  const checkoutData = readCheckoutData(null);
  if (!checkoutData?.cart?.length) {
    status.textContent = "Keine gespeicherten Checkout-Daten gefunden.";
    renderDownloadLinks([]);
    stripeReturnInProgress = false;
    return;
  }
  status.textContent = "Zahlung wird bei Stripe geprüft...";
  try {
    const sessionData = await verifyStripeCheckoutSession(sessionId, checkoutData.total);
    if (!sessionData) {
      status.textContent = "Die Zahlung wurde noch nicht als erfolgreich bestätigt.";
      renderDownloadLinks([]);
      return;
    }
    status.textContent = "Bestellung wird gespeichert...";
    checkoutData.stripeSessionId = sessionId;
    checkoutData.orderNumber = checkoutData.orderNumber || generateOrderNumber();
    if (sessionData.stripeInvoiceUrl) checkoutData.stripeInvoiceUrl = sessionData.stripeInvoiceUrl;

    const result = await savePaidOrderFromCheckout(checkoutData, sessionId);
    const orderItems = result.items || [];
    if (result.stripeInvoiceUrl) checkoutData.stripeInvoiceUrl = result.stripeInvoiceUrl;

    try {
      await sendPurchaseConfirmationMail(checkoutData);
    } catch (mailError) {
      console.warn("Bestellung wurde gespeichert, aber die Bestätigungsmail konnte nicht gesendet werden.", mailError);
    }
    clearCheckoutData();
    localStorage.removeItem(CART_STORAGE_KEY);
    cart = [];
    status.textContent = "Danke. Deine Bestellung wurde gespeichert. Eine Bestätigungsmail ist unterwegs (bitte auch im Spam-Ordner nachsehen).";
    if (checkoutData.stripeInvoiceUrl) {
      status.innerHTML += `<br><br><a href="${escapeHtml(checkoutData.stripeInvoiceUrl)}" target="_blank" rel="noopener" class="secondary-link" style="text-decoration: underline;">Rechnung jetzt ansehen</a>`;
    }
    renderDownloadLinks(orderItems);
  } catch (error) {
    console.error(error);
    status.textContent = "Zahlung war erfolgreich, aber die Bestellung konnte nicht gespeichert werden. Bitte kontaktiere den Support.";
    renderDownloadLinks([]);
  } finally {
    stripeReturnInProgress = false;
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

function userCanResetPassword(user = {}) {
  const providers = Array.isArray(user.authProviders)
    ? user.authProviders.map((provider) => String(provider || "").toLowerCase())
    : [];
  const primary = String(user.primaryAuthProvider || "").toLowerCase();
  const googleOnly = providers.includes("google.com") || primary === "google.com";
  const hasPassword = providers.includes("password") || primary === "password";
  return Boolean(user.email && !user.guestOnly && !user.anonymous && (!googleOnly || hasPassword));
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
  if (!userCanResetPassword(user)) return showToast("Für Google-angemeldete Konten kann kein Passwort-Reset ausgelöst werden.");
  try {
    await requestCustomAuthEmail("passwordReset", {
      email: user.email,
      name: user.name || user.email,
      uid: user.id
    });
    showToast("Passwort-Reset-Mail wurde gesendet (bitte auch im Spam-Ordner nachsehen).");
  } catch (error) {
    showToast(readableErrorText(error) || authErrorMessage(error));
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

async function deleteManagedUserProfile(userId) {
  if (!db || !isAdmin() || userId === currentUser?.uid) return;
  const user = managedUsers.find((entry) => entry.id === userId);
  if (!user || user.guestOnly) return;
  const name = user.name || user.email || userId;
  const firstWarning = `Profil von "${name}" wirklich löschen? Das entfernt die gespeicherten Profildaten aus der Nutzerverwaltung.`;
  if (!window.confirm(firstWarning)) return;
  const secondWarning = "Zweite Warnung: Das Profil wird jetzt endgültig aus Firestore gelöscht. Fortfahren?";
  if (!window.confirm(secondWarning)) return;
  await db.collection("users").doc(userId).delete();
  managedUsers = managedUsers.filter((entry) => entry.id !== userId);
  renderUserManagement();
  showToast("Nutzerprofil wurde gelöscht.");
}

// Redundant renderAll removed

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
  if (!target.dataset.userRole && !target.dataset.userReset && !target.dataset.userDisable && !target.dataset.userDeleteProfile) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (target.dataset.userRole) await toggleUserRole(target.dataset.userRole);
  if (target.dataset.userReset) await sendManagedPasswordReset(target.dataset.userReset);
  if (target.dataset.userReset) {
    if (!confirm("Passwort wirklich auf 00000000 zurücksetzen?")) return;
    try {
      const res = await postToBackend("admin-reset-password", { uid: target.dataset.userReset, adminUid: currentUser.uid });
      showToast(res.message || "Passwort wurde zurückgesetzt.");
    } catch (error) {
      showToast(error.message || "Fehler beim Zurücksetzen.");
    }
  }
  if (target.dataset.userDisable) await toggleUserDisabled(target.dataset.userDisable);
  if (target.dataset.userDeleteProfile) await deleteManagedUserProfile(target.dataset.userDeleteProfile);
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

function variantPrice(book, fulfillment = "default", variantName = null) {
  if (variantName) {
    const v = (book?.variants || []).find(x => x.name === variantName);
    if (v) return Number(v.price || 0);
  }
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

function hasDownloadOption(book) {
  return availableFulfillmentOptions(book).includes("download");
}

function hasPhysicalOption(book) {
  const type = book?.itemType || "book";
  if (type === "product") return true;
  const options = availableFulfillmentOptions(book);
  return !options.length || options.includes("print") || options.includes("default");
}

function physicalCartQuantity(bookId, exceptKey = "") {
  return cart
    .filter((entry) => entry.bookId === bookId && (entry.fulfillment || "default") !== "download" && cartKey(entry) !== exceptKey)
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
}

function canPurchaseFulfillment(book, fulfillment = "default") {
  if (fulfillment === "download") return hasDownloadOption(book);
  return Number(book?.stock || 0) > 0;
}

function stockStatusForBook(book) {
  const stock = Number(book?.stock || 0);
  const download = hasDownloadOption(book);
  const physical = hasPhysicalOption(book);
  if (!physical && download) return { text: "Download verfügbar", state: "download" };
  if (stock <= 0) {
    return {
      text: download ? "Download verfügbar, gedruckt ausverkauft" : "ausverkauft",
      state: "soldout"
    };
  }
  const display = stockText(stock);
  return {
    text: display,
    state: stock < 10 ? "low" : "available"
  };
}

function stockPillMarkup(book, variantName = null) {
  const stock = displayStockForBook(book, variantName);
  const status = stockStatusForBook({ ...book, stock });
  return `<span class="stock-pill stock-pill-${status.state}">${escapeHtml(status.text)}</span>`;
}

function formatDescriptionHtml(text, bookId) {
  const description = String(text || "").trim();
  if (!description) return "<p class='muted'>Keine Beschreibung verfügbar.</p>";

  if (description.length < 50) {
    return `<div class="product-description" style="max-height: none; overflow: visible;">${escapeHtml(description).replace(/\n/g, "<br>")}</div>`;
  }

  return `
    <div class="description-toggle is-collapsed" data-description-toggle="${escapeHtml(bookId)}">
      <div class="product-description" style="white-space: pre-line;">${escapeHtml(description).replace(/\n/g, "<br>")}</div>
      <button type="button" class="text-toggle" data-description-toggle="${escapeHtml(bookId)}">Mehr anzeigen</button>
    </div>
  `;
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
window.buyQuantityKey = buyQuantityKey;

function buyQuantityValue(bookId, fulfillment = "default") {
  if (fulfillment === "download") return 1;
  const key = buyQuantityKey(bookId, fulfillment);
  const input = document.querySelector(`[data-buy-qty-input="${CSS.escape(key)}"]`);
  const value = Number(input?.value || 1);
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

function quickAddPrint(bookId) {
  if (!bookId) return;
  const qty = buyQuantityValue(bookId, "print");
  addToCart(bookId, "print", qty, null);
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
  if (!canPurchaseFulfillment(book, fulfillment)) return "";
  const isVariant = fulfillment !== "default";
  const dataAttr = isVariant ? `data-add-option="${book.id}:${fulfillment}"` : `data-add="${book.id}"`;
  const label = isVariant ? optionButtonLabel(book, fulfillment) : "In den Warenkorb";
  return `
    <div class="buy-action-row">
      ${buyQuantityControl(book, fulfillment)}
      <button type="button" class="primary-button" ${dataAttr}>${label}</button>
    </div>
  `;
}

updateMaterialFields = function updateMaterialFields() {
  const form = $("#bookForm");
  if (!form) return;
  const id = formField(form, "id")?.value;
  const category = formField(form, "category")?.value || "Sonstige";
  const normalizedCat = normalizeCategory(category);

  // Auto-set itemType for new entries based on category
  if (!id) {
    const itemTypeField = formField(form, "itemType");
    if (itemTypeField) {
      if (normalizedCat === "Alltagshelfer") {
        itemTypeField.value = "product";
      } else if (normalizedCat === "Lernhelfer") {
        itemTypeField.value = "worksheet";
      } else if (normalizedCat === "Aufklärung") {
        itemTypeField.value = "book";
      }
    }
  }

  const rawType = formField(form, "itemType")?.value;
  const itemType = rawType || "book";

  const isBook = itemType === "book";
  const isWorksheet = itemType === "worksheet";
  const isProduct = itemType === "product";

  const hasVariants = isBook || isWorksheet;
  const usesCoverAndPdf = hasVariants;
  const downloadAvailable = formField(form, "downloadAvailable")?.checked;

  const isSonstige = normalizedCat === "Sonstige";
  const isAlltagshelfer = normalizedCat === "Alltagshelfer";
  const isLernhelfer = normalizedCat === "Lernhelfer";

  // Only hide type selection if it's a book category and not already a product/worksheet
  $("#itemTypeWrap")?.classList.toggle("hidden", !isSonstige && !isAlltagshelfer && !isLernhelfer && !isProduct && !isWorksheet);
  $("#variantPricesWrap")?.classList.toggle("hidden", false);

  const showPdfFields = hasVariants && downloadAvailable;

  const isbnWrap = $("#isbnSelectionWrap");
  if (isbnWrap) {
    isbnWrap.classList.toggle("hidden", !isBook);
    $("#isbnEbookWrap")?.classList.toggle("hidden", !showPdfFields);
    if (isBook) {
      const id = formField(form, "id")?.value;
      const existing = id ? books.find(b => b.id === id) : null;
      updateIsbnPickerDisplay(existing);
    }
  }

  $("#coverChoiceWrap")?.classList.toggle("hidden", isProduct);
  $("#coverUploadWrap")?.classList.toggle("hidden", isProduct);

  $("#pdfChoiceWrap")?.classList.toggle("hidden", !showPdfFields);
  $("#pdfUploadWrap")?.classList.toggle("hidden", !showPdfFields);

  $("#previewPagesWrap")?.classList.toggle("hidden", isProduct);
  $("#previewUploadWrap")?.classList.toggle("hidden", isProduct);
  $("#previewPagesPreview")?.classList.toggle("hidden", isProduct || !selectedPreviewPages().length);

  $("#fulfillmentOptionsWrap")?.classList.toggle("hidden", !hasVariants);
  $("#productImagesWrap")?.classList.toggle("hidden", !isProduct);
  $("#productUploadWrap")?.classList.toggle("hidden", !isProduct);
  $("#productPreview")?.classList.toggle("hidden", !isProduct || !selectedProductImages().length);
  $("#productVariantsSection")?.classList.toggle("hidden", !isProduct);

  const pdfLabel = $("#pdfChoiceWrap");
  if (pdfLabel?.firstChild) {
    pdfLabel.firstChild.textContent = isBook ? "E-Book-PDF" : "PDF für Arbeitsblätter";
  }

  const stock = formField(form, "stock");
  const downloadPriceInput = formField(form, "downloadPrice");
  const printPriceInput = formField(form, "printPrice");
  const printAvailable = formField(form, "printAvailable");

  if (downloadPriceInput) {
    downloadPriceInput.classList.toggle("hidden", !showPdfFields);
    downloadPriceInput.placeholder = isProduct ? "Download-Preis nicht nötig" : "Download-Preis in EUR";
    downloadPriceInput.required = showPdfFields;
    downloadPriceInput.disabled = isProduct;
  }
  if (printPriceInput) {
    printPriceInput.placeholder = isProduct ? "Produkt-Preis in EUR" : "Gedruckt-Preis in EUR";
    printPriceInput.required = isProduct || (hasVariants && Boolean(printAvailable?.checked));
  }

  if (stock) stock.placeholder = isWorksheet ? "Arbeitsblatt-Pakete" : isProduct ? "Lagerbestand" : "Bücher auf Lager";

  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = isProduct ? "Produkt speichern" : "Buch speichern";
};

bookCardTemplate = function bookCardTemplate(book) {
  const rating = averageRating(book);
  const category = normalizeCategory(book.category);
  const type = book.itemType || "book";
  const purelyPhysical = type === "product" || !hasDownloadOption(book);
  const canQuickAdd = purelyPhysical && Number(book.stock || 0) > 0;
  const variants = Array.isArray(book.variants) ? book.variants : [];
  return `
    <article class="book-card">
      <img src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}" data-open="${book.id}" style="cursor: pointer;">
      <div class="book-body">
        <h2 class="book-title" data-open="${book.id}" style="cursor: pointer;">${escapeHtml(book.title)}</h2>
        <span class="stock-pill">${escapeHtml(category)}</span>
        ${stockPillMarkup(book)}
        <span class="stars">${stars(rating || 0)}</span>
        <span class="price">${priceRangeText(book)}</span>
        <div class="card-actions basic-actions">
          <button type="button" data-open="${book.id}">Details</button>
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
        </div>
        ${canQuickAdd ? `
          <div class="quick-add-wrap" style="margin-top: 6px; width: 100%;">
            <div class="quick-add-row" style="display: flex; gap: 5px; align-items: center; justify-content: center;">
              ${buyQuantityControl(book, 'print')}
              <button type="button" class="quick-add-button" onclick="quickAddPrint('${book.id}')">In den Warenkorb</button>
            </div>
          </div>
        ` : ""}
      </div>
    </article>
  `;
};

// Redundant submitBook removed

// Redundant editBook removed

openBook = function openBook(bookId) {
  const book = books.find((entry) => entry.id === bookId);
  const modalBody = $("#modalBody");
  const bookModal = $("#bookModal");
  if (!book || !modalBody || !bookModal) return;
  syncProductUrl(book);
  const rating = averageRating(book);
  const allowed = mayReviewBook(book.id);
  const type = book.itemType || "book";
  const publishedMarkup = bookPublicationMarkup(book);
  const gallery = type === "product" && book.productImages?.length
    ? `<div class="product-gallery">${book.productImages.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>`
    : "";
  const previews = type !== "product" && book.previewPages?.length
    ? `<section class="preview-section"><h3>Vorschau</h3><div class="preview-pages">${book.previewPages.slice(0, 2).map((src) => `<img src="${escapeHtml(src)}" alt="Vorschauseite">`).join("")}</div></section>`
    : "";
  const productVariants = type === "product" && Array.isArray(book.variants) && book.variants.length > 1 ? `
    <section class="product-variants">
      <h3>Variante auswählen</h3>
      <div class="product-variant-list">
        ${book.variants.map((variant, index) => `
          <button type="button" class="product-variant-option${index === 0 ? " is-selected" : ""}" data-product-variant="${escapeHtml(book.id)}:${escapeHtml(variant.name)}">
            <strong>${index === 0 ? escapeHtml(book.title) : escapeHtml(variant.name)}</strong>
            <span>${escapeHtml(variant.title || book.title)} · ${Number(variant.price || 0).toFixed(2)} EUR · ${escapeHtml(stockText(displayStockForBook(book, variant.name)))}</span>
          </button>
        `).join("")}
      </div>
    </section>
  ` : "";
  const firstVariant = book.variants?.[0] || null;
  const primaryDescription = String(book.description || "").trim();
  const modalDescriptionHtml = formatDescriptionHtml(book.description, book.id);
  const fulfillmentOptions = availableFulfillmentOptions(book);
  const addActions = fulfillmentOptions.length
    ? fulfillmentOptions.map((option) => buyActionMarkup(book, option)).join("")
    : book.variants?.length
      ? `<div class="buy-action-row"><button type="button" class="primary-button" data-add-variant="${escapeHtml(book.id)}:${escapeHtml(book.variants[0].name)}">In den Warenkorb</button></div>`
      : buyActionMarkup(book);
  modalBody.innerHTML = `
    <div class="modal-layout">
      <img id="modalVariantImage" class="modal-cover" src="${itemImage(book)}" alt="${escapeHtml(itemTypeLabel(type))} von ${escapeHtml(book.title)}">
      <div>
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        ${publishedMarkup}
        <p id="modalVariantPrice" class="price">${priceRangeText(book)}</p>
        <p><span class="stock-pill">${escapeHtml(normalizeCategory(book.category))}</span> <span id="modalVariantStock">${stockPillMarkup(book, firstVariant?.name || null)}</span></p>
        <p class="stars">${stars(rating || 0)} ${rating ? rating.toFixed(1) : "Noch keine Bewertung"}</p>
        <div id="modalVariantDescription">${modalDescriptionHtml}</div>
        ${type === "book" && book.pdf ? `<p class="muted">Dieses Buch ist als Download und/oder gedruckt verfügbar.</p>` : ""}
        ${""}
        ${previews}
        ${gallery}
        ${productVariants}
        <div class="buy-action-row">
          ${addActions}
          <button type="button" data-wishlist="${book.id}" class="wishlist-button">${isWishlisted(book.id) ? "Gemerkt" : "Merken"}</button>
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
        <details class="review-list">
          <summary>Rezensionen (${book.reviews?.length || 0})</summary>
          ${book.reviews?.length ? book.reviews.map((review) => reviewTemplate(book.id, review)).join("") : "<p class='muted'>Noch keine Rezensionen.</p>"}
        </details>
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
  const shipping = selectedShippingMethod();
  let shippingPrice = shipping ? Number(shipping.price || 0) : 0;
  if (totals.itemTotal >= 25) {
    shippingPrice = 0;
  }
  const shippingFee = shipping ? {
    id: `shipping-${shipping.id}`,
    name: `Versand: ${shipping.name}`,
    price: shippingPrice,
    description: shipping.description || "Ausgewählter Lieferdienst",
    kind: "shipping",
    shippingMethodId: shipping.id
  } : null;
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
    fees: [
      ...activeFees().map((fee) => ({
        id: fee.id || newId(),
        name: fee.name || "Zusatzkosten",
        price: Number(fee.price || 0),
        description: fee.description || ""
      })),
      ...(shippingFee ? [shippingFee] : [])
    ],
    shippingMethod: shipping ? {
      id: shipping.id,
      name: shipping.name,
      price: Number(shipping.price || 0),
      description: shipping.description || ""
    } : null,
    discounts: totals.discountDetails.map((entry) => ({
      id: entry.discount.id,
      code: entry.discount.code,
      kind: entry.discount.kind,
      valueType: entry.discount.valueType,
      value: entry.discount.value,
      giftVoucher: Boolean(entry.discount.giftVoucher),
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
    orderNumber: checkout.orderNumber || generateOrderNumber(),
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
    shippingMethod: checkout.shippingMethod || null,
    trackingNumber: checkout.trackingNumber || "",
    paymentMode: checkout.paymentMode || "stripe-paid",
    stripeSessionId: checkout.stripeSessionId || "",
    legalAcceptance: checkout.legalAcceptance || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.runTransaction(async (transaction) => {
      const requestedByBook = new Map();
      for (const item of checkout.cart || []) {
        const currentRequested = Number(requestedByBook.get(item.bookId) || 0);
        const physicalQuantity = item.fulfillment === "download" ? 0 : Number(item.quantity || 0);
        requestedByBook.set(item.bookId, currentRequested + physicalQuantity);
      }
      const snapshots = new Map();
      for (const [bookId, requested] of requestedByBook.entries()) {
        const ref = db.collection("books").doc(bookId);
        const snap = await transaction.get(ref);
        if (!snap.exists || requested > Number(snap.data().stock || 0)) throw new Error("stock");
        snapshots.set(bookId, { ref, book: { id: snap.id, ...snap.data() }, requested });
      }
      for (const entry of snapshots.values()) {
        if (entry.requested <= 0) continue;
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
          downloadedAt: fulfillment === "download" ? item.downloadedAt || null : null,
          downloadSession: fulfillment === "download" ? item.downloadSession || createDownloadSession() : null
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
      downloadedAt: item.fulfillment === "download" ? item.downloadedAt || null : null,
      downloadSession: item.fulfillment === "download" ? item.downloadSession || createDownloadSession() : null
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
  if (!discount.enabled || discount.value <= 0 || discount.appliesTo === "fees") return 0;
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
        const totalForBook = physicalCartQuantity(item.bookId);
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
  cleanUnavailableCartItems();
  const checkoutCart = availableCartItems(cart);
  const totals = discountSummary(checkoutCart);
  return {
    customer: {
      name: data.get("name"),
      email: data.get("email"),
      street: data.get("street"),
      city: data.get("city"),
      userId: currentUser?.uid || null
    },
    cart: checkoutCart.map((item) => {
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
      giftVoucher: Boolean(entry.discount.giftVoucher),
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
        <img src="${escapeHtml(image || sampleCover)}" alt="${escapeHtml(book?.title || "Artikel")}" data-open="${escapeHtml(book?.id || "")}" style="cursor: pointer;">
        <div class="book-body">
          <h2 class="book-title" data-open="${escapeHtml(book?.id || "")}" style="cursor: pointer;">${escapeHtml(book?.title || "Artikel")}</h2>
          <span class="price">${priceHtml}</span>
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
    : `<div class="shop-empty-state" role="status"><strong>Keine passenden Artikel gefunden</strong><span>Versuche einen anderen Suchbegriff oder Filter.</span></div>`;
};
renderCustomerOrders = function renderCustomerOrders() {
  if (!currentUser) return "";
  const visibleOrders = (customerOrders || []).filter((order) => !order.archived);
  return `
    <section class="customer-orders">
      <h3>Aktuelle Bestellungen</h3>
      <p class="muted">Hinweis: Der angezeigte Status ist nur eine Orientierung und kann vom echten Versandstatus abweichen.</p>
      ${visibleOrders.length ? visibleOrders.map((order) => {
        const stripeResponse = order.stripeResponse || {};
        const invoiceUrl = order.stripeInvoiceUrl || order.hosted_invoice_url || order.stripeReceiptUrl || order.receiptUrl ||
                           stripeResponse.hosted_invoice_url || stripeResponse.invoice_url || stripeResponse.receipt_url || "";
        return `
        <details class="customer-order-card">
          <summary>
            <span>${escapeHtml(orderDateText(order.createdAt))}</span>
            <strong>${escapeHtml(orderFulfillmentStatus(order))}</strong>
          </summary>
          <div class="customer-order-detail">
            <p><b>Status:</b> ${escapeHtml(orderFulfillmentStatus(order))}</p>
            <p><b>Bestellnr.:</b> ${paymentIndicatorMarkup(order)} ${escapeHtml(order.orderNumber || order.id || "")}</p>
            <p><b>${escapeHtml(shippingLine(order))}</b></p>
            ${shippingMethodChangeNotice(order) ? `<p class="soft-alert">${escapeHtml(shippingMethodChangeNotice(order))}</p>` : ""}
            ${trackingLinkMarkup(order)}
            <p>${(order.items || []).map((item) => `${escapeHtml(item.title || "Artikel")} (${Number(item.quantity || 1)}x)`).join(", ")}</p>
            ${invoiceUrl ? `<div style="text-align: right;"><a class="secondary-link" href="${escapeHtml(invoiceUrl)}" target="_blank" rel="noopener" style="text-decoration: underline; color: #0000EE;">Rechnung Ansehen</a></div>` : ""}
          </div>
        </details>
      `;}).join("") : `<p class="muted">Du hast gerade keine offenen Bestellungen.</p>`}
    </section>
  `;
};

renderAdminOrderCard = function renderAdminOrderCard(order) {
  const address = formatOrderAddress(order);
  const total = Number(order.total || 0).toFixed(2);
  const fulfillmentStatus = orderFulfillmentStatus(order);
  const currentShippingMethod = order.shippingMethod || {};
  const carrier = order.shippingCarrier || "";
  const shippingMethods = normalizedShippingMethods();
  const shippingCarrierOptions = shippingCarrierOptionsMarkup(carrier, shippingMethods);
  const title = order.customer?.name || order.customer?.email || "Unbekannte Bestellung";
  const downloadOnly = isDownloadOnlyOrder(order);
  const stripeResponse = order.stripeResponse || {};
  const invoiceUrl = order.stripeInvoiceUrl || order.hosted_invoice_url || order.stripeReceiptUrl || order.receiptUrl ||
                     stripeResponse.hosted_invoice_url || stripeResponse.invoice_url || stripeResponse.receipt_url || "";
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
        <p><b>Bestellnr.:</b> ${paymentIndicatorMarkup(order)} ${escapeHtml(order.orderNumber || order.id || "")}</p>
        <p><b>Adresse:</b> ${escapeHtml(address || "Keine Adresse")}</p>
        ${orderAddressEditorMarkup(order)}
        <p><b>Bezahlt:</b> ${orderIsPaid(order) ? "Ja" : "Nein"} | <b>Betrag:</b> ${total} EUR</p>
        <p><b>Bestellung:</b> ${orderKindLabel(order)}</p>
        ${order.sendcloudParcelId ? `<p><b>Sendcloud ID:</b> ${escapeHtml(order.sendcloudParcelId)}</p>` : ""}
        ${invoiceUrl ? `<div style="text-align: right;"><a class="secondary-link" href="${escapeHtml(invoiceUrl)}" target="_blank" rel="noopener" style="text-decoration: underline; color: #0000EE;">Rechnung Ansehen</a></div>` : ""}

        <p><b>Gewählte Versandart:</b> ${escapeHtml(currentShippingMethod.name || "Keine Versandart gespeichert")} ${currentShippingMethod.name ? `(${Number(currentShippingMethod.price || 0).toFixed(2)} EUR)` : ""}</p>
        ${shippingMethodChangeNotice(order) ? `<p class="soft-alert"><b>Hinweis für Kunde:</b> ${escapeHtml(shippingMethodChangeNotice(order))}</p>` : ""}
        <div class="order-detail-list">
          ${(order.items || []).map((item) => `
            <div class="order-item-row" style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
              <div class="item-qty" style="min-width: 40px; font-weight: bold; color: var(--leaf); background: rgba(79, 137, 85, 0.1); padding: 4px 8px; border-radius: 6px; text-align: center; margin-right: 12px;">
                ${Number(item.quantity || 1)}x
              </div>
              <div class="item-info" style="flex: 1;">
                <div style="font-weight: bold;">${escapeHtml(item.title || "Artikel")}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">
                  ${Number(item.price || 0).toFixed(2)} EUR | ${escapeHtml(item.fulfillmentLabel || itemFulfillmentLabel(item.fulfillment || "default"))}
                  ${item.fulfillment === "download" ? `
                    <br><span class="download-status ${item.downloaded ? "downloaded" : "pending"}">${downloadSessionStatusText(item)}</span>
                  ` : ""}
                </div>
              </div>
              <div class="item-total" style="font-weight: bold;">
                ${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)} EUR
              </div>
            </div>
          `).join("") || `<p class="muted">Keine Artikel gespeichert.</p>`}
        </div>
        ${deliveryProofMarkup(order)}
        <p><b>Archiv:</b> ${order.archived ? "Archiviert | wird nach 90 Tagen geloecht" : "Offen"}</p>
        ${downloadOnly ? `<p class="muted">Nur Download-Artikel - Keine Versand- oder Statusoptionen nötig.</p>` : `
        <div class="order-shipping-form" data-order-shipping="${order.id}">
          <label>
            Bestellstatus
            <select name="fulfillmentStatus">
              <option value="wird vorbereitet" ${fulfillmentStatus === "wird vorbereitet" ? "selected" : ""}>wird vorbereitet</option>
              <option value="in bearbeitung" ${fulfillmentStatus === "in bearbeitung" ? "selected" : ""}>in bearbeitung</option>
              <option value="abgeschickt" ${fulfillmentStatus === "abgeschickt" ? "selected" : ""}>abgeschickt</option>
              <option value="custom" ${!["wird vorbereitet", "in bearbeitung", "abgeschickt"].includes(fulfillmentStatus) ? "selected" : ""}>eigener Status</option>
            </select>
          </label>
          <label>
            Eigener Status nur für diese Bestellung
            <input name="customFulfillmentStatus" value="${!["wird vorbereitet", "in bearbeitung", "abgeschickt"].includes(fulfillmentStatus) ? escapeHtml(fulfillmentStatus) : ""}" placeholder="z.B. wartet auf Abholung">
          </label>
          <label>
            Versandart ändern (nur falls nötig)
            <select name="shippingMethodId" data-current-shipping-method-id="${escapeHtml(currentShippingMethod.id || "")}">
              <option value="">Nicht ändern</option>
              ${shippingMethods.map((method) => `
                <option value="${escapeHtml(method.id)}" ${method.id === currentShippingMethod.id ? "selected" : ""}>
                  ${escapeHtml(method.name)} - ${Number(method.price || 0).toFixed(2)} EUR
                </option>
              `).join("")}
            </select>
          </label>
          <label>
            Grund für Versandart-Änderung
            <input name="shippingMethodReason" value="" placeholder="Wird dem Kunden angezeigt">
          </label>
          <label>
            Tracking-Anbieter
            <select name="shippingCarrier" data-shipping-carrier-select>
              ${shippingCarrierOptions}
            </select>
          </label>
          <label class="shipping-carrier-custom-field ${carrier === "Weitere" ? "" : "hidden"}">
            Eigener Tracking-Anbieter
            <input name="shippingCarrierCustom" value="${escapeHtml(order.shippingCarrierCustom || "")}" placeholder="Nur bei Weitere">
          </label>
          <label>
            Sendungsnummer
            <input name="trackingNumber" value="${escapeHtml(order.trackingNumber || "")}" placeholder="z.B. 000000000">
          </label>
          <button type="button" data-order-shipping-save="${order.id}">Status / Versand speichern</button>
        </div>
        <div class="shipping-label-tools" style="margin-top: 12px; display: grid; gap: 8px;">
          ${!order.shippingLabelUrl ? `
            <div class="admin-actions">
              <button type="button" data-create-sendcloud-label="${order.id}">Sendcloud Label erstellen${paymentIndicatorState(order) === "test" ? " (Test)" : ""}</button>
              <button type="button" class="secondary-button" data-mark-external-label="${order.id}">Woanders erstellen</button>
              <label class="profile-file-label" style="margin: 0;">
                  <span class="profile-file-picker">
                      <input type="file" accept="application/pdf" data-upload-shipping-label="${order.id}">
                      <span class="profile-file-button" style="min-height: 34px; padding: 6px 12px;">Manuell hochladen</span>
                  </span>
              </label>
            </div>
          ` : `
            <div class="admin-actions">
              ${order.shippingLabelUrl === "extern" ? `<span style="background:#e0e0e0; color:#333; padding: 6px 12px; border-radius: 8px; font-weight: bold; display: inline-block;">Woanders erstellt</span>` : `<a href="${order.shippingLabelUrl}" target="_blank" class="mini-link-button" style="background: var(--leaf); color: #fff; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Etikett ansehen/drucken</a>`}
              <button type="button" data-delete-label="${order.id}" class="secondary-button" style="color: #c62828;">${order.shippingLabelUrl === "extern" ? "Zurücksetzen" : "Löschen"}</button>
            </div>
          `}
        </div>
        `}
        <div class="admin-actions">
          ${order.archived ? `<button type="button" data-order-restore="${order.id}">Wiederherstellen</button>` : `<button type="button" data-order-complete="${order.id}">Fertig markieren</button>`}
          <button type="button" data-order-delete="${order.id}">Löschen</button>
        </div>
      </div>
    </details>
  `;
};
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
  const gamesPage = window.location.pathname.includes("/games/");
  const isTeam = canHandleSupportChats();
  // Team members always see the widget to handle chats, customers only if not on specific pages
  return isTeam || (!isSupportPage() && !cartOpen && !gamesPage);
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
    showToast("Support.html ist nur für Admins. Kunden nutzen den Support-Button unten rechts.");
    window.setTimeout(() => {
      window.location.href = pageHref("index.html");
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
  if (status === "present") return "Aktiv";
  if (status === "standby") return "Bereit";
  return "Nicht aktiv";
}

function supportAvailabilityText() {
  const status = bestSupportStatus();
  return "Schreib mir deine Nachricht. Ich antworte so schnell wie möglich.";
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
  if (currentUser && !currentUser.isAnonymous) return currentUser;
  $("#authModal")?.classList.remove("hidden");
  showToast("Bitte melde dich an, um dem Support zu schreiben.");
  throw new Error("support-login-required");
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
    $("#supportAvailability").textContent = "Diese Support-Ansicht ist nur für Admins und Support-Mitarbeiter. Für Kunden ist der Support-Button unten rechts auf der Webseite.";
    adminPanel?.classList.add("hidden");
    chatPanel?.classList.add("hidden");
    return;
  }

  $("#supportAvailability").textContent = supportAvailabilityText();
  adminPanel?.classList.remove("hidden");
  chatPanel?.classList.remove("hidden");
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
  `).join("") : `<p class="muted">Schreibe mir eine Nachricht. Wenn niemand anwesend ist, melde ich mich so schnell wie möglich.</p>`;
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
        <span>Support</span>
      </button>
      <section id="customerSupportPanel" class="customer-support-panel hidden" aria-label="Support-Nachricht">
        <div class="customer-support-head">
          <div>
            <strong>Support anschreiben</strong>
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

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  protectSupportPage();
  renderCustomerSupportWidget();
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

supportAvailabilityText = function supportAvailabilityText() {
  return "Schreib mir deine Nachricht. Ich antworte so schnell wie möglich.";
};

ensureSupportWriteAuth = async function ensureSupportWriteAuth() {
  if (currentUser && !currentUser.isAnonymous) return currentUser;
  $("#authModal")?.classList.remove("hidden");
  showToast("Bitte melde dich an, um dem Support zu schreiben.");
  throw new Error("support-login-required");
};

protectSupportPage = function protectSupportPage() {
  if (!isSupportPage()) return;
  if (!authReady) {
    $("#supportAdminPanel")?.classList.add("hidden");
    $(".support-chat-panel")?.classList.add("hidden");
    const info = $("#supportAvailability");
    if (info) info.textContent = "Admin-Zugang wird geprüft...";
    return;
  }
  if (currentUser && isSupportTeam()) return;
  if (currentUser && !isSupportTeam()) {
    showToast("Support.html ist nur für Admins und Support. Kunden nutzen den Support-Button unten rechts.");
    window.setTimeout(() => {
      window.location.href = pageHref("index.html");
    }, 900);
    return;
  }
  $("#supportAdminPanel")?.classList.add("hidden");
  $(".support-chat-panel")?.classList.add("hidden");
  const info = $("#supportAvailability");
  if (info) info.textContent = "Bitte als Admin oder Support anmelden. Diese Seite ist nicht für Kunden.";
};

ensureCustomerSupportWidget = function ensureCustomerSupportWidget() {
  if ($("#customerSupportWidget")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <aside id="customerSupportWidget" class="customer-support-widget hidden" aria-live="polite">
      <button id="customerSupportToggle" class="customer-support-toggle" type="button" aria-expanded="false" aria-controls="customerSupportPanel">
        <span class="customer-support-dot" aria-hidden="true"></span>
        <span>Support</span>
      </button>
      <section id="customerSupportPanel" class="customer-support-panel hidden" aria-label="Support-Nachricht">
        <div class="customer-support-head">
          <div id="supportWidgetHeaderNormal">
            <strong>Support anschreiben</strong>
            <p id="customerSupportAvailability">Ich antworte so schnell wie möglich.</p>
          </div>
          <div id="supportWidgetHeaderAdmin" class="hidden">
            <div class="support-mode-toggle">
              <button type="button" data-support-widget-mode="customer" class="is-active">Mein Chat</button>
              <button type="button" data-support-widget-mode="support">Alle Chats</button>
            </div>
          </div>
          <button id="customerSupportMinimize" class="icon-button" type="button" aria-label="Support minimieren">X</button>
        </div>
        <div id="supportWidgetChatList" class="support-widget-list hidden"></div>
        <div id="supportWidgetAssignBox" class="support-widget-assign hidden"></div>
        <div id="customerSupportMessages" class="support-messages customer-support-messages"></div>
        <form id="customerSupportForm" class="support-chat-form">
          <textarea name="message" rows="2" placeholder="Nachricht schreiben..." required></textarea>
          <div class="customer-support-actions">
            <button type="submit">Senden</button>
            <button type="button" id="customerSupportClose">Fall schließen</button>
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

    if (isOpen) {
      if (canHandleSupportChats()) {
        listenToSupportChats();
        listenToSupportAssignees();
      }
      if (activeSupportChatId && !unsubscribeSupportMessages) listenToSupportMessages();
      renderCustomerSupportWidget();
    }
  });

  $("#customerSupportPanel")?.addEventListener("click", (event) => {
    const modeTarget = event.target.closest("[data-support-widget-mode]");
    const chatTarget = event.target.closest("[data-support-widget-open]");
    const takeTarget = event.target.closest("[data-support-widget-take]");

    if (modeTarget) {
      supportWidgetMode = modeTarget.dataset.supportWidgetMode;
      localStorage.setItem("entfalta_support_widget_mode", supportWidgetMode);
      renderCustomerSupportWidget();
    }
    if (chatTarget) {
      openSupportChat(chatTarget.dataset.supportWidgetOpen);
      supportWidgetMode = "customer"; // Switch back to chat view when a chat is selected
      renderCustomerSupportWidget();
    }
    if (takeTarget) takeSupportChat(takeTarget.dataset.supportWidgetTake);
  });

  $("#customerSupportMinimize")?.addEventListener("click", () => {
    $("#customerSupportPanel")?.classList.add("hidden");
    $("#customerSupportToggle")?.setAttribute("aria-expanded", "false");
  });
  $("#customerSupportForm")?.addEventListener("submit", sendSupportMessage);
  $("#customerSupportClose")?.addEventListener("click", () => closeSupportChat());
};

renderCustomerSupportWidget = function renderCustomerSupportWidget() {
  ensureCustomerSupportWidget();
  const widget = $("#customerSupportWidget");
  const panel = $("#customerSupportPanel");
  if (!widget || !panel) return;

  const isTeam = canHandleSupportChats();
  const headerNormal = $("#supportWidgetHeaderNormal");
  const headerAdmin = $("#supportWidgetHeaderAdmin");

  if (headerNormal && headerAdmin) {
    headerNormal.classList.toggle("hidden", isTeam);
    headerAdmin.classList.toggle("hidden", !isTeam);

    if (isTeam) {
      // If team member opens widget without a mode, default to support (all chats)
      if (!localStorage.getItem("entfalta_support_widget_mode")) {
        supportWidgetMode = "support";
        localStorage.setItem("entfalta_support_widget_mode", "support");
      }

      headerAdmin.querySelectorAll("[data-support-widget-mode]").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.supportWidgetMode === supportWidgetMode);
      });
    }
  }

  const availability = $("#customerSupportAvailability");
  if (availability) {
    availability.textContent = currentUser && !currentUser.isAnonymous
      ? "Ich helfe dir gerne weiter."
      : "Bitte einloggen für Live-Chat.";
  }

  renderSupportWidgetAdminTools();
  renderCustomerSupportMessages();

  widget.classList.toggle("hidden", !shouldShowCustomerSupportWidget());
};

renderCustomerSupportMessages = function renderCustomerSupportMessages() {
  const box = $("#customerSupportMessages");
  const form = $("#customerSupportForm");
  const chatList = $("#supportWidgetChatList");
  if (!box || !form || !chatList) return;

  const isTeam = canHandleSupportChats();

  if (!currentUser || currentUser.isAnonymous) {
    chatList.classList.add("hidden");
    box.classList.remove("hidden");
    form.classList.add("hidden");
    box.innerHTML = `
      <div class="support-guest-info">
        <p>Bitte logge dich ein, um meinen Live-Chat zu nutzen. So kann ich dir auch antworten, wenn du die Seite zwischendurch schließt.</p>
        <p class="muted">Alternativ erreichst du mich hier:</p>
        <div class="support-guest-actions">
          <a href="https://wa.me/491791697760" target="_blank" rel="noopener" class="whatsapp-button">WhatsApp Business</a>
          <a href="mailto:kontakt@entfalta.com" class="email-button">E-Mail schreiben</a>
        </div>
      </div>
    `;
    return;
  }

  if (isTeam && supportWidgetMode === "support") {
    chatList.classList.remove("hidden");
    box.classList.add("hidden");
    form.classList.add("hidden");

    const openChats = supportChats.filter(chat => chat.status !== "closed");
    chatList.innerHTML = openChats.length ? openChats.map(chat => `
      <div class="support-widget-chat-entry ${chat.id === activeSupportChatId ? "is-active" : ""}">
        <button type="button" data-support-widget-open="${chat.id}">
          <strong>${escapeHtml(chat.customerName || "Mitglied")}</strong>
          <p class="muted" style="font-size: 0.8em; margin: 0;">${escapeHtml(chat.lastMessage || "Offener Fall")}</p>
        </button>
      </div>
    `).join("") : `<p class="muted" style="padding: 10px;">Keine aktiven Kunden-Chats.</p>`;
    return;
  }

  // Normal Chat View (Member or Team member looking at specific chat)
  chatList.classList.add("hidden");
  box.classList.remove("hidden");
  form.classList.remove("hidden");

  if (supportChatClosedNotice) {
    box.innerHTML = `<p class="support-ended-notice">${escapeHtml(supportChatClosedNotice)}</p>`;
    return;
  }
  if (!activeSupportChatId) {
    box.innerHTML = `<p class="muted">Schreib mir deine Nachricht. Ich antworte so schnell wie möglich.</p>`;
    return;
  }
  box.innerHTML = supportMessages.length ? supportMessages.map((message) => `
    <div class="support-message ${message.senderRole === "support" ? "is-support" : "is-customer"}">
      <strong>${escapeHtml(message.senderName || (message.senderRole === "support" ? "Support" : "Du"))}</strong>
      <p>${escapeHtml(message.text || "")}</p>
    </div>
  `).join("") : `<p class="muted">Noch keine Nachrichten in diesem Chat.</p>`;
  box.scrollTop = box.scrollHeight;
};

setSupportTyping = async function setSupportTyping() {};

renderSupportTyping = function renderSupportTyping() {
  $("#supportTyping")?.classList.add("hidden");
  $("#customerSupportTyping")?.classList.add("hidden");
};

const userRoleTextBeforeGuests = userRoleText;
userRoleText = function userRoleText(user) {
  if (user.guestOnly || user.anonymous) return "Gast";
  return userRoleTextBeforeGuests(user);
};

function guestUsersFromOrders(orderDocs = []) {
  const guests = new Map();
  orderDocs.forEach((doc, index) => {
    const order = doc.data ? doc.data() : doc;
    const customer = order.customer || {};
    if (customer.userId) return;
    const key = String(customer.email || `${customer.name || "Gast"}-${customer.street || ""}-${customer.city || ""}-${index}`).toLowerCase();
    if (guests.has(key)) return;
    const hash = Math.abs(key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
    guests.set(key, {
      id: `guest-${index}-${hash}`,
      name: customer.name || "Anonym (Gast)",
      email: customer.email || "",
      street: customer.street || "",
      city: customer.city || "",
      anonymous: true,
      guestOnly: true
    });
  });
  return [...guests.values()];
}

loadManagedUsers = async function loadManagedUsers() {
  if (!isUserManagementPage() || !db || !isAdmin()) return;
  const list = $("#userManagementList");
  if (list) list.innerHTML = `<p class="muted">Nutzer werden geladen...</p>`;
  try {
    const userSnapshot = await db.collection("users").get();
    const registeredUsers = userSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    managedUsers = registeredUsers.filter((entry) => !entry.anonymous && !entry.guestOnly);
    renderUserManagement();
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = `<p class="muted">Nutzer konnten nicht geladen werden. Prüfe deine Firestore-Regeln für Admins.</p>`;
  }
};

renderUserManagement = function renderUserManagement() {
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
    const readOnlyGuest = Boolean(user.guestOnly);
    const canResetPassword = userCanResetPassword(user);
    return `
      <div class="admin-item ${user.disabled ? "is-hidden-post" : ""}">
        <strong>${escapeHtml(user.name || "Ohne Name")}</strong>
        <p>${escapeHtml(user.email || "Keine E-Mail")} | Rolle: ${userRoleText(user)}</p>
        <p>${escapeHtml([user.street, user.city].filter(Boolean).join(", ") || "Keine Adresse gespeichert")}</p>
        ${readOnlyGuest ? `<p class="muted">Gast aus Bestellung. Kein registriertes Firebase-Konto vorhanden.</p>` : ""}
        ${isSelf ? `<p class="muted">Das bist du. Du kannst dich nicht selbst sperren oder zum Kunden machen.</p>` : ""}
        <div class="admin-actions">
          <button type="button" data-user-role="${user.id}" ${isSelf || readOnlyGuest ? "disabled" : ""}>${user.admin ? "Zum Kunden machen" : "Zum Admin machen"}</button>
          <button type="button" data-user-support="${user.id}" ${isSelf || readOnlyGuest ? "disabled" : ""}>${user.support ? "Support entfernen" : "Zum Support machen"}</button>
          <button type="button" data-user-reset="${user.id}" ${user.email && !readOnlyGuest && canResetPassword ? "" : "disabled"}>Passwort auf 00000000</button>
          <button type="button" data-user-disable="${user.id}" ${isSelf || readOnlyGuest ? "disabled" : ""}>${user.disabled ? "Profil entsperren" : "Profil sperren"}</button>
          <button type="button" data-user-delete-profile="${user.id}" ${isSelf || readOnlyGuest ? "disabled" : ""}>Profil löschen</button>
          <a class="secondary-button" href="/user/${user.id}" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">Öffentliches Profil ansehen</a>
        </div>
      </div>
    `;
  }).join("") : `<p class="muted">Keine Nutzer gefunden.</p>`;
};

function copyProfileLink() {
  const sid = currentProfile?.shortId || currentUser?.uid;
  if (!sid) return;
  const url = `${window.location.origin}/user/${sid}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Link in die Zwischenablage kopiert!");
    }).catch(() => {
      prompt("Kopiere deinen Profil-Link:", url);
    });
  } else {
    prompt("Kopiere deinen Profil-Link:", url);
  }
}

const renderOwnAccountPageBeforeSecurity = renderOwnAccountPage;
renderOwnAccountPage = function renderOwnAccountPage() {
  renderOwnAccountPageBeforeSecurity();
  const panel = $("#accountManagementPage .account-page-panel");
  if (!panel || !currentUser) return;
  $("#sendOwnPasswordReset")?.remove();
  const hasPasswordProvider = (currentUser.providerData || []).some((provider) => provider?.providerId === "password");

  // Remove old security section if it exists (for re-renders)
  panel.querySelector(".account-security-section")?.remove();

  panel.insertAdjacentHTML("beforeend", `
    <section class="account-security-section">
      <div class="account-security-heading">
        <div>
          <h2>Profil & Sicherheit</h2>
          <p class="muted">Verwalte deine öffentliche Sichtbarkeit und Zugangsdaten.</p>
        </div>
      </div>

      <div class="security-settings-grid">
        <article class="security-setting">
          <h3>Öffentliches Profil</h3>
          <div class="public-id-display">
            <span class="short-id-label">Deine ID</span>
            <div class="short-id-value">${escapeHtml(currentProfile?.shortId || '-----')}</div>
            <button type="button" class="mini-link-button" style="margin-top: 5px;" onclick="copyProfileLink()">Link kopieren</button>
          </div>

          <div class="toggle-group">
            <div class="toggle-info">
              <strong>Sichtbarkeit</strong>
              <p>Andere können dein Profil sehen.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="publicProfileToggle" ${currentProfile?.publicProfile ? "checked" : ""}>
              <span class="slider"></span>
            </label>
          </div>
        </article>

        <article class="security-setting">
          <h3>E-Mail ändern</h3>
          <p>Aktuell: <strong>${escapeHtml(currentUser.email || "Keine E-Mail")}</strong></p>
          <input id="newAccountEmail" type="email" autocomplete="email" placeholder="Neue E-Mail-Adresse" style="margin: 10px 0;">
          <button type="button" id="requestEmailChange">Link senden</button>
        </article>

        ${hasPasswordProvider ? `
          <article class="security-setting">
            <h3>Passwort</h3>
            <p>Ich sende dir einen Link zum Zurücksetzen.</p>
            <button type="button" id="sendSecurityPasswordReset" style="margin-top: 10px;">Link senden</button>
          </article>
        ` : ""}
      </div>
    </section>
  `);
};

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (target.id === "requestEmailChange") await requestEmailChange();
  if (target.id === "sendSecurityPasswordReset") {
    if (!currentUser?.email) return showToast("Keine E-Mail-Adresse gefunden.");
    try {
      await requestCustomAuthEmail("passwordReset", {
        email: currentUser.email,
        name: currentProfile?.name || currentUser.displayName || currentUser.email,
        uid: currentUser.uid
      });
      showToast("Passwort-Link wurde per E-Mail gesendet (bitte auch im Spam-Ordner nachsehen).");
    } catch (error) {
      showToast(readableErrorText(error) || authErrorMessage(error));
    }
  }
  if (target.id === "publicProfileToggle") {
    if (!currentUser) return;
    try {
      await db.collection("users").doc(currentUser.uid).update({
        publicProfile: target.checked
      });
      showToast(target.checked ? "Profil ist jetzt öffentlich." : "Profil ist jetzt privat.");
    } catch (error) {
      showToast("Fehler beim Speichern.");
    }
  }
});

document.addEventListener("click", (event) => {
  if (event.target?.id !== "resetCookieConsent") return;
  localStorage.removeItem(COOKIE_CONSENT_KEY);
  showCookieBanner();
});

function syncCheckoutConsentButton() {
  const checkbox = $("#checkoutLegalConsent");
  const button = $("#checkoutSubmitButton");
  if (!checkbox || !button) return;
  const disabled = checkoutRequestInProgress || !checkbox.checked;
  button.disabled = disabled;
  button.classList.toggle("is-loading", checkoutRequestInProgress);
  button.setAttribute("aria-busy", String(checkoutRequestInProgress));
  button.setAttribute("aria-disabled", String(disabled));
}

function checkoutStatusElement(form = $("#checkoutForm")) {
  if (!form) return null;
  let element = form.querySelector(".checkout-status-message");
  if (element) return element;
  element = document.createElement("p");
  element.className = "checkout-status-message hidden";
  const submitButton = form.querySelector("#checkoutSubmitButton") || form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.insertAdjacentElement("beforebegin", element);
  else form.appendChild(element);
  return element;
}

function setCheckoutStatus(message = "", type = "info", form = $("#checkoutForm")) {
  const element = checkoutStatusElement(form);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("hidden", !message);
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-loading", type === "loading");
}

document.addEventListener("change", (event) => {
  if (event.target?.id === "checkoutLegalConsent") syncCheckoutConsentButton();
});

document.addEventListener("DOMContentLoaded", syncCheckoutConsentButton);

const renderCartBeforeConsentPersistence = renderCart;
renderCart = function renderCart() {
  renderCartBeforeConsentPersistence();
  if (cartStorageRestored) persistCartIfAllowed();
};

function isAuthActionPage() {
  return Boolean($("#authActionPanel"));
}

function setAuthActionState(title, text, state = "ok") {
  const panel = $("#authActionPanel");
  const titleNode = $("#authActionTitle");
  const textNode = $("#authActionText");
  const mark = $(".auth-action-mark");
  if (titleNode) titleNode.textContent = title;
  if (textNode) textNode.textContent = text;
  if (panel) {
    panel.dataset.state = state;
    panel.classList.toggle("is-error", state === "error");
    panel.classList.toggle("is-success", state === "ok");
  }
  if (mark) mark.textContent = state === "error" ? "!" : state === "working" ? "..." : "OK";
}

function actionModeTitle(mode) {
  if (mode === "resetPassword") return "Passwort zurücksetzen";
  if (mode === "verifyEmail") return "E-Mail bestätigen";
  if (mode === "verifyAndChangeEmail") return "E-Mail ändern";
  if (mode === "recoverEmail") return "E-Mail-Änderung rückgängig machen";
  return "Konto bestätigen";
}

async function initAuthActionPage() {
  if (!isAuthActionPage()) return;
  if (!auth) {
    setAuthActionState("Firebase fehlt", "Firebase ist noch nicht richtig konfiguriert. Bitte prüfe firebase-config.js.", "error");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const authCode = params.get("authCode") || "";
  if (authCode) {
    await exchangeCustomAuthCode(authCode);
    return;
  }
  const mode = params.get("mode") || "";
  const oobCode = params.get("oobCode") || "";
  const form = $("#authPasswordResetForm");
  setAuthActionState(actionModeTitle(mode), "Der Link wird geprüft ...", "working");

  if (!mode || !oobCode) {
    setAuthActionState("Link unvollständig", "Dieser Bestätigungslink enthält keinen gültigen Firebase-Code.", "error");
    return;
  }

  try {
    if (mode === "resetPassword") {
      const email = await auth.verifyPasswordResetCode(oobCode);
      setAuthActionState("Neues Passwort festlegen", `Der Link ist gültig für ${email}. Bitte gib jetzt dein neues Passwort ein.`, "working");
      form?.classList.remove("hidden");
      form?.elements?.password?.focus();
      return;
    }

    if (["verifyEmail", "verifyAndChangeEmail", "recoverEmail"].includes(mode)) {
      await auth.applyActionCode(oobCode);
      if (auth.currentUser) {
        await auth.currentUser.reload().catch(() => {});
        currentUser = auth.currentUser;
      }
      if (mode === "verifyEmail") {
        setAuthActionState("E-Mail erfolgreich bestätigt", "Deine E-Mail-Adresse wurde erfolgreich bestätigt. Du kannst dich jetzt anmelden oder weiter einkaufen.", "ok");
      } else if (mode === "verifyAndChangeEmail") {
        setAuthActionState("E-Mail erfolgreich geändert", "Deine neue E-Mail-Adresse wurde erfolgreich bestätigt und bei Firebase übernommen.", "ok");
      } else {
        setAuthActionState("E-Mail-Änderung rückgängig gemacht", "Die Änderung deiner E-Mail-Adresse wurde erfolgreich rückgängig gemacht.", "ok");
      }
      return;
    }

    setAuthActionState("Aktion nicht unterstützt", "Dieser Firebase-Link-Typ wird von dieser Webseite nicht unterstützt.", "error");
  } catch (error) {
    console.error(error);
    setAuthActionState("Link ungültig oder abgelaufen", authErrorMessage(error), "error");
  }
}

async function exchangeCustomAuthCode(authCode) {
  setAuthActionState("Code wird geprüft", "Der 14-Minuten-Code aus deiner E-Mail wird geprüft.", "working");
  try {
    const response = await fetch(backendUrl("verify-auth-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: authCode, origin: window.location.origin })
    });
    const data = response.headers.get("Content-Type")?.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) throw new Error(data.error || "Auth-Code konnte nicht geprüft werden.");
    const params = new URLSearchParams();
    params.set("mode", data.mode);
    params.set("oobCode", data.oobCode);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
    await initAuthActionPage();
  } catch (error) {
    console.error(error);
    setAuthActionState("Code ungültig oder abgelaufen", readableErrorText(error) || authErrorMessage(error), "error");
  }
}

async function submitAuthPasswordReset(event) {
  event.preventDefault();
  if (!auth) return;
  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get("oobCode") || "";
  const data = new FormData(event.currentTarget);
  const password = String(data.get("password") || "");
  const passwordConfirm = String(data.get("passwordConfirm") || "");

  if (!passwordIsStrong(password)) {
    setAuthActionState("Passwort zu schwach", "Passwort: mindestens 8 Zeichen, groß/klein, Zahl und Sonderzeichen.", "error");
    return;
  }
  if (password !== passwordConfirm) {
    setAuthActionState("Passwörter stimmen nicht überein", "Bitte gib zweimal exakt dasselbe neue Passwort ein.", "error");
    return;
  }

  try {
    setAuthActionState("Passwort wird gespeichert", "Bitte warte kurz, dein neues Passwort wird bei Firebase gespeichert.", "working");
    await auth.confirmPasswordReset(oobCode, password);
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    setAuthActionState("Passwort erfolgreich zurückgesetzt", "Dein Passwort wurde wirklich geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.", "ok");
  } catch (error) {
    console.error(error);
    setAuthActionState("Passwort konnte nicht geändert werden", authErrorMessage(error), "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthActionPage();
  $("#authPasswordResetForm")?.addEventListener("submit", submitAuthPasswordReset);
});

function errorReportDateText(value, fallbackMs = 0) {
  const timestamp = timestampToMs(value) || Number(fallbackMs || 0);
  if (!timestamp) return "Zeitpunkt unbekannt";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function listenToErrorReports() {
  if (!db || listenToErrorReports.unsubscribe || !isAdmin()) return;
  listenToErrorReports.unsubscribe = db.collection("errorReports").orderBy("createdAtMs", "desc").limit(100).onSnapshot((snapshot) => {
    errorReports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderErrorReportsPage();
  }, (error) => {
    console.error(error);
    showToast(authErrorMessage(error));
  });
}

function renderErrorReportsPage() {
  if (!isErrorReportsPage()) return;
  const list = $("#errorReportsList");
  const count = $("#errorReportsCount");
  if (!list) return;

  if (!isAdmin()) {
    list.innerHTML = `<p class="muted">Diese Fehlermeldungen sind nur für Admins sichtbar.</p>`;
    if (count) count.textContent = "0";
    return;
  }

  if (count) count.textContent = String(errorReports.length);
  list.innerHTML = errorReports.length ? errorReports.map((report) => `
    <article class="admin-item error-report-card">
      <div class="error-report-head">
        <div>
          <strong>${escapeHtml(report.message || "Fehlermeldung ohne Text")}</strong>
          <p class="muted">${escapeHtml(errorReportDateText(report.createdAt, report.createdAtMs))} | Quelle: ${escapeHtml(report.source || "unbekannt")}</p>
        </div>
        <span class="role-pill">${escapeHtml(report.role || "Nutzer")}</span>
      </div>
      <div class="error-report-meta">
        <p><b>Nutzer:</b> ${escapeHtml(report.name || "Unbekannt")} ${report.email ? `(${escapeHtml(report.email)})` : ""}</p>
        <p><b>Nutzer-ID:</b> ${escapeHtml(report.userId || "nicht gespeichert")}</p>
        <p><b>Seite:</b> ${escapeHtml(report.path || "-")}</p>
        ${report.file ? `<p><b>Datei:</b> ${escapeHtml(report.file)}${report.line ? `:${escapeHtml(report.line)}` : ""}</p>` : ""}
        ${report.stack ? `<details><summary>Technische Details</summary><pre>${escapeHtml(report.stack)}</pre></details>` : ""}
      </div>
      <div class="admin-actions">
        <button type="button" data-error-report-delete="${escapeHtml(report.id)}">Meldung löschen</button>
      </div>
    </article>
  `).join("") : `<p class="muted">Noch keine Fehlermeldungen gespeichert.</p>`;
}

async function deleteErrorReport(reportId) {
  if (!db || !isAdmin() || !reportId) return;
  if (!confirm("Diese Fehlermeldung wirklich löschen?")) return;
  try {
    await db.collection("errorReports").doc(reportId).delete();
    showToast("Fehlermeldung gelöscht.");
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error));
  }
}

// Redundant renderAll removed

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-error-report-delete]");
  if (!target) return;
  deleteErrorReport(target.dataset.errorReportDelete);
});

function isAuthAdminPage() {
  return Boolean($("#authMailSettingsForm"));
}

function defaultAuthTemplates() {
  return {
    passwordReset: {
      subject: "Passwort zurücksetzen",
      body: "Hallo %NAME%,\n\nklicke auf diesen Link, um dein Passwort zurückzusetzen:\n%AUTHCODE%\n\nDer Link ist 14 Minuten gültig.\n\nViele Grüße\nEntfalta"
    },
    emailChange: {
      subject: "E-Mail-Adresse ändern",
      body: "Hallo %NAME%,\n\nbitte bestätige die Änderung deiner E-Mail-Adresse von %EMAIL% zu %NEW_EMAIL%:\n%AUTHCODE%\n\nDer Link ist 14 Minuten gültig.\n\nViele Grüße\nEntfalta"
    },
    emailVerification: {
      subject: "E-Mail-Adresse bestätigen",
      body: "Hallo %NAME%,\n\nbitte bestätige deine E-Mail-Adresse %EMAIL% über diesen Link:\n%AUTHCODE%\n\nDer Link ist 14 Minuten gültig.\n\nViele Grüße\nEntfalta"
    }
  };
}

async function loadAuthMailSettings() {
  const form = $("#authMailSettingsForm");
  if (!form || !db || !isAdmin()) return;
  if (loadAuthMailSettings.loaded) return;
  loadAuthMailSettings.loaded = true;
  const snap = await db.collection("settings").doc("authMail").get();
  const settings = snap.exists ? snap.data() : {};
  const templates = { ...defaultAuthTemplates(), ...(settings.templates || {}) };
  const values = {
    passwordResetSubject: templates.passwordReset.subject,
    passwordResetBody: templates.passwordReset.body,
    emailChangeSubject: templates.emailChange.subject,
    emailChangeBody: templates.emailChange.body,
    emailVerificationSubject: templates.emailVerification.subject,
    emailVerificationBody: templates.emailVerification.body
  };
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
}

async function saveAuthMailSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Auth-Mails einrichten.");
  const form = event.currentTarget;
  const data = new FormData(form);
  await db.collection("settings").doc("authMail").set({
    templates: {
      passwordReset: {
        subject: String(data.get("passwordResetSubject") || "").trim(),
        body: String(data.get("passwordResetBody") || "")
      },
      emailChange: {
        subject: String(data.get("emailChangeSubject") || "").trim(),
        body: String(data.get("emailChangeBody") || "")
      },
      emailVerification: {
        subject: String(data.get("emailVerificationSubject") || "").trim(),
        body: String(data.get("emailVerificationBody") || "")
      }
    },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  showToast("Auth-Mail-Vorlagen gespeichert.");
}

async function sendCustomEmail(event) {
  event.preventDefault();
  if (!isAdmin() || !currentUser) return showToast("Nur Admins können E-Mails senden.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "E-Mail wird gesendet...";
    }
    const idToken = await currentUser.getIdToken();
    const response = await fetch(backendUrl("send-custom-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        to: String(data.get("to") || "").trim(),
        subject: String(data.get("subject") || "").trim(),
        text: String(data.get("text") || "")
      })
    });
    const result = response.headers.get("Content-Type")?.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) throw new Error(result.error || "E-Mail konnte nicht gesendet werden.");
    form.reset();
    showToast("Benutzerdefinierte E-Mail wurde gesendet.");
  } catch (error) {
    showToast(readableErrorText(error) || authErrorMessage(error));
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "E-Mail senden";
    }
  }
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#authMailSettingsForm")?.addEventListener("submit", saveAuthMailSettings);
  $("#customEmailForm")?.addEventListener("submit", sendCustomEmail);

  $("#runAllEmailScenarios")?.addEventListener("click", async () => {
    const email = $("#testEmailRecipient")?.value.trim();
    const resultsBox = $("#emailTestResults");
    if (!email || !email.includes("@")) return showToast("Bitte eine gültige Test-E-Mail angeben.");

    try {
      showToast("E-Mails werden generiert...");
      resultsBox.classList.remove("hidden");
      resultsBox.innerHTML = "<p>Läuft...</p>";
      const idToken = await currentUser.getIdToken();
      const res = await postToBackend("test-all-emails", { email, idToken, origin: window.location.origin });

      if (res.ok) {
        resultsBox.innerHTML = `<h3>Testergebnisse:</h3><ul>${res.results.map(r => `<li>${r.scenario}: ${r.ok ? '✅ Gesendet' : '❌ Fehler (' + (r.error || 'Details in Serverlogs') + ')'}</li>`).join("")}</ul><p>Bitte prüfe jetzt dein Postfach.</p>`;
        showToast("Test-Batch abgeschlossen.");
      } else {
        throw new Error(res.error || "Unbekannter Fehler");
      }
    } catch (error) {
      console.error("Email Test Runner Error:", error);
      showToast("Test-Fehler: " + (error.message || "Netzwerkfehler"));
      resultsBox.innerHTML = `<p style="color:red;"><b>Fehler beim Starten des Tests:</b><br>${error.message || "Die Backend-Funktion konnte nicht erreicht werden. Falls du lokal testest, stelle sicher dass 'netlify dev' läuft."}</p>`;
    }
  });
});

function isEmailConfigPage() {
  return Boolean($("#emailConfigForm"));
}

async function loadEmailConfigSettings() {
  const form = $("#emailConfigForm");
  if (!form || !db || !isAdmin()) return;
  if (loadEmailConfigSettings.loaded) return;
  loadEmailConfigSettings.loaded = true;
  const snap = await db.collection("settings").doc("emailConfig").get();
  let settings = snap.exists ? snap.data() : {};
  if (!snap.exists) {
    const legacySnap = await db.collection("settings").doc("authMail").get().catch(() => null);
    settings = legacySnap?.exists ? legacySnap.data() : {};
  }
  const values = {
    smtpHost: settings.smtpHost || "",
    smtpPort: settings.smtpPort || 587,
    smtpUser: settings.smtpUser || "",
    smtpPassword: settings.smtpPassword || "",
    fromName: settings.fromName || "Entfalta",
    fromEmail: settings.fromEmail || "",
    authFromName: settings.authFromName || "",
    authFromEmail: settings.authFromEmail || "",
    giftVoucherFromName: settings.giftVoucherFromName || "",
    giftVoucherFromEmail: settings.giftVoucherFromEmail || "",
    customFromName: settings.customFromName || "",
    customFromEmail: settings.customFromEmail || "",
    imapHost: settings.imapHost || "",
    imapPort: settings.imapPort || 993,
    imapUser: settings.imapUser || "",
    imapPassword: settings.imapPassword || ""
  };
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
  const smtpSecure = form.elements.namedItem("smtpSecure");
  if (smtpSecure) smtpSecure.checked = Boolean(settings.smtpSecure);

  if (settings.smtpHost) {
      checkSmtpStatus({
          host: settings.smtpHost,
          port: settings.smtpPort,
          user: settings.smtpUser,
          pass: settings.smtpPassword,
          secure: settings.smtpSecure
      });
  }

  const imapSecure = form.elements.namedItem("imapSecure");
  if (imapSecure) imapSecure.checked = settings.imapSecure !== false;
}

async function saveEmailConfigSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können die E-Mail-Konfiguration speichern.");
  const data = new FormData(event.currentTarget);
  const previousSnap = await db.collection("settings").doc("emailConfig").get().catch(() => null);
  const previous = previousSnap?.exists ? previousSnap.data() : {};
  const smtpPassword = String(data.get("smtpPassword") || "");
  const imapPassword = String(data.get("imapPassword") || "");
  const senderEmails = ["fromEmail", "authFromEmail", "giftVoucherFromEmail", "customFromEmail"];
  for (const name of senderEmails) {
    const value = String(data.get(name) || "").trim();
    if (value && !value.includes("@")) return showToast("Bitte gültige Absender-E-Mail-Adressen eintragen.");
  }
  await db.collection("settings").doc("emailConfig").set({
    smtpHost: String(data.get("smtpHost") || "").trim(),
    smtpPort: Number(data.get("smtpPort") || 587),
    smtpSecure: data.get("smtpSecure") === "on",
    smtpUser: String(data.get("smtpUser") || "").trim(),
    smtpPassword: smtpPassword || previous.smtpPassword || "",
    fromName: String(data.get("fromName") || "Entfalta").trim(),
    fromEmail: String(data.get("fromEmail") || "").trim(),
    authFromName: String(data.get("authFromName") || "").trim(),
    authFromEmail: String(data.get("authFromEmail") || "").trim(),
    giftVoucherFromName: String(data.get("giftVoucherFromName") || "").trim(),
    giftVoucherFromEmail: String(data.get("giftVoucherFromEmail") || "").trim(),
    customFromName: String(data.get("customFromName") || "").trim(),
    customFromEmail: String(data.get("customFromEmail") || "").trim(),
    imapHost: String(data.get("imapHost") || "").trim(),
    imapPort: Number(data.get("imapPort") || 993),
    imapSecure: data.get("imapSecure") === "on",
    imapUser: String(data.get("imapUser") || "").trim(),
    imapPassword: imapPassword || previous.imapPassword || "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  showToast("E-Mail-Konfiguration gespeichert.");

  checkSmtpStatus({
      host: data.get("smtpHost"),
      port: data.get("smtpPort"),
      user: data.get("smtpUser"),
      pass: smtpPassword || previous.smtpPassword,
      secure: data.get("smtpSecure") === "on"
  });
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#emailConfigForm")?.addEventListener("submit", saveEmailConfigSettings);
});

function isBackendConfigPage() {
  return Boolean($("#backendConfigForm"));
}

function renderBackendSettings() {
  const form = $("#backendConfigForm");
  const current = $("#backendCurrentUrl");
  if (!form) return;
  if (!isAdmin()) return;
  const value = String(window.BUCHMARKT_BACKEND_BASE_URL || localStorage.getItem(BACKEND_BASE_STORAGE_KEY) || "https://entfalta-back.netlify.app");
  const field = form.elements.namedItem("baseUrl");
  if (field && !field.value) field.value = value;
  if (current) current.textContent = value;
}

async function saveBackendSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können den Backend-Link speichern.");
  const form = event.currentTarget;
  const baseUrl = normalizeBackendBaseUrl(new FormData(form).get("baseUrl"));
  if (!baseUrl) return showToast("Bitte eine gültige Backend-URL eintragen, z.B. https://backend.entfalta.com");
  await db.collection("settings").doc("backend").set({
    baseUrl,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  applyBackendBaseUrl(baseUrl);
  renderBackendSettings();
  showToast("Backend-Link gespeichert.");
}

async function runHealthCheck() {
    try {
        const res = await postToBackend("health-check", {});

        const isOk = (s) => String(s || "").toLowerCase() === "green" || String(s || "").toLowerCase() === "approved";

        // Update Firebase
        const dotFb = $("#dot-firebase");
        const txtFb = $("#text-firebase");
        if (dotFb) dotFb.className = `status-dot ${isOk(res?.firebase?.status) ? "green" : "red"}`;
        if (txtFb) txtFb.textContent = res?.firebase?.message || "APPROVED";

        // Update Stripe
        const dotStripe = $("#dot-stripe");
        const txtStripe = $("#text-stripe");
        if (dotStripe) dotStripe.className = `status-dot ${isOk(res?.stripe?.status) ? "green" : "red"}`;
        if (txtStripe) txtStripe.textContent = res?.stripe?.message || "APPROVED";

        // Update Sendcloud
        const dotSc = $("#dot-sendcloud");
        const txtSc = $("#text-sendcloud");
        if (dotSc) dotSc.className = `status-dot ${isOk(res?.sendcloud?.status) ? "green" : "red"}`;
        if (txtSc) txtSc.textContent = res?.sendcloud?.message || "APPROVED";

        // SMTP Check
        if (db) {
          db.collection("settings").doc("emailConfig").get().then(doc => {
              const dotSmtp = $("#smtpStatusDot") || $("#dot-smtp");
              const txtSmtp = $("#text-smtp");
              if (doc.exists) {
                  const d = doc.data();
                  const hasSmtp = Boolean(d.host && d.pass);
                  if (dotSmtp) dotSmtp.className = "status-dot green";
                  if (txtSmtp) txtSmtp.textContent = hasSmtp ? `SMTP konfiguriert (${d.host})` : "Standard E-Mail-System aktiv (SMTP optional)";
              } else {
                  if (dotSmtp) dotSmtp.className = "status-dot green";
                  if (txtSmtp) txtSmtp.textContent = "Standard E-Mail-System aktiv";
              }
          }).catch(err => {
              const dotSmtp = $("#smtpStatusDot") || $("#dot-smtp");
              const txtSmtp = $("#text-smtp");
              if (dotSmtp) dotSmtp.className = "status-dot green";
              if (txtSmtp) txtSmtp.textContent = "Standard E-Mail-System aktiv";
          });
        }

    } catch (error) {
        console.error("Health Check Error:", error);
        ["firebase", "stripe", "sendcloud"].forEach(service => {
            const txt = $(`#text-${service}`);
            const dot = $(`#dot-${service}`);
            if (txt) txt.textContent = `Fehler: ${error.message}`;
            if (dot) dot.className = "status-dot red";
        });
    }
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#backendConfigForm")?.addEventListener("submit", saveBackendSettings);
});

function isPurchaseConfirmationPage() {
  return Boolean($("#purchaseConfirmationForm"));
}

function defaultPurchaseConfirmationSettings() {
  return {
    recipientEmail: "entfalta@gmail.com",
    subject: "Neue Bestellung %Bestellnr%",
    body: "Neue Bestellung\n\nBestellnr: %Bestellnr%\nName: %Name%\nSumme: %Amount%\n\n%products%",
    customerEnabled: true,
    customerSubject: "Deine Bestellung %Bestellnr% bei Entfalta",
    customerBody: "Hallo %Name%,\n\nvielen Dank für deine Bestellung.\n\nDeine Rechnung findest du hier:\n%InvoiceUrl%\n\nBestellnr: %Bestellnr%\nSumme: %Amount%\n\n%products%\n\nViele Grüße\nDein Entfalta-Team"
  };
}

async function loadPurchaseConfirmationSettings() {
  const form = $("#purchaseConfirmationForm");
  if (!form || !db || !isAdmin()) return;
  if (loadPurchaseConfirmationSettings.loaded) return;
  loadPurchaseConfirmationSettings.loaded = true;
  const snap = await db.collection("settings").doc("purchaseConfirmationMail").get().catch(() => null);
  const settings = { ...defaultPurchaseConfirmationSettings(), ...(snap?.exists ? snap.data() : {}) };
  const enabled = form.elements.namedItem("enabled");
  if (enabled) enabled.checked = settings.enabled !== false;
  ["recipientEmail", "subject", "body", "customerSubject", "customerBody", "smtpHost", "smtpPort", "smtpUser", "smtpPassword", "fromName", "fromEmail"].forEach((name) => {
    const field = form.elements.namedItem(name);
    if (field) field.value = settings[name] || "";
  });
  const secure = form.elements.namedItem("smtpSecure");
  if (secure) secure.checked = Boolean(settings.smtpSecure);
  const custEnabled = form.elements.namedItem("customerEnabled");
  if (custEnabled) custEnabled.checked = settings.customerEnabled !== false;
}

async function savePurchaseConfirmationSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Kaufbestätigungen speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const previousSnap = await db.collection("settings").doc("purchaseConfirmationMail").get().catch(() => null);
  const previous = previousSnap?.exists ? previousSnap.data() : {};
  const smtpPassword = String(data.get("smtpPassword") || "");
  await db.collection("settings").doc("purchaseConfirmationMail").set({
    enabled: data.get("enabled") === "on",
    recipientEmail: String(data.get("recipientEmail") || "entfalta@gmail.com").trim(),
    subject: String(data.get("subject") || "").trim(),
    body: String(data.get("body") || ""),
    customerEnabled: data.get("customerEnabled") === "on",
    customerSubject: String(data.get("customerSubject") || "").trim(),
    customerBody: String(data.get("customerBody") || ""),
    smtpHost: String(data.get("smtpHost") || "").trim(),
    smtpPort: Number(data.get("smtpPort") || 587),
    smtpSecure: data.get("smtpSecure") === "on",
    smtpUser: String(data.get("smtpUser") || "").trim(),
    smtpPassword: smtpPassword || previous.smtpPassword || "",
    fromName: String(data.get("fromName") || "").trim(),
    fromEmail: String(data.get("fromEmail") || "").trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  showToast("Kaufbestätigung gespeichert.");
}

function generateOrderNumber() {
  return `BE-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function sendPurchaseConfirmationMail(checkoutData) {
  if (!checkoutData?.cart?.length && checkoutData?.type !== "giftVoucher") return;
  try {
    await fetch(backendUrl("send-purchase-confirmation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout: checkoutData })
    });
  } catch (error) {
    console.warn("Kaufbestätigung konnte nicht gesendet werden.", error);
  }
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#purchaseConfirmationForm")?.addEventListener("submit", savePurchaseConfirmationSettings);
});

function isGiftVoucherPage() {
  return Boolean($("#giftVoucherForm"));
}

function isGiftVoucherAdminPage() {
  return Boolean($("#giftVoucherAdminForm"));
}

function defaultGiftVoucherSettings() {
  return {
    subject: "Dein Entfalta-Gutschein %CODE%",
    body: "Hallo %NAME%,\n\nvielen Dank für den Gutscheinkauf.\n\nGutscheincode: %CODE%\nWert: %AMOUNT%\n\nViele Grüße\nEntfalta"
  };
}

const GIFT_VOUCHER_VALIDITY_MS = 3 * 365 * 24 * 60 * 60 * 1000;

function giftVoucherCreatedMs(voucher) {
  return Number(voucher?.createdAtMs || timestampToMs(voucher?.createdAt) || 0);
}

function giftVoucherEmptyMs(voucher) {
  return Number(voucher?.emptiedAtMs || timestampToMs(voucher?.emptiedAt) || timestampToMs(voucher?.lastRedeemedAt) || 0);
}

function giftVoucherExpired(voucher) {
  const created = giftVoucherCreatedMs(voucher);
  return Boolean(created && Date.now() - created > GIFT_VOUCHER_VALIDITY_MS);
}

function giftVoucherStatusText(voucher) {
  if (giftVoucherExpired(voucher)) return "Abgelaufen";
  const remaining = Number(voucher?.remainingAmount ?? voucher?.amount ?? 0);
  if (remaining <= 0 || voucher?.status === "used") return "Leer";
  if (voucher?.status && voucher.status !== "active") return voucher.status;
  return "Aktiv";
}

function defaultGiftVoucherTemplates() {
  return [5, 10, 20, 50, 100].map((amount) => ({
    id: `default-${amount}`,
    label: `${amount.toFixed(2)} EUR`,
    amount,
    active: true
  }));
}

function normalizeGiftVoucherTemplates(templates) {
  const source = Array.isArray(templates) ? templates : defaultGiftVoucherTemplates();
  return source
    .map((template) => {
      const amount = Number(template.amount || 0);
      return {
        id: String(template.id || newId()),
        label: String(template.label || `${amount.toFixed(2)} EUR`).trim(),
        amount,
        active: template.active !== false,
        createdAtMs: Number(template.createdAtMs || 0)
      };
    })
    .filter((template) => template.amount >= 2.5 && template.amount <= 500)
    .sort((a, b) => a.amount - b.amount || a.label.localeCompare(b.label, "de"));
}

function giftVoucherCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `GS-${part()}-${part()}`;
}

async function generateUniqueGiftVoucherCode() {
  if (!db) return giftVoucherCode();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = giftVoucherCode();
    const snap = await db.collection("giftVouchers").doc(code).get().catch(() => null);
    if (!snap?.exists) return code;
  }
  return `GS-${Date.now().toString(36).toUpperCase()}`;
}

async function loadGiftVoucherSettings() {
  const form = $("#giftVoucherAdminForm");
  if (!form || !db || !isAdmin()) return;
  if (loadGiftVoucherSettings.loaded) return;
  loadGiftVoucherSettings.loaded = true;
  const snap = await db.collection("settings").doc("giftVoucherMail").get();
  const settings = { ...defaultGiftVoucherSettings(), ...(snap.exists ? snap.data() : {}) };
  form.elements.namedItem("subject").value = settings.subject || "";
  form.elements.namedItem("body").value = settings.body || "";
}

async function loadGiftVoucherTemplates() {
  if (!isGiftVoucherPage() && !isGiftVoucherAdminPage()) return;
  let templates = defaultGiftVoucherTemplates();
  if (db) {
    const snap = await db.collection("settings").doc("giftVoucherTemplates").get().catch(() => null);
    if (snap?.exists) templates = normalizeGiftVoucherTemplates(snap.data()?.templates);
  }
  renderGiftVoucherTemplates(templates);
}

async function checkGiftVoucherBalance(event) {
  event.preventDefault();
  const resultBox = $("#giftVoucherCheckResult");
  const code = String(new FormData(event.currentTarget).get("code") || "").trim().toUpperCase();
  if (!code) return showToast("Bitte einen Gutscheincode eingeben.");
  if (!db) return showToast("Firebase ist noch nicht bereit.");
  const snap = await db.collection("giftVouchers").doc(code).get().catch(() => null);
  if (!snap?.exists) {
    if (resultBox) resultBox.innerHTML = `<p class="muted">Gutschein wurde nicht gefunden.</p>`;
    return;
  }
  const voucher = snap.data() || {};
  const amount = Number(voucher.amount || 0);
  const remaining = Math.max(0, Number(voucher.remainingAmount ?? amount));
  const used = Math.max(0, amount - remaining);
  const status = giftVoucherStatusText(voucher);
  if (resultBox) {
    resultBox.innerHTML = `
      <article class="admin-item">
        <div>
          <strong>${escapeHtml(code)} | ${escapeHtml(status)}</strong>
          <p>Ursprünglich: ${amount.toFixed(2)} EUR</p>
          <p>Eingelöst: ${used.toFixed(2)} EUR</p>
          <p>Aktuell verfügbar: ${remaining.toFixed(2)} EUR</p>
        </div>
      </article>
    `;
  }
}

function renderGiftVoucherTemplates(templates) {
  const normalized = normalizeGiftVoucherTemplates(templates);
  const choices = $("#giftVoucherTemplateChoices");
  if (choices) {
    const activeTemplates = normalized.filter((template) => template.active);
    choices.innerHTML = activeTemplates.length ? activeTemplates.map((template) => `
      <button type="button" data-gift-template-amount="${template.amount}">
        <strong>${Number(template.amount).toFixed(2)} EUR</strong>
        <span>${escapeHtml(template.label || "Gutschein")}</span>
      </button>
    `).join("") : `<p class="muted">Du kannst unten einen freien Betrag eingeben.</p>`;
  }

  const list = $("#giftVoucherTemplateList");
  if (!list || !isAdmin()) return;
  list.innerHTML = normalized.length ? normalized.map((template) => `
    <article class="admin-item gift-voucher-template-card">
      <div>
        <strong>${Number(template.amount).toFixed(2)} EUR</strong>
        <p>${escapeHtml(template.label || "Gutschein")} ${template.active ? "" : "| ausgeblendet"}</p>
      </div>
      <div class="admin-actions">
        <button type="button" data-gift-template-edit="${escapeHtml(template.id)}">Bearbeiten</button>
        <button type="button" data-gift-template-toggle="${escapeHtml(template.id)}">${template.active ? "Ausblenden" : "Anzeigen"}</button>
        <button type="button" data-gift-template-delete="${escapeHtml(template.id)}">Löschen</button>
      </div>
    </article>
  `).join("") : `<p class="muted">Noch keine Gutschein-Vorlagen gespeichert.</p>`;
}

async function saveGiftVoucherTemplates(templates) {
  if (!db || !isAdmin()) return;
  const normalized = normalizeGiftVoucherTemplates(templates);
  await db.collection("settings").doc("giftVoucherTemplates").set({
    templates: normalized,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  renderGiftVoucherTemplates(normalized);
}

function isGiftVoucherCodeListPage() {
  return Boolean($("#giftVoucherCodeList"));
}

async function loadGiftVoucherCleanupSettings() {
  const form = $("#giftVoucherCleanupForm");
  if (!form || !db || !isAdmin()) return;
  const snap = await db.collection("settings").doc("giftVoucherCleanup").get().catch(() => null);
  const days = Number(snap?.exists ? snap.data()?.emptyDeleteDays : 30);
  form.elements.namedItem("days").value = days || 30;
  await cleanupEmptyGiftVouchers(days || 30);
}

async function saveGiftVoucherCleanupSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können die Löschfrist speichern.");
  const days = Math.max(1, Math.min(1095, Number(new FormData(event.currentTarget).get("days") || 30)));
  await db.collection("settings").doc("giftVoucherCleanup").set({
    emptyDeleteDays: days,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  await cleanupEmptyGiftVouchers(days);
  showToast("Löschfrist gespeichert.");
}

async function cleanupEmptyGiftVouchers(days = 30) {
  if (!db || !isAdmin()) return;
  const maxAge = Number(days || 30) * 24 * 60 * 60 * 1000;
  const snapshot = await db.collection("giftVouchers").limit(300).get().catch(() => null);
  if (!snapshot) return;
  const batch = db.batch();
  let count = 0;
  snapshot.docs.forEach((doc) => {
    const voucher = doc.data() || {};
    const remaining = Number(voucher.remainingAmount ?? voucher.amount ?? 0);
    const emptiedAt = giftVoucherEmptyMs(voucher);
    if (voucher.favorite || remaining > 0 || !emptiedAt || Date.now() - emptiedAt < maxAge) return;
    batch.delete(doc.ref);
    count += 1;
  });
  if (count) await batch.commit();
}

function renderGiftVoucherCodeList(vouchers) {
  const list = $("#giftVoucherCodeList");
  if (!list) return;
  const filterLabels = { all: "Alle", active: "Aktiv", empty: "Leer" };
  const status = $("#giftVoucherCodeFilterStatus");
  if (status) status.textContent = `Aktuelle Kategorie: ${filterLabels[giftVoucherCodeFilterMode] || "Alle"}`;
  document.querySelectorAll("[data-gift-voucher-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.giftVoucherFilter === giftVoucherCodeFilterMode);
  });
  const visibleVouchers = vouchers.filter((voucher) => {
    const amount = Number(voucher.amount || 0);
    const remaining = Math.max(0, Number(voucher.remainingAmount ?? amount));
    const empty = remaining <= 0 || voucher.status === "used" || voucher.status === "empty";
    if (giftVoucherCodeFilterMode === "active") return !empty && !giftVoucherExpired(voucher);
    if (giftVoucherCodeFilterMode === "empty") return empty;
    return true;
  });
  list.innerHTML = visibleVouchers.length ? visibleVouchers.map((voucher) => {
    const amount = Number(voucher.amount || 0);
    const remaining = Math.max(0, Number(voucher.remainingAmount ?? amount));
    const used = Math.max(0, amount - remaining);
    const who = voucher.buyerEmail || voucher.purchaserEmail || voucher.recipientEmail || "Unbekannt";
    const created = giftVoucherCreatedMs(voucher);
    return `
      <article class="admin-item">
        <div>
          <strong>${escapeHtml(voucher.id)} ${voucher.favorite ? "| Favorit" : ""}</strong>
          <p>Status: ${escapeHtml(giftVoucherStatusText(voucher))}</p>
          <p>Ursprünglich: ${amount.toFixed(2)} EUR | Verfügbar: ${remaining.toFixed(2)} EUR | Genutzt: ${used.toFixed(2)} EUR</p>
          <p>Gekauft/erstellt: ${created ? new Date(created).toLocaleString("de-DE") : "Unbekannt"} | Von: ${escapeHtml(who)}</p>
          <p>Quelle: ${escapeHtml(voucher.source || "unbekannt")}</p>
        </div>
        <div class="admin-actions">
          <button type="button" data-gift-code-fav="${escapeHtml(voucher.id)}">${voucher.favorite ? "Entfavorisieren" : "Favorit"}</button>
          <button type="button" data-gift-code-toggle="${escapeHtml(voucher.id)}">${voucher.status === 'disabled' ? 'Entsperren' : 'Sperren'}</button>
          <button type="button" data-gift-code-edit-balance="${escapeHtml(voucher.id)}">Guthaben</button>
          <button type="button" data-gift-code-delete="${escapeHtml(voucher.id)}">Löschen</button>
        </div>
      </article>
    `;
  }).join("") : `<p class="muted">Keine Gutschein-Codes gefunden.</p>`;
}

function listenGiftVoucherCodes() {
  if (!isGiftVoucherCodeListPage() || !db || !isAdmin()) return;
  if (listenGiftVoucherCodes.unsubscribe) return;
  loadGiftVoucherCleanupSettings();
  listenGiftVoucherCodes.unsubscribe = db.collection("giftVouchers").limit(300).onSnapshot((snapshot) => {
    const vouchers = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => giftVoucherCreatedMs(b) - giftVoucherCreatedMs(a));
    listenGiftVoucherCodes.latest = vouchers;
    renderGiftVoucherCodeList(vouchers);
  });
}

async function saveGiftVoucherSettings(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Gutscheinvorlagen speichern.");
  const data = new FormData(event.currentTarget);
  await db.collection("settings").doc("giftVoucherMail").set({
    subject: String(data.get("subject") || "").trim(),
    body: String(data.get("body") || ""),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || null
  }, { merge: true });
  showToast("Gutscheinvorlage gespeichert.");
}

async function submitGiftVoucherTemplate(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Gutschein-Vorlagen speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount") || 0);
  if (amount < 2.5 || amount > 500) return showToast("Vorlagenbetrag muss zwischen 2,50 EUR und 500 EUR liegen.");
  const snap = await db.collection("settings").doc("giftVoucherTemplates").get().catch(() => null);
  const templates = normalizeGiftVoucherTemplates(snap?.exists ? snap.data()?.templates : null);
  const id = String(data.get("id") || "").trim() || newId();
  const nextTemplate = {
    id,
    label: String(data.get("label") || `${amount.toFixed(2)} EUR`).trim(),
    amount,
    active: data.get("active") === "on",
    createdAtMs: templates.find((template) => template.id === id)?.createdAtMs || Date.now()
  };
  const index = templates.findIndex((template) => template.id === id);
  if (index >= 0) templates[index] = nextTemplate;
  else templates.push(nextTemplate);
  await saveGiftVoucherTemplates(templates);
  form.reset();
  form.elements.namedItem("id").value = "";
  form.elements.namedItem("active").checked = true;
  showToast("Gutschein-Vorlage gespeichert.");
}

async function handleGiftVoucherTemplateAction(target) {
  if (!db || !isAdmin()) return;
  const snap = await db.collection("settings").doc("giftVoucherTemplates").get().catch(() => null);
  const templates = normalizeGiftVoucherTemplates(snap?.exists ? snap.data()?.templates : null);
  const editId = target.dataset.giftTemplateEdit;
  const toggleId = target.dataset.giftTemplateToggle;
  const deleteId = target.dataset.giftTemplateDelete;
  const id = editId || toggleId || deleteId;
  const template = templates.find((entry) => entry.id === id);
  if (!template) return showToast("Vorlage nicht gefunden.");

  if (editId) {
    const form = $("#giftVoucherTemplateForm");
    if (!form) return;
    form.elements.namedItem("id").value = template.id;
    form.elements.namedItem("label").value = template.label || "";
    form.elements.namedItem("amount").value = template.amount;
    form.elements.namedItem("active").checked = template.active;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (toggleId) {
    template.active = !template.active;
    await saveGiftVoucherTemplates(templates);
    showToast(template.active ? "Vorlage wird angezeigt." : "Vorlage wurde ausgeblendet.");
    return;
  }

  if (deleteId) {
    if (!window.confirm("Diese Gutschein-Vorlage wirklich löschen?")) return;
    await saveGiftVoucherTemplates(templates.filter((entry) => entry.id !== deleteId));
    showToast("Gutschein-Vorlage gelöscht.");
  }
}

async function createManualGiftVoucher(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Gutscheine erstellen.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount") || 0);
  if (amount < 2.5 || amount > 500) return showToast("Gutscheinbetrag muss zwischen 2,50 EUR und 500 EUR liegen.");
  const code = await generateUniqueGiftVoucherCode();
  await db.collection("giftVouchers").doc(code).set({
    code,
    amount,
    remainingAmount: amount,
    purchaserEmail: currentUser?.email || "",
    recipientName: String(data.get("recipientName") || "").trim(),
    recipientEmail: String(data.get("recipientEmail") || "").trim(),
    source: "admin",
    status: "active",
    used: false,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + GIFT_VOUCHER_VALIDITY_MS,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser?.uid || null
  });
  const recipientEmail = String(data.get("recipientEmail") || "").trim();
  let mailNotice = recipientEmail ? "" : " Keine E-Mail eingetragen, deshalb wurde nur der Code erstellt.";
  if (recipientEmail) {
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(backendUrl("send-gift-voucher"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, force: true, idToken })
      });
      const result = response.headers.get("Content-Type")?.includes("application/json")
        ? await response.json()
        : { error: await response.text() };
      if (!response.ok) throw new Error(result.error || "Gutscheinmail konnte nicht gesendet werden.");
      mailNotice = " Mail wurde gesendet.";
    } catch (error) {
      mailNotice = ` Mail konnte nicht gesendet werden: ${readableErrorText(error) || error.message || "Unbekannter Fehler"}`;
    }
  }
  form.reset();
  showToast(`Gutschein erstellt: ${code}.${mailNotice}`);
}

async function startGiftVoucherCheckout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount") || 0);
  const recipientMode = String(data.get("recipientMode") || "self");
  const buyerName = String(data.get("buyerName") || "").trim();
  const buyerEmail = String(data.get("buyerEmail") || "").trim();
  const isSelfRecipient = recipientMode !== "other";
  const recipientEmail = isSelfRecipient ? buyerEmail : String(data.get("recipientEmail") || "").trim();
  const recipientName = isSelfRecipient ? buyerName : String(data.get("recipientName") || "").trim();
  const deliveryMethod = String(data.get("deliveryMethod") || "email");
  const postalTarget = String(data.get("postalTarget") || "billing");
  const buyerStreet = String(data.get("buyerStreet") || "").trim();
  const buyerZip = String(data.get("buyerZip") || "").trim();
  const buyerCity = String(data.get("buyerCity") || "").trim();
  const recipientStreet = String(data.get("recipientStreet") || "").trim();
  const recipientZip = String(data.get("recipientZip") || "").trim();
  const recipientCity = String(data.get("recipientCity") || "").trim();
  if (amount < 2.5 || amount > 500) return showToast("Bitte wähle einen Betrag zwischen 2,50 EUR und 500 EUR.");
  if (!buyerEmail.includes("@")) return showToast("Bitte deine E-Mail eintragen.");
  if (deliveryMethod === "email" && !isSelfRecipient && !recipientEmail.includes("@")) return showToast("Bitte eine gültige Empfänger-E-Mail eintragen.");
  const useDifferentShipping = postalTarget === "recipient";
  const postalStreet = useDifferentShipping ? recipientStreet : buyerStreet;
  const postalZip = useDifferentShipping ? recipientZip : buyerZip;
  const postalCity = useDifferentShipping ? recipientCity : buyerCity;
  const postalName = useDifferentShipping ? recipientName : buyerName;
  if (deliveryMethod === "post") {
    if (!postalStreet || !postalZip || !postalCity) return showToast("Bitte die vollständige Postadresse eintragen.");
    if (!streetHasHouseNumber(postalStreet)) return showToast("Bitte die Adresse mit Hausnummer eintragen.");
  }
  const checkoutData = {
    type: "giftVoucher",
    cart: [{
      bookId: "gift-voucher",
      title: `Entfalta Gutschein ${amount.toFixed(2)} EUR`,
      quantity: 1,
      price: amount
    }],
    fees: [],
    discounts: [],
    discountTotal: 0,
    total: amount,
    customer: {
      name: deliveryMethod === "post" ? (postalName || "Gutschein-Kunde") : (buyerName || recipientName || "Gutschein-Kunde"),
      email: buyerEmail,
      userId: currentUser?.uid || null,
      street: deliveryMethod === "post" ? postalStreet : "",
      zip: deliveryMethod === "post" ? postalZip : "",
      city: deliveryMethod === "post" ? postalCity : "",
      country: "DEU"
    },
    giftVoucher: {
      amount,
      recipientMode,
      deliveryMethod,
      postalTarget,
      recipientEmail,
      recipientName,
      recipientStreet,
      recipientZip,
      recipientCity,
      buyerName,
      buyerEmail,
      buyerStreet,
      buyerZip,
      buyerCity,
      postalAddress: deliveryMethod === "post" ? {
        name: useDifferentShipping ? (recipientName || "Empfänger") : (buyerName || "Käufer"),
        street: postalStreet,
        zip: postalZip,
        city: postalCity,
        target: postalTarget,
        sameAsBilling: !useDifferentShipping
      } : null
    },
    shippingCarrier: deliveryMethod === "post" ? "" : "",
    shippingMethod: deliveryMethod === "post" ? null : null,
    createdAt: Date.now()
  };
  writeCheckoutData(checkoutData);
  try {
    await startStripeCheckout(checkoutData);
  } catch (error) {
    showToast(error?.message || "Stripe Checkout konnte nicht gestartet werden.");
  }
}

async function startSupportContributionCheckout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount") || 0);
  const contributorName = String(data.get("contributorName") || "").trim() || "Anonyme Unterstützung";
  const email = String(data.get("email") || "").trim();

  if (amount < 0.50) return showToast("Bitte wähle einen Betrag ab 0,50 EUR.");
  if (!email.includes("@")) return showToast("Bitte deine E-Mail eintragen.");

  const checkoutData = {
    type: "supportContribution",
    cart: [{
      bookId: "support-contribution",
      title: `Unterstützung für Entfalta`,
      quantity: 1,
      price: amount
    }],
    fees: [],
    discounts: [],
    discountTotal: 0,
    total: amount,
    customer: {
      name: contributorName,
      email: email,
      userId: currentUser?.uid || null
    },
    contributorName: contributorName,
    createdAt: Date.now()
  };
  writeCheckoutData(checkoutData);
  try {
    await startStripeCheckout(checkoutData);
  } catch (error) {
    showToast(error?.message || "Stripe Checkout konnte nicht gestartet werden.");
  }
}

function syncGiftVoucherDeliveryFields() {
  const form = $("#giftVoucherForm");
  if (!form) return;
  const delivery = String(formField(form, "deliveryMethod")?.value || "email");
  const target = String(formField(form, "postalTarget")?.value || "billing");
  const recipientMode = String(formField(form, "recipientMode")?.value || "self");
  const otherRecipient = recipientMode === "other";
  const postBox = form.querySelector(".gift-voucher-post-fields");
  const postalTarget = formField(form, "postalTarget")?.closest("label");
  const recipientNameField = formField(form, "recipientName");
  const recipientEmailField = formField(form, "recipientEmail");
  if (recipientNameField) recipientNameField.classList.toggle("hidden", !otherRecipient);
  if (recipientEmailField) recipientEmailField.classList.toggle("hidden", !otherRecipient || delivery !== "email");
  if (postBox) postBox.classList.toggle("hidden", delivery !== "post");
  if (postalTarget) postalTarget.classList.toggle("hidden", delivery !== "post");
  ["buyerStreet", "buyerCity"].forEach((name) => {
    const field = formField(form, name);
    if (field) field.classList.toggle("hidden", delivery !== "post");
  });
  ["recipientStreet", "recipientCity"].forEach((name) => {
    const field = formField(form, name);
    if (field) field.classList.toggle("hidden", delivery !== "post" || target !== "recipient");
  });
}

async function createGiftVoucherFromCheckout(checkout, sessionId) {
  const existing = await db.collection("giftVouchers").where("stripeSessionId", "==", sessionId).limit(1).get();
  if (!existing.empty) return { id: existing.docs[0].id, ...existing.docs[0].data(), alreadyCreated: true };
  const data = checkout.giftVoucher || {};
  const amount = Number(data.amount || checkout.total || 0);
  if (amount < 2.5 || amount > 500) throw new Error("Ungültiger Gutscheinbetrag.");
  const code = await generateUniqueGiftVoucherCode();
  const voucher = {
    code,
    amount,
    remainingAmount: amount,
    recipientEmail: data.recipientEmail || checkout.customer?.email || "",
    recipientName: data.recipientName || "",
    recipientStreet: data.recipientStreet || "",
    recipientZip: data.recipientZip || "",
    recipientCity: data.recipientCity || "",
    buyerName: data.buyerName || checkout.customer?.name || "",
    buyerEmail: data.buyerEmail || checkout.customer?.email || "",
    buyerStreet: data.buyerStreet || "",
    buyerZip: data.buyerZip || "",
    buyerCity: data.buyerCity || "",
    recipientMode: data.recipientMode || "self",
    deliveryMethod: data.deliveryMethod || "email",
    postalTarget: data.postalTarget || "",
    postalAddress: data.postalAddress || null,
    purchaserUserId: currentUser?.uid || null,
    stripeSessionId: sessionId,
    stripeInvoiceUrl: checkout.stripeInvoiceUrl || "",
    source: "stripe",
    status: "active",
    used: false,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + GIFT_VOUCHER_VALIDITY_MS,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection("giftVouchers").doc(code).set(voucher);
  const response = await fetch(backendUrl("send-gift-voucher"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const result = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) throw new Error(result.error || "Gutscheinmail konnte nicht gesendet werden.");
  return voucher;
}

const checkCartCodeBeforeGiftVouchers = checkCartCode;
checkCartCode = async function checkCartCode(kind, options = {}) {
  const normalizedKind = kind === "voucher" ? "voucher" : "discount";
  if (normalizedKind !== "voucher") return checkCartCodeBeforeGiftVouchers(kind, options);
  const form = $("#checkoutForm");
  const field = form ? formField(form, "voucherCode") : null;
  const code = String(field?.value || "").trim().toUpperCase();
  if (!code) {
    appliedDiscounts.voucher = null;
    renderCart();
    if (!options.silent) showToast("Bitte gib einen Gutscheincode ein.");
    return false;
  }
  if (!db) {
    if (!options.silent) showToast("Firebase ist noch nicht bereit.");
    return false;
  }
  try {
    const snap = await db.collection("giftVouchers").doc(code).get();
    const voucher = snap.exists ? snap.data() : null;
    const remaining = Number(voucher?.remainingAmount ?? voucher?.amount ?? 0);
    if (giftVoucherExpired(voucher)) {
      appliedDiscounts.voucher = null;
      renderCart();
      if (!options.silent) showToast("Dieser Gutschein ist abgelaufen.");
      return false;
    }
    if (!voucher || voucher.status !== "active" || remaining <= 0) {
      appliedDiscounts.voucher = null;
      renderCart();
      if (!options.silent) showToast("Gutscheincode ist ungültig oder leer.");
      return false;
    }
    appliedDiscounts.voucher = {
      id: code,
      code,
      kind: "voucher",
      valueType: "fixed",
      value: remaining,
      remainingAmount: remaining,
      giftVoucher: true
    };
    if (field) field.value = code;
    renderCart();
    if (!options.silent) showToast(`Gutschein angewendet: ${remaining.toFixed(2)} EUR verfügbar.`);
    return true;
  } catch (error) {
    console.error(error);
    if (!options.silent) showToast("Gutschein konnte nicht geprüft werden.");
    return false;
  }
};

const discountSummaryBeforeGiftVouchers = discountSummary;
discountSummary = function discountSummary(items = cart) {
  const summary = discountSummaryBeforeGiftVouchers(items);
  const voucher = appliedDiscounts.voucher;
  if (!voucher?.giftVoucher) return summary;
  const available = Number(voucher.remainingAmount ?? voucher.value ?? 0);
  const amount = Math.min(Math.max(0, summary.total), Math.max(0, available));
  if (amount <= 0) return summary;
  const detail = {
    discount: {
      id: voucher.id || voucher.code,
      code: voucher.code,
      kind: "voucher",
      valueType: "fixed",
      value: available,
      giftVoucher: true
    },
    amount
  };
  return {
    ...summary,
    discountTotal: Number(summary.discountTotal || 0) + amount,
    total: Math.max(0, Number(summary.total || 0) - amount),
    discounts: [...(summary.discounts || []), detail.discount],
    discountDetails: [...(summary.discountDetails || []), detail]
  };
};

async function redeemGiftVouchersFromCheckout(checkout) {
  const giftVouchers = (checkout.discounts || []).filter((discount) => discount.kind === "voucher" && discount.giftVoucher);
  if (!giftVouchers.length || !checkout.stripeSessionId) return;
  await Promise.all(giftVouchers.map(async (discount) => {
    const response = await fetch(backendUrl("redeem-gift-voucher"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: discount.code,
        amount: Number(discount.amount || 0),
        sessionId: checkout.stripeSessionId,
        expectedTotal: Number(checkout.total || 0),
        customerEmail: checkout.customer?.email || "",
        customerName: checkout.customer?.name || ""
      })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Gutschein konnte nicht eingelöst werden.");
    }
  }));
}

const createOrderFromCheckoutBeforeGiftVouchers = createOrderFromCheckout;
createOrderFromCheckout = async function createOrderFromCheckout(checkout) {
  const orderItems = await createOrderFromCheckoutBeforeGiftVouchers(checkout);
  await redeemGiftVouchersFromCheckout(checkout);
  return orderItems;
};

const completeStripeCheckoutReturnBeforeGiftVouchers = completeStripeCheckoutReturn;
completeStripeCheckoutReturn = async function completeStripeCheckoutReturn() {
  const status = $("#stripeSuccessStatus");
  if (!status) return;
  const params = new URLSearchParams(window.location.search);
  const checkoutData = readCheckoutData(null);
  const sessionId = params.get("session_id") || "";
  if (params.has("checkout") && checkoutData?.type === "supportContribution") {
    if (!sessionId) {
      status.textContent = "Keine Zahlungsbestätigung von Stripe gefunden.";
      return;
    }
    if (!authReady) {
      status.textContent = "Zahlung wird geprüft ...";
      window.setTimeout(completeStripeCheckoutReturn, 150);
      return;
    }
    if (stripeReturnInProgress) return;
    stripeReturnInProgress = true;
    try {
      status.textContent = "Zahlung wird geprüft...";
      const paid = await verifyStripeCheckoutSession(sessionId, checkoutData.total);
      if (!paid) {
        status.textContent = "Die Zahlung wurde noch nicht als erfolgreich bestätigt.";
        return;
      }
      status.textContent = "Unterstützung wird gespeichert...";
      const contribution = {
        name: checkoutData.contributorName || "Anonyme Unterstützung",
        amount: checkoutData.total,
        email: checkoutData.customer?.email || "",
        stripeSessionId: sessionId,
        createdAtMs: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection("supportContributions").add(contribution);
      clearCheckoutData();
      status.textContent = "Vielen Dank für deine Unterstützung! Dein Beitrag wurde erfolgreich empfangen.";
    } catch (error) {
      console.error(error);
      status.textContent = "Zahlung erfolgreich, aber Beitrag konnte nicht gespeichert werden. Bitte kontaktiere den Support.";
    } finally {
      stripeReturnInProgress = false;
    }
    return;
  }

  if (params.has("checkout") && checkoutData?.type === "giftVoucher") {
    if (!sessionId) {
      status.textContent = "Keine Zahlungsbestätigung von Stripe gefunden.";
      return;
    }
    if (!authReady) {
      status.textContent = "Zahlung wird geprüft ...";
      window.setTimeout(completeStripeCheckoutReturn, 150);
      return;
    }
    if (stripeReturnInProgress) return;
    stripeReturnInProgress = true;
    try {
      status.textContent = "Gutschein-Zahlung wird geprüft...";
      const paid = await verifyStripeCheckoutSession(sessionId, checkoutData.total);
      if (!paid) {
        status.textContent = "Die Zahlung wurde noch nicht als erfolgreich bestätigt.";
        return;
      }
      status.textContent = "Gutschein wird erstellt...";
      checkoutData.orderNumber = checkoutData.orderNumber || generateOrderNumber();
      if (paid.stripeInvoiceUrl) checkoutData.stripeInvoiceUrl = paid.stripeInvoiceUrl;
      const voucher = await createGiftVoucherFromCheckout(checkoutData, sessionId);
      await sendPurchaseConfirmationMail(checkoutData);
      clearCheckoutData();
      status.textContent = "Danke. Der Gutschein wurde erstellt und per E-Mail verschickt (bitte auch im Spam-Ordner nachsehen).";
    if (checkoutData.stripeInvoiceUrl) {
      status.innerHTML += `<br><br><a href="${escapeHtml(checkoutData.stripeInvoiceUrl)}" target="_blank" rel="noopener" class="secondary-link" style="text-decoration: underline;">Rechnung jetzt ansehen</a>`;
    }
    } catch (error) {
      console.error(error);
      status.textContent = "Zahlung erfolgreich, aber Gutschein konnte nicht erstellt werden. Bitte kontaktiere den Support.";
    } finally {
      stripeReturnInProgress = false;
    }
    return;
  }
  return completeStripeCheckoutReturnBeforeGiftVouchers();
};

function ensureGiftVoucherFooterLink() {
  document.querySelectorAll(".site-footer").forEach((footer) => {
    const allLinks = Array.from(footer.querySelectorAll('a'));

    // Check for existing links by href or text
    const hasGutschein = allLinks.some(a => a.href.endsWith("gutschein.html") || a.textContent.trim() === "Gutscheine");
    const hasUnterstuetzung = allLinks.some(a => a.href.includes("unterstützung.html") || a.textContent.trim() === "Unterstützung");

    // Clean up duplicates if any
    const gutscheinLinks = allLinks.filter(a => a.href.endsWith("gutschein.html") || a.textContent.trim() === "Gutscheine");
    if (gutscheinLinks.length > 1) gutscheinLinks.slice(1).forEach(l => l.remove());

    const supportLinks = allLinks.filter(a => a.href.includes("unterstützung.html") || a.textContent.trim() === "Unterstützung");
    if (supportLinks.length > 1) supportLinks.slice(1).forEach(l => l.remove());

    if (!hasGutschein) {
      const link = document.createElement("a");
      link.href = pageHref("gutschein.html");
      link.textContent = "Gutscheine";
      footer.appendChild(link);
    }

    if (!hasUnterstuetzung) {
      const supportLink = document.createElement("a");
      supportLink.href = pageHref("unterstützung.html");
      supportLink.textContent = "Unterstützung";
      footer.appendChild(supportLink);
    }
  });
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  ensureGiftVoucherFooterLink();
  loadGiftVoucherTemplates();
  $("#giftVoucherForm")?.addEventListener("submit", startGiftVoucherCheckout);
  $("#supportContributionForm")?.addEventListener("submit", startSupportContributionCheckout);
  formField($("#giftVoucherForm") || document.createElement("form"), "recipientMode")?.addEventListener("change", syncGiftVoucherDeliveryFields);
  formField($("#giftVoucherForm") || document.createElement("form"), "deliveryMethod")?.addEventListener("change", syncGiftVoucherDeliveryFields);
  formField($("#giftVoucherForm") || document.createElement("form"), "postalTarget")?.addEventListener("change", syncGiftVoucherDeliveryFields);
  syncGiftVoucherDeliveryFields();
  $("#giftVoucherCheckerForm")?.addEventListener("submit", checkGiftVoucherBalance);
  $("#giftVoucherAdminForm")?.addEventListener("submit", saveGiftVoucherSettings);
  $("#giftVoucherTemplateForm")?.addEventListener("submit", submitGiftVoucherTemplate);
  $("#giftVoucherCleanupForm")?.addEventListener("submit", saveGiftVoucherCleanupSettings);
  $("#manualGiftVoucherForm")?.addEventListener("submit", createManualGiftVoucher);
  document.addEventListener("click", async (event) => {
    const amountButton = event.target.closest("[data-gift-template-amount]");
    if (amountButton) {
      const form = $("#giftVoucherForm");
      const amountField = form ? formField(form, "amount") : null;
      if (amountField) {
        amountField.value = Number(amountButton.dataset.giftTemplateAmount || 0).toFixed(2);
        amountField.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document.querySelectorAll("[data-gift-template-amount]").forEach((button) => {
        button.classList.toggle("is-active", button === amountButton);
      });
      return;
    }

    const adminButton = event.target.closest("[data-gift-template-edit], [data-gift-template-toggle], [data-gift-template-delete]");
    if (adminButton) {
      event.preventDefault();
      await handleGiftVoucherTemplateAction(adminButton);
    }

    const favButton = event.target.closest("[data-gift-code-fav]");
    if (favButton && isAdmin() && db) {
      const id = favButton.dataset.giftCodeFav;
      const snap = await db.collection("giftVouchers").doc(id).get();
      await db.collection("giftVouchers").doc(id).set({ favorite: !Boolean(snap.data()?.favorite) }, { merge: true });
    }

    const deleteButton = event.target.closest("[data-gift-code-delete]");
    if (deleteButton && isAdmin() && db) {
      if (!window.confirm("Diesen Gutschein-Code wirklich löschen?")) return;
      await db.collection("giftVouchers").doc(deleteButton.dataset.giftCodeDelete).delete();
    }

    const toggleButton = event.target.closest("[data-gift-code-toggle]");
    if (toggleButton && isAdmin() && db) {
      const id = toggleButton.dataset.giftCodeToggle;
      const snap = await db.collection("giftVouchers").doc(id).get();
      const current = snap.data()?.status || 'active';
      const next = current === 'disabled' ? 'active' : 'disabled';
      await db.collection("giftVouchers").doc(id).update({ status: next });
      showToast(next === 'active' ? "Gutschein aktiviert." : "Gutschein gesperrt.");
    }

    const editBalanceButton = event.target.closest("[data-gift-code-edit-balance]");
    if (editBalanceButton && isAdmin() && db) {
      const id = editBalanceButton.dataset.giftCodeEditBalance;
      const snap = await db.collection("giftVouchers").doc(id).get();
      const current = Number(snap.data()?.remainingAmount ?? snap.data()?.amount ?? 0);
      const next = prompt(`Neues Guthaben für ${id} eingeben:`, current.toFixed(2));
      if (next !== null) {
        const val = parseFloat(next.replace(',', '.'));
        if (!isNaN(val)) {
          await db.collection("giftVouchers").doc(id).update({ remainingAmount: val });
          showToast("Guthaben aktualisiert.");
        }
      }
    }
  });
});

function isAdminTodoPage() {
  return Boolean($("#adminTodoForm"));
}

function adminTodoRoot() {
  return realtimeDb ? realtimeDb.ref("adminTodos") : null;
}

let adminTodoListening = false;

function listenToAdminTodos() {
  if (!isAdminTodoPage() || !isAdmin() || adminTodoListening) return;
  const root = adminTodoRoot();
  const list = $("#adminTodoList");
  const documentField = formField($("#adminTodoDocumentForm"), "documentText");
  if (!root || !list) {
    if (list) list.innerHTML = `<p class="muted">Realtime Database ist noch nicht geladen oder in firebase-config.js fehlt databaseURL.</p>`;
    return;
  }
  adminTodoListening = true;
  root.child("items").orderByChild("createdAtMs").on("value", (snapshot) => {
    const value = snapshot.val() || {};
    const items = Object.entries(value)
      .map(([id, item]) => ({ id, ...(item || {}) }))
      .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
    list.innerHTML = items.length ? items.map((item) => `
      <article class="admin-item">
        <div>
          <strong>${escapeHtml(item.text || "")}</strong>
          <p>${escapeHtml(item.authorName || "Admin")} | ${new Date(Number(item.createdAtMs || Date.now())).toLocaleString("de-DE")}</p>
        </div>
        <div class="admin-actions">
          <button type="button" data-admin-todo-delete="${escapeHtml(item.id)}">Löschen</button>
        </div>
      </article>
    `).join("") : `<p class="muted">Noch keine ToDos.</p>`;
  });
  root.child("document").on("value", (snapshot) => {
    if (documentField && document.activeElement !== documentField) documentField.value = snapshot.val()?.text || "";
  });
}

async function addAdminTodo(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können ToDos schreiben.");
  const root = adminTodoRoot();
  if (!root) return showToast("Realtime Database ist nicht bereit.");
  const form = event.currentTarget;
  const text = String(new FormData(form).get("text") || "").trim();
  if (text.length < 2) return showToast("Bitte ein ToDo eintragen.");
  await root.child("items").push({
    text,
    authorId: currentUser?.uid || "",
    authorName: currentProfile?.name || currentUser?.email || "Admin",
    createdAtMs: Date.now()
  });
  form.reset();
}

async function saveAdminTodoDocument(event) {
  event.preventDefault();
  if (!isAdmin()) return showToast("Nur Admins können das Dokument speichern.");
  const root = adminTodoRoot();
  if (!root) return showToast("Realtime Database ist nicht bereit.");
  const text = String(new FormData(event.currentTarget).get("documentText") || "");
  await root.child("document").set({
    text,
    updatedAtMs: Date.now(),
    updatedBy: currentUser?.uid || ""
  });
  showToast("Dokument gespeichert.");
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#adminTodoForm")?.addEventListener("submit", addAdminTodo);
  $("#adminTodoDocumentForm")?.addEventListener("submit", saveAdminTodoDocument);
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-admin-todo-delete]");
    if (!target || !isAdmin()) return;
    const root = adminTodoRoot();
    if (!root) return showToast("Realtime Database ist nicht bereit.");
    await root.child("items").child(target.dataset.adminTodoDelete).remove();
  });
});

let isbnEntries = [];
let isbnListening = false;

function isIsbnPage() {
  return Boolean($("#isbnForm"));
}

function ean13Checksum(firstTwelveDigits) {
  const sum = firstTwelveDigits.split("").reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (sum % 10)) % 10);
}

function isbn10IsValid(isbn) {
  const sum = isbn.split("").reduce((total, digit, index) => {
    const value = digit === "X" ? 10 : Number(digit);
    return total + value * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

function normalizeIsbn(rawValue) {
  const compact = String(rawValue || "").trim().replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!/^\d{9}[\dX]$|^\d{12,13}$/.test(compact)) {
    throw new Error("Bitte eine gültige ISBN-10 oder ISBN-13 eingeben.");
  }
  if (compact.length === 10) {
    if (!isbn10IsValid(compact)) throw new Error("Die ISBN-10-Prüfziffer stimmt nicht.");
    const body = `978${compact.slice(0, 9)}`;
    return `${body}${ean13Checksum(body)}`;
  }
  if (compact.length === 12) return `${compact}${ean13Checksum(compact)}`;
  if (ean13Checksum(compact.slice(0, 12)) !== compact[12]) {
    throw new Error("Die ISBN-Prüfziffer stimmt nicht.");
  }
  return compact;
}

function prettyIsbn(isbn) {
  const digits = String(isbn || "");
  if (digits.length !== 13) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 12)}-${digits.slice(12)}`;
}

function ean13Bits(ean) {
  const leftOdd = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const leftEven = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  const parity = ["OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE", "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO"];
  const digits = ean.split("").map(Number);
  const pattern = parity[digits[0]];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    bits += pattern[index - 1] === "O" ? leftOdd[digits[index]] : leftEven[digits[index]];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) bits += right[digits[index]];
  bits += "101";
  return bits;
}

function renderEan13Barcode(isbn, title = "") {
  const ean = normalizeIsbn(isbn);
  const canvas = document.createElement("canvas");
  const moduleWidth = 4;
  const quietModules = 11;
  const bits = ean13Bits(ean);
  const barcodeHeight = 190;
  const labelHeight = 72;
  const width = (bits.length + quietModules * 2) * moduleWidth;
  const height = barcodeHeight + labelHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  bits.split("").forEach((bit, index) => {
    if (bit === "1") ctx.fillRect((quietModules + index) * moduleWidth, 18, m
... [truncated for diff preview]
    if (bit === "1") ctx.fillRect((quietModules + index) * moduleWidth, 18, moduleWidth, barcodeHeight);
  });
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.font = "700 22px Arial, sans-serif";
  ctx.fillText(ean, width / 2, barcodeHeight + 42);
  return canvas;
}

function safeFileName(value) {
  return String(value || "isbn-barcode").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "isbn-barcode";
}

function downloadBarcodePng(isbn, title) {
  const canvas = renderEan13Barcode(isbn, title);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${safeFileName(title || isbn)}-${isbn}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderIsbnList() {
  const list = $("#isbnList");
  if (!list) return;
  if (!isAdmin()) {
    list.innerHTML = `<p class="muted">Diese Liste ist nur für Admins sichtbar.</p>`;
    return;
  }
  document.querySelectorAll("[data-isbn-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.isbnFilter === isbnFilterMode);
  });
  const searchInput = $("#isbnSearchInput");
  const query = searchInput?.value?.toLowerCase() || "";

  const visibleEntries = isbnEntries.filter((entry) => {
    if (isbnFilterMode === "unused" && entry.used) return false;
    if (query) {
      const match = String(entry.isbn || "").toLowerCase().includes(query) ||
                    String(entry.title || "").toLowerCase().includes(query) ||
                    String(entry.price || "").includes(query);
      if (!match) return false;
    }
    return true;
  });
  list.innerHTML = visibleEntries.length ? `
    <section class="cart-receipt isbn-receipt" aria-label="ISBN-Liste">
      <div class="cart-receipt-head">
        <span>ISBN / Titel / Preis</span>
        <strong>Status</strong>
      </div>
      <div class="cart-receipt-lines">
        ${visibleEntries.map((entry) => `
          <article class="cart-receipt-item isbn-entry">
            <div class="cart-receipt-row">
              <span>
                ${escapeHtml(entry.title || "Noch kein Titel")}
                ${entry.price ? ` | <strong>${Number(entry.price).toFixed(2)} EUR</strong>` : ""}
                <small class="cart-receipt-detail">${escapeHtml(prettyIsbn(entry.isbn))}<br>Gespeichert: ${new Date(Number(entry.createdAtMs || Date.now())).toLocaleString("de-DE")}</small>
              </span>
              <strong>${entry.used ? "Genutzt" : "Ungenutzt"}</strong>
            </div>
            <div class="isbn-entry-tools">
              <input data-isbn-title="${escapeHtml(entry.id)}" value="${escapeHtml(entry.title || "")}" placeholder="Buchtitel">
              <input data-isbn-price="${escapeHtml(entry.id)}" type="number" step="0.01" value="${entry.price || ""}" placeholder="Preis (EUR)" style="max-width: 120px;">
              <label class="checkbox-line">
                <input data-isbn-used="${escapeHtml(entry.id)}" type="checkbox" ${entry.used ? "checked" : ""}>
                <span>Genutzt</span>
              </label>
              <button type="button" data-isbn-save-title="${escapeHtml(entry.id)}">Speichern</button>
              <button type="button" data-isbn-generate="${escapeHtml(entry.id)}">Barcode</button>
              <button type="button" data-isbn-download="${escapeHtml(entry.id)}">PNG</button>
              <button type="button" data-isbn-delete="${escapeHtml(entry.id)}">Löschen</button>
            </div>
            <div class="isbn-barcode-preview" id="isbnPreview-${escapeHtml(entry.id)}" aria-live="polite"></div>
          </article>
        `).join("")}
      </div>
    </section>
  ` : `<p class="muted">${isbnFilterMode === "unused" ? "Keine ungenutzten ISBNs gefunden." : "Noch keine ISBN gespeichert."}</p>`;
}

function updateIsbnPickerDisplay(book = null) {
  const printInput = $("#isbnPrintInput");
  const printDisplay = $("#isbnPrintDisplay");
  const ebookInput = $("#isbnEbookInput");
  const ebookDisplay = $("#isbnEbookDisplay");

  const printIsbn = book?.isbnPrint || book?.isbn || "";
  const ebookIsbn = book?.isbnEbook || "";

  if (printInput) printInput.value = printIsbn;
  if (printDisplay) {
    const entry = isbnEntries.find(e => e.isbn === printIsbn);
    printDisplay.textContent = printIsbn ? `${printIsbn} (${entry?.title || "Gewählt"})` : "Keine ISBN gewählt";
  }

  if (ebookInput) ebookInput.value = ebookIsbn;
  if (ebookDisplay) {
    const entry = isbnEntries.find(e => e.isbn === ebookIsbn);
    ebookDisplay.textContent = ebookIsbn ? `${ebookIsbn} (${entry?.title || "Gewählt"})` : "Keine ISBN gewählt";
  }
}

let isbnPickerType = ""; // "print" or "ebook"
let isbnPickerCurrentBook = null;

function openIsbnPicker(type) {
  isbnPickerType = type;
  const form = $("#bookForm");
  const id = formField(form, "id")?.value;
  isbnPickerCurrentBook = id ? books.find(b => b.id === id) : null;

  const modal = $("#isbnPickerModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const searchInput = $("#isbnPickerSearch");
  if (searchInput) searchInput.value = "";
  renderIsbnPickerList();
  if (searchInput) searchInput.focus();
}

function renderIsbnPickerList(query = "") {
  const list = $("#isbnPickerList");
  if (!list) return;
  const q = query.toLowerCase();

  const currentPrintIsbn = isbnPickerCurrentBook?.isbnPrint || isbnPickerCurrentBook?.isbn || "";
  const currentEbookIsbn = isbnPickerCurrentBook?.isbnEbook || "";
  const currentIsbn = isbnPickerType === "print" ? currentPrintIsbn : currentEbookIsbn;

  const filtered = isbnEntries.filter(entry => {
    const isbn = String(entry.isbn || "");
    const title = String(entry.title || "").toLowerCase();

    // Nur ISBNs anzeigen, die als "Genutzt" markiert sind
    const isAvailable = entry.used === true;
    const matchesQuery = isbn.includes(query) || title.includes(q);

    return isAvailable && matchesQuery;
  });

  list.innerHTML = filtered.length ? filtered.map(entry => `
    <div class="admin-item picker-item" onclick="selectIsbn('${escapeHtml(entry.isbn)}', '${escapeHtml(entry.title || "")}')" style="cursor:pointer; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong>${escapeHtml(entry.isbn)}</strong>
        <p style="margin: 4px 0 0 0; font-size: 0.9em;">${escapeHtml(entry.title || "Ohne Titel")}</p>
      </div>
      ${entry.isbn === currentIsbn ? '<span class="stock-pill" style="background: rgba(0,0,0,0.1); color: #666;">Aktuell zugewiesen</span>' : ""}
    </div>
  `).join("") : `<p class="muted" style="padding: 20px;">Keine als 'Genutzt' markierten ISBNs gefunden. (${isbnEntries.length} gesamt in der Datenbank)</p>`;
}

function selectIsbn(isbn, title) {
  const type = isbnPickerType;
  const input = type === "print" ? $("#isbnPrintInput") : $("#isbnEbookInput");
  const display = type === "print" ? $("#isbnPrintDisplay") : $("#isbnEbookDisplay");

  if (input) input.value = isbn;
  if (display) display.textContent = `${isbn} (${title || "Gewählt"})`;

  $("#isbnPickerModal")?.classList.add("hidden");
}

window.selectIsbn = selectIsbn;

function listenToIsbnEntries() {
  if (!db || !isAdmin() || isbnListening) return;
  isbnListening = true;
  db.collection("isbnEntries").orderBy("createdAtMs", "desc").onSnapshot((snapshot) => {
    isbnEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderIsbnList();
    if ($("#bookForm")) {
      updateMaterialFields();
      const id = formField($("#bookForm"), "id")?.value;
      const existing = id ? books.find(b => b.id === id) : null;
      updateIsbnPickerDisplay(existing);
    }
  }, (error) => {
    console.error(error);
    showToast("ISBN-Liste konnte nicht geladen werden.");
  });
}

async function saveIsbnEntry(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können ISBNs speichern.");
  const form = event.currentTarget;
  const data = new FormData(form);
  let isbn = "";
  try {
    isbn = normalizeIsbn(data.get("isbn"));
  } catch (error) {
    return showToast(error.message);
  }
  const title = String(data.get("title") || "").trim();
  const price = data.get("price") !== "" ? Number(data.get("price")) : null;
  const used = data.get("used") === "on";
  const existing = await db.collection("isbnEntries").where("isbn", "==", isbn).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({
      title: title || existing.docs[0].data().title || "",
      price: price !== null ? price : (existing.docs[0].data().price || null),
      used,
      updatedAtMs: Date.now(),
      updatedBy: currentUser?.uid || ""
    });
    form.reset();
    return showToast("ISBN war schon vorhanden und wurde aktualisiert.");
  }
  await db.collection("isbnEntries").add({
    isbn,
    title,
    price,
    used,
    createdAtMs: Date.now(),
    createdBy: currentUser?.uid || "",
    updatedAtMs: Date.now(),
    updatedBy: currentUser?.uid || ""
  });
  form.reset();
  showToast("ISBN gespeichert.");
}

// Redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#isbnForm")?.addEventListener("submit", saveIsbnEntry);
  document.querySelectorAll("[data-isbn-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      isbnFilterMode = button.dataset.isbnFilter || "all";
      renderIsbnList();
    });
  });
  document.querySelectorAll("[data-gift-voucher-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      giftVoucherCodeFilterMode = button.dataset.giftVoucherFilter || "all";
      if (listenGiftVoucherCodes.latest) renderGiftVoucherCodeList(listenGiftVoucherCodes.latest);
    });
  });
  document.addEventListener("click", async (event) => {
    const saveTitle = event.target.closest("[data-isbn-save-title]");
    const generate = event.target.closest("[data-isbn-generate]");
    const download = event.target.closest("[data-isbn-download]");
    const remove = event.target.closest("[data-isbn-delete]");
    if (!isAdmin() || !db) return;
    if (saveTitle) {
      const id = saveTitle.dataset.isbnSaveTitle;
      const input = document.querySelector(`[data-isbn-title="${CSS.escape(id)}"]`);
      const priceInput = document.querySelector(`[data-isbn-price="${CSS.escape(id)}"]`);
      const used = document.querySelector(`[data-isbn-used="${CSS.escape(id)}"]`);
      await db.collection("isbnEntries").doc(id).update({
        title: String(input?.value || "").trim(),
        price: priceInput?.value !== "" ? Number(priceInput?.value) : null,
        used: Boolean(used?.checked),
        updatedAtMs: Date.now(),
        updatedBy: currentUser?.uid || ""
      });
      showToast("ISBN-Daten gespeichert.");
    }
    if (generate || download) {
      const id = (generate || download).dataset.isbnGenerate || (generate || download).dataset.isbnDownload;
      const entry = isbnEntries.find((item) => item.id === id);
      if (!entry) return;
      const preview = $(`#isbnPreview-${CSS.escape(id)}`);
      if (preview) {
        preview.innerHTML = "";
        preview.appendChild(renderEan13Barcode(entry.isbn, entry.title || ""));
      }
      if (download) downloadBarcodePng(entry.isbn, entry.title || "");
    }
    if (remove) {
      if (!window.confirm("Diesen ISBN-Eintrag wirklich löschen?")) return;
      await db.collection("isbnEntries").doc(remove.dataset.isbnDelete).delete();
    }
  });
});

function isAdminAppLoginCodePage() {
  return Boolean($("#adminAppLoginCodeForm"));
}

async function loadAdminAppLoginCode() {
  if (!isAdminAppLoginCodePage() || !db || !isAdmin()) return;
  const form = $("#adminAppLoginCodeForm");
  const status = $("#adminAppLoginCodeStatus");
  const userSelect = $("#adminAppLoginCodeUser");
  const snap = await db.collection("settings").doc("adminAppLoginCode").get().catch(() => null);
  const settings = snap?.exists ? snap.data() : {};
  const enabled = formField(form, "enabled");
  const code = formField(form, "code");
  if (enabled) enabled.checked = Boolean(settings.enabled);
  if (code) code.value = settings.code || "";
  if (userSelect && !userSelect.dataset.loaded) {
    const usersSnap = await db.collection("users").get().catch(() => null);
    const users = usersSnap?.docs?.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((entry) => !entry.anonymous && !entry.guestOnly)
      .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "de")) || [];
    userSelect.innerHTML = `
      <option value="">Mich selbst / aktuellen Admin</option>
      ${users.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name || entry.email || entry.id)}${entry.email ? ` (${escapeHtml(entry.email)})` : ""}</option>`).join("")}
    `;
    userSelect.dataset.loaded = "true";
  }
  if (userSelect) userSelect.value = settings.loginAsUserId || "";
  if (status) {
    status.innerHTML = `
      <article class="admin-item">
        <div>
          <strong>${settings.enabled ? "Code-Login ist aktiv" : "Code-Login ist deaktiviert"}</strong>
          <p class="muted">App-Profil: ${escapeHtml(settings.loginAsName || settings.loginAsEmail || "aktueller Admin / Code-Zugang")}</p>
          <p class="muted">Letzte Änderung: ${settings.updatedAtMs ? new Date(Number(settings.updatedAtMs)).toLocaleString("de-DE") : "noch nicht gespeichert"}</p>
        </div>
      </article>
    `;
  }
}

async function saveAdminAppLoginCode(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können den App Login-Code speichern.");
  const form = event.currentTarget;
  const selectedUserId = String(new FormData(form).get("loginAsUserId") || "");
  let selectedUser = null;
  if (selectedUserId) {
    const selectedSnap = await db.collection("users").doc(selectedUserId).get().catch(() => null);
    selectedUser = selectedSnap?.exists ? { id: selectedSnap.id, ...selectedSnap.data() } : null;
  }
  const code = String(new FormData(form).get("code") || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return showToast("Der Login-Code muss genau 6 Zahlen haben.");
  await db.collection("settings").doc("adminAppLoginCode").set({
    enabled: Boolean(formField(form, "enabled")?.checked),
    code,
    loginAsUserId: selectedUser?.id || "",
    loginAsName: selectedUser?.name || "",
    loginAsEmail: selectedUser?.email || "",
    loginAsPhoto: selectedUser?.profilePhotoDataUrl || "",
    updatedAtMs: Date.now(),
    updatedBy: currentUser?.uid || ""
  }, { merge: true });
  showToast("App Login-Code gespeichert.");
  loadAdminAppLoginCode();
}

function renderLager() {
  const list = $("#lagerList");
  if (!list || !isAdmin()) return;
  list.innerHTML = books.length ? books.map(book => {
      const stock = Number(book.stock || 0);
      const color = stock > 5 ? "#2e7d32" : "#d77d32";
      return `
        <div class="admin-item">
          <strong>${escapeHtml(book.title)}</strong>
          <p>Typ: ${escapeHtml(itemTypeLabel(book.itemType))}</p>
          <p style="font-size: 20px; font-weight: bold; color: ${color};">Bestand: ${stock}</p>
        </div>
      `;
  }).join("") : `<p class="panel">Keine Artikel im Lager gefunden.</p>`;
}

// Redundant renderAll removed

// Final redundant renderAll removed

document.addEventListener("DOMContentLoaded", () => {
  $("#adminAppLoginCodeForm")?.addEventListener("submit", saveAdminAppLoginCode);
  $("#generateAdminAppLoginCode")?.addEventListener("click", () => {
    const code = formField($("#adminAppLoginCodeForm"), "code");
    if (code) code.value = String(Math.floor(100000 + Math.random() * 900000));
  });
});

function cartReceiptRow(label, amount, options = {}) {
  const value = Number(amount || 0);
  const sign = options.negative ? "-" : "";
  const detailClass = options.itemDetail ? "cart-receipt-item-detail" : "cart-receipt-detail";
  const detail = options.detail ? `<small class="${detailClass}">${escapeHtml(options.detail)}</small>` : "";
  const css = options.total ? " cart-receipt-row-total" : options.discount ? " cart-receipt-row-discount" : "";
  return `
    <div class="cart-receipt-row${css}">
      <span>${escapeHtml(label)}${detail}</span>
      <strong>${sign}${Math.abs(value).toFixed(2)} EUR</strong>
    </div>
  `;
}

function cartItemReceiptMarkup(item) {
  const book = books.find((entry) => entry.id === item.bookId);
  if (!book) return "";
  const key = cartKey(item);
  const fulfillment = item.fulfillment || "default";
  const variant = item.variant || null;
  const unitPrice = item.price || variantPrice(book, fulfillment, variant);
  const quantity = Number(item.quantity || 1);
  const totalForBook = physicalCartQuantity(item.bookId);
  const selectedVariant = variant ? book.variants?.find(entry => entry.name === variant) : null;
  const label = `${selectedVariant?.title || book.title}${variant ? ` (${variant})` : ""}${quantity > 1 ? ` x ${quantity}` : ""}`;
  return `
    <div class="cart-receipt-item">
      ${cartReceiptRow(label, unitPrice * quantity, {
        detail: fulfillment !== "default" ? itemFulfillmentLabel(fulfillment) : "",
        itemDetail: true
      })}
      <div class="quantity-row cart-receipt-actions">
        <button type="button" data-cart-minus="${escapeHtml(key)}">-</button>
        <button type="button" data-cart-plus="${escapeHtml(key)}" ${fulfillment === "download" || totalForBook >= Number(book.stock || 0) ? "disabled" : ""}>+</button>
        <button type="button" data-cart-remove="${escapeHtml(key)}">Entfernen</button>
      </div>
    </div>
  `;
}

function discountReceiptLabel(discount) {
  if (discount.kind === "voucher") return `Gutschein ${discount.code || ""}`.trim();
  if (discount.kind === "shop") return "Shop-Rabatt";
  return discount.code ? `Rabatt ${discount.code}` : "Rabatt";
}

const SHIPPING_METHOD_STORAGE_KEY = "entfalta_shipping_method";

function normalizedShippingMethods() {
  return Array.isArray(paymentSettings?.shippingMethods)
    ? paymentSettings.shippingMethods.map((method) => ({
      id: method.id || newId(),
      name: String(method.name || "").trim(),
      price: Number(method.price || 0),
      type: method.type || "shipping",
      description: String(method.description || "").trim(),
      sendcloudMethodId: String(method.sendcloudMethodId || "").trim(),
      deliveryTab: Boolean(method.deliveryTab),
      disabled: Boolean(method.disabled)
    })).filter((method) => method.name)
    : [];
}

function activeShippingMethods(options = {}) {
  const type = options.type || "shipping";
  const itemCount = options.itemCount || 0;

  return normalizedShippingMethods().filter((method) => {
    if (method.disabled) return false;
    if (method.type && method.type !== type) return false;

    // Filter by Item Count (if provided)
    if (itemCount > 0) {
        if (method.minItems && itemCount < method.minItems) return false;
        if (method.maxItems && itemCount > method.maxItems) return false;
    }

    return true;
  });
}

function selectedShippingMethod() {
  const visibleCart = availableCartItems(cart);
  const itemCount = visibleCart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const methods = activeShippingMethods({ itemCount });
  if (!methods.length) return null;
  const saved = localStorage.getItem(SHIPPING_METHOD_STORAGE_KEY) || "";
  return methods.find((method) => method.id === saved) || methods[0];
}

function shippingMethodSelectorMarkup() {
  const visibleCart = availableCartItems(cart);
  const downloadOnly = visibleCart.length > 0 && visibleCart.every(item => item.fulfillment === "download");
  if (downloadOnly) return "";

  const itemCount = visibleCart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const methods = activeShippingMethods({ itemCount });
  if (!methods.length) return `<p class="muted">Aktuell ist keine besondere Versandart auswählbar.</p>`;
  const selected = selectedShippingMethod();
  return `
    <label class="cart-shipping-select">
      Lieferdienst auswählen
      <select id="checkoutShippingMethod" name="shippingMethodId">
        ${methods.map((method) => `
          <option value="${escapeHtml(method.id)}" ${selected?.id === method.id ? "selected" : ""}>
            ${escapeHtml(method.name)} - ${Number(method.price || 0).toFixed(2)} EUR
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

function checkoutShippingFee() {
  const method = selectedShippingMethod();
  return method ? Number(method.price || 0) : 0;
}

const buildCheckoutPayloadBeforeShippingMethods = buildCheckoutPayload;
buildCheckoutPayload = function buildCheckoutPayload(form) {
  const payload = buildCheckoutPayloadBeforeShippingMethods(form);
  const shipping = selectedShippingMethod();
  if (!shipping) return payload;
  const shippingFee = {
    id: `shipping-${shipping.id}`,
    name: `Versand: ${shipping.name}`,
    price: Number(shipping.price || 0),
    description: shipping.description || "Ausgewählter Lieferdienst",
    kind: "shipping",
    shippingMethodId: shipping.id
  };
  const fees = Array.isArray(payload.fees) ? payload.fees.filter((fee) => !String(fee?.id || "").startsWith("shipping-")) : [];
  payload.fees = [...fees, shippingFee];
  payload.shippingMethod = {
    id: shipping.id,
    name: shipping.name,
    price: Number(shipping.price || 0),
    description: shipping.description || ""
  };
  const checkoutCart = availableCartItems(cart);
  const totals = discountSummary(checkoutCart);
  payload.discountTotal = totals.discountTotal;
  payload.total = totals.total;
  payload.discounts = totals.discountDetails.map((entry) => ({
    id: entry.discount.id,
    code: entry.discount.code,
    kind: entry.discount.kind,
    valueType: entry.discount.valueType,
    value: entry.discount.value,
    giftVoucher: Boolean(entry.discount.giftVoucher),
    amount: entry.amount
  }));
  return payload;
};

const discountSummaryBeforeShippingMethods = discountSummary;
discountSummary = function discountSummary(items = cart) {
  const summary = discountSummaryBeforeShippingMethods(items);
  let shippingPrice = checkoutShippingFee();
  if (summary.itemTotal >= 25) {
    shippingPrice = 0;
  }
  const discount = currentShopDiscount();
  const shippingDiscount = (discount.appliesTo === "fees" || discount.appliesTo === "both")
    ? Math.min(shippingPrice, feeDiscountAmount(shippingPrice))
    : 0;
  summary.feeTotal = Number(summary.feeTotal || 0) + shippingPrice;
  summary.discountTotal = Number(summary.discountTotal || 0) + shippingDiscount;
  if (shippingDiscount > 0) {
    summary.discountDetails = [...(summary.discountDetails || []), {
      discount: { id: "shipping-discount", code: "Versand-Rabatt", kind: "shop", valueType: discount.valueType, value: discount.value },
      amount: shippingDiscount
    }];
  }
  summary.total = Math.max(0, Number(summary.itemTotal || 0) + summary.feeTotal - summary.discountTotal);
  return summary;
};

function autoAddGiftItems() {
  if (!db || !books.length) return;

  const giftOptOuts = readJsonStorage("entfalta_gift_optouts", {});
  const visibleCart = availableCartItems(cart).filter(item => Number(item.price) > 0);
  const shopAmount = shopDiscountAmount(visibleCart);
  const subtotal = cartTotalFromItems(visibleCart) - shopAmount;

  let cartChanged = false;

  const nextCart = cart.filter(item => {
    if (!item.isGiftItem) return true;
    const gift = books.find(b => b.id === item.bookId);
    if (!gift || giftOptOuts[gift.id] || !giftEligibility(gift, visibleCart, subtotal)) {
        cartChanged = true;
        return false;
    }
    return true;
  });

  if (cartChanged) {
    cart = nextCart;
    persistCartIfAllowed();
  }
}

function giftEligibility(gift, visibleCart, subtotal) {
  if (!gift || subtotal < Number(gift.giftThreshold || 0)) return false;
  if (gift.giftRequirementType === "any_book") {
    return visibleCart.some(item => {
      const book = books.find(entry => entry.id === item.bookId);
      return book && ["book", "ebook", "audiobook"].includes(book.itemType);
    });
  }
  if (gift.giftRequirementType === "any_product") return visibleCart.length > 0;
  return true;
}

function syncGiftSettingsVisibility() {
  const checkbox = formField($("#bookForm"), "isGift");
  $("#giftSettings")?.classList.toggle("hidden", !checkbox?.checked);
}

function eligibleGiftOffers() {
  const visibleCart = availableCartItems(cart).filter(item => Number(item.price) > 0);
  const subtotal = cartTotalFromItems(visibleCart) - shopDiscountAmount(visibleCart);
  const optOuts = readJsonStorage("entfalta_gift_optouts", {});
  return books.filter(gift => gift.isGift && giftEligibility(gift, visibleCart, subtotal)).map(gift => ({
    gift,
    selected: Boolean(cart.find(item => item.isGiftItem && item.bookId === gift.id)),
    optedOut: Boolean(optOuts[gift.id]),
    subtotal
  }));
}

function giftOfferMarkup() {
  const offers = eligibleGiftOffers();
  if (!offers.length) return "";
  return `
    <section class="cart-gift-options" aria-label="Gratis-Geschenke">
      <h3>Gratis-Geschenke</h3>
      <p class="muted">Du kannst ein verfügbares Geschenk freiwillig zu deiner Bestellung hinzufügen.</p>
      ${offers.map(({ gift, selected }) => `
        <div class="cart-gift-option">
          <span><strong>${escapeHtml(gift.title)}</strong><small>Gratis ab ${Number(gift.giftThreshold || 0).toFixed(2)} EUR${gift.giftRequirementType === "any_book" ? " und mindestens 1 Buch" : gift.giftRequirementType === "any_product" ? " und mindestens 1 Produkt" : ""}</small></span>
          <button type="button" data-gift-${selected ? "remove" : "add"}="${escapeHtml(gift.id)}">${selected ? "Nicht nehmen" : "Hinzufügen"}</button>
        </div>
      `).join("")}
    </section>
  `;
}

function addGiftToCart(giftId) {
  const gift = books.find(book => book.id === giftId);
  if (!gift) return;
  const visibleCart = availableCartItems(cart).filter(item => Number(item.price) > 0);
  const subtotal = cartTotalFromItems(visibleCart) - shopDiscountAmount(visibleCart);
  if (!giftEligibility(gift, visibleCart, subtotal)) return showToast("Dieses Geschenk ist für den aktuellen Warenkorb nicht verfügbar.");
  if (Number(gift.stock || 0) <= 0) return showToast("Dieses Geschenk ist leider nicht mehr auf Lager.");

  const optOuts = readJsonStorage("entfalta_gift_optouts", {});
  delete optOuts[giftId];
  writeJsonStorage("entfalta_gift_optouts", optOuts);
  if (!cart.some(item => item.isGiftItem && item.bookId === giftId)) {
    cart.push({ bookId: giftId, title: `${gift.title} (Geschenk)`, price: 0, quantity: 1, fulfillment: "print", isGiftItem: true });
    persistCartIfAllowed();
  }
  renderCart();
}

function removeGiftFromCart(giftId) {
  const optOuts = readJsonStorage("entfalta_gift_optouts", {});
  optOuts[giftId] = true;
  writeJsonStorage("entfalta_gift_optouts", optOuts);
  cart = cart.filter(item => !(item.isGiftItem && item.bookId === giftId));
  persistCartIfAllowed();
  renderCart();
}

renderCart = function renderCart() {
  const cartCount = $("#cartCount");
  const cartItems = $("#cartItems");
  const checkoutForm = $("#checkoutForm");
  cleanUnavailableCartItems();

  autoAddGiftItems(); // Process gifts before rendering

  const visibleCart = availableCartItems(cart);
  if (cartCount) cartCount.textContent = cartVisibleCount(visibleCart);
  if (!cartItems) return;
  if (!visibleCart.length) {
    cartItems.innerHTML = `<div class="cart-receipt cart-receipt-empty"><p class="muted">Dein Warenkorb ist leer.</p></div>`;
    checkoutForm?.classList.add("hidden");
    scheduleLiveSessionUpdate();
    if (cartStorageRestored) persistCartIfAllowed();
    return;
  }

  checkoutForm?.classList.remove("hidden");
  const totals = discountSummary(visibleCart);
  const downloadOnly = visibleCart.length > 0 && visibleCart.every(item => item.fulfillment === "download");
  const shipping = downloadOnly ? null : selectedShippingMethod();
  const feeRows = activeFees().map((fee) => cartReceiptRow(fee.name || "Zusatzkosten", Number(fee.price || 0), {
    detail: fee.description || ""
  })).join("");
  const effectiveShippingPrice = (!downloadOnly && shipping && totals.itemTotal < 25) ? Number(shipping.price || 0) : 0;
  const shippingRow = (!downloadOnly && shipping) ? cartReceiptRow(`Versand: ${shipping.name}`, effectiveShippingPrice, {
    detail: totals.itemTotal >= 25 ? "Gratis ab 25€!" : (shipping.description || "Ausgewählter Lieferdienst")
  }) : "";
  const discountRows = totals.discountDetails.map((entry) => cartReceiptRow(discountReceiptLabel(entry.discount), entry.amount, {
    negative: true,
    discount: true
  })).join("");
  cartItems.innerHTML = `
    <section class="cart-receipt" aria-label="Warenkorb Übersicht">
      ${giftOfferMarkup()}
      <div class="cart-receipt-head">
        <span>Artikel</span>
        <span>Preis</span>
      </div>
      <div class="cart-receipt-lines">
        ${visibleCart.map(cartItemReceiptMarkup).join("")}
        ${feeRows}
        ${shippingRow}
        ${discountRows}
      </div>
      ${shippingMethodSelectorMarkup()}
      <div class="cart-receipt-summary">
        ${cartReceiptRow("Warenwert", totals.itemTotal)}
        ${cartReceiptRow("Zusatzkosten/Versand", totals.feeTotal)}
        ${cartReceiptRow("Rabatt/Gutschein", totals.discountTotal, { negative: true, discount: true })}
        ${cartReceiptRow("Endbetrag", totals.total, { total: true })}
      </div>
    </section>
  `;
  scheduleLiveSessionUpdate();
  if (typeof syncCheckoutConsentButton === "function") syncCheckoutConsentButton();
  if (cartStorageRestored) persistCartIfAllowed();
};

document.addEventListener("DOMContentLoaded", () => {
  restorePersistedCart();
  renderCart();
  prefillCheckoutFromProfile();
});

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-gift-add]");
  const removeButton = event.target.closest("[data-gift-remove]");
  if (addButton) {
    event.preventDefault();
    addGiftToCart(addButton.dataset.giftAdd);
  } else if (removeButton) {
    event.preventDefault();
    removeGiftFromCart(removeButton.dataset.giftRemove);
  }
});

document.addEventListener("change", (event) => {
  if (event.target?.id !== "checkoutShippingMethod") return;
  localStorage.setItem(SHIPPING_METHOD_STORAGE_KEY, event.target.value || "");
  renderCart();
});

function isDangerzonePage() {
  return Boolean($("#dangerzonePanel"));
}

async function deleteArchivedDeliveryProofs() {
  if (!db || !isAdmin()) return showToast("Nur Admins können diese Aktion ausführen.");
  const warnings = [
    "Warnung 1/5: Du löschst Lieferbelege und Unterschriften aus archivierten Bestellungen.",
    "Warnung 2/5: Diese Nachweise können danach nicht wiederhergestellt werden.",
    "Warnung 3/5: Bestellungen bleiben erhalten, aber Lieferbeleg-Daten werden entfernt.",
    "Warnung 4/5: Prüfe vorher, ob du diese Daten steuerlich/rechtlich noch brauchst.",
    "Warnung 5/5: Wirklich endgültig löschen?"
  ];
  for (const warning of warnings) {
    if (!confirm(warning)) return;
  }
  const status = $("#dangerzoneStatus");
  if (status) status.textContent = "Lieferbelege werden gelöscht ...";
  const snapshot = await db.collection("orders").where("archived", "==", true).get();
  const docs = snapshot.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.deliveryProof || data.archiveDeleteAfterMs;
  });
  for (let index = 0; index < docs.length; index += 450) {
    const batch = db.batch();
    docs.slice(index, index + 450).forEach((doc) => {
      batch.update(doc.ref, {
        deliveryProof: firebase.firestore.FieldValue.delete(),
        archiveDeleteAfterMs: firebase.firestore.FieldValue.delete(),
        deliveryProofDeletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deliveryProofDeletedBy: currentUser?.uid || ""
      });
    });
    await batch.commit();
  }
  if (status) status.textContent = `${docs.length} Lieferbeleg-Datensätze wurden gelöscht.`;
  showToast("Lieferbelege gelöscht.");
}

document.addEventListener("DOMContentLoaded", () => {
  if (!isDangerzonePage()) return;
  $("#deleteDeliveryProofs")?.addEventListener("click", deleteArchivedDeliveryProofs);
});

const BOOK_PRICE_LOCK_MS = 18 * 30.4375 * 24 * 60 * 60 * 1000;

function bookPublishedMs(book) {
  return Number(book?.releaseDateMs || book?.publishedAtMs || book?.createdAtMs || timestampToMs(book?.publishedAt) || timestampToMs(book?.createdAt) || 0);
}

function isBookPublished(book) {
  if (Boolean(book?.hidden || book?.disabled)) return false;
  const release = Number(book?.releaseDateMs || 0);
  if (release > Date.now()) return false;
  return true;
}

function isBookPriceLocked(book) {
  const type = String(book?.itemType || "book");
  if (!["book", "ebook", "audiobook"].includes(type)) return false;
  const published = bookPublishedMs(book);
  return Boolean(published && Date.now() - published < BOOK_PRICE_LOCK_MS);
}

function isBookOldEnoughForShopDiscount(book) {
  const type = String(book?.itemType || "book");
  if (!["book", "ebook", "audiobook"].includes(type)) return true;
  const discount = currentShopDiscount();
  const lockInMonths = discount.bookPriceLockMonths;
  if (lockInMonths <= 0) return true;
  const published = bookPublishedMs(book);
  if (!published) return false;
  const lockInMs = lockInMonths * 30.4375 * 24 * 60 * 60 * 1000;
  return Date.now() - published >= lockInMs;
}

const isBookOldEnoughForShopDiscountBeforePriceLock = isBookOldEnoughForShopDiscount;

const createManualGiftVoucherBeforeAdminFlags = createManualGiftVoucher;
createManualGiftVoucher = async function createManualGiftVoucher(event) {
  event.preventDefault();
  if (!db || !isAdmin()) return showToast("Nur Admins können Gutscheine erstellen.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const amount = Number(data.get("amount") || 0);
  if (amount < 2.5 || amount > 500) return showToast("Gutscheinbetrag muss zwischen 2,50 EUR und 500 EUR liegen.");
  const code = await generateUniqueGiftVoucherCode();
  const adminOnly = data.get("adminOnly") === "on";
  const unlimitedForAdmins = data.get("unlimitedForAdmins") === "on";
  await db.collection("giftVouchers").doc(code).set({
    code,
    amount,
    remainingAmount: unlimitedForAdmins ? amount : amount,
    purchaserEmail: currentUser?.email || "",
    recipientName: String(data.get("recipientName") || "").trim(),
    recipientEmail: String(data.get("recipientEmail") || "").trim(),
    source: "admin",
    status: "active",
    used: false,
    adminOnly,
    unlimitedForAdmins,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + GIFT_VOUCHER_VALIDITY_MS,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser?.uid || null
  });
  const recipientEmail = String(data.get("recipientEmail") || "").trim();
  let mailNotice = recipientEmail ? "" : " Keine E-Mail eingetragen, deshalb wurde nur der Code erstellt.";
  if (recipientEmail) {
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(backendUrl("send-gift-voucher"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, force: true, idToken })
      });
      const result = response.headers.get("Content-Type")?.includes("application/json")
        ? await response.json()
        : { error: await response.text() };
      if (!response.ok) throw new Error(result.error || "Gutscheinmail konnte nicht gesendet werden.");
      mailNotice = " Mail wurde gesendet.";
    } catch (error) {
      mailNotice = ` Mail konnte nicht gesendet werden: ${readableErrorText(error) || error.message || "Unbekannter Fehler"}`;
    }
  }
  form.reset();
  showToast(`Gutschein erstellt: ${code}.${adminOnly ? " Nur Admins." : ""}${unlimitedForAdmins ? " Für Admins unendlich nutzbar." : ""}${mailNotice}`);
};

const checkCartCodeBeforeAdminGiftVoucherFlags = checkCartCode;
checkCartCode = async function checkCartCode(kind, options = {}) {
  const normalizedKind = kind === "voucher" ? "voucher" : kind === "promo" ? "promo" : "discount";
  const form = $("#checkoutForm");
  const fieldName = normalizedKind === "voucher" ? "voucherCode" : "discountCode";
  const field = form ? formField(form, fieldName) : null;
  const code = String(field?.value || "").trim().toUpperCase();
  if (!code || !db) return false;

  try {
    const collection = normalizedKind === "voucher" ? "giftVouchers" : "discountCodes";
    const snap = await db.collection(collection).doc(code).get();
    const data = snap.exists ? snap.data() : null;

    if (!data) {
      if (normalizedKind === "promo") {
          appliedDiscounts.promo = null;
          renderCart();
      } else {
          appliedDiscounts.voucher = null;
          renderCart();
      }
      if (!options.silent) showToast("Code nicht gefunden.");
      return false;
    }

    if (data.validUntil && Date.now() > new Date(data.validUntil).getTime()) {
      if (!options.silent) showToast("Code ist abgelaufen.");
      return false;
    }

    if (normalizedKind === "promo" || normalizedKind === "discount") {
      if (data.usageLimit > 0 && (data.usageCount || 0) >= data.usageLimit) {
        if (!options.silent) showToast("Nutzungslimit erreicht.");
        return false;
      }
      appliedDiscounts.promo = { id: code, code, kind: "promo", valueType: data.valueType, value: data.value };
    } else {
      const remaining = Number(data.remainingAmount ?? data.amount ?? 0);
      if (data.status !== "active" || (!data.unlimitedForAdmins && remaining <= 0)) {
        if (!options.silent) showToast("Gutschein nicht mehr gültig.");
        return false;
      }
      appliedDiscounts.voucher = { id: code, code, kind: "voucher", valueType: "fixed", value: remaining, giftVoucher: true };
    }

    renderCart();
    if (!options.silent) showToast("Code angewendet.");
    return true;
  } catch (error) {
    console.error(error);
    if (!options.silent) showToast("Fehler bei Code-Prüfung.");
    return false;
  }
};

const itemDiscountAmountBeforeBookAgeRule = itemDiscountAmount;
itemDiscountAmount = function itemDiscountAmount(item) {
  const book = books.find((entry) => entry.id === item.bookId);
  if (!isBookOldEnoughForShopDiscount(book)) return 0;
  return itemDiscountAmountBeforeBookAgeRule(item);
};

const redeemGiftVouchersFromCheckoutBeforeAdminFlags = redeemGiftVouchersFromCheckout;
redeemGiftVouchersFromCheckout = async function redeemGiftVouchersFromCheckout(checkout) {
  const normalCheckout = {
    ...checkout,
    discounts: (checkout.discounts || []).filter((discount) => !discount.unlimitedForAdmins)
  };
  return redeemGiftVouchersFromCheckoutBeforeAdminFlags(normalCheckout);
};

const buildCheckoutPayloadBeforeAdminGiftVoucherFlags = buildCheckoutPayload;
buildCheckoutPayload = function buildCheckoutPayload(form) {
  const payload = buildCheckoutPayloadBeforeAdminGiftVoucherFlags(form);
  if (appliedDiscounts.voucher?.giftVoucher && Array.isArray(payload.discounts)) {
    payload.discounts = payload.discounts.map((discount) => {
      if (discount.kind !== "voucher" || discount.code !== appliedDiscounts.voucher.code) return discount;
      return {
        ...discount,
        adminOnly: Boolean(appliedDiscounts.voucher.adminOnly),
        unlimitedForAdmins: Boolean(appliedDiscounts.voucher.unlimitedForAdmins)
      };
    });
  }
  return payload;
};

async function redeemGiftVouchersLocally(checkout) {
  const giftVouchers = (checkout.discounts || []).filter((discount) => discount.kind === "voucher" && discount.giftVoucher && !discount.unlimitedForAdmins);
  if (!giftVouchers.length || !db) return;
  await Promise.all(giftVouchers.map(async (discount) => {
    const code = String(discount.code || "").trim().toUpperCase();
    const amount = Number(discount.amount || 0);
    if (!code || amount <= 0) return;
    const ref = db.collection("giftVouchers").doc(code);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return;
      const voucher = snap.data() || {};
      const redemptions = Array.isArray(voucher.redemptions) ? voucher.redemptions : [];
      if (redemptions.some((entry) => entry.stripeSessionId === checkout.stripeSessionId)) return;
      const remaining = Number(voucher.remainingAmount ?? voucher.amount ?? 0);
      const nextRemaining = Math.max(0, remaining - amount);
      transaction.update(ref, {
        remainingAmount: nextRemaining,
        used: nextRemaining <= 0,
        status: nextRemaining <= 0 ? "used" : "active",
        emptiedAtMs: nextRemaining <= 0 ? Date.now() : (voucher.emptiedAtMs || null),
        redeemedAmount: Number(voucher.redeemedAmount || 0) + amount,
        lastRedeemedAt: firebase.firestore.FieldValue.serverTimestamp(),
        redemptions: firebase.firestore.FieldValue.arrayUnion({
          amount,
          stripeSessionId: checkout.stripeSessionId,
          customerEmail: String(checkout.customer?.email || ""),
          customerName: String(checkout.customer?.name || ""),
          redeemedAtMs: Date.now()
        })
      });
    });
  }));
}

const redeemGiftVouchersFromCheckoutBeforeFreeCheckout = redeemGiftVouchersFromCheckout;
redeemGiftVouchersFromCheckout = async function redeemGiftVouchersFromCheckout(checkout) {
  return redeemGiftVouchersFromCheckoutBeforeFreeCheckout(checkout);
};



document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.dataset.uploadShippingLabel) {
        const orderId = target.dataset.uploadShippingLabel;
        const file = target.files[0];
        if (!file) return;
        try {
            showToast("Etikett wird hochgeladen...");
            const pdfApp = firebaseApps.pdfAssets;
            const storage = firebase.storage(pdfApp);
            const ref = storage.ref(`shipping-labels/${orderId}-${Date.now()}.pdf`);
            await ref.put(file);
            const url = await ref.getDownloadURL();

            await db.collection("orders").doc(orderId).update({ shippingLabelUrl: url });
            showToast("Versandetikett erfolgreich hochgeladen.");

            renderAll();
        } catch (error) {
            showToast("Fehler: " + error.message);
        }
    }
});
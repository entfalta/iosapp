const GAME_CONSENT_KEY = "entfalta_cookie_consent";
const GAME_GA_ID = "G-EVXWLFFWDN";
const GAME_STATS_KEY = "entfalta_game_stats";
const GAME_NICKNAME_KEY = "entfalta_game_nickname";

let gameNicknameProfile = null;
let gameNicknameBlacklist = [];
let gameScores = [];
let friendRequests = [];
let gameFriends = [];
let unsubscribeGameNickname = null;
let unsubscribeGameBlacklist = null;
let unsubscribeGameScores = null;
let unsubscribeFriendRequests = null;
let unsubscribeGameFriends = null;

const emotionPairs = [
  {
    id: "overwhelmed",
    emotion: "Überfordert",
    situation: "Viele Geräusche und Aufgaben auf einmal",
    feedback: "Viele Eindrücke auf einmal können sich überfordernd anfühlen."
  },
  {
    id: "focused",
    emotion: "Konzentriert",
    situation: "In Ruhe an einem kniffligen Puzzle arbeiten",
    feedback: "Bei einer spannenden Aufgabe kann man ganz konzentriert sein."
  },
  {
    id: "happy",
    emotion: "Fröhlich",
    situation: "Ein Freund kommt zum gemeinsamen Spielen",
    feedback: "Gemeinsame Zeit kann sich fröhlich und leicht anfühlen."
  },
  {
    id: "sad",
    emotion: "Traurig",
    situation: "Das liebste Spielzeug geht kaputt",
    feedback: "Wenn etwas Wichtiges kaputtgeht, kann man traurig sein."
  },
  {
    id: "worried",
    emotion: "Besorgt",
    situation: "Der erste Tag in einer neuen Gruppe beginnt",
    feedback: "Etwas Neues kann spannend sein und zugleich Sorgen machen."
  },
  {
    id: "calm",
    emotion: "Ruhig",
    situation: "An einem stillen Platz ein Buch lesen",
    feedback: "Ein ruhiger Ort kann helfen, sich entspannt zu fühlen."
  },
  {
    id: "proud",
    emotion: "Stolz",
    situation: "Ein schwieriges Bild ist endlich fertig",
    feedback: "Nach viel Mühe kann man stolz auf das Ergebnis sein."
  },
  {
    id: "frustrated",
    emotion: "Frustriert",
    situation: "Der Turm fällt immer wieder um",
    feedback: "Wenn etwas nicht klappt, kann das frustrierend sein."
  }
];

const gameState = {
  pairLimit: 6,
  firstCard: null,
  secondCard: null,
  locked: false,
  moves: 0,
  matched: 0,
  startedAt: 0,
  elapsed: 0,
  timer: null
};

const tidyItems = [
  { id: "box-red-1", label: "rote Box", box: "red", color: "#cc483a" },
  { id: "box-red-2", label: "rote Box", box: "red", color: "#cc483a" },
  { id: "box-blue-1", label: "blaue Box", box: "blue", color: "#5c8eb8" },
  { id: "box-blue-2", label: "blaue Box", box: "blue", color: "#5c8eb8" },
  { id: "box-green-1", label: "grüne Box", box: "green", color: "#3f6f45" },
  { id: "box-green-2", label: "grüne Box", box: "green", color: "#3f6f45" },
  { id: "box-orange-1", label: "orangene Box", box: "orange", color: "#d77d32" },
  { id: "box-orange-2", label: "orangene Box", box: "orange", color: "#d77d32" },
  { id: "box-brown-1", label: "braune Box", box: "brown", color: "#8a5637" },
  { id: "box-brown-2", label: "braune Box", box: "brown", color: "#8a5637" }
];

const tidyLevels = {
  easy: { label: "Leicht", count: 5, boxes: ["red", "blue", "green"] },
  medium: { label: "Mittel", count: 7, boxes: ["red", "blue", "green", "orange"] },
  hard: { label: "Schwer", count: 10, boxes: ["red", "blue", "green", "orange", "brown"] }
};

const tidyBoxes = {
  red: { label: "Rot", color: "#cc483a" },
  blue: { label: "Blau", color: "#5c8eb8" },
  green: { label: "Grün", color: "#3f6f45" },
  orange: { label: "Orange", color: "#d77d32" },
  brown: { label: "Braun", color: "#8a5637" }
};

const tidyState = {
  level: "easy",
  activeId: "",
  solved: 0,
  total: 0,
  startedAt: 0
};

const balloonState = {
  colorIndex: 0,
  size: 0,
  pumping: false,
  floating: false,
  pumpStart: 0,
  frame: 0,
  y: 0,
  x: 0,
  speed: 0,
  currentColor: "#d77d32",
  currentShine: "#ffd3a0"
};

const balloonColors = [
  ["#d77d32", "#ffd3a0"],
  ["#3f6f45", "#bde0a8"],
  ["#5c8eb8", "#d5edff"],
  ["#c85d69", "#ffd3d8"],
  ["#8a5637", "#f2c79d"]
];

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function gameDb() {
  try {
    if (!window.firebase) return null;
    if (!firebase.apps?.length && window.BUCHMARKT_FIREBASE_CONFIG) {
      firebase.initializeApp(window.BUCHMARKT_FIREBASE_CONFIG);
    }
    return firebase.firestore();
  } catch (error) {
    console.warn("Firebase-Spiel-Datenbank noch nicht bereit.", error);
    return null;
  }
}

function gameAuthUser() {
  try {
    return firebase.auth?.().currentUser || null;
  } catch (error) {
    console.warn("Firebase-Spiel-Auth noch nicht bereit.", error);
    return null;
  }
}

function renderGameAccountAvatars() {
  const photo = window.currentProfile?.profilePhotoDataUrl || "";
  document.querySelectorAll(".user-button").forEach((button) => {
    button.classList.toggle("has-profile-photo", Boolean(photo));
    if (photo) button.style.setProperty("--profile-photo", `url(${photo})`);
    else button.style.removeProperty("--profile-photo");
  });
}

async function refreshGameUserProfile(force = false) {
  const user = gameAuthUser();
  const db = gameDb();
  if (!user || !db) {
    window.currentProfile = null;
    renderGameAccountAvatars();
    return null;
  }
  if (window.currentProfile && !force) {
    renderGameAccountAvatars();
    return window.currentProfile;
  }
  const snap = await db.collection("users").doc(user.uid).get().catch(() => null);
  window.currentProfile = snap?.exists ? { id: snap.id, ...snap.data() } : null;
  renderGameAccountAvatars();
  return window.currentProfile;
}

function normalizedNickname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9_-]/g, "");
}

function nicknameValid(value) {
  return /^[a-zA-Z0-9_äöüÄÖÜß-]{3,18}$/.test(String(value || "").trim());
}

function nicknameBlocked(normalized) {
  return gameNicknameBlacklist.some((entry) => {
    if (!entry.active) return false;
    const term = normalizedNickname(entry.value || entry.word || entry.nickname || entry.id);
    if (!term) return false;
    return entry.type === "word" ? normalized.includes(term) : normalized === term;
  });
}

function currentGameName() {
  const page = document.body?.dataset?.page || "";
  if (page === "emotion-memory") return "Emotions-Memory";
  if (page === "tidy-game") return "Chaos-Sortierer";
  if (page === "balloon-game") return "Ballon-Puste";
  return "";
}

function currentGameLevel() {
  const game = currentGameName();
  if (game === "Emotions-Memory") return `${gameState.pairLimit || 6}-paare`;
  if (game === "Chaos-Sortierer") return tidyState.level || "easy";
  if (game === "Ballon-Puste") return "normal";
  return "";
}

function currentRankingKey() {
  const game = currentGameName();
  const level = currentGameLevel();
  return game && level ? `${game}:${level}` : "";
}

function levelLabel(gameName, level) {
  if (gameName === "Emotions-Memory") {
    if (level === "4-paare") return "Leicht";
    if (level === "6-paare") return "Mittel";
    if (level === "8-paare") return "Knifflig";
  }
  if (gameName === "Chaos-Sortierer") return tidyLevels[level]?.label || "Leicht";
  return "Standard";
}

function scoreboardAllowed() {
  return Boolean(currentRankingKey());
}

function isGamesArea() {
  const path = window.location.pathname.replace(/\\/g, "/");
  return path === "/games" || path.endsWith("/games") || path.includes("/games/");
}

function gameWidgetsAllowed() {
  return isGamesArea() && !isNicknameAdminPage();
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [result[index], result[random]] = [result[random], result[index]];
  }
  return result;
}

function faceSvg(id) {
  const expressions = {
    overwhelmed: `
      <path d="M48 63l8-7 8 7M96 63l8-7 8 7" fill="none" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="80" cy="96" rx="13" ry="16" fill="none" stroke="#8a5637" stroke-width="5"/>
      <path d="M124 45l8-13M130 56l16-6M36 45L28 31M29 57l-16-5" stroke="#d77d32" stroke-width="5" stroke-linecap="round"/>
    `,
    focused: `
      <path d="M46 58l20 3M94 61l20-3" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <circle cx="58" cy="72" r="5" fill="#3b2a25"/><circle cx="102" cy="72" r="5" fill="#3b2a25"/>
      <path d="M67 101h26" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
    `,
    happy: `
      <path d="M45 70q12-13 24 0M91 70q12-13 24 0" fill="none" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <path d="M55 93q25 30 50 0" fill="#fffaf0" stroke="#8a5637" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="39" cy="88" r="8" fill="#e99b84" opacity=".65"/><circle cx="121" cy="88" r="8" fill="#e99b84" opacity=".65"/>
    `,
    sad: `
      <circle cx="58" cy="70" r="5" fill="#3b2a25"/><circle cx="102" cy="70" r="5" fill="#3b2a25"/>
      <path d="M55 108q25-25 50 0" fill="none" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
      <path d="M111 76q11 13 0 22q-11-9 0-22" fill="#74b9d1"/>
    `,
    worried: `
      <path d="M45 59l20-6M95 53l20 6" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <circle cx="58" cy="72" r="6" fill="#3b2a25"/><circle cx="102" cy="72" r="6" fill="#3b2a25"/>
      <path d="M58 103q10-10 21 0t22 0" fill="none" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
    `,
    calm: `
      <path d="M45 72q12 10 24 0M91 72q12 10 24 0" fill="none" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <path d="M64 96q16 14 32 0" fill="none" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
    `,
    proud: `
      <path d="M45 64l20-3M95 61l20 3" stroke="#3b2a25" stroke-width="5" stroke-linecap="round"/>
      <circle cx="58" cy="72" r="5" fill="#3b2a25"/><circle cx="102" cy="72" r="5" fill="#3b2a25"/>
      <path d="M55 94q25 24 50 0" fill="none" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
      <path d="M80 22l4 9 10 1-8 7 2 10-8-5-9 5 2-10-8-7 11-1z" fill="#d77d32"/>
    `,
    frustrated: `
      <path d="M43 57l23 8M94 65l23-8" stroke="#3b2a25" stroke-width="6" stroke-linecap="round"/>
      <circle cx="58" cy="73" r="5" fill="#3b2a25"/><circle cx="102" cy="73" r="5" fill="#3b2a25"/>
      <path d="M55 108q25-27 50 0" fill="none" stroke="#8a5637" stroke-width="5" stroke-linecap="round"/>
      <path d="M30 82h13M117 82h13" stroke="#d77d32" stroke-width="6" stroke-linecap="round"/>
    `
  };
  return `
    <svg viewBox="0 0 160 160" role="img" aria-label="Gesichtsausdruck ${escapeHtml(id)}">
      <circle cx="80" cy="82" r="62" fill="#f3c79d" stroke="#8a5637" stroke-width="4"/>
      <path d="M27 72q4-55 53-55t54 55q-14-23-28-35q-30 15-65 8q-10 13-14 27" fill="#70452f"/>
      ${expressions[id] || expressions.calm}
    </svg>
  `;
}

function sceneSvg(id) {
  const scenes = {
    overwhelmed: `
      <rect x="18" y="18" width="54" height="30" rx="6" fill="#fffaf0" stroke="#8a5637" stroke-width="3"/>
      <path d="M29 31h31M28 39h21" stroke="#d77d32" stroke-width="4" stroke-linecap="round"/>
      <rect x="94" y="25" width="48" height="34" rx="6" fill="#fffaf0" stroke="#8a5637" stroke-width="3"/>
      <path d="M104 37h27M104 47h19" stroke="#3f6f45" stroke-width="4" stroke-linecap="round"/>
      <path d="M24 70l-12 6M137 71l13 7M19 92H7M141 94h13" stroke="#d77d32" stroke-width="4" stroke-linecap="round"/>
      <circle cx="80" cy="86" r="25" fill="#f3c79d"/><path d="M58 81q5-25 22-25t23 25q-15-13-45 0" fill="#70452f"/>
      <path d="M64 88l8-6 8 6M88 88l8-6 8 6" stroke="#3b2a25" stroke-width="4" fill="none"/>
      <ellipse cx="84" cy="104" rx="8" ry="10" fill="none" stroke="#8a5637" stroke-width="4"/>
      <path d="M48 151q3-35 32-35t33 35" fill="#6f8f55"/>
    `,
    focused: `
      <rect x="22" y="110" width="116" height="14" rx="5" fill="#8a5637"/>
      <path d="M38 124v28M124 124v28" stroke="#70452f" stroke-width="7"/>
      <circle cx="80" cy="55" r="24" fill="#f3c79d"/><path d="M57 52q5-23 23-23t24 23q-23-12-47 0" fill="#70452f"/>
      <circle cx="72" cy="61" r="3"/><circle cx="90" cy="61" r="3"/><path d="M74 75h15" stroke="#8a5637" stroke-width="3"/>
      <path d="M54 111q3-35 27-35t28 35" fill="#3f6f45"/>
      <rect x="55" y="91" width="51" height="22" rx="3" fill="#fffaf0" stroke="#d77d32" stroke-width="3"/>
      <path d="M66 102l8-7 8 8 8-8 7 7" fill="none" stroke="#6f8f55" stroke-width="3"/>
    `,
    happy: `
      <path d="M27 63V32M21 35q6-17 12 0q-6 9-12 0M133 66V28M125 32q8-19 16 0q-8 10-16 0" fill="#d77d32" stroke="#8a5637" stroke-width="3"/>
      <rect x="58" y="102" width="48" height="39" rx="4" fill="#d77d32" stroke="#8a5637" stroke-width="3"/>
      <path d="M82 102v39M58 116h48" stroke="#fffaf0" stroke-width="5"/>
      <circle cx="82" cy="67" r="26" fill="#f3c79d"/><path d="M58 63q4-23 24-23t25 23q-25-13-49 0" fill="#70452f"/>
      <path d="M67 72q7-8 14 0M88 72q7-8 14 0M70 84q12 15 24 0" fill="none" stroke="#3b2a25" stroke-width="4" stroke-linecap="round"/>
    `,
    sad: `
      <path d="M47 114l28-24 15 18 23-21" fill="none" stroke="#8a5637" stroke-width="8" stroke-linecap="round"/>
      <path d="M75 90l5 15-15 7M90 108l-7 13 15 7" fill="none" stroke="#d77d32" stroke-width="4"/>
      <circle cx="80" cy="55" r="25" fill="#f3c79d"/><path d="M57 52q4-22 23-22t24 22q-21-12-47 0" fill="#70452f"/>
      <circle cx="71" cy="60" r="3"/><circle cx="91" cy="60" r="3"/><path d="M69 76q11-11 23 0" fill="none" stroke="#8a5637" stroke-width="3"/>
      <path d="M99 64q8 9 0 16q-8-7 0-16" fill="#74b9d1"/>
    `,
    worried: `
      <rect x="88" y="31" width="53" height="96" rx="4" fill="#fffaf0" stroke="#8a5637" stroke-width="4"/>
      <path d="M98 47h33M98 59h25" stroke="#3f6f45" stroke-width="4"/>
      <circle cx="55" cy="65" r="24" fill="#f3c79d"/><path d="M33 61q4-21 22-21t24 21q-21-12-46 0" fill="#70452f"/>
      <path d="M44 61l8-4M61 57l8 4" stroke="#3b2a25" stroke-width="3"/><circle cx="49" cy="68" r="3"/><circle cx="65" cy="68" r="3"/><path d="M47 82q9-8 18 0" fill="none" stroke="#8a5637" stroke-width="3"/>
      <path d="M30 140q2-49 26-49t28 49" fill="#d77d32"/><path d="M24 103l-9 28h20" fill="#6f8f55"/>
    `,
    calm: `
      <path d="M24 145q13-40 57-40t59 40" fill="#6f8f55" opacity=".55"/>
      <path d="M123 107V42M123 55q-19-15-32 3M123 68q20-14 29 2" fill="none" stroke="#3f6f45" stroke-width="7" stroke-linecap="round"/>
      <circle cx="66" cy="67" r="25" fill="#f3c79d"/><path d="M43 64q4-23 23-23t25 23q-21-12-48 0" fill="#70452f"/>
      <path d="M51 70q7 6 14 0M72 70q7 6 14 0M57 84q10 8 20 0" fill="none" stroke="#3b2a25" stroke-width="3" stroke-linecap="round"/>
      <path d="M35 139q4-45 31-45t32 45" fill="#3f6f45"/>
      <path d="M45 112q20-13 41 0v25q-20-11-41 0z" fill="#fffaf0" stroke="#d77d32" stroke-width="3"/>
    `,
    proud: `
      <rect x="91" y="31" width="53" height="65" rx="4" fill="#fffaf0" stroke="#8a5637" stroke-width="4"/>
      <path d="M117 42l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#d77d32"/>
      <circle cx="56" cy="68" r="25" fill="#f3c79d"/><path d="M33 64q4-23 23-23t25 23q-22-12-48 0" fill="#70452f"/>
      <circle cx="48" cy="70" r="3"/><circle cx="66" cy="70" r="3"/><path d="M45 83q11 13 23 0" fill="none" stroke="#8a5637" stroke-width="4"/>
      <path d="M29 145q4-50 28-50t29 50" fill="#d77d32"/><path d="M82 111l14-18M31 111L18 94" stroke="#f3c79d" stroke-width="8" stroke-linecap="round"/>
    `,
    frustrated: `
      <rect x="23" y="116" width="35" height="25" rx="3" fill="#d77d32" transform="rotate(-13 23 116)"/>
      <rect x="104" y="121" width="34" height="22" rx="3" fill="#6f8f55" transform="rotate(16 104 121)"/>
      <rect x="80" y="105" width="28" height="24" rx="3" fill="#e7bd58" transform="rotate(29 80 105)"/>
      <circle cx="78" cy="55" r="25" fill="#f3c79d"/><path d="M55 51q4-23 23-23t25 23q-22-12-48 0" fill="#70452f"/>
      <path d="M63 58l12 5M91 63l12-5" stroke="#3b2a25" stroke-width="4"/><circle cx="68" cy="68" r="3"/><circle cx="96" cy="68" r="3"/><path d="M65 84q13-13 27 0" fill="none" stroke="#8a5637" stroke-width="4"/>
      <path d="M48 119q4-34 30-34t31 34" fill="#3f6f45"/>
    `
  };
  return `
    <svg viewBox="0 0 160 160" role="img" aria-label="Alltagssituation">
      <rect x="3" y="3" width="154" height="154" rx="18" fill="#eef0df" stroke="#6f8f55" stroke-width="3"/>
      ${scenes[id] || scenes.calm}
    </svg>
  `;
}

function createDeck(pairLimit) {
  const selected = emotionPairs.slice(0, pairLimit);
  return shuffle(selected.flatMap((pair) => [
    { key: `${pair.id}-emotion`, pairId: pair.id, type: "emotion", label: pair.emotion },
    { key: `${pair.id}-situation`, pairId: pair.id, type: "situation", label: pair.situation }
  ]));
}

function cardMarkup(card) {
  const visual = card.type === "emotion" ? faceSvg(card.pairId) : sceneSvg(card.pairId);
  return `
    <button class="memory-card" type="button" data-key="${card.key}" data-pair="${card.pairId}" data-type="${card.type}" aria-label="Verdeckte Karte">
      <span class="card-face card-front"><span class="card-question" aria-hidden="true">?</span></span>
      <span class="card-face card-back">
        <span class="card-visual" aria-hidden="true">${visual}</span>
        <span class="card-label">${escapeHtml(card.label)}</span>
      </span>
    </button>
  `;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateStatus() {
  if (!$("#moveCount")) return;
  $("#moveCount").textContent = String(gameState.moves);
  $("#pairCount").textContent = `${gameState.matched} / ${gameState.pairLimit}`;
  $("#timeCount").textContent = formatTime(gameState.elapsed);
}

function setMessage(text) {
  const node = $("#memoryMessage");
  if (!node) return;
  node.textContent = text || "";
  node.setAttribute("aria-label", text || "Spielmeldung");
}

function startTimer() {
  if (gameState.timer) return;
  gameState.startedAt = Date.now();
  gameState.timer = window.setInterval(() => {
    gameState.elapsed = Math.floor((Date.now() - gameState.startedAt) / 1000);
    updateStatus();
  }, 1000);
}

function stopTimer() {
  window.clearInterval(gameState.timer);
  gameState.timer = null;
}

function resetTurn() {
  gameState.firstCard = null;
  gameState.secondCard = null;
  gameState.locked = false;
}

function finishGame() {
  stopTimer();
  saveGameResult("Emotions-Memory", {
    moves: gameState.moves,
    pairs: gameState.pairLimit,
    seconds: gameState.elapsed,
    level: currentGameLevel()
  });
  const dialog = $("#winDialog");
  const summary = $("#winSummary");
  if (summary) summary.textContent = `${gameState.moves} Züge in ${formatTime(gameState.elapsed)}.`;
  dialog?.classList.remove("hidden");
}

function readGameStats() {
  try {
    return JSON.parse(localStorage.getItem(GAME_STATS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeGameStats(entries) {
  localStorage.setItem(GAME_STATS_KEY, JSON.stringify(entries.slice(-80)));
}

async function saveGameResult(gameName, details = {}) {
  const rankingKey = details.rankingKey || `${gameName}:${details.level || "normal"}`;
  const scoreValue = scoreValueForGame(gameName, details);
  const entry = {
    game: gameName,
    level: details.level || "normal",
    rankingKey,
    moves: Number(details.moves || 0),
    pairs: Number(details.pairs || 0),
    seconds: Number(details.seconds || 0),
    score: Number(details.score || 0),
    scoreValue,
    finishedAt: new Date().toISOString()
  };
  const entries = readGameStats();
  entries.push(entry);
  writeGameStats(entries);

  try {
    const user = gameAuthUser();
    if (!user || user.isAnonymous) return;
    const db = gameDb();
    await db.collection("users").doc(user.uid).collection("gameStats").add({
      ...entry,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    if (gameNicknameProfile?.nickname && !gameNicknameProfile.blocked) {
      const scoreRef = db.collection("gameScores").doc(`${rankingKey}_${user.uid}`);
      const oldScore = await scoreRef.get();
      const oldValue = Number(oldScore.exists ? oldScore.data()?.scoreValue || 0 : 0);
      if (oldScore.exists && oldValue >= scoreValue) {
        renderGameScoreboard();
        return;
      }
      await scoreRef.set({
        ...entry,
        userId: user.uid,
        nickname: gameNicknameProfile.nickname,
        nicknameNormalized: gameNicknameProfile.normalized,
        scoreLabel: scoreLabelForEntry(entry),
        scoreTime: scoreTimeForEntry(entry),
        scoreDetail: scoreDetailForEntry(entry),
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch {
    // Lokale Statistik bleibt erhalten, auch wenn Firebase gerade nicht erreichbar ist.
  }
  renderGameScoreboard();
}

function scoreValueForGame(gameName, details = {}) {
  if (gameName === "Emotions-Memory") {
    const moves = Number(details.moves || 99);
    const seconds = Number(details.seconds || 0);
    return Math.max(1, 20000 - moves * 240 - seconds * 10);
  }
  if (gameName === "Chaos-Sortierer") {
    const score = Number(details.score || 0);
    const seconds = Number(details.seconds || 0);
    return Math.max(1, score * 1000 - seconds * 12);
  }
  return Math.max(1, Number(details.score || 0) * 100);
}

function scoreLabelForEntry(entry) {
  return `${scoreTimeForEntry(entry)} ${scoreDetailForEntry(entry)}`.trim();
}

function scoreTimeForEntry(entry) {
  return formatTime(Number(entry.seconds || 0));
}

function scoreDetailForEntry(entry) {
  if (entry.game === "Emotions-Memory") return `${Number(entry.moves || 0)} Züge`;
  if (entry.game === "Chaos-Sortierer") return `${Number(entry.score || 0)} Teile`;
  return `${Number(entry.score || 0)}%`;
}

function renderStatsPage() {
  const list = $("#gameStatsList");
  const summary = $("#gameStatsSummary");
  if (!list) return;
  const entries = readGameStats().reverse();
  const finished = entries.length;
  const best = entries.reduce((winner, entry) => {
    if (!winner) return entry;
    if (entry.pairs > winner.pairs) return entry;
    if (entry.pairs === winner.pairs && entry.moves < winner.moves) return entry;
    return winner;
  }, null);
  if (summary) {
    summary.innerHTML = `
      <div><strong>${finished}</strong><span>gespielte Runden</span></div>
      <div><strong>${best ? `${best.moves}` : "0"}</strong><span>bester Zugwert</span></div>
      <div><strong>${best ? formatTime(best.seconds) : "0:00"}</strong><span>beste Zeit</span></div>
    `;
  }
  list.innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="game-stat-card">
        <h2>${escapeHtml(entry.game)}</h2>
        <p>${escapeHtml(new Date(entry.finishedAt).toLocaleDateString("de-DE"))}</p>
        <p>${entry.pairs ? `${entry.pairs} Paare, ` : ""}${entry.moves ? `${entry.moves} Züge, ` : ""}${entry.score ? `${entry.score} Punkte, ` : ""}${formatTime(entry.seconds)}</p>
      </article>
    `).join("")
    : `<p class="muted">Noch keine Spielrunde gespeichert.</p>`;
}

function boxLabel(boxId) {
  return tidyBoxes[boxId]?.label || "Box";
}

function iconForItem(item) {
  return `<span class="tidy-color-cube" style="--item-color:${item.color}"></span>`;
}

function tidyItemMarkup(item, index) {
  const left = 6 + ((index * 23) % 72);
  const top = 10 + ((index * 31) % 66);
  return `
    <button class="tidy-item" type="button" data-tidy-item="${item.id}" data-box="${item.box}" style="--x:${left}%;--y:${top}%;--item-color:${item.color}" aria-label="${escapeHtml(item.label)}">
      ${iconForItem(item)}
      <span class="sr-only">${escapeHtml(item.label)}</span>
    </button>
  `;
}

function tidyBoxMarkup(boxId) {
  return `
    <section class="tidy-box" data-tidy-box="${boxId}" style="--box-color:${tidyBoxes[boxId]?.color || "#3f6f45"}" aria-label="${escapeHtml(boxLabel(boxId))}">
      <strong aria-hidden="true" style="--item-color:${tidyBoxes[boxId]?.color || "#3f6f45"}"><span class="tidy-color-cube"></span></strong>
      <span class="tidy-box-count">0</span>
    </section>
  `;
}

function startTidy(level = tidyState.level) {
  const board = $("#tidyBoard");
  const boxes = $("#tidyBoxes");
  if (!board || !boxes) return;
  const config = tidyLevels[level] || tidyLevels.easy;
  const pool = tidyItems.filter((item) => config.boxes.includes(item.box));
  const selected = shuffle(pool).slice(0, config.count);
  tidyState.level = level;
  tidyState.activeId = "";
  tidyState.solved = 0;
  tidyState.total = selected.length;
  tidyState.startedAt = Date.now();
  board.innerHTML = selected.map(tidyItemMarkup).join("");
  boxes.innerHTML = config.boxes.map(tidyBoxMarkup).join("");
  $("#tidyProgress").textContent = `0 / ${selected.length}`;
  $("#tidyMessage").textContent = "Ziehe einen Gegenstand in die passende Box.";
  document.querySelectorAll("[data-tidy-level]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tidyLevel === level);
  });
  renderGameScoreboard();
}

function finishTidyIfDone() {
  if (tidyState.solved < tidyState.total) return;
  const seconds = Math.max(1, Math.round((Date.now() - tidyState.startedAt) / 1000));
  $("#tidyMessage").textContent = `Alles aufgeräumt in ${formatTime(seconds)}.`;
  saveGameResult("Chaos-Sortierer", { score: tidyState.total, seconds, level: tidyState.level });
}

function moveTidyItem(item, event) {
  item.style.left = `${event.clientX}px`;
  item.style.top = `${event.clientY}px`;
}

function dropTidyItem(item, event) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-tidy-box]");
  if (target && target.dataset.tidyBox === item.dataset.box) {
    item.classList.remove("is-dragging");
    item.classList.add("is-sorted");
    item.style.left = "";
    item.style.top = "";
    target.appendChild(item);
    const count = target.querySelectorAll(".tidy-item.is-sorted").length;
    target.querySelector(".tidy-box-count").textContent = String(count);
    tidyState.solved += 1;
    $("#tidyProgress").textContent = `${tidyState.solved} / ${tidyState.total}`;
    $("#tidyMessage").textContent = "Genau richtig.";
    finishTidyIfDone();
  } else {
    item.classList.remove("is-dragging");
    item.style.left = "";
    item.style.top = "";
    $("#tidyMessage").textContent = "Fast. Schau nochmal, welche Box passt.";
  }
}

function initTidyGame() {
  const board = $("#tidyBoard");
  if (!board) return;
  document.querySelectorAll("[data-tidy-level]").forEach((button) => {
    button.addEventListener("click", () => startTidy(button.dataset.tidyLevel));
  });
  $("#restartTidy")?.addEventListener("click", () => startTidy());
  board.addEventListener("pointerdown", (event) => {
    const item = event.target.closest("[data-tidy-item]");
    if (!item || item.classList.contains("is-sorted")) return;
    tidyState.activeId = item.dataset.tidyItem;
    item.classList.add("is-dragging");
    item.setPointerCapture?.(event.pointerId);
    moveTidyItem(item, event);
  });
  board.addEventListener("pointermove", (event) => {
    const item = tidyState.activeId ? document.querySelector(`[data-tidy-item="${tidyState.activeId}"]`) : null;
    if (item?.classList.contains("is-dragging")) moveTidyItem(item, event);
  });
  board.addEventListener("pointerup", (event) => {
    const item = tidyState.activeId ? document.querySelector(`[data-tidy-item="${tidyState.activeId}"]`) : null;
    tidyState.activeId = "";
    if (item?.classList.contains("is-dragging")) {
      dropTidyItem(item, event);
    }
  });
  startTidy("easy");
}

function nextBalloonColor() {
  balloonState.colorIndex = (balloonState.colorIndex + 1) % balloonColors.length;
  const [main, shine] = balloonColors[balloonState.colorIndex];
  balloonState.currentColor = main;
  balloonState.currentShine = shine;
  document.documentElement.style.setProperty("--balloon-color", main);
  document.documentElement.style.setProperty("--balloon-shine", shine);
}

function renderBalloon() {
  const balloon = $("#balloonShape");
  if (!balloon) return;
  const visualScale = 0.18 + balloonState.size * 2.18;
  balloon.style.transform = `translate(${balloonState.x}px, ${balloonState.y}px) scale(${visualScale})`;
}

function popBalloon() {
  const balloon = $("#balloonShape");
  const confetti = $("#balloonConfetti");
  if (!balloon || !confetti) return;
  balloonState.pumping = false;
  balloonState.floating = false;
  cancelAnimationFrame(balloonState.frame);
  balloon.classList.add("is-popped");
  confetti.innerHTML = Array.from({ length: 30 }, (_, index) => `<span style="--a:${index * 12}deg;--d:${58 + (index % 6) * 16}px;--r:${index * 19}deg"></span>`).join("");
  $("#balloonMessage").textContent = "Plopp! Nach 5 Sekunden platzt er.";
  window.setTimeout(resetBalloon, 1150);
}

function launchFlyingBalloon(size, seconds) {
  const sky = $("#balloonStage .balloon-sky");
  const source = $("#balloonShape");
  if (!sky || !source) return;
  const flyer = source.cloneNode(true);
  flyer.removeAttribute("id");
  flyer.classList.remove("is-popped");
  flyer.classList.add("balloon-flyer");
  flyer.style.setProperty("--fly-scale", String(0.18 + size * 2.18));
  flyer.style.setProperty("--fly-drift", `${Math.round((size - 0.5) * 140)}px`);
  flyer.style.setProperty("--fly-duration", `${Math.max(2.8, 5.2 - size * 1.8)}s`);
  flyer.style.setProperty("--balloon-color", balloonState.currentColor);
  flyer.style.setProperty("--balloon-shine", balloonState.currentShine);
  sky.appendChild(flyer);
  flyer.addEventListener("animationend", () => {
    flyer.remove();
    saveGameResult("Ballon-Puste", { score: Math.round(size * 100), seconds, level: "normal" });
  }, { once: true });
}

function resetBalloon() {
  cancelAnimationFrame(balloonState.frame);
  balloonState.size = 0;
  balloonState.y = 0;
  balloonState.x = 0;
  balloonState.speed = 0;
  balloonState.pumping = false;
  balloonState.floating = false;
  nextBalloonColor();
  $("#balloonShape")?.classList.remove("is-popped");
  $("#balloonShape")?.classList.remove("is-waiting-next");
  $("#balloonConfetti") && ($("#balloonConfetti").innerHTML = "");
  $("#balloonMessage").textContent = "Halte gedrückt oder halte die Leertaste.";
  renderBalloon();
}

function balloonLoop() {
  const now = Date.now();
  if (balloonState.pumping) {
    const held = (now - balloonState.pumpStart) / 1000;
    if (held >= 5) {
      popBalloon();
      return;
    }
    balloonState.size = Math.min(1, held / 5);
    balloonState.y = Math.sin(now / 160) * 3;
    $("#balloonMessage").textContent = "Weiter aufblasen und rechtzeitig loslassen.";
  } else if (balloonState.floating) {
    return;
  }
  renderBalloon();
  balloonState.frame = requestAnimationFrame(balloonLoop);
}

function startPump() {
  if (balloonState.pumping || balloonState.floating) return;
  balloonState.pumping = true;
  balloonState.pumpStart = Date.now();
  balloonState.frame = requestAnimationFrame(balloonLoop);
  $("#pumpButton")?.classList.add("is-active");
}

function releasePump() {
  if (!balloonState.pumping) return;
  const heldMs = Date.now() - balloonState.pumpStart;
  balloonState.pumping = false;
  cancelAnimationFrame(balloonState.frame);
  $("#pumpButton")?.classList.remove("is-active");
  if (heldMs < 900 || balloonState.size < 0.16) {
    resetBalloon();
    return;
  }
  const releasedSize = Math.max(0.16, balloonState.size);
  const seconds = Math.max(1, Math.round(heldMs / 1000));
  balloonState.floating = true;
  launchFlyingBalloon(releasedSize, seconds);
  $("#balloonShape")?.classList.add("is-waiting-next");
  $("#balloonMessage").textContent = "Der Ballon schwebt los. Gleich kann der nächste starten.";
  window.setTimeout(resetBalloon, 500);
}

function initBalloonGame() {
  const stage = $("#balloonStage");
  if (!stage) return;
  resetBalloon();
  const pump = $("#pumpButton");
  const isTypingTarget = (target) => target instanceof Element && target.closest("input, textarea, select");
  pump?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pump.setPointerCapture?.(event.pointerId);
    startPump();
  });
  pump?.addEventListener("pointerup", releasePump);
  pump?.addEventListener("pointercancel", releasePump);
  const blockSpaceScroll = (event) => {
    if (event.code === "Space" && !isTypingTarget(event.target)) {
      event.preventDefault();
    }
  };
  document.addEventListener("keydown", blockSpaceScroll, true);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && !isTypingTarget(event.target)) {
      event.preventDefault();
      startPump();
    }
  }, { passive: false });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space" && !isTypingTarget(event.target)) {
      event.preventDefault();
      releasePump();
    }
  }, { passive: false });
}

function updateGameAccountNav() {
  const statsLink = $("#gameStatsNavLink");
  if (!statsLink) return;
  const user = gameAuthUser();
  statsLink.classList.toggle("hidden", !user || user.isAnonymous);
}

function ensureGameWidgets() {
  if (!gameWidgetsAllowed()) return;
  if (scoreboardAllowed() && !$("#gameScoreboardWidget")) {
    document.body.insertAdjacentHTML("beforeend", `
      <aside id="gameScoreboardWidget" class="game-scoreboard-widget">
        <button id="gameScoreboardToggle" class="game-widget-toggle" type="button" aria-expanded="false">Scoreboard</button>
        <section id="gameScoreboardPanel" class="game-widget-panel hidden" aria-label="Scoreboard">
          <h2>Top 10</h2>
          <div id="gameScoreboardList"></div>
          <p id="gameScoreboardOwn" class="muted"></p>
        </section>
      </aside>
    `);
    $("#gameScoreboardToggle")?.addEventListener("click", () => {
      const panel = $("#gameScoreboardPanel");
      const open = panel?.classList.toggle("hidden") === false;
      $("#gameScoreboardToggle")?.setAttribute("aria-expanded", String(open));
    });
    $("#gameScoreboardList")?.addEventListener("click", (event) => {
      const target = event.target.closest("[data-score-delete]");
      if (target) deleteScoreEntry(target.dataset.scoreDelete);
    });
  }
  if (!scoreboardAllowed()) $("#gameScoreboardWidget")?.remove();
  if (!$("#gameFriendsWidget")) {
    document.body.insertAdjacentHTML("beforeend", `
      <aside id="gameFriendsWidget" class="game-friends-widget">
        <button id="gameFriendsToggle" class="game-widget-toggle" type="button" aria-expanded="false">Freunde</button>
        <section id="gameFriendsPanel" class="game-widget-panel hidden" aria-label="Freundesliste">
          <h2>Freunde</h2>
          <form id="gameFriendForm" class="compact-form">
            <input name="nickname" placeholder="Nickname suchen" autocomplete="off">
            <button type="submit">Anfragen</button>
          </form>
          <div id="gameFriendList"></div>
        </section>
      </aside>
    `);
    $("#gameFriendsToggle")?.addEventListener("click", () => {
      const panel = $("#gameFriendsPanel");
      const open = panel?.classList.toggle("hidden") === false;
      $("#gameFriendsToggle")?.setAttribute("aria-expanded", String(open));
      renderFriendsWidget();
    });
    $("#gameFriendForm")?.addEventListener("submit", sendFriendRequest);
    $("#gameFriendList")?.addEventListener("click", handleFriendListClick);
  }
}

function ensureNicknameDialog() {
  if ($("#gameNicknameModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="gameNicknameModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="gameNicknameTitle">
      <div class="modal-content game-nickname-modal">
        <h2 id="gameNicknameTitle">Spiel-Nickname</h2>
        <p>Wähle einen Namen fürs Ranking und für Freunde.</p>
        <form id="gameNicknameForm" class="stacked-form">
          <input name="nickname" placeholder="Nickname" minlength="3" maxlength="18" required>
          <button type="submit">Speichern</button>
        </form>
      </div>
    </div>
  `);
  $("#gameNicknameForm")?.addEventListener("submit", saveGameNickname);
}

function showNicknameDialog(force = false) {
  if (!isGamesArea()) return;
  const user = gameAuthUser();
  const needs = user && !user.isAnonymous && (!gameNicknameProfile?.nickname || gameNicknameProfile?.blocked);
  $("#gameNicknameModal")?.classList.toggle("hidden", !(force || needs));
}

async function saveGameNickname(event) {
  event.preventDefault();
  const user = gameAuthUser();
  const db = gameDb();
  if (!user || !db) return showToast("Bitte erst einloggen.");
  const nickname = new FormData(event.currentTarget).get("nickname").toString().trim();
  const normalized = normalizedNickname(nickname);
  if (!nicknameValid(nickname)) return showToast("Nickname: 3-18 Zeichen, Buchstaben/Zahlen/_/-.");
  if (nicknameBlocked(normalized)) return showToast("Dieser Nickname ist nicht erlaubt.");
  try {
    const used = await db.collection("gameNicknames").where("normalized", "==", normalized).limit(1).get();
    const takenByOther = used.docs.some((doc) => doc.id !== user.uid && !doc.data()?.blocked);
    if (takenByOther) return showToast("Dieser Nickname ist schon vergeben.");
    await db.collection("gameNicknames").doc(user.uid).set({
      userId: user.uid,
      email: user.email || "",
      nickname,
      normalized,
      avatarDataUrl: window.currentProfile?.profilePhotoPublic ? (window.currentProfile?.profilePhotoDataUrl || "") : "",
      avatarPublic: Boolean(window.currentProfile?.profilePhotoPublic),
      blocked: false,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.setItem(GAME_NICKNAME_KEY, nickname);
    gameNicknameProfile = { userId: user.uid, nickname, normalized, blocked: false };
    $("#gameNicknameModal")?.classList.add("hidden");
    showToast("Nickname gespeichert.");
    listenGameScores();
    listenFriends();
  } catch (error) {
    showToast(error?.message || "Nickname konnte nicht gespeichert werden.");
  }
}

function listenGameNickname() {
  const user = gameAuthUser();
  const db = gameDb();
  if (unsubscribeGameNickname) {
    unsubscribeGameNickname();
    unsubscribeGameNickname = null;
  }
  gameNicknameProfile = null;
  if (!user || user.isAnonymous || !db) {
    showNicknameDialog(false);
    return;
  }
  unsubscribeGameNickname = db.collection("gameNicknames").doc(user.uid).onSnapshot((doc) => {
    gameNicknameProfile = doc.exists ? { id: doc.id, ...doc.data() } : null;
    showNicknameDialog();
    listenGameScores();
    listenFriends();
  });
}

function listenNicknameBlacklist() {
  const db = gameDb();
  if (!db || unsubscribeGameBlacklist) return;
  unsubscribeGameBlacklist = db.collection("nicknameBlacklist").onSnapshot((snapshot) => {
    gameNicknameBlacklist = snapshot.docs.map((doc) => ({ id: doc.id, active: true, ...doc.data() }));
    showNicknameDialog();
    renderNicknameAdmin();
  });
}

function listenGameScores() {
  const db = gameDb();
  if (!gameWidgetsAllowed()) return;
  if (!db || unsubscribeGameScores) return;
  unsubscribeGameScores = db.collection("gameScores").limit(500).onSnapshot((snapshot) => {
    gameScores = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderGameScoreboard();
  });
}

function scoresForCurrentGame() {
  const rankingKey = currentRankingKey();
  return gameScores
    .filter((entry) => entry.rankingKey === rankingKey)
    .sort((a, b) => Number(b.scoreValue || 0) - Number(a.scoreValue || 0));
}

function renderGameScoreboard() {
  ensureGameWidgets();
  const list = $("#gameScoreboardList");
  const own = $("#gameScoreboardOwn");
  if (!list || !own) return;
  const user = gameAuthUser();
  const byUser = new Map();
  for (const entry of scoresForCurrentGame()) {
    const previous = byUser.get(entry.userId);
    if (!previous || Number(entry.scoreValue || 0) > Number(previous.scoreValue || 0)) byUser.set(entry.userId, entry);
  }
  const scores = [...byUser.values()].sort((a, b) => Number(b.scoreValue || 0) - Number(a.scoreValue || 0));
  const top = scores.slice(0, 10);
  const game = currentGameName();
  const level = currentGameLevel();
  const admin = Boolean(window.currentProfile?.admin);
  $("#gameScoreboardPanel h2") && ($("#gameScoreboardPanel h2").textContent = `Top 10: ${game} - ${levelLabel(game, level)}`);
  list.innerHTML = top.length ? top.map((entry, index) => `
    <div class="score-row ${entry.userId === user?.uid ? "is-own" : ""}">
      <strong>${index + 1}. ${escapeHtml(entry.nickname || "Spieler")}</strong>
      <span>${escapeHtml(entry.scoreTime || scoreTimeForEntry(entry))}</span>
      <span>${escapeHtml(entry.scoreDetail || scoreDetailForEntry(entry))}</span>
      ${admin ? `<button type="button" data-score-delete="${escapeHtml(entry.id)}">Löschen</button>` : ""}
    </div>
  `).join("") : `<p class="muted">Noch keine Scores.</p>`;
  const ownIndex = user ? scores.findIndex((entry) => entry.userId === user.uid) : -1;
  own.textContent = ownIndex >= 0 ? `Dein Platz: ${ownIndex + 1}` : "Dein Platz erscheint nach deinem ersten Score.";
}

async function deleteScoreEntry(scoreId) {
  const db = gameDb();
  if (!db || !window.currentProfile?.admin || !scoreId) return;
  await db.collection("gameScores").doc(scoreId).delete();
  showToast("Score gelöscht.");
}

function listenFriends() {
  const user = gameAuthUser();
  const db = gameDb();
  if (unsubscribeFriendRequests) unsubscribeFriendRequests();
  if (unsubscribeGameFriends) unsubscribeGameFriends();
  unsubscribeFriendRequests = null;
  unsubscribeGameFriends = null;
  friendRequests = [];
  gameFriends = [];
  if (!user || user.isAnonymous || !db || !gameNicknameProfile?.nickname || gameNicknameProfile.blocked) {
    renderFriendsWidget();
    return;
  }
  unsubscribeFriendRequests = db.collection("gameFriendRequests").onSnapshot((snapshot) => {
    friendRequests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((request) => request.fromUid === user.uid || request.toUid === user.uid);
    renderFriendsWidget();
  });
  unsubscribeGameFriends = db.collection("gameFriends").onSnapshot((snapshot) => {
    gameFriends = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((friend) => friend.users?.includes(user.uid));
    renderFriendsWidget();
  });
}

async function sendFriendRequest(event) {
  event.preventDefault();
  const user = gameAuthUser();
  const db = gameDb();
  if (!user || !db || !gameNicknameProfile?.nickname || gameNicknameProfile.blocked) return showToast("Bitte zuerst Nickname festlegen.");
  const targetName = new FormData(event.currentTarget).get("nickname").toString();
  const normalized = normalizedNickname(targetName);
  if (!normalized || normalized === gameNicknameProfile.normalized) return showToast("Bitte einen anderen Nickname eingeben.");
  const targetSnap = await db.collection("gameNicknames").where("normalized", "==", normalized).limit(1).get();
  const target = targetSnap.docs[0];
  if (!target || target.data()?.blocked) return showToast("Nickname nicht gefunden.");
  const targetData = target.data();
  const id = [user.uid, target.id].sort().join("_");
  await db.collection("gameFriendRequests").doc(id).set({
    fromUid: user.uid,
    fromNickname: gameNicknameProfile.nickname,
    fromAvatar: gameNicknameProfile.avatarPublic ? (gameNicknameProfile.avatarDataUrl || "") : "",
    toUid: target.id,
    toNickname: targetData.nickname,
    toAvatar: targetData.avatarPublic ? (targetData.avatarDataUrl || "") : "",
    status: "pending",
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  event.currentTarget.reset();
  showToast("Freundschaftsanfrage gesendet.");
}

async function acceptFriendRequest(requestId) {
  const user = gameAuthUser();
  const db = gameDb();
  const request = friendRequests.find((entry) => entry.id === requestId);
  if (!user || !db || !request || request.toUid !== user.uid) return;
  const id = [request.fromUid, request.toUid].sort().join("_");
  await db.collection("gameFriends").doc(id).set({
    users: [request.fromUid, request.toUid],
    nicknames: {
      [request.fromUid]: request.fromNickname,
      [request.toUid]: request.toNickname
    },
    avatars: {
      [request.fromUid]: request.fromAvatar || "",
      [request.toUid]: request.toAvatar || ""
    },
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await db.collection("gameFriendRequests").doc(requestId).delete();
  showToast("Freund hinzugefügt.");
}

function handleFriendListClick(event) {
  const accept = event.target.closest("[data-friend-accept]");
  const mode = event.target.closest("[data-friend-mode]");
  if (accept) acceptFriendRequest(accept.dataset.friendAccept);
  if (mode) showToast(mode.dataset.friendMode === "versus" ? "Gegeneinander ausgewählt." : "Miteinander ausgewählt.");
}

function friendAvatarMarkup(src = "") {
  return `<span class="friend-avatar ${src ? "has-image" : ""}" style="${src ? `--friend-avatar:url('${escapeHtml(src)}')` : ""}" aria-hidden="true"></span>`;
}

function renderFriendsWidget() {
  const list = $("#gameFriendList");
  if (!list) return;
  const user = gameAuthUser();
  if (!user || user.isAnonymous) {
    list.innerHTML = `<p class="muted">Bitte einloggen, um Freunde zu nutzen.</p>`;
    return;
  }
  if (!gameNicknameProfile?.nickname || gameNicknameProfile.blocked) {
    list.innerHTML = `<p class="muted">Bitte zuerst einen Nickname festlegen.</p>`;
    return;
  }
  const incoming = friendRequests.filter((request) => request.toUid === user.uid && request.status === "pending");
  const outgoing = friendRequests.filter((request) => request.fromUid === user.uid && request.status === "pending");
  const friends = gameFriends.map((friend) => {
    const otherId = friend.users.find((id) => id !== user.uid);
    return { id: friend.id, name: friend.nicknames?.[otherId] || "Freund", avatar: friend.avatars?.[otherId] || "" };
  });
  list.innerHTML = `
    ${incoming.length ? `<h3>Anfragen</h3>${incoming.map((request) => `<div class="friend-row">${friendAvatarMarkup(request.fromAvatar)}<span>${escapeHtml(request.fromNickname)}</span><button type="button" data-friend-accept="${request.id}">Akzeptieren</button></div>`).join("")}` : ""}
    ${outgoing.length ? `<h3>Gesendet</h3>${outgoing.map((request) => `<p class="muted">${escapeHtml(request.toNickname)} wartet noch.</p>`).join("")}` : ""}
    <h3>Freunde</h3>
    ${friends.length ? friends.map((friend) => `
      <div class="friend-row">
        ${friendAvatarMarkup(friend.avatar)}
        <span>${escapeHtml(friend.name)}</span>
        <button type="button" data-friend-mode="versus">Gegeneinander</button>
        <button type="button" data-friend-mode="coop">Miteinander</button>
      </div>
    `).join("") : `<p class="muted">Noch keine Freunde.</p>`}
  `;
}

function isNicknameAdminPage() {
  return Boolean($("#nicknameAdminPanel"));
}

function renderNicknameAdmin() {
  if (!isNicknameAdminPage()) return;
  const user = gameAuthUser();
  const admin = window.currentProfile?.admin;
  const panel = $("#nicknameAdminPanel");
  const status = $("#nicknameAdminStatus");
  if (!panel || !status) return;
  if (!user) {
    panel.classList.add("hidden");
    status.textContent = "Bitte als Admin anmelden.";
    return;
  }
  if (!admin) {
    refreshNicknameAdminProfile();
    panel.classList.add("hidden");
    status.textContent = "Diese Ansicht ist nur für Admins.";
    return;
  }
  panel.classList.remove("hidden");
  status.textContent = "Nicknames und Sperrliste verwalten.";
  const list = $("#nicknameAdminList");
  if (list) {
    list.innerHTML = gameNicknameAdminRows.length ? gameNicknameAdminRows.map((entry) => `
      <article class="admin-item">
        <strong>${escapeHtml(entry.nickname || "Ohne Nickname")}</strong>
        <p>${escapeHtml(entry.email || "")}</p>
        <p class="muted">Account: ${escapeHtml(entry.userId || entry.id)}</p>
        <button type="button" data-nickname-block="${escapeHtml(entry.id)}">${entry.blocked ? "Entsperren" : "Sperren"}</button>
      </article>
    `).join("") : `<p class="muted">Keine Nicknames gefunden.</p>`;
  }
  const blacklist = $("#nicknameBlacklistList");
  if (blacklist) {
    blacklist.innerHTML = gameNicknameBlacklist.length ? gameNicknameBlacklist.map((entry) => `
      <div class="admin-item">
        <strong>${escapeHtml(entry.value || entry.word || entry.nickname || entry.id)}</strong>
        <p>${entry.type === "word" ? "Wort darf nicht enthalten sein" : "Name ist gesperrt"}</p>
        <button type="button" data-blacklist-delete="${escapeHtml(entry.id)}">Löschen</button>
      </div>
    `).join("") : `<p class="muted">Blacklist ist leer.</p>`;
  }
}

async function refreshNicknameAdminProfile() {
  if (window.currentProfile) return;
  await refreshGameUserProfile(true);
  renderNicknameAdmin();
}

let gameNicknameAdminRows = [];
let unsubscribeNicknameAdminRows = null;

function listenNicknameAdminRows() {
  const db = gameDb();
  if (!db || unsubscribeNicknameAdminRows) return;
  unsubscribeNicknameAdminRows = db.collection("gameNicknames").onSnapshot((snapshot) => {
    gameNicknameAdminRows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderNicknameAdmin();
  });
}

async function toggleNicknameBlock(userId) {
  const db = gameDb();
  const row = gameNicknameAdminRows.find((entry) => entry.id === userId);
  if (!db || !row || !window.currentProfile?.admin) return;
  await db.collection("gameNicknames").doc(userId).set({
    blocked: !row.blocked,
    blockedAt: !row.blocked ? window.firebase.firestore.FieldValue.serverTimestamp() : null
  }, { merge: true });
  if (!row.blocked && row.normalized) {
    await db.collection("nicknameBlacklist").doc(`name_${row.normalized}`).set({
      type: "name",
      value: row.nickname,
      normalized: row.normalized,
      active: true,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  showToast(row.blocked ? "Nickname entsperrt." : "Nickname gesperrt.");
}

async function addBlacklistEntry(event) {
  event.preventDefault();
  const db = gameDb();
  if (!db || !window.currentProfile?.admin) return;
  const data = new FormData(event.currentTarget);
  const value = data.get("value").toString().trim();
  const type = data.get("type").toString() === "name" ? "name" : "word";
  const normalized = normalizedNickname(value);
  if (!normalized) return showToast("Bitte einen Wert eintragen.");
  await db.collection("nicknameBlacklist").doc(`${type}_${normalized}`).set({
    type,
    value,
    normalized,
    active: true,
    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  event.currentTarget.reset();
  showToast("Blacklist-Eintrag gespeichert.");
}

async function deleteBlacklistEntry(id) {
  const db = gameDb();
  if (!db || !window.currentProfile?.admin || !id) return;
  await db.collection("nicknameBlacklist").doc(id).delete();
  showToast("Blacklist-Eintrag gelöscht.");
}

function initNicknameAdminPage() {
  if (!isNicknameAdminPage()) return;
  listenNicknameAdminRows();
  $("#nicknameBlacklistForm")?.addEventListener("submit", addBlacklistEntry);
  $("#nicknameAdminPanel")?.addEventListener("click", (event) => {
    const block = event.target.closest("[data-nickname-block]");
    const del = event.target.closest("[data-blacklist-delete]");
    if (block) toggleNicknameBlock(block.dataset.nicknameBlock);
    if (del) deleteBlacklistEntry(del.dataset.blacklistDelete);
  });
  renderNicknameAdmin();
}

function compareCards() {
  const first = gameState.firstCard;
  const second = gameState.secondCard;
  if (!first || !second) return;
  gameState.moves += 1;
  gameState.locked = true;
  const match = first.dataset.pair === second.dataset.pair && first.dataset.type !== second.dataset.type;

  if (match) {
    window.setTimeout(() => {
      first.classList.add("is-matched");
      second.classList.add("is-matched");
      first.setAttribute("aria-disabled", "true");
      second.setAttribute("aria-disabled", "true");
      gameState.matched += 1;
      const pair = emotionPairs.find((entry) => entry.id === first.dataset.pair);
      setMessage(pair?.feedback || "Das passt zusammen!");
      updateStatus();
      resetTurn();
      if (gameState.matched === gameState.pairLimit) window.setTimeout(finishGame, 420);
    }, 360);
  } else {
    setMessage("Das ist noch kein Paar. Schau noch einmal genau hin.");
    window.setTimeout(() => {
      first.classList.remove("is-flipped");
      second.classList.remove("is-flipped");
      first.setAttribute("aria-label", "Verdeckte Karte");
      second.setAttribute("aria-label", "Verdeckte Karte");
      resetTurn();
    }, 900);
  }
  updateStatus();
}

function flipCard(card) {
  if (gameState.locked || card.classList.contains("is-matched") || card === gameState.firstCard) return;
  startTimer();
  card.classList.add("is-flipped");
  const label = card.querySelector(".card-label")?.textContent || "Aufgedeckte Karte";
  card.setAttribute("aria-label", label);
  if (!gameState.firstCard) {
    gameState.firstCard = card;
    setMessage("Finde jetzt die passende Karte.");
    return;
  }
  gameState.secondCard = card;
  compareCards();
}

function startGame(pairLimit = gameState.pairLimit) {
  const board = $("#memoryBoard");
  if (!board) return;
  stopTimer();
  gameState.pairLimit = pairLimit;
  gameState.firstCard = null;
  gameState.secondCard = null;
  gameState.locked = false;
  gameState.moves = 0;
  gameState.matched = 0;
  gameState.startedAt = 0;
  gameState.elapsed = 0;
  board.dataset.cards = String(pairLimit * 2);
  board.innerHTML = createDeck(pairLimit).map(cardMarkup).join("");
  $("#winDialog")?.classList.add("hidden");
  setMessage("Decke zwei Karten auf.");
  updateStatus();
  document.querySelectorAll("[data-pairs]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.pairs) === pairLimit);
  });
  renderGameScoreboard();
}

function showToast(text) {
  const toast = $("#gameToast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 3200);
}

function consentValue() {
  return localStorage.getItem(GAME_CONSENT_KEY);
}

function setAnalyticsDisabled(disabled) {
  window[`ga-disable-${GAME_GA_ID}`] = disabled;
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: disabled ? "denied" : "granted" });
  }
}

function loadAnalytics() {
  if (consentValue() !== "accepted" || window.entfaltaGameAnalyticsLoaded) return;
  window.entfaltaGameAnalyticsLoaded = true;
  setAnalyticsDisabled(false);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GAME_GA_ID);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GAME_GA_ID}`;
  document.head.appendChild(script);
}

function showConsent() {
  if ($("#gameConsent")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="gameConsentOverlay" class="consent-overlay"></div>
    <section id="gameConsent" class="consent-panel" role="dialog" aria-modal="true" aria-labelledby="gameConsentTitle">
      <h2 id="gameConsentTitle">Cookies & Analyse</h2>
      <p>Google Analytics wird erst nach „Zulassen“ geladen. Mehr dazu steht im <a href="../datenschutz.html">Datenschutz</a>.</p>
      <div class="consent-actions">
        <button type="button" data-consent="rejected">Ablehnen</button>
        <button type="button" data-consent="accepted">Zulassen</button>
      </div>
    </section>
  `);
  $("#gameConsent")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-consent]");
    if (!button) return;
    const value = button.dataset.consent;
    localStorage.setItem(GAME_CONSENT_KEY, value);
    $("#gameConsent")?.remove();
    $("#gameConsentOverlay")?.remove();
    if (value === "accepted") loadAnalytics();
    else setAnalyticsDisabled(true);
  });
}

function initConsent() {
  const allowed = consentValue() === "accepted";
  setAnalyticsDisabled(!allowed);
  if (allowed) loadAnalytics();
  else if (!consentValue()) showConsent();
}

function initMemory() {
  const board = $("#memoryBoard");
  if (!board) return;
  board.addEventListener("click", (event) => {
    const card = event.target.closest(".memory-card");
    if (card) flipCard(card);
  });
  document.querySelectorAll("[data-pairs]").forEach((button) => {
    button.addEventListener("click", () => startGame(Number(button.dataset.pairs)));
  });
  $("#restartGame")?.addEventListener("click", () => startGame());
  $("#playAgain")?.addEventListener("click", () => startGame());
  startGame(6);
}

document.addEventListener("DOMContentLoaded", () => {
  listenNicknameBlacklist();
  if (gameWidgetsAllowed()) {
    ensureGameWidgets();
    listenGameScores();
  }
  if (isGamesArea()) {
    ensureNicknameDialog();
    initMemory();
    initTidyGame();
    initBalloonGame();
    renderStatsPage();
    updateGameAccountNav();
  }
  initNicknameAdminPage();
  window.firebase?.auth?.().onAuthStateChanged?.(async () => {
    await refreshGameUserProfile(true);
    if (isGamesArea()) updateGameAccountNav();
    listenGameNickname();
    initNicknameAdminPage();
    if (gameWidgetsAllowed()) {
      ensureGameWidgets();
      listenGameScores();
      renderGameScoreboard();
    }
    if (isGamesArea()) {
      renderStatsPage();
    }
  });
});

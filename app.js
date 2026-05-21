// ============================================================
// CAT CHAT — App logic
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  onChildAdded,
  onChildChanged,
  set,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  query,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { FIREBASE_CONFIG, ROOM_ID, PROFILES, TENOR_API_KEY } from "./config.js";

// ---------- State ----------
const state = {
  me: null,         // profile object once logged in
  other: null,      // the other profile
  db: null,
  auth: null,
  uid: null,
  ready: false,
  soundOn: true,
  typingTimeout: null,
  selectedProfileId: null,
  messages: new Map(), // msgId -> msgData (for reactions reconciliation)
};

// ---------- Pixel cat SVG builder ----------
function buildCatSVG(profile, options = {}) {
  const { size = 64, pose = "sit" } = options;
  const c = profile.catColor;
  const a = profile.catAccent;
  const e = profile.catEyes;
  const s = profile.eyeShine;
  // Darker shade of body for shading
  const dark = shadeColor(c, -20);

  if (pose === "sit") {
    // 32x32 sitting cat with ears, eyes, body, tail
    return `
      <svg viewBox="0 0 32 32" width="${size}" height="${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <!-- Ears -->
        <rect x="6" y="2" width="4" height="6" fill="${c}"/>
        <rect x="22" y="2" width="4" height="6" fill="${c}"/>
        <rect x="7" y="4" width="2" height="3" fill="${a}"/>
        <rect x="23" y="4" width="2" height="3" fill="${a}"/>
        <!-- Head/Body -->
        <rect x="4" y="6" width="24" height="18" fill="${c}"/>
        <rect x="4" y="6" width="24" height="2" fill="${dark}"/>
        <!-- Eyes -->
        <rect x="9" y="12" width="4" height="4" fill="${e}"/>
        <rect x="19" y="12" width="4" height="4" fill="${e}"/>
        <rect x="10" y="13" width="1" height="1" fill="${s}"/>
        <rect x="20" y="13" width="1" height="1" fill="${s}"/>
        <!-- Nose -->
        <rect x="15" y="17" width="2" height="2" fill="${a}"/>
        <!-- Mouth -->
        <rect x="13" y="19" width="2" height="1" fill="${e}"/>
        <rect x="17" y="19" width="2" height="1" fill="${e}"/>
        <!-- Whiskers -->
        <rect x="1" y="17" width="3" height="1" fill="${e}"/>
        <rect x="28" y="17" width="3" height="1" fill="${e}"/>
        <rect x="1" y="19" width="3" height="1" fill="${e}"/>
        <rect x="28" y="19" width="3" height="1" fill="${e}"/>
        <!-- Body bottom -->
        <rect x="6" y="24" width="20" height="6" fill="${c}"/>
        <rect x="6" y="28" width="20" height="2" fill="${dark}"/>
        <!-- Paws -->
        <rect x="8" y="29" width="4" height="2" fill="${dark}"/>
        <rect x="20" y="29" width="4" height="2" fill="${dark}"/>
        <!-- Tail -->
        <rect x="26" y="22" width="2" height="6" fill="${c}"/>
        <rect x="28" y="18" width="2" height="6" fill="${c}"/>
      </svg>
    `;
  }
  // small avatar version (for messages)
  return `
    <svg viewBox="0 0 32 32" width="${size}" height="${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="4" height="4" fill="${c}"/>
      <rect x="22" y="4" width="4" height="4" fill="${c}"/>
      <rect x="7" y="5" width="2" height="2" fill="${a}"/>
      <rect x="23" y="5" width="2" height="2" fill="${a}"/>
      <rect x="4" y="8" width="24" height="18" fill="${c}"/>
      <rect x="4" y="8" width="24" height="2" fill="${dark}"/>
      <rect x="9" y="13" width="3" height="3" fill="${e}"/>
      <rect x="20" y="13" width="3" height="3" fill="${e}"/>
      <rect x="9" y="13" width="1" height="1" fill="${s}"/>
      <rect x="20" y="13" width="1" height="1" fill="${s}"/>
      <rect x="14" y="18" width="4" height="2" fill="${a}"/>
      <rect x="2" y="17" width="2" height="1" fill="${e}"/>
      <rect x="28" y="17" width="2" height="1" fill="${e}"/>
    </svg>
  `;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent));
  const b = Math.max(0, Math.min(255, (num & 0xff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ============================================================
// LOGIN SCREEN
// ============================================================
function renderProfileGrid() {
  const grid = document.getElementById("profile-grid");
  grid.innerHTML = "";
  Object.values(PROFILES).forEach((p) => {
    const card = document.createElement("div");
    card.className = "profile-card";
    card.dataset.profileId = p.id;
    card.innerHTML = `
      <div class="cat-avatar">${buildCatSVG(p, { size: 96, pose: "sit" })}</div>
      <div class="profile-name">${escapeHTML(p.name)}</div>
      <div class="profile-tagline">${escapeHTML(p.tagline)}</div>
    `;
    card.addEventListener("click", () => openPasswordModal(p.id));
    grid.appendChild(card);
  });
}

function openPasswordModal(profileId) {
  state.selectedProfileId = profileId;
  const profile = PROFILES[profileId];
  document.getElementById("password-title").textContent = `Hello ${profile.name}`;
  document.getElementById("password-hint").textContent = "type your secret meow";
  document.getElementById("password-error").classList.add("hidden");
  const input = document.getElementById("password-input");
  input.value = "";
  document.getElementById("password-modal").classList.remove("hidden");
  setTimeout(() => input.focus(), 50);
}

function closePasswordModal() {
  document.getElementById("password-modal").classList.add("hidden");
  state.selectedProfileId = null;
}

function submitPassword() {
  const id = state.selectedProfileId;
  if (!id) return;
  const profile = PROFILES[id];
  const input = document.getElementById("password-input");
  const error = document.getElementById("password-error");
  if (input.value === profile.password) {
    state.me = profile;
    state.other = Object.values(PROFILES).find((p) => p.id !== id);
    closePasswordModal();
    enterChat();
  } else {
    error.classList.remove("hidden");
    input.value = "";
    input.focus();
    // Wiggle animation
    const modal = document.querySelector(".modal-content");
    modal.style.animation = "none";
    setTimeout(() => { modal.style.animation = "wiggle 0.3s"; }, 10);
  }
}

// ============================================================
// CHAT SCREEN
// ============================================================
function enterChat() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("chat-screen").classList.add("active");

  // Set header info
  document.getElementById("header-avatar").innerHTML = buildCatSVG(state.other, { size: 40, pose: "sit" });
  document.getElementById("header-sub").textContent = `with ${state.other.name}`;

  // Persist last login for reload
  try {
    localStorage.setItem("catchat:lastProfile", state.me.id);
  } catch (e) {}

  initFirebase();
}

function leaveChat() {
  // Mark offline
  if (state.db && state.uid) {
    set(ref(state.db, `rooms/${ROOM_ID}/presence/${state.me.id}`), { online: false, ts: serverTimestamp() });
    set(ref(state.db, `rooms/${ROOM_ID}/typing/${state.me.id}`), false);
  }
  try { localStorage.removeItem("catchat:lastProfile"); } catch (e) {}
  location.reload();
}

// ============================================================
// FIREBASE
// ============================================================
async function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "REMPLACE_PAR_TA_CLE") {
    showSystemMessage("⚠ Firebase n'est pas configuré. Ouvre config.js et ajoute tes clés Firebase.");
    return;
  }

  try {
    const app = initializeApp(FIREBASE_CONFIG);
    state.auth = getAuth(app);
    state.db = getDatabase(app);

    await signInAnonymously(state.auth);

    onAuthStateChanged(state.auth, (user) => {
      if (user) {
        state.uid = user.uid;
        state.ready = true;
        setupPresence();
        loadMessages();
        loadTyping();
        loadReactions();
        document.getElementById("connecting-msg")?.remove();
      }
    });
  } catch (err) {
    console.error("Firebase init error:", err);
    showSystemMessage("⚠ Connection error: " + err.message);
  }
}

function setupPresence() {
  const myPresenceRef = ref(state.db, `rooms/${ROOM_ID}/presence/${state.me.id}`);
  const otherPresenceRef = ref(state.db, `rooms/${ROOM_ID}/presence/${state.other.id}`);

  set(myPresenceRef, { online: true, name: state.me.name, ts: serverTimestamp() });
  onDisconnect(myPresenceRef).set({ online: false, name: state.me.name, ts: serverTimestamp() });

  // Typing also cleared on disconnect
  const myTypingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${state.me.id}`);
  onDisconnect(myTypingRef).set(false);

  onValue(otherPresenceRef, (snap) => {
    const data = snap.val();
    const sub = document.getElementById("header-sub");
    if (data?.online) {
      sub.innerHTML = `<span style="color:#5c8d3a;">●</span> ${escapeHTML(state.other.name)} is online`;
    } else {
      sub.textContent = `${state.other.name} • offline`;
    }
  });
}

function loadMessages() {
  const messagesRef = query(
    ref(state.db, `rooms/${ROOM_ID}/messages`),
    limitToLast(200)
  );

  let firstLoad = true;
  const initialMsgs = [];

  onChildAdded(messagesRef, (snap) => {
    const msg = { id: snap.key, ...snap.val() };
    state.messages.set(msg.id, msg);
    renderMessage(msg, !firstLoad);
    if (!firstLoad && msg.author !== state.me.id) {
      playSound("receive");
    }
  });

  // Mark first load done after a microtask
  setTimeout(() => {
    firstLoad = false;
    scrollToBottom();
  }, 200);

  // Listen for changes (reactions)
  onChildChanged(messagesRef, (snap) => {
    const msg = { id: snap.key, ...snap.val() };
    state.messages.set(msg.id, msg);
    updateMessageReactions(msg);
  });
}

function loadTyping() {
  const otherTypingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${state.other.id}`);
  onValue(otherTypingRef, (snap) => {
    const typing = snap.val();
    const indicator = document.getElementById("typing-indicator");
    if (typing) {
      document.getElementById("typing-name").textContent = state.other.name;
      indicator.classList.remove("hidden");
    } else {
      indicator.classList.add("hidden");
    }
  });
}

function loadReactions() {
  // Reactions are stored as part of message, already handled in onChildChanged
}

async function sendMessage(text, gifUrl = null) {
  if (!state.ready) return;
  const trimmed = (text || "").trim();
  if (!trimmed && !gifUrl) return;

  const messagesRef = ref(state.db, `rooms/${ROOM_ID}/messages`);
  const newRef = push(messagesRef);
  const msg = {
    author: state.me.id,
    authorName: state.me.name,
    ts: serverTimestamp(),
    reactions: {}
  };
  if (gifUrl) {
    msg.type = "gif";
    msg.gifUrl = gifUrl;
  } else {
    msg.type = "text";
    msg.text = trimmed;
  }
  await set(newRef, msg);
  playSound("send");
  clearTyping();
}

async function toggleReaction(msgId, emoji) {
  if (!state.ready) return;
  const msg = state.messages.get(msgId);
  if (!msg) return;
  const reactions = msg.reactions || {};
  const myKey = `${state.me.id}_${emoji}`;
  const reactionRef = ref(state.db, `rooms/${ROOM_ID}/messages/${msgId}/reactions/${myKey}`);
  if (reactions[myKey]) {
    await set(reactionRef, null);
  } else {
    await set(reactionRef, { user: state.me.id, emoji, ts: serverTimestamp() });
  }
}

// ============================================================
// RENDER
// ============================================================
function renderMessage(msg, animate = true) {
  const messages = document.getElementById("messages");
  const existing = document.getElementById(`msg-${msg.id}`);
  if (existing) return; // already rendered

  // Check if we should show a date divider
  const prevEl = messages.lastElementChild;
  const prevTs = prevEl?.dataset.ts ? parseInt(prevEl.dataset.ts) : null;
  if (msg.ts && (!prevTs || shouldShowDivider(prevTs, msg.ts))) {
    const div = document.createElement("div");
    div.className = "system-message-divider";
    div.textContent = formatDateDivider(msg.ts);
    messages.appendChild(div);
  }

  const isMe = msg.author === state.me.id;
  const profile = isMe ? state.me : state.other;
  const el = document.createElement("div");
  el.className = `message ${isMe ? "me" : "them"}`;
  el.id = `msg-${msg.id}`;
  el.dataset.msgId = msg.id;
  el.dataset.ts = msg.ts || "";

  const time = formatTime(msg.ts);
  const bubbleContent = msg.type === "gif"
    ? `<div class="bubble gif" data-msg-id="${msg.id}"><img src="${escapeAttr(msg.gifUrl)}" alt="GIF" loading="lazy"></div>`
    : `<div class="bubble" data-msg-id="${msg.id}">${escapeHTML(msg.text || "")}</div>`;

  el.innerHTML = `
    <div class="msg-avatar">${buildCatSVG(profile, { size: 36, pose: "sit" })}</div>
    <div class="bubble-wrap">
      ${!isMe ? `<div class="msg-author">${escapeHTML(profile.name)}</div>` : ""}
      ${bubbleContent}
      <div class="reactions" data-msg-id="${msg.id}"></div>
      <div class="msg-time">${time}</div>
    </div>
  `;

  // Attach click listener for reactions
  const bubble = el.querySelector(".bubble");
  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    openReactionPicker(bubble, msg.id);
  });

  messages.appendChild(el);
  updateMessageReactions(msg);

  if (animate) {
    scrollToBottom();
  }
}

function updateMessageReactions(msg) {
  const container = document.querySelector(`.reactions[data-msg-id="${msg.id}"]`);
  if (!container) return;
  const reactions = msg.reactions || {};
  // Group by emoji
  const grouped = {};
  Object.values(reactions).forEach((r) => {
    if (!r || !r.emoji) return;
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
    grouped[r.emoji].count++;
    if (r.user === state.me?.id) grouped[r.emoji].mine = true;
  });
  container.innerHTML = "";
  Object.entries(grouped).forEach(([emoji, data]) => {
    const chip = document.createElement("span");
    chip.className = `reaction-chip${data.mine ? " mine" : ""}`;
    chip.innerHTML = `<span>${emoji}</span>${data.count > 1 ? `<span class="count">${data.count}</span>` : ""}`;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReaction(msg.id, emoji);
    });
    container.appendChild(chip);
  });
}

function showSystemMessage(text) {
  const messages = document.getElementById("messages");
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = text;
  messages.appendChild(el);
  document.getElementById("connecting-msg")?.remove();
}

function scrollToBottom() {
  const messages = document.getElementById("messages");
  setTimeout(() => {
    messages.scrollTop = messages.scrollHeight;
  }, 50);
}

// ============================================================
// REACTION PICKER
// ============================================================
let currentReactionMsgId = null;

function openReactionPicker(bubble, msgId) {
  currentReactionMsgId = msgId;
  const picker = document.getElementById("reaction-picker");
  const rect = bubble.getBoundingClientRect();
  picker.classList.remove("hidden");
  // Position above the bubble
  const pickerWidth = 280;
  let left = rect.left + (rect.width / 2) - (pickerWidth / 2);
  left = Math.max(8, Math.min(window.innerWidth - pickerWidth - 8, left));
  let top = rect.top - 50;
  if (top < 8) top = rect.bottom + 8;
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function closeReactionPicker() {
  document.getElementById("reaction-picker").classList.add("hidden");
  currentReactionMsgId = null;
}

// ============================================================
// TYPING INDICATOR
// ============================================================
function setTyping() {
  if (!state.ready) return;
  const typingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${state.me.id}`);
  set(typingRef, true);
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    clearTyping();
  }, 3000);
}

function clearTyping() {
  if (!state.ready) return;
  const typingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${state.me.id}`);
  set(typingRef, false);
  clearTimeout(state.typingTimeout);
}

// ============================================================
// GIF PICKER (Tenor API)
// ============================================================
let gifSearchTimeout = null;

async function searchGifs(query) {
  const grid = document.getElementById("gif-grid");
  if (!TENOR_API_KEY) {
    grid.innerHTML = `<div class="gif-loading">⚠ Add a Tenor API key in config.js to enable GIFs.<br><br>(it's free, 5 min : <br>tenor.com/gifapi)</div>`;
    return;
  }
  if (!query || query.length < 2) {
    grid.innerHTML = `<div class="gif-loading">type something to search GIFs</div>`;
    return;
  }
  grid.innerHTML = `<div class="gif-loading">searching...</div>`;
  try {
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20&media_filter=tinygif,gif&contentfilter=medium`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      grid.innerHTML = `<div class="gif-loading">no GIF found 🙀</div>`;
      return;
    }
    grid.innerHTML = "";
    data.results.forEach((r) => {
      const tiny = r.media_formats?.tinygif?.url;
      const full = r.media_formats?.gif?.url || tiny;
      if (!tiny) return;
      const img = document.createElement("img");
      img.className = "gif-item";
      img.src = tiny;
      img.alt = r.content_description || "gif";
      img.loading = "lazy";
      img.addEventListener("click", () => {
        sendMessage(null, full);
        document.getElementById("gif-picker").classList.add("hidden");
      });
      grid.appendChild(img);
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="gif-loading">error loading GIFs</div>`;
  }
}

// ============================================================
// SOUND
// ============================================================
const audioContext = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { return null; }
})();

function playSound(type) {
  if (!state.soundOn || !audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  if (type === "send") {
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === "receive") {
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  document.getElementById("sound-btn").textContent = state.soundOn ? "🔊" : "🔇";
  try { localStorage.setItem("catchat:sound", state.soundOn ? "1" : "0"); } catch (e) {}
}

// ============================================================
// HELPERS
// ============================================================
function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(str) {
  return escapeHTML(str);
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateDivider(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "─── TODAY ───";
  if (d.toDateString() === yesterday.toDateString()) return "─── YESTERDAY ───";
  return `─── ${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }).toUpperCase()} ───`;
}

function shouldShowDivider(prevTs, currTs) {
  const a = new Date(prevTs);
  const b = new Date(currTs);
  return a.toDateString() !== b.toDateString();
}

// ============================================================
// EVENT WIRING
// ============================================================
function wireEvents() {
  // Password modal
  document.getElementById("password-submit").addEventListener("click", submitPassword);
  document.getElementById("password-cancel").addEventListener("click", closePasswordModal);
  document.getElementById("password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPassword();
    if (e.key === "Escape") closePasswordModal();
  });
  document.getElementById("password-modal").addEventListener("click", (e) => {
    if (e.target.id === "password-modal") closePasswordModal();
  });

  // Chat header
  document.getElementById("leave-btn").addEventListener("click", leaveChat);
  document.getElementById("sound-btn").addEventListener("click", toggleSound);

  // Composer
  const input = document.getElementById("msg-input");
  const sendBtn = document.getElementById("send-btn");
  sendBtn.addEventListener("click", () => {
    sendMessage(input.value);
    input.value = "";
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
      input.value = "";
    } else {
      setTyping();
    }
  });
  input.addEventListener("blur", clearTyping);

  // Emoji picker
  document.getElementById("emoji-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("gif-picker").classList.add("hidden");
    document.getElementById("emoji-picker").classList.toggle("hidden");
  });
  document.querySelectorAll(".emoji-pick").forEach((el) => {
    el.addEventListener("click", () => {
      input.value += el.textContent;
      input.focus();
      setTyping();
    });
  });

  // GIF picker
  document.getElementById("gif-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("emoji-picker").classList.add("hidden");
    document.getElementById("gif-picker").classList.toggle("hidden");
    const searchInput = document.getElementById("gif-search");
    setTimeout(() => searchInput.focus(), 50);
    // Pre-load with cat search
    if (!searchInput.value) {
      searchInput.value = "cute cat";
      searchGifs("cute cat");
    }
  });
  document.getElementById("gif-close").addEventListener("click", () => {
    document.getElementById("gif-picker").classList.add("hidden");
  });
  document.getElementById("gif-search").addEventListener("input", (e) => {
    clearTimeout(gifSearchTimeout);
    gifSearchTimeout = setTimeout(() => searchGifs(e.target.value), 400);
  });

  // Reaction picker
  document.querySelectorAll(".reaction-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const emoji = btn.dataset.emoji;
      if (currentReactionMsgId) {
        toggleReaction(currentReactionMsgId, emoji);
      }
      closeReactionPicker();
    });
  });

  // Close pickers when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".reaction-picker") && !e.target.closest(".bubble")) {
      closeReactionPicker();
    }
    if (!e.target.closest("#emoji-picker") && !e.target.closest("#emoji-btn")) {
      document.getElementById("emoji-picker").classList.add("hidden");
    }
    if (!e.target.closest("#gif-picker") && !e.target.closest("#gif-btn")) {
      document.getElementById("gif-picker").classList.add("hidden");
    }
  });

  // Restore sound pref
  try {
    const soundPref = localStorage.getItem("catchat:sound");
    if (soundPref === "0") {
      state.soundOn = false;
      document.getElementById("sound-btn").textContent = "🔇";
    }
  } catch (e) {}
}

// ============================================================
// INIT
// ============================================================
function init() {
  renderProfileGrid();
  wireEvents();

  // Auto-resume last profile (skipping password) if user reloads quickly
  // Actually: better to always ask for password for clarity. Skip auto-resume.
}

document.addEventListener("DOMContentLoaded", init);

// Wiggle keyframe injected dynamically (for wrong password shake)
const styleEl = document.createElement("style");
styleEl.textContent = `
@keyframes wiggle {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}`;
document.head.appendChild(styleEl);

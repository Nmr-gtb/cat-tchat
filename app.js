// ============================================================
// ChatGPT-clone backend wiring (Firebase RTDB)
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
  set,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  query,
  limitToLast,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { FIREBASE_CONFIG, ROOM_ID, PROFILES, DEFAULT_IDENTITY, GIPHY_API_KEY } from "./config.js";

// ---------------- Identity ----------------
// We read ?me=X from URL on first visit, persist in localStorage, then clean the URL.
// If nothing is set, fall back to DEFAULT_IDENTITY (the device owner).

function resolveIdentity() {
  const url = new URL(window.location.href);
  const urlMe = url.searchParams.get("me");
  if (urlMe && PROFILES[urlMe]) {
    try { localStorage.setItem("ct:me", urlMe); } catch (e) {}
    url.searchParams.delete("me");
    window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
    return urlMe;
  }
  try {
    const stored = localStorage.getItem("ct:me");
    if (stored && PROFILES[stored]) return stored;
  } catch (e) {}
  return DEFAULT_IDENTITY;
}

const MY_ID = resolveIdentity();
const ME = PROFILES[MY_ID];
const OTHER = Object.values(PROFILES).find((p) => p.id !== MY_ID);

// ---------------- State ----------------
const state = {
  db: null,
  auth: null,
  uid: null,
  ready: false,
  messages: new Map(),
  firstLoadDone: false,
  typingTimeout: null,
};

// ---------------- DOM refs ----------------
const $ = (id) => document.getElementById(id);
const els = {
  messages: $("messages"),
  emptyState: $("empty-state"),
  composer: $("composer"),
  input: $("composer-input"),
  sendBtn: $("send-btn"),
  typingStatus: $("typing-status"),
  accountAvatar: $("account-avatar"),
  accountName: $("account-name"),
  sidebar: $("sidebar"),
  toggleSidebar: $("toggle-sidebar"),
  openSidebar: $("open-sidebar"),
};

// ---------------- Init UI from identity ----------------
function initUI() {
  els.accountAvatar.textContent = (ME.name[0] || "U").toUpperCase();
  if (ME.accountColor) els.accountAvatar.style.background = ME.accountColor;
  els.accountName.textContent = ME.name;
}

// ---------------- Firebase ----------------
async function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith("REMPLACE")) {
    console.warn("Firebase not configured");
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
      }
    });
  } catch (err) {
    console.error("Firebase init error:", err);
  }
}

function setupPresence() {
  const myPresenceRef = ref(state.db, `rooms/${ROOM_ID}/presence/${MY_ID}`);
  set(myPresenceRef, { online: true, ts: serverTimestamp() });
  onDisconnect(myPresenceRef).set({ online: false, ts: serverTimestamp() });

  const myTypingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${MY_ID}`);
  onDisconnect(myTypingRef).set(false);
}

function loadMessages() {
  const messagesRef = query(
    ref(state.db, `rooms/${ROOM_ID}/messages`),
    limitToLast(200)
  );
  onChildAdded(messagesRef, (snap) => {
    const msg = { id: snap.key, ...snap.val() };
    if (state.messages.has(msg.id)) return;
    state.messages.set(msg.id, msg);
    renderMessage(msg, /* animate */ state.firstLoadDone && msg.author !== MY_ID);
  });
  // After first burst settle, mark firstLoad done
  setTimeout(() => { state.firstLoadDone = true; scrollToBottom(true); }, 300);
}

function loadTyping() {
  // Volontairement vide : aucun indicateur "X is typing" pour préserver le déguisement.
  // Les dots de frappe apparaissent uniquement dans la bulle au moment où le message arrive.
}

async function sendMessageToDB(text) {
  if (!state.ready) return;
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  const messagesRef = ref(state.db, `rooms/${ROOM_ID}/messages`);
  const newRef = push(messagesRef);
  await set(newRef, {
    author: MY_ID,
    text: trimmed,
    ts: serverTimestamp()
  });
  clearTyping();
}

async function sendGifToDB(gifUrl) {
  if (!state.ready || !gifUrl) return;
  const messagesRef = ref(state.db, `rooms/${ROOM_ID}/messages`);
  const newRef = push(messagesRef);
  await set(newRef, {
    author: MY_ID,
    type: "gif",
    gifUrl: gifUrl,
    ts: serverTimestamp()
  });
}

function setTyping() {
  if (!state.ready) return;
  const typingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${MY_ID}`);
  set(typingRef, true);
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => clearTyping(), 3000);
}

function clearTyping() {
  if (!state.ready) return;
  const typingRef = ref(state.db, `rooms/${ROOM_ID}/typing/${MY_ID}`);
  set(typingRef, false);
  clearTimeout(state.typingTimeout);
}

// ---------------- Rendering ----------------
const GPT_LOGO_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
</svg>
`;

function renderMessage(msg, animate = false) {
  hideEmptyState();
  const isMine = msg.author === MY_ID;
  const isGif = msg.type === "gif" && msg.gifUrl;
  const isGame = msg.type === "game" && msg.gameId;
  const el = document.createElement("div");
  el.className = `msg ${isMine ? "user" : "assistant"} ${isGame ? "game" : ""}`;
  el.dataset.id = msg.id;

  // Game messages always render as assistant style (ChatGPT widget), regardless of author
  if (isGame) {
    el.className = "msg assistant game";
    el.innerHTML = `
      <div class="assistant-avatar">${GPT_LOGO_SVG}</div>
      <div class="msg-body">
        <div class="msg-content game-widget" id="game-${msg.gameId}"></div>
      </div>`;
    els.messages.appendChild(el);
    const content = el.querySelector(".game-widget");
    if (msg.gameType === "connect4") {
      subscribeToGame(msg.gameId, content);
    }
    scrollToBottom();
    return;
  }

  if (isMine) {
    if (isGif) {
      el.innerHTML = `<div class="msg-gif user-gif"><img alt="image" loading="lazy"></div>`;
      el.querySelector("img").src = msg.gifUrl;
    } else {
      el.innerHTML = `<div class="msg-bubble-user"></div>`;
      el.querySelector(".msg-bubble-user").textContent = msg.text || "";
    }
    els.messages.appendChild(el);
    scrollToBottom();
    return;
  }

  // Assistant-style (other user's message)
  if (isGif) {
    el.innerHTML = `
      <div class="assistant-avatar">${GPT_LOGO_SVG}</div>
      <div class="msg-body">
        <div class="msg-gif"><img alt="image" loading="lazy"></div>
      </div>`;
    el.querySelector("img").src = msg.gifUrl;
    els.messages.appendChild(el);
    scrollToBottom();
    return;
  }

  el.innerHTML = `
    <div class="assistant-avatar">${GPT_LOGO_SVG}</div>
    <div class="msg-body">
      <div class="msg-content"></div>
      <div class="msg-actions">
        <button class="msg-action" title="Copy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="msg-action" title="Good response">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L15 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
        </button>
        <button class="msg-action" title="Bad response">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L9 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>
        </button>
        <button class="msg-action" title="Read aloud">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        </button>
        <button class="msg-action" title="Regenerate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </div>
  `;
  els.messages.appendChild(el);
  const content = el.querySelector(".msg-content");

  if (animate) {
    animateTyping(content, msg.text || "");
  } else {
    content.textContent = msg.text || "";
    scrollToBottom();
  }
}

function animateTyping(contentEl, fullText) {
  // Show typing dots first
  contentEl.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  scrollToBottom();

  const dotsDelay = 500 + Math.random() * 400;
  setTimeout(() => {
    contentEl.textContent = "";
    contentEl.classList.add("typing");
    let i = 0;
    const chars = Array.from(fullText);

    const tick = () => {
      if (i >= chars.length) {
        contentEl.classList.remove("typing");
        scrollToBottom();
        return;
      }
      // Reveal in small chunks to feel natural
      const chunkSize = Math.random() < 0.3 ? 2 : 1;
      contentEl.textContent += chars.slice(i, i + chunkSize).join("");
      i += chunkSize;
      // Variable delay: pause slightly on punctuation
      const last = chars[i - 1] || "";
      let delay = 18 + Math.random() * 28;
      if (".!?".includes(last)) delay += 220;
      else if (",;:".includes(last)) delay += 90;
      else if (last === " ") delay += 8;
      scrollToBottom();
      setTimeout(tick, delay);
    };
    tick();
  }, dotsDelay);
}

function hideEmptyState() {
  els.emptyState?.classList.add("hidden");
}

function scrollToBottom(force = false) {
  const conv = document.getElementById("conversation");
  if (!conv) return;
  // Only auto-scroll if user is already near bottom (or forced)
  const nearBottom = conv.scrollHeight - conv.scrollTop - conv.clientHeight < 200;
  if (force || nearBottom) {
    requestAnimationFrame(() => {
      conv.scrollTop = conv.scrollHeight;
    });
  }
}

// ---------------- Composer ----------------
function autoResizeInput() {
  const t = els.input;
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 200) + "px";
}

function updateSendBtnState() {
  const hasText = els.input.value.trim().length > 0;
  els.sendBtn.disabled = !hasText;
}

async function handleSend() {
  const text = els.input.value;
  if (!text.trim()) return;
  els.input.value = "";
  autoResizeInput();
  updateSendBtnState();
  await sendMessageToDB(text);
  els.input.focus();
}

// ---------------- Plus Menu (above + button) ----------------
let plusMenuOpen = false;

function buildPlusMenu() {
  if (document.getElementById("plus-menu")) return;
  const m = document.createElement("div");
  m.id = "plus-menu";
  m.className = "plus-menu hidden";
  m.innerHTML = `
    <button class="plus-menu-item" data-action="gif">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M9 8v8M9 12h3v4M14 8h3M14 12h2M14 8v8"/></svg>
      <span>Send a GIF</span>
    </button>
    <button class="plus-menu-item" data-action="connect4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="12" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></svg>
      <span>Play Connect 4</span>
    </button>
  `;
  document.body.appendChild(m);
  m.querySelectorAll(".plus-menu-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      closePlusMenu();
      if (action === "gif") openGifPicker();
      if (action === "connect4") startNewConnect4();
    });
  });
}

function positionPlusMenu() {
  const m = document.getElementById("plus-menu");
  const attachBtn = document.getElementById("attach-btn");
  if (!m || !attachBtn) return;
  const rect = attachBtn.getBoundingClientRect();
  m.style.left = rect.left + "px";
  m.style.bottom = (window.innerHeight - rect.top + 8) + "px";
}

function openPlusMenu() {
  buildPlusMenu();
  document.getElementById("plus-menu").classList.remove("hidden");
  plusMenuOpen = true;
  positionPlusMenu();
}

function closePlusMenu() {
  const m = document.getElementById("plus-menu");
  if (m) m.classList.add("hidden");
  plusMenuOpen = false;
}

// ---------------- Connect 4 game ----------------
const C4_ROWS = 6;
const C4_COLS = 7;
const activeGameListeners = new Map();    // gameId -> unsubscribe

async function startNewConnect4() {
  if (!state.ready) return;
  // Create a fresh game
  const gameId = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const board = Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
  const gameRef = ref(state.db, `rooms/${ROOM_ID}/games/${gameId}`);
  await set(gameRef, {
    board: board.map((row) => row.join(",")).join("|"),
    turn: MY_ID,
    winner: null,
    createdBy: MY_ID,
    createdAt: serverTimestamp()
  });

  // Send the game message
  const messagesRef = ref(state.db, `rooms/${ROOM_ID}/messages`);
  const newMsgRef = push(messagesRef);
  await set(newMsgRef, {
    author: MY_ID,
    type: "game",
    gameType: "connect4",
    gameId: gameId,
    ts: serverTimestamp()
  });
}

function deserializeBoard(str) {
  if (!str) return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
  return str.split("|").map((row) => row.split(",").map((n) => parseInt(n, 10) || 0));
}

function serializeBoard(board) {
  return board.map((row) => row.join(",")).join("|");
}

function playerNum(id) { return id === "noe" ? 1 : 2; }
function playerIdFromNum(n) { return n === 1 ? "noe" : (n === 2 ? "ami" : null); }

function checkWinner(board) {
  // Returns 0 (none), 1 (noe), 2 (ami)
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal down-right
    [1, -1],  // diagonal down-left
  ];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      for (const [dr, dc] of directions) {
        let ok = true;
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS || board[nr][nc] !== v) {
            ok = false;
            break;
          }
        }
        if (ok) return { winner: v, cells: [
          [r, c], [r + dr, c + dc], [r + dr * 2, c + dc * 2], [r + dr * 3, c + dc * 3]
        ] };
      }
    }
  }
  return { winner: 0, cells: [] };
}

function isBoardFull(board) {
  return board.every((row) => row.every((cell) => cell !== 0));
}

async function dropPiece(gameId, col) {
  if (!state.ready) return;
  const gameRef = ref(state.db, `rooms/${ROOM_ID}/games/${gameId}`);
  await runTransaction(gameRef, (current) => {
    if (!current) return current;
    if (current.winner) return; // game over, no-op
    if (current.turn !== MY_ID) return; // not my turn
    const board = deserializeBoard(current.board);
    let dropRow = -1;
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (board[r][col] === 0) {
        dropRow = r;
        break;
      }
    }
    if (dropRow < 0) return; // column full
    board[dropRow][col] = playerNum(MY_ID);
    const { winner } = checkWinner(board);
    const draw = !winner && isBoardFull(board);
    return {
      ...current,
      board: serializeBoard(board),
      turn: MY_ID === "noe" ? "ami" : "noe",
      winner: winner ? playerIdFromNum(winner) : (draw ? "draw" : null)
    };
  });
}

function subscribeToGame(gameId, contentEl) {
  if (activeGameListeners.has(gameId)) {
    activeGameListeners.get(gameId)();
  }
  const gameRef = ref(state.db, `rooms/${ROOM_ID}/games/${gameId}`);
  const unsub = onValue(gameRef, (snap) => {
    const data = snap.val();
    if (!data) {
      contentEl.innerHTML = `<div class="game-loading">Game expired.</div>`;
      return;
    }
    renderConnect4Board(contentEl, gameId, data);
  });
  activeGameListeners.set(gameId, unsub);
}

function renderConnect4Board(contentEl, gameId, data) {
  const board = deserializeBoard(data.board);
  const { winner, cells: winningCells } = checkWinner(board);
  const winningSet = new Set(winningCells.map(([r, c]) => `${r}_${c}`));
  const isMyTurn = data.turn === MY_ID && !data.winner;
  const finalWinner = data.winner;

  let intro;
  if (data.createdBy === MY_ID) {
    intro = `I've set up a Connect 4 board for you. You're playing as <strong style="color:#e74c3c;">red ●</strong>. Drop a piece by clicking a column.`;
  } else {
    intro = `Here's a Connect 4 game. You're playing as <strong style="color:#f1c40f;">yellow ●</strong>. Drop a piece by clicking a column.`;
  }

  let statusLine;
  if (finalWinner === "draw") {
    statusLine = `<span class="game-status draw">Draw — board is full.</span>`;
  } else if (finalWinner) {
    const wonByMe = finalWinner === MY_ID;
    statusLine = `<span class="game-status ${wonByMe ? 'win' : 'loss'}">${wonByMe ? "You won 🎉" : "You lost."}</span>`;
  } else if (isMyTurn) {
    statusLine = `<span class="game-status your-turn">Your turn.</span>`;
  } else {
    statusLine = `<span class="game-status">Waiting for the other player…</span>`;
  }

  // Build column drop buttons
  let colsHtml = '<div class="c4-drops">';
  for (let c = 0; c < C4_COLS; c++) {
    const colFull = board[0][c] !== 0;
    const disabled = !isMyTurn || colFull || finalWinner;
    colsHtml += `<button class="c4-drop ${disabled ? 'disabled' : ''}" data-col="${c}" ${disabled ? 'disabled' : ''} aria-label="Drop in column ${c + 1}">▼</button>`;
  }
  colsHtml += '</div>';

  // Build grid
  let gridHtml = '<div class="c4-board">';
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = board[r][c];
      const colorClass = v === 1 ? "red" : v === 2 ? "yellow" : "empty";
      const winClass = winningSet.has(`${r}_${c}`) ? " winning" : "";
      gridHtml += `<div class="c4-cell ${colorClass}${winClass}"><span class="c4-piece"></span></div>`;
    }
  }
  gridHtml += '</div>';

  let actionsHtml = "";
  if (finalWinner) {
    actionsHtml = `<button class="c4-newgame">↻ Start a new game</button>`;
  }

  contentEl.innerHTML = `
    <div class="game-intro">${intro}</div>
    ${colsHtml}
    ${gridHtml}
    <div class="game-footer">${statusLine}</div>
    ${actionsHtml}
  `;

  // Wire drop buttons
  contentEl.querySelectorAll(".c4-drop").forEach((btn) => {
    btn.addEventListener("click", () => {
      const col = parseInt(btn.dataset.col, 10);
      dropPiece(gameId, col);
    });
  });
  // Wire new game button
  contentEl.querySelector(".c4-newgame")?.addEventListener("click", () => {
    startNewConnect4();
  });
}

// ---------------- GIF Picker ----------------
let gifSearchTimeout = null;
let gifPickerOpen = false;

function buildGifPicker() {
  if (document.getElementById("gif-picker")) return;
  const picker = document.createElement("div");
  picker.id = "gif-picker";
  picker.className = "gif-picker hidden";
  picker.innerHTML = `
    <div class="gif-picker-header">
      <input type="text" id="gif-search" placeholder="Search GIFs..." autocomplete="off">
      <button type="button" id="gif-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="gif-grid" id="gif-grid">
      <div class="gif-empty">Search to find GIFs</div>
    </div>
    <div class="gif-credit">Powered by GIPHY</div>
  `;
  document.body.appendChild(picker);
  document.getElementById("gif-search").addEventListener("input", (e) => {
    clearTimeout(gifSearchTimeout);
    gifSearchTimeout = setTimeout(() => searchGifs(e.target.value), 350);
  });
  document.getElementById("gif-close").addEventListener("click", closeGifPicker);
}

function positionGifPicker() {
  const picker = document.getElementById("gif-picker");
  const composer = document.querySelector(".composer");
  if (!picker || !composer) return;
  const rect = composer.getBoundingClientRect();
  picker.style.left = rect.left + "px";
  picker.style.width = rect.width + "px";
  picker.style.bottom = (window.innerHeight - rect.top + 8) + "px";
}

function openGifPicker() {
  buildGifPicker();
  const picker = document.getElementById("gif-picker");
  picker.classList.remove("hidden");
  gifPickerOpen = true;
  positionGifPicker();
  setTimeout(() => {
    document.getElementById("gif-search")?.focus();
  }, 50);
  // Auto-search trending on open
  searchGifs("");
}

function closeGifPicker() {
  const picker = document.getElementById("gif-picker");
  if (picker) picker.classList.add("hidden");
  gifPickerOpen = false;
}

async function searchGifs(query) {
  const grid = document.getElementById("gif-grid");
  if (!grid) return;
  if (!GIPHY_API_KEY) {
    grid.innerHTML = `<div class="gif-empty">GIF search needs a Giphy API key.<br>Add one in <code>config.js</code> &rarr; <code>GIPHY_API_KEY</code></div>`;
    return;
  }
  grid.innerHTML = `<div class="gif-empty">Searching…</div>`;
  try {
    const trimmed = (query || "").trim();
    let url;
    if (trimmed) {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmed)}&limit=21&rating=pg-13&bundle=messaging_non_clips`;
    } else {
      url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=21&rating=pg-13&bundle=messaging_non_clips`;
    }
    const res = await fetch(url);
    const data = await res.json();
    const results = data.data || [];
    if (results.length === 0) {
      grid.innerHTML = `<div class="gif-empty">No GIFs found.</div>`;
      return;
    }
    grid.innerHTML = "";
    results.forEach((r) => {
      const tiny = r.images?.fixed_width_small?.url || r.images?.fixed_width?.url;
      const full = r.images?.original?.url || r.images?.downsized?.url || tiny;
      if (!tiny) return;
      const img = document.createElement("img");
      img.className = "gif-item";
      img.src = tiny;
      img.loading = "lazy";
      img.alt = r.title || "gif";
      img.addEventListener("click", () => {
        sendGifToDB(full);
        closeGifPicker();
      });
      grid.appendChild(img);
    });
  } catch (err) {
    console.error("GIF search error:", err);
    grid.innerHTML = `<div class="gif-empty">Could not load GIFs.</div>`;
  }
}

// ---------------- Events ----------------
function wire() {
  els.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSend();
  });

  els.input.addEventListener("input", () => {
    autoResizeInput();
    updateSendBtnState();
    setTyping();
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  els.input.addEventListener("blur", clearTyping);

  // Sidebar toggle (desktop)
  els.toggleSidebar?.addEventListener("click", () => {
    els.sidebar.classList.toggle("closed");
  });

  // Sidebar open (mobile)
  els.openSidebar?.addEventListener("click", () => {
    els.sidebar.classList.toggle("open");
    document.body.classList.toggle("sidebar-open");
  });

  // Attach (+) button → open mini menu (GIFs / Connect 4)
  const attachBtn = document.getElementById("attach-btn");
  attachBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (plusMenuOpen) closePlusMenu();
    else openPlusMenu();
  });

  // Close popups on outside click / Escape
  document.addEventListener("click", (e) => {
    const gp = document.getElementById("gif-picker");
    if (gp && !gp.classList.contains("hidden") && !gp.contains(e.target) && !e.target.closest("#attach-btn")) {
      closeGifPicker();
    }
    const pm = document.getElementById("plus-menu");
    if (pm && !pm.classList.contains("hidden") && !pm.contains(e.target) && !e.target.closest("#attach-btn")) {
      closePlusMenu();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (gifPickerOpen) closeGifPicker();
      if (plusMenuOpen) closePlusMenu();
    }
  });
  window.addEventListener("resize", () => {
    if (gifPickerOpen) positionGifPicker();
    if (plusMenuOpen) positionPlusMenu();
  });

  // Suggestion chips → fill the input
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const label = chip.querySelector("span")?.textContent?.trim();
      if (label && label !== "More") {
        els.input.value = label + ": ";
        els.input.focus();
        autoResizeInput();
        updateSendBtnState();
      }
    });
  });

  // Sidebar items keep the illusion (no-op)
  document.querySelectorAll(".chat-item:not(.active)").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      // do nothing — purely decorative
    });
  });
}

// ---------------- Init ----------------
function init() {
  initUI();
  wire();
  initFirebase();
  // Focus the composer on load (desktop)
  setTimeout(() => els.input.focus(), 100);
}

document.addEventListener("DOMContentLoaded", init);

// Import the functions you need from the SDKs you need
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-analytics.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { TMDB_BASE, tmdbHeaders } from "./tmdb.js";


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyChbnHTApumgPnfjhs0Di4S9en2-ZOo5Bg",
  authDomain: "film-club-party.firebaseapp.com",
  databaseURL: "https://film-club-party-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "film-club-party",
  storageBucket: "film-club-party.firebasestorage.app",
  messagingSenderId: "385957195789",
  appId: "1:385957195789:web:f796dcd6064a7702a0a544",
  measurementId: "G-D7FNL12557"
};

// ── SETUP ─────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const EMOJIS = ["🎬", "🍿", "🎥", "⭐", "🎭", "🦁", "🐯", "🦊", "🐸", "🐧", "🦋", "🔥"];

let currentUser = null;
let currentRoomCode = null;
let selectedEmoji = EMOJIS[0];
let isHost = false;
let timerInterval = null;
let secondsLeft = 9999;
let submittedAnswers = [];
let acceptedMovies = [];
let currentScore = 0;
let roundNum = 0;

// ── SIGN IN ────────────────────────────────────────
signInAnonymously(auth).then((result) => {
  currentUser = result.user;
  buildEmojiPickers();
});

// ── EMOJI PICKERS ──────────────────────────────────
function buildEmojiPickers() {
  buildPicker("hostEmojiPicker", "host");
  buildPicker("joinEmojiPicker", "join");
}

function buildPicker(containerId, prefix) {
  const container = document.getElementById(containerId);
  EMOJIS.forEach((emoji, i) => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn" + (i === 0 ? " selected" : "");
    btn.textContent = emoji;
    btn.onclick = () => selectEmoji(emoji, containerId, btn);
    container.appendChild(btn);
  });
}

function selectEmoji(emoji, containerId, btn) {
  selectedEmoji = emoji;
  document.querySelectorAll(`#${containerId} .emoji-btn`)
    .forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

// ── TAB SWITCHING ──────────────────────────────────
window.switchTab = function(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelector(`.tab:${tab === "host" ? "first-child" : "last-child"}`).classList.add("active");
  document.getElementById(tab + "Section").classList.add("active");
}

// ── GENERATE ROOM CODE ─────────────────────────────
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── CREATE ROOM ────────────────────────────────────
window.createRoom = async function() {
  const name = document.getElementById("hostName").value.trim();
  if (!name) {
    document.getElementById("hostError").style.display = "block";
    return;
  }
  document.getElementById("hostError").style.display = "none";

  const code = generateCode();
  currentRoomCode = code;
  isHost = true;

  await set(ref(db, `rooms/${code}`), {
    status: "waiting",
    hostUid: currentUser.uid,
    createdAt: Date.now(),
    players: {}  // empty — host is not a player
    });

  showHostLobby(code);
}

// ── HOST DASHBOARD ─────────────────────────────────
function loadHostDashboard(code) {
  document.getElementById("hostResultsScreen").style.display = "none"; // ← add this
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("hostDashboard").style.display = "flex";
  document.getElementById("hostLiveLeaderboard").innerHTML = ""; // ← clear old leaderboard
  document.getElementById("hostAnswersSoFar").textContent = "";  // ← clear old count
  document.getElementById("hostRoomCodeDisplay").textContent = code;

  // Listen for prompt
  onValue(ref(db, `rooms/${code}/prompt`), (snapshot) => {
    const prompt = snapshot.val();
    if (!prompt) return;
    acceptedMovies = prompt.acceptedMovies || [];
    document.getElementById("hostPromptText").textContent =
      `Name as many ${prompt.directorName} films as you can!`;
    document.getElementById("hostPromptSub").textContent =
      `${acceptedMovies.length} films in the database`;
    document.getElementById("hostRoundNum").textContent = prompt.currentRound || roundNum;
  });

  // Listen for live answers + update leaderboard
  onValue(ref(db, `rooms/${code}/answers`), (snapshot) => {
    const allAnswers = snapshot.val() || {};
    updateHostLiveLeaderboard(code, allAnswers);
  });

  // Listen for status changes
  onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
    if (snapshot.val() === "results") loadHostResults(code);
    if (snapshot.val() === "ended") loadEndGameScreen();
  });
}

async function updateHostLiveLeaderboard(code, allAnswers) {
  const snapshot = await get(ref(db, `rooms/${code}/players`));
  const players = snapshot.val() || {};

  // Count correct answers per player
  const scores = Object.entries(players).map(([uid, player]) => {
    const answers = allAnswers[uid] || [];
    const correct = answers.filter(a => checkAnswer(a)).length;
    return { uid, player, correct, total: answers.length };
  });

  scores.sort((a, b) => b.correct - a.correct);

  const totalAnswers = Object.values(allAnswers).reduce((sum, a) => sum + a.length, 0);
  document.getElementById("hostAnswersSoFar").textContent = `${totalAnswers} answers submitted`;

  const medals = ["🥇", "🥈", "🥉"];
  document.getElementById("hostLiveLeaderboard").innerHTML = scores.map(({ uid, player, correct, total }, i) => `
    <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #2a2a4a;">
      <span style="font-size:1.2rem; min-width:28px;">${medals[i] || `${i + 1}.`}</span>
      <span style="font-size:1.2rem;">${player.emoji}</span>
      <span style="font-weight:600; flex:1;">${player.name}</span>
      <span style="color:#888; font-size:0.8rem;">${correct}✓ / ${total} submitted</span>
      <span style="color:#f5c842; font-weight:900;">${player.score + (correct * 100)} pts</span>
    </div>
  `).join("") || "<p style='color:#888'>No answers yet...</p>";
}

// ── HOST RESULTS ───────────────────────────────────
async function loadHostResults(code) {
  document.getElementById("hostDashboard").style.display = "none";
  document.getElementById("hostResultsScreen").style.display = "flex";

  const snapshot = await get(ref(db, `rooms/${code}/players`));
  const players = snapshot.val() || {};
  const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
  const medals = ["🥇", "🥈", "🥉"];

  document.getElementById("hostResultsLeaderboard").innerHTML = sorted.map(([uid, p], i) => `
    <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #2a2a4a;">
      <span style="font-size:1.2rem;">${medals[i] || `${i + 1}.`}</span>
      <span style="font-size:1.2rem;">${p.emoji}</span>
      <span style="font-weight:600; flex:1;">${p.name}</span>
      <span style="color:#f5c842; font-weight:900;">${p.score} pts</span>
    </div>
  `).join("");

  // Listen for next round or end
  onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
    if (snapshot.val() === "playing") loadHostDashboard(code);
    if (snapshot.val() === "ended") loadEndGameScreen();
  });
}

// ── JOIN ROOM ──────────────────────────────────────
window.joinRoom = async function() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  const name = document.getElementById("joinName").value.trim();

  if (!code || !name) {
    document.getElementById("joinError").style.display = "block";
    document.getElementById("joinError").textContent = "Please fill in all fields!";
    return;
  }

  const snapshot = await get(ref(db, `rooms/${code}`));
  if (!snapshot.exists()) {
    document.getElementById("joinError").style.display = "block";
    document.getElementById("joinError").textContent = "Room not found! Check the code.";
    return;
  }

  document.getElementById("joinError").style.display = "none";
  currentRoomCode = code;
  isHost = false;

  await set(ref(db, `rooms/${code}/players/${currentUser.uid}`), {
    name: name,
    emoji: selectedEmoji,
    score: 0,
    isHost: false
  });

  showPlayerLobby(code);
}

// ── SHOW HOST LOBBY ────────────────────────────────
function showHostLobby(code) {
  document.getElementById("homeScreen").style.display = "none";
  document.getElementById("lobbyScreen").style.display = "flex";
  document.getElementById("displayRoomCode").textContent = code;

  onValue(ref(db, `rooms/${code}/players`), (snapshot) => {
    const players = snapshot.val() || {};
    renderPlayerList("hostPlayersList", players);
    const count = Object.keys(players).length;
    document.getElementById("startBtn").disabled = count < 2;
    document.getElementById("startBtn").textContent =
      count < 2 ? `Waiting for players... (${count}/2 min)` : `Start Game with ${count} Players →`;
  });
}

// ── SHOW PLAYER LOBBY ──────────────────────────────
function showPlayerLobby(code) {
  document.getElementById("homeScreen").style.display = "none";
  document.getElementById("playerLobbyScreen").style.display = "flex";
  document.getElementById("playerRoomCode").textContent = code;

  onValue(ref(db, `rooms/${code}/players`), (snapshot) => {
    const players = snapshot.val() || {};
    renderPlayerList("playersList", players);
  });
  

  onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
    if (snapshot.val() === "playing") {
      loadGameScreen(code);
    }
    if (snapshot.val() === "results") {
      loadResultsScreen();
    }
    if (snapshot.val() === "ended") {
        loadEndGameScreen();
    }
  });
}

// ── RENDER PLAYER LIST ─────────────────────────────
function renderPlayerList(containerId, players) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  Object.entries(players).forEach(([uid, player]) => {
    const div = document.createElement("div");
    div.className = "player-item";
    div.innerHTML = `
      <span class="player-emoji">${player.emoji}</span>
      <span class="player-name">${player.name}</span>
      ${player.isHost ? '<span style="color:#f5c842;font-size:0.7rem;letter-spacing:2px">HOST</span>' : ''}
      ${uid === currentUser.uid && !player.isHost ? '<span class="player-you">YOU</span>' : ''}
    `;
    container.appendChild(div);
  });
}

// ── CURATED DIRECTORS LIST ─────────────────────────
const DIRECTOR_NAMES = [
  "Christopher Nolan",
  "Wes Anderson", 
  "Martin Scorsese",
  "Quentin Tarantino",
  "Stanley Kubrick",
  "Steven Spielberg",
  "Sofia Coppola",
  "David Fincher",
  "Denis Villeneuve",
  "Greta Gerwig",
  "Tim Burton",
  "David Lynch",
  "Jordan Peele",
  "James Cameron",
  "Ridley Scott",
  "Alfred Hitchcock",
  "Francis Ford Coppola",
  "Spike Lee",
  "PT Anderson",
  "Darren Aronofsky"
];

async function fetchRandomDirector() {
  // Pick a random name
  const name = DIRECTOR_NAMES[Math.floor(Math.random() * DIRECTOR_NAMES.length)];
  
  // Search TMDB for that person
  const res = await fetch(
    `${TMDB_BASE}/search/person?query=${encodeURIComponent(name)}`,
    { headers: tmdbHeaders }
  );
  const data = await res.json();
  
  if (!data.results || data.results.length === 0) {
    console.log("Person not found:", name);
    return fetchRandomDirector();
  }

  const person = data.results[0];
  console.log(`Found: ${person.name} (ID: ${person.id})`);
  return { id: person.id, name: person.name };
}


async function fetchFilmography(personId) {
  const res = await fetch(`${TMDB_BASE}/person/${personId}/movie_credits`, { headers: tmdbHeaders });
  const data = await res.json();

  if (!data.crew) {
    console.log("No crew data returned");
    return [];
  }

  const movies = data.crew
    .filter(m => 
      m.job === "Director" &&
      m.vote_count > 50 &&
      !m.video &&
      m.release_date &&
      m.original_language &&
      m.vote_average > 0
    )
    .map(m => m.title);

  console.log("Filtered movies:", movies);
  return [...new Set(movies)];
}

// ── START GAME ─────────────────────────────────────
window.startGame = async function(attempts = 0) {
  if (attempts > 5) {
    console.error("Could not find a valid director after 5 attempts");
    document.getElementById("startBtn").disabled = false;
    document.getElementById("startBtn").textContent = "Try Again";
    return;
  }
  console.log("startGame called, attempt:", attempts);
  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").textContent = "Loading...";

  const director = await fetchRandomDirector();
  console.log("Director fetched:", director);

  const movies = await fetchFilmography(director.id);
  console.log("Movies fetched:", movies);

  if (movies.length < 3) {
    window.startGame(attempts + 1);
    return;
  }

  roundNum = 1;

  await update(ref(db, `rooms/${currentRoomCode}`), {
    status: "playing",
    currentRound: roundNum,
    prompt: {
      directorName: director.name,
      directorId: director.id,
      acceptedMovies: movies,
      timerSeconds: 9999,
      startedAt: Date.now()
    }
  });

  loadHostDashboard(currentRoomCode);
}

// ── LOAD GAME SCREEN ───────────────────────────────
function loadGameScreen(code) {
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("playerLobbyScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "flex";

  submittedAnswers = [];
  document.getElementById("answersSubmitted").innerHTML = "";
  document.getElementById("answerCount").textContent = "0";
  document.getElementById("answerInput").disabled = false;

  // Listen for the prompt data
  onValue(ref(db, `rooms/${code}/prompt`), (snapshot) => {
    const prompt = snapshot.val();
    if (!prompt) return;

    acceptedMovies = prompt.acceptedMovies || [];
    document.getElementById("promptText").textContent =
      `Name as many ${prompt.directorName} films as you can!`;
    document.getElementById("promptSub").textContent =
      `${acceptedMovies.length} films in the database`;
    document.getElementById("roundNum").textContent = prompt.currentRound || 1;

    startTimer(99999, code);
  }, { onlyOnce: true });

  // Listen for results
  onValue(ref(db, `rooms/${code}/status`), (snapshot) => {
    if (snapshot.val() === "results") {
      clearInterval(timerInterval);
      loadResultsScreen();
    }
  });
}

// ── TIMER ──────────────────────────────────────────
function startTimer(seconds, code) {
  secondsLeft = seconds;
    document.getElementById("timerNum").textContent = "∞";
  document.getElementById("timerBar").style.width = "100%";

  timerInterval = setInterval(() => {
    secondsLeft--;
    document.getElementById("timerNum").textContent = "∞";
    document.getElementById("timerBar").style.width = "100%";


    // Turn red when low
    if (secondsLeft <= 5) {
      document.getElementById("timerBar").style.background = "#e74c3c";
      document.getElementById("timerNum").style.color = "#e74c3c";
    }

    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      document.getElementById("answerInput").disabled = true;
      if (isHost) endRound(code);
    }
  }, 1000);
}


// ── ANSWER SEARCH DROPDOWN ─────────────────────────
let searchTimeout = null;
let selectedDropdownIndex = -1;
const searchCache = {};

window.onAnswerType = function(value) {
  clearTimeout(searchTimeout);
  selectedDropdownIndex = -1;

  if (value.length < 2) {
    closeDropdown();
    return;
  }

  // If we already searched this query, show cached results instantly
  if (searchCache[value.toLowerCase()]) {
    renderDropdown(searchCache[value.toLowerCase()]);
    return;
  }

  // Otherwise debounce at 200ms
  searchTimeout = setTimeout(() => searchMovies(value), 200);
}

async function searchMovies(query) {
  const res = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&page=1`,
    { headers: tmdbHeaders }
  );
  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    closeDropdown();
    return;
  }



  // Sort by popularity so best known version appears first
  const sorted = data.results
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 6);

  // Cache the results
  searchCache[query.toLowerCase()] = sorted;
  renderDropdown(sorted);
}

function renderDropdown(results) {
  const dropdown = document.getElementById("answerDropdown");
  dropdown.innerHTML = "";
  dropdown.style.display = "block";

  results.forEach((movie, i) => {
    const year = movie.release_date ? movie.release_date.split("-")[0] : "?";
    const poster = movie.poster_path
      ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
      : null;

    const item = document.createElement("div");
    item.style.cssText = `
      padding: 8px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #2a2a4a;
      transition: background 0.15s;
    `;
    item.innerHTML = `
      ${poster
        ? `<img src="${poster}" style="width:32px; height:48px; object-fit:cover; border-radius:4px; flex-shrink:0;" />`
        : `<div style="width:32px; height:48px; background:#2a2a4a; border-radius:4px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">🎬</div>`
      }
      <span style="flex:1; font-size:0.9rem;">${movie.title}</span>
      <span style="color:#888; font-size:0.75rem; flex-shrink:0;">${year}</span>
    `;
    item.onmouseenter = () => setDropdownIndex(i);
    item.onclick = () => selectMovie(movie.title);
    dropdown.appendChild(item);
  });
}

function setDropdownIndex(index) {
  selectedDropdownIndex = index;
  const items = document.querySelectorAll("#answerDropdown div");
  items.forEach((item, i) => {
    item.style.background = i === index ? "#2a2a4a" : "transparent";
  });
}

function closeDropdown() {
  document.getElementById("answerDropdown").style.display = "none";
  selectedDropdownIndex = -1;
}

function selectMovie(title) {
  document.getElementById("answerInput").value = title;
  closeDropdown();
  submitAnswer();
}

window.onAnswerKeydown = function(e) {
  const items = document.querySelectorAll("#answerDropdown div");

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setDropdownIndex(Math.min(selectedDropdownIndex + 1, items.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setDropdownIndex(Math.max(selectedDropdownIndex - 1, 0));
  } else if (e.key === "Enter") {
    if (selectedDropdownIndex >= 0 && items[selectedDropdownIndex]) {
      const title = items[selectedDropdownIndex].querySelector("span").textContent;
      selectMovie(title);
    } else {
      submitAnswer();
    }
  } else if (e.key === "Escape") {
    closeDropdown();
  }
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest("#answerInput") && !e.target.closest("#answerDropdown")) {
    closeDropdown();
  }
});

// ── SUBMIT ANSWER ──────────────────────────────────
window.submitAnswer = function() {
  const input = document.getElementById("answerInput");
  const answer = input.value.trim();
  if (!answer) return;

  // Check for duplicate
  if (submittedAnswers.map(a => a.toLowerCase()).includes(answer.toLowerCase())) {
    input.value = "";
    closeDropdown();
    input.focus();
    return;
  }

  submittedAnswers.push(answer);
  input.value = "";
  input.focus();

  // Check if correct
  const isCorrect = checkAnswer(answer);

  // Show answer tag
  const tag = document.createElement("div");
  tag.style.cssText = `
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    background: ${isCorrect ? "rgba(39,174,96,0.2)" : "rgba(231,76,60,0.2)"};
    border: 1px solid ${isCorrect ? "#27ae60" : "#e74c3c"};
    color: ${isCorrect ? "#2ecc71" : "#e74c3c"};
  `;
  tag.textContent = answer;
  document.getElementById("answersSubmitted").appendChild(tag);

  // Update score
  if (isCorrect) {
    currentScore += 100;
    document.getElementById("currentScore").textContent = currentScore;
  }

  document.getElementById("answerCount").textContent = submittedAnswers.length;

  // Save to Firebase
  set(ref(db, `rooms/${currentRoomCode}/answers/${currentUser.uid}`), submittedAnswers);
}

// ── CHECK ANSWER ───────────────────────────────────
function checkAnswer(answer) {
  const clean = str => str.toLowerCase()
    .replace(/^(the |a |an )/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  return acceptedMovies.some(movie => clean(movie) === clean(answer));
}

// ── END ROUND (HOST ONLY) ──────────────────────────
window.endRound = async function() {
  const code = currentRoomCode;
  const snapshot = await get(ref(db, `rooms/${code}/players`));
  const players = snapshot.val() || {};

  const answersSnap = await get(ref(db, `rooms/${code}/answers`));
  const allAnswers = answersSnap.val() || {};

  const updates = {};
  Object.entries(allAnswers).forEach(([uid, answers]) => {
    const correct = answers.filter(a => checkAnswer(a)).length;
    const pts = correct * 100;
    const current = players[uid]?.score || 0;
    updates[`rooms/${code}/players/${uid}/score`] = current + pts;
  });

  await update(ref(db), updates);
  await update(ref(db, `rooms/${code}`), { status: "results" });
}

// ── LOAD RESULTS SCREEN ────────────────────────────
async function loadResultsScreen() {
  document.getElementById("gameScreen").style.display = "none";
  document.getElementById("resultsScreen").style.display = "flex";

  // Show host/player next button
  if (isHost) {
    document.getElementById("hostNextBtn").style.display = "block";
    document.getElementById("playerWaitNext").style.display = "none";
  } else {
    document.getElementById("hostNextBtn").style.display = "none";
    document.getElementById("playerWaitNext").style.display = "block";
  }

  // Load leaderboard
  const snapshot = await get(ref(db, `rooms/${currentRoomCode}/players`));
  const players = snapshot.val() || {};

  const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
  const medals = ["🥇", "🥈", "🥉"];

  document.getElementById("leaderboard").innerHTML = sorted.map(([uid, p], i) => `
    <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #2a2a4a;">
      <span style="font-size:1.3rem;">${medals[i] || `${i + 1}.`}</span>
      <span style="font-size:1.2rem;">${p.emoji}</span>
      <span style="font-weight:600; flex:1;">${p.name}</span>
      <span style="color:#f5c842; font-weight:900; font-size:1.1rem;">${p.score} pts</span>
    </div>
  `).join("");

  // Show your answers review
  const answersSnap = await get(ref(db, `rooms/${currentRoomCode}/answers/${currentUser.uid}`));
  const myAnswers = answersSnap.val() || [];

  document.getElementById("yourAnswersReview").innerHTML = myAnswers.map(a => {
    const correct = checkAnswer(a);
    return `<span style="
      display:inline-block; margin:4px;
      padding:6px 14px; border-radius:999px; font-size:0.85rem;
      background:${correct ? "rgba(39,174,96,0.2)" : "rgba(231,76,60,0.2)"};
      border:1px solid ${correct ? "#27ae60" : "#e74c3c"};
      color:${correct ? "#2ecc71" : "#e74c3c"};
    ">${a}</span>`;
  }).join("") || "<p style='color:#888'>No answers submitted</p>";

  // Listen for next round
  onValue(ref(db, `rooms/${currentRoomCode}/status`), (snapshot) => {
    if (snapshot.val() === "playing") {
      loadGameScreen(currentRoomCode);
    }
    if (snapshot.val() === "ended") {
      loadEndGameScreen();
    }
  });
}

// ── END GAME ───────────────────────────────────────
async function loadEndGameScreen() {
  // Hide all other screens
  document.getElementById("gameScreen").style.display = "none";
  document.getElementById("resultsScreen").style.display = "none";
  document.getElementById("endGameScreen").style.display = "flex";
  document.getElementById("hostDashboard").style.display = "none";
  document.getElementById("hostResultsScreen").style.display = "none";

  // Get final player data
  const snapshot = await get(ref(db, `rooms/${currentRoomCode}/players`));
  const players = snapshot.val() || {};
  const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score);

  // Stats — different for host vs player
  document.getElementById("finalRounds").textContent = roundNum;
  if (isHost) {
    document.getElementById("finalPlayerCount").textContent = sorted.length;
    document.getElementById("finalSecondLabel").textContent = "Players";
  } else {
    const myRank = sorted.findIndex(([uid]) => uid === currentUser.uid) + 1;
    document.getElementById("finalPlayerCount").textContent = `#${myRank}`;
    document.getElementById("finalSecondLabel").textContent = "Your Rank";
  }

  // Build podium (top 3)
  buildPodium(sorted);

  // Build full leaderboard
  const medals = ["🥇", "🥈", "🥉"];
  document.getElementById("finalLeaderboard").innerHTML = sorted.map(([uid, p], i) => `
    <div style="
      display:flex; align-items:center; gap:12px; 
      padding:12px 0; border-bottom:1px solid #2a2a4a;
      ${uid === currentUser.uid ? "background:rgba(245,200,66,0.05); margin:0 -24px; padding:12px 24px;" : ""}
    ">
      <span style="font-size:1.2rem; min-width:28px;">${medals[i] || `${i + 1}.`}</span>
      <span style="font-size:1.2rem;">${p.emoji}</span>
      <span style="font-weight:600; flex:1; ${uid === currentUser.uid ? "color:#f5c842;" : ""}">${p.name}</span>
      <span style="color:#f5c842; font-weight:900;">${p.score} pts</span>
    </div>
  `).join("");

  // Show host/player buttons
  if (isHost) {
    document.getElementById("endHostBtn").style.display = "block";
    document.getElementById("endPlayerWait").style.display = "none";
  } else {
    document.getElementById("endHostBtn").style.display = "none";
    document.getElementById("endPlayerWait").style.display = "block";
  }

  // Listen for restart
  onValue(ref(db, `rooms/${currentRoomCode}/status`), (snapshot) => {
    if (snapshot.val() === "waiting") {
      location.reload();
    }
  });
}

function buildPodium(sorted) {
  const podium = document.getElementById("podium");
  podium.innerHTML = "";

  // Podium order: 2nd, 1st, 3rd
  const order = [1, 0, 2];
  const heights = [110, 150, 80];
  const colors = ["#aaa", "#f5c842", "#cd7f32"];
  const labels = ["🥈", "🥇", "🥉"];

  order.forEach((rank, i) => {
    const entry = sorted[rank];
    if (!entry) return;
    const [uid, player] = entry;

    const place = document.createElement("div");
    place.className = "podium-place";
    place.style.animation = `podiumRise 0.6s ease ${i * 0.2}s both`;
    place.innerHTML = `
      <div style="font-size:2rem;">${player.emoji}</div>
      <div class="podium-name" style="color:${colors[i]}">${player.name}</div>
      <div class="podium-score">${player.score} pts</div>
      <div class="podium-block" style="height:${heights[i]}px; background:${colors[i]}22; border:2px solid ${colors[i]};">
        ${labels[i]}
      </div>
    `;
    podium.appendChild(place);
  });
}

// ── RESTART GAME (HOST ONLY) ───────────────────────
window.restartGame = async function() {
  await update(ref(db, `rooms/${currentRoomCode}`), {
    status: "waiting",
    currentRound: 0,
    prompt: null,
    answers: null
  });
}

// ── END GAME TRIGGER (HOST ONLY) ───────────────────
window.endGame = async function() {
  await update(ref(db, `rooms/${currentRoomCode}`), { status: "ended" });
}

// ── NEXT ROUND (HOST ONLY) ─────────────────────────
window.nextRound = async function() {
    document.getElementById("hostResultsScreen").style.display = "none"; // ← add this
    document.getElementById("hostResultsScreen").style.display = "none";

  // Reset answers
  await set(ref(db, `rooms/${currentRoomCode}/answers`), null);

  // Fetch new director
  const director = await fetchRandomDirector();
  const movies = await fetchFilmography(director.id);

  if (movies.length < 3) {
    window.nextRound();
    return;
  }

  roundNum++;
  currentScore = 0;

  await update(ref(db, `rooms/${currentRoomCode}`), {
    status: "playing",
    currentRound: roundNum,
    prompt: {
      directorName: director.name,
      directorId: director.id,
      acceptedMovies: movies,
      timerSeconds: 9999,
      startedAt: Date.now()
    }
  });

  loadHostDashboard(currentRoomCode)
}
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

// ── CUSTOM GAME SETUP ──────────────────────────────
let customRounds = [];
let selectedPerson = null;
let personSearchTimeout = null;
const personSearchCache = {};

window.showCustomSetup = function() {
  document.getElementById("homeScreen").style.display = "none";
  document.getElementById("customSetupScreen").style.display = "flex";
}

window.hideCustomSetup = function() {
  document.getElementById("customSetupScreen").style.display = "none";
  document.getElementById("homeScreen").style.display = "flex";
}

window.searchPerson = function(value) {
  clearTimeout(personSearchTimeout);
  selectedPerson = null;
  document.getElementById("addRoundBtn").disabled = true;
  document.getElementById("selectedPersonPreview").style.display = "none";

  if (value.length < 2) {
    document.getElementById("personDropdown").style.display = "none";
    return;
  }

  if (personSearchCache[value.toLowerCase()]) {
    renderPersonDropdown(personSearchCache[value.toLowerCase()]);
    return;
  }

  personSearchTimeout = setTimeout(() => fetchPersonSearch(value), 250);
}

async function fetchPersonSearch(query) {
  const res = await fetch(
    `${TMDB_BASE}/search/person?query=${encodeURIComponent(query)}&page=1`,
    { headers: tmdbHeaders }
  );
  const data = await res.json();
  if (!data.results || !data.results.length) {
    document.getElementById("personDropdown").style.display = "none";
    return;
  }

  // Filter to directors and actors only, sort by popularity
  const filtered = data.results
    .filter(p => ["Directing", "Acting"].includes(p.known_for_department))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 6);

  personSearchCache[query.toLowerCase()] = filtered;
  renderPersonDropdown(filtered);
}

function renderPersonDropdown(people) {
  const dropdown = document.getElementById("personDropdown");
  dropdown.innerHTML = "";
  dropdown.style.display = "block";

  people.forEach(person => {
    const photo = person.profile_path
      ? `https://image.tmdb.org/t/p/w92${person.profile_path}`
      : null;

    const knownFor = person.known_for
      ?.slice(0, 2)
      .map(k => k.title || k.name)
      .join(", ") || person.known_for_department;

    const item = document.createElement("div");
    item.style.cssText = `
      padding: 10px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #2a2a4a;
      transition: background 0.15s;
    `;
    item.innerHTML = `
      ${photo
        ? `<img src="${photo}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; flex-shrink:0;" />`
        : `<div style="width:36px; height:36px; border-radius:50%; background:#2a2a4a; display:flex; align-items:center; justify-content:center; flex-shrink:0;">🎬</div>`
      }
      <div>
        <div style="font-size:0.9rem; font-weight:600;">${person.name}</div>
        <div style="font-size:0.72rem; color:#888;">${person.known_for_department} · ${knownFor}</div>
      </div>
    `;
    item.onmouseenter = () => item.style.background = "#2a2a4a";
    item.onmouseleave = () => item.style.background = "transparent";
    item.onclick = () => selectPerson(person);
    dropdown.appendChild(item);
  });
}

function selectPerson(person) {
  selectedPerson = person;
  document.getElementById("personDropdown").style.display = "none";
  document.getElementById("personSearch").value = person.name;
  document.getElementById("addRoundBtn").disabled = true; // disabled until dept chosen

  // Reset dept buttons
  document.getElementById("deptDirector").style.background = "transparent";
  document.getElementById("deptDirector").style.color = "#888";
  document.getElementById("deptDirector").style.borderColor = "#2a2a4a";
  document.getElementById("deptActor").style.background = "transparent";
  document.getElementById("deptActor").style.color = "#888";
  document.getElementById("deptActor").style.borderColor = "#2a2a4a";

  const preview = document.getElementById("selectedPersonPreview");
  preview.style.display = "flex";
  document.getElementById("selectedPersonName").textContent = person.name;
  document.getElementById("selectedPersonKnownFor").textContent =
    person.known_for?.slice(0, 2).map(k => k.title || k.name).join(", ") || "";

  const photo = person.profile_path
    ? `https://image.tmdb.org/t/p/w92${person.profile_path}`
    : "https://via.placeholder.com/44";
  document.getElementById("selectedPersonImg").src = photo;
}

// Set Department
window.setDepartment = function(dept) {
  selectedPerson.known_for_department = dept;

  // Update Director button
  document.getElementById("deptDirector").style.background = dept === "Directing" ? "#f5c842" : "transparent";
  document.getElementById("deptDirector").style.color = dept === "Directing" ? "#0f0f1a" : "#888";
  document.getElementById("deptDirector").style.borderColor = dept === "Directing" ? "#f5c842" : "#2a2a4a";

  // Update Actor button
  document.getElementById("deptActor").style.background = dept === "Acting" ? "#f5c842" : "transparent";
  document.getElementById("deptActor").style.color = dept === "Acting" ? "#0f0f1a" : "#888";
  document.getElementById("deptActor").style.borderColor = dept === "Acting" ? "#f5c842" : "#2a2a4a";

  document.getElementById("addRoundBtn").disabled = false;
}

window.addRound = async function() {
  if (!selectedPerson) return;

  const timeLimit = parseInt(document.getElementById("roundTimeLimit").value);
  const points = parseInt(document.getElementById("roundPoints").value);

  // Fetch their movies
  document.getElementById("addRoundBtn").textContent = "Fetching films...";
  document.getElementById("addRoundBtn").disabled = true;

  const movies = await fetchFilmography(selectedPerson.id, selectedPerson.known_for_department);


  if (movies.length < 2) {
    document.getElementById("addRoundBtn").textContent = "+ Add Round";
    document.getElementById("addRoundBtn").disabled = false;
    alert(`Not enough films found for ${selectedPerson.name}. Try someone else!`);
    return;
  }

  const round = {
    personId: selectedPerson.id,
    personName: selectedPerson.name,
    department: selectedPerson.known_for_department,
    acceptedMovies: movies,
    timerSeconds: timeLimit === 0 ? 99999 : timeLimit,
    pointsPerAnswer: points
  };

  customRounds.push(round);
  renderRoundList();

  // Reset search
  selectedPerson = null;
  document.getElementById("personSearch").value = "";
  document.getElementById("selectedPersonPreview").style.display = "none";
  document.getElementById("addRoundBtn").textContent = "+ Add Round";
  document.getElementById("addRoundBtn").disabled = true;
  document.getElementById("createCustomBtn").disabled = customRounds.length === 0;
}

function renderRoundList() {
  const container = document.getElementById("roundList");
  document.getElementById("roundCountLabel").textContent = `${customRounds.length} round${customRounds.length !== 1 ? "s" : ""} added`;

  if (customRounds.length === 0) {
    container.innerHTML = `<p style="color:#888; font-size:0.85rem; text-align:center; padding:20px 0;">No rounds added yet!</p>`;
    return;
  }

  container.innerHTML = customRounds.map((r, i) => `
    <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #2a2a4a;">
      <div style="background:#f5c842; color:#0f0f1a; font-weight:900; font-size:0.75rem; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${i + 1}</div>
      <div style="flex:1;">
        <div style="font-weight:600; font-size:0.95rem;">${r.personName}</div>
        <div style="font-size:0.72rem; color:#888;">
          ${r.acceptedMovies.length} films · 
          ${r.timerSeconds === 99999 ? "No limit" : r.timerSeconds + "s"} · 
          ${r.pointsPerAnswer} pts/answer
        </div>
      </div>
      <button onclick="removeRound(${i})" style="background:transparent; border:none; color:#e74c3c; cursor:pointer; font-size:1.1rem;">✕</button>
    </div>
  `).join("");

  document.getElementById("createCustomBtn").disabled = false;
  document.getElementById("customSetupError").style.display = "none";
}

window.removeRound = function(index) {
  customRounds.splice(index, 1);
  renderRoundList();
  document.getElementById("createCustomBtn").disabled = customRounds.length === 0;
}

window.createCustomRoom = async function() {
  if (customRounds.length === 0) {
    document.getElementById("customSetupError").style.display = "block";
    return;
  }

  const code = generateCode();
  currentRoomCode = code;
  isHost = true;

  await set(ref(db, `rooms/${code}`), {
    status: "waiting",
    hostUid: currentUser.uid,
    createdAt: Date.now(),
    isCustom: true,
    customRounds: customRounds,
    currentRoundIndex: 0,
    players: {}
  });

  document.getElementById("customSetupScreen").style.display = "none";
  showHostLobby(code);
}

// ── QUICK GAME ─────────────────────────────────────
window.startQuickGame = async function() {
  const code = generateCode();
  currentRoomCode = code;
  isHost = true;

  await set(ref(db, `rooms/${code}`), {
    status: "waiting",
    hostUid: currentUser.uid,
    createdAt: Date.now(),
    isCustom: false,
    players: {}
  });

  showHostLobby(code);
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
const PEOPLE = [
  { name: "Christopher Nolan", department: "Directing" },
  { name: "Wes Anderson", department: "Directing" },
  { name: "Martin Scorsese", department: "Directing" },
  { name: "Quentin Tarantino", department: "Directing" },
  { name: "Steven Spielberg", department: "Directing" },
  { name: "Greta Gerwig", department: "Directing" },
  { name: "Denis Villeneuve", department: "Directing" },
  { name: "David Fincher", department: "Directing" },
  { name: "Jordan Peele", department: "Directing" },
  { name: "Ridley Scott", department: "Directing" },
  { name: "Tom Hanks", department: "Acting" },
  { name: "Meryl Streep", department: "Acting" },
  { name: "Leonardo DiCaprio", department: "Acting" },
  { name: "Cate Blanchett", department: "Acting" },
  { name: "Denzel Washington", department: "Acting" },
  { name: "Emma Stone", department: "Acting" },
  { name: "Brad Pitt", department: "Acting" },
  { name: "Natalie Portman", department: "Acting" },
  { name: "Morgan Freeman", department: "Acting" },
  { name: "Viola Davis", department: "Acting" }
];

async function fetchRandomDirector() {
  const person = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
  
  const res = await fetch(
    `${TMDB_BASE}/search/person?query=${encodeURIComponent(person.name)}`,
    { headers: tmdbHeaders }
  );
  const data = await res.json();
  
  if (!data.results || data.results.length === 0) return fetchRandomDirector();

  const result = data.results[0];
  return { id: result.id, name: result.name, department: person.department };
}


async function fetchFilmography(personId, department = "Directing") {
  const res = await fetch(`${TMDB_BASE}/person/${personId}/movie_credits`, { headers: tmdbHeaders });
  const data = await res.json();

  if (!data.crew && !data.cast) {
    console.log("No credits returned");
    return [];
  }

  let movies = [];

  if (department === "Acting") {
    // Use cast credits for actors
    movies = (data.cast || [])
      .filter(m =>
        m.vote_count > 30 &&
        !m.video &&
        m.release_date &&
        m.vote_average > 0 &&
        m.order < 10 // only movies where they had a significant role
      )
      .map(m => m.title);
  } else {
    // Use crew credits for directors
    movies = (data.crew || [])
      .filter(m =>
        m.job === "Director" &&
        m.vote_count > 30 &&
        !m.video &&
        m.release_date &&
        m.vote_average > 0
      )
      .map(m => m.title);
  }

  console.log("Filtered movies:", movies);
  return [...new Set(movies)];
}

// ── START GAME ─────────────────────────────────────
window.startGame = async function(attempts = 0) {
  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").textContent = "Loading...";

  // Check if custom or quick game
  const roomSnap = await get(ref(db, `rooms/${currentRoomCode}`));
  const roomData = roomSnap.val();

  if (roomData.isCustom) {
    // Custom game — use first round from the list
    const round = roomData.customRounds[0];
    roundNum = 1;
    acceptedMovies = round.acceptedMovies;

    await update(ref(db, `rooms/${currentRoomCode}`), {
      status: "playing",
      currentRound: 1,
      currentRoundIndex: 0,
      prompt: {
        directorName: round.personName,
        directorId: round.personId,
        department: round.department, // ← add this
        acceptedMovies: round.acceptedMovies,
        timerSeconds: round.timerSeconds,
        pointsPerAnswer: round.pointsPerAnswer,
        startedAt: Date.now()
      }
    });
  } else {
    // Quick game — random director
    if (attempts > 5) {
      document.getElementById("startBtn").disabled = false;
      document.getElementById("startBtn").textContent = "Try Again";
      return;
    }

    const director = await fetchRandomDirector();
    const movies = await fetchFilmography(director.id, "Directing");


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
        department: director.department, // ← add this
        acceptedMovies: movies,
        timerSeconds: 99999,
        pointsPerAnswer: 100,
        startedAt: Date.now()
      }
    });
  }

  loadHostDashboard(currentRoomCode);
}

// ── LOAD GAME SCREEN ───────────────────────────────
function loadGameScreen(code) {
  document.getElementById("resultsScreen").style.display = "none"; // ← add this
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("playerLobbyScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "flex";

  currentScore = 0; // ← add this
  submittedAnswers = [];
  document.getElementById("answersSubmitted").innerHTML = "";
  document.getElementById("answerCount").textContent = "0";
  document.getElementById("answerInput").disabled = false;
  document.getElementById("currentScore").textContent = "0"; // ← also reset score display


  // Listen for the prompt data
  onValue(ref(db, `rooms/${code}/prompt`), (snapshot) => {
    const prompt = snapshot.val();
    if (!prompt) return;

    acceptedMovies = prompt.acceptedMovies || [];
    window.currentPointsPerAnswer = prompt.pointsPerAnswer || 100; // ← add here
    const dept = prompt.department || "Directing";
    document.getElementById("promptText").textContent = dept === "Acting"
    ? `Name as many movies starring ${prompt.directorName} as you can!`
    : `Name as many ${prompt.directorName} films as you can!`;
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
    const pts = acceptedMovies.pointsPerAnswer || 100;
    currentScore += window.currentPointsPerAnswer || 100;
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
  document.getElementById("hostResultsScreen").style.display = "none";
  document.getElementById("hostDashboard").style.display = "none";

  await set(ref(db, `rooms/${currentRoomCode}/answers`), null);

  const roomSnap = await get(ref(db, `rooms/${currentRoomCode}`));
  const roomData = roomSnap.val();

  if (roomData.isCustom) {
    const nextIndex = (roomData.currentRoundIndex || 0) + 1;

    // Check if we've run out of custom rounds
    if (nextIndex >= roomData.customRounds.length) {
      await update(ref(db, `rooms/${currentRoomCode}`), { status: "ended" });
      loadEndGameScreen();
      return;
    }

    const round = roomData.customRounds[nextIndex];
    roundNum++;
    acceptedMovies = round.acceptedMovies;

    await update(ref(db, `rooms/${currentRoomCode}`), {
      status: "playing",
      currentRound: roundNum,
      currentRoundIndex: nextIndex,
      prompt: {
        directorName: round.personName,
        directorId: round.personId,
        department: round.department, // ← add this
        acceptedMovies: round.acceptedMovies,
        timerSeconds: round.timerSeconds,
        pointsPerAnswer: round.pointsPerAnswer,
        startedAt: Date.now()
      }
    });

  } else {
    // Quick game — random director
    const director = await fetchRandomDirector();
    const movies = await fetchFilmography(director.id, "Directing");


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
        department: director.department, // ← add this
        acceptedMovies: movies,
        timerSeconds: 99999,
        pointsPerAnswer: 100,
        startedAt: Date.now()
      }
    });
  }

  loadHostDashboard(currentRoomCode);
}
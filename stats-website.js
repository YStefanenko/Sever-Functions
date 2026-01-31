import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeCustomMatches, activeMatches, CONNECTED_IPS, loadRounds } from './globalVariables.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.static('public'));

const ADMIN_USERNAME = "simple";
const ADMIN_PASSWORD = "simple";

const authenticate = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Auth required' });

  try {
    const [username, password] = Buffer.from(auth.split(' ')[1], 'base64')
      .toString()
      .split(':');

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      next();
    } else {
      res.status(403).json({ error: 'Invalid credentials' });
    }
  } catch {
    res.status(401).json({ error: 'Bad auth format' });
  }
};

function getOngoingMatchStats() {
  return {
    normal: activeMatches.size,
    custom: activeCustomMatches.size
  };
}

function getConnectedPlayers() {
  return CONNECTED_IPS.size;
}

app.get('/api/stats', authenticate, (req, res) => {
  try {
    const matches = getOngoingMatchStats();
    const players = getConnectedPlayers();
    const roundsPlayed = loadRounds();

    res.json({
      ongoingMatches: {
        normal: matches.normal,
        custom: matches.custom
      },
      connectedPlayers: players,
      roundsPlayed: roundsPlayed
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});


app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WOD Stats Panel</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#171717] text-white min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-3xl">
    <div class="bg-[#1f1f1f] rounded-2xl shadow-2xl border border-yellow-600/20 p-8">
      <h1 class="text-4xl font-bold text-yellow-500 mb-8 text-center">
        WOD ${process.env.name} Live Stats
      </h1>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div class="bg-[#2a2a2a] p-6 rounded-xl border border-yellow-600/10">
          <p class="text-sm text-yellow-400/70 mb-2">Ranked Matches</p>
          <p id="normalMatches" class="text-4xl font-bold text-yellow-400">–</p>
        </div>

        <div class="bg-[#2a2a2a] p-6 rounded-xl border border-yellow-600/10">
          <p class="text-sm text-yellow-400/70 mb-2">Custom Matches</p>
          <p id="customMatches" class="text-4xl font-bold text-yellow-400">–</p>
        </div>

        <div class="bg-[#2a2a2a] p-6 rounded-xl border border-yellow-600/10">
          <p class="text-sm text-yellow-400/70 mb-2">Connected Players</p>
          <p id="connectedPlayers" class="text-4xl font-bold text-yellow-400">–</p>
        </div>

        <div class="bg-[#2a2a2a] p-6 rounded-xl border border-yellow-600/10">
          <p class="text-sm text-yellow-400/70 mb-2">Total Rounds Played</p>
          <p id="roundsPlayed" class="text-4xl font-bold text-yellow-400">–</p>
        </div>
      </div>
    </div>
  </div>

<script>
  function getAuth() {
    return localStorage.getItem('authToken') || '';
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats', {
        headers: { 'Authorization': getAuth() }
      });

      if (res.status === 401 || res.status === 403) {
        showLogin();
        return;
      }

      const data = await res.json();

      document.getElementById('normalMatches').textContent = data.ongoingMatches.normal;
      document.getElementById('customMatches').textContent = data.ongoingMatches.custom;
      document.getElementById('connectedPlayers').textContent = data.connectedPlayers;
      document.getElementById('roundsPlayed').textContent = data.roundsPlayed;

    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }

  function showLogin() {
    document.body.innerHTML = \`
      <div class="min-h-screen flex items-center justify-center p-6">
        <form id="loginForm" class="bg-[#1f1f1f] p-8 rounded-xl border border-yellow-600/30 w-full max-w-sm space-y-4">
          <h1 class="text-2xl font-bold text-yellow-500 text-center">Admin Login</h1>
          <input id="username" placeholder="Username" class="w-full p-2 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
          <input id="password" type="password" placeholder="Password" class="w-full p-2 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
          <button class="w-full bg-yellow-600 hover:bg-yellow-700 text-[#171717] font-bold py-2 rounded">Login</button>
        </form>
      </div>
    \`;

    document.getElementById('loginForm').onsubmit = (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      const token = 'Basic ' + btoa(u + ':' + p);
      localStorage.setItem('authToken', token);
      location.reload();
    };
  }

  if (!getAuth()) {
    showLogin();
  } else {
    fetchStats();
    setInterval(fetchStats, 5000);
  }
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`📊 Stats panel running at http://localhost:\${PORT}`);
});
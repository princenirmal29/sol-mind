/* sol-mind 2.O at 3rd march */
//  CONFIG 
const API_BASE = "http://localhost:3001";
const OW_KEY   = "REPLACE_WITH_YOUR_OPENWEATHER_API_KEY";

const SOUND_SOURCES = {
  river:  "https://www.soundjay.com/nature/sounds/river-1.mp3",
  wind:   "https://www.soundjay.com/nature/sounds/wind-1.mp3",
  forest: "https://www.soundjay.com/nature/sounds/forest-1.mp3",
};

//  STATE 
let weatherData  = { condition: "Unknown", icon: "🌤️", temp: "--" };
let currentSound = null;
let soundPaused  = false;

//  DOM REFS 
const $ = (id) => document.getElementById(id);
const dom = {
  weatherIcon:   $("weather-icon"),
  weatherText:   $("weather-text"),
  timeBadge:     $("time-badge"),
  sleepInput:    $("sleep-input"),
  stressSlider:  $("stress-slider"),
  stressValue:   $("stress-value"),
  pips:          document.querySelectorAll(".pip"),
  outdoorInput:  $("outdoor-input"),
  analyzeBtn:    $("analyze-btn"),
  scoreNumber:   $("score-number"),
  scoreFill:     $("score-ring-fill"),
  stateBadge:    $("state-badge"),
  stateText:     $("state-text"),
  stateDot:      $("state-dot"),
  nightCard:     $("night-card"),
  nightList:     $("night-suggestions"),
  insightsList:  $("insights-list"),
  trendChart:    $("trend-chart"),
  breakdownGrid: $("breakdown-grid"),
  soundCard:     $("sound-card"),
  soundViz:      $("sound-visualizer"),
  soundName:     $("sound-name"),
  soundReason:   $("sound-reason"),
  playBtn:       $("play-btn"),
  playIcon:      $("play-icon"),
  pauseIcon:     $("pause-icon"),
  volumeSlider:  $("volume-slider"),
  errorBanner:   $("error-banner"),
  errorText:     $("error-text"),
};

//  CLOCK 
function updateClock() {
  const now = new Date();
  const h   = now.getHours().toString().padStart(2, "0");
  const m   = now.getMinutes().toString().padStart(2, "0");
  dom.timeBadge.textContent = `${h}:${m}`;
}
setInterval(updateClock, 1000);
updateClock();

// WEATHER 
async function fetchWeather() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude: lat, longitude: lon } = pos.coords;
      const url  = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OW_KEY}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();

      const main = data.weather?.[0]?.main  || "Unknown";
      const desc = data.weather?.[0]?.description || "Unknown";
      const temp = Math.round(data.main?.temp ?? "--");
      const icon = mapWeatherIcon(main);

      weatherData = { condition: desc, icon, temp };
      dom.weatherIcon.textContent = icon;
      dom.weatherText.textContent = `${main} · ${temp}°C`;
    } catch {
      dom.weatherText.textContent = "Weather unavailable";
    }
  }, () => {
    dom.weatherText.textContent = "Location denied";
  });
}

function mapWeatherIcon(main) {
  const m = main.toLowerCase();
  if (m.includes("clear"))   return "☀️";
  if (m.includes("cloud"))   return "☁️";
  if (m.includes("rain"))    return "🌧️";
  if (m.includes("drizzle")) return "🌦️";
  if (m.includes("thunder")) return "⛈️";
  if (m.includes("snow"))    return "❄️";
  if (m.includes("mist") || m.includes("fog")) return "🌫️";
  return "🌤️";
}

//stress slider
dom.stressSlider.addEventListener("input", () => {
  const val = parseInt(dom.stressSlider.value);
  dom.stressValue.textContent = val;
  dom.pips.forEach((pip, i) => pip.classList.toggle("active", i < val));
});

// Initialize pips
const initStress = parseInt(dom.stressSlider.value);
dom.pips.forEach((pip, i) => pip.classList.toggle("active", i < initStress));

// analyze
async function analyze() {
  const sleep   = parseFloat(dom.sleepInput.value);
  const stress  = parseInt(dom.stressSlider.value);
  const outdoor = parseInt(dom.outdoorInput.value);

  if (isNaN(sleep) || sleep < 0 || sleep > 24)
    return showError("Enter a valid sleep duration (0–24 hours).");
  if (isNaN(outdoor) || outdoor < 0)
    return showError("Enter a valid outdoor time (0+ minutes).");

  hideError();
  setLoading(true);

  try {
    const payload = {
      sleep, stress, outdoor,
      weather:   weatherData.condition,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`${API_BASE}/analyze`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }

    const data = await res.json();

    renderScore(data.score, data.state);
    renderBreakdown(sleep, stress, outdoor);
    renderInsights(data.insights);
    renderNightMode(data.nightMode);
    renderSoundEngine(data.soundProfile);
    await loadHistory();

  } catch (err) {
    const msg = err.message.includes("fetch")
      ? "Cannot reach backend. Ensure the server is running on port 3001."
      : err.message;
    showError(msg);
  } finally {
    setLoading(false);
  }
}

//RENDER: SCORE
function renderScore(score, state) {
  dom.scoreNumber.textContent = score;

  // Ring: circumference = 2π × 96 ≈ 603.2
  const C = 603.2;
  dom.scoreFill.style.strokeDashoffset = C - (score / 100) * C;

  // Map state to gradient ID and class
  const stateMap = {
    Balanced: { grad: "url(#ring-grad-balanced)", cls: "balanced" },
    Moderate: { grad: "url(#ring-grad-moderate)", cls: "moderate" },
    Low:      { grad: "url(#ring-grad-low)",      cls: "low" },
  };
  const s = stateMap[state] || { grad: "url(#ring-grad-default)", cls: "" };
  dom.scoreFill.setAttribute("stroke", s.grad);

  // State badge
  dom.stateBadge.className = `state-display ${s.cls}`;
  dom.stateText.textContent = state;
}

//  RENDER: BREAKDOWN 
function renderBreakdown(sleep, stress, outdoor) {
  // Compute contribution signals (indicative, not exact LMBI weights)
  const sleepNorm   = Math.max(0, Math.min(1, (sleep  - 3) / 6));   // 3–9h
  const stressNorm  = 1 - Math.max(0, Math.min(1, (stress - 1) / 4)); // 1–5
  const outdoorNorm = Math.max(0, Math.min(1, outdoor / 120));        // 0–120m

  const items = [
    {
      icon: "💤",
      label: "Sleep Quality",
      raw: sleep,
      unit: "hr",
      norm: sleepNorm,
      dir: sleepNorm >= 0.6 ? "pos" : sleepNorm >= 0.35 ? "neu" : "neg",
    },
    {
      icon: "🧠",
      label: "Stress Index",
      raw: stress,
      unit: "/5",
      norm: 1 - stressNorm, // bar shows stress amount (higher = worse)
      dir: stressNorm >= 0.7 ? "pos" : stressNorm >= 0.4 ? "neu" : "neg",
    },
    {
      icon: "🌿",
      label: "Outdoor Exposure",
      raw: outdoor,
      unit: "min",
      norm: outdoorNorm,
      dir: outdoorNorm >= 0.5 ? "pos" : outdoorNorm >= 0.2 ? "neu" : "neg",
    },
  ];

  dom.breakdownGrid.innerHTML = items.map((item) => `
    <div class="breakdown-row bd--${item.dir}">
      <div class="breakdown-row__icon">${item.icon}</div>
      <span class="breakdown-row__label">${item.label}</span>
      <div class="breakdown-row__bar-wrap">
        <div class="breakdown-row__bar" style="width:${Math.round(item.norm * 100)}%"></div>
      </div>
      <span class="breakdown-row__value">${item.raw}${item.unit}</span>
    </div>
  `).join("");
}

// RENDER: INSIGHTS
const INSIGHT_ICONS = ["💤", "🧠", "🌿", "🌦️", "✦"];

function renderInsights(insights) {
  dom.insightsList.innerHTML = insights.map((text, i) => `
    <li class="insight-card">
      <span class="insight-card__icon">${INSIGHT_ICONS[i] || "·"}</span>
      <span>${text}</span>
    </li>
  `).join("");
}

//  RENDER: NIGHT MODE
function renderNightMode(nightMode) {
  if (!nightMode?.active) {
    dom.nightCard.classList.remove("visible");
    return;
  }
  dom.nightList.innerHTML = nightMode.suggestions
    .map((s) => `<li>${s}</li>`)
    .join("");
  dom.nightCard.classList.add("visible");
}

//  RENDER: SOUND ENGINE
function renderSoundEngine(soundProfile) {
  if (!soundProfile) { dom.soundCard.classList.remove("visible"); return; }

  dom.soundName.textContent   = soundProfile.label;
  dom.soundReason.textContent = soundProfile.reason;
  dom.soundCard.classList.add("visible");

  if (currentSound) { currentSound.pause(); currentSound = null; }

  const src = SOUND_SOURCES[soundProfile.type];
  if (src) {
    currentSound        = new Audio(src);
    currentSound.loop   = true;
    currentSound.volume = parseFloat(dom.volumeSlider.value);
    currentSound.play().catch(() => {
      dom.soundReason.textContent += " — Press ▶ to start";
    });
  }

  soundPaused = false;
  setPlayState(true);
}

function setPlayState(playing) {
  soundPaused = !playing;
  dom.playIcon.style.display  = playing ? "none"  : "block";
  dom.pauseIcon.style.display = playing ? "block" : "none";
  dom.soundViz.classList.toggle("paused", !playing);
}

dom.playBtn.addEventListener("click", () => {
  if (!currentSound) return;
  if (soundPaused) { currentSound.play(); setPlayState(true); }
  else             { currentSound.pause(); setPlayState(false); }
});

dom.volumeSlider.addEventListener("input", () => {
  if (currentSound) currentSound.volume = parseFloat(dom.volumeSlider.value);
});

//RENDER: HISTORY 
async function loadHistory() {
  try {
    const res  = await fetch(`${API_BASE}/history`);
    const data = await res.json();
    renderTrend(data.history.slice(0, 5));
  } catch {
    dom.trendChart.innerHTML = `<div class="trend-empty">History unavailable</div>`;
  }
}

function renderTrend(history) {
  if (!history?.length) {
    dom.trendChart.innerHTML = `<div class="trend-empty">No history yet</div>`;
    return;
  }

  dom.trendChart.innerHTML = history.map((entry) => {
    const heightPct = Math.max(5, entry.score);
    const cls       = entry.state.toLowerCase();
    const time      = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="trend-col">
        <div class="trend-bar ${cls}" style="height:${heightPct}%" data-score="${entry.score}" title="${entry.state}: ${entry.score}"></div>
        <span class="trend-time">${time}</span>
      </div>
    `;
  }).join("");
}

//Ui helpers
function setLoading(state) {
  dom.analyzeBtn.classList.toggle("loading", state);
}

function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBanner.classList.add("visible");
}

function hideError() {
  dom.errorBanner.classList.remove("visible");
}

// init
function init() {
  fetchWeather();
  loadHistory();

  dom.analyzeBtn.addEventListener("click", analyze);

  [dom.sleepInput, dom.outdoorInput].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(); });
  });
}

document.addEventListener("DOMContentLoaded", init);

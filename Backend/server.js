

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// In-memory history store (last 50 entries)
const lmbiHistory = [];

//lmbi formulae
const normalize = (val, min, max) => Math.max(0, Math.min(1, (val - min) / (max - min)));

const weatherMultiplier = (condition = "") => {
  const c = condition.toLowerCase();
  if (c.includes("clear") || c.includes("sunny")) return 1.0;
  if (c.includes("cloud") || c.includes("partly")) return 0.75;
  if (c.includes("rain") || c.includes("drizzle")) return 0.5;
  if (c.includes("storm") || c.includes("thunder")) return 0.3;
  if (c.includes("snow")) return 0.6;
  if (c.includes("fog") || c.includes("mist")) return 0.55;
  return 0.7; // default for unknown
};

const computeLMBI = ({ sleep, stress, outdoor, weather, isNight }) => {
  const sleepScore = normalize(sleep, 3, 9); // ideal: 7–9h
  const stressScore = 1 - normalize(stress, 1, 5); // lower stress = better
  const wMult = isNight ? 0 : weatherMultiplier(weather);
  const outdoorScore = normalize(outdoor, 0, 120) * wMult;
  const timeBonus = isNight ? 0.4 : 1.0; // night gets partial time bonus

  // Weighted combination
  let raw =
    sleepScore * 35 +
    stressScore * 30 +
    outdoorScore * 25 +
    timeBonus * 10;

  // Override rule: high stress + low sleep → cap score
  if (stress >= 4 && sleep < 5) {
    raw = Math.min(raw, 30);
  }

  // Secondary override: near-perfect conditions → floor boost
  if (stress <= 2 && sleep >= 7 && outdoor >= 60) {
    raw = Math.max(raw, 70);
  }

  return Math.round(Math.max(0, Math.min(100, raw)));
};

/**
 * Map numeric score to labeled state
 */
const scoreToState = (score) => {
  if (score >= 70) return "Balanced";
  if (score >= 40) return "Moderate";
  return "Low";
};

/**
 * Generate targeted, non-generic insights
 */
const generateInsights = ({ sleep, stress, outdoor, weather, isNight, score }) => {
  const insights = [];

  // Sleep analysis
  if (sleep < 5) {
    insights.push("Critical sleep deficit detected — cognitive performance and emotional regulation are compromised.");
  } else if (sleep < 6.5) {
    insights.push("Sleep duration is below optimal range. Aim for 7–9 hours to restore neural balance.");
  } else if (sleep >= 8.5) {
    insights.push("Sleep duration is strong. Your recovery window is maximized.");
  } else {
    insights.push("Sleep hours are within healthy range. Maintain consistency.");
  }

  // Stress analysis
  if (stress >= 4 && sleep < 5) {
    insights.push("High stress combined with sleep deprivation is a priority alert — both systems need immediate recovery.");
  } else if (stress >= 4) {
    insights.push("Elevated stress levels detected. Consider breathwork, reduced stimulant intake, or a micro-break from screens.");
  } else if (stress === 3) {
    insights.push("Moderate stress present. Your body is coping, but building a buffer through rest is recommended.");
  } else {
    insights.push("Stress levels are well-managed today. Your nervous system is in a stable state.");
  }

  // Outdoor / light analysis
  if (isNight) {
    insights.push("Night mode active — outdoor light exposure is no longer possible. Focus on wind-down routines and limit blue light.");
  } else if (outdoor < 15) {
    insights.push("Critically low natural light exposure. Even 15 minutes outside can recalibrate your circadian rhythm.");
  } else if (outdoor < 45) {
    insights.push("You are underexposed to natural light. Increase outdoor time to boost serotonin and vitamin D synthesis.");
  } else if (outdoor >= 90) {
    insights.push("Excellent outdoor exposure today — your light-mind balance is well-supported.");
  } else {
    insights.push("Moderate outdoor time recorded. A slight increase would reinforce circadian alignment.");
  }

  // Weather context
  const wc = (weather || "").toLowerCase();
  if (wc.includes("rain") || wc.includes("storm")) {
    insights.push("Overcast or stormy conditions reduce light bioavailability. Compensate with indoor light therapy if available.");
  } else if (wc.includes("clear") || wc.includes("sunny")) {
    insights.push("Clear skies provide maximum light therapy potential — take advantage of the natural environment.");
  }

  // Score-based synthesis
  if (score >= 75) {
    insights.push("Your routine is balanced today — maintain this consistency for cumulative mental wellness gains.");
  } else if (score >= 50) {
    insights.push("Your balance index is moderate. Small adjustments to sleep or outdoor time will have outsized positive effects.");
  } else {
    insights.push("Recovery priority needed. Today's signals suggest your mind-body system needs structured restoration.");
  }

  return insights;
};


app.post("/analyze", (req, res) => {
  const { sleep, stress, outdoor, weather, timestamp } = req.body;

  // Validation
  if (
    sleep == null || stress == null || outdoor == null ||
    sleep < 0 || sleep > 24 ||
    stress < 1 || stress > 5 ||
    outdoor < 0 || outdoor > 1440
  ) {
    return res.status(400).json({ error: "Invalid input parameters." });
  }

  const now = timestamp ? new Date(timestamp) : new Date();
  const hour = now.getHours();
  const isNight = hour >= 20 || hour < 6;

  const score = computeLMBI({ sleep, stress, outdoor, weather, isNight });
  const state = scoreToState(score);
  const insights = generateInsights({ sleep, stress, outdoor, weather, isNight, score });

  // Night mode special response
  const nightMode = isNight
    ? {
        active: true,
        message: "Night Mode Activated",
        suggestions: [
          "Reduce screen brightness and enable warm/amber tones.",
          "Engage in calm, low-stimulus activities.",
          "Moonlight exposure (even brief) has been shown to support melatonin rhythms.",
          "Avoid caffeine and intense mental work for the next 2 hours.",
        ],
      }
    : { active: false };

  // Sound recommendation based on state
  const soundProfile =
    stress >= 4
      ? { type: "river", label: "River Flow", reason: "High stress — flowing water promotes parasympathetic activation." }
      : score < 45
      ? { type: "wind", label: "Wind & Birds", reason: "Low energy state — gentle nature sounds aid restoration." }
      : { type: "forest", label: "Forest Ambience", reason: "Balanced state — forest ambience sustains mental clarity." };

  // Store in history (cap at 50)
  const record = {
    id: Date.now(),
    timestamp: now.toISOString(),
    score,
    state,
    inputs: { sleep, stress, outdoor, weather },
    isNight,
  };
  lmbiHistory.unshift(record);
  if (lmbiHistory.length > 50) lmbiHistory.pop();

  return res.json({ score, state, insights, nightMode, soundProfile, timestamp: now.toISOString() });
});

//get history
app.get("/history", (req, res) => {
  res.json({ history: lmbiHistory.slice(0, 10) });
});

//get health
app.get("/health", (req, res) => res.json({ status: "ok", version: "2.0" }));

// start

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  SOL-MIND 2.0 backend running on http://localhost:${PORT}\n`);
});

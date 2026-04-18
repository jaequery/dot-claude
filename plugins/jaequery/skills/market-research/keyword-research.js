#!/usr/bin/env node

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// --- Config ---
const DEFAULT_SEEDS = [
  "gaming tier list",
  "anime tier list",
  "food tier list",
  "beauty tier list",
  "tech tier list",
  "travel tier list",
  "drinks tier list",
  "fast food tier list",
  "snacks tier list",
  "movies tier list",
  "music tier list",
  "sports tier list",
];

const EXCLUDE_WORDS = [
  "maker",
  "template",
  "creator",
  "generator",
  "app",
  "online",
  "free",
  "download",
];

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const REQUEST_DELAY = 500;
const REQUEST_TIMEOUT = 3000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- CLI parsing ---
function parseArgs() {
  const args = process.argv.slice(2);
  let seeds = null;
  let only = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--seeds" && args[i + 1]) {
      seeds = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (args[i] === "--only" && args[i + 1]) {
      only = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (only) return only;
  if (seeds) return [...seeds, ...DEFAULT_SEEDS];
  return DEFAULT_SEEDS;
}

// --- HTTP helper ---
function fetch(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(
      urlStr,
      {
        headers: { "User-Agent": USER_AGENT, ...headers },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(res.headers.location, headers).then(resolve, reject);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Sources ---

async function googleAutocomplete(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const { body } = await fetch(url);
  const parsed = JSON.parse(body);
  return Array.isArray(parsed[1]) ? parsed[1] : [];
}

async function youtubeAutocomplete(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
  const { body } = await fetch(url);
  // YouTube returns JSONP-like: window.google.ac.h(...)  or plain JSON array
  let text = body.trim();
  if (text.startsWith("window.google.ac.h(")) {
    text = text.slice("window.google.ac.h(".length, -1);
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed[1])) {
    return parsed[1].map((item) => (Array.isArray(item) ? item[0] : item));
  }
  return [];
}

async function googleTrendsSuggestions(query) {
  const url = `https://trends.google.com/trends/api/autocomplete/${encodeURIComponent(query)}?hl=en-US`;
  const { body } = await fetch(url);
  // Strip first 5 chars ")]}'\n"
  const cleaned = body.substring(5);
  const parsed = JSON.parse(cleaned);
  if (parsed.default && Array.isArray(parsed.default.topics)) {
    const seedWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return parsed.default.topics
      .map((t) => t.title || "")
      .filter((title) => {
        if (!title) return false;
        const lower = title.toLowerCase();
        // Keep if at least one seed word appears in the result
        return seedWords.some((w) => lower.includes(w));
      });
  }
  return [];
}

async function redditSearch(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=25`;
  const { body } = await fetch(url, {
    Accept: "application/json",
    "User-Agent": "keyword-research-bot/1.0 (educational)",
  });
  const parsed = JSON.parse(body);
  if (parsed.data && parsed.data.children) {
    return parsed.data.children.map((c) => c.data.title).filter(Boolean);
  }
  return [];
}

async function googleRelatedSearches(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
  const { body } = await fetch(url);
  const results = [];
  // Try to extract related searches - look for patterns in HTML
  // Related searches appear in various formats; try common patterns
  const patterns = [
    /<a[^>]*>([^<]*?)<\/a>/gi,
  ];
  // Look for the "related searches" section - usually contains links with specific class
  // More targeted: find text after "related searches" or in specific divs
  const relatedSection = body.match(/People also search for|Related searches|Searches related to/i);
  if (relatedSection) {
    const afterIdx = body.indexOf(relatedSection[0]);
    const section = body.substring(afterIdx, afterIdx + 5000);
    const linkMatches = section.matchAll(/<a[^>]*?>([^<]{5,80})<\/a>/gi);
    for (const m of linkMatches) {
      const text = m[1].replace(/<[^>]*>/g, "").trim();
      if (text && text.length > 3 && text.length < 80 && !text.includes("http")) {
        results.push(text);
      }
    }
  }
  return results.slice(0, 20);
}

// --- Volume estimation via autocomplete position ---
// Google Autocomplete returns suggestions sorted by popularity.
// Position #1 = highest volume. We use this as a relative demand signal.
// We also query the BASE keyword (without the seed prefix) to check if it's
// a standalone high-volume term.

async function getAutocompleteRank(keyword, seeds) {
  // For each seed, check where this keyword appears in autocomplete
  // Lower rank = higher volume
  // Also check the first 1-2 words as a standalone query
  const words = keyword.split(/\s+/);
  const shortQuery = words.slice(0, 2).join(" ");

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(shortQuery)}`;
    const { body } = await fetch(url);
    const parsed = JSON.parse(body);
    const suggestions = Array.isArray(parsed[1]) ? parsed[1].map(s => s.toLowerCase()) : [];
    const idx = suggestions.findIndex(s => s === keyword.toLowerCase());
    return { rank: idx >= 0 ? idx : -1, totalSuggestions: suggestions.length, suggestions };
  } catch {
    return { rank: -1, totalSuggestions: 0, suggestions: [] };
  }
}

// Volume estimation heuristic based on:
// - sourceCount: more sources = more demand
// - autocomplete position: present in top suggestions = high volume
// - keyword length: shorter keywords generally have higher volume
// Benchmarks (approximate US monthly searches for "date night ideas" category):
//   Head term (1-2 words, multi-source): 50K-200K
//   Mid-tail (3-4 words, multi-source): 5K-50K
//   Long-tail (5+ words or single source): 500-5K
//   Geo-specific (city): 1K-10K depending on city size
function estimateVolume(entry, acRank) {
  const wordCount = entry.keyword.split(/\s+/).length;
  const isMultiSource = entry.sourceCount >= 2;
  const isTopAutocomplete = acRank >= 0 && acRank <= 3;
  const isMidAutocomplete = acRank >= 0 && acRank <= 7;

  // Base volume from word count (shorter = higher volume)
  let vol;
  if (wordCount <= 3) vol = 20000;
  else if (wordCount <= 4) vol = 5000;
  else if (wordCount <= 5) vol = 2000;
  else vol = 500;

  // Boost for multi-source
  if (isMultiSource) vol *= 2;

  // Boost for top autocomplete position
  if (isTopAutocomplete) vol *= 2;
  else if (isMidAutocomplete) vol *= 1.3;
  else if (acRank < 0) vol *= 0.5; // not in autocomplete = lower

  // Geo keywords: scale by estimated city search demand
  const geoPatterns = {
    // Tier 1 cities (high search volume)
    "new york": 3, nyc: 3, "los angeles": 2.5, chicago: 2, houston: 1.8,
    phoenix: 1.5, philadelphia: 1.5, "san antonio": 1.3, "san diego": 1.5,
    dallas: 1.5, "san jose": 1.3, austin: 1.5, "san francisco": 2,
    seattle: 1.5, denver: 1.3, nashville: 1.5, dc: 1.5, boston: 1.5,
    "las vegas": 2, portland: 1.3, miami: 1.8, atlanta: 1.5, orlando: 1.3,
    // Tier 2 cities
    charlotte: 1, columbus: 1, cincinnati: 0.8, detroit: 0.8, milwaukee: 0.7,
    raleigh: 0.7, baltimore: 0.8, minneapolis: 0.8, tampa: 0.8, pittsburgh: 0.7,
    // Smaller cities
  };

  let isGeo = false;
  for (const [city, multiplier] of Object.entries(geoPatterns)) {
    if (entry.keyword.includes(city)) {
      vol = 3000 * multiplier;
      isGeo = true;
      break;
    }
  }

  // Small/suburb cities not in the map
  if (!isGeo && wordCount >= 4) {
    // Check if last word(s) might be a city name (heuristic: not a common modifier)
    const commonModifiers = ["home", "couples", "married", "cheap", "fun", "unique", "romantic", "easy", "winter", "summer", "spring", "fall", "indoor", "outdoor", "near", "around", "besides", "during", "activities", "cards", "book", "box", "game", "bridal", "shower", "newborn", "newlyweds"];
    const lastWord = entry.keyword.split(/\s+/).pop();
    if (!commonModifiers.includes(lastWord) && lastWord.length > 3) {
      // Possibly a smaller city
      vol = Math.min(vol, 1000);
      isGeo = true;
    }
  }

  return Math.round(vol);
}

// Difficulty estimate
function estimateDifficulty(volume, sourceCount, wordCount) {
  if (volume >= 20000) return 70 + Math.min(25, sourceCount * 5);
  if (volume >= 5000) return 50 + Math.min(20, sourceCount * 5);
  if (volume >= 2000) return 35 + Math.min(15, sourceCount * 5);
  if (volume >= 500) return 20 + Math.min(15, sourceCount * 5);
  return 10 + Math.min(10, sourceCount * 3);
}

// --- Main logic ---

async function scrapeSource(name, fn, seedKeyword) {
  try {
    const results = await fn();
    return results.map((kw) => ({ keyword: kw, source: name, seed: seedKeyword }));
  } catch (err) {
    console.error(`[WARN] ${name} failed for "${seedKeyword}": ${err.message}`);
    return [];
  }
}

async function main() {
  const seeds = parseArgs();
  console.error(`Starting keyword research with ${seeds.length} seeds...`);

  // keyword -> { sources: Set, category: string }
  const keywordMap = new Map();

  function addKeyword(raw, source, seed) {
    const kw = raw.toLowerCase().trim();
    if (!kw || kw.length < 3) return;
    if (EXCLUDE_WORDS.some((w) => kw.includes(w))) return;

    if (keywordMap.has(kw)) {
      const entry = keywordMap.get(kw);
      entry.sources.add(source);
      if (!entry.categories.has(seed)) entry.categories.add(seed);
    } else {
      keywordMap.set(kw, {
        sources: new Set([source]),
        categories: new Set([seed]),
      });
    }
  }

  for (let si = 0; si < seeds.length; si++) {
    const seed = seeds[si];
    console.error(`\n[${si + 1}/${seeds.length}] Processing: "${seed}"`);

    // 1. Google Autocomplete (base + alphabet expansion)
    console.error("  Google Autocomplete...");
    try {
      const base = await googleAutocomplete(seed);
      base.forEach((kw) => addKeyword(kw, "google_autocomplete", seed));
      for (const letter of ALPHABET) {
        await delay(REQUEST_DELAY);
        try {
          const expanded = await googleAutocomplete(`${seed} ${letter}`);
          expanded.forEach((kw) => addKeyword(kw, "google_autocomplete", seed));
        } catch (err) {
          console.error(`  [WARN] Google AC "${seed} ${letter}": ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`  [WARN] Google AC base failed: ${err.message}`);
    }

    await delay(REQUEST_DELAY);

    // 2. YouTube Autocomplete
    console.error("  YouTube Autocomplete...");
    try {
      const yt = await youtubeAutocomplete(seed);
      yt.forEach((kw) => addKeyword(kw, "youtube", seed));
    } catch (err) {
      console.error(`  [WARN] YouTube failed: ${err.message}`);
    }

    await delay(REQUEST_DELAY);

    // 3. Google Related Searches
    console.error("  Google Related Searches...");
    try {
      const related = await googleRelatedSearches(seed);
      related.forEach((kw) => addKeyword(kw, "google_related", seed));
    } catch (err) {
      console.error(`  [WARN] Google Related failed: ${err.message}`);
    }

    await delay(REQUEST_DELAY);

    // 4. Reddit
    console.error("  Reddit...");
    try {
      const reddit = await redditSearch(seed);
      reddit.forEach((kw) => addKeyword(kw, "reddit", seed));
    } catch (err) {
      console.error(`  [WARN] Reddit failed: ${err.message}`);
    }

    await delay(REQUEST_DELAY);

    // 5. Google Trends
    console.error("  Google Trends...");
    try {
      const trends = await googleTrendsSuggestions(seed);
      trends.forEach((kw) => addKeyword(kw, "google_trends", seed));
    } catch (err) {
      console.error(`  [WARN] Google Trends failed: ${err.message}`);
    }

    await delay(REQUEST_DELAY);
  }

  // Build results
  const rawResults = [];
  for (const [keyword, data] of keywordMap) {
    rawResults.push({
      keyword,
      sources: [...data.sources],
      sourceCount: data.sources.size,
      category: [...data.categories].join(", "),
    });
  }

  // Initial scoring (before volume lookup)
  let scoredResults = rawResults.map((entry) => {
    const sources = new Set(entry.sources);
    let demandScore =
      entry.sourceCount * 20 +
      (sources.has("google_autocomplete") ? 30 : 0) +
      (sources.has("youtube") ? 20 : 0) +
      (sources.has("reddit") ? 15 : 0) +
      (sources.has("google_trends") ? 15 : 0);

    return {
      ...entry,
      demandScore,
      kd: -1,
      volume: -1,
    };
  });

  scoredResults.sort((a, b) => b.demandScore - a.demandScore);

  // Volume estimation: check autocomplete rank for top keywords
  const TOP_N_VOLUME = 40;
  const volumeTargets = scoredResults.slice(0, TOP_N_VOLUME);
  console.error(`\nEstimating search volume for top ${volumeTargets.length} keywords...`);

  for (let i = 0; i < volumeTargets.length; i++) {
    const entry = volumeTargets[i];
    try {
      const { rank } = await getAutocompleteRank(entry.keyword, seeds);
      const wordCount = entry.keyword.split(/\s+/).length;
      entry.volume = estimateVolume(entry, rank);
      entry.kd = estimateDifficulty(entry.volume, entry.sourceCount, wordCount);
      console.error(`  [${i + 1}/${volumeTargets.length}] "${entry.keyword}" → ~${entry.volume.toLocaleString()}/mo (rank: ${rank >= 0 ? '#' + (rank + 1) : 'n/a'})`);
    } catch (err) {
      console.error(`  [WARN] Volume check failed for "${entry.keyword}": ${err.message}`);
    }
    await delay(REQUEST_DELAY);
  }

  // Also estimate volume for remaining keywords (without AC rank check, just heuristic)
  for (const entry of scoredResults.slice(TOP_N_VOLUME)) {
    const wordCount = entry.keyword.split(/\s+/).length;
    entry.volume = estimateVolume(entry, -1);
    entry.kd = estimateDifficulty(entry.volume, entry.sourceCount, wordCount);
  }

  // Re-sort incorporating volume data
  scoredResults.sort((a, b) => {
    if (a.volume !== b.volume) return b.volume - a.volume;
    return b.demandScore - a.demandScore;
  });

  // Write files
  const dateStr = new Date().toISOString().slice(0, 10);
  const dir = path.dirname(process.argv[1] || __filename);
  const rawPath = path.join(dir, `keyword-research-raw-${dateStr}.json`);
  const scoredPath = path.join(dir, `keyword-research-scored-${dateStr}.json`);

  fs.writeFileSync(rawPath, JSON.stringify(rawResults, null, 2));
  fs.writeFileSync(scoredPath, JSON.stringify(scoredResults, null, 2));

  console.error(`\nWrote ${rawResults.length} keywords to:`);
  console.error(`  ${rawPath}`);
  console.error(`  ${scoredPath}`);

  // Print top 50 table to stdout
  const top50 = scoredResults.slice(0, 50);
  const header = `${"#".padStart(3)} | ${"Keyword".padEnd(55)} | ${"Vol/mo".padStart(8)} | ${"KD".padStart(3)} | ${"Score".padStart(5)} | ${"Srcs".padStart(4)} | Sources`;
  const sep = "-".repeat(header.length + 20);
  console.log("\nTop 50 Keywords by Estimated Volume\n");
  console.log(header);
  console.log(sep);
  top50.forEach((entry, i) => {
    const vol = entry.volume > 0 ? entry.volume.toLocaleString() : "—";
    const kd = entry.kd >= 0 ? String(entry.kd) : "—";
    console.log(
      `${String(i + 1).padStart(3)} | ${entry.keyword.padEnd(55).slice(0, 55)} | ${vol.padStart(8)} | ${kd.padStart(3)} | ${String(entry.demandScore).padStart(5)} | ${String(entry.sourceCount).padStart(4)} | ${entry.sources.join(", ")}`
    );
  });

  console.log(`\nTotal unique keywords: ${scoredResults.length}`);
  console.log(`Volume estimated for top ${TOP_N_VOLUME} keywords (others show "—")`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

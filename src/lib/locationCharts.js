/**
 * Location chart-building primitives.
 *
 * Pure functions that take the jobs[] array and produce:
 *   - aggregateLocations(jobs)           -> { cities, hybridLeaders, totalJobs }
 *   - buildLocationsLollipopSvg(cities)  -> { svg, width, height }
 *   - buildHybridLeaderboardSvg(leaders) -> { svg, width, height }
 *
 * The functions are framework-agnostic so the same logic ships in:
 *   - the kadoa-backend dataset script (Node, generates the OG PNG)
 *   - this React app (renders inline SVG into the dashboard)
 *   - any future consumer (D3, Observable, plain HTML)
 *
 * Update the data by re-running the dataset pipeline:
 *   bun collectors/fetchJobs.ts && bun extractors/classifyJobs.ts &&
 *   bun exporters/vizDataExporter.ts
 * Then copy public/data/jobs.json + jobs.db over and re-run
 * `node scripts/build-db.js`. The chart auto-rebuilds.
 */

const QUANT_ROLES = new Set([
  "quantitative_research",
  "quantitative_trading",
  "quantitative_development",
  "hft_systems",
  "machine_learning",
  "data_science",
  "software_engineering",
  "risk_management",
  "portfolio_management",
]);

const CITY_ALIAS = {
  HKG: "Hong Kong",
  SGP: "Singapore",
  "Greater London": "London",
  Bengaluru: "Bangalore",
  Karnataka: "Bangalore",
  Gurugram: "Gurgaon",
  Gurgram: "Gurgaon",
  "Bala Cynwyd": "Philadelphia",
  "Bala Cynwyd (Philadelphia Area)": "Philadelphia",
  Pennsylvania: "Philadelphia",
  Radnor: "Philadelphia",
  Wayne: "Philadelphia",
  "King of Prussia": "Philadelphia",
  "Jersey City": "New York",
  Greenwich: "New York",
  Stamford: "New York",
  Massachusetts: "Boston",
  Illinois: "Chicago",
  Ireland: "Dublin",
  Australia: "Sydney",
  Zug: "Zurich",
};

const CITY_ISO = {
  "New York": "US",
  London: "GB",
  Chicago: "US",
  "Hong Kong": "HK",
  Singapore: "SG",
  Sydney: "AU",
  Boston: "US",
  Philadelphia: "US",
  Bangalore: "IN",
  Mumbai: "IN",
  Paris: "FR",
  Amsterdam: "NL",
  Dublin: "IE",
  Tokyo: "JP",
  Shanghai: "CN",
  Dubai: "AE",
  Warsaw: "PL",
  Budapest: "HU",
  Gurgaon: "IN",
  Montreal: "CA",
  Miami: "US",
  Zurich: "CH",
  Houston: "US",
  Austin: "US",
  Berkeley: "US",
};

const ALLOWED_TYPES = new Set(["proprietary", "hedge_fund"]);
const EXCLUDE_FIRMS = new Set(["TransMarket Group"]);
const EXCLUDE_CITIES = new Set(["India", "United States", "Europe", "Asia"]);
const MIN_FIRM_JOBS = 10;
const MIN_CITY_JOBS = 10;
const MAX_CITIES = 22;

function flagEmoji(iso) {
  if (!iso) return "";
  return iso
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
    .join("");
}

function shortenFirm(f) {
  return f
    .replace("Qube RT (QRT)", "QRT")
    .replace("Hudson River Trading", "HRT")
    .replace("Susquehanna (SIG)", "SIG")
    .replace("Squarepoint Capital", "Squarepoint")
    .replace("Brookfield Asset Management", "Brookfield")
    .replace("Balyasny Asset Management", "Balyasny")
    .replace("Stevens Capital Management", "Stevens")
    .replace("Renaissance Technologies", "RenTech")
    .replace("Garda Capital Partners", "Garda Capital")
    .replace("Five Rings Capital", "Five Rings")
    .replace("AQR Capital", "AQR");
}

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function aggregateLocations(jobs) {
  const firmJobs = new Map();
  for (const j of jobs) {
    if (!j.firmName) continue;
    if (!ALLOWED_TYPES.has(j.firmType)) continue;
    if (EXCLUDE_FIRMS.has(j.firmName)) continue;
    if (j.roleCategory && !QUANT_ROLES.has(j.roleCategory)) continue;
    const arr = firmJobs.get(j.firmName) || [];
    arr.push(j);
    firmJobs.set(j.firmName, arr);
  }
  const validFirmJobs = [];
  for (const [, list] of firmJobs) {
    if (list.length >= MIN_FIRM_JOBS) validFirmJobs.push(...list);
  }

  const cityCounts = new Map();
  const cityFirmCounts = new Map();
  const cityTypeCounts = new Map();
  for (const j of validFirmJobs) {
    const seen = new Set();
    for (const raw of j.locations || []) {
      const c = CITY_ALIAS[raw] || raw;
      if (seen.has(c)) continue;
      seen.add(c);
      cityCounts.set(c, (cityCounts.get(c) || 0) + 1);
      let m = cityFirmCounts.get(c);
      if (!m) {
        m = new Map();
        cityFirmCounts.set(c, m);
      }
      m.set(j.firmName, (m.get(j.firmName) || 0) + 1);
      let t = cityTypeCounts.get(c);
      if (!t) {
        t = { proprietary: 0, hedge_fund: 0 };
        cityTypeCounts.set(c, t);
      }
      if (j.firmType in t) t[j.firmType]++;
    }
  }

  const cities = [];
  for (const [name, total] of cityCounts) {
    if (total < MIN_CITY_JOBS) continue;
    if (EXCLUDE_CITIES.has(name)) continue;
    const m = cityFirmCounts.get(name);
    if (!m) continue;
    const topFirms = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([firm, count]) => ({ firm: shortenFirm(firm), count }));
    const byType = cityTypeCounts.get(name) || { proprietary: 0, hedge_fund: 0 };
    cities.push({ name, total, topFirms, byType });
  }
  cities.sort((a, b) => b.total - a.total);

  // Flex = hybrid + remote. Both are explicit "you don't have to be in
  // the office five days a week" signals. Most firms use hybrid; a few
  // (DRW, Voleon, Geneva Trading) advertise remote instead.
  const flexByFirm = new Map();
  for (const j of validFirmJobs) {
    let r = flexByFirm.get(j.firmName);
    if (!r) {
      r = { firm: j.firmName, total: 0, hybrid: 0, remote: 0, flex: 0, pct: 0 };
      flexByFirm.set(j.firmName, r);
    }
    r.total++;
    if (j.workMode === "hybrid") {
      r.hybrid++;
      r.flex++;
    } else if (j.workMode === "remote") {
      r.remote++;
      r.flex++;
    }
  }
  const hybridLeaders = [...flexByFirm.values()]
    .filter((r) => r.flex >= 1)
    .map((r) => ({ ...r, firm: shortenFirm(r.firm), pct: (r.flex / r.total) * 100 }))
    .sort((a, b) => b.flex - a.flex || b.pct - a.pct);

  return { cities: cities.slice(0, MAX_CITIES), hybridLeaders, totalJobs: validFirmJobs.length };
}

function annotationFor(c, max = Infinity) {
  return { text: c.topFirms.slice(0, max).map((f) => `${f.firm} ${f.count}`).join(" · ") };
}

export function buildLocationsLollipopSvg(cities) {
  // Linear-style horizontal bar chart: minimal chrome, near-invisible
  // gridlines, monochrome accent. 860 wide fits the card panel in the 960px page.
  const W = 860;
  const left = 4;
  const panelW = W - left * 2;
  const top = 28;
  const rowH = 32;
  const barH = 12;
  const BAR_FILL = "#0f766e";

  const flagW = 26;
  const cityLabelW = 100;
  const totalW = 64;
  const barXStart = left + flagW + cityLabelW + 16;
  const annotationW = 390;
  const barXEnd = left + panelW - totalW - 12 - annotationW;
  const barMaxW = barXEnd - barXStart;
  const annotationX = barXEnd + 20;
  const totalX = left + panelW - totalW;

  const maxCityTotal = Math.max(...cities.map((c) => c.total), 1);
  const xFor = (n) => (n / maxCityTotal) * barMaxW;

  const axisTicks = [];
  for (const v of [0, maxCityTotal]) {
    const tx = barXStart + xFor(v);
    axisTicks.push(
      `<line x1="${tx}" y1="${top}" x2="${tx}" y2="${top + cities.length * rowH}" stroke="rgba(0,0,0,0.04)" stroke-width="1"/>`,
    );
  }

  const headers =
    `<text x="${left + flagW + cityLabelW}" y="${top - 9}" text-anchor="end" font-size="14" font-weight="500" fill="#505a5f">City</text>` +
    `<text x="${annotationX}" y="${top - 9}" font-size="14" font-weight="500" fill="#505a5f">Top firms</text>` +
    `<text x="${totalX + totalW - 4}" y="${top - 9}" text-anchor="end" font-size="14" font-weight="500" fill="#505a5f">Postings</text>`;

  const rows = cities
    .map((c, i) => {
      const y = top + i * rowH + rowH / 2;
      const flag = flagEmoji(CITY_ISO[c.name]);
      const ann = annotationFor(c, 3);
      const barW = xFor(c.total);
      return [
        `<text x="${left + flagW - 4}" y="${y + 6}" text-anchor="end" font-size="18">${flag}</text>`,
        `<text x="${left + flagW + cityLabelW}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="500" fill="#191919">${escapeText(c.name)}</text>`,
        `<rect x="${barXStart}" y="${y - barH / 2}" width="${barW}" height="${barH}" rx="3" fill="${BAR_FILL}" fill-opacity="0.85"/>`,
        `<text x="${annotationX}" y="${y + 5}" font-size="14" fill="#505a5f">${escapeText(ann.text)}</text>`,
        `<text x="${totalX + totalW - 4}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="500" fill="#191919" font-variant-numeric="tabular-nums">${c.total}</text>`,
      ].join("");
    })
    .join("");

  const height = top + cities.length * rowH + 8;
  return { svg: axisTicks.join("") + headers + rows, width: W, height };
}

// Compact mobile variant of the cities chart. Drops the "Top firms"
// inline text (keep it for desktop) so flag + city + bar + total all
// fit in a phone viewport without horizontal scroll.
export function buildLocationsLollipopSvgMobile(cities) {
  const W = 300;
  const left = 8;
  const top = 28;
  const rowH = 30;
  const barH = 11;
  const BAR_FILL = "#0f766e";

  const flagW = 22;
  const cityLabelW = 92;
  const totalW = 36;
  const barXStart = left + flagW + cityLabelW + 10;
  const totalX = W - totalW - 4;
  const barXEnd = totalX - 8;
  const barMaxW = barXEnd - barXStart;

  const maxCityTotal = Math.max(...cities.map((c) => c.total), 1);
  const xFor = (n) => (n / maxCityTotal) * barMaxW;

  const headers =
    `<text x="${left + flagW + cityLabelW}" y="${top - 9}" text-anchor="end" font-size="11" font-weight="500" fill="#7a7d80">City</text>` +
    `<text x="${totalX + totalW - 4}" y="${top - 9}" text-anchor="end" font-size="11" font-weight="500" fill="#7a7d80">Total</text>`;

  const rows = cities
    .map((c, i) => {
      const y = top + i * rowH + rowH / 2;
      const flag = flagEmoji(CITY_ISO[c.name]);
      const barW = xFor(c.total);
      return [
        `<text x="${left + flagW - 4}" y="${y + 5}" text-anchor="end" font-size="15">${flag}</text>`,
        `<text x="${left + flagW + cityLabelW}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="500" fill="#191919">${escapeText(c.name)}</text>`,
        `<rect x="${barXStart}" y="${y - barH / 2}" width="${barW}" height="${barH}" rx="2" fill="${BAR_FILL}" fill-opacity="0.85"/>`,
        `<text x="${totalX + totalW - 4}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="500" fill="#191919" font-variant-numeric="tabular-nums">${c.total}</text>`,
      ].join("");
    })
    .join("");

  const height = top + cities.length * rowH + 8;
  return { svg: headers + rows, width: W, height };
}

// One leaderboard row per (firm, mode) combination. Firms with both hybrid
// and remote postings (e.g. Voleon, Geneva) get two rows. Sorted by
// absolute count desc so the biggest employers float to the top.
function expandModeRows(hybridLeaders, max = Infinity) {
  const out = [];
  for (const l of hybridLeaders) {
    if (l.hybrid > 0) out.push({ firm: l.firm, mode: "hybrid", count: l.hybrid, total: l.total });
    if (l.remote > 0) out.push({ firm: l.firm, mode: "remote", count: l.remote, total: l.total });
  }
  out.sort((a, b) => b.count - a.count || (a.mode === "hybrid" ? -1 : 1));
  return out.slice(0, max);
}

const TEAL = "#0f766e";
const ORANGE = "#d97757";

export function buildHybridLeaderboardSvg(hybridLeaders) {
  // Single panel mirroring the standalone work-mode chart: absolute counts,
  // bar color by mode (teal = hybrid, orange = remote), tag pill on each
  // row so the rare remote employers stand out at a glance.
  const rows = expandModeRows(hybridLeaders, 15);
  if (rows.length === 0) return { svg: "", width: 0, height: 0 };

  const W = 860;
  const left = 4;
  const top = 28;
  const rowH = 32;
  const barH = 12;

  const labelW = 160;
  const labelX = left + labelW;
  const barX = labelX + 16;
  const barMaxW = 500;

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  // Legend in the top-right of the chart area
  const legendX = W - 170;
  const legend =
    `<rect x="${legendX}" y="${top - 18}" width="10" height="10" rx="2" fill="${TEAL}"/>` +
    `<text x="${legendX + 16}" y="${top - 9}" font-size="14" font-weight="500" fill="#191919">Hybrid</text>` +
    `<rect x="${legendX + 84}" y="${top - 18}" width="10" height="10" rx="2" fill="${ORANGE}"/>` +
    `<text x="${legendX + 100}" y="${top - 9}" font-size="14" font-weight="500" fill="#191919">Remote</text>`;

  const headers =
    `<text x="${labelX}" y="${top - 9}" text-anchor="end" font-size="14" font-weight="500" fill="#505a5f">Firm</text>` +
    `<text x="${barX}" y="${top - 9}" font-size="14" font-weight="500" fill="#505a5f">Hybrid &amp; remote postings</text>` +
    legend;

  const rowsHtml = rows
    .map((r, i) => {
      const y = top + i * rowH + rowH / 2;
      const barW = (r.count / maxCount) * barMaxW;
      const color = r.mode === "remote" ? ORANGE : TEAL;
      const valX = barX + barW + 8;
      return [
        `<text x="${labelX}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="600" fill="#191919">${escapeText(r.firm)}</text>`,
        `<rect x="${barX}" y="${y - barH / 2}" width="${barW}" height="${barH}" rx="3" fill="${color}" fill-opacity="0.88"/>`,
        `<text x="${valX}" y="${y + 5}" font-size="14" font-weight="700" fill="${color}" font-variant-numeric="tabular-nums">${r.count}</text>`,
      ].join("");
    })
    .join("");

  const height = top + rows.length * rowH + 8;
  return { svg: headers + rowsHtml, width: W, height };
}

// Compact mobile variant of the hybrid leaderboard.
export function buildHybridLeaderboardSvgMobile(hybridLeaders) {
  const rows = expandModeRows(hybridLeaders, 15);
  if (rows.length === 0) return { svg: "", width: 0, height: 0 };
  const W = 300;
  const left = 8;
  const top = 28;
  const rowH = 30;
  const barH = 11;

  const firmW = 88;
  const labelX = left + firmW;
  const barX = labelX + 8;
  const numW = 24;
  const barMaxW = W - firmW - 8 - numW - left * 2;

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  // Compact legend at the top-right
  const legendY = top - 14;
  const legend =
    `<rect x="${W - left - 116}" y="${legendY - 7}" width="8" height="8" rx="1.5" fill="${TEAL}"/>` +
    `<text x="${W - left - 104}" y="${legendY}" font-size="10" font-weight="500" fill="#191919">Hybrid</text>` +
    `<rect x="${W - left - 64}" y="${legendY - 7}" width="8" height="8" rx="1.5" fill="${ORANGE}"/>` +
    `<text x="${W - left - 52}" y="${legendY}" font-size="10" font-weight="500" fill="#191919">Remote</text>`;

  const headers =
    `<text x="${labelX}" y="${top - 9}" text-anchor="end" font-size="11" font-weight="500" fill="#7a7d80">Firm</text>` +
    `<text x="${barX}" y="${top - 9}" font-size="11" font-weight="500" fill="#7a7d80">Postings</text>` +
    legend;

  const rowsHtml = rows
    .map((r, i) => {
      const y = top + i * rowH + rowH / 2;
      const barW = (r.count / maxCount) * barMaxW;
      const color = r.mode === "remote" ? ORANGE : TEAL;
      const valX = barX + barW + 4;
      return [
        `<text x="${labelX}" y="${y + 4}" text-anchor="end" font-size="11.5" font-weight="600" fill="#191919">${escapeText(r.firm)}</text>`,
        `<rect x="${barX}" y="${y - barH / 2}" width="${barW}" height="${barH}" rx="2" fill="${color}" fill-opacity="0.88"/>`,
        `<text x="${valX}" y="${y + 4}" font-size="11.5" font-weight="700" fill="${color}" font-variant-numeric="tabular-nums">${r.count}</text>`,
      ].join("");
    })
    .join("");

  const height = top + rows.length * rowH + 8;
  return { svg: headers + rowsHtml, width: W, height };
}

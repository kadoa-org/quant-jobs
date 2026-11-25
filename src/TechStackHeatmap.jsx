import React, { useMemo } from "react";

// 17 tech columns: 15 languages + FPGA + CUDA, prevalence-ordered.
const TECHS = [
  "Python",
  "C++",
  "SQL",
  "Java",
  "C#",
  "R",
  "C",
  "JavaScript",
  "TypeScript",
  "Go",
  "Rust",
  "MATLAB",
  "OCaml",
  "KDB+/Q",
  "Scala",
  "FPGA",
  "CUDA",
];

// AI tools the postings ask candidates to use (the exporter's aiTools tags). "AI tools" counts every such posting,
// whether or not it names one; ChatGPT includes OpenAI's Codex.
const AI = ["AI tools", "Claude", "Copilot", "ChatGPT", "Cursor"];
const COLS = [...TECHS, ...AI];

const TECH_DISPLAY = { JavaScript: "JS", TypeScript: "TS", "AI tools": "Any AI" };

const HEAT_PALETTE = [
  "#ffffcc",
  "#ffeda0",
  "#fed976",
  "#feb24c",
  "#fd8d3c",
  "#fc4e2a",
  "#e31a1c",
  "#bd0026",
  "#800026",
];

const ALLOWED_TYPES = new Set(["proprietary", "hedge_fund"]);

const MIN_JOBS = 10;
const EXCLUDE_FIRMS = new Set(["TransMarket Group"]);

function shortenFirm(f) {
  return f
    .replace("Qube RT (QRT)", "QRT")
    .replace("Hudson River Trading", "HRT")
    .replace("Susquehanna (SIG)", "SIG")
    .replace("Brookfield Asset Management", "Brookfield")
    .replace("Balyasny Asset Management", "Balyasny")
    .replace("Stevens Capital Management", "Stevens Capital")
    .replace("Renaissance Technologies", "RenTech")
    .replace("Garda Capital Partners", "Garda Capital")
    .replace("Five Rings Capital", "Five Rings")
    .replace("AQR Capital", "AQR");
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function heatColor(t) {
  const tt = Math.max(0, Math.min(1, t));
  const idx = tt * (HEAT_PALETTE.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HEAT_PALETTE.length - 1);
  const frac = idx - lo;
  const c1 = hexToRgb(HEAT_PALETTE[lo]);
  const c2 = hexToRgb(HEAT_PALETTE[hi]);
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
  return `rgb(${r},${g},${b})`;
}

function countToHeatT(count, globalMax) {
  if (count <= 0 || globalMax <= 0) return -1;
  return Math.sqrt(Math.min(1, count / globalMax));
}

function aggregate(jobs) {
  const m = new Map();
  for (const j of jobs) {
    if (!j.firmName) continue;
    let r = m.get(j.firmName);
    if (!r) {
      r = { total: 0, type: j.firmType || "other", counts: Object.fromEntries(COLS.map((t) => [t, 0])) };
      m.set(j.firmName, r);
    }
    r.total++;
    // AI columns count only the aiTools tags: the extracted technologies also name Claude or Copilot now and then, and
    // mixing the two would leave a firm with a Claude posting but none in Any AI.
    const tags = new Set([...(j.programmingLanguages || []), ...(j.technologies || [])]);
    for (const t of TECHS) if (tags.has(t)) r.counts[t]++;
    for (const t of j.aiTools || []) if (t in r.counts) r.counts[t]++;
  }
  // Plain by-volume ordering; the firm-type classification was noisy and sometimes wrong, so it no longer drives
  // grouping or colour.
  return [...m.entries()]
    .filter(([firm, r]) => r.total >= MIN_JOBS && !EXCLUDE_FIRMS.has(firm) && ALLOWED_TYPES.has(r.type))
    .map(([firm, r]) => ({ firm, type: r.type, total: r.total, counts: r.counts }))
    .sort((a, b) => b.total - a.total);
}

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// One heatmap: a row per firm that names at least one of `cols`, a cell per column. Cell colour is the count,
// sqrt-scaled across this heatmap only, so the AI tools (asked for far less often than Python) get their own scale.
function buildSvg(firms, cols) {
  const rowsData = firms.filter((f) => cols.some((c) => f.counts[c] > 0));
  let max = 0;
  for (const f of rowsData) for (const c of cols) max = Math.max(max, f.counts[c]);

  const firmW = 160;
  const nW = 30;
  const cellW = 62;
  const left = 24;
  const top = 36;
  const rowH = 22;
  const cellPad = 2;
  const nColX = left + firmW;
  const plotStartX = nColX + nW;
  const plotEndX = plotStartX + cols.length * cellW;
  const width = plotEndX + 8;
  const totalH = top + rowsData.length * rowH;
  const height = totalH + 16;
  const headerBaselineY = top - 8;
  const ruleY = top - 3;

  const colHeaders = cols
    .map((c, i) => `<text x="${plotStartX + i * cellW + cellW / 2}" y="${headerBaselineY}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1a1a1a">${escapeText(TECH_DISPLAY[c] || c)}</text>`)
    .join("");
  const nHeader = `<text x="${nColX + nW - 4}" y="${headerBaselineY}" text-anchor="end" font-size="11.5" font-weight="600" fill="#1a1a1a">n</text>`;
  const topRule = `<line x1="${nColX}" y1="${ruleY}" x2="${plotEndX}" y2="${ruleY}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`;

  const rows = rowsData
    .map((f, i) => {
      const y = top + i * rowH;
      const firmName = `<text x="${nColX - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="14" fill="#1a1a1a" font-weight="500">${escapeText(shortenFirm(f.firm))}</text>`;
      const nText = `<text x="${nColX + nW - 4}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#6b6b6b" font-weight="500" font-variant-numeric="tabular-nums">${f.total}</text>`;
      const cells = cols
        .map((c, j) => {
          const x = plotStartX + j * cellW;
          const count = f.counts[c];
          const t = countToHeatT(count, max);
          const fill = count > 0 ? heatColor(t) : "#f4f4f3";
          const what = c === "AI tools" ? "ask for AI tools" : `name ${c}`;
          const rect = `<rect x="${x + cellPad}" y="${y + cellPad}" width="${cellW - cellPad * 2}" height="${rowH - cellPad * 2}" rx="2" fill="${fill}" stroke="#ffffff" stroke-width="1"><title>${escapeText(`${f.firm}: ${count} of ${f.total} postings ${what}`)}</title></rect>`;
          const label =
            count > 0
              ? `<text x="${x + cellW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="10.5" fill="${t >= 0.55 ? "#ffffff" : "#1a1a1a"}" font-weight="500" font-variant-numeric="tabular-nums" pointer-events="none">${count}</text>`
              : "";
          return rect + label;
        })
        .join("");
      return firmName + nText + cells;
    })
    .join("");
  const bottomRule = `<line x1="${left}" y1="${totalH + 2}" x2="${plotEndX}" y2="${totalH + 2}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`;

  return {
    svg: `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><g>${colHeaders}</g>${nHeader}${topRule}<g>${rows}</g>${bottomRule}</svg>`,
    width,
    firms: rowsData.length,
  };
}

function Heatmap({ chart }) {
  return (
    <div className="overflow-x-auto -mx-[15px] sm:mx-0">
      <div
        className="px-[15px] sm:px-0"
        style={{ minWidth: chart.width }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
        dangerouslySetInnerHTML={{ __html: chart.svg }}
      />
    </div>
  );
}

export default function TechStackHeatmap({ jobs }) {
  const { langs, ai, numFirms, aiPostings, postings } = useMemo(() => {
    const firms = aggregate(jobs || []);
    return {
      langs: buildSvg(firms, TECHS),
      ai: buildSvg(firms, AI),
      numFirms: firms.length,
      postings: firms.reduce((n, f) => n + f.total, 0),
      aiPostings: firms.reduce((n, f) => n + f.counts["AI tools"], 0),
    };
  }, [jobs]);

  return (
    <div>
      <div className="dk-container page">
        <h1 className="dk-h1">Quant tech heatmap</h1>
        <p className="page-lede">
          How many open postings at {numFirms} hedge funds and prop trading firms name each language, hardware and AI tool.
        </p>
        <h2 className="heatmap-h2">Languages and hardware</h2>
        <Heatmap chart={langs} />
        <h2 className="heatmap-h2 heatmap-h2--next">AI tools</h2>
        <p className="heatmap-note">
          {aiPostings.toLocaleString()} of {postings.toLocaleString()} postings ask candidates to use AI tools. Any AI
          counts them all, named or not. ChatGPT includes OpenAI&apos;s Codex.
        </p>
        <Heatmap chart={ai} />
        <div className="page-credit">
          <strong>kadoa.com/quant</strong>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/kadoa-org/quant-jobs" target="_blank" rel="noopener noreferrer">
            github.com/kadoa-org/quant-jobs
          </a>
        </div>
      </div>
    </div>
  );
}

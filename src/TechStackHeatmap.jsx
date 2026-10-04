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

const TECH_DISPLAY = { JavaScript: "JS", TypeScript: "TS" };

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

const FIRM_TYPE_LABEL = {
  proprietary: "Prop trading & market making",
  hedge_fund: "Hedge fund",
};
const FIRM_TYPE_COLOR = {
  proprietary: "#f97316",
  hedge_fund: "#8b5cf6",
};
const FIRM_TYPE_ORDER = ["proprietary", "hedge_fund"];
const ALLOWED_TYPES = new Set(FIRM_TYPE_ORDER);

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
      r = { total: 0, type: j.firmType || "other", counts: Object.fromEntries(TECHS.map((t) => [t, 0])) };
      m.set(j.firmName, r);
    }
    r.total++;
    const tags = new Set([...(j.programmingLanguages || []), ...(j.technologies || [])]);
    for (const t of TECHS) if (tags.has(t)) r.counts[t]++;
  }
  return [...m.entries()]
    .filter(([firm, r]) => r.total >= MIN_JOBS && !EXCLUDE_FIRMS.has(firm) && ALLOWED_TYPES.has(r.type))
    .map(([firm, r]) => ({
      firm,
      type: r.type,
      total: r.total,
      counts: { ...r.counts },
      pcts: Object.fromEntries(TECHS.map((t) => [t, (r.counts[t] / r.total) * 100])),
    }))
    .filter((f) => TECHS.some((t) => f.counts[t] > 0));
}

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSvg(jobs) {
  const firms = aggregate(jobs);
  const totalJobs = jobs.length;
  const numFirms = firms.length;

  // Plain by-volume ordering; the firm-type classification was noisy and
  // sometimes wrong, so it no longer drives grouping or color.
  const ordered = [...firms].sort((a, b) => b.total - a.total);

  // Cell colour = absolute count, sqrt-scaled across the whole matrix.
  let globalMax = 0;
  for (const f of ordered) for (const l of TECHS) if (f.counts[l] > globalMax) globalMax = f.counts[l];

  // Layout
  const width = 1300;
  const firmW = 160;
  const nW = 30;
  const cellW = 62;
  const left = 24;
  const top = 36;
  const rowH = 22;
  const cellPad = 2;

  const nColX = left + firmW;
  const plotStartX = nColX + nW;
  const plotW = TECHS.length * cellW;

  const yByIndex = [];
  let curY = top;
  for (let i = 0; i < ordered.length; i++) {
    yByIndex.push(curY);
    curY += rowH;
  }
  const totalH = curY;
  const height = totalH + 16;

  const headerBaselineY = top - 8;
  const ruleY = top - 3;
  const colHeaders = TECHS.map((l, i) => {
    const cellX = plotStartX + i * cellW;
    const cx = cellX + cellW / 2;
    const display = TECH_DISPLAY[l] || l;
    return `<text x="${cx}" y="${headerBaselineY}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1a1a1a">${display}</text>`;
  }).join("");
  const nHeader = `<text x="${nColX + nW - 4}" y="${headerBaselineY}" text-anchor="end" font-size="11.5" font-weight="600" fill="#1a1a1a">n</text>`;
  const topRule = `<line x1="${nColX}" y1="${ruleY}" x2="${plotStartX + plotW}" y2="${ruleY}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`;

  const rows = ordered
    .map((f, i) => {
      const y = yByIndex[i];
      const dot = "";
      const firmName = `<text x="${nColX - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="12" fill="#1a1a1a" font-weight="500">${escapeText(shortenFirm(f.firm))}</text>`;
      const nText = `<text x="${nColX + nW - 4}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#6b6b6b" font-weight="500" font-variant-numeric="tabular-nums">${f.total}</text>`;
      const cells = TECHS.map((l, j) => {
        const cellX = plotStartX + j * cellW;
        const count = f.counts[l];
        const hasValue = count > 0;
        const fillT = countToHeatT(count, globalMax);
        const fill = hasValue ? heatColor(fillT) : "#f4f4f3";
        const rect = `<rect x="${cellX + cellPad}" y="${y + cellPad}" width="${cellW - cellPad * 2}" height="${rowH - cellPad * 2}" rx="2" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`;
        let label = "";
        if (hasValue) {
          const textColor = fillT >= 0.55 ? "#ffffff" : "#1a1a1a";
          label = `<text x="${cellX + cellW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="10.5" fill="${textColor}" font-weight="500" font-variant-numeric="tabular-nums">${count}</text>`;
        }
        return rect + label;
      }).join("");
      return dot + firmName + nText + cells;
    })
    .join("");

  const bottomRule = `<line x1="${left}" y1="${totalH + 2}" x2="${plotStartX + plotW}" y2="${totalH + 2}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`;

  return {
    svg: `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><g>${colHeaders}</g>${nHeader}${topRule}<g>${rows}</g>${bottomRule}</svg>`,
    totalJobs,
    numFirms,
  };
}

export default function TechStackHeatmap({ jobs }) {
  const { svg, totalJobs, numFirms } = useMemo(() => buildSvg(jobs || []), [jobs]);

  return (
    <div className="bg-[#fbfbfa]">
      <div className="dk-container py-6 sm:py-8">
        <h1 className="dk-h1">
          Quant tech heatmap
        </h1>
        <div className="overflow-x-auto -mx-[15px] sm:mx-0">
          <div
            className="px-[15px] sm:px-0 min-w-[1300px]"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <div className="mt-3 text-[11.5px] text-[#6b6b6b] flex justify-end">
          <span className="text-[#1a1a1a] font-semibold">kadoa.com/quant</span>
          <span className="mx-2">·</span>
          <a
            href="https://github.com/kadoa-org/quant-jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-inherit no-underline"
          >
            github.com/kadoa-org/quant-jobs
          </a>
        </div>
      </div>
    </div>
  );
}

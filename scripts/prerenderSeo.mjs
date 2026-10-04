/**
 * Build-time SEO content pages for the long-tail queries we can actually win.
 *
 * SERP research (June 2026) showed:
 *   - "[firm] careers" / "quant jobs [city]" are owned by the firms' own
 *     sites + LinkedIn/Indeed, which makes them unwinnable, so we skip them.
 *   - "which quant firms are hiring" is owned by static listicles, and
 *     "which firms use Rust/FPGA/Python" has no live data-backed page at all.
 *     Those are the gaps this script fills.
 *
 * Generates self-contained static HTML (real crawler-visible content, no
 * React mount to wipe it) under dist/, plus sitemap entries:
 *   /hiring/            ranked firms by open postings (the listicle killer)
 *   /tech/<slug>/       firms hiring for a given language/tool
 *
 * Pages link into the interactive app (/, /tech-stack) rather than trying to
 * be the app. Runs after `vite build`; regenerates daily with the data.
 *
 * Usage: node scripts/prerenderSeo.mjs   (wired into `npm run build`)
 */

import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import initSqlJs from "sql.js";
// Plain-JS module, shared with the app so the /internships tables and the live
// view group postings identically.
import { QUANT_ROLES as BOARD_ROLES, ROLE_LABELS, SENIORITY_LABELS, SENIORITY_ORDER } from "../src/constants.js";
import { rankSkillAreas } from "../src/skillAreas.js";
// The generated page lists, shared with the app so its "Explore the data" links and the pages stay in step.
import { LOCATIONS, ROLES, TECHS } from "../src/seoPages.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist", "quant"); // vite outDir (site lives under /quant/)
const PREFIX = "/quant"; // public path prefix behind the www.kadoa.com reverse proxy
const BASE = `https://www.kadoa.com${PREFIX}`;

async function buildShell() {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    base: "/quant/",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const mod = await server.ssrLoadModule("/src/renderPage.jsx");
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(path.join(DIST, "data/jobs.db")));
    const data = mod.readJobData(db);
    db.close();
    const stacks = JSON.parse(fs.readFileSync(path.join(DIST, "data/stacks.json"), "utf8"));
    return { ...mod, data, stacks };
  } finally {
    await server.close();
  }
}

const renderer = await buildShell();

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Pull the built CSS bundle so pages inherit the site's Inter/Tailwind styling.
const cssHref = (() => {
  const m = fs.readFileSync(path.join(DIST, "index.html"), "utf8").match(/assets\/[^"]*\.css/);
  return m ? `${PREFIX}/${m[0]}` : null;
})();

const jobs = JSON.parse(fs.readFileSync(path.join(DIST, "data", "jobs.json"), "utf8"));
// GitHub OSS footprint (github.json ships from the jobs pipeline; absent on
// forks/first builds — the /open-source page and firm sections just skip).
const githubPath = path.join(DIST, "data", "github.json");
const github = fs.existsSync(githubPath) ? JSON.parse(fs.readFileSync(githubPath, "utf8")) : { firms: [] };
const fmtStars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

const FIRM_TYPE_LABEL = {
  hedge_fund: "Hedge fund",
  proprietary: "Prop trading & market making",
  asset_manager: "Asset manager",
  private_equity: "Private equity",
};

// "Jul 2026"-style freshness stamp for titles. We rebuild daily, so unlike
// static listicles the month in the title is always actually true.
const monthYear = new Date().toLocaleString("en-US", { month: "short", year: "numeric" });

// Firm-page slug derived from the (clean) firm NAME, not job.firmSlug — the
// latter is polluted with upstream workflow artifacts ("blackrock-template-v2-retry",
// "mlp-test-2") that would otherwise leak into public URLs.
const firmSlugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// Per-firm aggregates, reused by every page.
const firms = new Map();
for (const j of jobs) {
  const name = j.firmName;
  if (!name) continue;
  if (!firms.has(name))
    firms.set(name, {
      name,
      slug: firmSlugify(name),
      type: j.firmType,
      count: 0,
      locs: new Map(),
      langs: new Map(),
      roles: new Map(),
      jobs: [],
    });
  const f = firms.get(name);
  f.count++;
  f.jobs.push(j);
  if (j.roleCategory) f.roles.set(j.roleCategory, (f.roles.get(j.roleCategory) || 0) + 1);
  for (const l of j.locations || []) f.locs.set(l, (f.locs.get(l) || 0) + 1);
  for (const l of j.programmingLanguages || []) f.langs.set(l, (f.langs.get(l) || 0) + 1);
  for (const t of j.technologies || []) f.langs.set(t, (f.langs.get(t) || 0) + 1);
}
const topLocs = (m, n = 3) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
    .join(", ");

// Firm-name → /firm/<slug> link. Every firm gets a page (built after the job
// loop) that links its individual /job/ pages, so linking firm names in the
// aggregate tables gives Google a crawl path down to the otherwise-orphaned job
// pages. Falls back to plain text if a firm somehow has no slug.
const firmSlugByName = new Map([...firms.values()].filter((f) => f.slug).map((f) => [f.name, f.slug]));
const firmLink = (name) => {
  const s = firmSlugByName.get(name);
  return s ? `<a href="${PREFIX}/firm/${s}">${esc(name)}</a>` : esc(name);
};

// ── page chrome ──────────────────────────────────────────────────────────────

// Static replica of the shared data-kit chrome (SiteHeader/GitHubButton/
// SiteFooter markup mirrors src/kit/index.jsx). All .dk-* classes come from
// the built CSS bundle linked below — the app imports kit.css, so these pages
// inherit the exact site design (and self-hosted Inter) for free.
const GH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

const siteHeader = `<header class="dk-header">
  <div class="dk-container dk-header-inner">
    <span class="dk-header-brand-group">
      <a href="${PREFIX}" class="dk-header-brand">📊 Quant Jobs</a>
      <a href="https://www.kadoa.com" target="_blank" rel="noreferrer" class="dk-header-link">by Kadoa</a>
    </span>
    <span style="display:flex;align-items:center;gap:14px">
      <span class="dk-live"><span class="dk-live-dot" aria-hidden="true"></span>Updated daily</span>
      <a class="dk-btn dk-btn--inverse" href="https://github.com/kadoa-org/quant-jobs" target="_blank" rel="noopener noreferrer" aria-label="Star on GitHub" style="text-decoration:none">${GH_ICON}<span class="dk-btn-label">Star on GitHub</span></a>
    </span>
  </div>
</header>`;

// The SPA renders SiteHeader + NavBar above every view. Prerendered pages got
// the masthead but no nav, so a search visitor landed on a page with no way
// into the tracker (only /open-source built its own). Static tabs mirroring the
// app's: Insights is a plain link here rather than the SPA's dropdown, since
// the dataset CSP blocks inline JS and a crawlable link beats a dead toggle.
const seoNav = `<nav class="dk-nav" aria-label="Primary">
  <div class="dk-container">
    <ul class="dk-nav-list">
      <li><a href="${PREFIX}/">Jobs</a></li>
      <li><a href="${PREFIX}/?view=firms">Firms</a></li>
      <li><a href="${PREFIX}/?view=dashboard">Insights</a></li>
      <li><a href="${PREFIX}/about">About</a></li>
    </ul>
  </div>
</nav>`;

// Same footer as the kit's SiteFooter: the other datasets, alphabetically, in columns (the current site is left out).
const OTHER_DATASETS = [
  ["https://www.kadoa.com/congress", "Congress Trades"],
  ["https://www.kadoa.com/datacenter", "Datacenter Tracker"],
  ["https://www.kadoa.com/layoffs", "Layoffs Tracker"],
  ["https://www.kadoa.com/mining", "Mining Monitor"],
  ["https://www.kadoa.com/potus", "POTUS Tracker"],
  ["https://www.kadoa.com/food-prices", "US Food Prices"],
];
const siteFooter = `<footer class="dk-footer">
  <div class="dk-container dk-footer-inner">
    <h2 class="dk-footer-heading">Other open datasets</h2>
    <nav aria-label="Other open datasets">
      <ul class="dk-footer-links">
        ${OTHER_DATASETS.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("\n        ")}
      </ul>
    </nav>
    <p class="dk-footer-meta">Free and open, refreshed daily&nbsp;· <a href="https://www.kadoa.com/datasets">All datasets</a>&nbsp;· built by <a href="https://www.kadoa.com/">Kadoa</a></p>
  </div>
</footer>`;

// `crumbs` is the trail above the h1 as [href, label] pairs, the page itself last and unlinked. It is also emitted as
// BreadcrumbList structured data, so search results show the trail instead of the raw URL.
function page({ pathname, title, description, jsonLd, h1, intro, bodyHtml, navHtml = seoNav, showCrumbs = true, crumbs = null }) {
  const trail = crumbs ?? [[PREFIX, "Quant Jobs"], [null, h1]];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([href, label], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: label,
      item: `https://www.kadoa.com${href ?? pathname.replace(/^/, PREFIX)}`,
    })),
  };
  jsonLd = showCrumbs ? [jsonLd, breadcrumbLd].filter(Boolean) : jsonLd;
  const url = `${BASE}${pathname}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="${PREFIX}/favicon.svg" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Quant Jobs" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${BASE}/screenshot.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${BASE}/screenshot.png" />
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<style>
  /* Page-only styles; the look comes from the kit's .dk-* classes in the bundle CSS. */
  body{margin:0;background:var(--dk-bg);color:var(--dk-ink);font-family:var(--dk-font)}
  /* vertical only — must not reset the .dk-container 0 15px side padding */
  .seo-main{padding-top:28px;padding-bottom:64px}
  .insights-panel-inner{padding-top:24px;padding-bottom:24px}
  .seo-crumbs{font-size:var(--dk-fs-s);color:var(--dk-muted);margin:0 0 20px}
  .seo-crumbs a{color:var(--dk-link)}
  /* 32px, 27px on a phone: the page-title size shared by every dataset site. */
  h1{font:700 32px/1.2 var(--dk-font);margin:0 0 10px}
  @media (max-width:640px){h1{font-size:27px}}
  .seo-lede{font:400 var(--dk-fs-l)/1.5 var(--dk-font);color:var(--dk-muted);max-width:70ch;margin:0 0 24px}
  .seo-lede a,.dk-hint a{color:var(--dk-link)}
  /* GOV.UK primary button (govuk-frontend .govuk-button): green fill, 2px
     bottom shadow, darker hover, yellow focus fill, presses down on :active.
     Previously this was the kit's compact bordered .dk-btn, which kept the
     anchor's blue underlined text inside a white box. */
  .seo-cta{display:inline-block;position:relative;margin-top:20px;padding:8px 14px 7px;background:#00703c;color:#fff;text-decoration:none;font:600 var(--dk-fs-m)/1.2 var(--dk-font);border:2px solid transparent;box-shadow:0 2px 0 #002d18}
  .seo-cta:visited{color:#fff}
  .seo-cta:hover{background:#005a30;color:#fff}
  .seo-cta:active{top:2px;box-shadow:none}
  .seo-cta:focus-visible{border-color:#ffdd00;background:#ffdd00;color:#0b0c0c;box-shadow:0 2px 0 #0b0c0c;outline:none}
  .seo-apply{background:var(--dk-link);border-color:var(--dk-link);color:#fff !important;font-weight:600}
  .seo-apply:hover{background:#144e81;border-color:#144e81}
  .seo-jd{max-width:75ch;font:400 var(--dk-fs-m)/1.55 var(--dk-font);margin-top:24px}
  .seo-jd h2,.seo-jd h3,.seo-jd h4{font-weight:700;margin:22px 0 8px;line-height:1.3}
  .seo-jd h2{font-size:var(--dk-fs-l)}
  .seo-jd p,.seo-jd li{margin:0 0 10px}
  /* Tailwind preflight in the shared app CSS strips list-style; restore it. */
  .seo-jd ul{list-style:disc;padding-left:22px}
  .seo-jd ol{list-style:decimal;padding-left:22px}
  .seo-back{margin-top:28px;font-size:var(--dk-fs-s)}
  .seo-back a{color:var(--dk-link)}
  /* Firm pages. A GOV.UK summary list without borders, the weekly bars, and dates that never wrap mid-date. */
  .firm-summary{margin:0 0 36px;font-size:16px;max-width:75ch}
  .firm-summary>div{display:grid;grid-template-columns:160px 1fr;gap:15px;padding:8px 0;border-bottom:1px solid var(--dk-rule-soft)}
  .firm-summary dt{font-weight:700;margin:0}
  .firm-summary dd{margin:0}
  .firm-summary a,.seo-crumbs a{color:var(--dk-link);text-decoration:underline;text-underline-offset:3px}
  .firm-section{margin:0 0 36px}
  .firm-date{white-space:nowrap}
  @media (max-width:640px){.firm-summary>div{grid-template-columns:1fr;gap:2px}}
  .oss-about{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--dk-muted);font-size:var(--dk-fs-s);line-height:1.4}
  /* Subtle source line under each table — carries attribution into shared screenshots. */
  .oss-attr{margin:10px 0 0;font-size:12px;color:var(--dk-muted)}
  .oss-attr strong{color:var(--dk-ink);font-weight:600}
  /* Uniform row height: every cell reserves the same box and centres its
     content, so 1-line and 2-line descriptions don't make rows jump. */
  .oss-projects tbody td{height:52px;vertical-align:middle}
  .oss-projects tbody td:nth-child(2) a{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  /* Star bar scales to its column so the value label is never clipped: the
     bar is a % of a flexible track, the value sits in an auto column. */
  .oss-stars-col{width:260px}
  .starcell{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px}
  .starbar{height:10px;background:#1d70b8;border-radius:0 2px 2px 0;min-width:2px}
  .starval{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  /* Mobile: the stars column takes the space freed by the hidden columns. */
  @media (max-width:640px){.oss-stars-col{width:100%}}
  .dk-sort-ind{color:var(--dk-muted);font-size:10px;font-variant-numeric:normal}
  .dk-th-btn:hover .dk-sort-ind{color:var(--dk-ink)}
  .dk-table th[aria-sort="ascending"] .dk-sort-ind,.dk-table th[aria-sort="descending"] .dk-sort-ind{color:var(--dk-ink)}
</style>
</head>
<body>
${siteHeader}
${navHtml}
<main class="dk-container seo-main">
${showCrumbs ? `<nav class="seo-crumbs" aria-label="Breadcrumb">${trail.map(([href, label]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(" › ")}</nav>` : ""}
<h1>${esc(h1)}</h1>
${intro ? `<p class="seo-lede">${intro}</p>` : ""}
${bodyHtml}
</main>
${siteFooter}
</body>
</html>`;
}

const today = new Date().toISOString().slice(0, 10);
// Age of a posting in days at build time, for the "posted in the last 30 days" figures.
const DAY_MS = 86400000;
const buildDay = new Date(`${today}T00:00:00Z`);
const daysAgo = (iso) => (iso ? Math.floor((buildDay - new Date(`${iso}T00:00:00Z`)) / DAY_MS) : Infinity);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// GOV.UK dates: "24 Sep 2026"; the ISO date stays in data-sort so the column still sorts.
const govDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const datasetLd = (name, desc, url) => ({
  "@context": "https://schema.org",
  "@type": "Dataset",
  name,
  description: desc,
  url,
  isAccessibleForFree: true,
  dateModified: today,
  creator: { "@type": "Organization", name: "Kadoa", url: "https://kadoa.com" },
  license: "https://creativecommons.org/licenses/by/4.0/",
});

const written = [];
function write(pathname, html) {
  const dir = path.join(DIST, pathname.slice(1));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  written.push(pathname);
}

// ── /hiring ──────────────────────────────────────────────────────────────────

// Kit-styled table (classes from the bundle CSS; dk-num = right-aligned numeric)
const kitTable = (headHtml, rowsHtml) =>
  `<div class="dk-table-wrap"><table class="dk-table"><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;

const ranked = [...firms.values()].sort((a, b) => b.count - a.count);
const hiringRows = ranked
  .map(
    (f, i) =>
      `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.count}</td><td class="dk-num">${f.jobs.some((j) => j.datePosted) ? f.jobs.filter((j) => daysAgo(j.datePosted) < 30).length : `<span title="This firm's postings carry no date">–</span>`}</td><td>${esc(topLocs(f.locs))}</td></tr>`,
  )
  .join("\n");
write(
  "/hiring",
  page({
    pathname: "/hiring",
    title: `Which Quant Firms Are Hiring Right Now (${monthYear}, Live) | Quant Jobs`,
    description: `Live count of open roles across ${firms.size} hedge funds, prop shops, and market makers, ranked by number of postings. Updated daily from ${jobs.length.toLocaleString()} job listings.`,
    jsonLd: datasetLd(
      "Quant firms hiring: live open-role counts",
      `Open quant roles across ${firms.size} firms, ranked by posting volume.`,
      `${BASE}/hiring`,
    ),
    h1: "Which Quant Firms Are Hiring Right Now",
    intro: `A live, ranked snapshot of where the quant industry is hiring: ${jobs.length.toLocaleString()} open roles across ${firms.size} hedge funds, prop trading firms, and market makers, updated daily. Unlike static "top firms" lists, these counts reflect what's actually open today. <a href="${PREFIX}">Explore the interactive job board →</a>`,
    bodyHtml: `${kitTable(
      `<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">Open roles</th><th class="dk-num">New in 30 days</th><th>Top locations</th>`,
      hiringRows,
    )}
<a class="seo-cta" href="${PREFIX}">Filter all ${jobs.length.toLocaleString()} roles →</a>`,
  }),
);

// ── /tech/<slug> ──────────────────────────────────────────────────────────────

// Curated set: well-covered (>= ~15 firms) AND a real search query. OCaml is
// skipped (Jane-Street-only; their own posts own that SERP).


for (const tech of TECHS) {
  const matched = ranked
    .filter((f) => f.langs.has(tech.name))
    .map((f) => ({ name: f.name, type: f.type, n: f.langs.get(tech.name), locs: f.locs }))
    .sort((a, b) => b.n - a.n);
  if (matched.length < 5) continue;
  const totalPostings = matched.reduce((s, f) => s + f.n, 0);
  const rows = matched
    .map(
      (f, i) =>
        `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.n}</td><td>${esc(topLocs(f.locs))}</td></tr>`,
    )
    .join("\n");
  write(
    `/tech/${tech.slug}`,
    page({
      pathname: `/tech/${tech.slug}`,
      title: `Which Quant Firms Hire ${tech.name} Developers (${monthYear}, Live Data) | Quant Jobs`,
      description: `${matched.length} hedge funds, prop shops, and market makers with open ${tech.name} roles, ranked by posting count, with locations. Live data from ${jobs.length.toLocaleString()} quant job listings, updated daily.`,
      jsonLd: datasetLd(
        `Quant firms hiring ${tech.name} developers`,
        `${matched.length} quant firms with open ${tech.name} roles (${totalPostings} postings).`,
        `${BASE}/tech/${tech.slug}`,
      ),
      h1: `Quant Firms Hiring ${tech.name} Developers`,
      intro: `${matched.length} hedge funds, prop trading firms, and market makers currently have open roles mentioning <strong>${esc(tech.name)}</strong>: ${totalPostings} postings in all. Ranked by how many ${esc(tech.name)} roles each firm has open right now. <a href="${PREFIX}/tech-stack">See the full language heatmap →</a>`,
      bodyHtml: `${kitTable(
        `<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">${esc(tech.name)} roles</th><th>Top locations</th>`,
        rows,
      )}
<a class="seo-cta" href="${PREFIX}/tech-stack">Explore the interactive tech heatmap →</a>`,
    }),
  );
}

// ── /location/<slug> ──────────────────────────────────────────────────────────

// Same winnable pattern as /hiring and /tech: "quant jobs [city]" SERPs are
// owned by LinkedIn/Indeed and unwinnable, but "which quant firms are hiring in
// [city]" has no live data-backed page — a firm-ranked table is the gap we fill.
// Keep these public city URLs stable as daily firm and posting counts change.


const topLangs = (m, n = 3) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
    .join(", ");

for (const loc of LOCATIONS) {
  const matched = ranked
    .filter((f) => f.locs.has(loc.name))
    .map((f) => ({ name: f.name, type: f.type, n: f.locs.get(loc.name), langs: f.langs }))
    .sort((a, b) => b.n - a.n);
  const totalPostings = matched.reduce((s, f) => s + f.n, 0);
  // A city page ranks firms, so one with fewer than 3 firms or 20 roles would be thin; it is skipped until it grows.
  if (matched.length < 3 || totalPostings < 20) continue;
  const rows = matched
    .map(
      (f, i) =>
        `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.n}</td><td>${esc(topLangs(f.langs))}</td></tr>`,
    )
    .join("\n");
  write(
    `/location/${loc.slug}`,
    page({
      pathname: `/location/${loc.slug}`,
      title: `Quant Firms Hiring in ${loc.name} (${monthYear}, Live Data) | Quant Jobs`,
      description: `${matched.length} hedge funds, prop shops, and market makers with open quant roles in ${loc.name} — ${totalPostings} postings, ranked by firm. Live data updated daily.`,
      jsonLd: datasetLd(
        `Quant firms hiring in ${loc.name}`,
        `${matched.length} quant firms with open roles in ${loc.name} (${totalPostings} postings).`,
        `${BASE}/location/${loc.slug}`,
      ),
      h1: `Quant Firms Hiring in ${loc.name}`,
      intro: `${matched.length} hedge funds, prop trading firms, and market makers currently have open roles in <strong>${esc(loc.name)}</strong>: ${totalPostings} postings in all, ranked by how many ${esc(loc.name)} roles each firm has open right now. <a href="${PREFIX}/locations">Compare all locations →</a>`,
      bodyHtml: `${kitTable(
        `<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">${esc(loc.name)} roles</th><th>Top tech</th>`,
        rows,
      )}
<a class="seo-cta" href="${PREFIX}">Filter all ${jobs.length.toLocaleString()} roles →</a>`,
    }),
  );
}

// ── /<role>-jobs — role hub pages ─────────────────────────────────────────────
//
// OpenQuant's highest-value play: exact-match landing pages for the top role
// queries ("quant researcher jobs", "quant developer jobs", ...). Ours carry a
// live firm-ranked table + disclosed-comp stats instead of a plain job list.

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtSal = (n) => `$${Math.round(n / 1000)}k`;



for (const role of ROLES) {
  const matched = ranked
    .filter((f) => f.roles.has(role.key))
    .map((f) => ({ name: f.name, type: f.type, n: f.roles.get(role.key), locs: f.locs }))
    .sort((a, b) => b.n - a.n);
  if (matched.length < 8) continue;
  const totalPostings = matched.reduce((s, f) => s + f.n, 0);
  const salaries = jobs.filter((j) => j.roleCategory === role.key && j.salary).map((j) => j.salary);
  const medSal = salaries.length >= 15 ? median(salaries) : null;
  const rows = matched
    .map(
      (f, i) =>
        `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.n}</td><td>${esc(topLocs(f.locs))}</td></tr>`,
    )
    .join("\n");
  const roleLabel = role.key === "hft_systems" ? "HFT" : `${role.name}`;
  write(
    `/${role.slug}`,
    page({
      pathname: `/${role.slug}`,
      title: `${role.name} Jobs at Quant Firms (${monthYear}): ${totalPostings} Live Roles | Quant Jobs`,
      description: `${totalPostings} open ${role.name} roles at ${matched.length} hedge funds, prop shops, and market makers, ranked by firm${medSal ? `. Median disclosed salary ${fmtSal(medSal)}` : ""}. Live data updated daily.`,
      jsonLd: datasetLd(
        `${role.name} jobs at quant firms`,
        `${totalPostings} open ${role.name} roles across ${matched.length} quant firms.`,
        `${BASE}/${role.slug}`,
      ),
      h1: `${role.name} Jobs at Quant Firms`,
      intro: `${matched.length} hedge funds, prop trading firms, and market makers currently have <strong>${totalPostings} open ${esc(roleLabel)} roles</strong>, ranked below by how many each firm has open right now.${medSal ? ` Median disclosed salary: <strong>${fmtSal(medSal)}</strong> (${salaries.length} postings with published comp — see <a href="${PREFIX}/salaries">quant salaries</a>).` : ""} <a href="${PREFIX}">Filter all roles →</a>`,
      bodyHtml: `${kitTable(
        `<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">Open roles</th><th>Top locations</th>`,
        rows,
      )}
<a class="seo-cta" href="${PREFIX}">Browse all ${jobs.length.toLocaleString()} quant roles →</a>`,
    }),
  );
}

// ── /salaries — live disclosed-comp data ──────────────────────────────────────

{
  const disclosed = jobs.filter((j) => j.salary);
  const byRole = ROLES.map((r) => {
    const sal = disclosed.filter((j) => j.roleCategory === r.key).map((j) => j.salary);
    return { name: r.name, slug: r.slug, n: sal.length, med: median(sal) };
  }).filter((r) => r.n >= 10);
  const SEN = [
    ["intern", "Intern"],
    ["junior", "Junior"],
    ["mid", "Mid-level"],
    ["senior", "Senior"],
    ["lead", "Lead"],
    ["vp_director", "VP / Director"],
  ];
  const bySen = SEN.map(([key, label]) => {
    const sal = disclosed.filter((j) => j.seniorityLevel === key).map((j) => j.salary);
    return { label, n: sal.length, med: median(sal) };
  }).filter((r) => r.n >= 10);
  const byFirm = [...firms.values()]
    .map((f) => {
      const sal = disclosed.filter((j) => j.firmName === f.name).map((j) => j.salary);
      return {
        name: f.name,
        type: f.type,
        n: sal.length,
        med: median(sal),
        min: Math.min(...sal),
        max: Math.max(...sal),
      };
    })
    .filter((f) => f.n >= 3)
    .sort((a, b) => b.med - a.med);

  const roleRows = byRole
    .sort((a, b) => b.med - a.med)
    .map(
      (r) =>
        `<tr><td><a href="${PREFIX}/${r.slug}">${esc(r.name)}</a></td><td class="dk-num">${r.n}</td><td class="dk-num">${fmtSal(r.med)}</td></tr>`,
    )
    .join("\n");
  const senRows = bySen
    .map(
      (r) => `<tr><td>${esc(r.label)}</td><td class="dk-num">${r.n}</td><td class="dk-num">${fmtSal(r.med)}</td></tr>`,
    )
    .join("\n");
  const firmRows = byFirm
    .map(
      (f, i) =>
        `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.n}</td><td class="dk-num">${fmtSal(f.med)}</td><td class="dk-num">${fmtSal(f.min)}–${fmtSal(f.max)}</td></tr>`,
    )
    .join("\n");

  write(
    "/salaries",
    page({
      pathname: "/salaries",
      title: `Quant Salaries (${monthYear}): Live Comp Data from ${disclosed.length} Job Postings | Quant Jobs`,
      description: `Quant compensation from ${disclosed.length} live job postings that disclose salary: medians by role, seniority, and firm (${byFirm.length} firms). Base salary only, updated daily.`,
      jsonLd: datasetLd(
        "Quant salaries: live disclosed compensation",
        `Disclosed base salaries from ${disclosed.length} live quant job postings.`,
        `${BASE}/salaries`,
      ),
      h1: "Quant Salaries: Live Disclosed Comp",
      intro: `Base-salary figures published in <strong>${disclosed.length}</strong> of the ${jobs.length.toLocaleString()} live postings we track (${Math.round((disclosed.length / jobs.length) * 100)}% disclose comp, mostly NYC-based roles where pay-transparency laws apply). Median across all disclosed postings: <strong>${fmtSal(median(disclosed.map((j) => j.salary)))}</strong>. Excludes bonus and PnL-linked comp, which dominate at senior levels.`,
      bodyHtml: `<h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:28px 0 10px">By role</h2>
${kitTable(`<th>Role</th><th class="dk-num">Postings</th><th class="dk-num">Median base</th>`, roleRows)}
<h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:28px 0 10px">By seniority</h2>
${kitTable(`<th>Seniority</th><th class="dk-num">Postings</th><th class="dk-num">Median base</th>`, senRows)}
<h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:28px 0 10px">By firm (3+ disclosed postings)</h2>
${kitTable(
  `<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">Postings</th><th class="dk-num">Median base</th><th class="dk-num">Range</th>`,
  firmRows,
)}
<a class="seo-cta" href="${PREFIX}">Browse all ${jobs.length.toLocaleString()} quant roles →</a>`,
    }),
  );
}

// ── /job/<slug> — one page per live posting ──────────────────────────────────
//
// The hub play: host the posting (full description + JobPosting JSON-LD) so
// pages are eligible for Google for Jobs — the one jobs SERP surface not owned
// by LinkedIn/Indeed, and one that REQUIRES the full description in markup.
// "Apply now" hands off to the firm's original posting. Pages regenerate from
// live data daily, so expired postings drop out (404) automatically.

const descriptions = (() => {
  const p = path.join(DIST, "data", "job-descriptions.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
})();

// Greenhouse boards-API sources deliver the posting body HTML-escaped
// ("&lt;p&gt;..."), which used to render as literal tag soup on ~600 pages.
// Decode exactly the entity-escaped-HTML case (no real tags present), leaving
// genuinely plain-text descriptions untouched.
const looksEscapedHtml = (s) => /&lt;(p|div|ul|ol|li|br|strong|em|span|h\d)\b/i.test(s) && !/<[a-z][^>]*>/i.test(s);
const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
// Descriptions are third-party scraped content injected as raw HTML into the
// page: strip active content (script/style/event handlers/javascript: URLs).
const sanitizeJd = (s) =>
  s
    .replace(/<(script|style|iframe|object|embed)\b[^]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*(["'])\s*javascript:[^]*?\1/gi, "");
// About 1,200 descriptions arrive as plain text: the extraction kept the line breaks but not the source's HTML (QRT's
// Greenhouse board publishes headings and bullets; our copy has neither). Injected as HTML, those line breaks
// collapsed into one unbroken block. Plain text is rebuilt instead: a line of its own is a paragraph, a bullet or
// markdown list line is a list item, and a short line that introduces what follows ("Your current skillset",
// "Interviewing:") is a heading. Markdown "#" headings are headings.
const hasTags = (s) => /<(p|div|ul|ol|li|br|h\d|strong|span|table)\b[^>]*>/i.test(s);
const BULLET = /^\s*(?:[•·▪◦*]|-(?!-)|\d+[.)])\s+/;
const looksLikeHeading = (line, next) => {
  const t = line.replace(/^#+\s*/, "");
  if (/^#+\s/.test(line)) return true;
  if (t.length > 70 || !next) return false;
  if (/:$/.test(t)) return true;
  // No closing punctuation, few words, and not the start of a sentence that runs on to the next line.
  // "Location: London, Paris" is a label and its value, not a heading.
  if (/:\s*\S/.test(t)) return false;
  return !/[.!?,;]$/.test(t) && t.split(/\s+/).length <= 8 && /^[A-Z0-9]/.test(t) && !BULLET.test(line) && next.length > t.length;
};
function plainToHtml(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  const content = lines.filter(Boolean);
  content.forEach((line, i) => {
    const next = content[i + 1];
    if (BULLET.test(line)) {
      list.push(line.replace(BULLET, ""));
      return;
    }
    flush();
    if (looksLikeHeading(line, next)) out.push(`<h3>${esc(line.replace(/^#+\s*/, "").replace(/:$/, ""))}</h3>`);
    else out.push(`<p>${esc(line)}</p>`);
  });
  flush();
  return out.join("\n");
}
const cleanDescription = (raw) => {
  if (!raw) return raw;
  const html = looksEscapedHtml(raw) ? decodeEntities(raw) : raw;
  return sanitizeJd(hasTags(html) ? html : plainToHtml(html));
};

const EMPLOYMENT_TYPE = [
  [/full.?time/i, "FULL_TIME"],
  [/part.?time/i, "PART_TIME"],
  [/intern/i, "INTERN"],
  [/contract|temporary/i, "CONTRACTOR"],
];
// Search Console flags every posting without employmentType, and only 9% of
// feeds carry a jobType. The title is the next-best employer signal (interns
// are always titled as such); everything else on a quant careers page is a
// full-time role, which is the standard job-board assumption.
const employmentType = (jobType, title) =>
  (EMPLOYMENT_TYPE.find(([re]) => re.test(jobType || "")) || [])[1] ??
  (EMPLOYMENT_TYPE.find(([re]) => re.test(title || "")) || [])[1] ??
  "FULL_TIME";

// City → region/country for JobPosting addresses. Locations arrive as bare
// city strings, and Search Console flags the missing addressRegion and
// addressCountry on every posting. Covers every location with 10+ postings;
// unknown cities still emit locality-only rather than a guessed country.
// Region uses the local first-level unit (US/CA/AU/IN have meaningful ones);
// city-states and most European postings carry country only.
const CITY_GEO = {
  "New York": { region: "NY", country: "US" },
  "Brookfield Place": { locality: "New York", region: "NY", country: "US" },
  "Brookfield Place New York": { locality: "New York", region: "NY", country: "US" },
  Chicago: { region: "IL", country: "US" },
  Boston: { region: "MA", country: "US" },
  "Bala Cynwyd (Philadelphia Area)": { locality: "Bala Cynwyd", region: "PA", country: "US" },
  Baltimore: { region: "MD", country: "US" },
  Miami: { region: "FL", country: "US" },
  "Newport Beach": { region: "CA", country: "US" },
  Greenwich: { region: "CT", country: "US" },
  "Owings Mills": { region: "MD", country: "US" },
  Austin: { region: "TX", country: "US" },
  Stamford: { region: "CT", country: "US" },
  Houston: { region: "TX", country: "US" },
  Berkeley: { region: "CA", country: "US" },
  "San Francisco": { region: "CA", country: "US" },
  Radnor: { region: "PA", country: "US" },
  "Colorado Springs": { region: "CO", country: "US" },
  Westport: { region: "CT", country: "US" },
  Pennsylvania: { locality: null, region: "PA", country: "US" },
  Illinois: { locality: null, region: "IL", country: "US" },
  Massachusetts: { locality: null, region: "MA", country: "US" },
  Florida: { locality: null, region: "FL", country: "US" },
  London: { country: "GB" },
  "Greater London": { locality: "London", country: "GB" },
  England: { locality: null, country: "GB" },
  Edinburgh: { country: "GB" },
  Scotland: { locality: null, country: "GB" },
  "Hong Kong": { country: "HK" },
  "Hong Kong Island": { locality: "Hong Kong", country: "HK" },
  Singapore: { country: "SG" },
  Sydney: { region: "NSW", country: "AU" },
  Australia: { locality: null, country: "AU" },
  Bangalore: { region: "KA", country: "IN" },
  Bengaluru: { locality: "Bangalore", region: "KA", country: "IN" },
  Karnataka: { locality: null, region: "KA", country: "IN" },
  Mumbai: { region: "MH", country: "IN" },
  Gurgaon: { region: "HR", country: "IN" },
  Haryana: { locality: null, region: "HR", country: "IN" },
  India: { locality: null, country: "IN" },
  Paris: { country: "FR" },
  Amsterdam: { country: "NL" },
  "Noord-Holland": { locality: null, country: "NL" },
  Netherlands: { locality: null, country: "NL" },
  Dublin: { country: "IE" },
  "Dublin Ireland": { locality: "Dublin", country: "IE" },
  Ireland: { locality: null, country: "IE" },
  Shanghai: { country: "CN" },
  China: { locality: null, country: "CN" },
  Montreal: { region: "QC", country: "CA" },
  Montréal: { locality: "Montreal", region: "QC", country: "CA" },
  Toronto: { region: "ON", country: "CA" },
  Warsaw: { country: "PL" },
  Tokyo: { country: "JP" },
  Dubai: { country: "AE" },
  "United Arab Emirates": { locality: null, country: "AE" },
  Budapest: { country: "HU" },
  Geneva: { country: "CH" },
  Zurich: { country: "CH" },
  "São Paulo": { country: "BR" },
  // Surfaced by splitLocations: these sat inside compound strings such as
  // "Geneva OR London OR Paris OR Zug", so they never appeared in the location
  // counts this table was built from despite clearing its 10+ postings bar.
  Zug: { country: "CH" },
  Hanoi: { country: "VN" },
  "Ho Chi Minh City": { country: "VN" },
  Madrid: { country: "ES" },
  Beijing: { country: "CN" },
  "Old Greenwich": { region: "CT", country: "US" },
  IL: { locality: null, region: "IL", country: "US" },
  // Present as bare cities, missed when the table was last extended.
  "Washington DC": { locality: "Washington", region: "DC", country: "US" },
  "Jersey City": { region: "NJ", country: "US" },
  Connecticut: { locality: null, region: "CT", country: "US" },
  "US-NY-New York": { locality: "New York", region: "NY", country: "US" },
  "Central Singapore": { locality: "Singapore", country: "SG" },
  "Taipei City": { locality: "Taipei", country: "TW" },
  "Tel Aviv": { country: "IL" },
  Yerevan: { country: "AM" },
  Aarhus: { country: "DK" },
  France: { locality: null, country: "FR" },
  Brazil: { locality: null, country: "BR" },
  // "Wilmington" is ambiguous in general, but every posting carrying it in
  // this dataset is BlackRock's, whose Wilmington office is in Delaware.
  Wilmington: { region: "DE", country: "US" },
};

// Feeds sometimes put several cities in one string ("Sydney or Singapore",
// "Hanoi OR Ho Chi Minh City", "Geneva OR London OR Paris OR Zug"). Those are
// genuinely several locations, but as one string they match nothing in
// CITY_GEO, so the posting emitted a locality of "Sydney or Singapore" and no
// country at all. That is what broke the 2026-08-15 build on a remote Jump
// Trading posting: a fully remote JobPosting with no applicant country cannot
// be marked up, and the guard below refuses to ship an invalid one. Splitting
// first recovers a country for all 35 affected postings, not just remote ones.
// No CITY_GEO key is itself split by this, including "Bala Cynwyd
// (Philadelphia Area)" and "Hong Kong Island".
const splitLocations = (loc) =>
  String(loc ?? "")
    .split(/\s+(?:or|and)\s+|\s*\/\s*|\s*;\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

const placeFor = (loc) => {
  const geo = CITY_GEO[loc];
  const address = { "@type": "PostalAddress" };
  const locality = geo && "locality" in geo ? geo.locality : loc;
  if (locality) address.addressLocality = locality;
  if (geo?.region) address.addressRegion = geo.region;
  if (geo?.country) address.addressCountry = geo.country;
  return { "@type": "Place", address };
};

// Feeds list one place at several granularities ("Bangalore", "Karnataka",
// "India"), which became three Place entries; Google validates each one, so
// the country-only entry kept the addressRegion warning alive on postings
// whose city entry was complete. An address that is a strict subset of a
// sibling (same values for every field it has, fewer fields) is the same
// place, not another location, so it is dropped. Genuinely distinct cities
// are never subsets of each other and all survive.
const dedupePlaces = (places) => {
  const addrs = places.map((p) => p.address);
  const isSubset = (a, b) =>
    a !== b &&
    Object.keys(a).every((k) => k === "@type" || b[k] === a[k]) &&
    Object.keys(a).length < Object.keys(b).length;
  return places.filter((p, i) => !addrs.some((other) => isSubset(addrs[i], other)));
};

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
// Google requires fully remote JobPostings to name the countries applicants
// may work from. The normalized job-location countries are the grounded
// boundary available in this dataset (and match Google's jobLocation default).
const applicantCountriesFor = (places) =>
  [...new Set(places.map((place) => place.address.addressCountry).filter(Boolean))].map((country) => ({
    "@type": "Country",
    name: COUNTRY_NAMES.of(country),
  }));

// Pay-transparency ranges published in the posting text itself. Only the
// employer's own numbers qualify for baseSalary (Google forbids estimates
// there), so this stays keyword-anchored and bounded to plausible annual
// comp; portfolio sizes ("manage $2B") never match.
const SALARY_RANGE =
  /(?:base salary|salary|compensation|pay)[^$£€]{0,80}([$£€])\s?([\d,]{5,9})(?:\s?(?:-|–|to)\s?)(?:[$£€]\s?)?([\d,]{5,9})/i;
const CURRENCY = { $: "USD", "£": "GBP", "€": "EUR" };
function salaryFromDescription(html) {
  const m = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .match(SALARY_RANGE);
  if (!m) return null;
  const lo = Number(m[2].replace(/,/g, ""));
  const hi = Number(m[3].replace(/,/g, ""));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 40_000 || hi > 2_500_000 || hi < lo) return null;
  return {
    "@type": "MonetaryAmount",
    currency: CURRENCY[m[1]],
    value: { "@type": "QuantitativeValue", minValue: lo, maxValue: hi, unitText: "YEAR" },
  };
}

const SENIORITY_LABEL = { junior: "Junior", mid: "Mid-level", senior: "Senior", lead: "Lead", executive: "Executive" };
const WORK_MODE_LABEL = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };

let jobPages = 0;
const jobSitemapEntries = [];
for (const j of jobs) {
  const desc = j.slug && cleanDescription(descriptions[j.id]);
  if (!desc) continue;
  const applyHref = j.applyUrl || j.url;
  if (!applyHref) continue;

  const locStr = (j.locations || []).join(", ");
  const jobLocations = dedupePlaces((j.locations || []).flatMap(splitLocations).map(placeFor));
  const applicantLocationRequirements = applicantCountriesFor(jobLocations);
  if (j.datePosted && j.workMode === "remote" && !applicantLocationRequirements.length) {
    throw new Error(
      `Remote JobPosting ${j.slug} has no normalized applicant country for locations: ${locStr || "(none)"}`,
    );
  }
  const chips = [
    j.firmName,
    FIRM_TYPE_LABEL[j.firmType],
    locStr,
    SENIORITY_LABEL[j.seniorityLevel],
    WORK_MODE_LABEL[j.workMode],
    j.salary ? `$${Math.round(j.salary / 1000)}k` : null,
    j.datePosted ? `Posted ${govDate(j.datePosted)}` : null,
  ].filter(Boolean);

  // JobPosting structured data. Google requires datePosted AND a location
  // (jobLocation, or jobLocationType TELECOMMUTE with applicantLocationRequirements),
  // so a posting missing either cannot produce a valid item. Those pages ship with
  // no structured data rather than an invalid JobPosting or a Dataset claiming a
  // single job listing is a dataset, which is what Google was rejecting.
  const canMarkUp =
    Boolean(j.datePosted) &&
    (jobLocations.length > 0 || (j.workMode === "remote" && applicantLocationRequirements.length > 0));
  const jsonLd = canMarkUp
    ? {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: j.jobTitle,
        description: desc,
        datePosted: j.datePosted,
        hiringOrganization: {
          "@type": "Organization",
          name: j.firmName,
          ...(j.companyLogo ? { logo: j.companyLogo } : {}),
        },
        ...(jobLocations.length ? { jobLocation: jobLocations } : {}),
        ...(j.workMode === "remote"
          ? {
              jobLocationType: "TELECOMMUTE",
              applicantLocationRequirements,
            }
          : {}),
        employmentType: employmentType(j.jobType, j.jobTitle),
        ...(j.salary
          ? {
              baseSalary: {
                "@type": "MonetaryAmount",
                currency: "USD",
                value: { "@type": "QuantitativeValue", value: j.salary, unitText: "YEAR" },
              },
            }
          : salaryFromDescription(desc)
            ? { baseSalary: salaryFromDescription(desc) }
            : {}),
        directApply: false,
        url: `${BASE}/job/${j.slug}`,
      }
    : null;

  write(
    `/job/${j.slug}`,
    page({
      pathname: `/job/${j.slug}`,
      title: `${j.jobTitle} at ${j.firmName}${locStr ? ` – ${(j.locations || [])[0]}` : ""} | Quant Jobs`,
      description: `${j.jobTitle} at ${j.firmName}${locStr ? ` (${locStr})` : ""}. Live posting aggregated from the firm's careers page — apply directly. One of ${jobs.length.toLocaleString()} open quant roles tracked daily.`,
      jsonLd,
      h1: j.jobTitle,
      crumbs: [[PREFIX, "Quant Jobs"], [`${PREFIX}/firm/${firmSlugify(j.firmName)}`, `${j.firmName} careers`], [null, j.jobTitle]],
      intro: `<span class="dk-hint">${chips.map(esc).join(" · ")}</span>`,
      bodyHtml: `<p>
  <a class="dk-btn seo-apply" href="${esc(applyHref)}" target="_blank" rel="noopener noreferrer nofollow">Apply now →</a>
  <span class="dk-hint" style="margin-left:12px">Applications go to ${esc(j.firmName)}'s own site.</span>
</p>
<article class="seo-jd">${desc}</article>
<p class="seo-back"><a href="${PREFIX}/firm/${firmSlugify(j.firmName)}">All open roles at ${esc(j.firmName)}</a> · <a href="${PREFIX}">Browse all quant roles</a></p>`,
    }),
  );
  jobSitemapEntries.push({ path: `/job/${j.slug}`, lastmod: j.datePosted || today });
  jobPages++;
}
console.log(`job pages: ${jobPages}`);

// ── /firm/<slug> — one page per firm, linking that firm's job pages ───────────
// Without this the 4k+ /job/ pages are reachable only from the sitemap, which
// Google treats as "Discovered - currently not indexed". Each firm page lists
// the firm's open roles (linked), and the firm names in every aggregate table
// above now link here — a crawl path from indexed pages down to each job page.
// Also a strong "<firm> quant jobs" landing page in its own right.
// Sortable-header helpers for the static tables. Click-to-sort is wired in
// oss-chart.js (dataset CSP blocks inline JS); sortable cells carry a
// data-sort attribute so the JS sorts on raw values, not formatted text.
const thCls = (o) => [o.num ? "dk-num" : "", o.cls || ""].filter(Boolean).join(" ");
const sortTh = (label, col, type, o = {}) => {
  const c = thCls(o);
  return `<th${c ? ` class="${c}"` : ""}${o.width ? ` style="width:${o.width}"` : ""} aria-sort="${o.active ? (o.dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="dk-th-btn" data-col="${col}" data-type="${type}">${label} <span class="dk-sort-ind" aria-hidden="true">${o.active ? (o.dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>`;
};
const plainTh = (label, o = {}) => {
  const c = thCls(o);
  return `<th${c ? ` class="${c}"` : ""}${o.width ? ` style="width:${o.width}"` : ""}>${label}</th>`;
};
const sortableFirmTable = (head, rows) =>
  `<div class="dk-table-wrap"><table class="dk-table dk-sortable"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
const sortableTable = (head, rows, cls = "") =>
  `<div class="dk-table-wrap"><table class="dk-table dk-sortable${cls ? ` ${cls}` : ""}" data-rank-col="0"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;

// ── /firm/<slug> ─────────────────────────────────────────────────────────────
// Search Console (Jun to Sep 2026): firm pages drew 36k impressions at about position 7, mostly for "<firm> careers",
// and 32 clicks. The title answered a different question ("Quant Jobs") and gave no reason to pick us over the
// firm's own careers site. So the page now leads with "careers", and with what only we have: how many roles are
// open, how many are new, internships and disclosed pay, and where the firm hires, before the full list.
const kFmt = (v) => `$${Math.round(v / 1000)}k`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// The kit's headline row (figures.css), rendered as static HTML.
const keyFigures = (items, context) => {
  const shown = items.filter(Boolean);
  return `<section class="dk-figures"><div class="dk-heading"><h2 class="dk-heading__title">Headlines</h2></div>
<dl class="dk-figures__row${shown.length % 2 ? " dk-figures__row--odd" : ""}" style="--dk-figures-columns:${shown.length}">${shown
    .map((f) => `<div class="dk-figures__item"><dt class="dk-figures__label">${f.label}</dt><dd class="dk-figures__value">${f.value}</dd>${f.note ? `<dd class="dk-figures__note">${f.note}</dd>` : ""}</div>`)
    .join("")}</dl>${context ? `<p class="dk-figures__context">${context}</p>` : ""}</section>`;
};
const sectionHeading = (title, desc) =>
  `<div class="dk-heading"><h2 class="dk-heading__title">${title}</h2>${desc ? `<p class="dk-heading__desc">${desc}</p>` : ""}</div>`;
// Cities and roles on a firm page link to their own pages where one was generated: the in-context links that tie the
// page set together, in place of a block of footer links.
const cityLink = (c) => {
  const loc = LOCATIONS.find((l) => l.name === c);
  return loc && written.includes(`/location/${loc.slug}`) ? `<a href="${PREFIX}/location/${loc.slug}">${esc(c)}</a>` : esc(c);
};
const roleLink = (key) => {
  const role = ROLES.find((r) => r.key === key);
  const label = esc(ROLE_LABELS[key] ?? key);
  return role && written.includes(`/${role.slug}`) ? `<a href="${PREFIX}/${role.slug}">${label}</a>` : label;
};

let firmPages = 0;
for (const f of ranked) {
  if (!f.slug) continue;
  // Only link jobs that actually got a page (same guard as the job loop).
  const linkable = f.jobs
    .filter((j) => j.slug && descriptions[j.id] && (j.applyUrl || j.url))
    .sort((a, b) => (b.datePosted || "").localeCompare(a.datePosted || ""));
  if (!linkable.length) continue;
  const typeLabel = FIRM_TYPE_LABEL[f.type] ?? "finance firm";
  const where = topLocs(f.locs);
  // Some firms publish no posting dates (the exporter clears placeholder ones), so "new" figures are only shown for
  // firms whose postings carry real dates.
  const dated = f.jobs.filter((j) => j.datePosted);
  const fresh = dated.filter((j) => daysAgo(j.datePosted) < 30).length;
  const interns = f.jobs.filter((j) => j.seniorityLevel === "intern");
  const interns2027 = interns.filter((j) => /2027/.test(j.jobTitle || "")).length;
  const pay = f.jobs.map((j) => j.salary).filter((v) => typeof v === "number" && v > 0);
  const medianPay = median(pay);
  const topRoles = [...f.roles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cities = [...f.locs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const newest = linkable[0]?.datePosted;

  const headlines = keyFigures(
    [
      { label: "Open roles", value: String(f.count), note: `${typeLabel}, live today` },
      dated.length
        ? { label: "Posted in the last 30 days", value: String(fresh), note: `${Math.round((fresh / f.count) * 100)}% of open roles` }
        : { label: "Posted in the last 30 days", value: "Not published", note: "The firm's postings carry no date" },
      {
        label: "Internships",
        value: String(interns.length),
        note: interns.length ? `${interns2027} name 2027` : "None open right now",
      },
      {
        label: "Median disclosed base",
        value: medianPay ? kFmt(medianPay) : "Not disclosed",
        note: pay.length ? `From ${plural(pay.length, "posting")} with pay` : "No posting prints a salary",
      },
    ],
    newest
      ? `Newest role posted ${govDate(newest)}. Counts come from the firm's own job postings, checked daily.`
      : "Counts come from the firm's own job postings, checked daily. The firm does not publish posting dates.",
  );
  // Internships get their own section: "<firm> internship" and "<firm> quant internship" are common searches that
  // landed on these pages without the word appearing anywhere. Intern pay is shown where the posting prints it.
  const internRows = interns
    .filter((j) => j.slug && descriptions[j.id])
    .sort((a, b) => (b.datePosted || "").localeCompare(a.datePosted || ""));
  const internPay = internRows.some((j) => j.salary);
  const internSection = internRows.length
    ? `<section class="firm-section">${sectionHeading(
        `${esc(f.name)} internships`,
        `${plural(interns.length, "open internship")}${interns2027 ? `, ${interns2027} for 2027` : ""}.${internPay ? " Pay is the annual base the posting prints." : ""}`,
      )}${kitTable(
        `<th>Internship</th><th>Location</th>${internPay ? `<th class="dk-num dk-hide-sm">Pay</th>` : ""}`,
        internRows
          .slice(0, 25)
          .map(
            (j) =>
              `<tr><td><a href="${PREFIX}/job/${esc(j.slug)}">${esc(j.jobTitle)}</a></td><td>${esc((j.locations || []).slice(0, 2).join(", "))}</td>${internPay ? `<td class="dk-num dk-hide-sm">${j.salary ? kFmt(j.salary) : ""}</td>` : ""}</tr>`,
          )
          .join("\n"),
      )}${internRows.length > 25 ? `<p class="dk-hint">Showing 25 of ${internRows.length} internships; all are in the table below.</p>` : ""}</section>`
    : "";

  // GOV.UK summary list: the firm at a glance, one fact per row.
  const summary = `<dl class="firm-summary">
<div><dt>Type</dt><dd>${esc(typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1))}</dd></div>
<div><dt>Hiring in</dt><dd>${cities.map(([c, n]) => `${cityLink(c)} (${n})`).join(", ")}</dd></div>
<div><dt>Most open roles</dt><dd>${topRoles.map(([r, n]) => `${roleLink(r)} (${n})`).join(", ")}</dd></div>
</dl>`;

  // Same columns as the interactive Jobs table (minus the redundant Firm column), so drilling from a location or
  // firm link lands on a familiar layout. Responsive hides approximate the SPA's.
  const rows = linkable
    .slice(0, 500)
    .map(
      (j) =>
        `<tr><td><a href="${PREFIX}/job/${esc(j.slug)}">${esc(j.jobTitle)}</a></td><td class="dk-hide-sm">${esc(ROLE_LABELS[j.roleCategory] ?? j.roleCategory ?? "")}</td><td>${esc((j.locations || []).slice(0, 2).join(", "))}</td><td class="dk-hide-md" data-sort="${SENIORITY_ORDER.indexOf(j.seniorityLevel)}">${esc(SENIORITY_LABELS[j.seniorityLevel] ?? j.seniorityLevel ?? "")}</td><td class="dk-num dk-hide-md" data-sort="${j.salary ?? 0}">${j.salary ? kFmt(j.salary) : ""}</td><td class="dk-hide-md">${esc((j.programmingLanguages || []).slice(0, 3).join(", "))}</td><td class="dk-num firm-date" data-sort="${esc(j.datePosted || "")}">${esc(govDate(j.datePosted))}</td></tr>`,
    )
    .join("\n");
  const roleCounts = topRoles.map(([r, n]) => `${n} ${ROLE_LABELS[r] ?? r}`).join(", ");
  write(
    `/firm/${f.slug}`,
    page({
      pathname: `/firm/${f.slug}`,
      title: `${f.name} Careers: ${f.count} Open Quant Job${f.count === 1 ? "" : "s"} (${monthYear}) | Quant Jobs`,
      description: `${f.name} is hiring for ${plural(f.count, "role")}${where ? ` in ${where}` : ""}: ${roleCounts}.${interns.length ? ` ${plural(interns.length, "internship")}.` : ""} ${dated.length ? `${fresh} posted in the last 30 days` : "Live roles"}${medianPay ? `, median disclosed base ${kFmt(medianPay)}` : ""}. Updated daily.`,
      jsonLd: datasetLd(`${f.name} open quant roles`, `${f.count} open roles at ${f.name}.`, `${BASE}/firm/${f.slug}`),
      h1: `${f.name} careers`,
      intro: `Every open role at ${esc(f.name)}, from its own careers pages, with its internships and the pay its postings disclose. Updated daily. <a href="${PREFIX}/hiring">Compare all firms hiring</a>`,
      bodyHtml: `${headlines}
${summary}
${internSection}
<section class="firm-section">${sectionHeading(`All ${plural(f.count, "open role")}`, "Newest first. Each role links to its details and the firm's apply page.")}${sortableFirmTable(
        `${sortTh("Title", 0, "text")}${sortTh("Role", 1, "text", { cls: "dk-hide-sm" })}${sortTh("Location", 2, "text")}${sortTh("Seniority", 3, "num", { cls: "dk-hide-md" })}${sortTh("Salary", 4, "num", { num: true, cls: "dk-hide-md" })}${sortTh("Languages", 5, "text", { cls: "dk-hide-md" })}${sortTh("Posted", 6, "text", { num: true, active: true, dir: "desc" })}`,
        rows,
      )}${linkable.length > 500 ? `<p class="dk-hint">Showing 500 of ${f.count} open roles.</p>` : ""}</section>
<script src="${PREFIX}/oss-chart.js" defer></script>`,
    }),
  );
  firmPages++;
}
console.log(`firm pages: ${firmPages}`);

// ── insights-page shared helpers (used by /open-source and /internships) ─────
// gov.uk-style nav for the insights pages: same tabs + Insights toggle as the
// SPA. Static HTML; the expand/collapse is wired in oss-chart.js (dataset CSP
// blocks inline JS). Panel links stay in the DOM for crawlers either way.
const insightsNavItem = (href, label, desc, current) =>
  `<div style="width:208px"><a href="${href}"${current ? ' aria-current="true"' : ""} style="font:${current ? 700 : 600} 15px/1.3 var(--dk-font);color:#1d70b8;text-underline-offset:2px">${label}</a><p style="margin:4px 0 0;font:400 13px/1.35 var(--dk-font);color:#505a5f">${desc}</p></div>`;
const insightsNav = (current) => `<nav class="dk-nav" aria-label="Primary">
  <div class="dk-container">
    <ul class="dk-nav-list">
      <li><a href="${PREFIX}/">Jobs</a></li>
      <li><a href="${PREFIX}/?view=firms">Firms</a></li>
      <li><a href="#insights" id="insights-toggle" aria-expanded="false" aria-controls="insights-panel">Insights <svg width="11" height="8" viewBox="0 0 11 8" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-left:2px;margin-top:-2px"><path id="insights-chevron" d="M1 1.5 L5.5 6 L10 1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg></a></li>
    </ul>
  </div>
</nav>
<div id="insights-panel" hidden style="background:#fff;border-bottom:1px solid #b1b4b6">
  <div class="dk-container insights-panel-inner">
    <div style="display:flex;flex-wrap:wrap;gap:20px 40px">
      ${insightsNavItem(`${PREFIX}/?view=dashboard`, "Hiring insights", "Roles, seniority, salaries and demand across all firms", false)}
      ${insightsNavItem(`${PREFIX}/tech-stack`, "Tech heatmap", "Languages and tools by firm, the hiring heatmap", false)}
      ${insightsNavItem(`${PREFIX}/stacks`, "Tech stack", "Browse each firm's stack as layers, from its own postings", false)}
      ${insightsNavItem(`${PREFIX}/locations`, "Locations", "Where quant firms hire, city by city", false)}
      ${insightsNavItem(`${PREFIX}/open-source/`, "Open source", "Firms ranked by GitHub footprint", current === "open-source")}
      ${insightsNavItem(`${PREFIX}/internships`, "Internships", "Live intern market: firms, skills, cities, pay", current === "internships")}
    </div>
  </div>
</div>`;

// ── /open-source — quant firms on GitHub ─────────────────────────────────────
// SERP gap: "quant firms github" queries return stale listicles; nobody ranks
// firms by live OSS footprint. Data ships daily from the jobs pipeline
// (github.json), so the leaderboard and repo stars stay current.
if (github.firms.length) {
  const active = github.firms.filter((f) => f.public_repos > 0);
  const totalStars = active.reduce((s, f) => s + f.total_stars, 0);
  const totalRepos = active.reduce((s, f) => s + f.public_repos, 0);

  const maxStars = active[0].total_stars;
  // Bar is a % of a flexible track; the value sits in a separate auto column
  // (see .starcell CSS) so it scales with the column and never gets clipped.
  const starBar = (stars) => {
    const pct = Math.max(1, Math.round((stars / maxStars) * 100));
    return `<div class="starcell"><span class="starbar" style="width:${pct}%"></span><span class="starval">${fmtStars(stars)}</span></div>`;
  };

  const leaderHead = `${plainTh("#", { num: true, width: "44px" })}${sortTh("Firm", 1, "text")}${sortTh("GitHub stars", 2, "num", { active: true, dir: "desc", cls: "oss-stars-col" })}${sortTh("Repos", 3, "num", { num: true, cls: "dk-hide-sm" })}${sortTh("Active (1y)", 4, "num", { num: true, cls: "dk-hide-sm" })}${plainTh("Top repo", { cls: "dk-hide-md" })}`;
  const leaderRows = active
    .map(
      (f, i) =>
        `<tr><td class="dk-num" style="color:var(--dk-muted)">${i + 1}</td><td data-sort="${esc(f.firm_name)}"><strong>${firmLink(f.firm_name)}</strong><br /><a href="${esc(f.org_url)}" target="_blank" rel="noopener noreferrer" style="font-size:var(--dk-fs-s);color:var(--dk-muted)">@${esc(f.org)}</a></td><td class="oss-stars-col" data-sort="${f.total_stars}">${starBar(f.total_stars)}</td><td class="dk-num dk-hide-sm" data-sort="${f.public_repos}">${f.public_repos}</td><td class="dk-num dk-hide-sm" data-sort="${f.active_repos_1y ?? f.active_repos_90d}">${f.active_repos_1y ?? f.active_repos_90d}</td><td class="dk-hide-md">${f.top_repos[0] ? `<a href="${esc(f.top_repos[0].url)}" target="_blank" rel="noopener noreferrer">${esc(f.top_repos[0].name)}</a> <span style="color:var(--dk-muted);white-space:nowrap">${fmtStars(f.top_repos[0].stars)}★</span>` : "—"}</td></tr>`,
    )
    .join("\n");

  const allRepos = active
    .flatMap((f) => f.top_repos.map((r) => ({ ...r, firm: f.firm_name })))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 25);
  const repoHead = `${plainTh("#", { num: true, width: "44px" })}${sortTh("Repository", 1, "text", { width: "22%" })}${sortTh("Firm", 2, "text", { width: "16%" })}${sortTh("Language", 3, "text", { width: "13%", cls: "dk-hide-sm" })}${sortTh("Stars", 4, "num", { num: true, active: true, dir: "desc", width: "84px" })}${plainTh("About", { cls: "dk-hide-md" })}`;
  const repoRows = allRepos
    .map(
      (r, i) =>
        `<tr><td class="dk-num" style="color:var(--dk-muted)">${i + 1}</td><td data-sort="${esc(r.name)}"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="font-weight:600">${esc(r.name)}</a></td><td data-sort="${esc(r.firm)}">${firmLink(r.firm)}</td><td class="dk-hide-sm" data-sort="${esc(r.language ?? "")}">${r.language ? `<span class="dk-tag dk-tag--grey">${esc(r.language)}</span>` : ""}</td><td class="dk-num" data-sort="${r.stars}">${fmtStars(r.stars)}</td><td class="dk-hide-md"><span class="oss-about">${esc(r.description ?? "")}</span></td></tr>`,
    )
    .join("\n");

  const emptyOrgs = github.firms.filter((f) => f.public_repos === 0);

  write(
    "/open-source",
    page({
      pathname: "/open-source",
      title: `Quant Firms on GitHub: Open Source Leaderboard | Quant Jobs`,
      description: `Which quant firms actually open-source? ${active.length} hedge funds, prop shops, and market makers ranked by GitHub footprint: ${totalRepos.toLocaleString()} public repos, ${fmtStars(totalStars)} stars. Updated daily.`,
      jsonLd: datasetLd(
        "Quant firms on GitHub: open-source footprint",
        `GitHub org stats for ${active.length} quant firms.`,
        `${BASE}/open-source`,
      ),
      h1: "Open Source Leaderboard",
      intro: `Top quant firms with public GitHub orgs, ranked by total stars and activity across repositories.`,
      bodyHtml: `${sortableTable(leaderHead, leaderRows)}
<p class="oss-attr">Source: <strong>kadoa.com/quant/open-source</strong> · live GitHub data, updated daily</p>
<h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:32px 0 10px">Top Projects</h2>
${sortableTable(repoHead, repoRows, "oss-projects")}
<p class="oss-attr">Source: <strong>kadoa.com/quant/open-source</strong> · live GitHub data, updated daily</p>
${emptyOrgs.length ? `<p class="dk-hint" style="margin-top:16px">Orgs with no public repos yet: ${emptyOrgs.map((f) => `<a href="${esc(f.org_url)}" target="_blank" rel="noopener noreferrer">${esc(f.firm_name)}</a>`).join(", ")}.</p>` : ""}
<script src="${PREFIX}/oss-chart.js" defer></script>`,
      navHtml: insightsNav("open-source"),
      showCrumbs: false,
    }),
  );
  console.log(`open-source page: ${active.length} firms`);
}

// Same-origin JS file (dataset CSP blocks inline scripts): Insights toggle +
// click-to-sort on the insights-page tables (/open-source, /internships).
// Rows are sorted on the raw data-sort value (not the formatted text), and
// the rank column (data-rank-col) is renumbered to match the visible order.
{
  fs.writeFileSync(
    path.join(DIST, "oss-chart.js"),
    `(function () {
  var tgl = document.getElementById("insights-toggle");
  var panel = document.getElementById("insights-panel");
  var chev = document.getElementById("insights-chevron");
  if (tgl && panel) {
    tgl.addEventListener("click", function (e) {
      e.preventDefault();
      var opening = panel.hidden;
      panel.hidden = !opening;
      tgl.setAttribute("aria-expanded", String(opening));
      if (chev) chev.setAttribute("d", opening ? "M1 6.5 L5.5 2 L10 6.5" : "M1 1.5 L5.5 6 L10 1.5");
    });
  }

  function cellVal(row, col, type) {
    var cell = row.cells[col];
    if (!cell) return type === "num" ? 0 : "";
    var raw = cell.getAttribute("data-sort");
    if (raw == null) raw = cell.textContent;
    if (type === "num") { var n = parseFloat(raw); return isNaN(n) ? 0 : n; }
    return String(raw).trim().toLowerCase();
  }

  Array.prototype.forEach.call(document.querySelectorAll("table.dk-sortable"), function (table) {
    var tbody = table.tBodies[0];
    if (!tbody) return;
    var rankAttr = table.getAttribute("data-rank-col");
    var rankCol = rankAttr == null ? -1 : Number(rankAttr);
    Array.prototype.forEach.call(table.querySelectorAll("thead .dk-th-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var col = Number(btn.getAttribute("data-col"));
        var type = btn.getAttribute("data-type");
        var th = btn.parentNode;
        var cur = th.getAttribute("aria-sort");
        var dir = cur === "ascending" ? "descending" : cur === "descending" ? "ascending" : type === "num" ? "descending" : "ascending";
        Array.prototype.forEach.call(table.querySelectorAll("thead th"), function (h) {
          h.setAttribute("aria-sort", "none");
          var ind = h.querySelector(".dk-sort-ind");
          if (ind) ind.textContent = "↕";
        });
        th.setAttribute("aria-sort", dir);
        var ind = th.querySelector(".dk-sort-ind");
        if (ind) ind.textContent = dir === "ascending" ? "▲" : "▼";
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          var av = cellVal(a, col, type), bv = cellVal(b, col, type);
          if (av < bv) return dir === "ascending" ? -1 : 1;
          if (av > bv) return dir === "ascending" ? 1 : -1;
          return 0;
        });
        rows.forEach(function (r, i) {
          tbody.appendChild(r);
          if (rankCol >= 0 && r.cells[rankCol]) r.cells[rankCol].textContent = String(i + 1);
        });
      });
    });
  });
})();
`,
  );
}

// ── /internships — the live quant intern market ──────────────────────────────
// SERP gap: "quant internships 2027" queries land on stale megathreads; nobody
// tracks the live cycle. The URL is served by the SPA (src/InternshipsView.jsx,
// path-routed in App.jsx); these ranked tables are injected after #root in the
// built internships.html shell for crawlers and no-JS visitors. Companion share
// card: kadoa-backend services/custom/datasets/jobs/scripts/buildInternshipCycle.ts
// (keep the panel definitions and city filter in sync).
let internshipsSeoSection = null;
{
  // Quant roles only, same set as the SPA (src/App.jsx QUANT_ROLES) and the
  // share card, so the tables match the live view above them. Drops the
  // marketing, ETF sales, legal, and investor-relations internships these firms
  // also post: real jobs, not quant internships.
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
  const interns = jobs.filter((j) => j.seniorityLevel === "intern" && QUANT_ROLES.has(j.roleCategory));
  if (interns.length) {
    const names2027 = (j) => /2027/.test(j.jobTitle);
    const target2027 = interns.filter(names2027).length;
    const target2026 = interns.filter((j) => /2026/.test(j.jobTitle)).length;
    const internFirms = new Set(interns.map((j) => j.firmName));

    const rankTags = (tagsForJob) => {
      const counts = new Map();
      for (const j of interns) {
        for (const tag of new Set(tagsForJob(j))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    };
    const share = (n) => `${Math.round((n / interns.length) * 100)}%`;

    // The locations array carries region tags alongside cities (an ad in Bala
    // Cynwyd also emits "Pennsylvania"). Keep cities only so nothing counts twice.
    const NON_CITY = new Set([
      "Pennsylvania",
      "Illinois",
      "Ireland",
      "Australia",
      "Virginia",
      "Brazil",
      "United Kingdom",
      "United States",
      "Netherlands",
      "France",
      "India",
      "Remote",
    ]);
    const cityName = (loc) => (loc === "Bala Cynwyd (Philadelphia Area)" ? "Philadelphia area" : loc);
    const cities = rankTags((j) => (j.locations ?? []).filter((l) => l && !NON_CITY.has(l)).map(cityName));

    const areas = rankSkillAreas(interns);

    const allByFirm = new Map();
    for (const j of jobs) allByFirm.set(j.firmName, (allByFirm.get(j.firmName) ?? 0) + 1);
    const firm2027 = new Map();
    for (const j of interns) {
      if (names2027(j)) firm2027.set(j.firmName, (firm2027.get(j.firmName) ?? 0) + 1);
    }
    const firmRanks = rankTags((j) => [j.firmName]);
    const techRanks = rankTags((j) => [...(j.programmingLanguages ?? []), ...(j.technologies ?? [])]);

    const salaryByFirm = new Map();
    for (const j of interns) {
      if (j.salary == null) continue;
      salaryByFirm.set(j.firmName, Math.max(salaryByFirm.get(j.firmName) ?? 0, j.salary));
    }
    const pay = [...salaryByFirm.entries()]
      .map(([firm, salary]) => ({ firm, salary }))
      .sort((a, b) => b.salary - a.salary || a.firm.localeCompare(b.firm));

    const attr = `<p class="oss-attr">Source: <strong>kadoa.com/quant/internships</strong> · live careers-page ads, updated daily</p>`;
    const h2 = (t) => `<h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:32px 0 10px">${t}</h2>`;
    const hint = (t) => `<p class="dk-hint" style="margin:0 0 12px">${t}</p>`;

    const firmHead = `${plainTh("#", { num: true, width: "44px" })}${sortTh("Firm", 1, "text")}${sortTh("Internships", 2, "num", { num: true, active: true, dir: "desc", width: "120px" })}${sortTh("Names 2027", 3, "num", { num: true, width: "120px" })}${sortTh("Share of firm's ads", 4, "num", { num: true, width: "160px", cls: "dk-hide-sm" })}`;
    const firmRows = firmRanks
      .map((row, i) => {
        const total = allByFirm.get(row.name) ?? row.count;
        const shareOfFirm = Math.round((row.count / total) * 100);
        return `<tr><td class="dk-num" style="color:var(--dk-muted)">${i + 1}</td><td data-sort="${esc(row.name)}"><strong>${firmLink(row.name)}</strong></td><td class="dk-num" data-sort="${row.count}">${row.count}</td><td class="dk-num" data-sort="${firm2027.get(row.name) ?? 0}">${firm2027.get(row.name) ?? 0}</td><td class="dk-num dk-hide-sm" data-sort="${shareOfFirm}">${shareOfFirm}%</td></tr>`;
      })
      .join("\n");

    const countHead = (label) =>
      `${plainTh("#", { num: true, width: "44px" })}${sortTh(label, 1, "text")}${sortTh("Ads", 2, "num", { num: true, active: true, dir: "desc", width: "100px" })}${sortTh("Share of interns", 3, "num", { num: true, width: "140px" })}`;
    const countRows = (rows, top = 15) =>
      rows
        .slice(0, top)
        .map(
          (row, i) =>
            `<tr><td class="dk-num" style="color:var(--dk-muted)">${i + 1}</td><td data-sort="${esc(row.name)}">${esc(row.name)}</td><td class="dk-num" data-sort="${row.count}">${row.count}</td><td class="dk-num" data-sort="${Math.round((row.count / interns.length) * 100)}">${share(row.count)}</td></tr>`,
        )
        .join("\n");

    const payHead = `${plainTh("#", { num: true, width: "44px" })}${sortTh("Firm", 1, "text")}${sortTh("Annualized base", 2, "num", { num: true, active: true, dir: "desc", width: "160px" })}`;
    const payRows = pay
      .map(
        (row, i) =>
          `<tr><td class="dk-num" style="color:var(--dk-muted)">${i + 1}</td><td data-sort="${esc(row.firm)}"><strong>${firmLink(row.firm)}</strong></td><td class="dk-num" data-sort="${row.salary}">$${row.salary.toLocaleString("en-US")}</td></tr>`,
      )
      .join("\n");

    // /internships is a live SPA view (InternshipsView). These tables ship
    // after #root in the built shell, so crawlers and no-JS visitors get the
    // full rankings while the interactive view owns the same URL.
    internshipsSeoSection = `    <section class="dk-container seo-shell" style="padding-top:8px;padding-bottom:8px">
      <h2 style="font:700 var(--dk-fs-l)/1.3 var(--dk-font);margin:32px 0 10px">Every firm hiring interns</h2>
      ${hint(`${interns.length} live internship ads across ${internFirms.size} firms. "Names 2027" counts ads with 2027 in the title; share is internships as a percentage of all the firm's live ads.`)}
      ${sortableTable(firmHead, firmRows)}
      ${attr}
      ${h2("What the internships are for")}
      ${hint("Skill areas: a named skill or a named tool counts an ad into an area, once. General-purpose languages (Python, C++, Linux, Excel) belong to no area; their raw counts are in the technology table below.")}
      ${sortableTable(countHead("Skill area"), countRows(areas, areas.length))}
      ${h2("Technology mentioned most")}
      ${hint("Programming languages and tools; each internship ad is counted once per item.")}
      ${sortableTable(countHead("Language or tool"), countRows(techRanks, 25))}
      ${h2("Where the internships are")}
      ${hint("Cities named in internship ads; an ad listing several cities counts once per city.")}
      ${sortableTable(countHead("City"), countRows(cities))}
      ${h2("Highest disclosed intern pay")}
      ${hint("Highest annualized base rate printed in an internship ad, USD. Annualized rate, not summer take-home pay.")}
      ${sortableTable(payHead, payRows)}
      <p class="dk-hint" style="margin-top:10px">${pay.length} of ${internFirms.size} firms print a figure; the rest are omitted, not zero.</p>
      <script src="${PREFIX}/oss-chart.js" defer></script>
    </section>`;
    console.log(`internships SEO tables: ${interns.length} ads, ${internFirms.size} firms`);
  }
}

// Live counts to replace the stale hardcoded numbers baked into the static shells.
const firmsWithLang = [...firms.values()].filter((f) => f.langs.size > 0).length;
const firmsWithLoc = [...firms.values()].filter((f) => f.locs.size > 0).length;
const jobsStr = jobs.length.toLocaleString();
// What the board itself shows: quant roles only, as src/jobData.js filters.
const boardStr = jobs.filter((j) => BOARD_ROLES.has(j.roleCategory)).length.toLocaleString();

// Head-term content: a real crawler-visible <h1> + intro + top-firm table for the
// SPA entry points. Placed with the footer after #root so it remains crawlable
// without becoming part of the React hydration tree.
const headRows = ranked
  .slice(0, 20)
  .map(
    (f, i) =>
      `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(f.name)}</td><td>${esc(FIRM_TYPE_LABEL[f.type] ?? "Other")}</td><td class="dk-num">${f.count}</td></tr>`,
  )
  .join("\n");
// Per-shell h1 + intro so the three head-term URLs don't share identical
// crawler-visible content (which would read as duplicate pages). The top-firm
// table below is shared supporting content; the heading and lede differentiate.
const HEAD_CONTENT = {
  "index.html": {
    h1: `Quant Jobs: ${firms.size} Firms Hiring Across ${jobsStr} Open Roles`,
    intro: `The most comprehensive quant job board: ${boardStr} open quant roles, updated daily, across ${firms.size} hedge funds, prop trading firms, market makers, and asset managers. The 20 firms with the most open postings are listed below; use the interactive board above to filter by role, language, location, and seniority.`,
  },
  "tech-stack.html": {
    h1: `Quant Tech Heatmap: Languages &amp; Tools Across ${firmsWithLang} Firms`,
    intro: `Which programming languages, frameworks, and accelerators quant firms hire for — across ${firmsWithLang} buy-side firms and ${jobsStr} open roles. Explore the interactive heatmap above; the firms with the most open roles are listed below.`,
  },
  "stacks.html": {
    h1: `Quant Tech Stack by Firm: Every Firm&#x27;s Stack, Layer by Layer`,
    intro: `Every firm&#x27;s hiring stack as language, data, and infra layers, built from how often the firm&#x27;s own postings name each technology. Browse the interactive cards above; the firms with the most open roles are listed below.`,
  },
  "locations.html": {
    h1: `Quant Jobs by Location: Where Hedge Funds &amp; Prop Shops Hire`,
    intro: `Where quant hiring happens — job-posting counts by city across ${firmsWithLoc} firms and ${jobsStr} open roles. Explore the interactive location heatmap above; the firms with the most open roles are listed below.`,
  },
};
const headSectionFor = (shell) => {
  const c = HEAD_CONTENT[shell] ?? HEAD_CONTENT["index.html"];
  return `    <section class="dk-container seo-shell" style="padding-top:28px;padding-bottom:8px">
      <h1 style="font:700 var(--dk-fs-xxl,1.6rem)/1.15 var(--dk-font,Inter,system-ui,sans-serif);letter-spacing:-0.02em;margin:0 0 10px">${c.h1}</h1>
      <p style="font:400 var(--dk-fs-l,1.05rem)/1.5 var(--dk-font,Inter,system-ui,sans-serif);color:var(--dk-muted,#666);max-width:70ch;margin:0 0 20px">${c.intro}</p>
      ${kitTable(`<th class="dk-num">#</th><th>Firm</th><th>Type</th><th class="dk-num">Open roles</th>`, headRows)}
      <p style="margin-top:16px"><a href="${PREFIX}/hiring">See all ${firms.size} firms ranked by open roles →</a> · <a href="${PREFIX}/salaries">Quant salaries</a></p>
    </section>`;
};

// The app pages render in full at build time, but the data behind them (every job, 3.9 MB of JSON) no longer rides
// inside each page: it is written once to a content-versioned file that the browser fetches after first paint and
// caches across pages, and the app hydrates when it arrives (src/main.jsx). The same pattern as the food prices
// site, which ships the first view and loads the rest from its CDN. Before, all five shells embedded the full set.
const pageDataBody = JSON.stringify(renderer.data);
const pageDataFile = `page-data.${createHash("sha256").update(pageDataBody).digest("hex").slice(0, 12)}.json`;
fs.writeFileSync(path.join(DIST, "data", pageDataFile), pageDataBody);
function renderShell(html, pathname) {
  const initialPage = { pathname, route: renderer.parseUrl(pathname, ""), data: renderer.data, stacks: renderer.stacks };
  const payload = JSON.stringify({ ...initialPage, data: undefined, dataUrl: `${PREFIX}/data/${pageDataFile}` }).replace(/</g, "\\u003c");
  const template = html.replace(/<div id="root">[\s\S]*?<\/div><script id="page-data" type="application\/json">[\s\S]*?<\/script>/, '<div id="root"></div>');
  return template.replace('<div id="root"></div>', () => `<div id="root">${renderer.renderPage(initialPage)}</div><script id="page-data" type="application/json">${payload}</script>`);
}

for (const shell of [
  "index.html",
  "tech-stack.html",
  "locations.html",
  "stacks.html",
  "internships.html",
  "about.html",
]) {
  const p = path.join(DIST, shell);
  if (!fs.existsSync(p)) continue;
  const pathname = PREFIX + (shell === "index.html" ? "" : "/" + shell.replace(/\.html$/, ""));
  const html = renderShell(fs.readFileSync(p, "utf8"), pathname);
  fs.writeFileSync(p, html);
}

for (const shell of ["index.html", "tech-stack.html", "locations.html", "stacks.html", "internships.html"]) {
  const p = path.join(DIST, shell);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, "utf8");
  // Refresh stale hardcoded firm/posting counts against live data.
  if (shell === "tech-stack.html") html = html.replace(/\b42\b/g, String(firmsWithLang)).replace(/3,900\+/g, jobsStr);
  if (shell === "locations.html") html = html.replace(/\b38\b/g, String(firmsWithLoc)).replace(/2,700\+/g, jobsStr);
  fs.writeFileSync(p, html);
}

// ── homepage shell: head-term title with live firm count ─────────────────────
// The static shell title said "Quant Hiring Trends ... 50+ ..." — it never
// targeted the "quant jobs" head term and the firm count had gone stale.
// Patch the built shell with the live count (function replacements: values may
// contain `$`, see renderRoute in the congress prerender for the war story).
{
  const p = path.join(DIST, "index.html");
  // The counts match what the board shows: quant roles only (src/jobData.js filters on QUANT_ROLES), rounded down to
  // the hundred and the ten so the head never overclaims between refreshes.
  const boardJobs = jobs.filter((j) => BOARD_ROLES.has(j.roleCategory));
  const roles = `${(Math.floor(boardJobs.length / 100) * 100).toLocaleString()}+`;
  const firmCount = `${Math.floor(new Set(boardJobs.map((j) => j.firmName)).size / 10) * 10}+`;
  const homeTitle = `Quant Jobs: The Most Comprehensive Quant Job Board, ${roles} Roles at ${firmCount} Firms`;
  let html = fs.readFileSync(p, "utf8");
  html = html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(homeTitle)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, (_m, a, b) => `${a}${esc("Quant Jobs: The Most Comprehensive Quant Job Board")}${b}`)
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/,
      (_m, a, b) => `${a}${esc(`${roles} open roles at ${firmCount} hedge funds, prop shops and market makers, updated daily. Filter, search and download.`)}${b}`,
    )
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      (_m, a, b) =>
        `${a}${esc(`The most comprehensive quant job board: ${roles} open roles at ${firmCount} hedge funds, prop trading firms, market makers and asset managers, updated daily. Filter by role, language, location and seniority, or download the open dataset.`)}${b}`,
    )
    .replace(
      /(<meta name="twitter:description" content=")[^"]*(")/,
      (_m, a, b) => `${a}${esc(`The most comprehensive quant job board: ${roles} open roles at ${firmCount} firms, updated daily.`)}${b}`,
    )
    // Homepage JSON-LD carries the same stale firm counts as the sub-page shells.
    .replace(/\b42 buy-side/g, `${firmsWithLang} buy-side`)
    .replace(/\b38 buy-side/g, `${firmsWithLoc} buy-side`);
  fs.writeFileSync(p, html);
}

// ── /stacks/tech/<slug> — who-hires-for lens pages ───────────────────────────
//
// Static twins of the interactive lens sub-routes (client-side pushState).
// One page per stack-qualifying technology, EXCEPT the eight legacy
// /tech/<slug> targets (python, cpp, ...) so the two page families never
// compete for the same query.
const stacksData = (() => {
  const sp = path.join(DIST, "data", "stacks.json");
  return fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, "utf8")) : { firms: [] };
})();
const LEGACY_TECH_PAGES = new Set(["Python", "C++", "Rust", "Java", "C#", "Go", "SQL", "FPGA"]);
const TECH_SLUG_SPECIAL = { "C++": "cpp", "C#": "csharp", ".NET": "dotnet", "kdb+/q": "kdb-q" };
const slugStackTech = (t) =>
  TECH_SLUG_SPECIAL[t] ??
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const stackTechFirms = new Map(); // tech -> [{firm, n, tagged}]
const stackHeavy = new Set();
for (const f of stacksData.firms) {
  for (const t of f.techs) {
    if (!stackTechFirms.has(t.t)) stackTechFirms.set(t.t, []);
    stackTechFirms.get(t.t).push({ firm: f.firm, n: t.n, tagged: f.tagged });
    if (t.n / Math.max(f.tagged, 1) >= 0.2) stackHeavy.add(t.t);
  }
}
let lensPages = 0;
for (const [tech, carriers] of stackTechFirms) {
  if (LEGACY_TECH_PAGES.has(tech)) continue;
  if (carriers.length < 2 && !stackHeavy.has(tech)) continue;
  const sorted = [...carriers].sort((a, b) => b.n / b.tagged - a.n / a.tagged);
  const rows = sorted
    .map(
      (c, i) =>
        `<tr><td class="dk-num">${i + 1}</td><td>${firmLink(c.firm)}</td><td class="dk-num">${c.n} of ${c.tagged}</td><td class="dk-num">${Math.round((c.n / c.tagged) * 100)}%</td></tr>`,
    )
    .join("\n");
  const slug = slugStackTech(tech);
  write(
    `/stacks/tech/${slug}`,
    page({
      pathname: `/stacks/tech/${slug}`,
      title: `Quant Firms Using ${tech} (${monthYear}): ${carriers.length} Firm${carriers.length === 1 ? "" : "s"} | Quant Jobs`,
      description: `${carriers.length} hedge fund${carriers.length === 1 ? "" : "s"}, prop shops, and market makers with ${tech} in their hiring stack, ranked by how much of their hiring names it. Live data from the firms' own job postings, updated daily.`,
      jsonLd: datasetLd(
        `Quant firms using ${tech}`,
        `${carriers.length} quant firms with ${tech} in their tech stack, from live job postings.`,
        `${BASE}/stacks/tech/${slug}`,
      ),
      h1: `Quant Firms Using ${tech}`,
      intro: `${carriers.length} quant firm${carriers.length === 1 ? "" : "s"} carr${carriers.length === 1 ? "ies" : "y"} <strong>${esc(tech)}</strong> in their hiring stack — counted from each firm's own live job postings. Share = how much of the firm's tech-tagged hiring names it. <a href="${PREFIX}/stacks">Explore the interactive stack matrix →</a>`,
      bodyHtml: `${kitTable(
        `<th class="dk-num">#</th><th>Firm</th><th class="dk-num">Postings naming it</th><th class="dk-num">Share</th>`,
        rows,
      )}
<a class="seo-cta" href="${PREFIX}/stacks">Browse every firm's full stack →</a>`,
    }),
  );
  lensPages++;
}
console.log(`stacks lens pages: ${lensPages}`);

// ── /stacks/* SPA shells ──────────────────────────────────────────────────────
//
// The matrix layer tabs, view routes, and firm cards are client-side routes;
// the proxy serves static files only, so a direct load 404s unless a file
// exists. Emit copies of the built stacks shell (absolute asset URLs, so they
// work from any depth) with route-specific title + canonical; the app parses
// the path on boot and lands on the right view.
const stacksShell = fs.readFileSync(path.join(DIST, "stacks.html"), "utf8");
const spaShell = (route, title) =>
  renderShell(stacksShell, PREFIX + route)
    .replace(/<title>[^<]*<\/title>/, `<title>${title} | Quant Jobs</title>`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${BASE}${route}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${BASE}${route}"`);
const SPA_ROUTES = [
  ["/stacks/languages", "The Language Stack at Quant Firms"],
  ["/stacks/data-ai", "The Data & AI Stack at Quant Firms"],
  ["/stacks/infra", "The Infrastructure Stack at Quant Firms"],
  ["/stacks/firms", "Tech Stacks by Firm"],
  ["/stacks/technologies", "Tech Stacks by Technology"],
];
const slugStackFirm = (f) =>
  f
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
for (const f of stacksData.firms) {
  SPA_ROUTES.push([`/stacks/firm/${slugStackFirm(f.firm)}`, `${f.firm} Tech Stack`]);
}
for (const [route, title] of SPA_ROUTES) write(route, spaShell(route, title));
console.log(`stacks SPA shells: ${SPA_ROUTES.length}`);

// ── sitemaps ──────────────────────────────────────────────────────────────────
//
// Segmented by page TYPE (not firm) so Search Console reports indexation per
// segment — the question we'll actually ask is "are the job pages indexed?".
//   sitemap.xml        index (same URL robots.txt already points at)
//   sitemap-core.xml   static SPA shells (from public/, has image extensions)
//   sitemap-pages.xml  aggregate SEO pages — live counts change daily, so a
//                      daily lastmod is honest here
//   sitemap-jobs.xml   job pages — lastmod = datePosted; a perpetual "today"
//                      lastmod is the pattern Google documents as ignored
const XMLH = `<?xml version="1.0" encoding="UTF-8"?>`;
const urlTag = ({ loc, lastmod, changefreq, priority }) =>
  `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${changefreq ? `<changefreq>${changefreq}</changefreq>` : ""}${priority ? `<priority>${priority}</priority>` : ""}</url>`;
const urlset = (rows) =>
  `${XMLH}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;

const aggregatePaths = written.filter((p) => !p.startsWith("/job/"));
fs.writeFileSync(
  path.join(DIST, "sitemap-pages.xml"),
  urlset(
    aggregatePaths.map((p) => urlTag({ loc: `${BASE}${p}`, lastmod: today, changefreq: "daily", priority: "0.8" })),
  ),
);
fs.writeFileSync(
  path.join(DIST, "sitemap-jobs.xml"),
  urlset(jobSitemapEntries.map((e) => urlTag({ loc: `${BASE}${e.path}`, lastmod: e.lastmod, priority: "0.6" }))),
);
// Overwrites the vite-copied file only if someone reintroduces public/sitemap.xml;
// robots.txt keeps pointing at /quant/sitemap.xml, which is now the index.
fs.writeFileSync(
  path.join(DIST, "sitemap.xml"),
  `${XMLH}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    "sitemap-core.xml",
    "sitemap-pages.xml",
    "sitemap-jobs.xml",
  ]
    .map((f) => `  <sitemap><loc>${BASE}/${f}</loc><lastmod>${today}</lastmod></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`,
);

console.log(`prerendered ${written.length} SEO pages (${jobPages} job pages + ${aggregatePaths.join(", ")})`);
console.log(`sitemaps: index + core + pages (${aggregatePaths.length}) + jobs (${jobSitemapEntries.length})`);

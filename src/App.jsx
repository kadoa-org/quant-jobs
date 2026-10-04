import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AboutPage from "./AboutPage";
import { EMPTY_FILTERS } from "./constants";
import Dashboard from "./Dashboard";
import DataTable from "./DataTable";
import FilterBar, { FIRM_FILTER_KEYS, JOB_FILTER_KEYS } from "./FilterBar";
import FirmsTable from "./FirmsTable";
import InternshipsView from "./InternshipsView";
import { Button, GitHubButton, LiveBadge, NavBar, SiteFooter, SiteHeader } from "./kit";
import LocationHeatmap from "./LocationHeatmap";
import PrerenderShell from "./PrerenderShell";
import StackCards from "./StackCards";
import { matchesAnySkillArea } from "./skillAreas";
import TechStackHeatmap from "./TechStackHeatmap";
import { useDatabase } from "./useDatabase";

import { readJobData } from "./jobData";

// Filter model lives in constants.js so every "clear all" covers every facet.



// /tech-stack and /locations are pre-rendered HTML pages with custom OG/SEO.
// All other views live under / and use ?view=... so a single HTML carries them.
// /heatmap is kept as a legacy alias for already-shared links.
// All paths are relative to the deploy prefix (import.meta.env.BASE_URL,
// "/quant/" in production, "/" in dev).
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

function viewFromPath(pathname) {
  const p = pathname.replace(/\/$/, "");
  if (p === `${BASE_PATH}/tech-stack` || p === `${BASE_PATH}/heatmap`) return "techstack";
  if (p === `${BASE_PATH}/locations`) return "locations";
  if (p === `${BASE_PATH}/internships`) return "internships";
  if (p === `${BASE_PATH}/about`) return "about";
  if (p === `${BASE_PATH}/stacks` || p.startsWith(`${BASE_PATH}/stacks/`)) return "stacks";
  // /job/<slug> pages are build-time static files, so in production this
  // branch never runs (the file wins). Vite dev has no dist, so its SPA
  // fallback lands here; show the Jobs table instead of defaulting to the
  // firms overview, which read as a broken click.
  if (p.startsWith(`${BASE_PATH}/job/`)) return "table";
  return null;
}

function pathForView(view) {
  if (view === "techstack") return `${BASE_PATH}/tech-stack`;
  if (view === "locations") return `${BASE_PATH}/locations`;
  if (view === "internships") return `${BASE_PATH}/internships`;
  if (view === "about") return `${BASE_PATH}/about`;
  if (view === "stacks") {
    // StackCards owns sub-routes (/stacks/tech/<slug>, /stacks/firm/<slug>,
    // /stacks/firms, /stacks/technologies); preserve them on URL sync.
    const cur = window.location.pathname.replace(/\/$/, "");
    return cur.startsWith(`${BASE_PATH}/stacks`) ? cur : `${BASE_PATH}/stacks`;
  }
  return `${BASE_PATH}/`;
}

// Read state from URL (path picks tech-stack/locations, then ?view=... for the rest)
export function parseUrl(pathname = window.location.pathname, search = window.location.search) {
  const params = new URLSearchParams(search);
  // Accept legacy "heatmap" view name from old shared URLs
  const queryView = params.get("view") === "heatmap" ? "techstack" : params.get("view");
  // Bare /quant/ lands on the Jobs table: the postings are the product, and
  // most inbound links (role pages, firm pages, Reddit) are looking for jobs,
  // not the firm treemap. ?view=firms still reaches the old default.
  const view = viewFromPath(pathname) || queryView || "table";
  const firm = params.get("firm") || null;
  const filters = { ...EMPTY_FILTERS };
  for (const key of Object.keys(EMPTY_FILTERS)) {
    const val = params.get(key);
    if (val) filters[key] = val.split(",");
  }
  const searchText = params.get("q") || "";
  // Which overview a drill-down came from, so the destination can offer a way
  // back. Carried in the URL so Back, Forward, and shared links all agree.
  const from = params.get("from") || null;
  return { view, firm, filters, search: searchText, from };
}

// Write state to URL params. Filter tweaks replace (no history spam); a
// deliberate drill-down pushes, so the browser Back button returns to the
// overview it came from.
function syncUrl(view, filters, selectedFirm, search, from, push) {
  const params = new URLSearchParams();
  // Path-routed views carry their own view; do not duplicate as ?view=.
  // "table" is the bare-URL default, so it is omitted too — and "firms" must
  // now be written explicitly or its URL would render the table instead.
  if (!["table", "techstack", "locations", "internships", "about", "stacks"].includes(view)) params.set("view", view);
  if (selectedFirm) params.set("firm", selectedFirm);
  for (const [key, values] of Object.entries(filters)) {
    if (values.length > 0) params.set(key, values.join(","));
  }
  if (search) params.set("q", search);
  if (from) params.set("from", from);
  const qs = params.toString();
  const path = pathForView(view);
  const url = qs ? `${path}?${qs}` : path;
  if (push && url !== `${window.location.pathname}${window.location.search}`) {
    window.history.pushState(null, "", url);
  } else {
    window.history.replaceState(null, "", url);
  }
}

// Top nav: Firms | Jobs | Insights. The Insights item works like GOV.UK's
// header Menu: a chevron toggle that expands a full-width panel in normal
// flow (pushes the page down, no floating popover), holding underlined links
// with one-line descriptions. Toggle-only close, like gov.uk.
function InsightsNav({ view, setView, onFirms }) {
  const [open, setOpen] = useState(false);
  const insightsActive = ["dashboard", "techstack", "locations", "stacks", "internships"].includes(view);

  const go = (k) => {
    setView(k);
    setOpen(false);
    if (k === "firms") onFirms();
  };
  const tab = (k, label) => (
    <a
      href={`#${k}`}
      aria-current={view === k ? "true" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        setOpen(false);
        go(k);
      }}
    >
      {label}
    </a>
  );

  const ITEMS = [
    { key: "dashboard", label: "Hiring insights", desc: "Roles, seniority, salaries and demand across all firms" },
    { key: "techstack", label: "Tech heatmap", desc: "Languages and tools by firm, the hiring heatmap" },
    { key: "stacks", label: "Tech stack", desc: "Browse each firm\u2019s stack as layers, from its own postings" },
    { key: "locations", label: "Locations", desc: "Where quant firms hire, city by city" },
    {
      key: "open-source",
      label: "Open source",
      desc: "Firms ranked by GitHub footprint",
      href: `${import.meta.env.BASE_URL}open-source/`,
    },
    { key: "internships", label: "Internships", desc: "Live intern market: firms, skills, cities, pay" },
  ];

  return (
    <>
      <nav className="dk-nav" aria-label="Primary">
        <div className="dk-container">
          <ul className="dk-nav-list">
            <li>{tab("table", "Jobs")}</li>
            <li>{tab("firms", "Firms")}</li>
            <li>
              <a
                href="#insights"
                aria-current={insightsActive && !open ? "true" : undefined}
                aria-expanded={open}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen((v) => !v);
                }}
                style={open ? { borderBottomColor: "var(--dk-link)", fontWeight: 600 } : undefined}
              >
                Insights{" "}
                <svg
                  width="11"
                  height="8"
                  viewBox="0 0 11 8"
                  aria-hidden="true"
                  style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 2, marginTop: -2 }}
                >
                  <path
                    d={open ? "M1 6.5 L5.5 2 L10 6.5" : "M1 1.5 L5.5 6 L10 1.5"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </a>
            </li>
            <li>{tab("about", "About")}</li>
          </ul>
        </div>
      </nav>
      {open && (
        <div className="bg-white border-b border-[#b1b4b6]">
          <div className="dk-container py-6">
            <div className="flex flex-wrap gap-x-10 gap-y-5">
              {ITEMS.map((it) =>
                it.href ? (
                  <div key={it.key} className="w-52">
                    <a href={it.href} className="text-[15px] font-semibold text-[#1d70b8] underline underline-offset-2">
                      {it.label}
                    </a>
                    <p className="mt-1 text-[13px] leading-snug text-[#505a5f]">{it.desc}</p>
                  </div>
                ) : (
                  <div key={it.key} className="w-52">
                    <a
                      href={`#${it.key}`}
                      className="text-[15px] font-semibold text-[#1d70b8] underline underline-offset-2"
                      style={{ fontWeight: view === it.key ? 700 : 600 }}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        go(it.key);
                      }}
                    >
                      {it.label}
                    </a>
                    <p className="mt-1 text-[13px] leading-snug text-[#505a5f]">{it.desc}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App({ initialPage = null }) {
  const { db, error } = useDatabase(!initialPage?.data);
  const [jobs, setJobs] = useState(initialPage?.data.jobs ?? []);
  const [firms, setFirms] = useState(initialPage?.data.firms ?? []);
  const [stats, setStats] = useState(initialPage?.data ? {} : null);

  // Init from URL
  const initial = useMemo(() => initialPage?.route ?? parseUrl(), []);
  const [view, setView] = useState(initial.view);
  const [filters, setFilters] = useState(initial.filters);
  const [selectedFirm, setSelectedFirm] = useState(initial.firm);
  const [search, setSearch] = useState(initial.search);
  const [from, setFrom] = useState(initial.from);
  // Set by a drill-down so the next URL sync pushes a history entry instead of
  // replacing one; reset immediately after, so filter edits stay replace-only.
  const pushNext = useRef(false);

  const urlReady = useRef(false);

  // Sync state to URL on change
  useEffect(() => {
    if (!urlReady.current) {
      urlReady.current = true;
      const next = parseUrl();
      setView(next.view); setFilters(next.filters); setSelectedFirm(next.firm); setSearch(next.search); setFrom(next.from);
      return;
    }
    syncUrl(view, filters, selectedFirm, search, from, pushNext.current);
    pushNext.current = false;
  }, [view, filters, selectedFirm, search, from]);

  // Back/Forward: the URL is the source of truth, so re-read it. Without this
  // the pushed drill-down entry would change the address bar but not the view.
  useEffect(() => {
    const onPop = () => {
      const next = parseUrl();
      setView(next.view);
      setFilters(next.filters);
      setSelectedFirm(next.firm);
      setSearch(next.search);
      setFrom(next.from);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A drill-down from an overview: push, and remember where it came from.
  const drillTo = useCallback((nextView, { filters: nextFilters, firm = null, source }) => {
    pushNext.current = true;
    setFilters({ ...EMPTY_FILTERS, ...nextFilters });
    setSelectedFirm(firm);
    setSearch("");
    setFrom(source ?? null);
    setView(nextView);
  }, []);

  // Nav clicks leave any drill-down context behind.
  const goView = useCallback((next) => {
    setFrom(null);
    setView(next);
  }, []);

  // Load data from SQLite
  useEffect(() => {
    if (!db) return;

    const data = readJobData(db);
    setJobs(data.jobs);
    setFirms(data.firms);
    setStats({});
  }, [db]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filters.firmTypes.length > 0 && !filters.firmTypes.includes(j.firmType)) return false;
      if (filters.roleCategories.length > 0 && !filters.roleCategories.includes(j.roleCategory)) return false;
      if (filters.seniorityLevels.length > 0 && !filters.seniorityLevels.includes(j.seniorityLevel)) return false;
      if (filters.workModes.length > 0 && !filters.workModes.includes(j.workMode)) return false;
      if (filters.locations.length > 0 && !j.locations.some((l) => filters.locations.includes(l))) return false;
      if (filters.assetClasses.length > 0 && !j.assetClasses.some((a) => filters.assetClasses.includes(a)))
        return false;
      // OR across selected skill areas: a posting in any of them qualifies.
      if (!matchesAnySkillArea(j, filters.skillAreas)) return false;
      // AND across selected technologies, case-insensitive across both tech
      // fields, so "kdb+/q" from the stacks page matches "KDB+/Q" in a posting.
      if (filters.technologies.length > 0) {
        const mine = [...(j.programmingLanguages ?? []), ...(j.technologies ?? [])].map((t) => t.toLowerCase());
        if (!filters.technologies.every((t) => mine.includes(t.toLowerCase()))) return false;
      }
      if (selectedFirm && j.firmName !== selectedFirm) return false;
      return true;
    });
  }, [jobs, filters, selectedFirm]);

  const filteredFirms = useMemo(() => {
    const firmMap = new Map();
    for (const j of filteredJobs) {
      if (!firmMap.has(j.firmName)) {
        const firm = firms.find((f) => f.firmName === j.firmName);
        if (firm) firmMap.set(j.firmName, { ...firm, totalJobs: 0 });
      }
      const f = firmMap.get(j.firmName);
      if (f) f.totalJobs++;
    }
    return [...firmMap.values()].sort((a, b) => b.totalJobs - a.totalJobs);
  }, [firms, filteredJobs]);

  const totalJobs = filteredJobs.length;
  const totalFirms = filteredFirms.length;

  // Each view places the filters under its own title and offers the ones that fit it.
  const filterBar = (keys) => (
    <FilterBar
      keys={keys}
      filters={filters}
      setFilters={setFilters}
      jobs={filteredJobs}
      allJobs={jobs}
      selectedFirm={selectedFirm}
      onClearFirm={() => setSelectedFirm(null)}
      onSelectFirm={setSelectedFirm}
    />
  );

  if (error) return <p role="alert" className="p-8">Could not load job data. Reload to try again.</p>;
  if (stats === null) return <PrerenderShell />;

  return (
    // The app locks to the viewport on desktop (inner views scroll themselves);
    // the SiteFooter sits OUTSIDE the locked container so it lives below the
    // fold like on the sibling microsites, instead of being pinned on screen.
    <>
      <div className="min-h-screen sm:min-h-dvh w-full flex flex-col">
        <SiteHeader
          brand="📊 Quant Jobs"
          brandHref={import.meta.env.BASE_URL}
          LinkComponent={(p) => <a {...p} />}
          brandSuffix={
            <a href="https://www.kadoa.com" target="_blank" rel="noreferrer" className="dk-header-link">
              by Kadoa
            </a>
          }
          right={
            <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <LiveBadge>Updated daily</LiveBadge>
              <GitHubButton repo="kadoa-org/quant-jobs" />
            </span>
          }
        />
        <InsightsNav view={view} setView={goView} onFirms={() => setSelectedFirm(null)} />

        {from === "internships" && view === "table" && (
          <div className="dk-container int-back">
            <button type="button" className="int-backlink" onClick={() => goView("internships")}>
              ← Back to all internships
            </button>
          </div>
        )}

        <main className="flex-1 relative">
          {view === "firms" && <FirmsTable jobs={filteredJobs} filters={filterBar(FIRM_FILTER_KEYS)} />}
          {view === "table" && (
            <div className="dk-container">
            {/* A job board opens on the list: title, one line of scope, then search and the table, as openquant,
                eFinancialCareers and Wellfound do. Market figures live on the Insights pages. */}
            <div className="home-intro">
              <h1 className="dk-h1">The most comprehensive quant job board</h1>
              <p className="home-lede">
                {filteredJobs.length.toLocaleString("en-US")} open roles at {new Set(filteredJobs.map((j) => j.firmName)).size} firms, updated daily.
              </p>
            </div>
            {filterBar(JOB_FILTER_KEYS)}
            <DataTable
              jobs={filteredJobs}
              search={search}
              onSearchChange={setSearch}
              onClearAll={() => setFilters({ ...EMPTY_FILTERS })}
            />
            </div>
          )}
          {view === "dashboard" && <Dashboard jobs={filteredJobs} firms={filteredFirms} stats={stats} filters={filterBar(JOB_FILTER_KEYS)} />}
          {view === "techstack" && <TechStackHeatmap jobs={jobs} />}
          {view === "stacks" && (
            <StackCards
              initialData={initialPage?.stacks}
              initialPath={initialPage?.pathname}
              jobs={jobs}
              onApply={(target, sel) => {
                setFilters((prev) => ({ ...prev, technologies: sel.technologies, firmTypes: sel.firmTypes }));
                setSelectedFirm(sel.firm ?? null);
                setView(target);
              }}
            />
          )}
          {view === "locations" && <LocationHeatmap jobs={jobs} />}
          {view === "internships" && (
            <InternshipsView
              jobs={jobs}
              onApply={(sel) =>
                drillTo("table", {
                  filters: {
                    seniorityLevels: ["intern"],
                    locations: sel.locations,
                    skillAreas: sel.skillAreas,
                  },
                  firm: sel.firm ?? null,
                  source: "internships",
                })
              }
            />
          )}
          {view === "about" && <AboutPage />}
        </main>
      </div>
      <SiteFooter current="quant" />
    </>
  );
}

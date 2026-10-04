import React, { useEffect, useMemo, useState } from "react";
import { FIRM_TYPE_LABELS } from "./constants";
import { FilterDropdown } from "./FilterBar";

// Per-firm stack cards: each firm's hiring stack as three layers of technology
// chips. A tech makes the card when the firm's own postings name it often
// enough to count (see buildStacks.mjs); raw counts stay one hover away.
//
// Filters mirror the Jobs view (same FilterDropdown): pick technologies to see
// only the firms whose stack carries ALL of them, pick a firm type, or jump
// straight to one firm. Clicking any chip flips to the "who hires for X" lens.

const BASE = import.meta.env.BASE_URL;
const STACKS_BASE = `${BASE.replace(/\/$/, "")}/stacks`;

// URL slugs for sub-routes. Specials cover names whose generic slug would
// collide or vanish (C++ -> "c"); everything else lowercases to kebab.
const TECH_SLUG_SPECIAL = { "C++": "cpp", "C#": "csharp", ".NET": "dotnet", "kdb+/q": "kdb-q" };
const slugTech = (t) =>
  TECH_SLUG_SPECIAL[t] ??
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const slugFirm = (f) =>
  f
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Matrix layer tabs: /stacks/languages, /stacks/data-ai, /stacks/infra.
const MATRIX_TABS = [
  { key: null, label: "All layers", sub: "" },
  { key: "languages", label: "Languages", sub: "/languages", layers: ["be"] },
  { key: "data-ai", label: "Data & AI", sub: "/data-ai", layers: ["data", "ai"] },
  { key: "infra", label: "Infra", sub: "/infra", layers: ["infra"] },
];

// /stacks -> matrix, /stacks/<layer-tab>, /stacks/firms, /stacks/technologies,
// /stacks/tech/<slug> (lens), /stacks/firm/<slug> (detail card)
function parseStacksRoute(pathname = typeof window === "undefined" ? STACKS_BASE : window.location.pathname) {
  const rest = pathname.replace(/\/$/, "").slice(STACKS_BASE.length);
  const seg = rest.split("/").filter(Boolean);
  if (seg[0] === "tech" && seg[1]) return { groupBy: "matrix", lensSlug: seg[1], firmSlug: null, layerTab: null };
  if (seg[0] === "firm" && seg[1]) return { groupBy: "matrix", lensSlug: null, firmSlug: seg[1], layerTab: null };
  if (seg[0] === "firms") return { groupBy: "firm", lensSlug: null, firmSlug: null, layerTab: null };
  if (seg[0] === "technologies") return { groupBy: "tech", lensSlug: null, firmSlug: null, layerTab: null };
  const tab = MATRIX_TABS.find((t) => t.key && t.key === seg[0]);
  return { groupBy: "matrix", lensSlug: null, firmSlug: null, layerTab: tab?.key ?? null };
}

// Matrix view: semantically clustered columns, same order as the shareable
// charts. Only techs in >=2 firms' stacks (or a single firm's main tech,
// e.g. OCaml at Jane Street) get a column; leftovers append per layer.
const MATRIX_CLUSTERS = {
  be: [
    ["Python", "C++", "Java", "C", "C#", "Rust", "Go"],
    ["SQL", "R", "MATLAB", "Julia", "VBA"],
    ["JavaScript", "TypeScript", "React", "Angular", ".NET"],
    ["OCaml", "CUDA", "Verilog/VHDL"],
  ],
  data: [
    ["Pandas", "NumPy", "Polars", "SciPy", "Arrow"],
    ["Kafka", "Airflow", "Spark", "Flink", "Hadoop", "dbt"],
    ["PostgreSQL", "MySQL", "SQL Server", "MongoDB", "Redis", "Elasticsearch", "ClickHouse", "kdb+/q"],
    ["Snowflake", "Databricks", "Iceberg", "Parquet"],
    ["Bloomberg", "Refinitiv", "FIX", "Aladdin"],
    ["Tableau", "Power BI"],
  ],
  ai: [
    ["PyTorch", "TensorFlow", "JAX", "scikit-learn"],
    ["Claude", "ChatGPT", "Copilot", "MCP"],
  ],
  infra: [
    ["Linux", "Windows", "PowerShell", "Bash"],
    ["AWS", "GCP", "Azure", "S3"],
    ["Kubernetes", "Docker"],
    ["Terraform", "Ansible", "CloudFormation"],
    ["Jenkins", "GitHub Actions", "GitLab CI"],
    ["Grafana", "Prometheus", "Splunk", "Datadog"],
    ["FPGA", "InfiniBand", "Slurm"],
  ],
};

const LAYER_LABEL = { be: "Languages", data: "Data", ai: "AI & ML", infra: "Infra" };
const LAYER_ORDER = ["be", "data", "ai", "infra"];
// GOV.UK Design System tag tints (govuk-tag--yellow/orange/blue/green):
// tinted background + dark text of the same hue, square corners.
const LAYER_TAG = {
  be: { bg: "#fcd6c3", fg: "#6e3619", mid: "#c0937c" },
  data: { bg: "#d2e2f1", fg: "#144e81", mid: "#6a95ba" },
  ai: { bg: "#dbd5e9", fg: "#3d2375", mid: "#8b79b1" },
  infra: { bg: "#cce2d8", fg: "#005a30", mid: "#5e9e81" },
};

function Chip({ tech, firmTagged, onClick, highlight }) {
  const tag = LAYER_TAG[tech.layer];
  return (
    <button
      type="button"
      className="stk-chip"
      style={{
        background: tag.bg,
        color: tag.fg,
        border: "1px solid transparent",
        ...(highlight ? { outline: "3px solid #ffdd00", outlineOffset: 0 } : {}),
      }}
      title={`${tech.t}: named in ${tech.n} of ${firmTagged} tech-tagged postings`}
      onClick={onClick}
    >
      {tech.t}
    </button>
  );
}

function Strata({ firm, onTech, highlightTechs, compact }) {
  const cap = compact ? 4 : 99;
  return (
    <div>
      {LAYER_ORDER.map((L) => {
        const inLayer = firm.techs.filter((t) => t.layer === L);
        // A filtered-for tech must be visible on the card that matched it,
        // even when it falls outside the compact top-4.
        const rows = inLayer.slice(0, cap).concat(inLayer.slice(cap).filter((t) => highlightTechs?.has(t.t)));
        return (
          <div key={L} className="stk-band">
            <span className="stk-bl" style={{ color: LAYER_TAG[L].fg }}>
              {LAYER_LABEL[L]}
            </span>
            <span className="stk-chips">
              {rows.length === 0 ? (
                <span className="stk-none">N/A</span>
              ) : (
                rows.map((t) => (
                  <Chip
                    key={t.t}
                    tech={t}
                    firmTagged={firm.tagged}
                    highlight={highlightTechs?.has(t.t)}
                    onClick={() => onTech(t.t)}
                  />
                ))
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function StackCards({ jobs = [], onApply, initialData, initialPath }) {
  const initialRoute = parseStacksRoute(initialPath);
  const [data, setData] = useState(initialData ?? null);
  const [error, setError] = useState(null);
  const [firmSel, setFirmSel] = useState(() => { const firm = initialData?.firms.find(f => slugFirm(f.firm) === initialRoute.firmSlug); return firm ? [firm.firm] : []; }); // FilterDropdown API: array
  const [typeSel, setTypeSel] = useState([]);
  const [techSel, setTechSel] = useState([]);
  const [lensTech, setLensTech] = useState(null); // chip-click "who hires for X" lens
  const [openFilter, setOpenFilter] = useState(null);
  const [groupBy, setGroupBy] = useState(() => initialRoute.groupBy); // "matrix" | "firm" | "tech"
  const [layerTab, setLayerTab] = useState(() => initialRoute.layerTab); // null = all layers

  useEffect(() => {
    if (initialData) return;
    fetch(`${BASE}data/stacks.json`)
      .then((r) => { if (!r.ok) throw new Error(`stacks.json: ${r.status}`); return r.json(); })
      .then(setData)
      .catch(error => { console.error("Quant stacks load failed", error); setError(error); });
  }, [initialData]);

  // Sub-routes: push on navigation, re-apply on back/forward and direct load.
  const navTo = (sub) => {
    window.history.pushState(null, "", `${STACKS_BASE}${sub}${window.location.search}`);
  };
  const applyRoute = (route, firmList) => {
    setGroupBy(route.groupBy);
    setLayerTab(route.layerTab ?? null);
    if (route.lensSlug) {
      const all = new Set();
      for (const f of firmList) for (const t of f.techs) all.add(t.t);
      const match = [...all].find((t) => slugTech(t) === route.lensSlug);
      setLensTech(match ?? null);
      setFirmSel([]);
    } else if (route.firmSlug) {
      const f = firmList.find((x) => slugFirm(x.firm) === route.firmSlug);
      setLensTech(null);
      setFirmSel(f ? [f.firm] : []);
    } else {
      setLensTech(null);
      setFirmSel([]);
    }
  };
  const routeReady = data !== null;
  useEffect(() => {
    if (!routeReady) return;
    const firmList = data?.firms ?? [];
    applyRoute(parseStacksRoute(), firmList);
    const onPop = () => applyRoute(parseStacksRoute(), firmList);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [routeReady]);

  const firms = data?.firms ?? [];

  const firmOptions = useMemo(() => firms.map((f) => ({ value: f.firm, label: f.firm, count: f.tagged })), [firms]);
  const typeOptions = useMemo(() => {
    const counts = new Map();
    for (const f of firms) if (f.firmType) counts.set(f.firmType, (counts.get(f.firmType) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => ({ value: v, label: FIRM_TYPE_LABELS[v] || v, count: c }));
  }, [firms]);
  const techOptions = useMemo(() => {
    // Count = firms with the tech in their stack, so the number beside the
    // option is the number of cards you will get.
    const counts = new Map();
    for (const f of firms) for (const t of f.techs) counts.set(t.t, (counts.get(t.t) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [firms]);

  const toggle = (key) => setOpenFilter(openFilter === key ? null : key);
  const clearAll = () => {
    setFirmSel([]);
    setTypeSel([]);
    setTechSel([]);
    setLensTech(null);
    navTo(groupBy === "firm" ? "/firms" : groupBy === "tech" ? "/technologies" : "");
  };
  const activeCount = firmSel.length + typeSel.length + techSel.length + (lensTech ? 1 : 0);

  const pickLens = (t) => {
    setLensTech(t);
    setFirmSel([]);
    setOpenFilter(null);
    navTo(`/tech/${slugTech(t)}`);
    window.scrollTo(0, 0);
  };
  const pickFirm = (name) => {
    setLensTech(null);
    setFirmSel([name]);
    navTo(`/firm/${slugFirm(name)}`);
    window.scrollTo(0, 0);
  };
  const pickGroup = (g) => {
    setGroupBy(g);
    setLayerTab(null);
    navTo(g === "firm" ? "/firms" : g === "tech" ? "/technologies" : "");
  };
  const pickLayerTab = (tab) => {
    setLayerTab(tab.key);
    setGroupBy("matrix");
    navTo(tab.sub);
  };

  // Same matching rule App.filteredJobs applies, so the button's count equals
  // what the Jobs view will show after the handoff.
  const matchingJobs = useMemo(() => {
    if (!activeCount) return 0;
    const wanted = techSel.map((t) => t.toLowerCase());
    return jobs.filter((j) => {
      if (firmSel.length === 1 && j.firmName !== firmSel[0]) return false;
      if (typeSel.length && !typeSel.includes(j.firmType)) return false;
      if (wanted.length) {
        const mine = [...(j.programmingLanguages ?? []), ...(j.technologies ?? [])].map((t) => t.toLowerCase());
        if (!wanted.every((t) => mine.includes(t))) return false;
      }
      return true;
    }).length;
  }, [jobs, firmSel, typeSel, techSel, activeCount]);

  if (error) return <p role="alert">Could not load tech stack data.</p>;
  if (!data) return <div aria-busy="true" className="bg-gray-100 min-h-[520px] p-6"><p role="status">Loading stacks…</p></div>;

  const techSet = new Set(techSel);
  const visible = firms.filter((f) => {
    if (firmSel.length && !firmSel.includes(f.firm)) return false;
    if (typeSel.length && !typeSel.includes(f.firmType)) return false;
    // AND across selected technologies: every one must be in the firm's stack.
    for (const t of techSel) {
      if (!f.techs.some((x) => x.t === t)) return false;
    }
    return true;
  });

  const detailFirm = firmSel.length === 1 && !lensTech ? visible.find((f) => f.firm === firmSel[0]) : null;

  // Technology index (StackShare-style): every tech that made any visible
  // firm's card, with the firms that carry it. Counted, grouped by layer.
  const techIndex = new Map();
  for (const f of visible) {
    for (const t of f.techs) {
      const e = techIndex.get(t.t) ?? { t: t.t, layer: t.layer, firms: [] };
      e.firms.push({ firm: f.firm, n: t.n, tagged: f.tagged });
      techIndex.set(t.t, e);
    }
  }
  const layerRows = (L) =>
    [...techIndex.values()]
      .filter((e) => e.layer === L)
      .sort((a, b) => b.firms.length - a.firms.length)
      .map((e) => ({ ...e, firms: [...e.firms].sort((a, b) => b.n / b.tagged - a.n / a.tagged) }));

  // Matrix columns: intersect the cluster order with what the data carries.
  const layerCarry = {};
  const layerHeavy = {};
  for (const f of firms) {
    for (const t of f.techs) {
      layerCarry[t.layer] = layerCarry[t.layer] ?? {};
      layerCarry[t.layer][t.t] = (layerCarry[t.layer][t.t] ?? 0) + 1;
      if (t.n / Math.max(f.tagged, 1) >= 0.2) {
        (layerHeavy[t.layer] = layerHeavy[t.layer] ?? new Set()).add(t.t);
      }
    }
  }
  const activeTab = MATRIX_TABS.find((t) => t.key === layerTab) ?? MATRIX_TABS[0];
  const shownLayers = activeTab.layers ?? LAYER_ORDER;
  const matrixGroups0 = LAYER_ORDER.filter((L) => shownLayers.includes(L)).map((L) => {
    const qualifies = new Set(
      Object.entries(layerCarry[L] ?? {})
        .filter(([t, n]) => n >= 2 || layerHeavy[L]?.has(t))
        .map(([t]) => t),
    );
    const clustered = new Set(MATRIX_CLUSTERS[L].flat());
    const clusters = MATRIX_CLUSTERS[L].map((c) => c.filter((t) => qualifies.has(t))).filter((c) => c.length);
    const leftovers = [...qualifies].filter((t) => !clustered.has(t)).sort();
    if (leftovers.length) clusters.push(leftovers);
    return { layer: L, clusters };
  });
  const matrixGroups = matrixGroups0.filter((g) => g.clusters.length);
  // With a layer tab active, hide firms with nothing in the shown columns.
  const matrixCols = new Set(matrixGroups.flatMap((g) => g.clusters.flat()));
  const matrixVisible = layerTab ? visible.filter((f) => f.techs.some((t) => matrixCols.has(t.t))) : visible;

  const maxLensShare = lensTech
    ? Math.max(
        ...firms.map((f) => {
          const hit = f.techs.find((t) => t.t === lensTech);
          return hit ? hit.n / f.tagged : 0;
        }),
        0.0001,
      )
    : 1;

  const lensFirms = lensTech
    ? firms
        .map((f) => ({ f, hit: f.techs.find((t) => t.t === lensTech) }))
        .filter((x) => x.hit && (!typeSel.length || typeSel.includes(x.f.firmType)))
        .sort((a, b) => b.hit.n / b.f.tagged - a.hit.n / a.f.tagged)
    : [];

  // Same bar, chips, and interactions as the Jobs/Firms FilterBar: pills show
  // the selection (firm name, or a count segment), each carries an inline x to
  // clear just itself, and the bar spans full width under the nav.
  const chipClass = (active) =>
    `flex items-center gap-1 h-[22px] text-[12px] sm:text-[13.5px] font-normal bg-white border transition-colors whitespace-nowrap ${
      active
        ? "border-[#d4d4d4] text-[#191919]"
        : "border-[#d4d4d4] text-[#5c5c5f] hover:text-[#191919] hover:border-[#b0b0b0]"
    }`;
  const closeIcon = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
  const setterFor = (key) => (key === "firm" ? setFirmSel : key === "type" ? setTypeSel : setTechSel);
  const multiPill = (key, label, selected, options) => (
    <div className="relative" key={key}>
      <button type="button" onClick={() => toggle(key)} className={chipClass(selected.length > 0)}>
        <span className="px-[6px]">{label}</span>
        {selected.length > 0 && (
          <>
            <span className="border-l border-[#d4d4d4] px-[6px] text-[#5c5c5f]">{selected.length}</span>
            <span
              className="border-l border-[#d4d4d4] px-[5px] text-[#9c9ca0] hover:text-[#191919] cursor-pointer flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                setterFor(key)([]);
              }}
            >
              {closeIcon}
            </span>
          </>
        )}
      </button>
      {openFilter === key && (
        <FilterDropdown
          options={options}
          selected={selected}
          onChange={(v) => {
            setterFor(key)(v);
            setLensTech(null);
          }}
          onClose={() => setOpenFilter(null)}
        />
      )}
    </div>
  );

  return (
    <div className="stk">
      <div className="border-b border-black/[0.04] bg-[#fcfcfc] relative z-[100]">
      <div className="dk-container flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 py-[5px]">
        <div className="relative">
          <button type="button" onClick={() => toggle("firm")} className={chipClass(firmSel.length > 0)}>
            <span className="px-[6px]">{firmSel[0] || "Firm"}</span>
            {firmSel.length > 0 && (
              <span
                className="border-l border-[#d4d4d4] px-[5px] text-[#9c9ca0] hover:text-[#191919] cursor-pointer flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setFirmSel([]);
                }}
              >
                {closeIcon}
              </span>
            )}
          </button>
          {openFilter === "firm" && (
            <FilterDropdown
              options={firmOptions}
              selected={firmSel}
              singleSelect
              onChange={(v) => {
                setFirmSel(v);
                setLensTech(null);
                setOpenFilter(null);
              }}
              onClose={() => setOpenFilter(null)}
            />
          )}
        </div>
        {multiPill("type", "Firm type", typeSel, typeOptions)}
        {multiPill("tech", "Technology", techSel, techOptions)}
        {activeCount > 0 && (
          <button type="button" onClick={clearAll} className="text-[12px] text-[#9c9ca0] hover:text-[#191919] ml-1">
            Clear all
          </button>
        )}
      </div>
      </div>

      <div className="dk-container pt-6 pb-16">
        <div className="stk-head">
          <h1 className="dk-h1">Tech stack</h1>
          {!lensTech && !detailFirm && (
            <nav className="stk-subnav" aria-label="Group stacks">
              <button
                type="button"
                aria-current={groupBy === "matrix" ? "page" : undefined}
                className={`stk-subnav-item${groupBy === "matrix" ? " stk-subnav-on" : ""}`}
                onClick={() => pickGroup("matrix")}
              >
                Matrix
              </button>
              <button
                type="button"
                aria-current={groupBy === "firm" ? "page" : undefined}
                className={`stk-subnav-item${groupBy === "firm" ? " stk-subnav-on" : ""}`}
                onClick={() => pickGroup("firm")}
              >
                By firm
              </button>
              <button
                type="button"
                aria-current={groupBy === "tech" ? "page" : undefined}
                className={`stk-subnav-item${groupBy === "tech" ? " stk-subnav-on" : ""}`}
                onClick={() => pickGroup("tech")}
              >
                By technology
              </button>
            </nav>
          )}
        </div>

        {activeCount > 0 && !lensTech && onApply && (
          <p className="stk-results">
            <b>{visible.length.toLocaleString()}</b> firm{visible.length === 1 ? "" : "s"} and{" "}
            <b>{matchingJobs.toLocaleString()}</b> open job{matchingJobs === 1 ? "" : "s"} match these filters.{" "}
            <button
              type="button"
              className="stk-link"
              onClick={() => onApply("table", { technologies: techSel, firmTypes: typeSel, firm: firmSel[0] ?? null })}
            >
              Show the jobs
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="stk-link"
              onClick={() => onApply("firms", { technologies: techSel, firmTypes: typeSel, firm: null })}
            >
              Show the firms
            </button>
          </p>
        )}

        {lensTech ? (
          <div>
            <h2 className="stk-tech-h">
              Who hires for{" "}
              <span
                className="stk-chip"
                style={(() => {
                  const tag = LAYER_TAG[firms.flatMap((f) => f.techs).find((t) => t.t === lensTech)?.layer] ?? {
                    bg: "#f3f2f1",
                    fg: "#383f43",
                  };
                  return { background: tag.bg, color: tag.fg, border: `2px solid ${tag.fg}`, fontWeight: 700 };
                })()}
              >
                {lensTech}
              </span>
              {"?"}
            </h2>
            <div className="stk-tech-list">
              {lensFirms.map(({ f, hit }) => (
                <div key={f.firm} className="stk-tech-row">
                  <button
                    type="button"
                    className="stk-firmlink"
                    onClick={() => pickFirm(f.firm)}
                  >
                    {f.firm}
                  </button>
                  <span className="dk-hint stk-count">
                    {hit.n} of {f.tagged} postings
                  </span>
                  <span className="stk-lens-track">
                    <span
                      className="stk-lens-bar"
                      style={{
                        width: `${Math.max(Math.round(((hit.n / f.tagged) / maxLensShare) * 100), 3)}%`,
                        background: (LAYER_TAG[hit.layer] ?? LAYER_TAG.data).mid,
                      }}
                    />
                  </span>
                  {onApply && (
                    <button
                      type="button"
                      className="stk-link stk-lens-jobs"
                      onClick={() => onApply("table", { technologies: [lensTech], firmTypes: [], firm: f.firm })}
                    >
                      Show jobs
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : detailFirm ? (
          <div className="stk-detail">
            <div className="stk-detail-head">
              <h2>{detailFirm.firm}</h2>
              <span className="dk-hint">
                {FIRM_TYPE_LABELS[detailFirm.firmType] || ""} · {detailFirm.tagged} tech-tagged postings
                {detailFirm.deep ? " · deep-extracted" : ""}
              </span>
            </div>
            <Strata firm={detailFirm} onTech={pickLens} highlightTechs={techSet} />
          </div>
        ) : groupBy === "matrix" ? (
          <div>
            <div className="stk-mx-tabs">
              {MATRIX_TABS.map((tab) => (
                <button
                  key={tab.key ?? "all"}
                  type="button"
                  aria-current={layerTab === tab.key ? "page" : undefined}
                  className={`stk-mx-tab${layerTab === tab.key ? " stk-mx-tab-on" : ""}`}
                  onClick={() => pickLayerTab(tab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          <div className="stk-mx-scroll">
            <table className="stk-mx">
              <thead>
                <tr>
                  <th className="stk-mx-corner" />
                  {matrixGroups.map((g) => (
                    <th
                      key={g.layer}
                      colSpan={g.clusters.reduce((s2, c) => s2 + c.length, 0)}
                      className="stk-mx-grp"
                      style={{ color: LAYER_TAG[g.layer].fg, borderBottom: `3px solid ${LAYER_TAG[g.layer].fg}` }}
                    >
                      {LAYER_LABEL[g.layer]}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="stk-mx-corner" />
                  {matrixGroups.flatMap((g, gi) =>
                    g.clusters.flatMap((cluster, ci) =>
                      cluster.map((t, ti) => (
                        <th
                          key={t}
                          className={`stk-mx-tech${ti === 0 && !(gi === 0 && ci === 0) ? (ci === 0 ? " stk-mx-divx" : " stk-mx-div") : ""}`}
                        >
                          <button type="button" className="stk-mx-techbtn" onClick={() => pickLens(t)} title={`Who hires for ${t}?`}>
                            <span>{t}</span>
                          </button>
                        </th>
                      )),
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {matrixVisible.map((f) => {
                  const byt = new Map(f.techs.map((t) => [t.t, t]));
                  return (
                    <tr key={f.firm}>
                      <td className="stk-mx-firm">
                        <button type="button" className="stk-firmlink" onClick={() => pickFirm(f.firm)}>
                          {f.firm}
                        </button>
                      </td>
                      {matrixGroups.flatMap((g, gi) =>
                        g.clusters.flatMap((cluster, ci) =>
                          cluster.map((t, ti) => {
                            const e = byt.get(t);
                            const div = ti === 0 && !(gi === 0 && ci === 0) ? (ci === 0 ? " stk-mx-divx" : " stk-mx-div") : "";
                            if (!e) return <td key={t} className={`stk-mx-cell${div}`} />;
                            return (
                              <td key={t} className={`stk-mx-cell${div}`}>
                                <button
                                  type="button"
                                  className="stk-mx-sq"
                                  style={{
                                    background: LAYER_TAG[g.layer].mid,
                                    ...(techSet.has(t) ? { outline: "3px solid #ffdd00", outlineOffset: 0 } : {}),
                                  }}
                                  title={`${t}: named in ${e.n} of ${f.tagged} tech-tagged postings`}
                                  onClick={() => pickLens(t)}
                                />
                              </td>
                            );
                          }),
                        ),
                      )}
                    </tr>
                  );
                })}
                {matrixVisible.length === 0 && (
                  <tr>
                    <td className="stk-mx-firm">
                      <span className="dk-hint">No firm matches those filters.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        ) : groupBy === "tech" ? (
          <div>
            {LAYER_ORDER.map((L) => {
              const rows = layerRows(L);
              if (rows.length === 0) return null;
              return (
                <section key={L} className="stk-idx-section">
                  <h2 className="stk-idx-h" style={{ color: LAYER_TAG[L].fg }}>
                    {LAYER_LABEL[L]}
                  </h2>
                  <div className="stk-tech-list">
                    {rows.map((e) => (
                      <div key={e.t} className="stk-tech-row">
                        <button
                          type="button"
                          className="stk-chip"
                          style={{
                            background: LAYER_TAG[e.layer].bg,
                            color: LAYER_TAG[e.layer].fg,
                            border: "1px solid transparent",
                            justifySelf: "start",
                            ...(techSet.has(e.t) ? { outline: "3px solid #ffdd00", outlineOffset: 0 } : {}),
                          }}
                          onClick={() => pickLens(e.t)}
                        >
                          {e.t}
                        </button>
                        <span className="dk-hint stk-count">
                          {e.firms.length} firm{e.firms.length === 1 ? "" : "s"}
                        </span>
                        <span className="stk-idx-firms">
                          {e.firms.slice(0, 8).map((x, i) => (
                            <React.Fragment key={x.firm}>
                              {i > 0 && <span className="stk-idx-sep"> · </span>}
                              <button type="button" className="stk-firmlink-sm" onClick={() => setFirmSel([x.firm])}>
                                {x.firm}
                              </button>
                            </React.Fragment>
                          ))}
                          {e.firms.length > 8 && (
                            <button type="button" className="stk-link stk-idx-more" onClick={() => pickLens(e.t)}>
                              +{e.firms.length - 8} more
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="stk-grid">
            {visible.map((f) => (
              <div key={f.firm} className="stk-card">
                <div className="stk-card-head">
                  <button type="button" className="stk-firmlink" onClick={() => pickFirm(f.firm)}>
                    {f.firm}
                  </button>
                  <span className="dk-hint">{f.tagged} postings</span>
                </div>
                <Strata firm={f} onTech={pickLens} highlightTechs={techSet} compact />
              </div>
            ))}
            {visible.length === 0 && (
              <p className="dk-hint">No firm matches those filters. Try removing a technology.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

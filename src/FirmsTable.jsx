import React, { useMemo, useState } from "react";
import { FIRM_TYPE_LABELS } from "./constants";

// Firms as a ranked, sortable table, like the jobs list it sits next to. The treemap it replaces showed relative
// size well but made every other question (how many roles exactly, how many new, where, what pay) a hover.
// Each firm links to its careers page on this site; filters above narrow the table like the jobs list.
const DAY_MS = 86400000;
const firmSlug = (name) =>
  name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const COLUMNS = [
  { key: "name", label: "Firm", numeric: false },
  { key: "type", label: "Type", numeric: false, hide: "hidden sm:table-cell" },
  { key: "count", label: "Open roles", numeric: true },
  { key: "fresh", label: "New in 30 days", numeric: true, hide: "hidden md:table-cell" },
  { key: "interns", label: "Internships", numeric: true, hide: "hidden md:table-cell" },
  { key: "pay", label: "Median base", numeric: true, hide: "hidden lg:table-cell" },
  { key: "cities", label: "Top locations", numeric: false, hide: "hidden lg:table-cell" },
];

export default function FirmsTable({ jobs, filters }) {
  const [sort, setSort] = useState({ key: "count", dir: "desc" });
  const rows = useMemo(() => {
    const newest = jobs.reduce((m, j) => (j.datePosted && j.datePosted > m ? j.datePosted : m), "");
    const ref = newest ? Date.parse(`${newest}T00:00:00Z`) : Date.now();
    const byFirm = new Map();
    for (const j of jobs) {
      if (!byFirm.has(j.firmName)) byFirm.set(j.firmName, []);
      byFirm.get(j.firmName).push(j);
    }
    return [...byFirm.entries()].map(([name, list]) => {
      const dated = list.filter((j) => j.datePosted);
      const cities = new Map();
      for (const j of list) for (const l of j.locations || []) cities.set(l, (cities.get(l) || 0) + 1);
      return {
        name,
        slug: firmSlug(name),
        type: FIRM_TYPE_LABELS[list[0].firmType] ?? "Other",
        count: list.length,
        // Firms that publish no posting dates get no "new" figure rather than a misleading zero.
        fresh: dated.length ? dated.filter((j) => ref - Date.parse(`${j.datePosted}T00:00:00Z`) < 30 * DAY_MS).length : null,
        interns: list.filter((j) => j.seniorityLevel === "intern").length,
        pay: median(list.map((j) => j.salary).filter((v) => typeof v === "number" && v > 0)),
        cities: [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c).join(", "),
      };
    });
  }, [jobs]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      // Missing values (no dates, no pay) sort last in either direction.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, sort]);

  const toggle = (key, numeric) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: numeric ? "desc" : "asc" }));

  return (
    <div className="firms-table dk-container">
      <div className="home-intro">
        <h1 className="dk-h1">Quant firms</h1>
        <p className="home-lede">
          {rows.length} quant firms, ranked by open roles. Updated daily.
        </p>
      </div>
      {filters}
      <div className="dk-table-wrap firms-table__wrap">
        <table className="dk-table">
          <thead>
            <tr>
              <th className="dk-num" style={{ width: 44 }}>#</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`${c.numeric ? "dk-num" : ""} ${c.hide ?? ""}`}
                  aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" className="firms-table__sort" onClick={() => toggle(c.key, c.numeric)}>
                    {c.label}
                    <span aria-hidden="true">{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : " ↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.name}>
                <td className="dk-num" style={{ color: "var(--dk-muted)" }}>{i + 1}</td>
                <td><a href={`/quant/firm/${r.slug}`}>{r.name}</a></td>
                <td className="hidden sm:table-cell">{r.type}</td>
                <td className="dk-num">{r.count}</td>
                <td className="dk-num hidden md:table-cell">{r.fresh ?? <span title="This firm's postings carry no date">–</span>}</td>
                <td className="dk-num hidden md:table-cell">{r.interns || ""}</td>
                <td className="dk-num hidden lg:table-cell">{r.pay ? `$${Math.round(r.pay / 1000)}k` : ""}</td>
                <td className="hidden lg:table-cell">{r.cities}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

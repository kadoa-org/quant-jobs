import React, { useMemo, useRef, useState } from "react";
import { ROLE_LABELS, SENIORITY_LABELS, WORK_MODE_LABELS } from "./constants";
import { byAddedInterleaved } from "./jobOrder";

// Dates as "25 Nov 2026", on one line; the ISO date stays in the data and the CSV export. Absolute, not "2 days
// ago": the page is prerendered once a day and hydrated later, and a relative date would change between the two.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const govDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const salaryText = (s) => (s ? `$${(s / 1000).toFixed(0)}k` : "");

const COLUMNS = [
  { key: "firmName", label: "Firm", cls: "w-32" },
  { key: "jobTitle", label: "Job", cls: "" },
  { key: "locations", label: "Location", cls: "w-36" },
  { key: "seniorityLevel", label: "Seniority", cls: "w-28" },
  { key: "salary", label: "Salary", cls: "w-24" },
  { key: "dateAdded", label: "Added", cls: "w-32" },
];

function JobLink({ j, className }) {
  // Titles link to our own /job/<slug>/ page (full description and Apply button); the posting itself is the fallback
  // for the few without a prerendered page.
  if (j.slug) return <a className={className} href={`${import.meta.env.BASE_URL}job/${j.slug}/`}>{j.jobTitle || "View posting"}</a>;
  if (j.url || j.applyUrl)
    return <a className={className} href={j.url || j.applyUrl} target="_blank" rel="noreferrer">{j.jobTitle || "View posting"}</a>;
  return <span>{j.jobTitle || "Untitled posting"}</span>;
}

export default function DataTable({ jobs, onClearAll, hasQuery, onClearQuery }) {
  const [sortBy, setSortBy] = useState("dateAdded");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const topRef = useRef(null);
  const pageSize = 50;

  const sorted = useMemo(() => {
    if (sortBy === "dateAdded" && sortOrder === "desc") return byAddedInterleaved(jobs);
    const value = (j) => {
      if (sortBy === "salary") return j.salary || 0;
      if (sortBy === "locations") return j.locations[0] || "";
      if (sortBy === "seniorityLevel") return SENIORITY_LABELS[j.seniorityLevel] || "";
      return j[sortBy] || "";
    };
    return [...jobs].sort((a, b) => {
      const va = value(a), vb = value(b);
      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [jobs, sortBy, sortOrder]);

  // A new search or filter starts again on page 1.
  const [seen, setSeen] = useState(jobs);
  if (seen !== jobs) {
    setSeen(jobs);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortOrder(col === "dateAdded" || col === "salary" ? "desc" : "asc");
    }
    setPage(1);
  };

  const goPage = (p) => {
    setPage(p);
    topRef.current?.scrollIntoView({ block: "start" });
  };

  const meta = (j) =>
    [j.locations.slice(0, 2).join(", "), WORK_MODE_LABELS[j.workMode], SENIORITY_LABELS[j.seniorityLevel], salaryText(j.salary)].filter(Boolean);

  return (
    <div className="jobs" ref={topRef}>
      <div className="jobs__bar">
        <p className="jobs__count" aria-live="polite">
          <strong>{sorted.length.toLocaleString("en-US")}</strong> {sorted.length === 1 ? "job" : "jobs"}
        </p>
      </div>

      {sorted.length > 0 && (
        <>
          {/* Phone: one card per job, every field visible, no sideways scrolling. */}
          <ol className="job-cards">
            {paged.map((j) => (
              <li key={j.id} className="job-card">
                <JobLink j={j} className="job-link job-card__title" />
                <span className="job-card__firm">{j.firmName}</span>
                <span className="job-card__meta">{meta(j).join(" · ")}</span>
                {j.dateAdded && <span className="job-card__date">Added {govDate(j.dateAdded)}</span>}
              </li>
            ))}
          </ol>

          <table className="jobs-table">
            <caption className="cmdk-sr">Open quant roles, {sortBy === "dateAdded" ? "newest first" : "sorted"}</caption>
            <thead>
              <tr>
                {COLUMNS.map(({ key, label, cls }) => (
                  <th key={key} scope="col" className={cls} aria-sort={sortBy === key ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}>
                    <button type="button" className="firms-table__sort" onClick={() => toggleSort(key)}>
                      {label}
                      <span aria-hidden="true" className="jobs-table__arrow">
                        {sortBy === key ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((j) => (
                <tr key={j.id}>
                  <td>{j.firmName}</td>
                  <td>
                    <JobLink j={j} className="job-link" />
                    <span className="jobs-table__role">{ROLE_LABELS[j.roleCategory] || j.roleCategory}</span>
                    {j.programmingLanguages.length > 0 && (
                      <span className="jobs-table__tags">
                        {j.programmingLanguages.slice(0, 3).map((l) => (
                          <span key={l} className="jobs-table__tag">{l}</span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="jobs-table__muted">
                    {j.locations.slice(0, 2).join(", ")}
                    {WORK_MODE_LABELS[j.workMode] && <span className="jobs-table__sub">{WORK_MODE_LABELS[j.workMode]}</span>}
                  </td>
                  <td className="jobs-table__muted">{SENIORITY_LABELS[j.seniorityLevel] || ""}</td>
                  <td className="jobs-table__num">{salaryText(j.salary) || <span className="jobs-table__none">Not listed</span>}</td>
                  <td className="jobs-table__muted jobs-table__nowrap">{govDate(j.dateAdded) || <span className="jobs-table__none">Unknown</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className="jobs__pages" aria-label="Pages">
            <span>
              Page {page} of {totalPages}
            </span>
            <span className="jobs__pagebtns">
              {page > 1 && (
                <button type="button" className="jobs__pagebtn" onClick={() => goPage(page - 1)}>
                  ← Previous page
                </button>
              )}
              {page < totalPages && (
                <button type="button" className="jobs__pagebtn" onClick={() => goPage(page + 1)}>
                  Next page →
                </button>
              )}
            </span>
          </nav>
        </>
      )}

      {sorted.length === 0 && (
        <div className="jobs__empty">
          <p className="jobs__empty-title">No matching jobs</p>
          <p>{hasQuery ? "Try fewer words, another place, or fewer filters." : "No jobs match the selected filters."}</p>
          <button
            type="button"
            className="jobs__pagebtn"
            onClick={() => {
              onClearQuery?.();
              onClearAll?.();
            }}
          >
            Clear search and filters
          </button>
        </div>
      )}
    </div>
  );
}

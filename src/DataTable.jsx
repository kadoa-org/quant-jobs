import React, { useMemo, useState } from "react";

// GOV.UK dates, "25 Sep 2026", on one line; the ISO date stays in the data and the CSV export.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const govDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
import { ROLE_LABELS, SENIORITY_LABELS } from "./constants";

export default function DataTable({ jobs, search: externalSearch, onSearchChange, onClearAll }) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch = onSearchChange || setInternalSearch;
  // Newest first: sorted by firm name, the first screen was a wall of AQR postings from February.
  const [sortBy, setSortBy] = useState("datePosted");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(
      (j) =>
        j.jobTitle.toLowerCase().includes(q) ||
        j.firmName.toLowerCase().includes(q) ||
        j.locations.some((l) => l.toLowerCase().includes(q)) ||
        j.programmingLanguages.some((l) => l.toLowerCase().includes(q)) ||
        j.skills.some((s) => s.toLowerCase().includes(q)),
    );
  }, [jobs, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case "salary":
          va = a.salary || 0;
          vb = b.salary || 0;
          break;
        case "datePosted":
          va = a.datePosted || "";
          vb = b.datePosted || "";
          break;
        default:
          va = a[sortBy] || "";
          vb = b[sortBy] || "";
      }
      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortBy, sortOrder]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (col) => {
    if (sortBy === col) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const sortIcon = (col) => (sortBy !== col ? "" : sortOrder === "asc" ? " ^" : " v");

  const exportCsv = () => {
    const headers = ["Firm", "Title", "Role", "Location", "Seniority", "Salary", "Languages", "Date Posted"];
    const rows = sorted.map((j) => [
      j.firmName,
      j.jobTitle,
      ROLE_LABELS[j.roleCategory] || j.roleCategory,
      j.locations.join("; "),
      SENIORITY_LABELS[j.seniorityLevel] || j.seniorityLevel,
      j.salary || "",
      j.programmingLanguages.join(", "),
      j.datePosted || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quant-jobs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 sm:gap-3 py-2.5 border-b border-gray-100 sticky top-11 sm:static z-20 bg-white">
        <input
          type="text"
          placeholder="Search jobs, firms, skills..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 min-w-0 bg-gray-50 border border-gray-200  px-3 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
        />
        <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">{filtered.length} results</span>
        <button
          onClick={exportCsv}
          className="px-2 sm:px-3 py-1.5  text-[11px] text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 whitespace-nowrap flex-shrink-0"
        >
          <span className="hidden sm:inline">Export </span>CSV
        </button>
      </div>

      <div className="">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-[#fcfcfc] z-10">
            <tr className="text-[#5c5c5f] border-b border-[#b1b4b6]">
              {[
                { key: "firmName", label: "Firm", w: "w-28 sm:w-36" },
                { key: "jobTitle", label: "Title", w: "w-48 sm:w-64" },
                { key: "roleCategory", label: "Role", w: "w-24 sm:w-28", hide: "hidden sm:table-cell" },
                { key: "locations", label: "Location", w: "w-24 sm:w-28" },
                { key: "seniorityLevel", label: "Seniority", w: "w-20", hide: "hidden md:table-cell" },
                { key: "salary", label: "Salary", w: "w-16", hide: "hidden md:table-cell" },
                { key: "programmingLanguages", label: "Languages", w: "w-32", hide: "hidden lg:table-cell" },
                { key: "datePosted", label: "Posted", w: "w-28", hide: "hidden lg:table-cell" },
              ].map(({ key, label, w, hide }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`${w} ${hide || ""} px-3 sm:px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none`}
                >
                  {label}
                  {sortIcon(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((j) => (
              <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 sm:px-4 py-2.5 text-gray-900 font-medium">{j.firmName}</td>
                <td className="px-3 sm:px-4 py-2.5">
                  {/* Titles link to our own /job/<slug>/ page (full description +
                      Apply button) so the site is the hub; external URL is the
                      fallback for the few postings without a prerendered page. */}
                  {j.slug ? (
                    <a
                      href={`${import.meta.env.BASE_URL}job/${j.slug}/`}
                      className="text-violet-600 hover:text-violet-700 hover:underline underline-offset-2"
                    >
                      {j.jobTitle || "View posting"}
                    </a>
                  ) : j.url || j.applyUrl ? (
                    <a
                      href={j.url || j.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-600 hover:text-violet-700 hover:underline underline-offset-2"
                    >
                      {j.jobTitle || "View posting"}
                    </a>
                  ) : (
                    <span className="text-gray-500">{j.jobTitle || "-"}</span>
                  )}
                </td>
                <td className="hidden sm:table-cell px-3 sm:px-4 py-2.5 text-gray-500">
                  {ROLE_LABELS[j.roleCategory] || j.roleCategory}
                </td>
                <td className="px-3 sm:px-4 py-2.5 text-gray-500">{j.locations.slice(0, 2).join(", ")}</td>
                <td className="hidden md:table-cell px-3 sm:px-4 py-2.5 text-gray-500">
                  {SENIORITY_LABELS[j.seniorityLevel] || j.seniorityLevel}
                </td>
                <td className="hidden md:table-cell px-3 sm:px-4 py-2.5 text-gray-500">
                  {j.salary ? `$${(j.salary / 1000).toFixed(0)}k` : "-"}
                </td>
                <td className="hidden lg:table-cell px-3 sm:px-4 py-2.5">
                  {j.programmingLanguages.slice(0, 3).map((l) => (
                    <span
                      key={l}
                      className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mr-1 mb-0.5 text-[10px]"
                    >
                      {l}
                    </span>
                  ))}
                </td>
                <td className="hidden lg:table-cell px-3 sm:px-4 py-2.5 text-gray-500 whitespace-nowrap">{govDate(j.datePosted) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="text-[15px] font-semibold text-gray-900 m-0">No matching roles</p>
            <p className="text-[13px] text-gray-500 mt-1.5 mb-4">
              {/* Name the narrower cause: jobs is already filter-narrowed
                  upstream, so an empty `jobs` means the filters did it, while
                  a non-empty `jobs` filtered to nothing here means the search. */}
              {jobs.length === 0 ? "No postings match the selected filters." : `No postings match “${search}”.`}
            </p>
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
                onClearAll?.();
              }}
              className="px-4 py-1.5 text-[13px] border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Clear search{onClearAll ? " and filters" : ""}
            </button>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="flex items-center justify-between py-2 border-t border-gray-100 text-[12px] text-gray-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1  border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1  bg-[#191919] text-white border border-[#191919] hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

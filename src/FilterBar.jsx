import React, { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_FILTERS, FIRM_TYPE_LABELS, ROLE_LABELS, SENIORITY_LABELS, SENIORITY_ORDER, WORK_MODE_LABELS } from "./constants";
import { matchesSkillArea, SKILL_AREA_NAMES } from "./skillAreas";

export const PAY_OPTIONS = [
  { value: "listed", label: "Shows a salary" },
  { value: "150000", label: "$150k or more" },
  { value: "200000", label: "$200k or more" },
  { value: "300000", label: "$300k or more" },
];
export const meetsPay = (j, value) => Boolean(j.salary) && (value === "listed" || j.salary >= Number(value));

export function FilterDropdown({ options, selected, onChange, onClose, singleSelect }) {
  const ref = useRef(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose(true);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-[200] bg-white border border-[#e0e0e0]  shadow-lg min-w-[220px] sm:min-w-[280px] max-h-[60vh] sm:max-h-[400px] flex flex-col overflow-hidden"
    >
      {options.length > 6 && (
        <div className="px-3 py-2 border-b border-[#f0f0f0]">
          <input
            ref={inputRef}
            type="text"
            aria-label="Filter the options"
            placeholder="Filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-[16px] text-[#191919] placeholder:text-[#b0b0b0] outline-none bg-transparent"
          />
        </div>
      )}
      <div className="overflow-y-auto py-1">
        {filtered.map(({ value, label, count }) => {
          const isSelected = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (singleSelect) {
                  onChange(isSelected ? [] : [value]);
                } else {
                  onChange(isSelected ? selected.filter((v) => v !== value) : [...selected, value]);
                }
              }}
              className="w-full flex items-center justify-between px-3 min-h-[44px] text-[16px] transition-colors hover:bg-[#f3f2f1]"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Checkboxes where several options can be chosen, radios where only one can, left of the label. */}
                <span className={`opt-mark${singleSelect ? " opt-mark--radio" : ""}${isSelected ? " opt-mark--on" : ""}`} aria-hidden="true" />
                <span
                  className={`truncate ${isSelected ? "text-[#191919] font-medium" : "text-[#191919]"}`}
                  title={label}
                >
                  {label}
                </span>
              </div>
              <span className="text-[16px] text-[#6f777b] ml-4 flex-shrink-0">{count}</span>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="px-3 py-2 text-[16px] text-[#6f777b]">No results</div>}
      </div>
    </div>
  );
}

// `keys` picks the filters a page offers, in order. The jobs list offers all of them; the firms table only those that
// describe a firm's hiring (a firm filter, skill area and asset class describe single postings, not firms).
// The jobs list leads with what people filter by most on job boards: role, seniority, work mode and pay.
export const JOB_FILTER_KEYS = ["roleCategories", "seniorityLevels", "workModes", "pay", "locations", "firm", "firmTypes", "technologies", "skillAreas", "assetClasses"];
export const FIRM_FILTER_KEYS = ["firmTypes", "roleCategories", "seniorityLevels", "locations", "technologies"];

export default function FilterBar({ filters, setFilters, jobs, facetJobs, selectedFirm, onClearFirm, onSelectFirm, allJobs, keys = JOB_FILTER_KEYS, collapsible = false }) {
  const [openFilter, setOpenFilter] = useState(null);
  // On a phone the jobs page folds its filters behind one button, so the first screen shows jobs, not ten buttons.
  const [shown, setShown] = useState(false);

  const toggle = (key) => setOpenFilter(openFilter === key ? null : key);
  const updateFilter = (key) => (values) => setFilters((prev) => ({ ...prev, [key]: values }));

  // Each group counts its options without its own selection (see matchesFilters in App.jsx).
  const pool = (key) => (facetJobs ? facetJobs(key) : jobs);

  const firmOptions = useMemo(() => {
    const source = facetJobs ? facetJobs("firm") : allJobs || jobs;
    const counts = {};
    for (const j of source) counts[j.firmName] = (counts[j.firmName] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ value: name, label: name, count }));
  }, [allJobs, jobs, facetJobs]);

  const firmTypeOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("firmTypes")) counts[j.firmType] = (counts[j.firmType] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ value: type, label: FIRM_TYPE_LABELS[type] || type, count }));
  }, [jobs, facetJobs]);

  const roleOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("roleCategories")) counts[j.roleCategory] = (counts[j.roleCategory] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ value: role, label: ROLE_LABELS[role] || role, count }));
  }, [jobs, facetJobs]);

  const seniorityOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("seniorityLevels")) counts[j.seniorityLevel] = (counts[j.seniorityLevel] || 0) + 1;
    return SENIORITY_ORDER.filter((s) => counts[s]).map((s) => ({
      value: s,
      label: SENIORITY_LABELS[s],
      count: counts[s],
    }));
  }, [jobs, facetJobs]);

  const locationOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("locations")) for (const loc of j.locations) counts[loc] = (counts[loc] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([loc, count]) => ({ value: loc, label: loc, count }));
  }, [jobs, facetJobs]);

  const technologyOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs)
      for (const x of [...(j.programmingLanguages || []), ...(j.technologies || [])]) counts[x] = (counts[x] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([x, count]) => ({ value: x, label: x, count }));
  }, [jobs]);

  // Areas with no matching posting are dropped, so the list never offers a
  // filter that returns nothing.
  const skillAreaOptions = useMemo(() => {
    return SKILL_AREA_NAMES.map((name) => ({
      value: name,
      label: name,
      count: pool("skillAreas").filter((j) => matchesSkillArea(j, name)).length,
    }))
      .filter((o) => o.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [jobs, facetJobs]);

  // Salary is one choice: any posting that shows one, or a floor. Counts follow the other filters, like every option.
  const payOptions = useMemo(
    () =>
      PAY_OPTIONS.map(({ value, label }) => ({ value, label, count: pool("pay").filter((j) => meetsPay(j, value)).length })).filter(
        (o) => o.count > 0,
      ),
    [jobs, facetJobs],
  );

  const workModeOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("workModes")) if (WORK_MODE_LABELS[j.workMode]) counts[j.workMode] = (counts[j.workMode] || 0) + 1;
    return Object.keys(WORK_MODE_LABELS)
      .filter((m) => counts[m])
      .map((m) => ({ value: m, label: WORK_MODE_LABELS[m], count: counts[m] }));
  }, [jobs, facetJobs]);

  const assetClassOptions = useMemo(() => {
    const counts = {};
    for (const j of pool("assetClasses")) for (const ac of j.assetClasses || []) counts[ac] = (counts[ac] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ac, count]) => ({ value: ac, label: ac, count }));
  }, [jobs, facetJobs]);

  const activeCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0) + (selectedFirm ? 1 : 0);

  const allConfigs = {
    firmTypes: { label: "Firm type", options: firmTypeOptions },
    roleCategories: { label: "Role", options: roleOptions },
    seniorityLevels: { label: "Seniority", options: seniorityOptions },
    workModes: { label: "Work mode", options: workModeOptions },
    locations: { label: "Location", options: locationOptions },
    technologies: { label: "Technology", options: technologyOptions },
    skillAreas: { label: "Skill area", options: skillAreaOptions },
    assetClasses: { label: "Asset class", options: assetClassOptions },
  };

  // Buttons that read as controls, not tags: 16px text, a visible border and a chevron, the selected count in the label.
  const chipClass = (active) =>
    `filter-chip${active ? " filter-chip--active" : ""}`;
  const chevron = (
    <svg width="10" height="7" viewBox="0 0 11 8" aria-hidden="true" className="filter-chip__chev">
      <path d="M1 1.5 L5.5 6 L10 1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );


  const labelFor = {
    firmTypes: (v) => FIRM_TYPE_LABELS[v] || v,
    roleCategories: (v) => ROLE_LABELS[v] || v,
    seniorityLevels: (v) => SENIORITY_LABELS[v] || v,
    workModes: (v) => WORK_MODE_LABELS[v] || v,
    pay: (v) => PAY_OPTIONS.find((o) => o.value === v)?.label ?? v,
  };
  const selectedTags = [
    ...(keys.includes("firm") && selectedFirm ? [{ key: "firm", value: selectedFirm, label: selectedFirm }] : []),
    ...keys
      .filter((k) => k !== "firm")
      .flatMap((k) => (filters[k] || []).map((v) => ({ key: k, value: v, label: (labelFor[k] || ((x) => x))(v) }))),
  ];
  const removeTag = ({ key, value }) => {
    if (key === "firm") onClearFirm?.();
    else updateFilter(key)(filters[key].filter((v) => v !== value));
  };

  const dropdownButton = (key, label, active, content) => (
    <div key={key} className="relative">
      <button
        type="button"
        id={`filter-${key}`}
        onClick={() => toggle(key)}
        className={chipClass(active)}
        aria-expanded={openFilter === key}
        aria-haspopup="true"
      >
        <span>{label}</span>
        {chevron}
      </button>
      {openFilter === key && content}
    </div>
  );
  const closeAndFocus = (key) => (refocus) => {
    setOpenFilter(null);
    if (refocus === true) document.getElementById(`filter-${key}`)?.focus();
  };

  return (
    <div className={`filter-wrap${collapsible ? " filter-wrap--collapsible" : ""}${shown ? " filter-wrap--shown" : ""}`}>
      {collapsible && (
        <button type="button" className="filter-toggle" aria-expanded={shown} aria-controls="job-filters" onClick={() => setShown(!shown)}>
          {shown ? "Hide filters" : "Filters"}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      )}
      <div className="filter-bar" id="job-filters">
        <span className="filter-bar__label">Filter by</span>
        {keys.map((key) => {
          if (key === "firm")
            return dropdownButton(
              "firm",
              selectedFirm ? "Firm (1)" : "Firm",
              !!selectedFirm,
              <FilterDropdown
                options={firmOptions}
                selected={selectedFirm ? [selectedFirm] : []}
                singleSelect
                onChange={(values) => {
                  onSelectFirm?.(values.length > 0 ? values[0] : null);
                  setOpenFilter(null);
                }}
                onClose={closeAndFocus("firm")}
              />,
            );
          if (key === "pay")
            return dropdownButton(
              "pay",
              filters.pay.length ? "Salary (1)" : "Salary",
              filters.pay.length > 0,
              <FilterDropdown
                options={payOptions}
                selected={filters.pay}
                singleSelect
                onChange={(values) => {
                  updateFilter("pay")(values);
                  setOpenFilter(null);
                }}
                onClose={closeAndFocus("pay")}
              />,
            );
          const config = allConfigs[key];
          if (!config) return null;
          const n = filters[key].length;
          return dropdownButton(
            key,
            `${config.label}${n > 0 ? ` (${n})` : ""}`,
            n > 0,
            <FilterDropdown options={config.options} selected={filters[key]} onChange={updateFilter(key)} onClose={closeAndFocus(key)} />,
          );
        })}
      </div>

      {selectedTags.length > 0 && (
        <div className="filter-tags">
          <span className="filter-bar__label">Selected</span>
          {selectedTags.map((t) => (
            <button key={`${t.key}:${t.value}`} type="button" className="filter-tag" onClick={() => removeTag(t)}>
              <span className="cmdk-sr">Remove filter: </span>
              {t.label}
              <span aria-hidden="true" className="filter-tag__x">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilters({ ...EMPTY_FILTERS });
              onClearFirm?.();
            }}
            className="filter-bar__clear"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

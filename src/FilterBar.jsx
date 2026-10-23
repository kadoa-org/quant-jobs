import React, { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_FILTERS, FIRM_TYPE_LABELS, ROLE_LABELS, SENIORITY_LABELS, SENIORITY_ORDER } from "./constants";
import { matchesSkillArea, SKILL_AREA_NAMES } from "./skillAreas";

export function FilterDropdown({ options, selected, onChange, onClose, singleSelect }) {
  const ref = useRef(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
              onClick={() => {
                if (singleSelect) {
                  onChange(isSelected ? [] : [value]);
                } else {
                  onChange(isSelected ? selected.filter((v) => v !== value) : [...selected, value]);
                }
              }}
              className="w-full flex items-center justify-between px-3 h-[38px] text-[16px] transition-colors hover:bg-[#f5f5f5]"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {!singleSelect && (
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-[#5e6ad2] border-[#5e6ad2]" : "border-[#d4d4d4]"
                    }`}
                  >
                    {isSelected && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                        <path d="M1.5 4L3 5.5L6.5 2" />
                      </svg>
                    )}
                  </div>
                )}
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
export const JOB_FILTER_KEYS = ["firm", "firmTypes", "roleCategories", "seniorityLevels", "locations", "technologies", "skillAreas", "assetClasses"];
export const FIRM_FILTER_KEYS = ["firmTypes", "roleCategories", "seniorityLevels", "locations", "technologies"];

export default function FilterBar({ filters, setFilters, jobs, selectedFirm, onClearFirm, onSelectFirm, allJobs, keys = JOB_FILTER_KEYS }) {
  const [openFilter, setOpenFilter] = useState(null);

  const toggle = (key) => setOpenFilter(openFilter === key ? null : key);
  const updateFilter = (key) => (values) => setFilters((prev) => ({ ...prev, [key]: values }));

  const firmOptions = useMemo(() => {
    const source = allJobs || jobs;
    const counts = {};
    for (const j of source) counts[j.firmName] = (counts[j.firmName] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ value: name, label: name, count }));
  }, [allJobs, jobs]);

  const firmTypeOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs) counts[j.firmType] = (counts[j.firmType] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ value: type, label: FIRM_TYPE_LABELS[type] || type, count }));
  }, [jobs]);

  const roleOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs) counts[j.roleCategory] = (counts[j.roleCategory] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ value: role, label: ROLE_LABELS[role] || role, count }));
  }, [jobs]);

  const seniorityOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs) counts[j.seniorityLevel] = (counts[j.seniorityLevel] || 0) + 1;
    return SENIORITY_ORDER.filter((s) => counts[s]).map((s) => ({
      value: s,
      label: SENIORITY_LABELS[s],
      count: counts[s],
    }));
  }, [jobs]);

  const locationOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs) for (const loc of j.locations) counts[loc] = (counts[loc] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([loc, count]) => ({ value: loc, label: loc, count }));
  }, [jobs]);

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
      count: jobs.filter((j) => matchesSkillArea(j, name)).length,
    }))
      .filter((o) => o.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [jobs]);

  const assetClassOptions = useMemo(() => {
    const counts = {};
    for (const j of jobs) for (const ac of j.assetClasses || []) counts[ac] = (counts[ac] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([ac, count]) => ({ value: ac, label: ac, count }));
  }, [jobs]);

  const activeCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0) + (selectedFirm ? 1 : 0);

  const allConfigs = {
    firmTypes: { label: "Firm type", options: firmTypeOptions },
    roleCategories: { label: "Role", options: roleOptions },
    seniorityLevels: { label: "Seniority", options: seniorityOptions },
    locations: { label: "Location", options: locationOptions },
    technologies: { label: "Technology", options: technologyOptions },
    skillAreas: { label: "Skill area", options: skillAreaOptions },
    assetClasses: { label: "Asset class", options: assetClassOptions },
  };
  const filterConfigs = keys.filter((k) => allConfigs[k]).map((key) => ({ key, ...allConfigs[key] }));

  // Buttons that read as controls, not tags: 16px text, a visible border and a chevron, the selected count in the label.
  const chipClass = (active) =>
    `filter-chip${active ? " filter-chip--active" : ""}`;
  const chevron = (
    <svg width="10" height="7" viewBox="0 0 11 8" aria-hidden="true" className="filter-chip__chev">
      <path d="M1 1.5 L5.5 6 L10 1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );

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

  return (
    <div className="filter-bar">
      <span className="filter-bar__label">Filter by</span>
      {/* Firm single-select */}
      {keys.includes("firm") && <div className="relative">
        <button onClick={() => toggle("firm")} className={chipClass(!!selectedFirm)}>
          <span>{selectedFirm || "Firm"}</span>
          {!selectedFirm && chevron}
          {selectedFirm && (
            <span
              className="filter-chip__clear" aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onClearFirm();
              }}
            >
              {closeIcon}
            </span>
          )}
        </button>
        {openFilter === "firm" && (
          <FilterDropdown
            options={firmOptions}
            selected={selectedFirm ? [selectedFirm] : []}
            singleSelect
            onChange={(values) => {
              const newFirm = values.length > 0 ? values[0] : null;
              if (onSelectFirm) onSelectFirm(newFirm);
              setOpenFilter(null);
            }}
            onClose={() => setOpenFilter(null)}
          />
        )}
      </div>}

      {/* Multi-select filters */}
      {filterConfigs.map(({ key, label, options }) => (
        <div key={key} className="relative">
          <button onClick={() => toggle(key)} className={chipClass(filters[key].length > 0)}>
            <span>{label}{filters[key].length > 0 ? ` (${filters[key].length})` : ""}</span>
            {filters[key].length === 0 && chevron}
            {filters[key].length > 0 && (
              <>
                <span
                  className="filter-chip__clear" aria-label="Clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFilter(key)([]);
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
              selected={filters[key]}
              onChange={updateFilter(key)}
              onClose={() => setOpenFilter(null)}
            />
          )}
        </div>
      ))}

      {activeCount > 0 && (
        <button
          onClick={() => {
            setFilters({ ...EMPTY_FILTERS });
            if (onClearFirm) onClearFirm();
          }}
          className="filter-bar__clear"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

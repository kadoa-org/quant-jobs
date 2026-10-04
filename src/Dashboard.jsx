import React, { useMemo } from "react";
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  FIRM_TYPE_COLORS,
  FIRM_TYPE_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  SENIORITY_LABELS,
  SENIORITY_ORDER,
} from "./constants";

function countBy(arr, fn) {
  const c = {};
  for (const x of arr) {
    const k = fn(x);
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

function countArrayItems(arr, fn) {
  const c = {};
  for (const x of arr) for (const v of fn(x)) c[v] = (c[v] || 0) + 1;
  return c;
}

function toSorted(obj, limit = 20) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const tooltipStyle = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 11,
  color: "#374151",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
};

// ChartCard lives in lib/ChartCard.jsx, shared with /locations.
// so both views have identical card chrome. Edit there to update both.
import { KeyFigures } from "./kit";
import { ChartCard } from "./lib/ChartCard";

export default function Dashboard({ jobs, firms, filters }) {
  // --- Tech stack by firm type ---
  const techByFirmType = useMemo(() => {
    const types = ["proprietary", "hedge_fund", "asset_manager"];
    const langs = ["Python", "C++", "Java", "Rust", "R", "SQL", "KDB+/Q"];
    return langs.map((lang) => {
      const row = { name: lang };
      for (const type of types) {
        const firmJobs = jobs.filter((j) => j.firmType === type);
        const withLang = firmJobs.filter((j) => j.programmingLanguages.includes(lang));
        row[type] = firmJobs.length > 0 ? Math.round((withLang.length / firmJobs.length) * 100) : 0;
      }
      return row;
    });
  }, [jobs]);

  // --- PhD demand by firm (top 10) ---
  const phdByFirm = useMemo(() => {
    return firms
      .filter((f) => f.totalJobs >= 15)
      .map((f) => ({
        name: f.firmName,
        phdPct: f.phdDemandPct || 0,
        firmType: f.firmType,
      }))
      .sort((a, b) => b.phdPct - a.phdPct)
      .slice(0, 10);
  }, [firms]);

  // --- Role distribution ---
  const roleData = useMemo(() => {
    const counts = countBy(jobs, (j) => j.roleCategory);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: ROLE_LABELS[name] || name, value, key: name }));
  }, [jobs]);

  // --- Seniority ---
  const seniorityData = useMemo(() => {
    const counts = countBy(jobs, (j) => j.seniorityLevel);
    return SENIORITY_ORDER.filter((s) => counts[s]).map((s) => ({ name: SENIORITY_LABELS[s], value: counts[s] }));
  }, [jobs]);

  // --- Top locations ---
  const locationData = useMemo(
    () =>
      toSorted(
        countArrayItems(jobs, (j) => j.locations),
        12,
      ),
    [jobs],
  );

  // --- Programming languages overall ---
  const languageData = useMemo(
    () =>
      toSorted(
        countArrayItems(jobs, (j) => j.programmingLanguages),
        12,
      ),
    [jobs],
  );

  // --- Technologies ---
  const techData = useMemo(
    () =>
      toSorted(
        countArrayItems(jobs, (j) => j.technologies),
        12,
      ),
    [jobs],
  );

  // --- Education ---
  const educationData = useMemo(() => {
    const counts = countBy(jobs, (j) => j.educationRequirement);
    const labels = {
      not_specified: "Not Specified",
      bachelors: "Bachelors",
      masters: "Masters",
      phd_preferred: "PhD Preferred",
      phd_required: "PhD Required",
    };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: labels[name] || name, value }));
  }, [jobs]);

  // --- Asset classes ---
  const assetClassData = useMemo(
    () =>
      toSorted(
        countArrayItems(jobs, (j) => j.assetClasses),
        10,
      ),
    [jobs],
  );

  // --- Stats ---
  const salaries = jobs.filter((j) => j.salary).map((j) => j.salary);
  const medianSalary = salaries.length > 0 ? median(salaries) : null;
  const latestPosted = jobs.reduce((max, j) => (j.datePosted && j.datePosted > max ? j.datePosted : max), "");
  const fmtDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const pythonJobs = jobs.filter((j) => j.programmingLanguages?.includes("Python")).length;
  const cppJobs = jobs.filter((j) => j.programmingLanguages?.includes("C++")).length;
  const phdPct =
    jobs.length > 0
      ? Math.round(
          (jobs.filter((j) => j.educationRequirement === "phd_required" || j.educationRequirement === "phd_preferred")
            .length /
            jobs.length) *
            100,
        )
      : 0;

  const COLORS = ["#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#eab308", "#f97316", "#ef4444", "#ec4899", "#6b7280"];
  const firmTypeColors = ["#f97316", "#8b5cf6", "#10b981"];
  const firmTypeLabels = {
    proprietary: "Prop trading & market making",
    hedge_fund: "Hedge fund",
    asset_manager: "Asset manager",
  };

  return (
    <div className="py-3 sm:py-5 bg-[#fbfbfa]">
      <div className="dk-container">
      {/* Headline figures: a snapshot of the postings open now, so the heading names it and the date runs to the
          newest posting. */}
      <h1 className="dk-h1">Hiring insights</h1>
      {/* The filter bar pads itself for full-width pages; here the page already has its padding. */}
      <div className="dash-filters">{filters}</div>
      <KeyFigures
        context={`Open postings on quant firms' own career pages${latestPosted ? `, up to ${fmtDay(latestPosted)}` : ""}.`}
        items={[
          { label: "Open jobs", value: jobs.length.toLocaleString("en-US"), note: `at ${firms.length} firms` },
          { label: "Median salary", value: medianSalary ? `$${(medianSalary / 1000).toFixed(0)}k` : "n/a", note: `from ${salaries.length} disclosed` },
          { label: "Top language", value: languageData[0]?.name || "n/a", note: `${languageData[0]?.value || 0} jobs` },
          { label: "Top location", value: locationData[0]?.name || "n/a", note: `${locationData[0]?.value || 0} jobs` },
        ]}
      />

      <div className="dk-card-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tech stack by firm type - THE key chart for r/quant */}
        <ChartCard title="Tech stack by firm type" subtitle="Share of jobs mentioning each language, by firm type.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={techByFirmType} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 45 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={40} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Legend formatter={(v) => firmTypeLabels[v] || v} wrapperStyle={{ fontSize: 10 }} />
              {["proprietary", "hedge_fund", "asset_manager"].map((type, i) => (
                <Bar key={type} dataKey={type} fill={firmTypeColors[i]} radius={[0, 2, 2, 0]} barSize={6} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Programming Languages */}
        <ChartCard title="Programming languages" subtitle="Jobs mentioning each language.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={languageData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 75 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={70} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Technologies & Tools */}
        <ChartCard title="Technologies and tools" subtitle="Frameworks, platforms and tools named in postings.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={techData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={75} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Role Categories */}
        <ChartCard title="Role categories" subtitle="Jobs by role.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={roleData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={75} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={18}>
                {roleData.map((entry, i) => (
                  <Cell key={entry.name} fill={ROLE_COLORS[entry.key] || COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top Locations */}
        <ChartCard title="Top locations" subtitle="Cities with the most postings.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={locationData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 70 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={65} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Education Requirements */}
        <ChartCard title="Education requirements" subtitle="Minimum education named in postings.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={educationData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 90 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={85} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Seniority Distribution */}
        <ChartCard title="Seniority" subtitle="Jobs by seniority level.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={seniorityData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 70 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={65} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Asset Classes */}
        <ChartCard title="Asset classes" subtitle="Asset classes named most often in postings.">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={assetClassData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
              <XAxis type="number" tick={{ fill: "#505a5f", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#0b0c0c", fontSize: 12 }} width={75} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#12436d" radius={[0, 3, 3, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      </div>
    </div>
  );
}

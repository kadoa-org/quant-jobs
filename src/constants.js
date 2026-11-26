export const FIRM_TYPE_COLORS = {
  hedge_fund: "#8b5cf6", // Purple
  proprietary: "#f97316", // Orange
  bank: "#3b82f6", // Blue
  asset_manager: "#10b981", // Green
  private_equity: "#ec4899", // Pink
  sovereign_fund: "#eab308", // Yellow
  consulting: "#6b7280", // Gray
  other: "#6b7280",
};

export const FIRM_TYPE_LABELS = {
  hedge_fund: "Hedge Fund",
  // Prop firms and market makers are one type: both trade only their own capital, and most prop firms make markets
  // (Jane Street, SIG, Akuna), so splitting them put the same business on two sides of a filter.
  proprietary: "Prop Trading & Market Making",
  bank: "Bank",
  asset_manager: "Asset Manager",
  private_equity: "Private Equity",
  sovereign_fund: "Sovereign Wealth Fund",
  consulting: "Consulting",
  other: "Other",
};

export const ROLE_COLORS = {
  quantitative_research: "#8b5cf6",
  quantitative_trading: "#f97316",
  quantitative_development: "#06b6d4",
  data_science: "#10b981",
  machine_learning: "#ec4899",
  software_engineering: "#3b82f6",
  hft_systems: "#ef4444",
  risk_management: "#eab308",
  portfolio_management: "#f59e0b",
  operations: "#6b7280",
  compliance: "#78716c",
  sales_trading: "#a855f7",
  business_development: "#14b8a6",
  other: "#4b5563",
};

export const ROLE_LABELS = {
  quantitative_research: "Quant Research",
  quantitative_trading: "Quant Trading",
  quantitative_development: "Quant Development",
  data_science: "Data Science",
  machine_learning: "ML / AI",
  software_engineering: "Software Engineering",
  hft_systems: "HFT Systems",
  risk_management: "Risk",
  portfolio_management: "Portfolio Management",
  operations: "Operations",
  compliance: "Compliance",
  sales_trading: "Sales & Trading",
  business_development: "Business Development",
  other: "Other",
};

export const WORK_MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export const SENIORITY_ORDER = ["intern", "junior", "mid", "senior", "lead", "vp_director", "executive"];

export const SENIORITY_LABELS = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
  vp_director: "VP/Director",
  executive: "Executive",
};

export const COLOR_LAYERS = [
  { key: "firmType", label: "Firm Type" },
  { key: "mlAiFocusPct", label: "AI/ML %" },
  { key: "phdDemandPct", label: "PhD Demand" },
  { key: "medianSalary", label: "Salary" },
  { key: "pythonPct", label: "Python %" },
  { key: "cppPct", label: "C++ %" },
  { key: "remotePct", label: "Remote %" },
];

// Green to red gradient for percentage metrics
export function pctToColor(pct) {
  // 0% = green, 50% = yellow, 100% = red
  const t = Math.min(1, Math.max(0, pct / 100));
  const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
  const g = Math.round(t < 0.5 ? 255 : (1 - (t - 0.5) * 2) * 255);
  return `rgb(${r}, ${g}, 60)`;
}

export function salaryToColor(salary) {
  if (!salary) return "#333";
  // Log scale: $50k = green, $200k = yellow, $500k+ = red
  const t = Math.min(1, Math.max(0, (Math.log(salary) - Math.log(50000)) / (Math.log(500000) - Math.log(50000))));
  return pctToColor(t * 100);
}

// The filter model, in one place: every facet the app can filter on, all empty.
// Import this instead of writing the object literal, so adding a facet cannot
// leave a "Clear all" button that silently keeps the new one applied.
export const EMPTY_FILTERS = {
  technologies: [],
  firmTypes: [],
  roleCategories: [],
  locations: [],
  seniorityLevels: [],
  workModes: [],
  // ["listed"] keeps postings that show a salary.
  pay: [],
  assetClasses: [],
  // Skill areas group the skills and tools a posting names into the kind of work
  // it is for (see src/skillAreas.js).
  skillAreas: [],
};

// The roles the site counts as quant and tech: research, trading, development, HFT systems, ML, data, software,
// risk and portfolio management. Operations, compliance, sales and "other" postings (recruiters, office staff) are
// scraped too but left out, here and on every generated page, so one number means one thing across the site.
export const QUANT_ROLES = new Set([
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

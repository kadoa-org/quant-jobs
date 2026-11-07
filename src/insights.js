// The insight views, one card each on /insights. `view` is the SPA view a card opens; `path` is its URL under the
// deploy prefix. Open source is a prerendered page outside the SPA, so it has a path and no view.
export const INSIGHTS = [
  { view: "dashboard", path: "?view=dashboard", title: "Hiring insights", summary: "Roles, seniority, salaries and demand across all firms." },
  { view: "techstack", path: "tech-stack", title: "Tech heatmap", summary: "The languages and tools each firm hires for." },
  { view: "stacks", path: "stacks", title: "Tech stack by firm", summary: "Each firm's stack in layers, from its own job postings." },
  { view: "locations", path: "locations", title: "Locations", summary: "Where quant firms hire, city by city." },
  { view: null, path: "open-source/", title: "Open source", summary: "Firms ranked by their footprint on GitHub." },
  { view: "internships", path: "internships", title: "Internships", summary: "The live intern market: firms, skills, cities and pay." },
];

// The views the Insights tab stays selected on.
export const INSIGHT_VIEWS = ["insights", ...INSIGHTS.map((i) => i.view).filter(Boolean)];

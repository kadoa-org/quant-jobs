import React from "react";
import { AboutPage as KitAboutPage } from "./kit";

const REPO = "https://github.com/kadoa-org/quant-jobs";

const METHODS = [
  {
    title: "Limits",
    body: [
      "The board updates once a day, so a new job can take a day to show up.",
      "It covers only the firms listed, and some roles are never posted publicly.",
      "Tags come from a language model and can be wrong. Check the original posting before relying on one.",
    ],
  },
  {
    title: "Roles, seniority and skills",
    body: "A language model reads each posting and tags its role, seniority, education, languages, tools and asset classes. Remote, hybrid and on-site come from fixed text rules instead.",
  },
  {
    title: "Salaries",
    body: "Salary is the base pay a posting discloses. Ranges use the midpoint. Hourly pay is multiplied by 2,080 and monthly pay by 12. Values under 25,000 or over 1,000,000 are dropped, and currencies are not converted. Medians count only postings that disclose pay.",
  },
  {
    title: "New in 30 days",
    body: "A firm's jobs posted within 30 days of the newest posting on the board. Firms that publish no posting dates show no figure.",
  },
];

export default function AboutPage() {
  return (
    <div className="dk-container">
      <KitAboutPage
        lede="Open quant jobs at hedge funds, prop trading firms, market makers and asset managers, collected from each firm's own careers page. Free to search, download and reuse."
        sources={[
          { name: "Firm careers pages", href: `${import.meta.env.BASE_URL}?view=firms`, what: "Open roles posted by each firm on the board" },
          { name: "Greenhouse", href: "https://www.greenhouse.com/", what: "Job boards used by many of these firms" },
          { name: "Workday", href: "https://www.workday.com/", what: "Job boards used by many of these firms" },
          { name: "GitHub", href: "https://github.com/", what: "Firms' public code, for the Open source page" },
        ]}
        steps={[
          { title: "Monitor", text: "Kadoa checks each firm's careers page for new jobs every day." },
          { title: "Extract", text: "It pulls the title, location, salary and full text of every posting." },
          { title: "Classify", text: "Each job is tagged with its role, seniority and tech stack." },
          { title: "Publish", text: "The board and dataset update, and jobs a firm takes down are removed." },
        ]}
        methods={METHODS}
        corrections={
          <>
            Found an error or a missing firm? <a href={`${REPO}/issues`}>Open an issue on GitHub</a>.
          </>
        }
      />
    </div>
  );
}

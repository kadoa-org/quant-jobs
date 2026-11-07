import React from "react";
import { INSIGHTS } from "./insights";

// The index of insight views, one card each, as on the other Kadoa dataset sites.
export default function InsightsPage({ onOpen }) {
  return (
    <div className="dk-container page">
      <h1 className="dk-h1">Insights</h1>
      <p className="page-lede">Trends across every open role at the quant firms we track, updated daily.</p>
      <ul className="insight-cards">
        {INSIGHTS.map((i) => (
          <li key={i.path} className="insight-card">
            <h2 className="insight-card-title">
              <a
                href={`${import.meta.env.BASE_URL}${i.path}`}
                onClick={(e) => {
                  if (!i.view || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  onOpen(i.view);
                }}
              >
                {i.title}
              </a>
            </h2>
            <p className="insight-card-text">{i.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

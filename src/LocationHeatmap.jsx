import React, { useMemo } from "react";
import { SOURCE } from "./cardSource";
import { ChartCard } from "./kit";
import {
  aggregateLocations,
  buildHybridLeaderboardSvg,
  buildHybridLeaderboardSvgMobile,
  buildLocationsLollipopSvg,
  buildLocationsLollipopSvgMobile,
} from "./lib/locationCharts";

function svgString(s, { fluid = false } = {}) {
  if (!s || !s.svg) return "";
  const sizeAttrs = fluid
    ? `viewBox="0 0 ${s.width} ${s.height}" style="width:100%;height:auto;display:block"`
    : `width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}"`;
  return `<svg ${sizeAttrs} xmlns="http://www.w3.org/2000/svg">${s.svg}</svg>`;
}

export default function LocationHeatmap({ jobs }) {
  const { agg, lollipop, lollipopMobile, hybrid, hybridMobile } = useMemo(() => {
    const a = aggregateLocations(jobs || []);
    return {
      agg: a,
      lollipop: buildLocationsLollipopSvg(a.cities),
      lollipopMobile: buildLocationsLollipopSvgMobile(a.cities),
      hybrid: buildHybridLeaderboardSvg(a.hybridLeaders),
      hybridMobile: buildHybridLeaderboardSvgMobile(a.hybridLeaders),
    };
  }, [jobs]);
  const { cities, hybridLeaders, totalJobs } = agg;
  const numCities = cities.length;

  return (
    <div className="dk-container page">
      <h1 className="dk-h1">
        Where quants hire
      </h1>
      <p className="page-lede">
        {totalJobs.toLocaleString()} quant-relevant postings across {numCities} cities at buy-side firms (≥10
        listings, hedge funds, prop trading, market makers).
      </p>

      <div className="dk-card-grid">
        <ChartCard title="Top quant cities" footer={SOURCE}>
          {/* Mobile: compact chart that scales down to viewport */}
          <div
            className="sm:hidden"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
            dangerouslySetInnerHTML={{ __html: svgString(lollipopMobile, { fluid: true }) }}
          />
          {/* Desktop: full chart with top firms list */}
          <div className="hidden sm:block overflow-x-auto">
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
              dangerouslySetInnerHTML={{ __html: svgString(lollipop) }}
            />
          </div>
        </ChartCard>

        {hybridLeaders.length > 0 && (
          <ChartCard title="Hybrid or remote" footer={SOURCE}>
            <div
              className="sm:hidden"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
              dangerouslySetInnerHTML={{ __html: svgString(hybridMobile, { fluid: true }) }}
            />
            <div className="hidden sm:block overflow-x-auto">
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
                dangerouslySetInnerHTML={{ __html: svgString(hybrid) }}
              />
            </div>
          </ChartCard>
        )}
      </div>

      <div className="page-credit">
        <strong>kadoa.com/quant</strong>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/kadoa-org/quant-jobs" target="_blank" rel="noopener noreferrer">
          github.com/kadoa-org/quant-jobs
        </a>
      </div>
    </div>
  );
}

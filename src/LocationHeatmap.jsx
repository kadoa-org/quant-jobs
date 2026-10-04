import React, { useMemo } from "react";
import { ChartCard } from "./lib/ChartCard";
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
    <div className="py-3 sm:py-5 bg-[#fbfbfa]">
      <div className="dk-container">
        <h1 className="dk-h1">
          Where quants hire
        </h1>
        <p className="text-[13px] sm:text-[14px] text-gray-600 leading-snug max-w-[1100px] mb-5">
          {totalJobs.toLocaleString()} quant-relevant postings across {numCities} cities at buy-side firms (≥10
          listings, hedge funds, prop trading, market makers).
        </p>

        <div className="dk-card-grid grid grid-cols-1 gap-6">
          <ChartCard title="Top quant cities">
            {/* Mobile: compact chart that scales down to viewport */}
            <div
              className="sm:hidden"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
              dangerouslySetInnerHTML={{ __html: svgString(lollipopMobile, { fluid: true }) }}
            />
            {/* Desktop: full chart with top firms list */}
            <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
              <div
                className="px-4 sm:px-0 min-w-[1300px]"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
                dangerouslySetInnerHTML={{ __html: svgString(lollipop) }}
              />
            </div>
          </ChartCard>

          {hybridLeaders.length > 0 && (
            <ChartCard title="Hybrid or remote">
              <div
                className="sm:hidden"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
                dangerouslySetInnerHTML={{ __html: svgString(hybridMobile, { fluid: true }) }}
              />
              <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
                <div
                  className="px-4 sm:px-0 min-w-[1300px]"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally from trusted aggregation
                  dangerouslySetInnerHTML={{ __html: svgString(hybrid) }}
                />
              </div>
            </ChartCard>
          )}
        </div>

        <div className="mt-4 text-[11px] text-gray-400 flex justify-end">
          <span className="text-gray-700 font-semibold">kadoa.com/quant</span>
          <span className="mx-2">·</span>
          <a
            href="https://github.com/kadoa-org/quant-jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-inherit no-underline"
          >
            github.com/kadoa-org/quant-jobs
          </a>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { ChartCard, SectionHeading } from "./kit";
import App from "./App";
export { parseUrl } from "./App";
export { readJobData } from "./jobData";
export function renderPage(initialPage) { return renderToString(<App initialPage={initialPage} />); }

// The kit's chart card and section heading as static markup, for the prerendered insight pages. `body` and `footer`
// are trusted HTML strings built by the prerender script.
export function renderChartCard({ id, title, description, footer, body }) {
  return renderToStaticMarkup(
    <ChartCard id={id} title={title} description={description} footer={footer && <span dangerouslySetInnerHTML={{ __html: footer }} />}>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </ChartCard>,
  );
}

export function renderSectionHeading(props) {
  return renderToStaticMarkup(<SectionHeading {...props} />);
}

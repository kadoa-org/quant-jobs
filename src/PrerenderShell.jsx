import React from "react";

const block = (width, height, marginBottom = 0) => ({
  width,
  height,
  marginBottom,
  background: "#e5e5e5",
  borderRadius: 2,
});

export default function PrerenderShell() {
  return (
    <div aria-busy="true" aria-label="Loading quant job data" style={{ minHeight: "100vh", background: "#f7f7f5" }}>
      <div style={{ height: 58, background: "#0b0c0c" }} />
      <div style={{ height: 44, background: "#fff", borderBottom: "1px solid #b1b4b6" }} />
      <div className="dk-container" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <p role="status">Loading quant job data…</p>
        <div aria-hidden="true">
        <div style={block(160, 16, 16)} />
        <div style={block("72%", 40, 12)} />
        <div style={block("64%", 16, 32)} />
        <div style={{ height: 104, background: "#fff", border: "1px solid #b1b4b6", marginBottom: 32 }} />
        <div style={block(256, 24, 16)} />
        <div style={{ height: 520, background: "#fff", border: "1px solid #b1b4b6" }} />
        </div>
      </div>
    </div>
  );
}

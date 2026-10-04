import React from "react";

function ExtLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#1d70b8] underline underline-offset-2">
      {children}
    </a>
  );
}

export default function AboutPage() {
  return (
    <div className="dk-container pt-8 pb-20">
      <div className="max-w-3xl">
        <h1 className="dk-h1">About the data</h1>
        <p className="text-[15px] leading-[1.5] text-[#505a5f]">
          A holistic live view of the quant job market: postings from all top quant firms, updated daily with{" "}
          <ExtLink href="https://kadoa.com">kadoa.com</ExtLink>. Every posting is pulled from the firm's own careers
          page and classified by role, seniority, location, work mode, asset class, and tech stack. The code and the
          full dataset are open source on <ExtLink href="https://github.com/kadoa-org/quant-jobs">GitHub</ExtLink>
          .
        </p>
      </div>

      <div className="mt-8 max-w-5xl">
        <div className="border border-[#b1b4b6] bg-white p-5">
          <p className="text-[14px] leading-[1.5] text-[#26282a]">
            <ExtLink href="https://kadoa.com">Kadoa</ExtLink> is the web data layer for finance, providing the most
            reliable datasets for investors.
          </p>
        </div>
      </div>

      <div className="mt-16 max-w-3xl text-[13px] text-[#505a5f]">
        <p>For informational and research purposes. Postings belong to the firms that published them.</p>
      </div>
    </div>
  );
}

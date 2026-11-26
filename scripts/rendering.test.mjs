import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../dist/quant/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
// The shells carry a small seed that points at the shared data file (dataUrl); the test reads it the way the browser does.
const seed = html => {
  const page = JSON.parse(html.match(/<script id="page-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert(page.dataUrl && !page.data, "the shell points at the data file instead of embedding the data");
  return { ...page, data: JSON.parse(read(page.dataUrl.replace(/^\/quant\//, ''))) };
};
const home = read('index.html');
assert.match(home, /<h1[^>]*>The most comprehensive quant job board<\/h1>/);
assert.match(home, /<table/);
const publishedJobs = new Set(seed(home).data.jobs.map(job => job.slug));
const linkedJobs = [...home.matchAll(/href="\/quant\/job\/([^"/]+)\/"/g)].map(match => match[1]);
// The table opens newest first. A fresh posting can lack a job page (no description scraped yet), so the first page
// links every one of its 50 rows that has a page, in the table's order: the check follows the data, not a fixed 50.
const firstPage = [...seed(home).data.jobs].sort((a, b) => (b.datePosted || "").localeCompare(a.datePosted || "")).slice(0, 50);
assert.equal(firstPage.length, 50, "first page has 50 rows");
assert.deepEqual(linkedJobs, firstPage.filter((job) => job.slug).map((job) => job.slug), "first page links every row that has a job page, newest first");
assert(linkedJobs.every(slug => publishedJobs.has(slug)), "every visible job belongs to the published dataset");
assert(!home.includes('seo-shell'));
assert(!home.includes('Loading quant job data'));
assert(seed(home).data.jobs.length > 0);
// Generated pages are linked in context, not from a footer link block: a firm page links its roles and cities, and a
// job page links back to its firm's page (with BreadcrumbList data for the trail).
const firmPage = read('firm/qube-rt-qrt/index.html');
assert.match(firmPage, /href="\/quant\/location\/london"/, "firm page links its city pages");
assert.match(firmPage, /href="\/quant\/quant-[a-z-]+-jobs"/, "firm page links its role pages");
const aJob = fs.readdirSync(new URL('job/', root))[0];
const jobPage = read(`job/${aJob}/index.html`);
assert.match(jobPage, /href="\/quant\/firm\/[a-z0-9-]+"/, "job page links its firm page");
assert.match(jobPage, /"@type":"BreadcrumbList"/, "job page carries breadcrumb data");
assert(!home.includes('Explore the data:'), "no injected footer link block");
for (const file of ['tech-stack.html', 'locations.html', 'internships.html', 'stacks.html']) {
  const html = read(file);
  assert.match(html, /<h1/);
  assert(!html.includes('seo-shell'), file);
  assert.equal(seed(html).pathname, '/quant/' + file.replace('.html', ''));
}
const aiPage = read('ai-tools/index.html');
assert.match(aiPage, /<h1[^>]*>AI tools in quant job postings<\/h1>/);
assert.match(aiPage, /Prop trading firms ask in [\d.]+% of postings/, "the lede carries the live firm-type shares");
assert.equal((aiPage.match(/class="ai-chart ai-wide"/g) || []).length, 3, "three charts, each with a wide and a narrow drawing");
const detail = read('stacks/firm/jane-street/index.html');
assert.equal(seed(detail).pathname, '/quant/stacks/firm/jane-street');
assert(/1 firm and \d+ open jobs/.test(detail.replace(/<[^>]*>/g, "")), "firm detail is already filtered before hydration");
const jobDir = fs.readdirSync(new URL('job/', root))[0];
const job = read(`job/${jobDir}/index.html`);
assert.match(job, /JobPosting/);
assert(!job.includes('id="page-data"'), 'standalone job details keep their existing rendering');
console.log('Quant rendering: real jobs, route-specific stacks and standalone job pages verified');

// These public city URLs must survive changes in daily posting and firm counts.
for (const slug of ['new-york', 'london', 'singapore', 'hong-kong', 'chicago', 'sydney', 'boston', 'paris', 'mumbai', 'miami', 'amsterdam', 'austin']) {
  const html = read(`location/${slug}/index.html`);
  assert.match(html, /<table/);
  assert.ok(html.includes(`https://www.kadoa.com/quant/location/${slug}`));
}
const miamiJobs = JSON.parse(fs.readFileSync(new URL('../public/data/jobs.json', import.meta.url), 'utf8')).filter(job => job.locations?.includes('Miami'));
assert.ok(read('location/miami/index.html').includes(`${miamiJobs.length} postings`), 'Miami must show current published posting counts');

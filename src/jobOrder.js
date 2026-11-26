// Newest first, by the day we first saw each posting. Within one day the firms take turns, so a firm that added 40
// roles that day cannot fill the first page on its own.
export function byAddedInterleaved(jobs) {
  const days = new Map();
  for (const j of jobs) {
    const d = j.dateAdded || "";
    if (!days.has(d)) days.set(d, new Map());
    const firms = days.get(d);
    if (!firms.has(j.firmName)) firms.set(j.firmName, []);
    firms.get(j.firmName).push(j);
  }
  const out = [];
  for (const d of [...days.keys()].sort().reverse()) {
    const queues = [...days.get(d).values()].sort((a, b) => b.length - a.length || a[0].firmName.localeCompare(b[0].firmName));
    for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) out.push(q[i]);
  }
  return out;
}

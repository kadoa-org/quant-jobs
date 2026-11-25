// Cmd+K / Ctrl+K search, as on the other dataset sites. Plain script, so the app's pages and the prerendered job and
// firm pages share it: any [data-search-open] button opens it, and so do Cmd+K, Ctrl+K and "/". The index is
// data/search.json, written at build time and fetched the first time the dialog opens. Picking an item navigates.
(() => {
  const BASE = "/quant";
  const GROUPS = ["Pages", "Firms", "Roles", "Cities", "Technologies", "Jobs"];
  // Shown before anything is typed: a few of each, jobs left out.
  const EMPTY_LIMIT = { Pages: 4, Firms: 5, Roles: 3, Cities: 3, Technologies: 3, Jobs: 0 };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ");
  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  let index = null;
  let loading = null;
  let root = null;
  let input = null;
  let list = null;
  let items = [];
  let active = 0;
  let opener = null;

  const load = () =>
    (loading ??= fetch(`${BASE}/data/search.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows) => {
        index = rows.map((r) => ({ ...r, text: norm(`${r.label} ${r.hint}`), start: norm(r.label) }));
      })
      .catch(() => {
        index = [];
      })
      .then(render));

  function results(q) {
    if (!index) return [];
    const words = norm(q).split(" ").filter(Boolean);
    if (!words.length) return GROUPS.flatMap((g) => index.filter((it) => it.group === g).slice(0, EMPTY_LIMIT[g]));
    // Every word must appear in the label or hint. A label starting with the query ranks first, then groups in order.
    return index
      .filter((it) => words.every((w) => it.text.includes(w)))
      .map((it) => ({ it, score: (it.start.startsWith(words[0]) ? 0 : 10) + GROUPS.indexOf(it.group) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 50)
      .map((x) => x.it)
      .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  }

  function render() {
    if (!root || root.hidden) return;
    items = results(input.value);
    active = Math.min(active, Math.max(items.length - 1, 0));
    if (!items.length) {
      list.innerHTML = `<div class="cmdk-empty">${index ? "No matches" : "Loading…"}</div>`;
      return;
    }
    let last = null;
    list.innerHTML = items
      .map((it, i) => {
        const header = it.group !== last ? `<div class="cmdk-group">${escHtml(it.group)}</div>` : "";
        last = it.group;
        return `${header}<a href="${escHtml(it.href)}" data-idx="${i}" id="cmdk-opt-${i}" role="option" aria-selected="${i === active}" class="cmdk-item${i === active ? " cmdk-item--active" : ""}"><span class="cmdk-label">${escHtml(it.label)}</span>${it.hint ? `<span class="cmdk-hint">${escHtml(it.hint)}</span>` : ""}</a>`;
      })
      .join("");
    input.setAttribute("aria-activedescendant", `cmdk-opt-${active}`);
  }

  function setActive(i) {
    if (!items.length) return;
    active = Math.max(0, Math.min(i, items.length - 1));
    for (const el of list.querySelectorAll(".cmdk-item")) {
      const on = Number(el.dataset.idx) === active;
      el.classList.toggle("cmdk-item--active", on);
      el.setAttribute("aria-selected", String(on));
    }
    input.setAttribute("aria-activedescendant", `cmdk-opt-${active}`);
    list.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function build() {
    root = document.createElement("div");
    root.className = "cmdk";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Search");
    root.innerHTML = `<div class="cmdk-backdrop"></div>
<div class="cmdk-box">
  <div class="cmdk-head"><label for="cmdk-input" class="cmdk-sr">Search firms, roles, cities, technologies and jobs</label><input id="cmdk-input" class="dk-input cmdk-input" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdk-list" placeholder="Search a firm, role, city, language or job" /><kbd>Esc</kbd></div>
  <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
  <div class="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</div>
</div>`;
    document.body.appendChild(root);
    input = root.querySelector(".cmdk-input");
    list = root.querySelector(".cmdk-list");
    root.querySelector(".cmdk-backdrop").addEventListener("click", close);
    input.addEventListener("input", () => {
      active = 0;
      render();
    });
    list.addEventListener("mousemove", (e) => {
      const el = e.target.closest(".cmdk-item");
      if (el && Number(el.dataset.idx) !== active) setActive(Number(el.dataset.idx));
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(active + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(active - 1);
      } else if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        window.location.href = items[active].href;
      }
    });
  }

  function open() {
    if (!root) build();
    if (!root.hidden) return;
    opener = document.activeElement;
    root.hidden = false;
    document.documentElement.style.overflow = "hidden";
    input.value = "";
    active = 0;
    render();
    input.focus();
    if (!index) load();
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.documentElement.style.overflow = "";
    opener?.focus?.();
  }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? "") || e.target?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      root && !root.hidden ? close() : open();
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-search-open]")) {
      e.preventDefault();
      open();
    }
  });
})();

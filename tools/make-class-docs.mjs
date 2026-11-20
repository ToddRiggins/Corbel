/** Generates the static per-class pages and the "All classes" index from
 *  docs/class_reference.json. Run: node tools/make-class-docs.mjs */

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DOCS_DIR = "docs";
const data = JSON.parse(readFileSync(`${DOCS_DIR}/class_reference.json`, "utf8"));

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const byName = new Map(Object.entries(data.classes ?? {}).map(([name, entry]) => [name, entry]));
const groupsOf = new Map();
for (const group of data.groups ?? []) {
  for (const name of group.classes) {
    groupsOf.set(name, group.label);
  }
}

function chain(inherits) {
  const up = [];
  let at = inherits;
  let guard = 0;
  while (at && byName.has(at) && guard < 12) {
    up.push({ name: at, linked: true });
    at = byName.get(at).inherits;
    guard += 1;
  }
  if (at && !byName.has(at)) {
    up.push({ name: at, linked: false });
  }
  return up;
}

function memberRow(id, name, sig, type, desc) {
  return `<tr id="${esc(id)}"><td><code>${esc(sig ?? name)}</code></td><td>${type ? `<code>${esc(type)}</code> ` : ""}${esc(desc)}</td></tr>`;
}

const css = `
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #121212; color: #e7e5e4; }
    a { color: #fdba74; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: Consolas, "Courier New", monospace; font-size: 0.92rem; background: #2a2a2a; color: #fde68a; padding: 0.05rem 0.3rem; }
    .layout { display: flex; min-height: 100vh; }
    nav { width: 16.5rem; flex: none; background: #1a1a1a; border-right: 1px solid #333; padding: 1rem 0 2rem; overflow-y: auto; position: sticky; top: 0; height: 100vh; box-sizing: border-box; }
    nav h1 { font-weight: normal; font-size: 1.05rem; margin: 0.7rem 0.9rem 0.4rem; }
    nav input { width: calc(100% - 1.6rem); margin: 0 0.8rem 0.5rem; padding: 0.35rem 0.5rem; background: #2a2a2a; border: 1px solid #444; color: #e7e5e4; border-radius: 4px; font: 13px system-ui; box-sizing: border-box; }
    nav .group-label { color: #a8a29e; font-size: 0.8rem; margin: 0.9rem 0.9rem 0.2rem; letter-spacing: 0.05em; }
    .group { margin-top: 0.35rem; }
    .group-toggle { display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left; background: none; border: none; color: #fdba74; font: 600 0.8rem/2.1 Georgia, serif; letter-spacing: 0.05em; padding: 0 0.9rem; cursor: pointer; }
    .group-toggle .arrow { display: inline-block; transition: transform 0.12s ease; color: #a8a29e; font-size: 0.75rem; width: 0.9rem; }
    .group-toggle[aria-expanded="true"] .arrow { transform: rotate(90deg); }
    .group-toggle:hover { background: #2a2a2a; }
    .group-classes { padding-bottom: 0.2rem; }
    .index-groups .group-toggle { font-size: 1rem; margin-top: 0.4rem; }
    .index-groups .group-classes { padding-left: 1.1rem; }
    nav button { display: block; width: 100%; text-align: left; background: none; border: none; color: #d6d3d1; padding: 0.22rem 0.9rem; font: 14px/1.5 Georgia, serif; cursor: pointer; }
    nav button:hover { background: #2a2a2a; }
    nav button.on { background: #3f3f46; color: #fff; }
    main { flex: 1; padding: 2rem 2.4rem 4rem; max-width: 60rem; box-sizing: border-box; }
    .crumbs { color: #a8a29e; font-size: 0.85rem; margin-bottom: 1.1rem; }
    .crumbs a { color: #a8a29e; }
    h1 { font-weight: normal; font-size: 2rem; margin: 0 0 0.35rem; }
    .inherits { color: #a8a29e; font-size: 0.9rem; margin-bottom: 1.6rem; }
    .inherits a { color: #fdba74; }
    .brief { font-size: 1.12rem; color: #fde68a; margin: 0 0 1.4rem; }
    h2 { font-weight: 600; font-size: 1.2rem; margin: 1.6rem 0 0.7rem; color: #fdba74; }
    p { line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
    th { text-align: left; color: #aaa; font-weight: normal; padding: 0.35rem 0.6rem; border-bottom: 1px solid #444; }
    td { padding: 0.32rem 0.6rem; border-bottom: 1px solid #2c2c2c; vertical-align: top; }
    .soon { color: #a8a29e; font-style: italic; }
    .note { color: #a8a29e; font-size: 0.9rem; }
    @media (max-width: 800px) { .layout { display: block; } nav { position: static; height: auto; width: 100%; } }
`;

/** One section open at a time; arrows flip between the closed and open glyph. */
const accordionJs = `
  function wireAccordion(root) {
    root.querySelectorAll(".group-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const group = toggle.closest(".group");
        const classes = group.querySelector(".group-classes");
        const wasOpen = !classes.hidden;
        document.querySelectorAll(".group").forEach((other) => {
          const hidden = other.querySelector(".group-classes");
          const head = other.querySelector(".group-toggle");
          if (hidden) { hidden.hidden = true; }
          if (head) { head.setAttribute("aria-expanded", "false"); }
        });
        if (!wasOpen) {
          classes.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
        }
      });
    });
  }
`;

const headerNav = `
    <h1><span style="color:#ff7085">Corbel</span> Engine</h1>
    <input id="find" type="search" placeholder="Filter classes" aria-label="Filter classes">
`;

/** One class page. */
function classPage(name) {
  const entry = byName.get(name);
  const group = groupsOf.get(name) ?? "Classes";
  const chain_html = chain(entry.inherits ?? "").map((part, index) => (index === 0 ? (part.linked ? `<a href="class_${part.name}.html">${esc(part.name)}</a>` : esc(part.name)) : ` <strong>&lt;</strong> ${part.linked ? `<a href="class_${part.name}.html">${esc(part.name)}</a>` : esc(part.name)}`)).join("");
  const props = (entry.properties ?? []).map((p) => memberRow(`${name}.${p.name}`, p.name, `${p.type} ${p.name}`, p.type, p.desc)).join("\n");
  const methods = (entry.methods ?? []).map((m) => {
    const sig = m.sig ?? `${m.name}()`;
    const member = sig.split("(")[0];
    return memberRow(`${name}.${member}`, member, sig, "", m.desc);
  }).join("\n");
  const tutorial_block = (entry.tutorials ?? []).length > 0
    ? `<ul>${entry.tutorials.map((t) => `<li><a href="${esc(t.href)}">${esc(t.label)}</a></li>`).join("")}</ul>`
    : `<p class="soon">Tutorials: none yet. They will live on ExoDev.Com.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} — Corbel Class Reference</title>
  <style>${css}</style>
  <script>
    ${accordionJs}
    window.addEventListener("load", () => {
      const q = new URLSearchParams(window.location.search);
      const member = q.get("m");
      if (member) {
        const row = document.getElementById(decodeURIComponent(member));
        if (row) { row.style.outline = "2px solid #fdba74"; row.style.outlineOffset = "3px"; row.scrollIntoView({ block: "center" }); }
      }
      wireAccordion(document);
      const input = document.getElementById("find");
      const buttons = Array.from(document.querySelectorAll("nav button[data-name]"));
      buttons.forEach((button) => { button.classList.toggle("on", button.dataset.name === ${JSON.stringify(name)}); });
      input.addEventListener("input", () => {
        const query = input.value.toLowerCase();
        buttons.forEach((button) => { button.hidden = query.length > 0 && !button.dataset.name.toLowerCase().includes(query); });
      });
    });
  </script>
</head>
<body>
  <div class="layout">
    <nav>${headerNav}
      <div id="class-list">${sidebarList(name)}</div>
    </nav>
    <main>
      <p class="crumbs">Corbel › Class Reference › ${esc(group)}</p>
      <h1>${esc(name)}</h1>
      ${entry.inherits ? `<p class="inherits"><strong>Inherits:</strong> ${chain_html}</p>` : `<p class="inherits">No Corbel parent class.</p>`}
      <p class="brief">${esc(entry.brief)}</p>
      <h2>Description</h2>
      <p>${esc(entry.description).replace(/\n/g, "<br>")}</p>
      <h2>Tutorials</h2>
      ${tutorial_block}
      ${(entry.properties ?? []).length > 0 ? `<h2>Properties</h2><table><tr><th>Type</th><th>Property</th><th>Description</th></tr>
${props}
      </table>` : ""}
      ${(entry.methods ?? []).length > 0 ? `<h2>Methods</h2><table><tr><th>Signature</th><th>Description</th></tr>
${methods}
      </table>` : ""}
      ${(entry.not_built ?? []).length > 0 ? `<h2>Not yet built</h2>
      <p class="note">Godot names this class carries that the engine has not built yet. Each says where it waits.</p>
      <table><tr><th>Godot name</th><th>Waits for</th></tr>
${(entry.not_built ?? []).map((item) => `<tr><td><code>${esc(item.name)}</code></td><td>${esc(item.why)}</td></tr>`).join("\n")}
      </table>` : ""}
    </main>
  </div>
</body>
</html>
`;
}

function sidebarList(current) {
  let html = "";
  for (const group of data.groups ?? []) {
    const open = current !== "" && (group.classes ?? []).includes(current);
    html += `<div class="group" data-group="${esc(group.label)}">`;
    html += `<button class="group-toggle" type="button" aria-expanded="${open}"><span class="arrow">▸</span>${esc(group.label)}</button>`;
    html += `<div class="group-classes"${open ? "" : " hidden"}>`;
    for (const name of group.classes) {
      html += `<button data-name="${esc(name)}" type="button" class="${name === current ? "on" : ""}" onclick="window.location='class_${name}.html'">${esc(name)}</button>`;
    }
    html += `</div></div>`;
  }
  return html;
}

/** The "All classes" index: Godot's classes/index.html shape. */
function indexPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>All classes — Corbel Class Reference</title>
  <style>${css}
    main { max-width: 42rem; }
  </style>
  <script>
    ${accordionJs}
    window.addEventListener("load", () => {
      wireAccordion(document);
      const input = document.getElementById("find");
      const buttons = Array.from(document.querySelectorAll("nav button[data-name]"));
      input.addEventListener("input", () => {
        const query = input.value.toLowerCase();
        buttons.forEach((button) => { button.hidden = query.length > 0 && !button.dataset.name.toLowerCase().includes(query); });
      });
    });
  </script>
</head>
<body>
  <div class="layout">
    <nav>${headerNav}
      <div id="class-list">${sidebarList("")}</div>
    </nav>
    <main>
      <p class="crumbs">Corbel › Class Reference</p>
      <h1>All classes</h1>
      <p class="note">${(data.groups ?? []).reduce((sum, group) => sum + group.classes.length, 0)} classes. Sections below group them the way Godot's ClassDB does. One section open at a time.</p>
      <p class="note">Use the editor's Look up (right-click a script symbol) to jump straight to a class or member page.</p>
      <div class="index-groups">${sidebarList("")}</div>
    </main>
  </div>
</body>
</html>
`;
}

mkdirSync(DOCS_DIR, { recursive: true });
let count = 0;
for (const name of byName.keys()) {
  writeFileSync(`${DOCS_DIR}/class_${name}.html`, classPage(name));
  count += 1;
}
writeFileSync(`${DOCS_DIR}/class_reference.html`, indexPage());
console.log(`wrote ${count} class pages and class_reference.html`);

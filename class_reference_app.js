/** Renders the Corbel class reference from class_reference.json: a Godot-style
 *  "All classes" sidebar plus per-class pages with inheritance, description,
 *  properties, and methods. */

const state = { by_name: new Map(), groups: [], site: null, current: null, filter: "" };

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function link(name) {
  return state.by_name.has(name) ? `<a href="#${name}">${esc(name)}</a>` : esc(name);
}

function chain(inherits) {
  const up = [];
  let at = inherits;
  let guard = 0;
  while (at && state.by_name.has(at) && guard < 12) {
    up.push(link(at));
    at = state.by_name.get(at).inherits;
    guard += 1;
  }
  if (at && !state.by_name.has(at)) {
    up.push(esc(at));
  }
  return up;
}

function memberRow(id, name, sig, type, desc) {
  return `<tr id="${esc(id)}"><td><code>${esc(sig ?? name)}</code></td><td>${esc(type ?? "") ? `<code>${esc(type)}</code> ` : ""}${esc(desc)}</td></tr>`;
}

function renderPage(name) {
  const page = document.getElementById("page");
  const data = state.by_name.get(name);
  if (!data) {
    page.innerHTML = `<h1>${esc(name)}</h1><p class="note">No class reference entry for ${esc(name)} yet.</p>`;
    return;
  }
  state.current = name;
  const chainHtml = chain(data.inherits).map((part, index) => (index === 0 ? part : ` <strong>&lt;</strong> ${part}`)).join("");
  const tutorials = (data.tutorials && data.tutorials.length > 0)
    ? `<ul>${data.tutorials.map(t => `<li><a href="${esc(t.href)}">${esc(t.label)}</a></li>`).join("")}</ul>`
    : `<p class="soon">Tutorials: none yet. They will live on ExoDev.Com.</p>`;
  const props = (data.properties ?? []).map((p) => memberRow(`${name}.${p.name}`, p.name, `${p.type} ${p.name}${p.value ? ` = ${p.default ?? ""}` : ""}`, p.type, p.desc)).join("");
  const methods = (data.methods ?? []).map((m) => memberRow(`${name}.${m.name.replace(/\(.*$/, "")}`, m.name, m.sig, "", m.desc)).join("");
  const groupsOf = state.groups.find((group) => group.classes.includes(name));
  page.innerHTML = `
    <p class="crumbs">Corbel › Class Reference › ${groupsOf ? esc(groupsOf.label) : "Classes"}</p>
    <h1>${esc(name)}</h1>
    ${chainHtml ? `<p class="inherits"><strong>Inherits:</strong> ${chainHtml}</p>` : `<p class="inherits">No Corbel parent class.</p>`}
    <p class="brief">${esc(data.brief)}</p>
    <h2>Description</h2>
    <p>${esc(data.description).replace(/\n/g, "<br>")}</p>
    ${data.tutorials !== "done" ? `<h2>Tutorials</h2>${tutorials}` : ""}
    ${(data.properties ?? []).length > 0 ? `<h2>Properties</h2><table><tr><th>Type</th><th>Property</th><th>Description</th></tr>${props}</table>` : ""}
    ${(data.methods ?? []).length > 0 ? `<h2>Methods</h2><table><tr><th>Signature</th><th>Description</th></tr>${methods}</table>` : ""}
  `;
}

function renderList() {
  const list = document.getElementById("class-list");
  const filter = state.filter.toLowerCase();
  let html = "";
  for (const group of state.groups) {
    const names = group.classes.filter((name) => name.toLowerCase().includes(filter));
    if (names.length === 0) {
      continue;
    }
    html += `<div class="group-label">${esc(group.label)}</div>`;
    for (const name of names) {
      html += `<button data-name="${esc(name)}" class="${name === state.current ? "on" : ""}">${esc(name)}</button>`;
    }
  }
  list.innerHTML = html;
  for (const button of list.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      window.location.hash = `#${button.dataset.name}`;
    });
  }
}

function route() {
  const target = decodeURIComponent(window.location.hash.slice(1));
  if (!target) {
    const page = document.getElementById("page");
    page.innerHTML = `<h1>Class Reference</h1><p class="note">Pick a class from the list, or use the editor's Look up.</p>`;
    return;
  }
  const className = target.split(".")[0];
  renderPage(className);
  renderList();
  page_heading_fix();
  const member = target.includes(".") ? document.getElementById(target) : null;
  if (member) {
    member.scrollIntoView({ block: "center" });
  }
}

function page_heading_fix() {
  // Page heading scroll lands the main panel; nothing further needed here.
  void 0;
}

function boot() {
  fetch("class_reference.json")
    .then((response) => response.json())
    .then((data) => {
      state.site = data.site ?? null;
      state.groups = data.groups ?? [];
      for (const [name, entry] of Object.entries(data.classes ?? {})) {
        state.by_name.set(name, entry);
      }
      document.getElementById("find").addEventListener("input", (event) => {
        state.filter = event.target.value;
        renderList();
      });
      window.addEventListener("hashchange", route);
      renderList();
      route();
    });
}

boot();

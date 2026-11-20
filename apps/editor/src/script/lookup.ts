export interface DocEntry {
  name: string;
  owner: string;
  id: string;
  type: string;
  extends: string;
}

export interface LookupHit {
  id: string;
  label: string;
}

/** Entry id for a class or one of its members, matching class_reference.html rows. */
export function classDocId(name: string, owner: string | null): string {
  return owner ? `${owner}.${name}` : name;
}

/** Flattens class_reference.json into the same DocEntry list parseDocs produces. */
export function parseClassDocs(data: { classes?: Record<string, { inherits?: string; properties?: Array<{ name: string; type: string }>; methods?: Array<{ name?: string; sig?: string }> }> }): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const [className, entry] of Object.entries(data.classes ?? {})) {
    entries.push({ name: className, owner: "", id: className, type: "", extends: entry.inherits ?? "" });
    for (const property of entry.properties ?? []) {
      entries.push({ name: property.name, owner: className, id: `${className}.${property.name}`, type: property.type ?? "", extends: "" });
    }
    for (const method of entry.methods ?? []) {
      const sig = method.sig ?? `${method.name ?? ""}()`;
      const memberName = method.name ?? sig.split("(")[0];
      entries.push({ name: memberName, owner: className, id: `${className}.${memberName}`, type: "", extends: "" });
    }
  }
  return entries;
}

/**
 * The word under the cursor, plus the name before a dot.
 * `this.position.add` yields word `add` and qualifier `position`.
 */
export function wordAt(text: string, lineFrom: number, pos: number): { from: number; to: number; word: string; qualifier: string | null } | null {
  const rel = pos - lineFrom;
  if (rel < 0 || rel > text.length) {
    return null;
  }
  let at = rel < text.length && /[A-Za-z0-9_]/.test(text[rel] ?? "") ? rel : rel - 1;
  if (at < 0 || !/[A-Za-z0-9_]/.test(text[at] ?? "")) {
    return null;
  }
  let start = at;
  let end = at + 1;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1] ?? "")) {
    start -= 1;
  }
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end] ?? "")) {
    end += 1;
  }
  const word = text.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) {
    return null;
  }
  const before = text.slice(0, start);
  const qualifier = /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/.exec(before);
  return { from: lineFrom + start, to: lineFrom + end, word, qualifier: qualifier ? qualifier[1] : null };
}

/** Which documentation anchors match this word in this script. */
export function lookupHits(entries: DocEntry[], word: string, qualifier: string | null, source: string, pos: number): LookupHit[] {
  const named = entries.filter((entry) => entry.name === word);
  if (named.length === 0) {
    return [];
  }
  if (qualifier) {
    const owner = ownerOf(entries, qualifier, source, pos);
    if (owner) {
      const hit = findOnChain(entries, named, owner);
      return hit ? [{ id: hit.id, label: "Look up" }] : [];
    }
    return labelHits(unique(named.filter((entry) => entry.owner !== "")));
  }
  const base = enclosingBase(source, pos);
  if (base) {
    const hit = findOnChain(entries, named, base);
    if (hit) {
      return [{ id: hit.id, label: "Look up" }];
    }
  }
  const loose = unique(named.filter((entry) => entry.owner === ""));
  if (loose.length > 0) {
    return labelHits(loose);
  }
  return labelHits(unique(named));
}

function labelHits(entries: DocEntry[]): LookupHit[] {
  if (entries.length === 1) {
    return [{ id: entries[0].id, label: "Look up" }];
  }
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.owner ? `Look up ${entry.owner}.${entry.name}` : "Look up",
  }));
}

function unique(entries: DocEntry[]): DocEntry[] {
  const seen = new Set<string>();
  const out: DocEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.id}\0${entry.owner}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function ownerOf(entries: DocEntry[], qualifier: string, source: string, pos: number): string | null {
  if (qualifier === "this") {
    return enclosingBase(source, pos);
  }
  if (entries.some((entry) => entry.name === qualifier && entry.owner === "")) {
    return qualifier;
  }
  const base = enclosingBase(source, pos);
  if (!base) {
    return null;
  }
  return memberType(entries, base, qualifier);
}

function memberType(entries: DocEntry[], owner: string, member: string): string | null {
  const seen = new Set<string>();
  let current: string | null = owner;
  while (current && !seen.has(current)) {
    seen.add(current);
    const found = entries.find((entry) => entry.owner === current && entry.name === member && entry.type);
    if (found) {
      return found.type;
    }
    current = parentOf(entries, current);
  }
  return null;
}

function findOnChain(entries: DocEntry[], named: DocEntry[], owner: string): DocEntry | null {
  const seen = new Set<string>();
  let current: string | null = owner;
  while (current && !seen.has(current)) {
    seen.add(current);
    const hit = named.find((entry) => entry.owner === current);
    if (hit) {
      return hit;
    }
    current = parentOf(entries, current);
  }
  return null;
}

function parentOf(entries: DocEntry[], name: string): string | null {
  return entries.find((entry) => entry.name === name && entry.owner === "")?.extends || null;
}

function enclosingBase(source: string, pos: number): string | null {
  const re = /class\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)\s*\{/g;
  let found: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const open = match.index + match[0].lastIndexOf("{");
    if (open > pos) {
      break;
    }
    if (pos >= open && pos <= matchingBrace(source, open)) {
      found = match[1];
    }
  }
  return found;
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") {
      depth += 1;
    } else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return source.length;
}

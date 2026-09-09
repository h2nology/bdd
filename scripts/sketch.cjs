#!/usr/bin/env node
'use strict';
/**
 * Gherkin-derived UI spec -> read-only wireframe canvas (pan/zoom board + flow arrows).
 *
 * Consumes the JSON the `sketch` skill derives from feature files (see
 * skills/sketch/references/sketch-spec.md). The model decides what is on each
 * screen; this renderer decides where it goes, so regenerating the JSON cannot
 * make the board drift.
 *
 * Every wireframe element is rendered at a fixed height taken from ELEMENT_H,
 * which is what lets the layout compute each card's exact box up front and draw
 * transition arrows that actually meet the card edges.
 *
 * Usage:
 *   node sketch.cjs [--input <file>] [options]
 *
 * Options:
 *   --input <file>     Sketch spec JSON (default bdd-artifacts/sketch.json)
 *   --out <file>       Output HTML (default bdd-artifacts/sketch.html)
 *   --json <file>      Also write the laid-out model (boxes, columns, edges) as JSON
 *   --mermaid <file>   Also write the screen flow as Mermaid source
 *   --labels <tag>     Board chrome language: en | zh-CN | zh-TW | ja
 *   --title <text>     Override the board title
 *   --viewport <v>     Override app.viewport: desktop | tablet | mobile
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');
const { labelsFor } = require('./lib/labels.cjs');

/** Rendered height in px per element type. Must match the CSS below exactly. */
const ELEMENT_H = {
  heading: 32, text: 22, input: 54, textarea: 88, select: 54, date: 54, file: 54,
  search: 54, button: 38, link: 22, table: 30, list: 0, card: 68, image: 96,
  chart: 104, badge: 26, alert: 40, nav: 38, tabs: 36, stepper: 42,
  pagination: 32, empty: 68, spinner: 48, divider: 17, radio: 0, checkbox: 0,
};
const PLACEHOLDER_H = 48;
const CARD_W = { desktop: 344, tablet: 304, mobile: 264 };
/**
 * Every value here is also written into BOARD_CSS and must stay in step with it:
 * cardHead = .frame (22) + .scr > header (36); border = .scr's 1px top+bottom;
 * regionPad = .rg's padding; regionGap = .scr-body's gap; elGap = .rg's gap.
 * No region may carry its own padding override or a layout-affecting border -
 * that is why .rg-footer's rule uses an inset shadow rather than border-top.
 */
const LAYOUT = {
  colGap: 168, rowGap: 56, pad: 48, cardHead: 58, border: 2, regionPad: 12,
  regionGap: 10, elGap: 8, regionLabel: 18, minBody: 40, variantGap: 20,
};
/** Frame around a page's state variants; `top` leaves room for the route label. */
const GROUP_PAD = { top: 34, side: 14, bottom: 14 };
const REGIONS = ['header', 'main', 'aside', 'footer'];
/**
 * elkjs runs in the browser, so the board's final layout is computed on load.
 * The Node-side layout above is the initial render and the offline fallback -
 * when this cannot be fetched the board still works, it just routes edges as
 * curves that may cross a card.
 */
const ELK_CDN = 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js';
/**
 * A trigger label has to read inside colGap, at roughly 6px per character, so it
 * wraps onto at most two lines. Truncating to a single line instead would cut
 * the tail - which for a Gherkin step is exactly where the distinguishing words
 * are ("... with a valid card" vs "... with a declined card").
 */
const EDGE_LABEL_CHARS = 26;
const EDGE_LABEL_LINES = 2;
const KINDS = new Set(['primary', 'alternate', 'error']);

/* ---------------------------------------------------------------- normalize */

function normalize(spec, opts) {
  const warnings = [];
  if (!spec || typeof spec !== 'object') throw new Error('sketch spec must be a JSON object');
  const rawScreens = Array.isArray(spec.screens) ? spec.screens : [];
  if (!rawScreens.length) throw new Error('sketch spec has no screens');

  const app = spec.app && typeof spec.app === 'object' ? spec.app : {};
  const platform = app.platform === 'mobile' ? 'mobile' : 'web';
  let viewport = typeof opts.viewport === 'string' ? opts.viewport : app.viewport;
  if (!CARD_W[viewport]) viewport = platform === 'mobile' ? 'mobile' : 'desktop';

  const seen = new Set();
  const screens = rawScreens.map((raw, i) => {
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : u.slug(raw.name || 'screen-' + i);
    if (seen.has(id)) {
      warnings.push('duplicate screen id "' + id + '" - renamed so transitions stay unambiguous');
      let n = 2;
      while (seen.has(id + '-' + n)) n += 1;
      id = id + '-' + n;
    }
    seen.add(id);

    const regions = {};
    const elementIds = new Map();
    const rawRegions = raw.regions && typeof raw.regions === 'object' ? raw.regions : {};
    for (const key of Object.keys(rawRegions)) {
      if (!REGIONS.includes(key)) {
        warnings.push('screen "' + id + '": unknown region "' + key + '" ignored');
        continue;
      }
      if (key === 'aside' && viewport === 'mobile') {
        warnings.push('screen "' + id + '": aside dropped on a mobile viewport');
        continue;
      }
      const els = (Array.isArray(rawRegions[key]) ? rawRegions[key] : []).filter((el) => el && typeof el === 'object');
      for (const el of els) {
        // radio/checkbox/list/table size from their items, so they sit in the
        // table with height 0 - membership, not truthiness, decides validity.
        if (!(el.type in ELEMENT_H)) {
          warnings.push('screen "' + id + '": unknown element type "' + String(el.type) + '" drawn as a placeholder');
        }
        if (typeof el.id === 'string' && el.id.trim()) {
          const eid = el.id.trim();
          if (elementIds.has(eid)) {
            warnings.push('screen "' + id + '": duplicate element id "' + eid + '" - only the first can be a transition anchor');
          } else {
            elementIds.set(eid, el);
            el.id = eid;
          }
        }
      }
      if (els.length) regions[key] = els;
    }
    if (!Object.keys(regions).length) warnings.push('screen "' + id + '" has no elements in any known region');

    return {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      route: typeof raw.route === 'string' ? raw.route : null,
      state: typeof raw.state === 'string' && raw.state.trim() ? raw.state.trim() : null,
      elementIds,
      purpose: typeof raw.purpose === 'string' ? raw.purpose : null,
      entry: Boolean(raw.entry),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
      source: raw.source && typeof raw.source === 'object' ? raw.source : null,
      notes: Array.isArray(raw.notes) ? raw.notes.filter((n) => typeof n === 'string') : [],
      regions,
    };
  });

  const byId = new Map(screens.map((s) => [s.id, s]));
  const transitions = [];
  for (const raw of Array.isArray(spec.transitions) ? spec.transitions : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (!byId.has(raw.from) || !byId.has(raw.to)) {
      throw new Error('transition ' + JSON.stringify(raw.from) + ' -> ' + JSON.stringify(raw.to) +
        ' references a screen id that does not exist; fix the spec rather than drawing a partial graph');
    }
    const trigger = typeof raw.trigger === 'string' ? raw.trigger : null;
    transitions.push({
      from: raw.from, to: raw.to,
      fromElement: resolveAnchor(byId.get(raw.from), raw, trigger),
      trigger,
      kind: KINDS.has(raw.kind) ? raw.kind : 'primary',
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
      source: raw.source && typeof raw.source === 'object' ? raw.source : null,
    });
  }

  return {
    app: { name: typeof app.name === 'string' ? app.name : null, platform, viewport },
    screens, transitions, groups: groupScreens(screens),
    openQuestions: (Array.isArray(spec.openQuestions) ? spec.openQuestions : []).filter((q) => typeof q === 'string'),
    warnings,
  };
}

/**
 * Which control does this transition leave from? An explicit `fromElement` wins;
 * otherwise the element whose `step` is the transition's `trigger`, preferring a
 * button or link. Returns an element id, or null to leave the arrow on the
 * card's edge. Elements matched by step get an id assigned so the renderer can
 * anchor to them.
 */
const ANCHOR_PREFERRED = new Set(['button', 'link']);

function resolveAnchor(screen, raw, trigger) {
  if (typeof raw.fromElement === 'string' && raw.fromElement.trim()) {
    const want = raw.fromElement.trim();
    if (!screen.elementIds.has(want)) {
      throw new Error('transition ' + JSON.stringify(raw.from) + ' -> ' + JSON.stringify(raw.to) +
        ' has fromElement ' + JSON.stringify(want) + ', which screen ' + JSON.stringify(raw.from) +
        ' does not define; fix the spec rather than dropping the anchor');
    }
    return want;
  }
  if (!trigger) return null;
  const hits = [];
  for (const region of REGIONS) {
    for (const el of screen.regions[region] || []) {
      if (typeof el.step === 'string' && el.step.trim() === trigger.trim()) hits.push(el);
    }
  }
  if (!hits.length) return null;
  const pick = hits.find((el) => ANCHOR_PREFERRED.has(el.type)) || hits[0];
  if (!pick.id) {
    let n = 1;
    let auto = 'auto-' + u.slug(String(pick.label || pick.type)).slice(0, 24);
    while (screen.elementIds.has(auto)) { n += 1; auto = auto + '-' + n; }
    pick.id = auto;
    screen.elementIds.set(auto, pick);
  }
  return pick.id;
}

/**
 * Screens sharing a route are one page in several data states, and are laid out
 * inside one labelled group. A screen with no route is its own group.
 */
function groupScreens(screens) {
  const groups = [];
  const byKey = new Map();
  screens.forEach((s, i) => {
    const key = s.route ? 'route:' + s.route : 'solo:' + s.id;
    if (!byKey.has(key)) {
      const g = { id: 'grp-' + groups.length, key, route: s.route, name: s.name, screens: [], order: i };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).screens.push(s);
    s.group = byKey.get(key).id;
  });
  for (const g of groups) g.variants = g.screens.length > 1;
  return groups;
}

/* ------------------------------------------------------------------- sizing */

function itemCount(el) {
  return Array.isArray(el.items) ? el.items.length : 0;
}

/** Height of one element, matching the CSS. */
function elementHeight(el) {
  const type = el.type;
  if (type === 'radio' || type === 'checkbox') {
    return (el.label ? LAYOUT.regionLabel : 0) + Math.max(1, itemCount(el)) * 24;
  }
  if (type === 'list') return Math.max(1, itemCount(el)) * 30 + (el.label ? LAYOUT.regionLabel : 0);
  if (type === 'table') {
    return ELEMENT_H.table + 3 * 24 + (el.label ? LAYOUT.regionLabel : 0);
  }
  return ELEMENT_H[type] === undefined ? PLACEHOLDER_H : ELEMENT_H[type];
}

const SPAN = { full: 1, half: 2, third: 3 };

/** Group elements into rows: consecutive half/third elements share one row. */
function rowsOf(elements) {
  const rows = [];
  let row = null;
  let capacity = 0;
  for (const el of elements) {
    const span = SPAN[el.width] || 1;
    if (span === 1) {
      rows.push({ els: [el], cols: 1 });
      row = null;
      capacity = 0;
      continue;
    }
    if (!row || capacity + 1 > span || row.cols !== span) {
      row = { els: [], cols: span };
      rows.push(row);
      capacity = 0;
    }
    row.els.push(el);
    capacity += 1;
    if (capacity >= span) { row = null; capacity = 0; }
  }
  for (const r of rows) r.h = Math.max(...r.els.map(elementHeight));
  return rows;
}

function regionHeight(elements) {
  const rows = rowsOf(elements);
  if (!rows.length) return 0;
  return rows.reduce((sum, r) => sum + r.h, 0) + (rows.length - 1) * LAYOUT.elGap + LAYOUT.regionPad * 2;
}

/**
 * The card's box, plus where every id-carrying element sits inside it.
 *
 * The y walk mirrors the CSS exactly - cardHead, then each region's padding,
 * rows and gaps - which is only reliable because every element renders at the
 * fixed height ELEMENT_H gives it. Those offsets become the ELK port positions,
 * so an arrow can start at the button the user clicks.
 */
function screenLayout(screen, viewport) {
  const w = CARD_W[viewport];
  const used = REGIONS.filter((r) => screen.regions[r]);
  const anchors = new Map();

  let y = LAYOUT.cardHead;
  used.forEach((region, ri) => {
    y += LAYOUT.regionPad;
    const rows = rowsOf(screen.regions[region]);
    rows.forEach((row, i) => {
      for (const el of row.els) {
        if (el.id) anchors.set(el.id, { y: y + elementHeight(el) / 2, h: elementHeight(el), region });
      }
      y += row.h;
      if (i < rows.length - 1) y += LAYOUT.elGap;
    });
    y += LAYOUT.regionPad;
    if (ri < used.length - 1) y += LAYOUT.regionGap;
  });

  const body = used.reduce((sum, r) => sum + regionHeight(screen.regions[r]), 0) +
    Math.max(0, used.length - 1) * LAYOUT.regionGap;
  const h = LAYOUT.border + LAYOUT.cardHead + Math.max(LAYOUT.minBody, body) + LAYOUT.regionPad;
  return { w, h, anchors };
}

/* ------------------------------------------------------------------- layout */

/**
 * Column (flow depth) per *group*, not per screen, so a page's state variants
 * always end up side by side.
 *
 * Breadth-first, so each group's column is its distance from an entry and is
 * assigned exactly once - a cycle in the flow cannot drag a group forward pass
 * after pass, which is what a longest-path relaxation would do.
 */
function assignColumns(model) {
  const { screens, groups, transitions } = model;
  const groupOf = new Map(screens.map((s) => [s.id, s.group]));
  const ids = groups.map((g) => g.id);

  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, new Set()]));
  for (const t of transitions) {
    const a = groupOf.get(t.from);
    const b = groupOf.get(t.to);
    if (a === b) continue;
    out.get(a).add(b);
  }
  for (const [a, targets] of out) for (const b of targets) indeg.set(b, indeg.get(b) + 1);

  // A screen no transition leads to *is* an entry, whether or not the spec said
  // so; `implied` reports the ones the spec should have marked.
  const screenIndeg = new Map(screens.map((s) => [s.id, 0]));
  for (const t of transitions) if (t.from !== t.to) screenIndeg.set(t.to, screenIndeg.get(t.to) + 1);
  const implied = screens.filter((s) => !s.entry && screenIndeg.get(s.id) === 0).map((s) => s.id);

  const rootSet = new Set(groups.filter((g) => g.screens.some((s) => s.entry)).map((g) => g.id));
  for (const id of ids) if (indeg.get(id) === 0) rootSet.add(id);
  if (!rootSet.size) rootSet.add(ids[0]);
  const roots = ids.filter((id) => rootSet.has(id));

  const col = new Map(ids.map((id) => [id, null]));
  for (const id of roots) col.set(id, 0);
  const queue = roots.slice();
  while (queue.length) {
    const id = queue.shift();
    for (const next of out.get(id)) {
      if (col.get(next) === null) { col.set(next, col.get(id) + 1); queue.push(next); }
    }
  }
  const maxCol = Math.max(0, ...ids.map((id) => col.get(id)).filter((c) => c !== null));
  for (const id of ids) if (col.get(id) === null) col.set(id, maxCol + 1);
  return { col, implied };
}

/**
 * The fallback layout, used as the initial render and kept when elkjs cannot be
 * fetched. Columns of groups, variants stacked inside their group.
 */
function layout(model) {
  const { screens, groups, app } = model;
  for (const s of screens) Object.assign(s, screenLayout(s, app.viewport));
  for (const g of groups) {
    const pad = g.variants ? GROUP_PAD : { top: 0, side: 0, bottom: 0 };
    g.pad = pad;
    g.w = pad.side * 2 + Math.max(...g.screens.map((s) => s.w));
    g.h = pad.top + pad.bottom + g.screens.reduce((n, s) => n + s.h, 0) +
      Math.max(0, g.screens.length - 1) * LAYOUT.variantGap;
  }

  const { col, implied } = assignColumns(model);
  for (const id of implied) {
    const s = screens.find((x) => x.id === id);
    s.entry = true;
    model.warnings.push('screen "' + id + '" has no incoming transition, so it is drawn as an entry - ' +
      'mark it "entry": true in the spec, or add the transition that reaches it');
  }

  const columns = new Map();
  for (const g of groups) {
    const c = col.get(g.id);
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c).push(g);
    g.col = c;
  }
  const colKeys = Array.from(columns.keys()).sort((a, b) => a - b);
  const colWidths = colKeys.map((c) => Math.max(...columns.get(c).map((g) => g.w)));
  const colHeights = colKeys.map((c) => {
    const list = columns.get(c);
    return list.reduce((sum, g) => sum + g.h, 0) + (list.length - 1) * LAYOUT.rowGap;
  });
  const tallest = Math.max(...colHeights, 0);

  let x = LAYOUT.pad;
  colKeys.forEach((c, i) => {
    const list = columns.get(c);
    let y = LAYOUT.pad + (tallest - colHeights[i]) / 2;
    for (const g of list) {
      g.x = Math.round(x);
      g.y = Math.round(y);
      let sy = g.pad.top;
      for (const s of g.screens) {
        // Offset inside the group, so the group can be moved as one unit - which
        // is exactly what the elk relayout does with it.
        s.inGroupX = g.pad.side;
        s.inGroupY = Math.round(sy);
        s.x = g.x + s.inGroupX;
        s.y = g.y + s.inGroupY;
        sy += s.h + LAYOUT.variantGap;
      }
      y += g.h + LAYOUT.rowGap;
    }
    x += colWidths[i] + LAYOUT.colGap;
  });

  return {
    width: Math.round(x - LAYOUT.colGap + LAYOUT.pad),
    height: Math.round(LAYOUT.pad * 2 + tallest),
    columns: colKeys.length,
  };
}

/* --------------------------------------------------------------- elk graph */

/**
 * The graph elkjs lays out in the browser.
 *
 * A group is one flat ELK node, never a subgraph: `elk.hierarchyHandling` of
 * INCLUDE_CHILDREN ignores a subgraph's own algorithm options (so variants would
 * not stack), and SEPARATE_CHILDREN turns the subgraph into a black box (so an
 * edge could no longer reach a port on a card inside it). Keeping groups flat
 * gives ELK the whole flow to route while this file keeps control of how variants
 * sit inside a group.
 *
 * A transition anchored to a control becomes an edge from a FIXED_POS port whose
 * y is the control's offset within its card plus the card's offset within its
 * group. Transitions between two variants of one page are not given to ELK at
 * all - they are drawn as a short connector in the gap between the two cards.
 */
function elkGraph(model) {
  const groupOf = new Map(model.screens.map((s) => [s.id, s.group]));
  const portId = (groupId, screenId, element) =>
    groupId + '::' + screenId + '::' + (element || '__edge');

  const crossing = [];
  const intra = [];
  model.transitions.forEach((t, i) => {
    (groupOf.get(t.from) === groupOf.get(t.to) ? intra : crossing).push({ index: i, t });
  });

  const children = model.groups.map((g) => {
    const node = { id: g.id, width: g.w, height: g.h };
    const ports = [];
    const add = (id, y) => {
      if (!ports.some((p) => p.id === id)) {
        ports.push({
          id, width: 1, height: 1, x: g.w, y: Math.round(y),
          layoutOptions: { 'elk.port.side': 'EAST' },
        });
      }
    };
    let needsDefault = false;
    for (const { t } of crossing) {
      if (groupOf.get(t.from) !== g.id) continue;
      const s = g.screens.find((x) => x.id === t.from);
      const a = t.fromElement && s.anchors.get(t.fromElement);
      if (a) add(portId(g.id, t.from, t.fromElement), s.inGroupY + a.y);
      else needsDefault = true;
    }
    // Once a node carries FIXED_POS ports, ELK pins every other edge leaving it
    // to the node's boundary origin - its top-right corner. So a group with any
    // anchored edge also gets one centred port for the rest.
    if (ports.length && needsDefault) add(portId(g.id, null, null), g.h / 2);
    if (ports.length) {
      node.ports = ports;
      node.layoutOptions = { 'elk.portConstraints': 'FIXED_POS' };
    }
    // Pin the groups the user starts from to the first layer, so the board reads
    // left-to-right from where a journey actually begins.
    if (g.screens.some((s) => s.entry)) {
      node.layoutOptions = Object.assign({}, node.layoutOptions, {
        'elk.layered.layering.layerConstraint': 'FIRST',
      });
    }
    return node;
  });

  const edges = crossing.map(({ index, t }) => {
    const from = groupOf.get(t.from);
    const s = model.screens.find((x) => x.id === t.from);
    const anchored = t.fromElement && s.anchors.has(t.fromElement);
    const node = children.find((c) => c.id === from);
    const source = anchored ? portId(from, t.from, t.fromElement)
      : (node.ports || []).some((p) => p.id === portId(from, null, null))
        ? portId(from, null, null) : from;
    return { id: 'e' + index, sources: [source], targets: [groupOf.get(t.to)] };
  });

  return {
    graph: {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYOUT.colGap),
        'elk.spacing.nodeNode': String(LAYOUT.rowGap),
        'elk.spacing.edgeNode': '24',
        'elk.spacing.edgeEdge': '14',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.padding': '[top=' + LAYOUT.pad + ',left=' + LAYOUT.pad +
          ',bottom=' + LAYOUT.pad + ',right=' + LAYOUT.pad + ']',
      },
      children,
      edges,
    },
    intra: intra.map(({ index, t }) => ({ edge: index, from: t.from, to: t.to })),
  };
}

/* -------------------------------------------------------------------- edges */

/**
 * The initial (and offline-fallback) edge path: a cubic bezier from a's edge to
 * b's, plus the label anchor at t=0.5. When elkjs loads it replaces these with
 * orthogonal routes that avoid the cards; without it these curves may cross one,
 * which is a legible board rather than a broken one.
 *
 * The start y honours the transition's anchor element, so even the fallback
 * leaves from roughly the right control.
 */
function edgeGeometry(a, b, transition) {
  const mid = (p0, p1, p2, p3) => (p0 + 3 * p1 + 3 * p2 + p3) / 8;
  const anchor = transition && transition.fromElement && a.anchors
    ? a.anchors.get(transition.fromElement) : null;
  const ay = a.y + (anchor ? anchor.y : a.h / 2);

  if (a.id === b.id) {
    const x = a.x + a.w;
    const y = a.y + a.h * 0.62;
    const r = 46;
    return {
      d: 'M ' + x + ' ' + y + ' C ' + (x + r) + ' ' + y + ' ' + (x + r) + ' ' + (y + r) +
        ' ' + x + ' ' + (y + r * 0.75),
      lx: x + r * 0.8, ly: y + r * 0.45,
    };
  }
  if (b.x > a.x) {
    const x0 = a.x + a.w;
    const x1 = b.x;
    const y1 = b.y + b.h / 2;
    const dx = Math.max(48, (x1 - x0) * 0.5);
    const c1 = x0 + dx;
    const c2 = x1 - dx;
    return {
      d: 'M ' + x0 + ' ' + ay + ' C ' + c1 + ' ' + ay + ' ' + c2 + ' ' + y1 + ' ' + x1 + ' ' + y1,
      lx: mid(x0, c1, c2, x1), ly: mid(ay, ay, y1, y1),
    };
  }
  // Backward or same column: leave the bottom, curve under, re-enter from below.
  const x0 = a.x + a.w / 2;
  const y0 = a.y + a.h;
  const x1 = b.x + b.w / 2;
  const y1 = b.y + b.h;
  const drop = 64 + Math.abs((a.col || 0) - (b.col || 0)) * 18;
  const c1y = y0 + drop;
  const c2y = y1 + drop;
  return {
    d: 'M ' + x0 + ' ' + y0 + ' C ' + x0 + ' ' + c1y + ' ' + x1 + ' ' + c2y + ' ' + x1 + ' ' + y1,
    lx: mid(x0, x0, x1, x1), ly: mid(y0, c1y, c2y, y1),
  };
}

/* ------------------------------------------------------------------- render */

function truncate(text, max) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Greedy word wrap for an edge label, falling back to a hard character cut for
 * scripts that do not space their words (a Chinese or Japanese Gherkin step).
 * Returns at most `lines` lines, with an ellipsis when text had to be dropped.
 */
function wrapLabel(text, maxChars, maxLines) {
  const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  let rest = clean;
  while (rest && out.length < maxLines) {
    if (rest.length <= maxChars) { out.push(rest); rest = ''; break; }
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) {
    const last = out[out.length - 1];
    out[out.length - 1] = last.slice(0, Math.max(1, maxChars - 1)).trim() + '…';
  }
  return out;
}

const e = u.escapeHtml;

function labelHtml(el) {
  if (!el.label) return '';
  return '<div class="lbl">' + e(el.label) + (el.required ? '<i class="req">*</i>' : '') + '</div>';
}

function boxHtml(el, extraClass) {
  const inner = el.value ? '<span class="val">' + e(el.value) + '</span>'
    : el.hint ? '<span class="hint">' + e(el.hint) + '</span>' : '';
  return '<div class="box ' + (extraClass || '') + '">' + inner + '</div>';
}

function renderElement(el) {
  const h = elementHeight(el);
  const items = Array.isArray(el.items) ? el.items : [];
  const emph = ['primary', 'secondary', 'danger', 'muted'].includes(el.emphasis) ? el.emphasis : '';
  const span = SPAN[el.width] || 1;
  let inner;

  switch (el.type) {
    case 'heading': inner = '<div class="wf-h">' + e(el.label) + '</div>'; break;
    case 'text': inner = '<div class="wf-t">' + e(el.label) + '</div>'; break;
    case 'input': case 'search': case 'date': case 'file':
      inner = labelHtml(el) + boxHtml(el, 'g-' + el.type); break;
    case 'select': inner = labelHtml(el) + boxHtml(el, 'g-select'); break;
    case 'textarea': inner = labelHtml(el) + boxHtml(el, 'tall'); break;
    case 'radio': case 'checkbox':
      inner = labelHtml(el) + '<div class="opts">' + (items.length ? items : ['']).map((it) =>
        '<div class="opt"><span class="mk ' + el.type + '"></span>' + e(it) + '</div>').join('') + '</div>';
      break;
    case 'button': inner = '<div class="btn ' + (emph || 'secondary') + '">' + e(el.label) + '</div>'; break;
    case 'link': inner = '<div class="wf-link">' + e(el.label) + '</div>'; break;
    case 'badge': inner = '<div class="wf-badge ' + emph + '">' + e(el.label) + '</div>'; break;
    case 'alert': inner = '<div class="wf-alert ' + emph + '">' + e(el.label) + '</div>'; break;
    case 'nav': case 'tabs': {
      const cur = Number(el.current);
      inner = '<div class="wf-' + el.type + '">' + (items.length ? items : [el.label || '']).map((it, i) =>
        '<span class="' + (i === cur ? 'on' : '') + '">' + e(it) + '</span>').join('') + '</div>';
      break;
    }
    case 'stepper': {
      const cur = Number(el.current);
      inner = '<div class="wf-step">' + (items.length ? items : [el.label || '']).map((it, i) =>
        '<span class="' + (i === cur ? 'on' : '') + '"><b>' + (i + 1) + '</b>' + e(it) + '</span>').join('') + '</div>';
      break;
    }
    case 'table': {
      const cols = Array.isArray(el.columns) && el.columns.length ? el.columns : [el.label || ''];
      inner = labelHtml(el) + '<div class="wf-table"><div class="tr th">' +
        cols.map((c) => '<span>' + e(c) + '</span>').join('') + '</div>' +
        [0, 1, 2].map(() => '<div class="tr">' + cols.map(() => '<span><i></i></span>').join('') + '</div>').join('') +
        '</div>';
      break;
    }
    case 'list':
      inner = labelHtml(el) + '<div class="wf-list">' + (items.length ? items : ['']).map((it) =>
        '<div class="li">' + e(it) + '</div>').join('') + '</div>';
      break;
    case 'card': inner = '<div class="wf-card">' + e(el.label) + (el.value ? '<b>' + e(el.value) + '</b>' : '') + '</div>'; break;
    case 'image': inner = '<div class="wf-img"></div>'; break;
    case 'chart': inner = '<div class="wf-chart">' + [38, 62, 46, 80, 55].map((p) =>
      '<i style="height:' + p + '%"></i>').join('') + '</div>'; break;
    case 'empty': inner = '<div class="wf-empty">' + e(el.label || '') + '</div>'; break;
    case 'spinner': inner = '<div class="wf-spin"></div>'; break;
    case 'pagination': inner = '<div class="wf-page">' + ['1', '2', '3', '…'].map((p, i) =>
      '<span class="' + (i === 0 ? 'on' : '') + '">' + p + '</span>').join('') + '</div>'; break;
    case 'divider': inner = '<div class="wf-div"></div>'; break;
    default:
      inner = '<div class="wf-unknown">' + e(String(el.type || '?')) +
        (el.label ? ': ' + e(el.label) : '') + '</div>';
  }

  const title = el.step ? ' title="' + e(el.step) + '"' : '';
  return '<div class="el s' + span + '" style="height:' + h + 'px"' + title + '>' + inner + '</div>';
}

function renderRegion(name, elements) {
  const rows = rowsOf(elements).map((r) =>
    '<div class="row">' + r.els.map(renderElement).join('') + '</div>').join('');
  return '<div class="rg rg-' + name + '">' + rows + '</div>';
}

function renderCard(screen, model, L) {
  const chips = screen.tags.map((t) =>
    '<span class="chip' + (u.REQ_TAG.test(t) ? ' req' : '') + '">' + e(t) + '</span>').join('');
  const frame = model.app.platform === 'mobile'
    ? '<div class="frame mobile"><span></span><span></span><span></span></div>'
    : '<div class="frame web"><i></i><i></i><i></i><em>' + e(screen.route || '') + '</em></div>';
  const body = REGIONS.filter((r) => screen.regions[r])
    .map((r) => renderRegion(r, screen.regions[r])).join('');

  const state = screen.state
    ? '<span class="state" title="' + e(L.state) + '">' + e(screen.state) + '</span>' : '';
  return '<article class="scr' + (screen.entry ? ' entry' : '') + '" id="scr-' + e(screen.id) + '"' +
    ' data-id="' + e(screen.id) + '" data-group="' + e(screen.group) + '" tabindex="0"' +
    ' style="left:' + screen.x + 'px;top:' + screen.y + 'px;width:' + screen.w + 'px;height:' + screen.h + 'px">' +
    frame +
    '<header><h3>' + e(screen.name) + state +
    (screen.entry ? '<span class="tagline">' + e(L.entry) + '</span>' : '') + '</h3>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') + '</header>' +
    '<div class="scr-body">' + body + '</div></article>';
}

/** One labelled frame per page that has more than one data state. */
function renderGroups(model, L) {
  return model.groups.filter((g) => g.variants).map((g) =>
    '<div class="grp" data-group="' + e(g.id) + '"' +
    ' style="left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px">' +
    '<span class="grp-label"><b>' + e(g.name) + '</b>' +
    (g.route ? '<code>' + e(g.route) + '</code>' : '') +
    '<i>' + g.screens.length + ' ' + e(L.states) + '</i></span></div>').join('');
}

function renderEdges(model, size, L) {
  const byId = new Map(model.screens.map((s) => [s.id, s]));
  const paths = [];
  const labels = [];
  model.transitions.forEach((t, i) => {
    const g = edgeGeometry(byId.get(t.from), byId.get(t.to), t);
    paths.push('<path class="edge k-' + t.kind + '" data-edge="' + i + '" data-from="' + e(t.from) +
      '" data-to="' + e(t.to) + '" d="' + g.d + '" marker-end="url(#arw-' + t.kind + ')"></path>');
    const lines = wrapLabel(t.trigger, EDGE_LABEL_CHARS, EDGE_LABEL_LINES);
    if (lines.length) {
      const x = Math.round(g.lx);
      // Lift the block by half its extra height so it stays centred on the path.
      const y = Math.round(g.ly - (lines.length - 1) * 6.5);
      labels.push('<text class="edgelbl" data-edge="' + i + '" data-from="' + e(t.from) + '" data-to="' + e(t.to) +
        '" x="' + x + '" y="' + y + '">' +
        lines.map((ln, n) => '<tspan x="' + x + '" dy="' + (n === 0 ? '0' : '1.15em') + '">' +
          e(ln) + '</tspan>').join('') + '</text>');
    }
  });
  const marker = (id, cls) => '<marker id="arw-' + id + '" viewBox="0 0 10 10" refX="9" refY="5" ' +
    'markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path class="' + cls + '" d="M 0 0 L 10 5 L 0 10 z"></path></marker>';
  const svg = (cls, inner, defs) => '<svg class="' + cls + '" width="' + size.width + '" height="' +
    size.height + '"' + (defs ? ' aria-label="' + e(L.diagram) + '"' : ' aria-hidden="true"') + '>' +
    (defs ? '<defs>' + marker('primary', 'm-primary') + marker('alternate', 'm-alternate') +
      marker('error', 'm-error') + '</defs>' : '') + inner + '</svg>';
  // Paths sit under the cards; labels sit over them, so a trigger label is never
  // hidden behind the screen it points at.
  return {
    paths: svg('edges', paths.join(''), true),
    labels: svg('edgelabels', labels.join(''), false),
  };
}

function mermaidOf(model) {
  const ids = new Map(model.screens.map((s, i) => [s.id, 'n' + i]));
  const clean = (t) => String(t).replace(/"/g, "'").replace(/[[\]{}()<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = ['graph LR'];
  for (const s of model.screens) {
    const detail = s.route && s.route !== s.name ? '<br/>' + clean(s.route) : '';
    lines.push('  ' + ids.get(s.id) + '["' + clean(s.name) + detail + '"]');
  }
  for (const t of model.transitions) {
    const arrow = t.kind === 'error' ? '-.->' : t.kind === 'alternate' ? '-->' : '==>';
    const label = t.trigger ? '|"' + clean(truncate(t.trigger, 44)) + '"|' : '';
    lines.push('  ' + ids.get(t.from) + ' ' + arrow + label + ' ' + ids.get(t.to));
  }
  for (const s of model.screens) if (s.entry) lines.push('  style ' + ids.get(s.id) + ' stroke-width:3px');
  return lines.join('\n');
}

/* ----------------------------------------------------------------- board CSS */

/**
 * Element heights come from the inline `height` the renderer writes, so this CSS
 * only has to keep each glyph inside its box - it never has to agree with
 * ELEMENT_H arithmetically. `.el { overflow: hidden }` is what makes that safe.
 */
const BOARD_CSS = `
.wrap { max-width: none; padding: 28px 24px 40px; }
.board {
  position: relative; overflow: hidden; height: min(78vh, 900px);
  border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--bg); background-image: radial-gradient(var(--line) 1px, transparent 1px);
  background-size: 22px 22px; cursor: grab; touch-action: none;
}
.board.drag { cursor: grabbing; }
.board.sel .edge, .board.sel .edgelbl { opacity: .16; }
.board.sel .edge.hot, .board.sel .edgelbl.hot { opacity: 1; }
.board.sel .scr { opacity: .5; }
.board.sel .scr.hot { opacity: 1; }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.edges, .edgelabels { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.edge { fill: none; stroke: var(--muted); stroke-width: 2; }
.edge.k-alternate { stroke-width: 1.25; stroke-dasharray: 1 0; }
.edge.k-error { stroke: var(--bad); stroke-dasharray: 6 4; }
.edge.hot { stroke: var(--accent); stroke-width: 2.75; }
.m-primary, .m-alternate { fill: var(--muted); }
.m-error { fill: var(--bad); }
.edgelbl {
  font: 500 11.5px var(--sans); fill: var(--muted); text-anchor: middle;
  paint-order: stroke; stroke: var(--bg); stroke-width: 5px; stroke-linejoin: round;
}
.edgelbl.hot { fill: var(--accent); }

/* --- screen card ------------------------------------------------------- */
.scr {
  position: absolute; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .07); cursor: pointer;
}
.scr.entry { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.scr.hot { border-color: var(--accent); }
.scr:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.scr .frame { height: 22px; flex: none; display: flex; align-items: center; gap: 4px;
  padding: 0 8px; background: var(--chip); border-bottom: 1px solid var(--line-soft); }
.scr .frame i { width: 7px; height: 7px; border-radius: 50%; background: var(--line); flex: none; }
.scr .frame em { flex: 1; font: 400 10.5px var(--mono); font-style: normal; color: var(--muted);
  background: var(--panel); border-radius: 4px; padding: 1px 6px; margin-left: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr .frame.mobile { justify-content: flex-end; }
.scr .frame.mobile span { width: 12px; height: 6px; border-radius: 2px; background: var(--line); }
.scr > header { height: 36px; flex: none; padding: 0 10px; display: flex; align-items: center;
  justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); }
.scr > header h3 { margin: 0; font-size: var(--fs-sm); font-weight: 650; display: flex;
  align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr .tagline { font: 600 9.5px var(--sans); text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); background: var(--accent-soft); border-radius: 3px; padding: 1px 4px; }
.scr .chips { display: flex; gap: 3px; flex: none; }
.scr .chips .chip { font-size: 9.5px; padding: 0 4px; }
.scr-body { flex: 1; display: flex; flex-direction: column; gap: 10px;
  padding-bottom: 12px; overflow: hidden; }
.rg { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.rg-header { background: var(--chip); }
.rg-aside { background: var(--line-soft); }
.rg-footer { box-shadow: inset 0 1px 0 var(--line); }
.row { display: flex; gap: 8px; align-items: stretch; }
.el { overflow: hidden; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.el.s1 { flex: 1 1 100%; }
.el.s2 { flex: 1 1 calc(50% - 4px); min-width: 0; }
.el.s3 { flex: 1 1 calc(33.33% - 6px); min-width: 0; }

/* --- wireframe glyphs (greyscale on purpose: this is a sketch, not a design) */
.lbl { font-size: 11px; color: var(--muted); line-height: 1.5; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.lbl .req { color: var(--bad); font-style: normal; margin-left: 2px; }
.box { flex: 1; min-height: 30px; border: 1px solid var(--line); border-radius: 5px;
  background: var(--bg); display: flex; align-items: center; padding: 0 8px; font-size: 12px;
  overflow: hidden; }
.box.tall { align-items: flex-start; padding-top: 6px; }
.box .val { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.box .hint { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.box.g-select::after { content: ''; margin-left: auto; flex: none; width: 0; height: 0;
  border: 4px solid transparent; border-top-color: var(--muted); transform: translateY(2px); }
.box.g-search::before { content: ''; flex: none; width: 9px; height: 9px; margin-right: 6px;
  border: 1.5px solid var(--muted); border-radius: 50%; }
.box.g-date::after { content: ''; margin-left: auto; flex: none; width: 10px; height: 10px;
  border: 1.5px solid var(--muted); border-radius: 2px; border-top-width: 3px; }
.box.g-file::before { content: '↑'; flex: none; margin-right: 6px; color: var(--muted); }
.wf-h { font-size: var(--fs-md); font-weight: 650; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.wf-t { font-size: 12px; color: var(--muted); overflow: hidden; }
.btn { flex: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; overflow: hidden; white-space: nowrap; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { border: 1px solid var(--muted); color: var(--ink); }
.btn.danger { background: var(--bad); color: #fff; }
.btn.muted { background: var(--chip); color: var(--muted); }
.wf-link { font-size: 12px; color: var(--accent); text-decoration: underline; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; }
.wf-badge { align-self: flex-start; font-size: 10.5px; font-weight: 600; border-radius: 999px;
  padding: 2px 8px; background: var(--chip); color: var(--muted); }
.wf-badge.primary { background: var(--accent-soft); color: var(--accent); }
.wf-badge.danger { background: var(--bad); color: #fff; }
.wf-badge.secondary { background: var(--chip); color: var(--ink); }
.wf-alert { flex: 1; border-radius: 5px; display: flex; align-items: center; padding: 0 8px;
  font-size: 11.5px; background: var(--chip); color: var(--muted); border-left: 3px solid var(--muted);
  overflow: hidden; }
.wf-alert.primary { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); }
.wf-alert.danger { background: var(--panel); color: var(--bad); border-left-color: var(--bad); }
.wf-alert.secondary { border-left-color: var(--warn); color: var(--warn); }
.opts { display: flex; flex-direction: column; gap: 4px; }
.opt { display: flex; align-items: center; gap: 6px; font-size: 11.5px; height: 20px;
  white-space: nowrap; overflow: hidden; }
.mk { flex: none; width: 11px; height: 11px; border: 1.5px solid var(--muted); }
.mk.radio { border-radius: 50%; }
.mk.checkbox { border-radius: 2px; }
.wf-nav, .wf-tabs, .wf-page { display: flex; align-items: center; gap: 12px; font-size: 11.5px;
  color: var(--muted); overflow: hidden; flex: 1; }
.wf-nav span, .wf-tabs span { white-space: nowrap; }
.wf-nav span.on, .wf-tabs span.on { color: var(--ink); font-weight: 600; }
.wf-tabs { border-bottom: 1px solid var(--line); align-items: flex-end; padding-bottom: 4px; }
.wf-tabs span.on { border-bottom: 2px solid var(--accent); padding-bottom: 3px; margin-bottom: -6px; }
.wf-page { justify-content: center; gap: 6px; }
.wf-page span { width: 20px; height: 20px; border: 1px solid var(--line); border-radius: 4px;
  display: flex; align-items: center; justify-content: center; }
.wf-page span.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.wf-step { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--muted);
  overflow: hidden; flex: 1; }
.wf-step span { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.wf-step b { width: 16px; height: 16px; border-radius: 50%; background: var(--chip);
  display: flex; align-items: center; justify-content: center; font-size: 9.5px; }
.wf-step span.on { color: var(--ink); font-weight: 600; }
.wf-step span.on b { background: var(--accent); color: #fff; }
.wf-table { flex: 1; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
.wf-table .tr { display: flex; height: 24px; align-items: center; border-top: 1px solid var(--line-soft); }
.wf-table .tr.th { height: 30px; background: var(--chip); border-top: 0; font-weight: 600; }
.wf-table .tr span { flex: 1; padding: 0 8px; font-size: 11px; min-width: 0; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; }
.wf-table .tr span i { display: block; height: 6px; width: 62%; border-radius: 3px; background: var(--line); }
.wf-list { flex: 1; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
.wf-list .li { height: 30px; display: flex; align-items: center; padding: 0 8px; font-size: 11.5px;
  border-top: 1px solid var(--line-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wf-list .li:first-child { border-top: 0; }
.wf-card { flex: 1; border: 1px solid var(--line); border-radius: 6px; background: var(--bg);
  display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 10px;
  font-size: 11.5px; color: var(--muted); overflow: hidden; }
.wf-card b { font-size: var(--fs-md); color: var(--ink); }
.wf-img { flex: 1; border: 1px solid var(--line); border-radius: 5px; background:
  linear-gradient(to top right, transparent calc(50% - 1px), var(--line) 50%, transparent calc(50% + 1px)),
  linear-gradient(to bottom right, transparent calc(50% - 1px), var(--line) 50%, transparent calc(50% + 1px)); }
.wf-chart { flex: 1; display: flex; align-items: flex-end; gap: 6px; padding: 6px 4px 0;
  border-bottom: 1px solid var(--line); }
.wf-chart i { flex: 1; background: var(--line); border-radius: 2px 2px 0 0; }
.wf-empty { flex: 1; border: 1px dashed var(--line); border-radius: 5px; display: flex;
  align-items: center; justify-content: center; font-size: 11.5px; color: var(--muted);
  text-align: center; padding: 0 8px; overflow: hidden; }
.wf-spin { align-self: center; width: 22px; height: 22px; border-radius: 50%;
  border: 2.5px solid var(--line); border-top-color: var(--muted); }
.wf-div { height: 1px; background: var(--line); margin: 8px 0; }
.wf-unknown { flex: 1; border: 1px dashed var(--bad); border-radius: 5px; display: flex;
  align-items: center; padding: 0 8px; font: 500 11px var(--mono); color: var(--bad); overflow: hidden; }

/* --- variant group frame ----------------------------------------------- */
.grp {
  position: absolute; border: 1px dashed var(--line); border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 45%, transparent);
}
.grp-label {
  position: absolute; top: 9px; left: 14px; right: 14px; display: flex;
  align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--muted);
  white-space: nowrap; overflow: hidden;
}
.grp-label b { font-size: var(--fs-sm); color: var(--ink); font-weight: 650; }
.grp-label code { font: 400 11px var(--mono); background: var(--chip);
  border-radius: 4px; padding: 1px 6px; }
.grp-label i { font-style: normal; margin-left: auto; }
.scr .state {
  font: 600 10px var(--sans); color: var(--warn); background: var(--chip);
  border-radius: 3px; padding: 1px 5px; white-space: nowrap;
}
.detail .sibs { display: flex; gap: 6px; flex-wrap: wrap; }
.detail .sibs button {
  font: 600 var(--fs-xs) var(--sans); color: var(--ink); background: var(--chip);
  border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; cursor: pointer;
}
.detail .sibs button:hover { border-color: var(--accent); color: var(--accent); }
.layoutnote { font-size: var(--fs-xs); color: var(--muted); }
.layoutnote.warn { color: var(--warn); }

/* --- board chrome ------------------------------------------------------ */
.tools { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; flex-wrap: wrap; }
.tools button { font: 600 var(--fs-sm) var(--sans); color: var(--ink); background: var(--panel);
  border: 1px solid var(--line); border-radius: 6px; padding: 5px 11px; cursor: pointer; }
.tools button:hover { border-color: var(--accent); color: var(--accent); }
.tools .zoomval { font: 500 var(--fs-sm) var(--mono); color: var(--muted); min-width: 52px; }
.tools .spacer { flex: 1; }
.legend { display: flex; gap: 14px; font-size: var(--fs-xs); color: var(--muted); flex-wrap: wrap; }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i { width: 22px; height: 0; border-top: 2px solid var(--muted); }
.legend i.alt { border-top-width: 1px; }
.legend i.err { border-top-style: dashed; border-top-color: var(--bad); }
.legend i.ent { width: 12px; height: 12px; border: 2px solid var(--accent); border-radius: 3px; }
.detail { margin-top: 14px; }
.detail .empty { color: var(--muted); font-size: var(--fs-sm); }
.detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
.detail dt { font-size: var(--fs-xs); font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: .05em; padding-top: 2px; }
.detail dd { margin: 0; font-size: var(--fs-sm); }
.detail dd code { font: 400 var(--fs-sm) var(--mono); }
.detail ul { margin: 0; padding-left: 18px; }
.qs { list-style: none; margin: 0; padding: 0; }
.qs li { padding: 7px 0 7px 22px; position: relative; font-size: var(--fs-sm);
  border-top: 1px solid var(--line-soft); }
.qs li:first-child { border-top: 0; }
.qs li::before { content: '?'; position: absolute; left: 0; top: 7px; width: 15px; height: 15px;
  border-radius: 50%; background: var(--warn); color: var(--panel); font: 700 10px var(--sans);
  display: flex; align-items: center; justify-content: center; }
@media print { .board { height: auto; overflow: visible; } .tools { display: none; } }
`;

/* ------------------------------------------------------------- board script */

const BOARD_JS = [
  '(function () {',
  '  var board = document.getElementById("board");',
  '  var stage = document.getElementById("stage");',
  '  var zoomOut = document.getElementById("zoomval");',
  '  var model = JSON.parse(document.getElementById("sketch-model").textContent);',
  '  var W = Number(stage.dataset.w), H = Number(stage.dataset.h);',
  '  var s = 1, tx = 0, ty = 0, sel = null;',
  '',
  '  function apply() {',
  '    stage.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";',
  '    zoomOut.textContent = Math.round(s * 100) + "%";',
  '  }',
  '  function fit() {',
  '    var r = board.getBoundingClientRect();',
  '    s = Math.min(r.width / (W + 32), r.height / (H + 32), 1);',
  '    tx = (r.width - W * s) / 2; ty = (r.height - H * s) / 2;',
  '    apply();',
  '  }',
  '  function zoomAt(factor, cx, cy) {',
  '    var next = Math.max(0.12, Math.min(2.5, s * factor));',
  '    var r = board.getBoundingClientRect();',
  '    var px = (cx === undefined ? r.width / 2 : cx - r.left);',
  '    var py = (cy === undefined ? r.height / 2 : cy - r.top);',
  '    tx = px - (px - tx) * (next / s); ty = py - (py - ty) * (next / s);',
  '    s = next; apply();',
  '  }',
  '',
  '  board.addEventListener("wheel", function (ev) {',
  '    ev.preventDefault();',
  '    if (ev.ctrlKey || ev.metaKey) zoomAt(ev.deltaY < 0 ? 1.09 : 1 / 1.09, ev.clientX, ev.clientY);',
  '    else { tx -= ev.deltaX; ty -= ev.deltaY; apply(); }',
  '  }, { passive: false });',
  '',
  '  var dragging = false, moved = 0, lx = 0, ly = 0;',
  '  board.addEventListener("pointerdown", function (ev) {',
  '    if (ev.button !== 0) return;',
  '    dragging = true; moved = 0; lx = ev.clientX; ly = ev.clientY;',
  '    board.classList.add("drag"); board.setPointerCapture(ev.pointerId);',
  '  });',
  '  board.addEventListener("pointermove", function (ev) {',
  '    if (!dragging) return;',
  '    var dx = ev.clientX - lx, dy = ev.clientY - ly;',
  '    moved += Math.abs(dx) + Math.abs(dy);',
  '    tx += dx; ty += dy; lx = ev.clientX; ly = ev.clientY; apply();',
  '  });',
  '  board.addEventListener("pointerup", function (ev) {',
  '    if (!dragging) return;',
  '    dragging = false; board.classList.remove("drag");',
  '    if (moved > 5) return;',
  '    var card = ev.target.closest ? ev.target.closest(".scr") : null;',
  '    select(card ? card.dataset.id : null);',
  '  });',
  '',
  '  function select(id) {',
  '    sel = (id && sel === id) ? null : id;',
  '    board.classList.toggle("sel", Boolean(sel));',
  '    var i, els = stage.querySelectorAll(".scr, .edge, .edgelbl");',
  '    for (i = 0; i < els.length; i += 1) els[i].classList.remove("hot");',
  '    if (!sel) { renderDetail(null); return; }',
  '    var own = stage.querySelector(\'.scr[data-id="\' + sel + \'"]\');',
  '    if (own) own.classList.add("hot");',
  '    var linked = stage.querySelectorAll(\'[data-from="\' + sel + \'"], [data-to="\' + sel + \'"]\');',
  '    for (i = 0; i < linked.length; i += 1) {',
  '      linked[i].classList.add("hot");',
  '      var other = linked[i].dataset.from === sel ? linked[i].dataset.to : linked[i].dataset.from;',
  '      var peer = stage.querySelector(\'.scr[data-id="\' + other + \'"]\');',
  '      if (peer) peer.classList.add("hot");',
  '    }',
  '    renderDetail(sel);',
  '  }',
  '',
  '  var detail = document.getElementById("detail");',
  '  function esc(t) {',
  '    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");',
  '  }',
  '  function renderDetail(id) {',
  '    if (!id) { detail.innerHTML = \'<div class="empty">\' + esc(model.L.selectHint) + "</div>"; return; }',
  '    var sc = model.screens.filter(function (x) { return x.id === id; })[0];',
  '    if (!sc) return;',
  '    var rows = [];',
  '    function row(k, v) { if (v) rows.push("<dt>" + esc(k) + "</dt><dd>" + v + "</dd>"); }',
  '    row(model.L.screen, "<strong>" + esc(sc.name) + "</strong>" +',
  '      (sc.route ? \' <code>\' + esc(sc.route) + "</code>" : ""));',
  '    if (sc.state) row(model.L.state, esc(sc.state));',
  '    row(model.L.purpose, esc(sc.purpose));',
  '    row(model.L.source, sc.source ? "<code>" + esc(sc.source.uri || "") +',
  '      (sc.source.line ? ":" + esc(sc.source.line) : "") + "</code>" : "");',
  '    row(model.L.tags, sc.tags.length ? sc.tags.map(function (t) {',
  '      return \'<span class="chip">\' + esc(t) + "</span>"; }).join(" ") : "");',
  '    var ins = model.transitions.filter(function (t) { return t.to === id && t.from !== id; });',
  '    var outs = model.transitions.filter(function (t) { return t.from === id && t.to !== id; });',
  '    function edgeList(list, key) {',
  '      return \'<ul>\' + list.map(function (t) {',
  '        var peer = model.screens.filter(function (x) { return x.id === t[key]; })[0];',
  '        return "<li><strong>" + esc(peer ? peer.name : t[key]) + "</strong>" +',
  '          (t.trigger ? \' <span class="sub">\' + esc(t.trigger) + "</span>" : "") + "</li>";',
  '      }).join("") + "</ul>";',
  '    }',
  '    row(model.L.incoming, ins.length ? edgeList(ins, "from") : "");',
  '    row(model.L.outgoing, outs.length ? edgeList(outs, "to") : "");',
  '    row(model.L.notes, sc.notes.length ? "<ul>" + sc.notes.map(function (n) {',
  '      return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "");',
  '    row(model.L.otherStates, sc.siblings.length ? \'<div class="sibs">\' +',
  '      sc.siblings.map(function (sib) {',
  '        return \'<button type="button" data-goto="\' + esc(sib.id) + \'">\' +',
  '          esc(sib.state || sib.name) + "</button>";',
  '      }).join("") + "</div>" : "");',
  '    var steps = [];',
  '    Object.keys(sc.steps || {}).forEach(function (k) { steps.push(sc.steps[k]); });',
  '    row(model.L.derivedFrom, steps.length ? "<ul>" + steps.map(function (st) {',
  '      return "<li><code>" + esc(st) + "</code></li>"; }).join("") + "</ul>" : "");',
  '    detail.innerHTML = "<dl>" + rows.join("") + "</dl>";',
  '  }',
  '',
  '  detail.addEventListener("click", function (ev) {',
  '    var btn = ev.target.closest ? ev.target.closest("[data-goto]") : null;',
  '    if (!btn) return;',
  '    sel = null;',
  '    select(btn.dataset.goto);',
  '  });',
  '',
  '  document.getElementById("zin").addEventListener("click", function () { zoomAt(1.2); });',
  '  document.getElementById("zoutb").addEventListener("click", function () { zoomAt(1 / 1.2); });',
  '  document.getElementById("zfit").addEventListener("click", fit);',
  '  document.getElementById("zone").addEventListener("click", function () {',
  '    zoomAt(1 / s); tx = 24; ty = 24; apply();',
  '  });',
  '  document.addEventListener("keydown", function (ev) {',
  '    if (ev.target !== document.body && !ev.target.classList.contains("scr")) return;',
  '    if (ev.key === "Escape") select(null);',
  '    else if (ev.key === "+" || ev.key === "=") zoomAt(1.2);',
  '    else if (ev.key === "-") zoomAt(1 / 1.2);',
  '    else if (ev.key === "0") fit();',
  '    else return;',
  '    ev.preventDefault();',
  '  });',
  '  stage.addEventListener("keydown", function (ev) {',
  '    var card = ev.target.closest ? ev.target.closest(".scr") : null;',
  '    if (card && (ev.key === "Enter" || ev.key === " ")) { select(card.dataset.id); ev.preventDefault(); }',
  '  });',
  '',
  '  renderDetail(null);',
  '  fit();',
  '  window.addEventListener("resize", fit);',
  '',
  '  // ---- elkjs relayout -------------------------------------------------',
  '  // The board is already usable with the Node-side layout. If elkjs loads,',
  '  // it recomputes positions and routes every edge orthogonally so no arrow',
  '  // crosses a card; if it does not, we keep what is on screen.',
  '  var status = document.getElementById("layoutnote");',
  '  function polyPath(pts, r) {',
  '    if (pts.length < 2) return "";',
  '    var d = "M " + pts[0].x + " " + pts[0].y;',
  '    for (var i = 1; i < pts.length - 1; i += 1) {',
  '      var p = pts[i], a = pts[i - 1], b = pts[i + 1];',
  '      var la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);',
  '      if (!la || !lb) continue;',
  '      var ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);',
  '      d += " L " + (p.x + (a.x - p.x) / la * ra) + " " + (p.y + (a.y - p.y) / la * ra);',
  '      d += " Q " + p.x + " " + p.y + " " + (p.x + (b.x - p.x) / lb * rb) + " " + (p.y + (b.y - p.y) / lb * rb);',
  '    }',
  '    var last = pts[pts.length - 1];',
  '    return d + " L " + last.x + " " + last.y;',
  '  }',
  '  var groupById = {};',
  '  model.groups.forEach(function (g) { groupById[g.id] = g; });',
  '',
  '  function place(laid) {',
  '    (laid.children || []).forEach(function (c) {',
  '      var g = groupById[c.id];',
  '      if (!g) return;',
  '      var frame = stage.querySelector(\'.grp[data-group="\' + c.id + \'"]\');',
  '      if (frame) {',
  '        frame.style.left = c.x + "px"; frame.style.top = c.y + "px";',
  '        frame.style.width = c.width + "px"; frame.style.height = c.height + "px";',
  '      }',
  '      g.screens.forEach(function (sc) {',
  '        var card = stage.querySelector(\'.scr[data-id="\' + sc.id + \'"]\');',
  '        if (!card) return;',
  '        card.style.left = (c.x + sc.x) + "px";',
  '        card.style.top = (c.y + sc.y) + "px";',
  '      });',
  '    });',
  '  }',
  '',
  '  // Variant-to-variant transitions are not in the elk graph: the two cards are',
  '  // stacked with a fixed gap, so a short connector in that gap is both simpler',
  '  // and clearer than an orthogonal route around the group.',
  '  function drawIntra() {',
  '    model.intra.forEach(function (link) {',
  '      var path = stage.querySelector(\'.edge[data-edge="\' + link.edge + \'"]\');',
  '      if (!path) return;',
  '      var a = stage.querySelector(\'.scr[data-id="\' + link.from + \'"]\');',
  '      var b = stage.querySelector(\'.scr[data-id="\' + link.to + \'"]\');',
  '      if (!a || !b) return;',
  '      var ax = parseFloat(a.style.left), ay = parseFloat(a.style.top);',
  '      var aw = parseFloat(a.style.width), ah = parseFloat(a.style.height);',
  '      var bx = parseFloat(b.style.left), by = parseFloat(b.style.top);',
  '      var bw = parseFloat(b.style.width), bh = parseFloat(b.style.height);',
  '      var d, mid;',
  '      if (link.from === link.to) {',
  '        var lx = ax + aw, ly = ay + ah * 0.62;',
  '        d = "M " + lx + " " + ly + " C " + (lx + 44) + " " + ly + " " + (lx + 44) + " " +',
  '          (ly + 44) + " " + lx + " " + (ly + 34);',
  '        mid = { x: lx + 34, y: ly + 20 };',
  '      } else if (by >= ay + ah - 1) {',
  '        d = "M " + (ax + aw / 2) + " " + (ay + ah) + " L " + (bx + bw / 2) + " " + by;',
  '        mid = { x: (ax + aw / 2 + bx + bw / 2) / 2, y: (ay + ah + by) / 2 };',
  '      } else if (ay >= by + bh - 1) {',
  '        d = "M " + (ax + aw / 2) + " " + ay + " L " + (bx + bw / 2) + " " + (by + bh);',
  '        mid = { x: (ax + aw / 2 + bx + bw / 2) / 2, y: (ay + by + bh) / 2 };',
  '      } else {',
  '        d = "M " + (ax + aw) + " " + (ay + ah / 2) + " L " + bx + " " + (by + bh / 2);',
  '        mid = { x: (ax + aw + bx) / 2, y: (ay + ah / 2 + by + bh / 2) / 2 };',
  '      }',
  '      path.setAttribute("d", d);',
  '      var lbl = stage.querySelector(\'.edgelbl[data-edge="\' + link.edge + \'"]\');',
  '      if (lbl) moveLabel(lbl, mid);',
  '    });',
  '  }',
  '',
  '  function moveLabel(lbl, at) {',
  '    var spans = lbl.querySelectorAll("tspan");',
  '    lbl.setAttribute("x", Math.round(at.x));',
  '    lbl.setAttribute("y", Math.round(at.y - (spans.length - 1) * 6.5));',
  '    for (var i = 0; i < spans.length; i += 1) spans[i].setAttribute("x", Math.round(at.x));',
  '  }',
  '  // An orthogonal route\'s midpoint often lands on a vertical leg beside a',
  '  // card; its longest horizontal run is the readable place for the label.',
  '  function labelAnchor(pts) {',
  '    var best = null, bestLen = -1;',
  '    for (var i = 1; i < pts.length; i += 1) {',
  '      if (Math.abs(pts[i].y - pts[i - 1].y) > 1) continue;',
  '      var len = Math.abs(pts[i].x - pts[i - 1].x);',
  '      if (len > bestLen) {',
  '        bestLen = len;',
  '        best = { x: (pts[i].x + pts[i - 1].x) / 2, y: pts[i].y - 7 };',
  '      }',
  '    }',
  '    if (best && bestLen >= 40) return best;',
  '    var m = Math.floor(pts.length / 2);',
  '    return { x: pts[m].x, y: pts[m].y - 7 };',
  '  }',
  '',
  '  function reroute(laid) {',
  '    (laid.edges || []).forEach(function (ed) {',
  '      var key = ed.id.slice(1);',
  '      var path = stage.querySelector(\'.edge[data-edge="\' + key + \'"]\');',
  '      if (!path || !ed.sections || !ed.sections.length) return;',
  '      var s = ed.sections[0];',
  '      var pts = [s.startPoint].concat(s.bendPoints || [], [s.endPoint]);',
  '      path.setAttribute("d", polyPath(pts, 12));',
  '      var lbl = stage.querySelector(\'.edgelbl[data-edge="\' + key + \'"]\');',
  '      if (lbl) moveLabel(lbl, labelAnchor(pts));',
  '    });',
  '  }',
  '  function loadElk() {',
  '    return new Promise(function (res, rej) {',
  '      var s = document.createElement("script");',
  '      s.src = model.elkUrl; s.onload = res; s.onerror = rej;',
  '      document.head.appendChild(s);',
  '    });',
  '  }',
  '  loadElk().then(function () {',
  '    return new ELK().layout(model.elk);',
  '  }).then(function (g) {',
  '    place(g);',
  '    reroute(g);',
  '    drawIntra();',
  '    W = Math.ceil(g.width); H = Math.ceil(g.height);',
  '    stage.style.width = W + "px"; stage.style.height = H + "px";',
  '    stage.dataset.w = W; stage.dataset.h = H;',
  '    var svgs = stage.querySelectorAll("svg");',
  '    for (var i = 0; i < svgs.length; i += 1) {',
  '      svgs[i].setAttribute("width", W); svgs[i].setAttribute("height", H);',
  '    }',
  '    if (status) status.remove();',
  '    requestAnimationFrame(fit);',
  '  }).catch(function () {',
  '    if (status) { status.textContent = model.L.fallbackLayout; status.classList.add("warn"); }',
  '  });',
  '})();',
].join('\n');

/* -------------------------------------------------------------------- build */

function build(spec, opts) {
  const model = normalize(spec, opts);
  const L = labelsFor(opts.labels);
  const size = layout(model);
  const nodeWord = model.app.platform === 'mobile' ? L.screens : L.pages;
  const title = typeof opts.title === 'string' ? opts.title
    : (model.app.name ? model.app.name + ' - ' + L.sketchReport : L.sketchReport);

  const elk = elkGraph(model);
  const clientModel = {
    L: {
      screen: L.screen, purpose: L.purpose, source: L.source, tags: L.tags,
      incoming: L.incoming, outgoing: L.outgoing, notes: L.notes,
      derivedFrom: L.derivedFrom, selectHint: L.selectHint,
      fallbackLayout: L.fallbackLayout, otherStates: L.otherStates, state: L.state,
    },
    screens: model.screens.map((s) => ({
      id: s.id, name: s.name, route: s.route, state: s.state, group: s.group,
      purpose: s.purpose, tags: s.tags, source: s.source, notes: s.notes,
      siblings: model.groups.find((g) => g.id === s.group).screens
        .filter((x) => x.id !== s.id).map((x) => ({ id: x.id, state: x.state, name: x.name })),
      steps: Array.from(new Set(REGIONS.filter((r) => s.regions[r])
        .flatMap((r) => s.regions[r].map((el) => el.step).filter(Boolean)))),
    })),
    transitions: model.transitions.map((t) => ({
      from: t.from, to: t.to, trigger: t.trigger, kind: t.kind, fromElement: t.fromElement || null,
    })),
    elk: elk.graph,
    intra: elk.intra,
    groups: model.groups.map((g) => ({
      id: g.id, variants: g.variants, pad: g.pad,
      screens: g.screens.map((s) => ({ id: s.id, x: s.inGroupX, y: s.inGroupY, w: s.w, h: s.h })),
    })),
    elkUrl: ELK_CDN,
  };

  const h = [];
  h.push('<header class="top"><h1>' + e(title) + '</h1><div class="sub">' +
    e(L.generated) + ': ' + e(u.nowStamp()) + ' &middot; ' + e(L.derivedSketch) + '</div></header>');

  h.push('<div class="cards">');
  h.push(u.statCard(nodeWord, model.screens.length));
  h.push(u.statCard(L.transitions, model.transitions.length));
  h.push(u.statCard(L.elements, model.screens.reduce((n, s) =>
    n + REGIONS.filter((r) => s.regions[r]).reduce((m, r) => m + s.regions[r].length, 0), 0)));
  if (model.openQuestions.length) h.push(u.statCard(L.openQuestions, model.openQuestions.length));
  h.push('</div>');

  h.push('<div class="tools">' +
    '<button id="zoutb" type="button">&minus;</button>' +
    '<span class="zoomval" id="zoomval">100%</span>' +
    '<button id="zin" type="button">+</button>' +
    '<button id="zfit" type="button">' + e(L.fit) + '</button>' +
    '<button id="zone" type="button">100%</button>' +
    '<span class="spacer"></span>' +
    '<span class="layoutnote" id="layoutnote">' + e(L.layingOut) + '</span>' +
    '<span class="legend">' +
    '<span><i class="ent"></i>' + e(L.entry) + '</span>' +
    '<span><i></i>' + e(L.primaryPath) + '</span>' +
    '<span><i class="alt"></i>' + e(L.altPath) + '</span>' +
    '<span><i class="err"></i>' + e(L.errorPath) + '</span>' +
    '</span></div>');

  const edges = renderEdges(model, size, L);
  h.push('<div class="board" id="board"><div class="stage" id="stage" data-w="' + size.width +
    '" data-h="' + size.height + '" style="width:' + size.width + 'px;height:' + size.height + 'px">' +
    renderGroups(model, L) +
    edges.paths +
    model.screens.map((s) => renderCard(s, model, L)).join('') +
    edges.labels +
    '</div></div>');

  h.push('<div class="panel detail" id="detail"></div>');

  if (model.openQuestions.length) {
    h.push('<h2>' + e(L.openQuestions) + '</h2><div class="panel"><ul class="qs">' +
      model.openQuestions.map((q) => '<li>' + e(q) + '</li>').join('') + '</ul></div>');
  }
  if (model.warnings.length) {
    h.push('<h2>' + e(L.warnings) + '</h2><div class="panel"><ul>' +
      model.warnings.map((w) => '<li>' + e(w) + '</li>').join('') + '</ul></div>');
  }

  h.push('<footer>' + e(L.generated) + ': ' + e(u.nowStamp()) + ' &middot; bdd plugin sketch</footer>');
  h.push('<script type="application/json" id="sketch-model">' +
    JSON.stringify(clientModel).replace(/</g, '\\u003c') + '</script>');
  h.push('<script>' + BOARD_JS + '</script>');

  // `anchors` is a Map and `elementIds` holds element references; neither
  // survives JSON, and neither belongs in the reported model.
  const reported = Object.assign({ generatedAt: u.nowStamp(), size }, model, {
    screens: model.screens.map((s) => {
      const { anchors, elementIds, ...rest } = s;
      return Object.assign(rest, { anchors: Object.fromEntries(anchors) });
    }),
    groups: model.groups.map((g) => Object.assign({}, g, { screens: g.screens.map((s) => s.id) })),
  });
  return {
    model: reported,
    html: u.htmlPage(title, h.join('\n'), BOARD_CSS),
    mermaid: mermaidOf(model),
  };
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const inFile = typeof opts.input === 'string' ? opts.input
    : (opts._ && opts._.length ? opts._[0] : path.join('bdd-artifacts', 'sketch.json'));
  if (!fs.existsSync(inFile)) {
    console.error('sketch: no spec at ' + inFile + '. Derive one from the feature files first ' +
      '(see skills/sketch/references/sketch-spec.md), or point --input at it.');
    process.exit(2);
  }
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  } catch (err) {
    console.error('sketch: ' + inFile + ' is not valid JSON: ' + err.message);
    process.exit(2);
  }

  let out;
  try {
    out = build(spec, opts);
  } catch (err) {
    console.error('sketch: ' + err.message);
    process.exit(2);
  }

  const outFile = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'sketch.html');
  const written = u.writeFileEnsured(outFile, out.html);
  if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(out.model, null, 2));
  if (typeof opts.mermaid === 'string') u.writeFileEnsured(opts.mermaid, out.mermaid + '\n');

  const m = out.model;
  console.log('sketch: ' + m.screens.length + (m.app.platform === 'mobile' ? ' screens, ' : ' pages, ') +
    m.transitions.length + ' transitions, ' + m.size.columns + ' flow columns, ' +
    m.openQuestions.length + ' open question(s)');
  for (const s of m.screens.filter((x) => x.entry)) console.log('  entry: ' + s.name + (s.route ? ' (' + s.route + ')' : ''));
  for (const w of m.warnings) console.log('  warning: ' + w);
  console.log('sketch: wrote ' + written);
}

if (require.main === module) main();
module.exports = {
  build, normalize, layout, elementHeight, rowsOf, edgeGeometry, wrapLabel,
  screenLayout, groupScreens, elkGraph, ELEMENT_H,
};

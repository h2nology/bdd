#!/usr/bin/env node
'use strict';
/**
 * Gherkin-derived UI spec -> read-only wireframe canvas (pan/zoom board).
 *
 * Consumes the JSON the `sketch` skill derives from feature files (see
 * references/sketch-spec.md). The model decides what is on each
 * screen; this renderer decides where it goes, so regenerating the JSON cannot
 * make the board drift.
 *
 * The board draws screens only - there are deliberately no page-flow arrows.
 * What happens after a click is written in a callout **beside** the wireframe,
 * with a leader line back to the button or link and the scenario it came from.
 * Keeping it off the card is the point: the wireframe stays a wireframe, and the
 * annotation carries its own provenance.
 *
 * Every wireframe element is rendered at a fixed height taken from ELEMENT_H,
 * which is what lets the layout compute each card's exact box - and each
 * control's y inside it, which is where a leader line starts - up front.
 *
 * Usage:
 *   node sketch.cjs [--input <file>] [options]
 *
 * Options:
 *   --input <file>     Sketch spec JSON (default bdd-artifacts/sketch.json)
 *   --out <file>       Output HTML (default bdd-artifacts/sketch.html)
 *   --json <file>      Also write the laid-out model (boxes, columns) as JSON
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
/**
 * An action callout: a fixed-width note in the gutter beside its page, holding
 * the control's label, what the click does, and the scenario that says so.
 * Every value is also in BOARD_CSS and must stay in step with it.
 */
const CALLOUT = {
  w: 236, pad: 11, gap: 34, vGap: 12, line: 17, head: 18, foot: 16, maxLines: 8,
  /** Inner width in half-width character units, at ~6.3px per unit. */
  units: 33,
};
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
/** Controls whose behaviour after a click has to be stated, or it is a gap. */
const CLICKABLE = new Set(['button', 'link']);
/** Full-width scripts cost two units per character when estimating a line. */
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F]/;

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
      warnings.push('duplicate screen id "' + id + '" - renamed so the cards stay distinguishable');
      let n = 2;
      while (seen.has(id + '-' + n)) n += 1;
      id = id + '-' + n;
    }
    seen.add(id);

    const regions = {};
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
        el.action = normalizeAction(el.action);
        // A button with no stated outcome is the gap this board exists to show,
        // so it is reported rather than drawn as if it were settled.
        if (CLICKABLE.has(el.type) && !el.action) {
          warnings.push('screen "' + id + '": ' + el.type + ' "' + String(el.label || '?') +
            '" has no "action" - say what happens when it is clicked, or put it in openQuestions');
        }
        // An annotation with no scenario is an assertion with no evidence: the
        // callout exists to show where the claim came from.
        if (el.action && !el.action.scenario) {
          warnings.push('screen "' + id + '": the action on "' + String(el.label || el.type) +
            '" names no scenario - add "scenario" so the callout can say where it came from');
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
      purpose: typeof raw.purpose === 'string' ? raw.purpose : null,
      entry: Boolean(raw.entry),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
      source: raw.source && typeof raw.source === 'object' ? raw.source : null,
      notes: Array.isArray(raw.notes) ? raw.notes.filter((n) => typeof n === 'string') : [],
      regions,
    };
  });

  return {
    app: { name: typeof app.name === 'string' ? app.name : null, platform, viewport },
    screens, groups: groupScreens(screens),
    openQuestions: (Array.isArray(spec.openQuestions) ? spec.openQuestions : []).filter((q) => typeof q === 'string'),
    warnings,
  };
}

/**
 * What happens after a click, as the callout needs it: the text, and the
 * scenario that says so. A bare string is accepted and reported, because a
 * claim with no provenance is exactly what the callout is meant to expose.
 */
function normalizeAction(raw) {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? { text, scenario: null, source: null } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  return {
    text,
    scenario: typeof raw.scenario === 'string' && raw.scenario.trim() ? raw.scenario.trim() : null,
    source: raw.source && typeof raw.source === 'object' ? raw.source : null,
  };
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

/** Wrapped line count for a callout body, counting CJK as two units wide. */
function textLines(text, units, maxLines) {
  let n = 0;
  for (const ch of String(text)) n += WIDE_CHAR.test(ch) ? 2 : 1;
  return Math.max(1, Math.min(maxLines, Math.ceil(n / units)));
}

/** The callout's box, and how many lines of body text fit in it. */
function calloutBox(action) {
  const lines = textLines(action.text, CALLOUT.units, CALLOUT.maxLines);
  const h = CALLOUT.pad * 2 + CALLOUT.head + lines * CALLOUT.line +
    (action.scenario ? CALLOUT.foot : 0);
  return { w: CALLOUT.w, h, lines };
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
 * The card's box, plus the y of every control that carries an action.
 *
 * The y walk mirrors the CSS exactly - cardHead, then each region's padding,
 * rows and gaps - which is only reliable because every element renders at the
 * fixed height elementHeight gives it. Those offsets are where a leader line
 * meets its button.
 */
function screenLayout(screen, viewport) {
  const w = CARD_W[viewport];
  const used = REGIONS.filter((r) => screen.regions[r]);
  const marks = [];

  let y = LAYOUT.cardHead;
  used.forEach((region, ri) => {
    y += LAYOUT.regionPad;
    const rows = rowsOf(screen.regions[region]);
    rows.forEach((row, i) => {
      for (const el of row.els) {
        if (el.action) marks.push({ el, y: y + elementHeight(el) / 2 });
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
  return { w, h, marks };
}

/* ------------------------------------------------------------------- layout */

/**
 * With no flow to lay out, the board is a grid of pages: a near-square column
 * count, and each group dropped into the shortest column so tall pages do not
 * leave one column stranded. Entry pages come first, so the board still starts
 * where a journey does.
 *
 * Each group carries a gutter on its right holding the action callouts of every
 * card in it. A callout sits level with the control it annotates and is pushed
 * down only when the one above it would overlap, so a leader line stays short
 * and roughly horizontal.
 *
 * Deterministic on purpose - the same spec always produces the same board, so a
 * reviewer's mental map survives a regeneration.
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
    // Offsets inside the group, so the group can be placed as one unit later -
    // and so the callouts can be stacked against them before it is placed.
    let sy = pad.top;
    for (const s of g.screens) {
      s.inGroupX = pad.side;
      s.inGroupY = Math.round(sy);
      sy += s.h + LAYOUT.variantGap;
    }
  }
  placeCallouts(model);

  const cols = Math.max(1, Math.min(groups.length, Math.ceil(Math.sqrt(groups.length))));
  const columns = Array.from({ length: cols }, () => []);
  const colH = new Array(cols).fill(0);
  const ordered = groups.slice().sort((a, b) => {
    const ae = a.screens.some((s) => s.entry) ? 0 : 1;
    const be = b.screens.some((s) => s.entry) ? 0 : 1;
    return ae - be || a.order - b.order;
  });
  for (const g of ordered) {
    let pick = 0;
    for (let i = 1; i < cols; i += 1) if (colH[i] < colH[pick]) pick = i;
    columns[pick].push(g);
    colH[pick] += g.hTotal + LAYOUT.rowGap;
    g.col = pick;
  }

  const colWidths = columns.map((list) => Math.max(0, ...list.map((g) => g.wTotal)));
  let x = LAYOUT.pad;
  columns.forEach((list, i) => {
    let y = LAYOUT.pad;
    for (const g of list) {
      g.x = Math.round(x);
      g.y = Math.round(y);
      for (const s of g.screens) {
        s.x = g.x + s.inGroupX;
        s.y = g.y + s.inGroupY;
      }
      for (const c of g.callouts) {
        c.x = g.x + g.w + CALLOUT.gap;
        c.y = g.y + c.inGroupY;
        // The leader starts at the control and ends at the callout's left edge.
        c.from = { x: c.screen.x + c.screen.w, y: c.screen.y + c.markY };
        c.to = { x: c.x, y: c.y + c.h / 2 };
      }
      y += g.hTotal + LAYOUT.rowGap;
    }
    x += colWidths[i] + LAYOUT.colGap;
  });

  return {
    width: Math.round(x - LAYOUT.colGap + LAYOUT.pad),
    height: Math.round(LAYOUT.pad * 2 + Math.max(0, ...colH.map((h) => h - LAYOUT.rowGap))),
    columns: cols,
  };
}

/**
 * One callout per annotated control, stacked in the group's right-hand gutter in
 * the order the controls appear, each level with its control unless the one
 * above already occupies that band. `hTotal`/`wTotal` are what the grid packs,
 * so a group with more callouts than card takes the room it actually needs.
 */
function placeCallouts(model) {
  let n = 0;
  for (const g of model.groups) {
    const list = [];
    for (const s of g.screens) {
      for (const mark of s.marks) {
        n += 1;
        const box = calloutBox(mark.el.action);
        list.push({
          id: 'act-' + n, screen: s, group: g.id,
          label: mark.el.label || mark.el.type, type: mark.el.type,
          action: mark.el.action, markY: mark.y,
          w: box.w, h: box.h, lines: box.lines,
        });
      }
    }
    g.callouts = list;

    let bottom = 0;
    for (const c of list) {
      const want = c.screen.inGroupY + c.markY - c.h / 2;
      c.inGroupY = Math.round(Math.max(want, bottom ? bottom + CALLOUT.vGap : g.pad.top));
      bottom = c.inGroupY + c.h;
    }
    g.wTotal = g.w + (list.length ? CALLOUT.gap + CALLOUT.w : 0);
    g.hTotal = Math.max(g.h, bottom);
  }
}

/* ------------------------------------------------------------------- render */

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

  // The click behaviour is annotated in a callout beside the card, never on it:
  // the wireframe stays a wireframe. The tooltip still carries both.
  const tip = [el.step, el.action ? '\u2192 ' + el.action.text : ''].filter(Boolean).join('\n');
  const title = tip ? ' title="' + e(tip) + '"' : '';
  const marked = el.action ? ' marked' : '';
  return '<div class="el s' + span + marked + '" style="height:' + h + 'px"' + title + '>' + inner + '</div>';
}

function renderRegion(name, elements) {
  const rows = rowsOf(elements).map((r) =>
    '<div class="row">' + r.els.map(renderElement).join('') + '</div>').join('');
  return '<div class="rg rg-' + name + '">' + rows + '</div>';
}

/**
 * The annotation itself: which control, what the click does, and the scenario
 * that says so. Placed outside the card in the group's gutter.
 */
function renderCallout(c, L) {
  const src = c.action.source && c.action.source.uri
    ? c.action.source.uri + (c.action.source.line ? ':' + c.action.source.line : '') : '';
  const foot = c.action.scenario
    ? '<div class="co-src"><span>' + e(L.scenario) + '</span>' + e(c.action.scenario) +
      (src ? '<code>' + e(src) + '</code>' : '') + '</div>'
    : '';
  return '<aside class="callout" data-act="' + e(c.id) + '" data-screen="' + e(c.screen.id) + '"' +
    ' style="left:' + c.x + 'px;top:' + c.y + 'px;width:' + c.w + 'px;height:' + c.h + 'px">' +
    '<div class="co-head"><b>' + e(c.label) + '</b><i>' + e(c.type) + '</i></div>' +
    '<div class="co-text" style="height:' + (c.lines * CALLOUT.line) + 'px" title="' +
    e(c.action.text) + '">' + e(c.action.text) + '</div>' + foot + '</aside>';
}

/**
 * The leader line from a callout to the control it annotates: out of the
 * callout's left edge, one elbow, arrowhead on the button. Orthogonal and
 * always inside the group's own gutter, so no leader crosses another page.
 */
function leaderPath(c) {
  const x0 = c.to.x;
  const y0 = c.to.y;
  const x1 = c.from.x;
  const y1 = c.from.y;
  const mx = (x0 + x1) / 2;
  if (Math.abs(y0 - y1) < 1) return 'M ' + x0 + ' ' + y0 + ' L ' + x1 + ' ' + y1;
  const r = Math.min(9, Math.abs(y0 - y1) / 2, Math.abs(mx - x0), Math.abs(mx - x1));
  const dir = y1 > y0 ? 1 : -1;
  return 'M ' + x0 + ' ' + y0 + ' L ' + (mx + r) + ' ' + y0 +
    ' Q ' + mx + ' ' + y0 + ' ' + mx + ' ' + (y0 + r * dir) +
    ' L ' + mx + ' ' + (y1 - r * dir) +
    ' Q ' + mx + ' ' + y1 + ' ' + (mx - r) + ' ' + y1 +
    ' L ' + x1 + ' ' + y1;
}

function renderLeaders(model, size, L) {
  const paths = model.groups.flatMap((g) => g.callouts).map((c) =>
    '<path class="leader" data-act="' + e(c.id) + '" data-screen="' + e(c.screen.id) +
    '" d="' + leaderPath(c) + '" marker-end="url(#lead-arw)"></path>').join('');
  return '<svg class="leaders" width="' + size.width + '" height="' + size.height +
    '" aria-label="' + e(L.actions) + '">' +
    '<defs><marker id="lead-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" ' +
    'markerHeight="6.5" orient="auto-start-reverse"><path class="m-lead" d="M 0 0 L 10 5 L 0 10 z">' +
    '</path></marker></defs>' + paths + '</svg>';
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
.board.sel .scr { opacity: .5; }
.board.sel .scr.hot { opacity: 1; }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }

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
/* An annotated control is marked on the side its leader line arrives from; the
   note itself sits outside the card. */
.el.marked { box-shadow: 3px 0 0 var(--accent); }

/* --- action callouts --------------------------------------------------- */
.leaders { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.leader { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 3; opacity: .75; }
.m-lead { fill: var(--accent); }
.board.sel .leader { opacity: .12; }
.board.sel .leader.hot { opacity: 1; }
.board.sel .callout { opacity: .4; }
.board.sel .callout.hot { opacity: 1; }
.callout {
  position: absolute; box-sizing: border-box; padding: 11px; overflow: hidden;
  background: var(--panel); border: 1px solid var(--accent); border-left-width: 3px;
  border-radius: 8px; box-shadow: 0 1px 3px rgba(15, 23, 42, .07);
}
.co-head {
  height: 18px; display: flex; align-items: center; gap: 6px; overflow: hidden;
  font-size: 11px; color: var(--muted); white-space: nowrap;
}
.co-head b { font-size: var(--fs-sm); color: var(--ink); font-weight: 650;
  overflow: hidden; text-overflow: ellipsis; }
.co-head i { font-style: normal; font: 400 10px var(--mono); background: var(--chip);
  border-radius: 3px; padding: 0 4px; flex: none; margin-left: auto; }
.co-text {
  font-size: 11.5px; line-height: 17px; color: var(--ink); overflow: hidden;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 8;
}
.co-src {
  height: 16px; line-height: 16px; font-size: 10.5px; color: var(--muted);
  display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden;
}
.co-src span { font-weight: 600; color: var(--accent); flex: none; }
.co-src code { font: 400 10px var(--mono); color: var(--muted); overflow: hidden;
  text-overflow: ellipsis; }

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

/* --- board chrome ------------------------------------------------------ */
.tools { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; flex-wrap: wrap; }
.tools button { font: 600 var(--fs-sm) var(--sans); color: var(--ink); background: var(--panel);
  border: 1px solid var(--line); border-radius: 6px; padding: 5px 11px; cursor: pointer; }
.tools button:hover { border-color: var(--accent); color: var(--accent); }
.tools .zoomval { font: 500 var(--fs-sm) var(--mono); color: var(--muted); min-width: 52px; }
.tools .spacer { flex: 1; }
.legend { display: flex; gap: 14px; font-size: var(--fs-xs); color: var(--muted); flex-wrap: wrap; }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i.ent { width: 12px; height: 12px; border: 2px solid var(--accent); border-radius: 3px; }
.legend i.actg { width: 22px; height: 0; border-top: 1.5px dashed var(--accent); }
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
  '    var note = ev.target.closest ? ev.target.closest(".callout") : null;',
  '    select(card ? card.dataset.id : note ? note.dataset.screen : null);',
  '  });',
  '',
  '  function select(id) {',
  '    sel = (id && sel === id) ? null : id;',
  '    board.classList.toggle("sel", Boolean(sel));',
  '    var i, els = stage.querySelectorAll(".scr, .callout, .leader");',
  '    for (i = 0; i < els.length; i += 1) els[i].classList.remove("hot");',
  '    if (!sel) { renderDetail(null); return; }',
  '    var own = stage.querySelector(\'.scr[data-id="\' + sel + \'"]\');',
  '    if (own) own.classList.add("hot");',
  '    // The other data states of the same page stay lit: they are the thing a',
  '    // reviewer compares the selected card against.',
  '    if (own) {',
  '      var sibs = stage.querySelectorAll(\'.scr[data-group="\' + own.dataset.group + \'"]\');',
  '      for (i = 0; i < sibs.length; i += 1) sibs[i].classList.add("hot");',
  '    }',
  '    var notes = stage.querySelectorAll(\'[data-screen="\' + sel + \'"]\');',
  '    for (i = 0; i < notes.length; i += 1) notes[i].classList.add("hot");',
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
  '    row(model.L.actions, (sc.actions || []).length ? "<ul>" + sc.actions.map(function (a) {',
  '      return "<li><strong>" + esc(a.label) + "</strong> <span class=\\"sub\\">" +',
  '        esc(a.action) + "</span>" + (a.scenario ? \' <span class="sub">(\' +',
  '        esc(model.L.scenario) + ": " + esc(a.scenario) + ")</span>" : "") +',
  '        "</li>"; }).join("") + "</ul>" : "");',
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
  '})();',
].join('\n');

/* -------------------------------------------------------------------- build */

function build(spec, opts) {
  const model = normalize(spec, opts);
  const L = labelsFor(opts.labels);
  const size = layout(model);
  const title = typeof opts.title === 'string' ? opts.title
    : (model.app.name ? model.app.name + ' - ' + L.sketchReport : L.sketchReport);

  const clientModel = {
    L: {
      screen: L.screen, purpose: L.purpose, source: L.source, tags: L.tags,
      actions: L.actions, scenario: L.scenario, notes: L.notes,
      derivedFrom: L.derivedFrom, selectHint: L.selectHint,
      otherStates: L.otherStates, state: L.state,
    },
    screens: model.screens.map((s) => ({
      id: s.id, name: s.name, route: s.route, state: s.state, group: s.group,
      purpose: s.purpose, tags: s.tags, source: s.source, notes: s.notes,
      siblings: model.groups.find((g) => g.id === s.group).screens
        .filter((x) => x.id !== s.id).map((x) => ({ id: x.id, state: x.state, name: x.name })),
      steps: Array.from(new Set(REGIONS.filter((r) => s.regions[r])
        .flatMap((r) => s.regions[r].map((el) => el.step).filter(Boolean)))),
      // The full click behaviour, untruncated - a callout clamps a long one.
      actions: REGIONS.filter((r) => s.regions[r])
        .flatMap((r) => s.regions[r].filter((el) => el.action)
          .map((el) => ({ label: el.label || el.type, action: el.action.text,
            scenario: el.action.scenario }))),
    })),
  };

  const h = [];
  h.push('<header class="top"><h1>' + e(title) + '</h1><div class="sub">' +
    e(L.generated) + ': ' + e(u.nowStamp()) + ' &middot; ' + e(L.derivedSketch) + '</div></header>');

  h.push('<div class="tools">' +
    '<button id="zoutb" type="button">&minus;</button>' +
    '<span class="zoomval" id="zoomval">100%</span>' +
    '<button id="zin" type="button">+</button>' +
    '<button id="zfit" type="button">' + e(L.fit) + '</button>' +
    '<button id="zone" type="button">100%</button>' +
    '<span class="spacer"></span>' +
    '<span class="legend">' +
    '<span><i class="ent"></i>' + e(L.entry) + '</span>' +
    '<span><i class="actg"></i>' + e(L.actions) + '</span>' +
    '</span></div>');

  h.push('<div class="board" id="board"><div class="stage" id="stage" data-w="' + size.width +
    '" data-h="' + size.height + '" style="width:' + size.width + 'px;height:' + size.height + 'px">' +
    renderGroups(model, L) +
    renderLeaders(model, size, L) +
    model.screens.map((s) => renderCard(s, model, L)).join('') +
    model.groups.flatMap((g) => g.callouts).map((c) => renderCallout(c, L)).join('') +
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

  // `marks` and a callout's `screen` hold element/screen references, which do not
  // survive JSON and do not belong in the reported model.
  const reported = Object.assign({ generatedAt: u.nowStamp(), size }, model, {
    screens: model.screens.map(({ marks, ...rest }) => rest),
    groups: model.groups.map((g) => Object.assign({}, g, {
      screens: g.screens.map((s) => s.id),
      callouts: g.callouts.map((c) => Object.assign({}, c, { screen: c.screen.id })),
    })),
  });
  return {
    model: reported,
    html: u.htmlPage(title, h.join('\n'), BOARD_CSS),
  };
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const inFile = typeof opts.input === 'string' ? opts.input
    : (opts._ && opts._.length ? opts._[0] : path.join('bdd-artifacts', 'sketch.json'));
  if (!fs.existsSync(inFile)) {
    console.error('sketch: no spec at ' + inFile + '. Derive one from the feature files first ' +
      '(see references/sketch-spec.md), or point --input at it.');
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

  const m = out.model;
  const actions = m.screens.reduce((n, s) => n + Object.keys(s.regions)
    .reduce((k, r) => k + s.regions[r].filter((el) => el.action).length, 0), 0);
  console.log('sketch: ' + m.screens.length + (m.app.platform === 'mobile' ? ' screens, ' : ' pages, ') +
    m.groups.length + ' page group(s), ' + actions + ' click action(s), ' +
    m.openQuestions.length + ' open question(s)');
  for (const s of m.screens.filter((x) => x.entry)) console.log('  entry: ' + s.name + (s.route ? ' (' + s.route + ')' : ''));
  for (const w of m.warnings) console.log('  warning: ' + w);
  console.log('sketch: wrote ' + written);
}

if (require.main === module) main();
module.exports = {
  build, normalize, layout, elementHeight, rowsOf,
  screenLayout, groupScreens, ELEMENT_H,
};

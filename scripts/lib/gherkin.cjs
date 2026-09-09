'use strict';
/**
 * Zero-dependency Gherkin parser (CommonJS, Node >= 14).
 *
 * Intentionally self-contained: the plugin must run inside Java, Python and
 * .NET projects where `@cucumber/gherkin` is not installed. Supports the
 * dialects BDD teams in this toolchain actually author in: en, zh-CN, zh-TW, ja.
 *
 * Public API:
 *   parseFeature(text, uri)  -> feature AST (never throws; see feature.errors)
 *   flattenScenarios(feature) -> [{ ...scenario, inheritedTags, background }]
 *   expandOutline(scenario)  -> [{ name, steps, exampleRow, ... }]
 *   stepCount(scenario)      -> number of steps incl. background
 */

const DIALECTS = {
  en: {
    name: 'English',
    feature: ['Feature', 'Business Need', 'Ability'],
    background: ['Background'],
    rule: ['Rule'],
    scenarioOutline: ['Scenario Outline', 'Scenario Template'],
    scenario: ['Scenario', 'Example'],
    examples: ['Examples', 'Scenarios'],
    given: ['* ', 'Given '],
    when: ['* ', 'When '],
    then: ['* ', 'Then '],
    and: ['* ', 'And '],
    but: ['* ', 'But '],
  },
  'zh-CN': {
    name: '简体中文',
    feature: ['功能'],
    background: ['背景'],
    rule: ['Rule', '规则'],
    scenarioOutline: ['场景大纲', '剧本大纲'],
    scenario: ['场景', '剧本'],
    examples: ['例子'],
    given: ['*', '假如', '假设', '假定'],
    when: ['*', '当'],
    then: ['*', '那么'],
    and: ['*', '而且', '并且', '同时'],
    but: ['*', '但是'],
  },
  'zh-TW': {
    name: '繁體中文',
    feature: ['功能'],
    background: ['背景'],
    rule: ['Rule', '規則'],
    scenarioOutline: ['場景大綱', '劇本大綱'],
    scenario: ['場景', '劇本'],
    examples: ['例子'],
    given: ['*', '假如', '假設', '假定'],
    when: ['*', '當'],
    then: ['*', '那麼'],
    and: ['*', '而且', '並且', '同時'],
    but: ['*', '但是'],
  },
  ja: {
    name: '日本語',
    feature: ['フィーチャ', '機能'],
    background: ['背景'],
    rule: ['Rule', 'ルール'],
    scenarioOutline: ['シナリオアウトライン', 'シナリオテンプレート', 'シナリオテンプレ', 'テンプレ'],
    scenario: ['シナリオ', '例'],
    examples: ['サンプル'],
    given: ['*', '前提'],
    when: ['*', 'もし'],
    then: ['*', 'ならば'],
    and: ['*', 'かつ'],
    but: ['*', 'しかし', '但し', 'ただし'],
  },
};

const BLOCK_KINDS = ['feature', 'background', 'rule', 'scenarioOutline', 'scenario', 'examples'];
const STEP_KINDS = ['given', 'when', 'then', 'and', 'but'];

function buildMatchers(dialect) {
  const blocks = [];
  for (const kind of BLOCK_KINDS) {
    for (const kw of dialect[kind] || []) blocks.push({ kind, keyword: kw });
  }
  // Longest keyword first so "Scenario Outline" wins over "Scenario".
  blocks.sort((a, b) => b.keyword.length - a.keyword.length);

  const steps = [];
  for (const kind of STEP_KINDS) {
    for (const kw of dialect[kind] || []) steps.push({ kind, keyword: kw });
  }
  steps.sort((a, b) => b.keyword.length - a.keyword.length);
  return { blocks, steps };
}

function detectLanguage(lines) {
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (!line.startsWith('#')) break;
    const m = /^#\s*language\s*:\s*([A-Za-z-]+)\s*$/.exec(line);
    if (m) {
      const tag = m[1];
      if (DIALECTS[tag]) return tag;
      const lower = tag.toLowerCase();
      const hit = Object.keys(DIALECTS).find((k) => k.toLowerCase() === lower);
      if (hit) return hit;
      return { unsupported: tag };
    }
  }
  return 'en';
}

function splitTags(line) {
  return line
    .split(/\s+/)
    .filter((t) => t.startsWith('@') && t.length > 1)
    .map((t) => t.trim());
}

function splitTableRow(line) {
  const trimmed = line.trim();
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\') {
      const next = body[i + 1];
      if (next === '|') { cur += '|'; i += 1; continue; }
      if (next === 'n') { cur += '\n'; i += 1; continue; }
      if (next === '\\') { cur += '\\'; i += 1; continue; }
      cur += ch;
      continue;
    }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** Lex a feature file into a flat token stream. */
function lex(lines, matchers, errors) {
  const tokens = [];
  let docString = null;

  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();

    if (docString) {
      if (trimmed === docString.fence) {
        tokens.push({
          type: 'docString',
          line: docString.line,
          mediaType: docString.mediaType,
          content: docString.content.join('\n'),
        });
        docString = null;
        return;
      }
      const indent = docString.indent;
      docString.content.push(raw.startsWith(' '.repeat(indent)) ? raw.slice(indent) : raw.replace(/^\s+/, ''));
      return;
    }

    if (trimmed === '') { tokens.push({ type: 'empty', line }); return; }

    const fenceMatch = /^("""|```)(.*)$/.exec(trimmed);
    if (fenceMatch) {
      docString = {
        fence: fenceMatch[1],
        mediaType: fenceMatch[2].trim() || null,
        indent: raw.length - raw.trimStart().length,
        content: [],
        line,
      };
      return;
    }

    if (trimmed.startsWith('#')) { tokens.push({ type: 'comment', line, text: trimmed.slice(1).trim() }); return; }

    if (trimmed.startsWith('@')) { tokens.push({ type: 'tag', line, tags: splitTags(trimmed) }); return; }

    if (trimmed.startsWith('|')) { tokens.push({ type: 'tableRow', line, cells: splitTableRow(trimmed) }); return; }

    const block = matchers.blocks.find((b) => {
      const re = new RegExp('^' + b.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
      return re.test(trimmed);
    });
    if (block) {
      tokens.push({
        type: 'block',
        kind: block.kind,
        keyword: block.keyword,
        name: trimmed.slice(trimmed.indexOf(':') + 1).trim(),
        line,
      });
      return;
    }

    const step = matchers.steps.find((s) => {
      if (s.keyword.endsWith(' ')) return trimmed.startsWith(s.keyword);
      if (s.keyword === '*') return trimmed === '*' || trimmed.startsWith('* ');
      return trimmed.startsWith(s.keyword);
    });
    if (step) {
      tokens.push({
        type: 'step',
        kind: step.kind,
        keyword: step.keyword.trim(),
        text: trimmed.slice(step.keyword.trim().length).trim(),
        line,
      });
      return;
    }

    tokens.push({ type: 'text', line, text: trimmed });
  });

  if (docString) {
    errors.push({ line: docString.line, message: `Unterminated doc string (opened with ${docString.fence})` });
  }
  return tokens;
}

function newScenario(token, tags) {
  return {
    type: token.kind === 'scenarioOutline' ? 'scenarioOutline' : 'scenario',
    keyword: token.keyword,
    name: token.name,
    line: token.line,
    tags,
    description: [],
    steps: [],
    examples: [],
  };
}

/**
 * Parse one .feature file. Returns a feature AST; parse problems are collected
 * in `feature.errors` instead of thrown, so batch tooling never dies on one bad file.
 */
function parseFeature(text, uri) {
  const errors = [];
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  const detected = detectLanguage(lines);
  let language = 'en';
  if (typeof detected === 'string') {
    language = detected;
  } else {
    errors.push({ line: 1, message: `Unsupported "# language: ${detected.unsupported}" header; parsed with English keywords` });
  }
  const dialect = DIALECTS[language];
  const tokens = lex(lines, buildMatchers(dialect), errors);

  const feature = {
    uri: uri || '<inline>',
    language,
    tags: [],
    keyword: null,
    name: null,
    description: '',
    line: null,
    background: null,
    children: [],
    comments: tokens.filter((t) => t.type === 'comment').map((t) => ({ line: t.line, text: t.text })),
    errors,
  };

  let pendingTags = [];
  let container = feature;      // feature or rule — owns scenarios
  let stepHolder = null;        // background or scenario — owns steps
  let descTarget = null;        // object whose `description` array is being filled
  let currentScenario = null;
  let currentExamples = null;
  let lastStep = null;

  for (const token of tokens) {
    switch (token.type) {
      case 'empty':
      case 'comment':
        break;

      case 'tag':
        pendingTags = pendingTags.concat(token.tags);
        break;

      case 'block': {
        const tags = pendingTags;
        pendingTags = [];
        currentExamples = null;
        lastStep = null;

        if (token.kind === 'feature') {
          if (feature.name !== null) {
            errors.push({ line: token.line, message: 'Multiple Feature keywords in one file; extra one ignored' });
            break;
          }
          feature.keyword = token.keyword;
          feature.name = token.name;
          feature.line = token.line;
          feature.tags = tags;
          container = feature;
          stepHolder = null;
          descTarget = { description: [] };
          feature._desc = descTarget.description;
        } else if (token.kind === 'rule') {
          const rule = {
            type: 'rule', keyword: token.keyword, name: token.name, line: token.line,
            tags, description: [], background: null, children: [],
          };
          feature.children.push(rule);
          container = rule;
          stepHolder = null;
          currentScenario = null;
          descTarget = rule;
        } else if (token.kind === 'background') {
          const bg = {
            type: 'background', keyword: token.keyword, name: token.name, line: token.line,
            description: [], steps: [],
          };
          container.background = bg;
          stepHolder = bg;
          currentScenario = null;
          descTarget = bg;
        } else if (token.kind === 'scenario' || token.kind === 'scenarioOutline') {
          const sc = newScenario(token, tags);
          container.children.push(sc);
          currentScenario = sc;
          stepHolder = sc;
          descTarget = sc;
        } else if (token.kind === 'examples') {
          if (!currentScenario) {
            errors.push({ line: token.line, message: `${token.keyword} block outside of a Scenario Outline; ignored` });
            break;
          }
          currentExamples = {
            keyword: token.keyword, name: token.name, line: token.line,
            tags, header: null, rows: [],
          };
          currentScenario.examples.push(currentExamples);
          stepHolder = null;
          descTarget = null;
        }
        break;
      }

      case 'step': {
        if (!stepHolder) {
          errors.push({ line: token.line, message: `Step "${token.keyword} ${token.text}" has no Background/Scenario; ignored` });
          break;
        }
        const step = {
          keyword: token.keyword,
          keywordType: token.kind,
          text: token.text,
          line: token.line,
          dataTable: null,
          docString: null,
        };
        stepHolder.steps.push(step);
        lastStep = step;
        descTarget = null;
        break;
      }

      case 'tableRow':
        if (currentExamples) {
          if (!currentExamples.header) currentExamples.header = { cells: token.cells, line: token.line };
          else currentExamples.rows.push({ cells: token.cells, line: token.line });
        } else if (lastStep) {
          if (!lastStep.dataTable) lastStep.dataTable = { rows: [] };
          lastStep.dataTable.rows.push({ cells: token.cells, line: token.line });
        } else {
          errors.push({ line: token.line, message: 'Table row without an owning step or Examples/Scenarios block; ignored' });
        }
        break;

      case 'docString':
        if (lastStep) lastStep.docString = { content: token.content, mediaType: token.mediaType, line: token.line };
        else errors.push({ line: token.line, message: 'Doc string without an owning step; ignored' });
        break;

      case 'text':
        if (descTarget) {
          if (descTarget === feature._desc) feature._desc.push(token.text);
          else descTarget.description.push(token.text);
        } else if (feature.name === null) {
          errors.push({ line: token.line, message: `Text before the Feature keyword: "${token.text}"` });
        }
        break;

      default:
        break;
    }
  }

  if (feature.name === null) errors.push({ line: 1, message: 'No Feature keyword found in file' });
  feature.description = (feature._desc || []).join('\n');
  delete feature._desc;
  const joinDesc = (node) => {
    if (Array.isArray(node.description)) node.description = node.description.join('\n');
  };
  if (feature.background) joinDesc(feature.background);
  for (const child of feature.children) {
    joinDesc(child);
    if (child.type === 'rule') {
      if (child.background) joinDesc(child.background);
      child.children.forEach(joinDesc);
    }
  }
  if (feature.name !== null) validateFeature(feature, errors);
  return feature;
}

/** `<placeholder>` names used in a step's text, data table and doc string. */
function stepPlaceholders(step) {
  const found = new Set();
  const scan = (text) => {
    if (!text) return;
    const re = /<([^<>]+)>/g;
    let m;
    while ((m = re.exec(String(text)))) found.add(m[1].trim());
  };
  scan(step.text);
  if (step.dataTable) for (const row of step.dataTable.rows) row.cells.forEach((c) => scan(c));
  if (step.docString) scan(step.docString.content);
  return found;
}

/**
 * Defects that are legal Gherkin but verify nothing. They matter because the
 * reports still count them as specified behaviour: an outline with no Examples
 * expands to one unsubstituted case, and a Background that asserts turns every
 * scenario in the file red for a reason none of them owns. Reported as warnings
 * so one bad file never stops a batch.
 */
function validateFeature(feature, errors) {
  const backgrounds = [];
  const scenarios = [];
  const collect = (container) => {
    if (container.background) backgrounds.push(container.background);
    for (const child of container.children) {
      if (child.type === 'rule') collect(child);
      else scenarios.push(child);
    }
  };
  collect(feature);

  for (const bg of backgrounds) {
    let effective = null;
    for (const step of bg.steps) {
      const kind = step.keywordType === 'and' || step.keywordType === 'but' ? effective : step.keywordType;
      if (kind) effective = kind;
      if (kind === 'then') {
        errors.push({
          line: step.line,
          message: `Background asserts ("${String(step.keyword).trim()} ${step.text}"); a Background is setup only - move the assertion into a scenario`,
        });
      }
    }
  }

  for (const sc of scenarios) {
    if (sc.type !== 'scenarioOutline') continue;
    const label = sc.name || '(unnamed)';
    const used = new Set();
    for (const name of stepPlaceholders({ text: sc.name })) used.add(name);
    for (const step of sc.steps) for (const name of stepPlaceholders(step)) used.add(name);

    if (!sc.examples.length) {
      errors.push({
        line: sc.line,
        message: `Scenario Outline "${label}" has no Examples/Scenarios block; it expands to one case with the placeholders left unsubstituted`,
      });
      continue;
    }
    const tables = sc.examples.filter((ex) => ex.header);
    if (!tables.length) {
      errors.push({ line: sc.examples[0].line, message: `${sc.examples[0].keyword} block for "${label}" has no header row` });
      continue;
    }
    const columns = new Set();
    // Report back whichever synonym the author wrote (`Examples` / `Scenarios`).
    const tableKeyword = tables[0].keyword;
    for (const ex of tables) {
      for (const cell of ex.header.cells) columns.add(cell.trim());
      if (!ex.rows.length) {
        errors.push({ line: ex.line, message: `${ex.keyword} table for "${label}" has a header but no data rows` });
      }
    }
    for (const name of used) {
      if (!columns.has(name)) {
        errors.push({ line: sc.line, message: `Scenario Outline "${label}" uses <${name}>, which no ${tableKeyword} table provides` });
      }
    }
    for (const col of columns) {
      if (!used.has(col)) {
        errors.push({
          line: sc.line,
          message: `${tableKeyword} column "${col}" of "${label}" is never used by a step or the scenario name; if it documents the row rather than feeding it, a comment says so more clearly`,
        });
      }
    }
  }
}

/** Flatten feature -> scenarios, carrying inherited tags, rule and background. */
function flattenScenarios(feature) {
  const out = [];
  const push = (sc, rule) => {
    const inherited = feature.tags.concat(rule ? rule.tags : []);
    out.push(Object.assign({}, sc, {
      uri: feature.uri,
      featureName: feature.name,
      featureTags: feature.tags,
      rule: rule ? { name: rule.name, tags: rule.tags, line: rule.line } : null,
      inheritedTags: inherited,
      allTags: Array.from(new Set(inherited.concat(sc.tags))),
      background: (rule && rule.background) || feature.background || null,
      id: `${feature.uri}:${sc.line}`,
    }));
  };
  for (const child of feature.children) {
    if (child.type === 'rule') child.children.forEach((sc) => push(sc, child));
    else push(child, null);
  }
  return out;
}

function substitute(text, header, row) {
  if (!text) return text;
  let out = text;
  header.forEach((name, i) => {
    out = out.split(`<${name}>`).join(row[i] === undefined ? '' : row[i]);
  });
  return out;
}

/** Expand a Scenario Outline into concrete example rows (1 entry for plain scenarios). */
function expandOutline(scenario) {
  if (scenario.type !== 'scenarioOutline' || !scenario.examples.length) {
    return [{
      name: scenario.name,
      line: scenario.line,
      steps: scenario.steps,
      exampleRow: null,
      exampleTags: [],
    }];
  }
  const out = [];
  for (const ex of scenario.examples) {
    if (!ex.header) continue;
    const header = ex.header.cells;
    for (const row of ex.rows) {
      out.push({
        name: substitute(scenario.name, header, row.cells),
        line: row.line,
        exampleTags: ex.tags,
        exampleRow: header.reduce((acc, key, i) => Object.assign(acc, { [key]: row.cells[i] }), {}),
        steps: scenario.steps.map((s) => Object.assign({}, s, {
          text: substitute(s.text, header, row.cells),
          docString: s.docString
            ? Object.assign({}, s.docString, { content: substitute(s.docString.content, header, row.cells) })
            : null,
          dataTable: s.dataTable
            ? { rows: s.dataTable.rows.map((r) => ({ line: r.line, cells: r.cells.map((c) => substitute(c, header, row.cells)) })) }
            : null,
        })),
      });
    }
  }
  return out.length ? out : [{ name: scenario.name, line: scenario.line, steps: scenario.steps, exampleRow: null, exampleTags: [] }];
}

function stepCount(scenario) {
  const bg = scenario.background ? scenario.background.steps.length : 0;
  return bg + scenario.steps.length;
}

/** Number of concrete cases a scenario contributes (outline rows count individually). */
function caseCount(scenario) {
  if (scenario.type !== 'scenarioOutline') return 1;
  return scenario.examples.reduce((n, ex) => n + (ex.header ? ex.rows.length : 0), 0) || 1;
}

module.exports = {
  DIALECTS,
  parseFeature,
  flattenScenarios,
  expandOutline,
  stepCount,
  caseCount,
  splitTableRow,
};

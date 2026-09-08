'use strict';
/**
 * UI chrome labels for generated reports.
 *
 * Reports are read by humans (product owners, managers), so the chrome is
 * localized while the Gherkin content itself is always shown verbatim.
 * Select with `--labels en|zh-CN|zh-TW|ja` (default en).
 */

const LABELS = {
  en: {
    specReport: 'Specification Report', coverageReport: 'Requirement Coverage Report',
    flowReport: 'Page Flow Report', generated: 'Generated', sources: 'Sources',
    features: 'Features', rules: 'Rules', scenarios: 'Scenarios', cases: 'Cases',
    steps: 'Steps', requirements: 'Requirements', tags: 'Tags',
    requirementIndex: 'Requirement traceability', tagIndex: 'Tag index',
    background: 'Background', examples: 'Examples', warnings: 'Parse warnings',
    noRequirement: 'Scenarios without a requirement tag', coveredBy: 'Covered by',
    feature: 'Feature', scenario: 'Scenario', tag: 'Tag', count: 'Count',
    outline: 'Scenario Outline', requirement: 'Requirement', status: 'Status',
    covered: 'Covered', uncovered: 'Uncovered', executed: 'Executed',
    notExecuted: 'Not executed', passed: 'Passed', failed: 'Failed',
    undefinedSteps: 'Undefined', pending: 'Pending', skipped: 'Skipped',
    passRate: 'Pass rate', coverageRate: 'Coverage', specCoverage: 'Spec coverage',
    execCoverage: 'Execution coverage', byRequirement: 'By requirement',
    byFeature: 'By feature', orphanTests: 'Executed cases not found in specs',
    duration: 'Duration', result: 'Result', pages: 'Pages', screens: 'Screens',
    screen: 'Screen', platform: 'Platform', transitions: 'Transitions',
    screenshots: 'Screenshots', diagram: 'Page flow diagram', gallery: 'Screenshot gallery',
    entryPages: 'Entry pages', visits: 'Visits', from: 'From', to: 'To',
    trigger: 'Triggered by', scenarioPaths: 'Scenario paths', page: 'Page',
    total: 'Total', none: 'None', open: 'Details',
  },
  'zh-CN': {
    specReport: '需求规格报告', coverageReport: '需求覆盖率报告',
    flowReport: '页面跳转报告', generated: '生成时间', sources: '来源',
    features: '功能', rules: '规则', scenarios: '场景', cases: '用例',
    steps: '步骤', requirements: '需求', tags: '标签',
    requirementIndex: '需求追溯矩阵', tagIndex: '标签索引',
    background: '背景', examples: '示例数据', warnings: '解析警告',
    noRequirement: '未标注需求编号的场景', coveredBy: '覆盖场景',
    feature: '功能', scenario: '场景', tag: '标签', count: '数量',
    outline: '场景大纲', requirement: '需求', status: '状态',
    covered: '已覆盖', uncovered: '未覆盖', executed: '已执行',
    notExecuted: '未执行', passed: '通过', failed: '失败',
    undefinedSteps: '未实现', pending: '待实现', skipped: '跳过',
    passRate: '通过率', coverageRate: '覆盖率', specCoverage: '规格覆盖率',
    execCoverage: '执行覆盖率', byRequirement: '按需求',
    byFeature: '按功能', orphanTests: '规格中不存在的已执行用例',
    duration: '耗时', result: '结果', pages: '页面', screens: '画面',
    screen: '画面', platform: '平台', transitions: '跳转',
    screenshots: '截图', diagram: '页面跳转图', gallery: '截图画廊',
    entryPages: '入口页面', visits: '访问次数', from: '来源页', to: '目标页',
    trigger: '触发步骤', scenarioPaths: '场景路径', page: '页面',
    total: '合计', none: '无', open: '详情',
  },
  'zh-TW': {
    specReport: '需求規格報告', coverageReport: '需求覆蓋率報告',
    flowReport: '頁面跳轉報告', generated: '產生時間', sources: '來源',
    features: '功能', rules: '規則', scenarios: '場景', cases: '案例',
    steps: '步驟', requirements: '需求', tags: '標籤',
    requirementIndex: '需求追溯矩陣', tagIndex: '標籤索引',
    background: '背景', examples: '範例資料', warnings: '解析警告',
    noRequirement: '未標註需求編號的場景', coveredBy: '覆蓋場景',
    feature: '功能', scenario: '場景', tag: '標籤', count: '數量',
    outline: '場景大綱', requirement: '需求', status: '狀態',
    covered: '已覆蓋', uncovered: '未覆蓋', executed: '已執行',
    notExecuted: '未執行', passed: '通過', failed: '失敗',
    undefinedSteps: '未實作', pending: '待實作', skipped: '略過',
    passRate: '通過率', coverageRate: '覆蓋率', specCoverage: '規格覆蓋率',
    execCoverage: '執行覆蓋率', byRequirement: '按需求',
    byFeature: '按功能', orphanTests: '規格中不存在的已執行案例',
    duration: '耗時', result: '結果', pages: '頁面', screens: '畫面',
    screen: '畫面', platform: '平台', transitions: '跳轉',
    screenshots: '截圖', diagram: '頁面跳轉圖', gallery: '截圖畫廊',
    entryPages: '入口頁面', visits: '造訪次數', from: '來源頁', to: '目標頁',
    trigger: '觸發步驟', scenarioPaths: '場景路徑', page: '頁面',
    total: '合計', none: '無', open: '詳情',
  },
  ja: {
    specReport: '仕様レポート', coverageReport: '要件カバレッジレポート',
    flowReport: '画面遷移レポート', generated: '生成日時', sources: 'ソース',
    features: 'フィーチャ', rules: 'ルール', scenarios: 'シナリオ', cases: 'ケース',
    steps: 'ステップ', requirements: '要件', tags: 'タグ',
    requirementIndex: '要件トレーサビリティ', tagIndex: 'タグ一覧',
    background: '背景', examples: 'サンプルデータ', warnings: '解析警告',
    noRequirement: '要件タグのないシナリオ', coveredBy: '対応シナリオ',
    feature: 'フィーチャ', scenario: 'シナリオ', tag: 'タグ', count: '件数',
    outline: 'シナリオアウトライン', requirement: '要件', status: '状態',
    covered: 'カバー済み', uncovered: '未カバー', executed: '実行済み',
    notExecuted: '未実行', passed: '成功', failed: '失敗',
    undefinedSteps: '未実装', pending: '保留', skipped: 'スキップ',
    passRate: '成功率', coverageRate: 'カバレッジ', specCoverage: '仕様カバレッジ',
    execCoverage: '実行カバレッジ', byRequirement: '要件別',
    byFeature: 'フィーチャ別', orphanTests: '仕様に存在しない実行ケース',
    duration: '所要時間', result: '結果', pages: 'ページ', screens: '画面',
    screen: '画面', platform: 'プラットフォーム', transitions: '遷移',
    screenshots: 'スクリーンショット', diagram: '画面遷移図', gallery: 'スクリーンショット一覧',
    entryPages: '入口ページ', visits: '訪問回数', from: '遷移元', to: '遷移先',
    trigger: 'きっかけ', scenarioPaths: 'シナリオ経路', page: 'ページ',
    total: '合計', none: 'なし', open: '詳細',
  },
};

function labelsFor(tag) {
  if (!tag || tag === true) return LABELS.en;
  const exact = LABELS[tag];
  if (exact) return exact;
  const lower = String(tag).toLowerCase();
  const key = Object.keys(LABELS).find((k) => k.toLowerCase() === lower);
  if (key) return LABELS[key];
  const base = lower.split(/[-_]/)[0];
  const baseKey = Object.keys(LABELS).find((k) => k.toLowerCase().split('-')[0] === base);
  return baseKey ? LABELS[baseKey] : LABELS.en;
}

module.exports = { LABELS, labelsFor };

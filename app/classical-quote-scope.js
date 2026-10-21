"use strict";

const {semanticCatalogue: semanticCatalogue, reference: reference} = require("./semantic-branches");

const {applyStandard: applyStandard, variantGroups: variantGroups} = require("./standard");

const {preferredGlyphs: preferredGlyphs} = require("./lexicon-resolution");

const referenceSources = new Set(reference.entries.map(e => e.source));

const metadata = new Map(require("./data/ambiguity-priority.json").entries.map(e => [ e.source, e ]));

const variants = variantGroups.map(g => g.id);

const semanticLabels = new Set([ "必要區分", "必要分義", "詞義分化（可選習慣）", "專名與專業語境", "專名／專門義", "衝突預設／保留特殊義項" ]);

const projectSenseOverrides = new Set([ "巨", "鉴" ]);

const entries = [];

for (const row of semanticCatalogue()) {
    const labels = metadata.get(row.source)?.subcategories || [];
    const pureGlyph = labels.length && labels.every(s => /字形|異體/u.test(s));
    if (pureGlyph && !projectSenseOverrides.has(row.source)) continue;
    if (!referenceSources.has(row.source) && !labels.some(s => semanticLabels.has(s))) continue;
    const targets = [ ...new Set(row.targets.map(t => preferredGlyphs(applyStandard(row.source, t, variants, new Set([ 0 ]))))) ];
    if (targets.length < 2) continue;
    entries.push({
        source: row.source,
        targets: targets,
        ...row.source === "修" ? {
            contextPolicy: "修身、脩身等通用字形不作辨義理由；乾肉、束脩等局部義項另判。"
        } : {},
        basis: projectSenseOverrides.has(row.source) ? "project-whole-word-sense" : referenceSources.has(row.source) ? "semantic-branch-reference" : "explicit-semantic-classification"
    });
}

const bySource = new Map(entries.map(e => [ e.source, e ]));

const definition = "只收含有有效辨義字位的完整引文；依現行語義分支與方向／排除政策，至少有兩個不同義項候選。單一字形轉換、純異體及已合併字形不能作收錄理由；字位可保留原字，如云、干；修／脩須有實際局部義項，通用異體不作辨義理由。";

module.exports = {
    entries: entries,
    bySource: bySource,
    definition: definition,
    version: "2026-10-17-sense-only-v2-contextual-xiu"
};

"use strict";

const fs = require("node:fs"), path = require("node:path");

const cache = new Map;

const {canonicalGlyphs: canonicalGlyphs, fixed: fixed} = require("./source-letter-policy");

function proofCatalogue(mode = "classical") {
    if (![ "classical", "modern" ].includes(mode)) throw new Error("未知的校對模式。");
    if (cache.has(mode)) return cache.get(mode);
    const graph = new Map;
    function join(chars) {
        chars = chars.filter(c => c !== "象" && c !== "像" && !require("./excluded-characters").excluded.has(c)).map(c => fixed.get(c) || canonicalGlyphs(c));
        chars = [ ...new Set(chars.filter(c => Array.from(c).length === 1)) ];
        for (const c of chars) {
            if (!graph.has(c)) graph.set(c, new Set);
            for (const d of chars) graph.get(c).add(d);
        }
    }
    const root = path.dirname(require.resolve("opencc/package.json"));
    const dirs = mode === "classical" ? [ path.join(root, "data/dictionary"), path.join(__dirname, "vendor/gujicc") ] : [ path.join(root, "data/dictionary") ];
    for (const dir of dirs) for (const name of fs.readdirSync(dir).filter(n => mode === "classical" ? /(Characters|Variants)\.txt$/.test(n) : /^(STCharacters|TSCharacters|TWVariants|HKVariants)\.txt$/.test(n))) for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
        if (!line.trim() || line.startsWith("#")) continue;
        const [source, values] = line.trim().split("\t");
        if (values) join([ source, ...values.split(/ +/) ]);
    }
    for (const g of require("./standard").variantGroups) for (const [variant, basic] of Object.entries(g.forms)) join([ variant, basic ]);
    for (const p of Object.values(require("./data/historical-profiles.json"))) for (const [a, b] of Object.entries(p.mapping || {})) join([ a, b ]);
    const metadata = require("./data/ambiguity-priority.json").entries;
    const bySource = new Map(metadata.map(e => [ e.source, e ]));
    const singleMap = require("./profiles").getDictionaries("opencc").characters;
    const seen = new Set, cached = [];
    for (const c of graph.keys()) {
        if (seen.has(c)) continue;
        const forms = [], queue = [ c ];
        seen.add(c);
        for (let i = 0; i < queue.length; i++) {
            const a = queue[i];
            forms.push(a);
            for (const b of graph.get(a) || []) if (!seen.has(b)) {
                seen.add(b);
                queue.push(b);
            }
        }
        if (forms.length > 1) {
            const entries = forms.map(f => bySource.get(f)).filter(Boolean);
            const oneToOne = forms.length === 2 && forms.some(f => {
                const targets = singleMap.get(f);
                return targets?.length === 1 && targets[0] !== f && forms.includes(targets[0]);
            }) && !entries.some(e => e.branches.length > 1);
            const commonForms = new Set(entries.flatMap(e => e.branches.filter(b => {
                const values = [ b.news?.perMillion, b.social?.perMillion ].filter(v => typeof v === "number");
                return values.length && values.reduce((a, b) => a + b, 0) / values.length >= 10;
            }).map(b => b.target)));
            const reviewClass = oneToOne ? "plain" : commonForms.size >= 2 ? "common" : "uncommon";
            cached.push({
                source: forms[0],
                activeTargets: forms,
                reviewClass: reviewClass
            });
        }
    }
    cached.push(...require("./data/pos-lexicon.json").riskWords.filter(r => Array.from(r.source).length > 1));
    cached.push(...require("./cai-risk").catalogue());
    cached.push(...require("./word-boundary-risk").catalogue());
    for (const mark of [ "！", "!" ]) {
        const targets = [ "幹", "乾", "干" ].map(c => c + mark), tags = [ "e", "a", "v", "n", "z" ];
        cached.push({
            type: "risk-word",
            source: "干" + mark,
            activeTargets: targets,
            reviewClass: "risk",
            risk: true,
            condition: "isolated-exclamation",
            byPos: Object.fromEntries(tags.map(p => [ p, targets ])),
            defaultsByPos: Object.fromEntries(tags.map(p => [ p, {
                target: "幹" + mark,
                basis: "manual-context"
            } ])),
            reason: "單字感嘆分句；按形式列風險，不將條件詞性冒充原模型標籤。"
        });
    }
    const reviewed = require("./review-risk").decorateCatalogue(cached);
    cache.set(mode, reviewed);
    return reviewed;
}

module.exports = {
    proofCatalogue: proofCatalogue
};

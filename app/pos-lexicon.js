"use strict";

const data = require("./data/pos-lexicon.json");

const {applyStandard: applyStandard} = require("./standard");

const {canonicalGlyphs: canonicalGlyphs} = require("./source-letter-policy");

const indexes = Object.fromEntries(Object.entries(data.directions).map(([direction, rows]) => {
    const index = new Map;
    for (const row of rows) {
        if (!index.has(row.source)) index.set(row.source, new Map);
        for (const tag of row.pos) {
            if (index.get(row.source).has(tag)) throw new Error("重複的詞形與詞性規則：" + row.source + "/" + tag);
            index.get(row.source).set(tag, row);
        }
    }
    return [ direction, index ];
}));

function needsAnalysis(text, direction) {
    for (const source of indexes[direction].keys()) if (text.includes(source)) return true;
    return false;
}

const riskIndex = new Map(data.riskWords.filter(r => r.source.length > 1).map(r => [ r.source, r ]));

function risks(text, tokens, direction) {
    if (direction !== "s2t") return [];
    const existing = tokens.flatMap(token => {
        const row = riskIndex.get(token.text), targets = row?.byPos[token.pos];
        return targets?.length > 1 && text.slice(token.start, token.end) === token.text ? [ {
            source: token.text,
            pos: token.pos,
            offset: token.start,
            candidates: targets,
            default: row.defaultsByPos?.[token.pos],
            reason: row.reason || "同一詞性有多個繁體選項；默認選字仍需按語義校對。"
        } ] : [];
    });
    return require("./review-risk").risks(text, tokens, direction, existing);
}

function apply(text, converted, tokens, direction, options = {}) {
    if ([ ...text ].length !== [ ...converted ].length) return {
        text: converted,
        hits: []
    };
    const result = [ ...converted ], hits = [];
    for (const token of tokens) {
        const entry = indexes[direction].get(direction === "t2s" ? canonicalGlyphs(token.text) : token.text)?.get(token.pos);
        if (!entry || text.slice(token.start, token.end) !== token.text) continue;
        if ([ ...entry.source ].length !== [ ...entry.target ].length) continue;
        const positions = [ ...text.slice(0, token.start) ].length;
        if ([ ...entry.source ].some((_, i) => options.posPriority?.has(positions + i))) continue;
        if (entry.basis === "word-frequency" && [ ...entry.source ].some((_, i) => options.resolved?.has(positions + i))) continue;
        if (entry.basis.startsWith("manual") && [ ...entry.source ].length === 1 && options.phraseResolved?.has(positions)) continue;
        if (entry.basis === "manual-default-compound" && [ ...entry.source ].some((_, i) => options.phraseResolved?.has(positions + i))) continue;
        const target = direction === "s2t" && options.variants ? applyStandard(entry.source, entry.target, options.variants, new Set([ ...entry.source ].map((_, i) => i)), false) : entry.target;
        [ ...target ].forEach((character, i) => {
            result[positions + i] = character;
        });
        hits.push({
            source: token.text,
            target: target,
            pos: token.pos,
            offset: token.start,
            basis: entry.basis
        });
    }
    return {
        text: result.join(""),
        hits: hits
    };
}

module.exports = {
    apply: apply,
    needsAnalysis: needsAnalysis,
    risks: risks,
    version: data.version
};

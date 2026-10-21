"use strict";

const policy = require("../dictionaries/pos-lexicon/resolution_policy.json");

const preferred = new Map([ ...policy.equivalent_glyphs, ...policy.merged_glyphs || [] ].flatMap(r => [ ...r.forms ].map(c => [ c, r.preferred ])));

function preferredGlyphs(text) {
    return [ ...text ].map(c => preferred.get(c) || c).join("");
}

const segmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

function preferredWords(before, converted, tokens = []) {
    if ([ ...before ].length !== [ ...converted ].length) return converted;
    const parts = [ ...converted ];
    const units = tokens.length ? tokens : [ ...segmenter.segment(before) ].map(t => ({
        text: t.segment,
        start: t.index,
        end: t.index + t.segment.length
    }));
    for (const token of units) {
        if (before.slice(token.start, token.end) !== token.text) continue;
        const rules = policy.word_equivalents[token.text];
        const rule = rules && ![ "nh", "ni", "ns", "nz" ].includes(token.pos) ? rules[token.pos] || Object.values(rules)[0] : null;
        if (!rule || [ ...token.text ].length !== [ ...rule.preferred ].length) continue;
        const position = [ ...before.slice(0, token.start) ].length;
        [ ...rule.preferred ].forEach((character, i) => {
            parts[position + i] = character;
        });
    }
    return parts.join("");
}

function productiveManual(before, converted, tokens) {
    if ([ ...before ].length !== [ ...converted ].length) return converted;
    const result = [ ...converted ];
    for (const token of tokens) {
        if (before.slice(token.start, token.end) !== token.text) continue;
        for (const [source, byPos] of Object.entries(policy.productive_manual)) {
            const target = byPos[token.pos];
            if (!target) continue;
            const position = [ ...before.slice(0, token.start) ].length;
            [ ...token.text ].forEach((character, i) => {
                if (character === source) result[position + i] = target;
            });
        }
    }
    return result.join("");
}

module.exports = {
    preferredGlyphs: preferredGlyphs,
    preferredWords: preferredWords,
    productiveManual: productiveManual,
    policy: policy
};

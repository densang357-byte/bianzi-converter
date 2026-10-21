"use strict";

const policy = require("./data/lexicon-direction-policy.json");

const merged = new Map(require("../dictionaries/pos-lexicon/resolution_policy.json").merged_glyphs?.flatMap(r => [ ...r.forms ].map(c => [ c, r.preferred ])) || []);

const canonicalGlyphs = text => [ ...text ].map(c => merged.get(c) || c).join("");

const retained = new Set(Object.entries(policy.characters).filter(([, rule]) => rule.s2t_identity).map(([source]) => source));

const fixed = new Map(Object.entries(policy.characters).filter(([, rule]) => rule.fixed_s2t_target).map(([source, rule]) => [ source, rule.fixed_s2t_target ]));

function retainSourceLetters(before, after) {
    const source = [ ...before ], target = [ ...after ];
    if (source.length !== target.length) throw new Error("來源保留字無法按原文對齊。");
    return target.map((letter, i) => fixed.get(source[i]) || (retained.has(source[i]) ? source[i] : letter)).join("");
}

module.exports = {
    retained: retained,
    fixed: fixed,
    retainSourceLetters: retainSourceLetters,
    canonicalGlyphs: canonicalGlyphs
};

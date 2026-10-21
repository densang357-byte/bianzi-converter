"use strict";

const policy = require("./data/excluded-conversion-characters.json"), excluded = new Set(policy.characters);

function mapping(source, target) {
    const a = [ ...source ], b = [ ...target ];
    if (a.length !== b.length) {
        if (a.some(c => excluded.has(c)) || b.some(c => excluded.has(c))) throw Error("排除字形的詞條長度不一致：" + source + " → " + target);
        return target;
    }
    return b.map((c, i) => excluded.has(a[i]) ? a[i] : excluded.has(c) ? policy.replacementTargets[c] : c).join("");
}

const candidates = (source, targets) => excluded.has(source) ? [ source ] : [ ...new Set(targets.filter(t => ![ ...t ].some(c => excluded.has(c)))) ];

function cleanData(value, source) {
    if (Array.isArray(value)) return value.map(v => cleanData(v, source));
    if (!value || typeof value !== "object") return value;
    const s = typeof value.source === "string" ? value.source : source, out = {};
    for (const [key, v] of Object.entries(value)) {
        if (s && key === "target" && typeof v === "string") out[key] = mapping(s, v); else if (s && [ "targets", "activeTargets", "candidates" ].includes(key) && Array.isArray(v)) out[key] = [ ...new Set(v.map(t => typeof t === "string" ? mapping(s, t) : t)) ]; else if (s && [ "byPos", "default_by_pos" ].includes(key) && v && typeof v === "object") out[key] = Object.fromEntries(Object.entries(v).map(([p, t]) => [ p, Array.isArray(t) ? [ ...new Set(t.map(x => mapping(s, x))) ] : typeof t === "string" ? mapping(s, t) : cleanData(t, s) ])); else if ([ "characters", "words" ].includes(key) && v && typeof v === "object" && !Array.isArray(v)) out[key] = Object.fromEntries(Object.entries(v).map(([word, r]) => [ word, cleanData(r, word) ])); else out[key] = cleanData(v, s);
    }
    if (Array.isArray(out.riskWords)) out.riskWords = out.riskWords.filter(r => r.activeTargets?.length > 1);
    return out;
}

module.exports = {
    policy: policy,
    excluded: excluded,
    mapping: mapping,
    candidates: candidates,
    cleanData: cleanData
};

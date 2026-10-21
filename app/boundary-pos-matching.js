"use strict";

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

function project(text, tokens, native = tokens) {
    const projected = tokens.slice(), corrections = [];
    for (let i = 0; i < native.length - 1; i++) {
        const a = native[i], b = native[i + 1], e = a.boundary_pos;
        if (e?.version !== "same-model-boundary-pos-v1" || ![ "HanLP multitask863", "LTP base" ].includes(e.tagger) || e.token_index !== i) continue;
        if (proper.has(a.pos) || proper.has(b.pos) || a.end !== b.start || text.slice(a.start, b.end) !== a.text + b.text) continue;
        if (!/^\p{Script=Han}$/u.test(a.text) || a.text === "然" || b.text !== "然" || ![ "k", "u", "c" ].includes(b.raw_pos || b.pos)) continue;
        if (!Array.isArray(e.original_words) || e.original_words.length !== 2 || e.original_words[0] !== a.text || e.original_words[1] !== b.text) continue;
        if (!Array.isArray(e.original_raw_pos) || e.original_raw_pos[0] !== (a.raw_pos || a.pos) || e.original_raw_pos[1] !== (b.raw_pos || b.pos)) continue;
        if (e.alternative_text !== a.text + b.text || ![ "d", "a", "z" ].includes(e.alternative_raw_pos)) continue;
        const attached = [ a, b ].some(t => Number.isInteger(t.parent) && t.parent >= 0 && t.parent < native.length && t.parent !== i && t.parent !== i + 1 && t.relation === "ADV" && [ "v", "a" ].includes(native[t.parent].pos));
        if (!attached) continue;
        const at = projected.findIndex(t => t.start === a.start && t.end === a.end && t.text === a.text);
        if (at < 0 || projected[at + 1]?.start !== b.start || projected[at + 1]?.end !== b.end || projected[at + 1]?.text !== b.text) continue;
        projected.splice(at, 2, {
            text: e.alternative_text,
            pos: e.alternative_raw_pos,
            start: a.start,
            end: b.end,
            derived: true,
            matchingRule: "same-model-ran-adverbial"
        });
        corrections.push({
            start: a.start,
            end: b.end,
            source: e.alternative_text,
            kind: "same-model-matching-view",
            rule: "same-model-ran-adverbial",
            reason: "單字＋然的後綴構詞，有原始狀語依存證據，且同一詞性模型在完整句子的合併候選詞界上給出副詞／狀態詞標籤；原始詞界與詞性保留。",
            original: [ a, b ].map(t => ({
                text: t.text,
                pos: t.pos,
                raw_pos: t.raw_pos || t.pos
            })),
            derived: [ {
                text: e.alternative_text,
                pos: e.alternative_raw_pos
            } ],
            boundaryEvidence: structuredClone(e)
        });
    }
    return {
        tokens: projected,
        corrections: corrections
    };
}

module.exports = {
    project: project,
    version: "same-model-boundary-pos-v1"
};

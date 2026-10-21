"use strict";

function matches(text, tokens) {
    const result = [];
    for (const t of tokens) {
        const evidence = t.constituent_pos, parts = evidence?.parts;
        if (t.pos !== "n" || text.slice(t.start, t.end) !== t.text || evidence?.version !== "hanlp-constituent-pos-v1" || !Array.isArray(parts) || parts.length !== 2) continue;
        const [modifier, head] = parts;
        if (!modifier.text || modifier.raw_pos !== "a" || head.text !== "发" || head.raw_pos !== "n" || modifier.text + head.text !== t.text) continue;
        const start = t.end - 1;
        result.push({
            start: start,
            end: t.end,
            source: "发",
            target: "髮",
            pos: t.pos,
            kind: "hanlp-constituent-sense",
            rule: "adjective-noun-head",
            reason: "同一詞性模型在候選詞界上確認形容詞＋名詞中心語；原始整詞仍保留名詞標註，不靠顏色或專名詞表。",
            constituentEvidence: structuredClone(evidence)
        });
    }
    return result;
}

module.exports = {
    matches: matches
};

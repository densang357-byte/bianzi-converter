"use strict";

const data = require("./data/cai-risk-policy.json");

const index = new Map(data.words.flatMap(row => row.matchForms.map(form => [ form, row ])));

function risks(before, tokens) {
    const result = tokens.flatMap(t => {
        const row = index.get(t.text);
        if (!row || before.slice(t.start, t.end) !== t.text) return [];
        if ([ "n", "nh", "ni", "ns", "nz" ].includes(t.pos)) {
            const left = before.slice(0, t.start), right = before.slice(t.end);
            const possessor = /(?:自己|本身|[他她我你它您](?:們|们)?)的$/u.test(left);
            const conditional = t.text === "才能" && !possessor && /(?:只有|唯有|惟有|必須|必须|等到|直到|之後|之后|以後|以后|這樣|这样|如此)[^。！？；，]{0,30}$/u.test(left) && !/^[，。！？；、」』]/u.test(right);
            if (!conditional) return [];
            return [ {
                source: t.text,
                offset: t.start,
                pos: t.pos,
                candidates: row.nounTargets,
                nounCandidates: row.nounTargets,
                policy: data.version,
                riskKind: "疑似詞性（待核）",
                detectedCause: "noun-in-conditional-frame",
                reviewOnly: true,
                automaticConversion: false,
                notAPosGold: true,
                reason: "原標註爲名詞，轉換仍只取才；局部條件句與名詞讀法有衝突，另列詞性待核，不自動改標或換字。",
                reviewSuggestion: {
                    spelling: "纔能",
                    pos: "d",
                    notNativePrediction: true,
                    notAPosGold: true
                }
            } ];
        }
        if (data.lexicalWords.some(w => row.matchForms.includes(w))) {
            const rule = require("./data/lexicon-direction-policy.json").words[t.text];
            const resolved = require("./cai-rules").choose(before, t, rule, rule.default_by_pos?.[t.pos]);
            if (resolved) return [];
        }
        return [ {
            source: t.text,
            offset: t.start,
            pos: t.pos,
            candidates: row.activeTargets,
            nounCandidates: row.nounTargets,
            reason: row.reason,
            policy: data.version,
            riskKind: row.riskKind,
            reviewOnly: true,
            automaticConversion: false,
            notAPosGold: true
        } ];
    });
    for (const row of data.words.filter(row => data.boundaryWords.some(w => row.matchForms.includes(w)))) {
        for (const form of row.matchForms) for (let at = before.indexOf(form); at >= 0; at = before.indexOf(form, at + form.length)) {
            const end = at + form.length;
            if (!/[才纔]/u.test(before[end] || "")) continue;
            const native = tokens.filter(t => t.start < end && t.end > at);
            if (native.length < 2 || native[0].start !== at || native.at(-1).end !== end) continue;
            if (native.at(-1).text !== "才" || ![ "c", "d" ].includes(native.at(-1).pos)) continue;
            if (result.some(r => r.offset === at && r.source === form)) continue;
            result.push({
                source: form,
                offset: at,
                pos: native.map(t => t.pos).join("+"),
                candidates: row.nounTargets,
                nounCandidates: row.nounTargets,
                policy: data.version,
                riskKind: "疑似分詞（待核）",
                detectedCause: "split-talent-before-another-cai",
                reviewOnly: true,
                automaticConversion: false,
                notAPosGold: true,
                reason: "相鄰兩個才中，前一字可能屬才能名詞，後一字可能是副詞；保存原分詞供覆核，不重新合併或據此改字。",
                nativeTokens: native.map(t => ({
                    ...t
                })),
                reviewSuggestion: {
                    spelling: row.nounTargets[0],
                    pos: "n",
                    notNativePrediction: true,
                    notAPosGold: true
                }
            });
        }
    }
    return result;
}

function catalogue() {
    return data.words.map(row => ({
        ...row,
        type: "risk-word",
        reviewClass: "risk",
        risk: true,
        byPos: {},
        defaultsByPos: {},
        reviewOnly: true
    }));
}

module.exports = {
    risks: risks,
    catalogue: catalogue,
    version: data.version
};

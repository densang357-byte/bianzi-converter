"use strict";

const data = require("./data/word-boundary-risks.json");

const forms = new Map(data.words.flatMap(row => row.matchForms.map(form => [ form, row ])));

const known = {
    "天后": [ "n", "nh", "ns", "nz" ],
    "四周": [ "n", "nd", "nl" ],
    "海里": [ "n", "q", "m" ],
    "文丑": [ "n", "nh" ],
    "学历": [ "n" ],
    "背向": [ "v" ],
    "出戏": [ "v" ]
};

function risks(before, tokens, existing = []) {
    const result = existing.slice(), seen = new Set(existing.map(r => r.offset + "|" + r.source));
    for (const t of tokens) {
        const row = forms.get(t.text), key = t.start + "|" + t.text;
        if (!row || seen.has(key) || before.slice(t.start, t.end) !== t.text) continue;
        const head = tokens[t.parent], children = tokens.filter(c => c.parent === (t.id ?? tokens.indexOf(t)));
        const duration = /^(?:需要|耗時|耗时|歷時|历时|花費|花费|持續|持续|用去)$/u;
        const temporalConflict = t.text === "四周" && [ "nd", "nl" ].includes(t.pos) && ([ "VOB", "IOB" ].includes(t.relation) && duration.test(head?.text || "") || t.relation === "HED" && children.some(c => duration.test(c.text)));
        if (temporalConflict) {
            seen.add(key);
            result.push({
                source: t.text,
                pos: t.pos,
                offset: t.start,
                candidates: [ "四周" ],
                reason: "原模型標爲方位／處所名詞，但直接依存於表示所需時長的述語；另列數量時間分析待核，不改原標註或據風險改字。",
                policy: data.version,
                riskKind: "疑似詞性／詞界（待核）",
                reviewOnly: true,
                automaticConversion: false,
                notAPosGold: true,
                dependency: {
                    relation: t.relation,
                    parent: t.parent,
                    head: head?.text,
                    children: children.map(c => c.text)
                },
                reviewSuggestion: {
                    tokens: [ {
                        text: "四",
                        pos: "m"
                    }, {
                        text: "周",
                        pos: "q"
                    } ],
                    spelling: "四週",
                    notNativePrediction: true
                }
            });
            continue;
        }
        if ((known[row.source] || []).includes(t.pos)) continue;
        if (row.lexicalTargets.length && [ "n", "nh", "ni", "ns", "nz" ].includes(t.pos)) continue;
        seen.add(key);
        result.push({
            source: t.text,
            pos: t.pos,
            offset: t.start,
            candidates: row.activeTargets,
            lexicalCandidates: row.lexicalTargets,
            reason: row.reason,
            policy: data.version,
            riskKind: row.riskKind,
            reviewOnly: true,
            automaticConversion: false,
            notAPosGold: true
        });
    }
    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a.end !== b.start) continue;
        const cooking = a.text === "下面" && a.pos === "nd" && b.text === "条" && b.pos === "n";
        const speech = a.text === "口" && a.pos === "n" && b.text === "吃" && b.pos === "v" && /(?:有|患|患有)$/u.test(before.slice(0, a.start));
        if (!cooking && !speech) continue;
        const source = cooking ? "下面条" : "口吃", key = a.start + "|" + source;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
            source: source,
            pos: a.pos + "+" + b.pos,
            offset: a.start,
            candidates: [ source ],
            policy: data.version,
            reason: cooking ? "方位下面與單獨條/n相連，可能誤拆了烹煮動詞下/v及麪條/n；僅列分析待核。" : "有口吃的語境可能指言語不流，原模型卻切成口/n和吃/v；僅列分析待核，飲食及門口喫飯反例不套用。",
            riskKind: "疑似分詞（待核）",
            reviewOnly: true,
            automaticConversion: false,
            notAPosGold: true,
            reviewSuggestion: {
                spelling: cooking ? "下麪條" : "口吃",
                notNativePrediction: true
            },
            nativeTokens: [ {
                ...a
            }, {
                ...b
            } ]
        });
    }
    return result;
}

function catalogue() {
    return data.words;
}

module.exports = {
    risks: risks,
    catalogue: catalogue,
    version: data.version
};

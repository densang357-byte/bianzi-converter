"use strict";

const base = require("./linguistic-analysis");

const policy = require("../dictionaries/hanlp/matching-policy.json");

const NUMBER = "(?:好)?[零〇一二两兩三四五六七八九十百千万萬亿億数數几幾半0-9０-９]+(?:[多来來余餘])?";

const quantity = new RegExp("^(" + NUMBER + ")([大小]?)([" + policy.quantity_heads.join("") + "])([许許半]?)$", "u");

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

function analyze(text, raw, neighbors = {}) {
    const projected = [], changes = [];
    const split = (t, pieces, rule, reason) => {
        let at = t.start;
        const derived = pieces.map(([word, pos]) => {
            const r = {
                text: word,
                pos: pos,
                start: at,
                end: at + word.length,
                derived: true,
                sourceToken: {
                    text: t.text,
                    pos: t.pos,
                    raw_pos: t.raw_pos
                },
                matchingRule: rule
            };
            at = r.end;
            return r;
        });
        if (at !== t.end) throw Error("HanLP matching view changed boundaries");
        projected.push(...derived);
        changes.push({
            start: t.start,
            end: t.end,
            source: t.text,
            kind: "hanlp-matching-view",
            rule: rule,
            reason: reason,
            original: [ {
                text: t.text,
                pos: t.pos,
                raw_pos: t.raw_pos
            } ],
            derived: derived.map(({text: text, pos: pos}) => ({
                text: text,
                pos: pos
            }))
        });
    };
    for (const t of raw) {
        if (text.slice(t.start, t.end) !== t.text || proper.has(t.pos)) {
            projected.push(t);
            continue;
        }
        const q = quantity.exec(t.text);
        if (q && policy.quantity_input_pos.includes(t.pos)) {
            const left = text.slice(Math.max(0, t.start - 12), t.start).split(/[，,。！？!?；;：:\n]/u).at(-1), right = text.slice(t.end, t.end + 16).split(/[，,。！？!?；;：:\n]/u)[0];
            if (q[3] !== "坛" || /酒|醋|陈酿|陳釀|饮|飲|喝|酿|釀|清水/u.test(left + right)) {
                split(t, [ [ q[1], "m" ], ...q[2] ? [ [ q[2], "a" ] ] : [], [ q[3], "q" ], ...q[4] ? [ [ q[4], "m" ] ] : [] ], "quantity-head", "完整數量短語拆出量詞匹配位；不將整個 mq/m/n 標籤一律改成 q。");
                continue;
            }
        }
        if (t.pos === "v") {
            const v = /^([划游卷])((?:[上下进進出入回过過起來来去到向往开開住]|著|着|了)+)$/u.exec(t.text);
            if (v) {
                split(t, [ [ v[1], "v" ], [ v[2], /^[向往到]$/u.test(v[2]) ? "p" : /^[著着了过]$/u.test(v[2]) ? "u" : "v" ] ], "verb-complement", "動詞與能產趨向／體標記分開供既有單字詞性條件匹配；保留原始整詞 v。");
                continue;
            }
            if (t.text.endsWith("卷") && policy.roll_prefixes.includes(t.text.slice(0, -1))) {
                split(t, [ [ t.text.slice(0, -1), "d" ], [ "卷", "v" ] ], "roll-direction", "翻／倒／橫／飛等方向成分修飾捲動；排除閱卷、交卷等名詞賓語。");
                continue;
            }
            if (t.text.length > 1 && t.text.endsWith("于") && !/^(?:单于|單于|淳于|鲜于|鮮于)$/u.test(t.text)) {
                split(t, [ [ t.text.slice(0, -1), "v" ], [ "于", "p" ] ], "verb-preposition", "動詞末尾于的介詞匹配位；姓氏、人名及單于稱號排除。");
                continue;
            }
        }
        projected.push(t);
    }
    const lexicalMerges = [];
    for (const row of policy.modifier_compounds) for (let i = 0; i < projected.length - 1; i++) {
        const a = projected[i], b = projected[i + 1], prefix = row.source.slice(0, -1), last = row.source.slice(-1), rest = b.text.slice(last.length);
        if (a.text !== prefix || a.pos !== row.head_pos || b.pos !== row.tail_pos || a.end !== b.start || !b.text.startsWith(last)) continue;
        if (!row.noun_heads.some(h => rest === h || row.noun_suffixes.some(s => rest === h + s))) continue;
        const end = b.start + last.length, derived = [ {
            text: row.source,
            pos: row.head_pos,
            start: a.start,
            end: end,
            derived: true,
            matchingRule: "modifier-boundary"
        }, {
            text: rest,
            pos: row.tail_pos,
            start: end,
            end: b.end,
            derived: true,
            matchingRule: "modifier-boundary"
        } ];
        projected.splice(i, 2, ...derived);
        changes.push({
            start: a.start,
            end: b.end,
            source: a.text + b.text,
            kind: "hanlp-matching-view",
            rule: "modifier-boundary",
            reason: row.sense,
            reference: row.reference,
            original: [ a, b ].map(t => ({
                text: t.text,
                pos: t.pos,
                raw_pos: t.raw_pos
            })),
            derived: derived.map(t => ({
                text: t.text,
                pos: t.pos
            }))
        });
        lexicalMerges.push({
            start: a.start,
            end: end,
            source: row.source,
            target: row.target,
            pos: row.head_pos,
            kind: "hanlp-lexical-sense",
            reason: row.sense,
            reference: row.reference
        });
    }
    for (const row of policy.noun_compounds) for (let at = text.indexOf(row.source); at >= 0; at = text.indexOf(row.source, at + row.source.length)) {
        if (/(?:初|第|老|周|星期|礼拜|禮拜|到|了|得|是|为|為|排|剩|有|在|至|一|二)$/u.test(text.slice(0, at))) continue;
        const end = at + row.source.length, inside = projected.filter(t => t.start < end && t.end > at);
        if (!inside.length || inside[0].start !== at || inside.at(-1).end !== end || inside.some(t => !row.input_pos.includes(t.pos))) continue;
        if (inside.length === 1 && inside[0].pos === row.pos) continue;
        const from = projected.indexOf(inside[0]);
        projected.splice(from, inside.length, {
            text: row.source,
            pos: row.pos,
            start: at,
            end: end,
            derived: true,
            matchingRule: "dictionary-noun"
        });
        changes.push({
            start: at,
            end: end,
            source: row.source,
            kind: "hanlp-matching-view",
            rule: "dictionary-noun",
            reason: row.sense,
            reference: row.reference,
            original: inside.map(t => ({
                text: t.text,
                pos: t.pos,
                raw_pos: t.raw_pos
            })),
            derived: [ {
                text: row.source,
                pos: row.pos
            } ]
        });
        lexicalMerges.push({
            start: at,
            end: end,
            source: row.source,
            target: row.target,
            pos: row.pos,
            kind: "hanlp-lexical-sense",
            reason: row.sense,
            reference: row.reference
        });
    }
    const result = base.analyze(text, projected, {
        ...neighbors,
        nativeTokens: raw
    });
    const lexical = [];
    for (const t of raw) {
        const row = policy.lexemes.find(r => r.source === t.text && r.pos.includes(t.pos));
        if (row) lexical.push({
            start: t.start,
            end: t.end,
            source: row.source,
            target: row.target,
            pos: t.pos,
            kind: "hanlp-lexical-sense",
            reason: row.sense,
            reference: row.reference
        });
    }
    return {
        ...result,
        corrections: [ ...changes, ...result.corrections ],
        matches: [ ...result.matches, ...lexical, ...lexicalMerges, ...require("./hanlp-structural-rules").matches(text, raw, neighbors), ...require("./hanlp-syntax-matching").matches(text, raw), ...require("./hanlp-constituent-matching").matches(text, raw) ]
    };
}

module.exports = {
    analyze: analyze,
    apply: base.apply,
    version: "hanlp-matching-v8-candidate"
};

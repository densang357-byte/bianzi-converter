"use strict";

const data = require("../dictionaries/hanlp/pos-lexicon.json");

const original = require("./pos-lexicon"), {applyStandard: applyStandard} = require("./standard");

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const stable = Object.fromEntries(Object.entries(data.stable_compounds).map(([d, rows]) => [ d, rows.slice().sort((a, b) => b.source.length - a.source.length) ]));

function needsAnalysis(text, direction) {
    return original.needsAnalysis(text, direction) || direction === "s2t" && data.reviewed_compounds.some(r => text.includes(r.source));
}

function apply(text, converted, tokens, direction, options = {}) {
    const inherited = original.apply(text, converted, tokens, direction, options);
    if ([ ...text ].length !== [ ...inherited.text ].length) return inherited;
    const output = [ ...inherited.text ], hits = [ ...inherited.hits ], claimed = [];
    const bounds = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    function put(row, at, reason, explicit = false) {
        const end = at + row.source.length, inside = tokens.filter(t => t.start < end && t.end > at);
        if (!bounds.has(at) || !bounds.has(end) || !inside.length) return;
        if (claimed.some(([a, b]) => at < b && end > a)) return;
        if (row.pos?.length && !inside.every(t => row.pos.includes(t.pos))) return;
        if (!explicit && inside.some(t => proper.has(t.pos)) && !row.source_pos.some(p => proper.has(p))) return;
        const cp = [ ...text.slice(0, at) ].length;
        if (!explicit && [ ...row.source ].some((_, i) => options.resolved?.has(cp + i) || options.posPriority?.has(cp + i))) return;
        const target = direction === "s2t" && options.variants ? applyStandard(row.source, row.target, options.variants, new Set([ ...row.source ].map((_, i) => i)), false) : row.target;
        if ([ ...row.source ].length !== [ ...target ].length) throw Error("HanLP lexical length mismatch");
        const before = output.slice(cp, cp + [ ...target ].length).join("");
        claimed.push([ at, end ]);
        if (before === target) return;
        [ ...target ].forEach((c, i) => {
            output[cp + i] = c;
        });
        hits.push({
            source: row.source,
            target: target,
            pos: inside.map(t => t.pos).join("+"),
            offset: at,
            basis: row.basis,
            reason: reason,
            rawTokens: inside.map(t => ({
                text: t.text,
                pos: t.pos
            }))
        });
    }
    if (direction === "s2t") for (const row of data.reviewed_compounds) for (let at = text.indexOf(row.source); at >= 0; at = text.indexOf(row.source, at + row.source.length)) put(row, at, row.reason, true);
    for (const row of stable[direction] || []) for (let at = text.indexOf(row.source); at >= 0; at = text.indexOf(row.source, at + row.source.length)) put(row, at, "原詞庫多詞性輸出一致且無風險候選；兼容 HanLP 整詞或跨詞邊界。");
    if (direction === "s2t") {
        for (const m of text.matchAll(/(?:成为|当上|登基)[^，,。！？!?；;]{1,10}后(?=[，,。！？!?；;])/gu)) {
            const at = m.index + m[0].length - 1;
            put({
                source: "后",
                target: "後",
                basis: "hanlp-context-temporal"
            }, at, "事件完成後的時間後，兼容原始后/n。", true);
        }
        for (const m of text.matchAll(/[一二三四五六七八九十百千万两几数\d]+坛(?=[酒水醋])/gu)) {
            const cp = [ ...text.slice(0, m.index) ].length;
            const prefix = output.slice(cp, cp + [ ...m[0] ].length - 1).join("");
            put({
                source: m[0],
                target: prefix + "罈",
                basis: "hanlp-context-vessel"
            }, m.index, "數量結構及酒水賓語確定容器罈，兼容合詞；保留數量前綴已完成的轉換。", true);
        }
    }
    return {
        text: output.join(""),
        hits: hits
    };
}

function risks(text, tokens, direction) {
    return original.risks(text, tokens, direction);
}

module.exports = {
    apply: apply,
    risks: risks,
    needsAnalysis: needsAnalysis,
    version: data.version
};

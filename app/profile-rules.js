"use strict";

const version = "profile-20261019-r12";

const modernGlyphs = {
    "線": "綫",
    "衛": "衞",
    "裏": "裡",
    "攷": "考"
};

const normalizeModernGlyphs = text => [ ...text ].map(c => modernGlyphs[c] || c).join("");

function apply(before, converted, tokens, profile, nativeTokens = tokens) {
    const source = [ ...before ], target = [ ...converted ], hits = [];
    if (source.length !== target.length) throw new Error("方案用字無法按原文對齊。");
    const replace = (offset, width, value, rule, pos) => {
        const index = [ ...before.slice(0, offset) ].length, previous = target.slice(index, index + width).join("");
        if (previous === value) return;
        target.splice(index, width, ...value);
        hits.push({
            source: before.slice(offset, offset + source.slice(index, index + width).join("").length),
            target: value,
            previous: previous,
            offset: offset,
            rule: rule,
            pos: pos,
            version: version
        });
    };
    for (const token of tokens) {
        if (before.slice(token.start, token.end) !== token.text) continue;
        if (/^(?:计划|計劃|計畫)$/u.test(token.text) && [ "n", "v" ].includes(token.pos)) replace(token.start, 2, token.pos === "n" ? "計畫" : "計劃", "各方案：計畫名詞／計劃動詞", token.pos);
        if ([ "n", "v" ].includes(token.pos)) {
            let offset = token.start;
            for (const character of token.text) {
                if ("铲鏟剷".includes(character)) replace(offset, 1, token.pos === "v" ? "剷" : "鏟", "所選方案：鏟器具／剷動作", token.pos);
                offset += character.length;
            }
        }
    }
    for (const match of before.matchAll(/[咨諮](?:询|詢|文)/gu)) {
        const owner = tokens.find(token => token.start <= match.index && match.index + match[0].length <= token.end);
        if (owner && [ "nh", "nhf", "nhs", "ns", "nz" ].includes(owner.pos)) continue;
        replace(match.index, 2, match[0].endsWith("文") ? "咨文" : "諮詢", "各方案：諮詢／咨文", owner?.pos);
    }
    if (profile === "modern") {
        for (const decision of require("./tai-policy").decisions(before, tokens)) replace(decision.offset, 1, decision.target, decision.reason, decision.pos);
        for (const decision of require("./zhan-policy").decisions(before, tokens)) replace(decision.offset, 1, decision.target, decision.reason, decision.pos);
        for (const decision of require("./fu-liao-preferences").decisions(before, nativeTokens)) {
            const previous = target[[ ...before.slice(0, decision.offset) ].length];
            replace(decision.offset, 1, decision.target, decision.reason, decision.pos);
            if (previous !== decision.target) Object.assign(hits.at(-1), {
                decisionRule: decision.rule,
                evidence: decision.evidence,
                classification: decision.kind === "word-form-preference" ? "字形偏好" : "自動規則修正"
            });
        }
    }
    for (const decision of require("./zhi-policy").decisions(before, nativeTokens)) {
        const previous = target[[ ...before.slice(0, decision.offset) ].length];
        replace(decision.offset, 1, decision.target, decision.reason, decision.pos);
        if (previous !== decision.target) Object.assign(hits.at(-1), {
            decisionRule: decision.rule,
            decisionBasis: decision.decisionBasis,
            evidence: decision.evidence
        });
    }
    for (const decision of require("./dou-policy").decisions(before, nativeTokens)) {
        const previous = target[[ ...before.slice(0, decision.offset) ].length];
        replace(decision.offset, 1, decision.target, decision.reason, decision.pos);
        if (previous !== decision.target) Object.assign(hits.at(-1), {
            decisionRule: decision.rule,
            decisionBasis: decision.decisionBasis,
            evidence: decision.evidence
        });
    }
    if (profile === "modern") {
        let offset = 0;
        for (let i = 0; i < source.length; i++) {
            const preferred = modernGlyphs[target[i]];
            if (preferred) replace(offset, 1, preferred, "默認標準：綫、衞、裡；統一用考");
            offset += source[i].length;
        }
    }
    return {
        text: target.join(""),
        hits: hits
    };
}

module.exports = {
    apply: apply,
    version: version,
    normalizeModernGlyphs: normalizeModernGlyphs
};

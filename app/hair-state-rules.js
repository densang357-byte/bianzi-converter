"use strict";

const version = "hair-state-20261018-v1";

function findings(text, tokens = []) {
    const out = [];
    for (const m of text.matchAll(/[发發髮](?:黑|白|烏|乌|皓|蒼|苍)(?:而|且|[、，,])?[齿齒](?:健|固|堅|坚|白|落|疏|搖|摇)/gu)) {
        const at = m.index, owner = tokens.find(t => t.start <= at && at < t.end), left = text.slice(Math.max(0, at - 12), at);
        const incompatible = /(?:臉色|脸色|面色|皮膚|皮肤|眼前|天空|藥片|药片|金屬|金属|石頭|石头|牙[齿齒])(?:已|都|正|開始|开始|漸漸|渐渐)?$/u.test(left);
        out.push({
            start: at,
            end: at + 1,
            source: text[at],
            target: "髮",
            pos: owner?.pos,
            kind: "semantic",
            rule: version,
            matchedConstruction: m[0],
            apply: !incompatible,
            reason: incompatible ? "發黑之前有明確的非頭髮主語，並列讀法有衝突，另列待核而不改字。" : "髮的色澤與齒的狀態形成並列主謂結構：髮／黑、齒／健等；不採變黑動詞義。",
            suggestedAnalysis: {
                components: [ {
                    text: text[at],
                    sense: "頭髮名詞"
                }, {
                    text: m[0][1],
                    sense: "色澤謂語"
                }, {
                    text: m[0].match(/[齿齒]/u)[0],
                    sense: "牙齒名詞"
                }, {
                    text: m[0].at(-1),
                    sense: "狀態謂語"
                } ],
                notNativePrediction: true,
                notHumanGold: true
            }
        });
    }
    return out;
}

const matches = (text, tokens) => findings(text, tokens).filter(x => x.apply);

function risks(text, tokens) {
    return findings(text, tokens).map(x => ({
        source: x.matchedConstruction,
        offset: x.start,
        pos: x.pos,
        candidates: [ "髮", "發" ],
        rule: version,
        riskKind: "髮發詞義／詞界待核",
        reviewOnly: true,
        status: "unreviewed",
        reason: x.reason + " 原生分詞、詞性及句法未改；規則命中不當作已確認詞性錯誤。",
        suggestedAnalysis: x.suggestedAnalysis
    }));
}

module.exports = {
    version: version,
    findings: findings,
    matches: matches,
    risks: risks
};

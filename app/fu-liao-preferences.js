"use strict";

const version = "fu-liao-20261019-v5";

const proper = new Set([ "nh", "nhf", "nhs", "ni", "ns", "nz" ]);

const controls = /(?:控|禁|管|壓|压|抑|限|節|节|規|规)制$/u;

const talisman = "(?:(?:乾天)?(?:鎖妖|锁妖)?[靈灵神仙玉道法金雷火]?符)(?![號号合])(?:[籙箓篆咒])?";

const number = "[零〇一二兩两三四五六七八九十百千萬万數数幾几0-9０-９]+";

const quantity = "(?:" + number + "(?:[多餘余])?[張张道枚]|一手)";

const resultPrefix = "(?:[了得成出好過过]{0,2})(?:的)?(?:些|" + quantity + ")?(?:[好新假]|無上|无上|(?:[上中下]" + number + "?品|[上中下]品)的?)?";

const objectPattern = new RegExp("^" + resultPrefix + "(" + talisman + ")", "u");

function findings(text, tokens = []) {
    const out = [];
    for (const t of tokens) {
        if (text.slice(t.start, t.end) !== t.text || proper.has(t.pos)) continue;
        const m = /^(?:不|未)?(了解)(?:到|了|過|过|着|著|下)?$/u.exec(t.text);
        if (m) {
            const at = t.start + t.text.indexOf("了解"), nameContext = /(?:多[虧亏]|幸[虧亏]|拜[託托])$/u.test(text.slice(0, t.start)) && /^(?:先生|女士|公子)(?:[。！!?？,，]|$)/u.test(text.slice(t.end));
            out.push({
                offset: at,
                start: at,
                end: at + 1,
                source: "了",
                target: nameContext ? "了" : "瞭",
                pos: t.pos,
                kind: nameContext ? "source-retention" : "word-form-preference",
                rule: nameContext ? "liaojie-name-pending" : "liaojie-preferred-form",
                version: version,
                reason: nameContext ? "受惠／請託動詞後接了解先生等稱呼，疑似人名；模型 v 不當金標，暫保原字並列待核。" : "完整「了解」的理解義採使用者偏好「瞭解」；了解亦通，不列原文錯誤。",
                reviewRisk: nameContext,
                evidence: {
                    nativeToken: {
                        text: t.text,
                        pos: t.pos,
                        start: t.start,
                        end: t.end
                    },
                    lexeme: "了解",
                    classification: "字形偏好",
                    notNativePrediction: true
                },
                apply: true
            });
        }
    }
    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a.text !== "除了" || a.pos !== "p" || b.text !== "解" || b.pos !== "v" || a.end !== b.start) continue;
        const right = text.slice(b.end), object = /^(?:(?:各地|各方|各級|各级|當地|当地)的?)?(?:政務|政务|情況|情况|實情|实情|詳情|详情|事實|事实|真相)/u.exec(right);
        if (!object || !tokens.some(t => t.end === b.end + object[0].length) || !/(?:之外|以外|外[，,])/u.test(right)) continue;
        const at = a.end - 1;
        out.push({
            offset: at,
            start: at,
            end: at + 1,
            source: "了",
            target: "瞭",
            pos: a.pos,
            kind: "word-form-preference",
            rule: "except-understanding-boundary",
            version: version,
            apply: true,
            reason: "除……之外構式中，了解直接支配政務、情況等認知受事；將原生除了／解另析為除／了解，採瞭解偏好，原標註保留。",
            evidence: {
                nativeTokens: [ a, b ],
                nodes: [ {
                    id: "understanding",
                    start: at,
                    end: b.end
                }, {
                    id: "information-object",
                    text: object[0],
                    start: b.end,
                    end: b.end + object[0].length
                } ],
                relation: "local-cognitive-object-with-except-construction",
                notNativePrediction: true,
                notHumanGold: true
            }
        });
    }
    for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i], previous = tokens[i - 1];
        if (t.text === "了" && t.pos === "u" && previous.end === t.start && previous.pos === "v" && text.slice(t.end, t.end + 1) === "解") out.push({
            offset: t.start,
            start: t.start,
            end: t.end,
            source: "了",
            target: "了",
            pos: t.pos,
            kind: "source-retention",
            rule: "aspect-le-before-jie",
            version: version,
            apply: true,
            reason: "前接動詞、原生分詞為體標記了／解……；不得把跨詞界的了解字串套成瞭解。",
            evidence: {
                nativeTokens: [ previous, t ],
                notNativePrediction: true
            }
        });
    }
    for (const m of text.matchAll(/制/gu)) {
        const at = m.index, owner = tokens.find(t => t.start <= at && at < t.end), left = text.slice(Math.max(0, at - 3), at + 1), right = text.slice(at + 1);
        if (controls.test(left) || !owner) continue;
        const object = objectPattern.exec(right);
        if (!object) continue;
        const objectStart = at + 1 + object[0].length - object[1].length, objectEnd = at + 1 + object[0].length;
        const prefix = text.slice(owner.start, at);
        if (prefix && !/^[畫画繪绘煉炼親亲所]$/u.test(prefix)) continue;
        const objectOwner = tokens.find(t => t.start <= objectStart && objectStart < t.end);
        const incompatible = proper.has(owner.pos) || proper.has(objectOwner?.pos);
        const joined = owner.end > at + 1;
        const morphology = joined && /^(?:[畫画繪绘煉炼])?制(?:[靈灵神仙玉道法金雷火]?符)(?:[籙箓篆咒])?(?:術|术|法|師|师|手法|材料|原料|之法)?$/u.test(owner.text);
        const standalone = !joined || /^(?:[畫画繪绘煉炼親亲所])?制[得成出好了過过]{1,2}$/u.test(owner.text);
        const apply = !incompatible && (standalone || morphology);
        out.push({
            offset: at,
            start: at,
            end: at + 1,
            source: "制",
            target: "製",
            pos: owner.pos,
            kind: "semantic",
            rule: "talisman-making",
            version: version,
            apply: apply,
            reason: apply ? "製作動作直接支配符／符籙等製成物，或作製符術等名物的內部構式；採製。" : "符的製作構式涉及專名標註或未確認詞界，保留原字並列待核。",
            evidence: {
                nodes: [ {
                    id: "making-action",
                    text: owner.text,
                    start: at,
                    end: at + 1,
                    nativePos: owner.pos
                }, {
                    id: "talisman-object",
                    text: object[1],
                    start: objectStart,
                    end: objectEnd,
                    nativePos: objectOwner?.pos
                } ],
                relation: joined ? "bounded-morphology" : "local-direct-object-construction",
                nativeTokens: tokens.filter(t => t.start < objectEnd && t.end > owner.start).map(t => ({
                    text: t.text,
                    pos: t.pos,
                    start: t.start,
                    end: t.end,
                    parent: t.parent,
                    relation: t.relation
                })),
                notNativePrediction: true,
                notHumanGold: true
            }
        });
    }
    return out;
}

const decisions = (text, tokens) => findings(text, tokens).filter(x => x.apply);

function risks(text, tokens) {
    return findings(text, tokens).filter(x => !x.apply || x.reviewRisk).map(x => ({
        source: x.rule === "liaojie-name-pending" ? "了解" : text.slice(x.start, x.evidence.nodes.at(-1).end),
        offset: x.offset,
        pos: x.pos,
        candidates: x.rule === "liaojie-name-pending" ? [ "了", "瞭" ] : [ "製", "制" ],
        rule: x.rule,
        version: version,
        reviewOnly: true,
        status: "unreviewed",
        riskKind: x.rule === "liaojie-name-pending" ? "了解專名疑點" : "製符構式詞界／專名待核",
        reason: x.reason,
        evidence: x.evidence
    }));
}

module.exports = {
    version: version,
    findings: findings,
    decisions: decisions,
    risks: risks
};

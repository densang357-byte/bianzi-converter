"use strict";

const data = require("./data/dou-policy.json"), proper = new Set([ "nh", "nhf", "nhs", "ni", "ns", "nz" ]);

const version = data.version;

function analyze(text, tokens = []) {
    const out = [], bounds = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    const owner = at => tokens.find(t => t.start <= at && at < t.end);
    const inside = (a, b) => tokens.filter(t => t.start < b && t.end > a);
    for (const m of text.matchAll(/斗/gu)) {
        const at = m.index, t = owner(at);
        if (!t || text.slice(t.start, t.end) !== t.text) continue;
        const quoted = [ ...text.matchAll(/[「『“]([^」』”]+)[」』”]/gu) ].find(q => q.index < at && at < q.index + q[0].length && /^(?:(?:和|與|与|及|、|都是|是|爲|为|都)|[「『“][^」』”]+[」』”]|\s)*(?:人名|姓名|名字|地名|術語|术语)/u.test(text.slice(q.index + q[0].length)));
        const heads = [];
        for (const word of data.retainedNominalHeads) for (let start = text.indexOf(word); start >= 0; start = text.indexOf(word, start + word.length)) if (start <= at && at < start + word.length) heads.push({
            word: word,
            start: start,
            end: start + word.length
        });
        const left = text.slice(Math.max(0, at - 16), at), right = text.slice(at + 1);
        const numeral = /[一二兩两三四五六七八九十百千幾几數数0-9０-９]$/u.test(left) && /^(?:[的之]?[米麥麦粟糧粮穀谷水酒油鹽盐]|半(?:[米水酒]|$))/u.test(right);
        const measureCompare = /(?:升|斛|量器|木斗|容積|容积|容量)(?:[^，。！？；：]{0,3})比$/u.test(left) || /比$/u.test(left) && /^(?:的)?(?:容積|容积|容量|刻度|盛量)/u.test(right);
        const technical = /^[參参]/u.test(right) && /行[氣气]術語|行气术语/u.test(text);
        let target, basis, reason, evidence;
        if (quoted) {
            target = "斗";
            basis = "source-name-form";
            reason = "本句以引文直接標明人名、地名或術語，照原字保留，不將合成人名或模型標籤加入全域人名詞庫。";
            evidence = {
                quotation: quoted[0]
            };
        } else if (proper.has(t.pos)) {
            target = "斗";
            basis = "proper-pending";
            reason = "原生實體類標籤不是金標；未核定的專名字位暫保原字並列待核，不自造全域角色名錄。";
            evidence = {
                nativeToken: t
            };
        } else if (heads.length || numeral || measureCompare || technical) {
            target = "斗";
            basis = "retained-meaning";
            reason = "此字屬明確器物、容量、星名或術語；保留斗，實際動詞標籤不當作詞義金標。";
            evidence = {
                heads: heads,
                numeral: numeral,
                measureCompare: measureCompare,
                technical: technical
            };
        } else {
            let combat = null;
            for (const word of data.combatLexemes) for (let start = text.indexOf(word); start >= 0; start = text.indexOf(word, start + word.length)) {
                const end = start + word.length, ts = inside(start, end);
                if (!(start <= at && at < end) || !bounds.has(start) || !bounds.has(end) || !ts.length) continue;
                const eventFrame = word === "比斗" && ts.length === 2 && ts[0].text === "比" && ts[0].pos === "p" && ts[1].text === "斗" && ts[1].pos === "n" && (/(?:此次|本次|今次|今回|這次|这次|本回|此回|真正|正式|門內|门内|玄門|玄门|三派|諸派|诸派|要|欲|將|将)$/u.test(text.slice(Math.max(0, start - 10), start)) || /^(?:這等事|这等事|來臨|来临|較技|较技|切磋|蝕文|蚀文|推解)/u.test(text.slice(end)));
                if (ts.some(x => proper.has(x.pos)) || !eventFrame && ts.some(x => ![ "n", "v" ].includes(x.pos))) continue;
                combat = {
                    word: word,
                    start: start,
                    end: end,
                    tokens: ts
                };
            }
            if (combat) {
                target = "鬥";
                basis = "combat-lexeme";
                reason = "完整競較／相爭詞的事件義用鬥；比／斗等動詞加事件名詞的原切分照存，不把 n 一概當容量。";
                evidence = {
                    lexeme: combat.word,
                    start: combat.start,
                    end: combat.end,
                    nativeTokens: combat.tokens
                };
            } else if (t.pos === "n" && t.text.length > 1 && require("./profiles").getDictionaries("modern").phrases.get(t.text)?.every(s => s[at - t.start] === "鬥")) {
                target = "鬥";
                basis = "complete-word-sense";
                reason = "完整實際名詞在有效詞表已有一致的鬥義，優先於未決普通名詞的斗兜底。";
                evidence = {
                    lexeme: t.text
                };
            } else if (t.pos === "v") {
                target = data.verbDefault;
                basis = "verb-default";
                reason = "使用者指定：實際動詞的斗未有更強詞義分支時默認鬥；兜底仍列待核，不算已判明相爭義。";
                evidence = {
                    nativeToken: t
                };
            } else if (text.slice(Math.max(0, at - 1), at + 1) === "比斗") {
                out.push({
                    offset: at,
                    start: at,
                    end: at + 1,
                    source: "斗",
                    target: text[at],
                    pos: t.pos,
                    decisionBasis: "pending-combat-boundary",
                    rule: "dou-boundary-pending",
                    reason: "比斗字串涉及介詞比較、專名或未確認詞界，保留原字並按完整語境核對。",
                    evidence: {
                        nativeTokens: inside(at - 1, at + 1),
                        notNativePrediction: true,
                        notHumanGold: true
                    },
                    apply: false,
                    version: version
                });
                continue;
            } else if (t.pos === "n") {
                target = data.nominalFallback;
                basis = "noun-default";
                reason = "實際普通名詞 n 內尚未判明的斗保留來源斗，另列風險；不據此斷言爲容量義，亦不併入其他名詞子類。";
                evidence = {
                    nativeToken: t
                };
            } else continue;
        }
        out.push({
            offset: at,
            start: at,
            end: at + 1,
            source: "斗",
            target: target,
            pos: t.pos,
            decisionBasis: basis,
            rule: basis === "verb-default" ? "dou-verb-default" : "dou-semantic-branch",
            reason: reason,
            evidence: {
                ...evidence,
                notNativePrediction: true,
                notHumanGold: true
            },
            apply: true,
            version: version
        });
    }
    return out;
}

const decisions = (text, tokens) => analyze(text, tokens).filter(d => d.apply);

function risks(text, tokens) {
    return analyze(text, tokens).filter(d => [ "verb-default", "noun-default", "proper-pending" ].includes(d.decisionBasis) || !d.apply).map(d => ({
        source: text.slice(Math.max(0, d.offset - 1), d.offset + 2),
        offset: d.offset,
        pos: d.pos,
        candidates: [ "鬥", "斗" ],
        fallback: d.target,
        rule: d.rule,
        version: version,
        reviewOnly: true,
        status: "unreviewed",
        riskKind: d.decisionBasis === "proper-pending" ? "斗字專名待核" : d.apply ? "斗鬥詞義未決" : "比斗詞義／詞界待核",
        reason: d.reason,
        evidence: d.evidence
    }));
}

module.exports = {
    version: version,
    analyze: analyze,
    decisions: decisions,
    risks: risks
};

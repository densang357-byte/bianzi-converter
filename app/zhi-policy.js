"use strict";

const version = "zhi-verb-default-20261019-v2";

const policy = require("./data/lexicon-direction-policy.json").characters["制"];

const controlVerb = /^(?:制(?:[訂订定止裁衡約约伏服御馭驭壓压導导動动霸度式禮礼藝艺誥诰詔诏敕]|住))(?:了|着|著|過|过|得|住|下|來|来|去)*$/u;

const enemy = /^(?:[強强勁劲頑顽仇宿]?敵(?:人|軍|军)?|[強强勁劲頑顽仇宿]?敌(?:人|軍|军)?|對手|对手|歹徒|叛軍|叛军|賊人|贼人)$/u;

const humanSubject = /^(?:他|她|他們|他们|她們|她们|眾人|众人|衆人|將軍|将军|[強强勁劲頑顽仇宿]?敵(?:人|軍|军)?|[強强勁劲頑顽仇宿]?敌(?:人|軍|军)?|對手|对手|歹徒|叛軍|叛军)$/u;

const evidenceTokens = ts => ts.map(t => ({
    text: t.text,
    pos: t.pos,
    start: t.start,
    end: t.end,
    parent: t.parent,
    relation: t.relation
}));

function decisions(text, tokens = []) {
    const out = [], making = require("./fu-liao-preferences").findings(text, tokens).filter(x => x.rule === "talisman-making" && x.apply);
    const boundaries = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.pos !== "v" || text.slice(token.start, token.end) !== token.text) continue;
        const internal = token.text.indexOf("制");
        if (internal < 0) continue;
        const prefix = token.text.slice(0, internal);
        if (prefix && !/^[親亲畫画繪绘煉炼]$/u.test(prefix)) continue;
        const at = token.start + internal, right = text.slice(at + 1), local = [ token ];
        let target = policy.default_by_pos.v, basis = "verb-default", reason = "使用者指定：實際動詞的制／製未有更強分義時，默認製；這是兜底，不當作已判明製作義。";
        const setControl = (why, ts = [ token ]) => {
            target = "制";
            basis = "control-sense";
            reason = why;
            local.push(...ts);
        };
        if (controlVerb.test(token.text.slice(internal))) setControl("完整制訂、制止、制伏、制服、制約等控制／規定義動詞保留制。");
        const previous = tokens[i - 1];
        if (token.text === "制" && previous?.end === token.start && /^[控禁管壓压抑限節节規规]$/u.test(previous.text)) setControl("模型將控制、禁制等拆爲兩個單字；按完整控制義構式保留制，排除嚴禁／制等跨詞界尾字。", [ previous ]);
        const complement = /^(?:得)?(?:服服帖帖|服帖|服貼|服贴|住(?:了)?)/u.exec(right);
        if (complement && (boundaries.has(at + 1 + complement[0].length) || token.end === at + 1 + complement[0].length)) setControl("制住、制得服服帖帖等控制結果補語保留制。", tokens.filter(t => t.start < at + 1 + complement[0].length && t.end > at));
        const object = /^(?:了|住|得)?([強强勁劲頑顽仇宿]?[敵敌](?:人|軍|军)?|對手|对手|歹徒|叛[軍军]|[賊贼]人)/u.exec(right);
        if (object) {
            const end = at + 1 + object[0].length, start = end - object[1].length, obj = tokens.find(t => t.start === start && t.end === end);
            const direct = obj?.parent === (token.id ?? i) && [ "VOB", "FOB", "IOB", "dobj", "obj", "iobj" ].includes(obj.relation);
            const possessive = right.slice(object[0].length).startsWith("的");
            if (enemy.test(object[1]) && boundaries.has(end) && (!possessive || direct)) setControl("制直接支配敵人、強敵等受事，採制伏義；原生詞性及依存即使有疑點亦照存。", tokens.filter(t => t.start < end && t.end > at));
        }
        if (!/^(?:成|出)/u.test(right)) {
            const before = tokens.slice(0, i), lastPunct = before.findLastIndex(t => /^[，,。！？!?；;：:]$/u.test(t.text));
            const clause = before.slice(lastPunct + 1), marker = clause.findIndex(t => [ "被", "為", "为" ].includes(t.text));
            const patient = clause.slice(0, marker).filter(t => humanSubject.test(t.text)).at(-1), agent = clause.slice(marker + 1);
            if (marker > 0 && patient && agent.at(-1)?.text === "所" && agent.length >= 2 && agent.length <= 5 && agent.slice(0, -1).every(t => [ "r", "n", "nh", "nhf", "nhs" ].includes(t.pos))) setControl("局部被／爲……所制構式的受事是敵軍、人物等，採受制義；器物爲工匠所製等不套用此分支。", clause);
        }
        const manufacture = making.find(m => m.offset === at);
        if (target !== "制" && manufacture) {
            basis = "making-object-construction";
            reason = manufacture.reason;
        }
        out.push({
            offset: at,
            start: at,
            end: at + 1,
            source: "制",
            target: target,
            pos: token.pos,
            rule: basis === "verb-default" ? "zhi-verb-default" : "zhi-semantic-branch",
            version: version,
            decisionBasis: basis,
            reason: reason,
            evidence: {
                nativeTokens: evidenceTokens([ ...new Set(local) ]),
                notNativePrediction: true,
                notHumanGold: true
            }
        });
    }
    return out;
}

function risks(text, tokens) {
    return decisions(text, tokens).filter(d => d.decisionBasis === "verb-default").map(d => ({
        source: text.slice(d.offset, tokens.find(t => t.start <= d.offset && d.offset < t.end)?.end || d.end),
        offset: d.offset,
        pos: d.pos,
        candidates: [ "製", "制" ],
        fallback: "製",
        rule: "zhi-verb-default",
        version: version,
        reviewOnly: true,
        status: "unreviewed",
        riskKind: "制製動詞詞義未決",
        reason: d.reason,
        evidence: d.evidence
    }));
}

module.exports = {
    version: version,
    decisions: decisions,
    risks: risks
};

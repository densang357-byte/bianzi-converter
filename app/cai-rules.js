"use strict";

function choose(before, token, rule, fallback) {
    const word = token.text, targets = rule.targets || [];
    const noun = targets.find(t => t.includes("才") && !t.includes("纔"));
    const adverb = targets.find(t => t.includes("纔"));
    if (!noun || !adverb) return fallback;
    if ([ "n", "nh", "ni", "ns", "nz" ].includes(token.pos)) return noun;
    const left = before.slice(0, token.start), right = before.slice(token.end);
    if (word === "不才" && (/(?:在下|小可|小的|貧道|贫道|貧僧|贫僧|老朽|小生|末將|末将|弟子|區區|区区|敝人|某|某人|雖然|虽然|雖|虽)$/u.test(left) || /^(?:[，,。]|願|愿|忝|技不)/u.test(right))) return noun;
    const possessive = /(?:自己|本身|[他她我你它您](?:們|们)?)的$/u.test(left);
    const conditional = word === "才能" && /(?:只有|唯有|惟有|必須|必须|等到|直到|之後|之后|以後|以后|這樣|这样|如此)[^。！？；，]{0,30}$/u.test(left) && !/^[，。！？；、」』]/u.test(right);
    const nounPredicate = /^(?:過人|过人|橫溢|横溢|敏捷|枯竭|超群|出衆|出众|卓越|有限|不足|遠遜|远逊|之士|的人|方面|上卻|上却)/u.test(right);
    if (possessive) return noun;
    if (conditional) return adverb;
    if (nounPredicate && (word !== "才能" || /^(?:遠遜|远逊|有限(?:[，。,；！？]|$)|不足(?:[，。,；！？]|$)|之士|的人|方面|上卻|上却)/u.test(right))) return noun;
    if ([ "d", "c", "nt" ].includes(token.pos)) return adverb;
    if (token.pos === "v" && /^才/u.test(word)) return adverb;
    return fallback;
}

function nominalMatches(before) {
    const matches = [], seen = new Set;
    const idioms = /[惊驚][才纔][绝絕][艳艷豔]|人[尽盡]其[才纔]|唯[才纔]是[举舉用]|江郎[才纔][尽盡]|[才纔]高八斗|[怀懷][才纔]不遇|恃[才纔]傲物|[才纔]疏[学學][浅淺]|[才纔][华華][横橫]溢|德[才纔]兼[备備]|多[才纔]多[艺藝能]|[聪聰]明[才纔]智|雄[才纔]大略|[才纔]貌[双雙]全|[才纔]子佳人|郎[才纔]女貌|野[无無][遗遺][才纔]|[才纔]兼文武|[才纔]堪大用|[才纔]薄德[浅淺]|[才纔]大遭忌|[才纔]高遭忌|[才纔]因老[尽盡]|[才纔][为爲]第一[，,]德|[才纔]思(?:如此)?(?:敏捷|枯竭|泉[涌湧])/gu;
    const frames = /(?:自己|本身|[他她我你它您](?:們|们)?)的([才纔](?:能|[学學]|[识識]|思|悟|用|[干幹]|分|略|望|守|料|[会會]|[语語]))/gu;
    for (const pattern of [ idioms, frames ]) for (const m of before.matchAll(pattern)) {
        const start = m.index + (pattern === frames ? m[0].length - m[1].length : 0), text = pattern === frames ? m[1] : m[0];
        for (let i = 0; i < text.length; i++) if (/[才纔]/u.test(text[i]) && !seen.has(start + i)) {
            seen.add(start + i);
            matches.push({
                source: text[i],
                target: "才",
                offset: start + i,
                posPriority: true,
                directionalRule: true,
                reason: "固定成語、名詞性述語或領屬關係中的才表示才性；不以模型的副詞標註覆蓋局部名詞語義。"
            });
        }
    }
    return matches;
}

function compositionalMatches(before, tokens) {
    const matches = [];
    for (const t of tokens) {
        if (before.slice(t.start, t.end) !== t.text || t.text.length < 2 || !t.text.startsWith("才")) continue;
        if (![ "d", "c", "v" ].includes(t.pos)) continue;
        const argument = tokens.some(child => child.parent === (t.id ?? tokens.indexOf(t)) && [ "VOB", "IOB", "FOB" ].includes(child.relation));
        if (t.pos === "v" && t.relation && ![ "HED", "ADV", "COO", "CMP" ].includes(t.relation) && !argument) continue;
        matches.push({
            source: "才",
            target: "纔",
            offset: t.start,
            pos: t.pos,
            directionalRule: true,
            posPriority: true,
            decisionBasis: "model-pos-compositional-prefix",
            originalToken: t.text,
            dependencyRelation: t.relation,
            reason: "原模型將才加動作分析爲副詞／連詞／動詞單位；只在構詞層將副詞前綴才寫作纔，不收整詞組合候選，不改原標註。"
        });
    }
    return matches;
}

module.exports = {
    choose: choose,
    nominalMatches: nominalMatches,
    compositionalMatches: compositionalMatches
};

"use strict";

const relevant = t => /^(?:仆|干|几)$/u.test(t.text) || t.pos === "n" && t.text.length > 1 && t.text.endsWith("几");

const liquid = /(?:酒|水|油|汤|湯|汁|露|奶|乳|泪|淚|汗|血)$/u;

const physicalAttribute = /^(?:木质|木質|材质|材質|质地|質地|式样|式樣|形状|形狀|颜色|顏色|色泽|色澤|表面)$/u;

function matches(text, tokens) {
    if (!tokens.some(relevant)) return [];
    const out = [], kids = tokens.map(() => []);
    tokens.forEach((t, i) => {
        if (Number.isInteger(t.parent) && t.parent >= 0 && t.parent < tokens.length && t.parent !== i) kids[t.parent].push(t);
    });
    const add = (t, offset, target, rule, reason) => out.push({
        start: t.start + offset,
        end: t.start + offset + 1,
        source: text[t.start + offset],
        target: target,
        pos: t.pos,
        kind: "shared-argument-sense",
        rule: rule,
        reason: reason
    });
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i], head = tokens[t.parent], prev = tokens[i - 1];
        if (!relevant(t) || text.slice(t.start, t.end) !== t.text) continue;
        if (t.text === "仆" && [ "v", "n" ].includes(t.pos) && t.relation === "ADV" && head?.pos === "v" && /^(?:跌|跌倒|摔|摔倒|倒|倒下)$/u.test(head.text) && !/^(?:的|之|老|家|奴|主)$/u.test(prev?.text || "") && ![ "m", "q", "mq" ].includes(prev?.pos)) {
            const hi = t.parent, ground = kids[hi].some(k => [ "CMP", "VOB" ].includes(k.relation) && /^(?:地|地上|地下)$/u.test(k.text) || k.relation === "CMP" && k.pos === "p" && k.text === "在" && kids[tokens.indexOf(k)].some(p => p.relation === "POB" && /^(?:地|地上|地下)$/u.test(p.text)));
            if (ground) add(t, 0, "仆", "fall-posture-adverbial", "仆以狀語關係修飾跌摔倒下，謂語另帶地面處所；僕人作主語、帶家老等人物修飾或數量時不套用。");
        }
        if (t.text === "干" && [ "v", "a", "n" ].includes(t.pos) && t.relation === "CMP" && head?.pos === "v" && kids[t.parent].some(k => k.relation === "VOB" && k.pos === "n" && liquid.test(k.text))) add(t, 0, "乾", "liquid-result-complement", "干是動詞的結果補語，該動詞直接支配酒水油汁等液體名詞，取乾空或乾燥義；幹事的主謂／動賓結構不套用。");
        if (t.text === "几" && [ "m", "r", "n" ].includes(t.pos) && [ "VOB", "POB" ].includes(t.relation) && head?.pos === "v" && head.text === "隔" && head.relation === "ADV" && tokens[head.parent]?.pos === "v" && /^(?:坐|坐下|坐定|坐着|坐著|站|站立|立)$/u.test(tokens[head.parent].text) && !kids[i].some(k => [ "q", "m", "mq" ].includes(k.pos)) && !/[，,。！？!?；;\n]/u.test(text.slice(t.end, tokens[head.parent].start))) add(t, 0, "几", "furniture-separating-postures", "几是隔的獨立賓語，隔整體修飾坐立姿態；隔幾天／幾米等數量結構的中心語是量詞，不符合此依存關係。");
        if (t.pos === "n" && t.text.length > 1 && t.text.endsWith("几") && !t.text.startsWith("第") && t.relation === "ATT" && head?.pos === "n" && physicalAttribute.test(head.text)) add(t, t.text.length - 1, "几", "furniture-physical-attribute", "整詞為名詞並直接修飾木質材質形狀等實體屬性，末幾是家具名詞中心語；不將數詞或序數詞一律改字。");
    }
    return out;
}

module.exports = {
    matches: matches
};

"use strict";

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const NUMBER = "[零〇一二两兩三四五六七八九十百千万萬亿億数數几幾半0-9０-９]+(?:[多来來余餘])?";

const vessel = new RegExp("^" + NUMBER + "[大小]?坛(?:[许許半])?$", "u");

const combatDuration = new RegExp("^(?:了|到|至)?" + NUMBER + "(?:个|個)?(?:回合|招|合|时辰|時辰|小时|小時)", "u");

const punctuation = /[，,。！？!?；;：:\n]/u;

function matches(text, tokens) {
    if (!tokens.some(t => /^(?:松|发|舍下|仆|斗|里|海里|余|须|坛)$/u.test(t.text) || vessel.test(t.text))) return [];
    const result = [], children = tokens.map(() => []);
    tokens.forEach((t, i) => {
        if (Number.isInteger(t.parent) && t.parent >= 0 && t.parent < tokens.length && t.parent !== i) children[t.parent].push(t);
    });
    const add = (t, offset, target, rule, reason) => result.push({
        start: t.start + offset,
        end: t.start + offset + 1,
        source: text[t.start + offset],
        target: target,
        pos: t.pos,
        kind: "hanlp-syntax-sense",
        rule: rule,
        reason: reason
    });
    const isPredicate = t => [ "HED", "COO", "CMP", "VOB" ].includes(t.relation);
    const quantifiedDrinks = new Set;
    tokens.forEach((t, i) => {
        if (!vessel.test(t.text) || proper.has(t.pos) && t.pos !== "ns") return;
        const next = tokens[i + 1], head = tokens[t.parent];
        const content = next && next.start === t.end && /^(?:酒|酒水|醋|清水|陈酿|陳釀|佳酿|佳釀)$/u.test(next.text) && t.parent === i + 1 && t.relation === "ATT";
        const drinking = head && /^(?:喝|饮|飲|醉)/u.test(head.text) && [ "SBV", "VOB", "FOB", "ADV" ].includes(t.relation);
        if (content || drinking) quantifiedDrinks.add(i);
    });
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i], prev = tokens[i - 1], next = tokens[i + 1], kids = children[i], head = tokens[t.parent];
        if (text.slice(t.start, t.end) !== t.text) continue;
        if (vessel.test(t.text) && (!proper.has(t.pos) || t.pos === "ns")) {
            const repeat = head && /^(?:来|來|要|添|加|拿)$/u.test(head.text) && t.relation === "VOB" && children[t.parent].some(c => c.relation === "ADV" && /^(?:再|又|还|還)$/u.test(c.text)) && [ ...quantifiedDrinks ].some(j => j < i && !/[。！？!?；;\n]/u.test(text.slice(tokens[j].end, t.start)));
            if (quantifiedDrinks.has(i) || repeat) add(t, t.text.indexOf("坛"), "罈", "quantity-vessel-dependency", "完整數量形式與飲用謂語／內容物直接相連，或同句承接已確定酒罈的再次索取；不以附近出現酒字改地名。");
        }
        if (t.text === "余" && prev && prev.end === t.start && [ "q", "m", "mq", "nt" ].includes(prev.pos) && (t.relation === "RAD" && t.parent === i - 1 || t.relation === "ATT" && prev.parent === i && prev.relation === "ATT" && [ "nd", "nl" ].includes(head?.pos))) add(t, 0, "餘", "measure-excess-suffix", "餘作數量／時間單位的後附成分，或整個數量短語修飾外等方位詞；姓氏主語與稱呼不套用。");
        if (proper.has(t.pos)) continue;
        if (!/^(?:松|发|舍下|仆|斗|里|海里|余|须|坛)$/u.test(t.text)) continue;
        const left = text.slice(0, t.start).split(punctuation).at(-1), right = text.slice(t.end).split(punctuation)[0];
        const subject = kids.some(c => c.relation === "SBV");
        const adverb = kids.some(c => c.relation === "ADV");
        if (t.text === "松" && [ "n", "a", "v" ].includes(t.pos) && isPredicate(t) && subject && adverb && kids.some(c => c.relation === "ADV" && /^(?:一|大|微|微微|稍|稍稍|渐|漸|渐渐|漸漸|忽|忽然|突然|陡|顿|頓|略|略微)$/u.test(c.text))) add(t, 0, "鬆", "subject-state-predicate", "主語加狀態變化副詞修飾鬆謂語；不依賴身體部位或情緒名詞清單。");
        if (t.text === "发" && t.pos === "n" && isPredicate(t) && subject && kids.some(c => c.pos === "a" && c.relation === "CMP")) add(t, 0, "發", "inchoative-adjective-complement", "發支配形容詞補語並有自己的主語，表示狀態發生；頭髮作形容詞主語的結構不套用。");
        if (t.text === "舍下" && [ "n", "v" ].includes(t.pos) && isPredicate(t) && (subject || adverb) && kids.some(c => c.relation === "VOB")) add(t, 0, "捨", "abandon-object-predicate", "舍下帶賓語且受主語或狀語支配，取捨棄動作；住所名詞作處所或主語時不套用。");
        const quantified = prev && [ "m", "mq", "q" ].includes(prev.pos) && !(prev.parent === i && prev.relation === "ADV") || /[零〇一二两兩三四五六七八九十百千万萬数數几幾0-9]$/u.test(left);
        if (t.text === "仆" && [ "n", "v" ].includes(t.pos) && isPredicate(t) && !quantified && !/(?:的|之|主|奴|家|老)$/u.test(left) && next?.text === "倒" && next.parent === i && next.relation === "CMP" && (subject || adverb)) add(t, 0, "仆", "fall-result-dependency", "仆為帶狀語或主語的謂語，倒作其結果補語；僕作倒的主語不套用。");
        if (t.text === "斗" && [ "n", "q", "v" ].includes(t.pos) && isPredicate(t) && !quantified && combatDuration.test(right) && kids.some(c => c.relation === "CMP" || c.relation === "POB")) add(t, 0, "鬥", "combat-duration-dependency", "斗帶到／至或時量回合補語，形成交鬥事件；前接數量的容量義排除。");
        if (t.text === "里" && t.pos === "q" && prev?.pos === "n" && prev.end === t.start && prev.parent === i && prev.relation === "ATT" && t.relation === "ADV" && head?.pos === "v" && !/^(?:乡|鄉|邻|鄰|故)$/u.test(prev.text)) add(t, 0, "裏", "nominal-locative-adverbial", "名詞修飾里，整體作動詞的處所狀語；數量詞和鄉里等詞彙義排除。");
        if (t.text === "海里" && t.pos === "q" && !quantified && t.relation === "VOB" && head?.pos === "v" && /(?:入|进|進)$/u.test(head.text)) add(t, 1, "裏", "destination-locative", "進入動詞直接帶海里作目的地，且前無數量；航行距離的海里不套用。");
        if (t.text === "仆" && [ "n", "v" ].includes(t.pos) && t.relation === "ADV" && head?.pos === "v" && next?.text === "地" && next.pos === "u" && next.parent === i && next.relation === "RAD" && !quantified && !/(?:的|之|主|奴|家|老)$/u.test(left)) add(t, 0, "仆", "fall-adverbial-dependency", "仆地以地後附形成修飾動作的狀語，非僕人作動作主語；保留原始詞性。");
        if (t.text === "须") {
            if ([ "n", "d", "v" ].includes(t.pos) && t.relation === "ADV" && [ "a", "v" ].includes(head?.pos) && kids.some(c => c.pos === "d" && c.relation === "ADV")) add(t, 0, "須", "necessity-adverbial", "須作形容詞／動詞的情態狀語，取必須義；鬍鬚作主語或實體賓語不套用。");
            if (t.pos === "d" && t.relation === "VOB" && head?.pos === "v" && head.end === t.start && !kids.some(c => c.pos !== "wp") && next?.pos === "v" && next.parent === t.parent && next.relation === "COO") add(t, 0, "鬚", "beard-direct-object", "須為相鄰動詞的無子項直接賓語，後接同一動詞的並列動作；排除仍支配數量、賓語或狀語的情態謂語。");
        }
        if (t.text === "坛" && [ "n", "q" ].includes(t.pos) && t.relation === "ADV" && head && /^(?:喝|饮|飲)(?:酒|茶|水)?(?:完|光|尽|盡|掉|下|足|醉|干|乾|了|著|着|过|過)*$/u.test(head.text) && kids.some(c => c.relation === "ATT" && ([ "m", "mq", "q" ].includes(c.pos) || [ "a", "v" ].includes(c.pos) && /^(?:整|全|半)$/u.test(c.text)))) add(t, 0, "罈", "consumption-measure-adverbial", "整／半或數量修飾罈，罈短語直接作飲用動作的數量狀語；介詞處所與喝彩排除。");
    }
    return result;
}

module.exports = {
    matches: matches
};

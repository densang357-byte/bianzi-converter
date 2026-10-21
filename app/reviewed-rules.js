"use strict";

function reviewedMatches(before, tokens, neighbors, policy) {
    const matches = [], boundaries = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    function put(offset, target, reason, evidence = {}) {
        const token = tokens.find(t => t.start <= offset && offset < t.end);
        matches.push({
            source: before[offset],
            target: target,
            offset: offset,
            pos: token?.pos || "",
            reason: reason,
            candidates: undefined,
            ...evidence
        });
    }
    function phrase(source, target, reason, options = {}) {
        for (let at = before.indexOf(source); at !== -1; at = before.indexOf(source, at + source.length)) {
            if (options.notAfter?.some(s => before.startsWith(s, at + source.length))) continue;
            if (options.boundary && !(boundaries.has(at) && boundaries.has(at + source.length))) continue;
            if (options.wholeToken && !tokens.some(t => t.start === at && t.end === at + source.length)) continue;
            [ ...source ].forEach((_, i) => put(at + i, [ ...target ][i], reason));
        }
    }
    if (!policy?.enabled) return matches;
    for (const row of policy.phrases) phrase(row.source, row.target, row.reason, row);
    for (const m of before.matchAll(/桃干(?=[、，,])/gu)) if (/桃根|桃枝|桃叶|桃葉|桃花|桃实|桃實/u.test(before)) put(m.index + 1, "幹", "與桃根、桃枝等並列的人名桃幹，取樹幹義。");
    for (const t of tokens) {
        if (t.text === "余") {
            const left = before.slice(0, t.start), right = before.slice(t.end);
            const quantity = /(?:[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億兆]+)(?:多)?$/u.test(left);
            if (quantity) put(t.start, "餘", "數量後的餘數義優先於誤標的人名詞性。"); else if (/姓$/u.test(left) || !/[其剩多數数若]$/u.test(left) && /^(?:观主|觀主|兄弟|师[兄弟伯叔]|師[兄弟伯叔]|矮子|老道|人彦|人彥)/u.test(right)) put(t.start, "余", "姓氏及姓氏稱謂保留余，非剩餘。"); else if (/^下(?:[众眾一二三四五六七八九十几幾數数]|六部)/u.test(right)) put(t.start, "餘", "餘下人眾或數量，非第一人稱余。");
        }
        if (t.text === "余兵" && /官兵|兵卒/u.test((neighbors.previousContext || "") + before) && /^跟/u.test(before.slice(t.end))) put(t.start, "餘", "官兵呼喊後餘兵跟著，指其餘兵卒，保留原nh但按明確語境分義。");
        if (t.text === "后" && t.pos === "n") {
            const left = before.slice(0, t.start), right = before.slice(t.end);
            if (/^臀|^厅|^廳/u.test(right) || /前[一二三四五六七八九十]+$/u.test(left)) put(t.start, "後", "後臀、後廳或前後位置，非帝后稱謂。");
        }
        if (t.pos === "o") for (let i = 0; i < t.text.length; i++) if (t.text[i] === "里") put(t.start + i, "里", "擬聲詞中的里不是內部方位。");
        if (t.text === "干") {
            const left = before.slice(Math.max(0, t.start - 20), t.start), right = before.slice(t.end);
            if (/(?:血|汗|泪|淚|墨|水|口|石灰)$/u.test(left) && /^(?:了|后|後|得|透|舌燥|[，。！？,!?；;]|$)/u.test(right) || /^了的血[渍漬]/u.test(right) || /^(?:了)?后字[迹跡]/u.test(right) && /写字|寫字|酸液/u.test(before)) put(t.start, "乾", "血、水、口、石灰或墨跡的明確乾燥義，非做事。");
            if (t.pos === "v" && /^(?:甚[么麼]|什[么麼]|[么麼]|事|活)/u.test(right)) put(t.start, "幹", "幹甚麼、幹麼、幹事、幹活的動作賓語，排除水乾等跨詞片段。");
        }
        if (t.text === "制" && t.pos === "v") {
            const left = before.slice(Math.max(0, t.start - 50), t.start), right = before.slice(t.end);
            if (/(?:[冰绸綢纸紙木铁鐵钢鋼铜銅蠟蜡皮絲丝絹绢布革]|磁铁|磁鐵|何物)(?:所)?$/u.test(left) || /所共$/u.test(left) && /令旗/u.test(before) || /^(?:炼|煉|冰|旗|炸[药藥]|丹[药藥])/u.test(right) || /敕$/u.test(left) && /^的金花玉版[笺箋]/u.test(right) || /新$/u.test(left) && /^的(?:清兵)?(?:服色|衣)/u.test(right) || /母毒既成/u.test(before) && /不必再$/u.test(left)) put(t.start, "製", "材料、藥物、衣物或器物的明確製作語境；不改控制、制度義。");
        }
        if (t.text === "蒙" || t.text.startsWith("蒙")) {
            if (/黑布/u.test(before) && /^蒙(?:住|上|着|著)?(?:了)?[^，。！？；]{0,5}(?:眼|脸|臉)/u.test(before.slice(t.start))) put(t.start, "蒙", "以黑布遮眼蒙臉，非欺矇或眼盲。");
        }
    }
    for (const m of before.matchAll(/[师師]太后(?=[到来來])/gu)) put(m.index + 2, "後", "師太後到的時間詞界，非太后稱謂；保留原標籤。");
    for (const m of before.matchAll(/[练練习習比](?:过|過)?武后/gu)) put(m.index + m[0].length - 1, "後", "練過武後的時間詞界，非武后稱謂。");
    for (const m of before.matchAll(/几上/gu)) put(m.index, "几", "几上放物、拍打，指几案上方。");
    for (const m of before.matchAll(/几面(?=[，,。！？!?])/gu)) if (/嵌入|拍|按|击|擊/u.test(before.slice(Math.max(0, m.index - 12), m.index))) put(m.index, "几", "物件嵌入或拍按的几面，是几案表面。");
    for (const m of before.matchAll(/(?:双|雙)斗(?=方人智)/gu)) put(m.index + 1, "鬥", "二人同鬥對手，非容量。");
    for (const m of before.matchAll(/每斗一刻|接斗数招|接斗數招/gu)) put(m.index + 1, "鬥", "按時間或招式計的交鬥，非容量。");
    for (const m of before.matchAll(/斗地(?=喜叫|惊叫|驚叫|叫)/gu)) put(m.index, "斗", "斗地是急遽義，非爭鬥。");
    for (const match of require("./collective-gan").matches(before, tokens)) put(match.start, "干", match.reason, {
        rule: match.rule,
        reference: match.reference,
        structure: match.structure
    });
    for (const match of require("./collective-gan").stemMatches(before, tokens)) put(match.start, "幹", match.reason, {
        rule: match.rule
    });
    for (const m of before.matchAll(/(?:这|這|那)干(?=(?:人|手下|教[众眾]|[男女]?弟子|恒山弟子|长辈|長輩|新[进進]|[饭飯][铺鋪]|[杂雜]物))/gu)) put(m.index + 1, "干", "限定人群、物品的泛稱這干、那干；不保護樹幹的一干挺擎。");
    for (const m of before.matchAll(/不干(?:[我你他她](?:们|們)?|大和尚)(?:的)?事/gu)) put(m.index + 1, "干", "不干某人的事，干表示關涉。");
    for (const m of before.matchAll(/只(?=眼前|心中|不怎么|不怎麼|多不少|手掌微)/gu)) put(m.index, "只", "眼前、心中、僅多不少等明確限制副詞，非物件量詞。");
    for (const m of before.matchAll(/(?:单|單|就|便|原|最多)只/gu)) put(m.index + m[0].length - 1, "只", "單只、就只、便只、原只、最多只的限制義。");
    for (const m of before.matchAll(/人发(?=[、，,和与與])/gu)) put(m.index + 1, "髮", "人髮與野蠶絲等材料並列，非發動。");
    for (const m of before.matchAll(/托(?:了)?(?:[盘盤碟碗壶壺瓶箱]|起来|起來)/gu)) put(m.index, "托", "手部承托或托起實物，不是委託。");
    for (const m of before.matchAll(/(?:神色|神情|心情|心中|心下|胸中)[^。！？；]{0,8}郁郁/gu)) for (let j = m.index + m[0].length - 2; j < m.index + m[0].length; j++) put(j, "鬱", "神色或心情鬱鬱，非馥郁或郁姓。");
    if (/没脸|沒臉|丢人|丟人/u.test(before)) for (const m of before.matchAll(/大丑(?=[，,。！？])/gu)) put(m.index + 1, "醜", "出了大醜而沒臉，指羞醜，非丑角。");
    if (/为祸天下|爲禍天下|為禍天下/u.test(before) && /再也不可复制/u.test(before)) phrase("复制", "復制", "再次制服的復制，非重複製造。");
    return matches;
}

module.exports = {
    reviewedMatches: reviewedMatches
};

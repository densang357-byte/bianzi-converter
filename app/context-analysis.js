"use strict";

function addContextAnalysis(text, raw, neighbors, add) {
    const at = p => raw.find(t => t.start <= p && t.end > p), left = p => text.slice(0, p), right = p => text.slice(p);
    for (const m of text.matchAll(/[翻飞飛狂席]卷/gu)) {
        const p = m.index + 1, t = at(p);
        if (t && t.pos === "n" && t.text === "卷") add(p, "卷", "捲", "v", "r20：翻／飛／狂／席＋捲是動態旋轉或裹挾，修正單字卷/n；卷冊和紙卷不改。");
    }
    for (const m of text.matchAll(/发/gu)) {
        const p = m.index, l = left(p), r = right(p + 1);
        if (/扬(?:头顶|頭頂)/u.test(r.slice(0, 5)) && r.startsWith("扬") || /(?:头摇|頭搖)$/u.test(l) && r.startsWith("扬")) add(p, "发", "髮", "n", "r20：頭部動作或頭頂方位限定頭髮作主語，拆開誤合的發揚/v，揚仍保留動詞。"); else if (/散$/u.test(l) && /^(?:披肩|飘拂|飄拂)/u.test(r)) add(p, "发", "髮", "n", "r20：散＋髮披肩／飄拂是頭髮實體；散發香氣與發揚精神不匹配。");
    }
    for (const m of text.matchAll(/若干(?=了[^。！？；]{0,12}事)/gu)) {
        const p = m.index + 1, t = at(p);
        if (t?.text === "若干") add(p, "干", "幹", "v", "r20：若＋幹了……事為假設後接完成動作，拆開數量詞若干；若干人和若干事情不改。");
    }
    for (const m of text.matchAll(/只/gu)) {
        const t = at(m.index);
        if (t?.text === "只" && t.pos === "nh" && /[惟唯]$/u.test(left(m.index)) && /^[^，。！？]{0,8}一人/u.test(right(m.index + 1))) add(m.index, "只", "只", "d", "r20：惟／唯＋只……一人是限制副詞，修正單字只誤標人名；真正動物量詞不改。");
    }
    for (const m of text.matchAll(/(?:有|意|興|兴)余(?=未[尽盡])/gu)) add(m.index + 1, "余", "餘", "n", "r20：有餘未盡及意／興餘未盡為剩餘義，修正第一人稱代詞標註。");
    for (const m of text.matchAll(/蒙(?=住(?:口鼻|[脸臉头頭眼面])|[头頭]人)/gu)) add(m.index, "蒙", "蒙", at(m.index)?.pos || "v", "r20：蒙的直接對象為口鼻、頭面等覆蓋實體，非矇騙義。", "semantic");
    for (const m of text.matchAll(/幪面|蒙面/gu)) add(m.index + 1, "面", "面", at(m.index + 1)?.pos || "n", "r20：幪／蒙面表示覆蓋面部，面是身體部位，不是麪食。", "semantic");
    for (const m of text.matchAll(/冷面(?=寡言|[无無]情)/gu)) add(m.index + 1, "面", "面", at(m.index + 1)?.pos || "n", "r20：寡言或無情形容冷面神態；冷麪菜餚不匹配。", "semantic");
    for (const m of text.matchAll(/[不非]干(?=(?:我|你|他|她|令[师師]兄)(?:的|之)?事)/gu)) add(m.index + 1, "干", "干", at(m.index + 1)?.pos || "v", "r20：不／非干某人的事表示牽涉，非不幹這件事的做事動作。", "semantic");
    for (const m of text.matchAll(/干(?=(?:其|大|禁)?忌)/gu)) add(m.index, "干", "干", at(m.index)?.pos || "v", "r20：干的賓語是禁忌，取觸犯義，非幹事或乾燥。", "semantic");
    for (const m of text.matchAll(/坛/gu)) {
        const l = left(m.index), r = right(m.index + 1);
        if (/(?:酒|举|舉)$/u.test(l) && /^(?:[边邊]|注酒|[饮飲]|中|口|[内內]|沿)/u.test(r) || /空$/u.test(l) && /酒/u.test(text)) add(m.index, "坛", "罈", at(m.index)?.pos || "n", "r20：酒罈邊緣、舉罈注酒或飲酒後的空罈是容器；壇場、論壇不匹配。", "semantic");
    }
    for (const m of text.matchAll(/钟/gu)) if (/撞(?:一[日天]|几|幾|[两兩三四五六七八九十])?$/u.test(left(m.index)) || /一口$/u.test(left(m.index)) && /^风氅/u.test(right(m.index + 1))) add(m.index, "钟", "鐘", "n", "r20：撞鐘及一口鐘風氅取鐘形器物義；喝一鍾茶不匹配。");
    for (const m of text.matchAll(/征人(?=[归歸])/gu)) add(m.index, m[0], "征人", "n", "r20：征人歸來／歸路為出征之人，合併誤切的征/v＋人/n，非徵召動作。");
    for (const m of text.matchAll(/制(?=就)/gu)) if (/棺|木料|器物|桌|椅|箱|[门門]窗/u.test((neighbors.previousContext || "") + left(m.index))) add(m.index, "制", "製", at(m.index)?.pos || "v", "r20：器物實體作製就的製作對象；體制就、控制就不匹配。", "semantic");
    for (const m of text.matchAll(/愈/gu)) if (/(?:傷勢|伤势|傷口|伤口|疾病|病情|重傷|重伤)(?:未|已|初|漸|渐)?$/u.test(left(m.index))) add(m.index, "愈", "癒", at(m.index)?.pos || "v", "r20：傷勢、傷口或疾病作主語，愈取痊癒義；愈加、愈來愈等程度副詞不匹配。", "semantic");
    for (const m of text.matchAll(/游(?=天下|四方|各地|名山)/gu)) if (/(?:遍|周)$/u.test(left(m.index))) add(m.index, "游", "遊", at(m.index)?.pos || "v", "r20：遍／周遊天下、四方等旅行對象為遊歷義；游大海、游泳及游姓不匹配。", "semantic");
}

module.exports = {
    addContextAnalysis: addContextAnalysis
};

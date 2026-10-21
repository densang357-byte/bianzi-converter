"use strict";

const policy = require("../dictionaries/student-standard/policy.json");

const excluded = require("./excluded-characters");

const glyph = text => [ ...text ].map(c => policy.glyphs[c] || c).join("");

const segmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

const proper = new Set([ "nh", "nhf", "nhs", "nr", "ns", "nz" ]);

function apply(before, converted, tokens, {preserveZhe: preserveZhe = true} = {}) {
    const original = [ ...before ], characters = [ ...converted ], positions = [];
    let offset = 0;
    for (const c of original) {
        positions.push(offset);
        offset += c.length;
    }
    if (original.length !== characters.length) throw Error("學生字典字位無法對齊。");
    const index = new Map(positions.map((p, i) => [ p, i ])), hits = [];
    const protectedSpan = (start, end) => tokens.some(t => proper.has(t.pos) && t.start < end && t.end > start);
    function patch(start, width, target, rule, evidence) {
        const at = index.get(start), next = [ ...target ];
        if (at === undefined || width !== next.length) return;
        const previous = characters.slice(at, at + width).join("");
        next.forEach((c, i) => {
            characters[at + i] = c;
        });
        hits.push({
            source: original.slice(at, at + width).join(""),
            target: target,
            previous: previous,
            offset: start,
            rule: rule,
            version: policy.version,
            evidence: evidence,
            status: "automatic"
        });
    }
    function word(source, target, rule) {
        let from = 0, at;
        while ((at = before.indexOf(source, from)) >= 0) {
            if (!protectedSpan(at, at + source.length)) patch(at, [ ...source ].length, target, rule, [ "student-dictionary-transcription", rule ]);
            from = at + source.length;
        }
    }
    for (const t of tokens) {
        if (protectedSpan(t.start, t.end)) continue;
        if (t.text === "才" && [ "d", "c" ].includes(t.pos)) patch(t.start, 1, "纔", "才纔-副詞", [ "semantic:cai" ]);
        if (t.text === "考" && t.pos === "v") patch(t.start, 1, "攷", "考攷-稽核", [ "semantic:kao" ]);
        if (t.text === "份" && [ "q", "m" ].includes(t.pos)) patch(t.start, 1, "分", "分份-份量", [ "shared:分份" ]);
    }
    for (const [s, t] of [ [ "刚才", "剛纔" ], [ "剛才", "剛纔" ], [ "方才", "方纔" ] ]) word(s, t, "才纔-時間義");
    const wordRules = {
        "考察": "攷察",
        "考核": "攷核",
        "考据": "攷據",
        "考據": "攷據",
        "考证": "攷證",
        "考證": "攷證",
        "考试": "攷試",
        "考試": "攷試",
        "参考": "參攷",
        "參考": "參攷",
        "思考": "思攷",
        "寿考": "壽考",
        "壽考": "壽考",
        "显考": "顯考",
        "顯考": "顯考",
        "先考": "先考",
        "考妣": "考妣",
        "中间": "中閒",
        "中間": "中閒",
        "之间": "之閒",
        "之間": "之閒",
        "离间": "離閒",
        "離間": "離閒",
        "反间": "反閒",
        "反間": "反閒",
        "间谍": "閒諜",
        "間諜": "閒諜",
        "间隙": "閒隙",
        "間隙": "閒隙",
        "间隔": "閒隔",
        "間隔": "閒隔",
        "房间": "房閒",
        "房間": "房閒",
        "防闲": "防閑",
        "防閒": "防閑",
        "马闲": "馬閑",
        "馬閒": "馬閑",
        "于归": "于歸",
        "于歸": "于歸",
        "五岳": "五嶽",
        "山岳": "山嶽",
        "岳丈": "岳丈",
        "尸位": "尸位",
        "尸禄": "尸祿",
        "尸祿": "尸祿",
        "凶手": "凶手",
        "兇手": "凶手",
        "凶器": "凶器",
        "兇器": "凶器",
        "凶年": "凶年",
        "凶恶": "凶惡",
        "兇惡": "凶惡",
        "凶暴": "凶暴",
        "凶顽": "凶頑",
        "吉凶": "吉凶",
        "凶惧": "兇懼",
        "凶懼": "兇懼",
        "爷娘": "爺孃",
        "爺娘": "爺孃",
        "耶娘": "耶孃",
        "成份": "成分",
        "份量": "分量",
        "份数": "分數",
        "份數": "分數"
    };
    for (const [source, target] of Object.entries(wordRules)) word(source, target, "學生字典-已核詞義");
    const speech = new Set;
    for (const m of before.matchAll(/口吃|吃吃(?=地?(?:说|說|笑))|吃讷|吃訥/gu)) {
        if (m[0] === "口吃") {
            if (/(?:[一二两兩三几幾大每这這那小]|张|張|开|開)$/.test(before.slice(0, m.index))) continue;
            if (![ ...segmenter.segment(before) ].some(w => w.index <= m.index && m.index + 2 <= w.index + w.segment.length)) continue;
        }
        for (let i = 0; i < m[0].length; i++) if (m[0][i] === "吃") speech.add(m.index + i);
    }
    original.forEach((c, i) => {
        if (c === "吃" && !protectedSpan(positions[i], positions[i] + 1)) patch(positions[i], 1, speech.has(positions[i]) ? "吃" : "喫", "喫吃-食與口吃", [ "semantic:chi" ]);
        if (c === "着" && !preserveZhe) patch(positions[i], 1, "著", "著字兼用", [ "shared:著着" ]);
    });
    characters.forEach((c, i) => {
        const target = policy.glyphs[c];
        if (!target || target === c || excluded.excluded.has(original[i])) return;
        patch(positions[i], 1, target, "學生字典-字形取捨", policy.glyphEvidence[c]);
    });
    const text = excluded.mapping(before, characters.join("")), final = [ ...text ], risks = [];
    for (const group of policy.pending) {
        if ([ "missing-heads", "article-normalization" ].includes(group.id)) continue;
        const forms = [ ...group.forms ].filter(c => !excluded.excluded.has(c));
        final.forEach((c, i) => {
            if (!forms.includes(c)) return;
            risks.push({
                source: original[i],
                offset: positions[i],
                pos: tokens.find(t => t.start <= positions[i] && positions[i] < t.end)?.pos || "",
                candidates: [ ...new Set([ c, ...forms ]) ],
                reason: "學生字典待核：" + group.reason,
                status: "unreviewed",
                rule: "student:" + group.id,
                version: policy.version
            });
        });
    }
    return {
        text: text,
        hits: hits,
        risks: risks
    };
}

module.exports = {
    apply: apply,
    glyph: glyph,
    policy: policy,
    version: policy.version
};

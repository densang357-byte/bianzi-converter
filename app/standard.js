"use strict";

const variantGroups = [ {
    id: "close",
    label: "合 → 閤",
    forms: {
        "閤": "合"
    }
}, {
    id: "overcome",
    label: "克 → 剋",
    forms: {
        "剋": "克"
    }
}, {
    id: "xiang",
    label: "向 → 曏",
    forms: {
        "曏": "向"
    }
}, {
    id: "revive",
    label: "蘇 → 甦",
    forms: {
        "甦": "蘇"
    }
}, {
    id: "murmur",
    label: "蘇 → 囌",
    forms: {
        "囌": "蘇"
    }
}, {
    id: "cinnabar",
    label: "朱 → 硃",
    forms: {
        "硃": "朱"
    }
}, {
    id: "swing",
    label: "秋千 → 鞦韆",
    forms: {
        "鞦": "秋",
        "韆": "千"
    }
}, {
    id: "ginseng",
    label: "參 → 蔘",
    forms: {
        "蔘": "參"
    }
}, {
    id: "hutong",
    label: "胡同 → 衚衕",
    forms: {
        "衚": "胡",
        "衕": "同"
    }
}, {
    id: "dai",
    label: "呆 → 待",
    forms: {
        "待": "呆"
    }
}, {
    id: "swallow",
    label: "咽 → 嚥",
    forms: {
        "嚥": "咽"
    }
}, {
    id: "return",
    label: "回 → 迴",
    forms: {
        "迴": "回"
    }
}, {
    id: "sleepy",
    label: "困 → 睏",
    forms: {
        "睏": "困"
    }
}, {
    id: "pity",
    label: "恤 → 卹",
    forms: {
        "卹": "恤"
    }
}, {
    id: "clang",
    label: "當 → 噹",
    forms: {
        "噹": "當"
    }
}, {
    id: "taste",
    label: "嘗 → 嚐",
    forms: {
        "嚐": "嘗"
    }
}, {
    id: "worker",
    label: "夫 → 伕",
    forms: {
        "伕": "夫"
    }
}, {
    id: "bing",
    label: "並 → 幷",
    forms: {
        "幷": "並"
    }
}, {
    id: "qi",
    label: "戚 → 慼／鏚",
    forms: {
        "慼": "戚",
        "鏚": "戚"
    }
}, {
    id: "hem",
    label: "擺 → 襬",
    forms: {
        "襬": "擺"
    }
}, {
    id: "turn",
    label: "旋 → 鏇",
    forms: {
        "鏇": "旋"
    }
}, {
    id: "dark",
    label: "暗 → 闇",
    forms: {
        "闇": "暗"
    }
}, {
    id: "boss",
    label: "板 → 闆",
    forms: {
        "闆": "板"
    }
}, {
    id: "fruit",
    label: "果 → 菓",
    forms: {
        "菓": "果"
    }
}, {
    id: "gun",
    label: "槍 → 鎗",
    forms: {
        "鎗": "槍"
    }
}, {
    id: "beam",
    label: "梁 → 樑",
    forms: {
        "樑": "梁"
    }
}, {
    id: "destroy",
    label: "毀 → 燬／譭",
    forms: {
        "燬": "毀",
        "譭": "毀"
    }
}, {
    id: "stream",
    label: "溪 → 谿",
    forms: {
        "谿": "溪"
    }
} ];

const variantsByCharacter = new Map(variantGroups.flatMap(group => Object.entries(group.forms).map(([character, basic]) => [ character, {
    id: group.id,
    basic: basic
} ])));

const glyphPreferences = {
    "个": "個",
    "拿": "拿",
    "证": "證",
    "玩": "玩",
    "针": "針",
    "挂": "掛",
    "豆": "豆",
    "俊": "俊",
    "叹": "嘆",
    "唇": "唇",
    "勋": "勛",
    "艳": "艷",
    "堤": "堤",
    "绷": "繃",
    "狸": "狸",
    "焰": "焰",
    "矩": "矩",
    "皂": "皂",
    "坝": "壩",
    "娴": "嫻",
    "庵": "庵",
    "锄": "鋤",
    "袅": "裊",
    "埙": "壎",
    "谥": "諡",
    "赝": "贗",
    "鹇": "鷴",
    "滟": "灩"
};

const defaults = {
    "确": "確",
    "凄": "淒",
    "占": "佔",
    "啮": "嚙",
    "岳": "岳",
    "征": "征",
    "于": "于",
    "余": "余",
    "帘": "簾",
    "弦": "弦"
};

const directional = require("./data/lexicon-direction-policy.json");

const {retained: retained, fixed: fixed, retainSourceLetters: retainSourceLetters, canonicalGlyphs: canonicalGlyphs} = require("./source-letter-policy");

const excludedCharacters = require("./excluded-characters");

const {normalizeModernGlyphs: normalizeModernGlyphs} = require("./profile-rules");

for (const [source, rule] of Object.entries(directional.characters)) if (rule.default) defaults[source] = rule.default;

defaults.考 = "考";

const allowedIds = new Set(variantGroups.map(group => group.id));

function validateVariants(variants = []) {
    if (!Array.isArray(variants) || variants.some(id => !allowedIds.has(id))) throw new Error("異體設定須為有效的異體組別清單。");
    return new Set(variants);
}

function applyStandard(before, converted, variants = [], resolvedPositions = new Set, enforceGlyphPreferences = true) {
    const enabled = validateVariants(variants), source = Array.from(before), target = Array.from(excludedCharacters.mapping(before, converted));
    if (source.length !== target.length) throw new Error("標準字形轉換的字數與原文不符。");
    return normalizeModernGlyphs(canonicalGlyphs(target.map((character, index) => {
        const original = source[index];
        if (fixed.has(original)) return fixed.get(original);
        if (retained.has(original)) return original;
        if (original === "画") return "畫";
        if (original === "烟") return "煙";
        const undifferentiated = {
            "菸": "煙",
            "牠": "它",
            "妳": "你"
        };
        if (original !== character && undifferentiated[character]) return undifferentiated[character];
        if (character === "絃") return "弦";
        if (original === "复" && ![ "復", "複" ].includes(character)) return "復";
        if (enforceGlyphPreferences && glyphPreferences[original]) return glyphPreferences[original];
        if (!resolvedPositions.has(index) && defaults[original]) return defaults[original];
        const variant = variantsByCharacter.get(character);
        if (variant && original !== character && !enabled.has(variant.id)) return variant.basic;
        return character;
    }).join("")));
}

function restrictOutput(before, converted) {
    const source = Array.from(before), target = Array.from(converted);
    if (source.length !== target.length) throw new Error("輸出限制無法按原文對齊。");
    return retainSourceLetters(before, target.map((character, index) => {
        if (source[index] === "烟") return "煙";
        if (source[index] === "复" && ![ "復", "複" ].includes(character)) return "復";
        return character;
    }).join(""));
}

function candidatesFor(source, targets, variants = []) {
    const candidates = [ ...new Set(targets.map(target => applyStandard(source, target, variants, new Set([ 0 ]), false))) ];
    const preferred = glyphPreferences[source] || defaults[source];
    return preferred && candidates.includes(preferred) ? [ preferred, ...candidates.filter(target => target !== preferred) ] : candidates;
}

module.exports = {
    variantGroups: variantGroups,
    glyphPreferences: glyphPreferences,
    defaults: defaults,
    validateVariants: validateVariants,
    applyStandard: applyStandard,
    candidatesFor: candidatesFor,
    restrictOutput: restrictOutput
};

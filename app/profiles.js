"use strict";

const fs = require("fs");

const path = require("path");

const {OpenCC: OpenCC} = require("opencc");

const root = path.dirname(require.resolve("opencc/package.json"));

const gujiRoot = path.join(__dirname, "vendor/gujicc");

const source = require("./vendor/gujicc/SOURCE.json");

const historical = require("./data/historical-profiles.json");

const {retainSourceLetters: retainSourceLetters, canonicalGlyphs: canonicalGlyphs} = require("./source-letter-policy");

const filteredOpenCC = require("./filtered-opencc");

const directional = require("./data/lexicon-direction-policy.json");

const student = require("./student-standard");

const profiles = [ {
    id: "modern",
    label: "默認標準",
    source: "現代漢語轉換標準 v0.3 · 詞性選字 r17",
    description: "採綫、衞、裡；統一用考。鏟／剷、計劃／計畫、才／纔、喫／吃、諮／咨、抬／擡依義區分。一般佔有義用佔，占卜、口占用占；歧義先核詞網，未決默認佔並列風險。"
}, {
    id: "opencc",
    label: "OpenCC 通用繁體",
    source: "OpenCC s2t / t2s",
    description: "OpenCC 通用字形，不套用默認標準的衝突預設與異體限制。"
}, {
    id: "taiwan",
    label: "臺灣",
    source: "OpenCC s2tw / tw2s",
    description: "臺灣標準字形。"
}, {
    id: "hongkong",
    label: "香港",
    source: "OpenCC s2hk / hk2s",
    description: "香港標準字形。"
}, {
    id: "hongkong-old",
    label: "香港舊標準（1960年代重建）",
    source: "1960年代字形重建",
    description: "有分化則分化；採香港舊字形偏好，採綫、羣、烟、衞等地區字形。屬重建方案，並非官方歷史規範。"
}, {
    id: "taiwan-old",
    label: "臺灣舊標準（1960年代重建）",
    source: "1960年代字形重建",
    description: "有分化則分化；採臺灣舊字形偏好，採線、群、煙、朶等。屬重建方案，並非官方歷史規範。"
}, {
    id: "guji",
    label: "古籍繁體",
    source: "GujiCC s2g / g2s",
    description: "大陸標準繁體。"
}, {
    id: "harmonized",
    label: "調和繁體",
    source: "GujiCC s2c / g2s",
    description: "大陸標準繁體微調。"
}, {
    id: "student",
    label: "學生字典（試用）",
    source: "1915年《學生字典》用字整理 · " + student.version,
    description: "採牀、羣、峯、衞、箇；保留才／纔、喫／吃等用法。待核字組另列，詳見學生字典用字說明。"
} ];

const cache = new Map, dictionaryCache = new Map;

function getProfile(id = "modern") {
    const profile = profiles.find(p => p.id === id);
    if (!profile) throw new Error("未知的轉換標準。");
    return profile;
}

function getConverter(id, direction) {
    getProfile(id);
    const key = id + direction;
    if (!cache.has(key)) {
        if ([ "guji", "harmonized" ].includes(id)) {
            const name = direction === "t2s" ? "g2s" : id === "guji" ? "s2g" : "s2c";
            const config = JSON.parse(fs.readFileSync(path.join(gujiRoot, name + ".json"), "utf8"));
            for (const step of config.conversion_chain) if (step.dict.type === "group") step.dict.match_policy = "short_circuit";
            cache.set(key, filteredOpenCC.converter(name, gujiRoot));
        } else {
            const name = {
                "hongkong-old": [ "s2t", "t2s" ],
                "taiwan-old": [ "s2t", "t2s" ],
                modern: [ "s2t", "t2s" ],
                student: [ "s2t", "t2s" ],
                opencc: [ "s2t", "t2s" ],
                taiwan: [ "s2tw", "tw2s" ],
                hongkong: [ "s2hk", "hk2s" ]
            }[id][direction === "t2s" ? 1 : 0];
            cache.set(key, filteredOpenCC.converter(name, undefined, {
                modernTai: id === "modern" && direction === "s2t"
            }));
        }
    }
    return cache.get(key);
}

function readDictionary(file) {
    const map = new Map;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.trim() || line.startsWith("#")) continue;
        const [key, value] = line.trim().split("\t");
        if (key && value) map.set(key, [ ...new Set(value.split(/ +/).map(t => filteredOpenCC.retainElephant(key, t))) ]);
    }
    return map;
}

function getDictionaries(id) {
    getProfile(id);
    if (!dictionaryCache.has(id)) {
        const custom = [ "guji", "harmonized" ].includes(id), prefix = id === "guji" ? "SG" : "SC";
        const base = custom ? gujiRoot : path.join(root, "data/dictionary");
        const chars = readDictionary(path.join(base, (custom ? prefix : "ST") + "Characters.txt"));
        const phrases = readDictionary(path.join(base, (custom ? prefix : "ST") + "Phrases.txt"));
        if (id === "student") for (const map of [ chars, phrases ]) for (const [word, targets] of map) map.set(word, [ ...new Set(targets.map(target => student.glyph(target))) ]);
        if (id === "modern") for (const map of [ chars, phrases ]) for (const [word, targets] of map) map.set(word, [ ...new Set(targets.map(target => [ ...word ].length === [ ...target ].length ? retainSourceLetters(word, canonicalGlyphs(target)) : canonicalGlyphs(target))) ]);
        if (id === "modern") {
            for (const map of [ chars, phrases ]) for (const [word, targets] of map) map.set(word, require("./zhan-policy").dictionary(word, require("./tai-policy").dictionary(word, targets)));
            chars.set("抬", [ "擡", "抬" ]);
            chars.set("佔", [ "佔", "占" ]);
            chars.set("發", [ "發", "髮" ]);
            for (const [word, rule] of Object.entries(directional.words)) if (rule.targets) phrases.set(word, rule.targets.slice());
            for (const word of Object.keys(directional.excluded_phrases || {})) phrases.delete(word);
        }
        for (const [word, values] of phrases) {
            const approved = require("./word-boundary-policy").targets(word, values);
            if (approved.length) phrases.set(word, approved); else phrases.delete(word);
        }
        dictionaryCache.set(id, {
            characters: chars,
            phrases: phrases
        });
    }
    return dictionaryCache.get(id);
}

function profileCandidates(id, ch, fallback) {
    if (require("./excluded-characters").excluded.has(ch)) return [ ch ];
    const values = getDictionaries(id).characters.get(ch) || fallback || [ ch ];
    if ([ "taiwan", "hongkong" ].includes(id)) {
        const key = id + "-variants";
        if (!cache.has(key)) cache.set(key, new OpenCC(id === "taiwan" ? "t2tw.json" : "t2hk.json"));
        return [ ...new Set(values.map(value => filteredOpenCC.retainElephant(ch, cache.get(key).convertSync(value)))) ];
    }
    return [ ...new Set(values.map(c => filteredOpenCC.retainElephant(ch, historical[id]?.mapping[c] || c))) ];
}

function applyHistorical(id, before, converted) {
    const mapping = historical[id]?.mapping;
    if (!mapping) return converted;
    const a = Array.from(before), b = Array.from(converted);
    if (a.length !== b.length) throw new Error("歷史字形無法對齊。");
    return b.map(c => mapping[c] || c).join("");
}

module.exports = {
    applyHistorical: applyHistorical,
    profiles: profiles,
    getProfile: getProfile,
    getConverter: getConverter,
    readDictionary: readDictionary,
    getDictionaries: getDictionaries,
    profileCandidates: profileCandidates,
    gujiSource: source
};

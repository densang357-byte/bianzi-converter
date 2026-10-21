"use strict";

const data = require("./data/zhan-policy.json");

const version = data.version, proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz", "nr", "nr1", "nr2", "PER" ]);

const segmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

const norm = s => s.replace(/佔/gu, "占");

const forms = new Map(data.lexemes.map(r => [ r.source, r ]));

function analyze(text, tokens = []) {
    const native = tokens.some(t => t.pos);
    const units = tokens.length ? tokens : [ ...segmenter.segment(text) ].map(t => ({
        text: t.segment,
        start: t.index,
        end: t.index + t.segment.length
    }));
    const bounds = new Set(units.flatMap(t => [ t.start, t.end ]));
    const owner = at => units.find(t => t.start <= at && at < t.end);
    const fits = (a, b, word) => bounds.has(a) && bounds.has(b) || owner(a) === owner(b - 1) && norm(owner(a)?.text || "") === word;
    const hits = [], pending = [];
    const emit = (at, target, id, clues, structure) => hits.push({
        offset: at,
        source: text[at],
        target: target,
        pos: owner(at)?.pos,
        rule: id,
        clues: clues,
        structure: structure,
        version: version,
        directionalRule: true,
        decisionBasis: id === "zhan-unresolved" ? "unresolved-default" : id === "zhan-proper-pending" ? "entity-review" : id === "zhan-proper" ? "proper-form" : "local-semantic",
        reason: data.reasons[id]
    });
    for (const m of text.matchAll(/[占佔]/gu)) {
        const at = m.index, h = owner(at);
        let chosen;
        if (/[鳥鸟]/u.test(text[at - 1] || "") && /^(?:是|為|爲|为|乃|即)[^，,。！？!?；;\n]{0,12}(?:卜術|卜术|占卜|卜筮)/u.test(text.slice(at + 1))) {
            emit(at, "占", "zhan-divination", [ "鳥占", "卜術" ], "explicit-divination-definition");
            if (h?.text.includes("是")) pending.push({
                offset: at,
                source: text[at],
                token: h.text,
                pos: h.pos,
                rule: "zhan-definition-boundary",
                riskKind: "疑似詞界（待核）",
                reviewOnly: true,
                status: "unreviewed",
                reason: "定義明示鳥占屬卜術；模型卻把占與是合詞，僅列分析建議，不合併或改寫原生詞。"
            });
            continue;
        }
        if (h && (!native || /^(?:n|nh|nhf|nhs|ni|ns|nz)$/u.test(h.pos))) {
            const t = norm(h.text), local = at - h.start;
            const base = [ "占星", "占卜" ].find(w => t.slice(local).startsWith(w) && data.divinationHeads.includes(t.slice(local + w.length)));
            if (base) {
                emit(at, "占", "zhan-divination", [ base, t.slice(local + base.length) ], "purpose-or-practitioner-noun-head");
                continue;
            }
        }
        for (const r of data.lexemes) {
            const pos = r.source.indexOf("占"), a = at - pos, b = a + r.source.length;
            if (a < 0 || norm(text.slice(a, b)) !== r.source || !fits(a, b, r.source)) continue;
            if (!chosen || r.source.length > chosen.source.length) chosen = {
                ...r,
                a: a,
                b: b
            };
        }
        if (chosen?.target === "佔" && proper.has(h?.pos)) chosen = null;
        if (chosen) {
            emit(at, chosen.target, chosen.relation, [ chosen.source ], "whole-lexeme-boundaries");
            continue;
        }
        const named = data.protectedForms.find(w => {
            const a = at - w.indexOf("占");
            return a >= 0 && text.slice(a, a + w.length) === w && fits(a, a + w.length, w);
        });
        if (named) {
            emit(at, "占", "zhan-proper", [ named ], "attested-proper-form");
            continue;
        }
        if (text.slice(at, at + 2) === "占城" && (/^(?:國|国|稻|人|王國|王国)/u.test(text.slice(at + 2)) || /(?:來自|来自|出使|使節赴|使节赴|遠赴|远赴)$/u.test(text.slice(Math.max(0, at - 8), at)))) {
            emit(at, "占", "zhan-proper", [ "占城" ], "geographic-name-construction");
            continue;
        }
        const hi = units.indexOf(h), children = units.filter(t => t.parent === hi), shape = /^[占佔](?:着|著|了|過|过|得|一占)?$/u;
        const verb = h && h.start === at && shape.test(h.text) && (!native || h.pos === "v");
        const right = text.slice(at + 1).split(/[，,。！？!?；;：:\n]/u)[0];
        const object = verb && units.find(t => data.divinationObjects.includes(t.text) && !proper.has(t.pos) && t.start >= at + 1 && t.start < at + 20 && (t.parent === hi && [ "VOB", "FOB" ].includes(t.relation) || /^(?:了|得|過|过|着|著|一|個|个|此|這|这|那){0,5}$/u.test(text.slice(at + 1, t.start))));
        if (object && !/^(?:住|據|据|有|用|領|领|滿|满|去|走|盡|尽|上風|上风)/u.test(right)) {
            emit(at, "占", "zhan-divination", [ object.text ], tied(object, hi) ? "dependency-prognostic-object" : "bounded-prognostic-object");
            continue;
        }
        const instrument = verb && children.find(t => [ "用", "以" ].includes(t.text) && t.pos === "p" && units.some(o => o.parent === units.indexOf(t) && o.relation === "POB" && data.divinationTools.includes(o.text)));
        if (instrument && /^(?:之|一占|了)?[」』”\s]*$/u.test(right)) {
            const tool = units.find(o => o.parent === units.indexOf(instrument) && data.divinationTools.includes(o.text));
            emit(at, "占", "zhan-divination", [ tool.text ], "dependency-divination-instrument");
            continue;
        }
        const oral = verb && units.find(t => t.end === at && [ "口", "隨口", "随口" ].includes(t.text) && (!native || t.parent === hi && t.relation === "ADV"));
        const poem = verb && units.find(t => data.oralObjects.includes(t.text) && t.start > at && t.start < at + 14 && /^(?:了|一|兩|两|三|首|闋|阕|句|段|篇|四){0,5}$/u.test(text.slice(at + 1, t.start)));
        if (oral && poem) {
            emit(at, "占", "zhan-oral", [ oral.text, poem.text ], "oral-modifier-and-composition");
            continue;
        }
        if (h && proper.has(h.pos) && !/^[占佔](?:了|住|去|着|著|滿|满|盡|尽|上|下|得)/u.test(text.slice(at))) {
            emit(at, text[at], "zhan-proper-pending", [ h.text ], "native-entity-review-only");
            pending.push({
                offset: at,
                source: text[at],
                pos: h.pos,
                token: h.text,
                rule: "zhan-native-entity",
                status: "unreviewed",
                reviewOnly: true,
                reason: "疑似專名另核，暫留來源字形；不是人工人名金標，不加入全域人名詞庫，不能單憑nh/ns套一般義兜底。"
            });
            continue;
        }
        const action = h && ((!native || h.pos === "v") && h.start === at || proper.has(h.pos) && at > h.start && /^[占佔](?:了|住|去|着|著|滿|满|盡|尽)/u.test(text.slice(at)));
        const dependent = action && units.find(t => (data.occupationObjects.includes(t.text) || /^n/u.test(t.pos) && /(?:塔|堂|樓|楼|殿|院|門|门|城|宮|宫|攤|摊)$/u.test(t.text)) && !proper.has(t.pos) && (t.parent === hi && [ "VOB", "FOB" ].includes(t.relation) || t.start > at && t.start < at + 18 && /^(?:不|沒|没|能|可|出|得|了|完|足|住|着|著|去|上|下|過|过|盡|尽|一|些|點|点|半|多|少|很|大|小|我|你|他|她|的|什麼|什么|這|这|那){0,10}$/u.test(text.slice(at + 1, t.start))));
        const quantified = action && /^(?:了|着|著|去|得|有|比|滿|满)?(?:[一二三四五六七八九十百千萬万億亿兩两幾几數数\d]+(?:成|分之|%|％|處|处|份)|百分之|一半|半(?:頁|页|面|壁|數|数)|大(?:半|部分|多數|多数)|絕大多數|绝大多数|多數|多数|全部)/u.test(right);
        const internal = action && (/^[占佔](?:住|據|据|有|用|領|领|滿|满|奪|夺|駐|驻)/u.test(h.text) || data.occupationObjects.includes(norm(h.text).slice(1)));
        const tricolon = action && /^天[時时]、[占佔]地利、[占佔]人和/u.test(right);
        if (dependent || quantified || internal || tricolon) {
            emit(at, "佔", "zhan-occupation", [ dependent?.text || (quantified ? "份額／數量" : tricolon ? "天時地利人和" : "據有補語") ], dependent ? "local-occupation-argument" : quantified ? "bounded-proportion" : tricolon ? "parallel-advantage-arguments" : "occupation-verb-complement");
            continue;
        }
        emit(at, data.unresolved, "zhan-unresolved", [], "unresolved-fallback");
        pending.push({
            offset: at,
            source: text[at],
            token: h?.text,
            pos: h?.pos,
            candidates: [ "佔", "占" ],
            fallback: data.unresolved,
            selectionBasis: "network-checked-default",
            rule: "zhan-unresolved",
            riskKind: "占佔詞義未決",
            status: "unreviewed",
            reviewOnly: true,
            reason: "已核對局部語義詞網，未找到足以裁決的有效關聯；依使用者要求默認佔，必須送待核風險清單，不當作已確認詞性錯誤。"
        });
    }
    return {
        decisions: hits,
        pending: pending
    };
}

function tied(t, parent) {
    return t.parent === parent && [ "VOB", "FOB" ].includes(t.relation);
}

const decisions = (text, tokens) => analyze(text, tokens).decisions;

function dictionary(source, targets) {
    if (source === "占") return [ "佔", "占" ];
    const r = forms.get(source);
    if (r) return [ ...new Set(targets.map(t => t.replace(/[占佔]/gu, r.target))) ];
    return targets;
}

module.exports = {
    version: version,
    data: data,
    analyze: analyze,
    decisions: decisions,
    dictionary: dictionary
};

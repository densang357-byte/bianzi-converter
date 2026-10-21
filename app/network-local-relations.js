"use strict";

const data = require("./data/lexical-network-local-relations.json");

const recitation = require("./network-recitation-relations");

const backNodes = require("./network-back-node-relations");

const semantic = require("./network-semantic-relations");

const relations = new Map(data.relations.map(r => [ r.id, r ]));

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const numbers = "[零〇一二三四五六七八九十百两兩0-9]+";

function analyze(text, tokens, options = {}) {
    if (!tokens.length || !/[干丑背里链炼划占佔]/u.test(text)) return {
        matches: [],
        comparisons: []
    };
    const out = [], bounds = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    const owner = at => tokens.find(t => t.start <= at && at < t.end);
    const allowed = (at, shape) => {
        const t = owner(at);
        return t && !proper.has(t.pos) && !options.protected?.has(at) && shape.test(t.text);
    };
    const add = (at, id, clues, weight = data.weights.calendarRelation, strength = "local", structure) => {
        const r = relations.get(id), t = owner(at);
        if (text[at] !== r.source && !(r.source === "占" && text[at] === "佔")) return;
        out.push({
            start: at,
            end: at + 1,
            source: text[at],
            target: r.target,
            pos: t?.pos,
            kind: "lexical-network-local-relation",
            rule: id,
            clues: clues,
            weight: weight,
            strength: strength,
            structure: structure,
            evidence: {
                version: data.version,
                paragraphs: r.evidence.paragraphs,
                documents: r.evidence.documents,
                domains: r.evidence.domains,
                proof: r.evidence.examples.map(e => ({
                    id: e.id,
                    at: e.at
                }))
            },
            reason: "詞網局部關聯：" + r.activation + (r.evidence.paragraphs ? " 原字用例 " + r.evidence.paragraphs + " 段、" + r.evidence.documents + " 文件。" : " 此項為明列的語義條件及正反例，未據頻次推算強度。") + "保留原生詞性。"
        });
    };
    const fluid = t => data.fluidForms.some(w => t.text === w), body = s => data.bodyForms.some(w => s.includes(w));
    for (const t of tokens) {
        if (t.text !== "干" || !allowed(t.start, /^干$/u)) continue;
        const i = tokens.indexOf(t), children = tokens.filter(k => k.parent === i), head = tokens[t.parent];
        const subject = children.find(k => k.relation === "SBV" && fluid(k));
        const patient = t.relation === "CMP" && head?.pos === "v" && tokens.find(k => k.parent === t.parent && k.relation === "VOB" && fluid(k));
        const left = text.slice(Math.max(0, t.start - 28), t.start).split(/[。！？!?；;\n]/u).at(-1);
        const right = text.slice(t.end).split(/[，,。！？!?；;\n]/u)[0];
        const surfaceSubject = /(?:唾沫|唾液|口水)(?:也|都|已|已经|已經|早|快|全|渐渐|漸漸){0,4}$/u.test(left) && /^(?:了|得|透|尽|盡|燥|涩|澀|裂|$)/u.test(right);
        const depleted = body(left) && /^得(?:连|連)?(?:一|半|点|點|滴|些|少|絲|丝|毫|不|到|丁|兒|儿|0-9){0,8}(?:唾沫|口水|唾液)(?:也|都|竟|竟然)?(?:没(?:有)?(?:了)?|沒有(?:了)?|不剩|全无|全無)/u.test(right);
        if (subject || patient || depleted || surfaceSubject) add(t.start, "saliva-dryness", [ subject?.text || patient?.text || (depleted ? right : left).match(/唾沫|口水|唾液/u)[0] ], data.weights.fluidRelation);
    }
    for (const m of text.matchAll(/干/gu)) {
        if (!allowed(m.index, /^干(?:了|些|的|点|點|过|過){0,2}(?:(?:什[么麼]|甚[么麼]|啥))?$/u)) continue;
        const at = m.index, window = text.slice(Math.max(0, at - 40), Math.min(text.length, at + 41));
        for (const word of data.fluidForms) {
            const positions = [ ...window.matchAll(new RegExp(word, "gu")) ].map(m => Math.max(0, at - 40) + m.index);
            const nearby = positions.filter(a => !/[。！？!?；;\n]/u.test(text.slice(Math.min(a, at), Math.max(a, at))));
            if (nearby.length) {
                const gap = Math.min(...nearby.map(a => Math.max(a - at - 1, at - a - word.length, 0)));
                add(at, "saliva-dryness", [ word ], data.weights.fluidBackground / (1 + gap / 20), "background");
            }
        }
    }
    for (const m of text.matchAll(/干(?:了|些|的|点|點|过|過){0,2}(?:什[么麼]|甚[么麼]|啥)/gu)) {
        if (allowed(m.index, /^干(?:了|些|的|点|點|过|過){0,2}(?:(?:什[么麼]|甚[么麼]|啥))?$/u)) add(m.index, "action-interrogative", [ m[0].match(/什[么麼]|甚[么麼]|啥/u)[0] ], data.weights.actionInterrogative);
    }
    const stemShape = new RegExp("^(?:" + numbers + ")?干$|^(?:天干|干支)$", "u");
    for (const pattern of [ /干[和与與及、]支/gu, new RegExp(numbers + "干[、，,和与與及]?" + numbers + "支", "gu"), /干支/gu, /天干[和与與及、]?地支/gu ]) {
        for (const m of text.matchAll(pattern)) {
            const at = m.index + m[0].indexOf("干");
            if (!bounds.has(m.index) || !bounds.has(m.index + m[0].length) || !allowed(at, stemShape)) continue;
            add(at, "calendar-stem-branch", [ "支", m[0] ]);
        }
    }
    const branchShape = new RegExp("^[" + data.branchForms + "]+$", "u");
    for (const m of text.matchAll(/地支(?:中|里|裏|内|內)?的?丑/gu)) {
        const at = m.index + m[0].length - 1;
        if (allowed(at, branchShape) && bounds.has(at + 1) && !/^[陋恶惡怪态態化闻聞]/u.test(text.slice(at + 1))) add(at, "calendar-earth-branch", [ "地支" ]);
    }
    const run = new RegExp("[" + data.branchForms + "](?:[、和与與及]?[" + data.branchForms + "])+", "gu");
    for (const m of text.matchAll(run)) {
        const end = m.index + m[0].length, right = text.slice(end), clause = text.slice(Math.max(0, m.index - 20), Math.min(text.length, end + 24)).split(/[。！？!?；;\n]/u).find(s => s.includes(m[0])) || "";
        if (!bounds.has(m.index) || !bounds.has(end) || !/(?:地支|十二支|二支|三支|四支|六支|时辰|時辰)/u.test(clause) || !/^(?:[一二三四五六七八九十]+(?:个|個)?(?:地)?支|[，,。；;！？”」]|是|都|为|為|属|屬|等)/u.test(right)) continue;
        for (const c of m[0].matchAll(/丑/gu)) {
            const at = m.index + c.index;
            if (allowed(at, branchShape)) add(at, "calendar-earth-branch", [ "支", m[0] ]);
        }
    }
    const branchToken = /^[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]+(?:年|月|日|时|時)?$/u;
    for (const pair of data.sexagenaryPairs) {
        if (!pair.includes("丑")) continue;
        for (const m of text.matchAll(new RegExp(pair, "gu"))) {
            const at = m.index + 1, end = m.index + 2, suffix = /^[年月日时時]/u.test(text.slice(end)) ? 1 : 0;
            if (bounds.has(m.index) && bounds.has(end + suffix) && allowed(at, branchToken)) add(at, "calendar-earth-branch", [ pair ]);
        }
    }
    for (const m of text.matchAll(/丑[年月日时時]/gu)) {
        if (bounds.has(m.index) && bounds.has(m.index + 2) && allowed(m.index, branchToken)) add(m.index, "calendar-earth-branch", [ m[0] ]);
    }
    for (const m of text.matchAll(run)) {
        const chars = m[0].replace(/[、和与與及]/gu, "");
        if (chars.length < 3 || new Set(chars).size !== chars.length || !bounds.has(m.index) || !bounds.has(m.index + m[0].length)) continue;
        if (![ ...chars ].every((c, i) => i === 0 || (data.branchForms.indexOf(c) - data.branchForms.indexOf(chars[i - 1]) + 12) % 12 === 1)) continue;
        for (const x of m[0].matchAll(/丑/gu)) {
            const at = m.index + x.index;
            if (allowed(at, branchToken)) add(at, "calendar-earth-branch", [ m[0] ]);
        }
    }
    for (const d of require("./zhan-policy").decisions(text, tokens)) if ("占佔".includes(d.source) && [ "zhan-divination", "zhan-oral", "zhan-occupation" ].includes(d.rule) && !options.protected?.has(d.offset)) add(d.offset, d.rule, d.clues, data.weights.directSemantic, "local", d.structure);
    for (const edge of [ ...backNodes(text, tokens, data, allowed), ...recitation(text, tokens, data, allowed), ...semantic(text, tokens, data, allowed) ]) add(edge.at, edge.id, edge.clues, edge.weight, edge.strength, edge.structure);
    for (const m of text.matchAll(/(?:向|往|朝)里(?:走|衝|冲|跑|奔|逃|退)?去|(?:寺|屋|门|門|庙|廟|洞|心|田)里去/gu)) {
        const at = m.index + m[0].indexOf("里"), t = owner(at);
        if (!t || t.pos === "q" || proper.has(t.pos) || options.protected?.has(at)) continue;
        if (!bounds.has(at) && !/(?:寺|屋|门|門|庙|廟|洞|心|田)里$/u.test(t.text)) continue;
        if (!bounds.has(m.index + m[0].length)) continue;
        add(at, "inside-go", [ m[0].slice(0, m[0].indexOf("里")), "去" ], data.weights.insideDirection);
    }
    const grouped = new Map;
    for (const h of out) {
        if (!grouped.has(h.start)) grouped.set(h.start, []);
        grouped.get(h.start).push(h);
    }
    const hits = [], comparisons = [];
    for (const [at, edges] of grouped) {
        const current = options.currentOutput?.[at], targets = [ ...new Set([ ...{
            "干": [ "干", "乾", "幹" ],
            "丑": [ "丑", "醜" ],
            "背": [ "背", "揹" ],
            "里": [ "里", "裏", "裡" ],
            "链": [ "鏈", "鍊" ],
            "炼": [ "煉", "鍊" ],
            "划": [ "划", "劃" ],
            "占": [ "佔", "占" ],
            "佔": [ "佔", "占" ]
        }[text[at]], ...current ? [ current ] : [] ]) ];
        const scores = targets.map(target => {
            const selected = new Map;
            for (const e of edges.filter(e => e.target === target)) {
                const key = e.rule + "|" + e.strength;
                const old = selected.get(key);
                if (!old || old.weight < e.weight) selected.set(key, e);
            }
            const support = [ ...selected.values() ], prior = current === target ? data.weights.currentPrior : 0;
            return {
                target: target,
                prior: prior,
                score: Math.max(0, ...support.filter(e => e.strength === "local").map(e => e.weight)),
                edges: support.map(e => ({
                    rule: e.rule,
                    strength: e.strength,
                    weight: e.weight,
                    clues: e.clues
                }))
            };
        }).sort((a, b) => b.score - a.score);
        const winner = scores[0], margin = winner.score - scores[1].score, strong = edges.filter(e => e.target === winner.target && e.strength === "local").sort((a, b) => b.weight - a.weight)[0];
        const accepted = Boolean(strong) && margin >= data.weights.minimumMargin;
        comparisons.push({
            at: at,
            source: text[at],
            current: current,
            scores: scores,
            margin: margin,
            minimumMargin: data.weights.minimumMargin,
            accepted: accepted,
            preferred: accepted ? winner.target : null
        });
        if (accepted) hits.push({
            ...strong,
            evidence: {
                ...strong.evidence,
                weights: data.weights,
                scores: scores,
                margin: margin
            }
        });
    }
    return {
        matches: hits,
        comparisons: comparisons
    };
}

const matches = (text, tokens, options) => analyze(text, tokens, options).matches;

module.exports = {
    analyze: analyze,
    matches: matches,
    version: data.version
};

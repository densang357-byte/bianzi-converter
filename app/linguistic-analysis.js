"use strict";

const names = require("../dictionaries/named-entities.json");

const lexicon = require("../dictionaries/pos-corrections.json");

const semantic = require("../dictionaries/semantic-context.json");

function analyze(text, raw, neighbors = {}) {
    const native = neighbors.nativeTokens || raw;
    const boundaryView = require("./boundary-pos-matching").project(text, raw, native);
    raw = boundaryView.tokens;
    const spans = [];
    const boundaries = new Set(raw.flatMap(t => [ t.start, t.end ]));
    function add(start, source, target, pos, reason, kind = "lexicon", evidence = {}) {
        const end = start + source.length;
        if (spans.some(s => start < s.end && end > s.start)) return;
        if ([ ...source ].length !== [ ...target ].length) throw Error("Analysis dictionary changes length");
        spans.push({
            start: start,
            end: end,
            source: source,
            target: target,
            pos: pos,
            reason: reason,
            kind: kind,
            ...evidence
        });
    }
    for (const row of names.entries) for (let at = text.indexOf(row.source); at >= 0; at = text.indexOf(row.source, at + row.source.length)) {
        const left = text.slice(0, at), right = text.slice(at + row.source.length);
        if (row.gate === "official-title" && !/^(?:司马|司馬|司徒|太守|将军|將軍)/u.test(right)) continue;
        if (row.gate === "personal-address") {
            if (/(?:在|居|卧|臥|密|石|房|寝|寢)$/u.test(left)) continue;
            if (!/^(?:队长|隊長|道[：:]|[应應]道|已拉)/u.test(right) && !(/[「『﹁﹃“]$/u.test(left) && /^[，,]/u.test(right))) continue;
        }
        add(at, row.source, row.target, row.pos, row.reason, "entity");
    }
    for (const row of semantic.person_surnames) for (const m of text.matchAll(new RegExp(row.source, "gu"))) {
        const t = raw.find(t => t.start === m.index), right = text.slice(m.index + 1);
        if (raw.length && (!t || t.pos !== row.pos || t.text.length > row.max_token_length || row.exclude_tokens.includes(t.text) || t.text.length === 1 && !/^(?:司马|司馬|司徒|太守|将军|將軍|先生|女士|公子)/u.test(right))) continue;
        add(m.index, row.source, row.target, t?.pos || "nh", row.reason, "semantic");
    }
    for (const row of lexicon.entries) for (let at = text.indexOf(row.source); at >= 0; at = text.indexOf(row.source, at + row.source.length)) {
        if (raw.length && !(boundaries.has(at) && boundaries.has(at + row.source.length))) continue;
        if (/几$/u.test(row.source) && /^(?:株|个|個|何|乎|多|少|年|月|日|人)/u.test(text.slice(at + row.source.length))) continue;
        add(at, row.source, row.target, row.pos, row.reason);
    }
    for (const m of text.matchAll(/复姓/gu)) if (lexicon.compound_surnames.some(s => text.startsWith(s, m.index + 2))) add(m.index, m[0], "複姓", "n", "緊接已知複姓的姓氏結構，與恢復原姓的復姓分開。");
    for (const m of text.matchAll(/干(?=为父|為父)/gu)) if (/坤|八卦/u.test(text)) add(m.index, "干", "乾", "nz", "八卦乾為父、坤為母的卦名。");
    for (const m of text.matchAll(/干(?=已半枯)/gu)) add(m.index, "干", "幹", "n", "樹幹半枯的實體主語，校正模型的形容詞標註。");
    for (const m of text.matchAll(/[这這]只(?=要(?:伤|傷|抓|打|拍|握|伸)[^，。；！？]{0,15}的手)/gu)) {
        if (!/[这這]只手/u.test((neighbors.previousContext || "") + text.slice(0, m.index))) continue;
        add(m.index + 1, "只", "隻", "q", "上文同一隻手，後接要……的手之關係子句；拆開誤合的只要。");
    }
    for (const match of require("./collective-gan").matches(text, raw)) add(match.start, "干", "干", match.pos, match.reason, "semantic", {
        rule: match.rule,
        reference: match.reference,
        structure: match.structure
    });
    for (const match of require("./collective-gan").stemMatches(text, raw)) add(match.start, "干", "幹", match.pos, match.reason, "semantic", {
        rule: match.rule
    });
    for (const m of text.matchAll(/(?:这|這|那)干(?=(?:外来|外來|少林|年轻|年輕|年老|白衣|黑衣)?(?:高僧|僧人|弟子|官兵|人众|人眾))/gu)) add(m.index + 1, "干", "干", raw.find(t => t.start <= m.index + 1 && t.end > m.index + 1)?.pos || "q", "這干、那干人眾的泛稱，非樹幹或乾燥。", "semantic");
    for (const m of text.matchAll(/(?:给|給|被)冲(?=下去|走了)/gu)) {
        if (!/(?:溪水|河水|水流|洪水|大水)[^。！？]{0,24}$/u.test(text.slice(0, m.index))) continue;
        add(m.index + 1, "冲", "沖", "v", "水流作施事的被動沖走，非人物衝撞。", "semantic");
    }
    for (const m of text.matchAll(/并(?=住不[动動])/gu)) if (/以硬接硬|掌力|相持/u.test(text)) add(m.index, "并", "併", "v", "掌力互相併住的動作，校正誤標的副詞。");
    for (const m of text.matchAll(/并(?=掌(?:往|向|直|[击擊]))/gu)) add(m.index, "并", "併", "v", "併掌擊出的合掌動作，非連詞並；排除並掌理政務的詞界。");
    for (const m of text.matchAll(/(?:花[岗崗]石|大理石|玉石|青石|石料|木料|皮革)所制/gu)) add(m.index + m[0].length - 1, "制", "製", "v", "石料、木料、皮革等明確材料所製，非所控制。", "semantic");
    for (const m of text.matchAll(/(?:[给給被]水|溪水|河水|水流|洪水|大水)冲(?=得|走|下|去|散)/gu)) add(m.index + m[0].length - 1, "冲", "沖", "v", "水作施事，沖得倒退或沖走，非人物衝刺。", "semantic");
    for (const m of text.matchAll(/听斗/gu)) if (/交手|交[斗鬥]|比[拼拚]|相[斗鬥]|內功|内功/u.test((neighbors.previousContext || "") + text)) add(m.index + 1, "斗", "鬥", raw.find(t => t.start <= m.index + 1 && t.end > m.index + 1)?.pos || "n", "聽取比拼交鬥之聲，斗雖是名詞性賓語，仍為鬥爭義。", "semantic");
    for (const m of text.matchAll(/并斗/gu)) if (/功夫|比武|必[胜勝]|交手|掌力|[较較]量/u.test(text)) add(m.index, "并", "併", "v", "武術較量語境中併力拚鬥，校正連接詞或副詞誤標。");
    const hua = semantic.hua;
    for (const m of text.matchAll(/划/gu)) {
        const token = raw.find(t => t.start <= m.index && t.end > m.index);
        if (raw.length && (!token || token.text !== "划" || !hua.standalone_pos.includes(token.pos))) continue;
        const left = text.slice(0, m.index).split(/[，,。！？!?；;：:]/u).at(-1), right = text.slice(m.index + 1).split(/[，,。！？!?；;：:]/u)[0];
        const prefix = right.match(/^(?:着|著|了|动|動|起)?(?:一[只隻艘条條叶葉])?/u)[0];
        const object = hua.rowing_objects.find(w => right.startsWith(w, prefix.length) && (!raw.length || boundaries.has(m.index + 1 + prefix.length + w.length)));
        if (!object && hua.surface_results.some(w => right.slice(0, 12).includes(w))) {
            add(m.index, "划", "劃", token?.pos || "v", "詞義網絡：直接結果或賓語為界線、痕跡、傷口等，優先於湖河或船槳背景。", "semantic");
            continue;
        }
        const destination = /^(?:向|往|回|到|去|过|過)[^，。！？]{0,3}(?:岸|湖心|江心|河心|上游|下游)/u.test(right);
        const vessel = hua.watercraft_heads.some(w => left.slice(-10).includes(w));
        if (object || destination && vessel) add(m.index, "划", "划", token?.pos || "v", "詞義網絡：以船筏舟艇、水或槳為直接對象，或已在舟艇上向岸移動，取撥水推進義。", "semantic");
    }
    require("./context-analysis").addContextAnalysis(text, raw, neighbors, (...args) => {
        if (require("../dictionaries/context-rule-policy.json").enabled_reasons.includes(args[4])) add(...args);
    });
    spans.sort((a, b) => a.start - b.start);
    const corrections = spans.filter(s => s.kind !== "semantic").map(s => ({
        ...s,
        original: raw.filter(t => t.start < s.end && t.end > s.start).map(t => ({
            ...t
        }))
    }));
    const tokens = [];
    for (const t of raw) {
        let at = t.start;
        for (const s of corrections) {
            if (s.end <= at || s.start >= t.end) continue;
            if (s.start > at) tokens.push({
                ...t,
                text: text.slice(at, s.start),
                start: at,
                end: s.start
            });
            at = Math.max(at, s.end);
        }
        if (at < t.end) tokens.push({
            ...t,
            text: text.slice(at, t.end),
            start: at
        });
    }
    for (const s of corrections) tokens.push({
        text: s.source,
        pos: s.pos,
        start: s.start,
        end: s.end
    });
    tokens.sort((a, b) => a.start - b.start);
    const changed = corrections.filter(s => s.original.length !== 1 || s.original[0].text !== s.source || s.original[0].pos !== s.pos);
    return {
        tokens: raw.length ? tokens : raw,
        corrections: [ ...boundaryView.corrections, ...changed ],
        matches: [ ...spans, ...require("./hair-state-rules").matches(text, native), ...require("./shared-syntax-matching").matches(text, native), ...require("./shared-argument-matching").matches(text, native) ]
    };
}

function apply(text, output, analysis) {
    const result = [ ...output ], hits = [];
    for (const s of analysis.matches) {
        let at = [ ...text.slice(0, s.start) ].length;
        const old = result.slice(at, at + [ ...s.target ].length).join("");
        result.splice(at, [ ...s.source ].length, ...s.target);
        if (old !== s.target) hits.push({
            ...s,
            before: old
        });
    }
    return {
        text: result.join(""),
        hits: hits
    };
}

module.exports = {
    analyze: analyze,
    apply: apply,
    version: "r19"
};

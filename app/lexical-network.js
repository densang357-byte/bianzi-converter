"use strict";

const data = require("./data/lexical-network-evidence.json");

const manual = require("./data/lexicon-direction-policy.json");

const equivalent = require("../dictionaries/pos-lexicon/resolution_policy.json").word_equivalents;

const hardLex = new Set(require("./data/pos-lexicon.json").directions.s2t.filter(r => [ "manual-pos", "manual-pos-compound", "equivalent-old" ].includes(r.basis)).flatMap(r => r.pos.map(p => r.source + "/" + p)));

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const rowing = require("../dictionaries/semantic-context.json").hua;

const localRelations = require("./network-local-relations");

const admitted = new Set((data.admitted_pairs || []).map(([s, t]) => s + "→" + t));

const normalize = s => [ ...s ].map(c => data.index[c] || c).join("");

const sameSense = (source, a, b) => a === b || source === "只" && "只祇衹".includes(a) && "只祇衹".includes(b);

const trie = new Map;

const fallbacks = new Map((data.fallbacks || []).map(r => [ r.source, r ])), contextTrie = new Map;

for (const group of fallbacks.values()) for (const row of group.clues) {
    let n = contextTrie;
    for (const c of row.key) {
        if (!n.has(c)) n.set(c, new Map);
        n = n.get(c);
    }
    if (!n.rows) n.rows = [];
    n.rows.push({
        ...row,
        source: group.source
    });
}

for (const [key, source, at, target, paragraphs, documents, domains, proof] of data.words) {
    if (!admitted.has(source + "→" + target)) continue;
    let n = trie;
    for (const c of key) {
        if (!n.has(c)) n.set(c, new Map);
        n = n.get(c);
    }
    if (!n.rows) n.rows = [];
    n.rows.push({
        key: key,
        source: source,
        at: at,
        target: target,
        paragraphs: paragraphs,
        documents: documents,
        domains: domains,
        proof: proof
    });
}

function matches(text, tokens, options = {}) {
    if (!tokens.length) return [];
    const normalized = normalize(text);
    if (normalized.length !== text.length) return [];
    const bounds = new Set(tokens.flatMap(t => [ t.start, t.end ])), blocked = new Set(options.protected || []), out = [];
    for (const t of tokens) if (equivalent[t.text] || hardLex.has(t.text + "/" + t.pos)) for (let i = t.start; i < t.end; i++) blocked.add(i);
    for (let a = 0; a < normalized.length; a++) {
        if (!bounds.has(a)) continue;
        let node = trie;
        for (let b = a; b < normalized.length && node.has(normalized[b]); b++) {
            node = node.get(normalized[b]);
            if (!node.rows || !bounds.has(b + 1)) continue;
            const inside = tokens.filter(t => t.start < b + 1 && t.end > a);
            if (inside.some(t => proper.has(t.pos))) continue;
            if (inside.length > 1 && inside.some(t => [ "m", "q" ].includes(t.pos) && t.relation === "ATT" && tokens[t.parent] && !inside.includes(tokens[t.parent]) && /^n/u.test(tokens[t.parent].pos))) continue;
            for (const row of node.rows) {
                const at = a + row.at;
                if (blocked.has(at) || text[at] !== row.source) continue;
                if (options.currentOutput && sameSense(row.source, options.currentOutput[at], row.target)) continue;
                out.push({
                    start: at,
                    end: at + 1,
                    source: text[at],
                    target: row.target,
                    pos: tokens.find(t => t.start <= at && at < t.end)?.pos,
                    kind: "lexical-network-evidence",
                    rule: "cross-source-word-consensus",
                    matchedWord: text.slice(a, b + 1),
                    evidence: {
                        paragraphs: row.paragraphs,
                        documents: row.documents,
                        domains: row.domains,
                        proof: row.proof,
                        version: data.version
                    },
                    reason: "詞網完整詞「" + text.slice(a, b + 1) + "」：" + row.paragraphs + " 段、" + row.documents + " 篇、" + row.domains.length + " 類來源同字位一致；已計入不同斷詞的原字反例，保留原生詞性。"
                });
            }
        }
    }
    const by = new Map;
    for (const m of out) {
        if (!by.has(m.start)) by.set(m.start, []);
        by.get(m.start).push(m);
    }
    return [ ...by.values() ].flatMap(ms => new Set(ms.map(m => m.target)).size === 1 ? [ ms.sort((a, b) => b.matchedWord.length - a.matchedWord.length)[0] ] : []);
}

function apply(before, converted, tokens, options = {}) {
    if (options.enabled === false || options.direction !== "s2t" || options.profile !== "modern" || options.mode !== "context" || !options.useLinguisticCorrections) return {
        text: converted,
        hits: []
    };
    if (before.length !== converted.length) return {
        text: converted,
        hits: []
    };
    const protectedAt = new Set, explicitAt = new Set, offsets = [];
    let at = 0;
    for (const c of before) {
        offsets.push(at);
        at += c.length;
    }
    for (const p of options.protectedPositions || []) if (offsets[p] !== undefined) protectedAt.add(offsets[p]);
    for (const h of options.analysisMatches || []) for (let i = h.start; i < h.end; i++) {
        protectedAt.add(i);
        explicitAt.add(i);
    }
    for (const h of options.specializedHits || []) for (let i = h.start ?? h.offset; i < (h.end ?? (h.start ?? h.offset) + h.source.length); i++) {
        protectedAt.add(i);
        explicitAt.add(i);
    }
    for (const h of options.choices || []) if (h.lexicon && !manual.words[h.lexicon]?.default_only) for (let i = h.offset; i < h.offset + h.source.length; i++) protectedAt.add(i);
    const localProtected = new Set(protectedAt);
    for (const h of options.choices || []) if (h.source === "划" && h.directionalRule && h.decisionBasis === "clause-fallback" && !h.lexicon && !explicitAt.has(h.offset)) localProtected.delete(h.offset);
    for (const t of tokens) if (equivalent[t.text] || hardLex.has(t.text + "/" + t.pos)) for (let i = t.start; i < t.end; i++) localProtected.add(i);
    const localAnalysis = localRelations.analyze(before, tokens, {
        protected: localProtected,
        currentOutput: converted
    });
    const local = localAnalysis.matches.filter(h => converted[h.start] !== h.target);
    const pending = weightedMatches(before, converted, tokens, {
        ...options,
        explicit: explicitAt
    }).filter(h => !local.some(l => l.start === h.start && l.target === h.target)).map(h => ({
        ...h,
        status: "deferred-background-only",
        reason: "共現加權候選缺少同向的局部語義關係，未套用。原研究分數另存。"
    }));
    for (const d of localAnalysis.comparisons) if (!d.accepted && d.scores.filter(s => s.score > 0).length > 1) pending.push({
        start: d.at,
        end: d.at + 1,
        source: d.source,
        status: "deferred-semantic-conflict",
        rule: "conflicting-local-relations",
        evidence: d,
        reason: "同級局部語義關係支持不同候選，保留原判並列待核；未改原生標註。"
    });
    const hits = [ ...matches(before, tokens, {
        protected: protectedAt,
        currentOutput: converted
    }), ...local ], result = converted.split("");
    for (const h of hits) result[h.start] = h.target;
    return {
        text: result.join(""),
        hits: hits,
        pending: pending
    };
}

function weightedMatches(text, current, tokens, options = {}) {
    const pending = (options.choices || []).filter(r => fallbacks.has(r.source) && r.directionalRule && r.decisionBasis === "clause-fallback" && !r.lexicon && !options.explicit?.has(r.offset));
    if (!pending.length) return [];
    const normalized = normalize(text);
    if (normalized.length !== text.length) return [];
    const bounds = new Set(tokens.flatMap(t => [ t.start, t.end ])), clues = [], hits = [];
    for (let a = 0; a < normalized.length; a++) {
        if (!bounds.has(a)) continue;
        let node = contextTrie;
        for (let b = a; b < normalized.length && node.has(normalized[b]); b++) {
            node = node.get(normalized[b]);
            if (node.rows && bounds.has(b + 1)) for (const row of node.rows) clues.push({
                ...row,
                start: a,
                end: b + 1,
                word: text.slice(a, b + 1)
            });
        }
    }
    for (const decision of pending) {
        const at = decision.offset, group = fallbacks.get(decision.source), owner = tokens.find(t => t.start <= at && t.end > at);
        if (!owner || proper.has(owner.pos) || !/^v/u.test(owner.pos) || text[at] !== group.source || !group.targets.includes(current[at])) continue;
        const ranked = group.targets.map(target => {
            const byKey = new Map;
            for (const row of clues) {
                if (row.source !== group.source || row.target !== target || row.start <= at && row.end > at) continue;
                const gap = Math.max(row.start - at - 1, at - row.end, 0);
                if (gap > 40 || /[。！？!?\n]/u.test(text.slice(Math.min(row.end, at + 1), Math.max(row.start, at)))) continue;
                const contribution = row.support / (1 + gap / group.distance_scale), e = {
                    ...row,
                    gap: gap,
                    contribution: contribution
                };
                if (!byKey.has(row.key) || byKey.get(row.key).contribution < contribution) byKey.set(row.key, e);
            }
            const chosen = [ ...byKey.values() ].sort((a, b) => b.contribution - a.contribution).slice(0, group.max_clues);
            const network = chosen.reduce((n, r) => n + r.contribution, 0) / Math.sqrt(Math.max(1, chosen.length));
            return {
                target: target,
                prior: target === current[at] ? group.prior : 0,
                network: network,
                score: (target === current[at] ? group.prior : 0) + group.weight * network,
                clues: chosen
            };
        }).sort((a, b) => b.score - a.score);
        const winner = ranked[0], margin = winner.score - ranked[1].score;
        if (winner.target === current[at] || margin < group.margin) continue;
        if (winner.target === "划" && hasLocalConflict(text, tokens, owner, winner.clues)) continue;
        hits.push({
            start: at,
            end: at + 1,
            source: group.source,
            target: winner.target,
            pos: owner.pos,
            kind: "lexical-network-weight",
            rule: "uncertain-clause-fallback",
            evidence: {
                version: data.version,
                weight: group.weight,
                prior: group.prior,
                margin: margin,
                scores: ranked,
                excludedDomains: data.excluded_domains
            },
            reason: "詞網加權兜底：既有分句規則未找到提示；「" + winner.clues.map(r => r.word).join("、") + "」提供同句40字內證據，以權重 " + group.weight + " 與既有兜底先驗合計，分差 " + margin.toFixed(3) + "；保留原生詞性。"
        });
    }
    return hits;
}

function hasLocalConflict(text, tokens, owner, clues) {
    const oi = tokens.indexOf(owner), attached = tokens.filter(t => t.parent === oi);
    const water = s => [ ...rowing.rowing_objects, ...rowing.watercraft_heads ].some(w => s.includes(w));
    const span = t => {
        const children = tokens.filter(k => k.parent === tokens.indexOf(t) && k.relation === "ATT");
        return text.slice(Math.min(t.start, ...children.map(k => k.start)), t.end);
    };
    if (attached.some(t => t.relation === "CMP" && [ "v", "a" ].includes(t.pos) && !/^(?:向|往|去|来|來|入|出|进|進|回|过|過|起)$/u.test(t.text))) return true;
    const fusedDirection = /^(?:向|往|到|入|进|進|回|去|来|來)/u.test(owner.text.slice(1));
    if (!fusedDirection && attached.some(t => [ "VOB", "FOB" ].includes(t.relation) && /^n/u.test(t.pos) && !water(span(t)))) return true;
    for (const prep of attached.filter(t => t.pos === "p" && [ "用", "以", "把", "将", "將", "在" ].includes(t.text))) {
        const objects = tokens.filter(t => t.parent === tokens.indexOf(prep) && t.relation === "POB");
        for (const object of objects) {
            if (!/^n/u.test(object.pos)) continue;
            const s = span(object);
            if (water(s)) continue;
            if (prep.text === "在" && clues.some(c => c.start >= Math.min(object.start, ...tokens.filter(k => k.parent === tokens.indexOf(object)).map(k => k.start)) && c.end <= object.end)) continue;
            return true;
        }
    }
    return false;
}

module.exports = {
    apply: apply,
    matches: matches,
    weightedMatches: weightedMatches,
    normalize: normalize,
    sameSense: sameSense,
    version: data.version,
    localRelationVersion: localRelations.version,
    wordCount: data.words.length,
    admittedPairs: data.admitted_pairs || [],
    weightedSources: [ ...fallbacks.keys() ],
    automaticBackground: false
};

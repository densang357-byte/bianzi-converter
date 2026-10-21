"use strict";

const fs = require("node:fs"), path = require("node:path");

const excluded = require("./excluded-characters");

const {retainSourceLetters: retainSourceLetters} = require("./source-letter-policy");

const {preferredGlyphs: preferredGlyphs} = require("./lexicon-resolution");

const senseScope = require("./classical-quote-scope");

const extraction = require("./classical-quote-extraction");

const root = path.join(__dirname, "../dictionaries/classical-quotes");

const config = require("../dictionaries/classical-quotes/sources.json");

const dictionary = fs.readFileSync(path.join(path.dirname(require.resolve("opencc/package.json")), "data/dictionary/TSCharacters.txt"), "utf8");

const folds = new Map(dictionary.split("\n").filter(l => l.includes("\t")).map(l => {
    const [s, t] = l.split("\t");
    return [ s, excluded.mapping(s, t.split(" ")[0]) ];
}));

const han = c => !!c && /^\p{Script=Han}$/u.test(c);

const fold = c => excluded.excluded.has(c) ? c : folds.get(c) || c;

const letters = text => [ ...text ].filter(han);

const key = text => letters(text).map(fold).join("");

function sensePositions(text) {
    const result = [];
    let offset = 0;
    for (const character of text) {
        const source = fold(character), rule = senseScope.bySource.get(source);
        const local = rule && extraction.localSense(source, text, offset);
        if (local) result.push({
            offset: offset,
            character: character,
            source: source,
            targets: rule.targets,
            basis: local.basis || rule.basis,
            ...local.sense ? {
                sense: local.sense,
                context: local.context
            } : {}
        });
        offset += character.length;
    }
    return result;
}

function collectionReason(text, unit = {}) {
    if (sensePositions(text).length) return "semantic-position";
    if ((config.retainedSourceSpans || []).some(e => e.book === unit.book && e.sourceSha256 === unit.sourceSha256 && e.original === unit.text && e.quote === text)) return "user-requested-source-span";
    return null;
}

const generated = fs.existsSync(path.join(root, "active.json")) ? JSON.parse(fs.readFileSync(path.join(root, "active.json"), "utf8")) : {
    entries: []
};

function createMatcher(entries) {
    const prefixes = new Map;
    for (const entry of entries) {
        const fromSource = entry.reviewStatus === "source-extracted" && entry.evidence?.some(e => e.sourceSha256 && e.revisionId);
        if (!fromSource && entry.reviewStatus !== "assistant-context-checked" && entry.reviewStatus !== "human-confirmed") throw Error("引文須有原稿來源證據。");
        const chars = letters(entry.target), normalized = key(entry.target);
        if (chars.length < 4 || normalized !== entry.source || chars.length > 100) throw Error("引文須為4–100字且與索引一致。");
        if (!sensePositions(entry.target).length) continue;
        const prefix = [ ...normalized ].slice(0, 4).join(""), bucket = prefixes.get(prefix) || [];
        if (bucket.some(e => e.source === entry.source && e.target !== entry.target)) throw Error("引文簡體鍵衝突，須依來源區分。");
        bucket.push({
            ...entry,
            length: chars.length,
            contextRequirement: extraction.contextRequirement(entry.quote || entry.target),
            semanticOffsets: new Set(sensePositions(entry.target).map(p => p.offset))
        });
        prefixes.set(prefix, bucket);
    }
    function apply(before, converted, protectedHits = [], options = {}) {
        const input = [ ...before ], output = [ ...converted ];
        if (input.length !== output.length) throw Error("古籍引文無法按原文對齊。");
        const runs = [];
        let run = [], offset = 0;
        for (let i = 0; i < input.length; i++) {
            const c = input[i], searched = options.matchConverted ? output[i] : c;
            if (han(c) && han(searched)) run.push({
                c: c,
                key: fold(searched),
                index: i,
                offset: offset
            }); else if (!/[\s，,、；;：:]/u.test(c)) {
                if (run.length) runs.push(run);
                run = [];
            }
            offset += c.length;
        }
        if (run.length) runs.push(run);
        const candidates = [];
        for (const units of runs) for (let start = 0; start < units.length; start++) {
            const prefix = units.slice(start, start + 4).map(u => u.key).join("");
            for (const entry of prefixes.get(prefix) || []) {
                const end = start + entry.length - 1;
                if (end >= units.length || units.slice(start, end + 1).map(u => u.key).join("") !== entry.source) continue;
                const first = units[start], last = units[end], a = first.index, b = last.index + 1;
                if (protectedHits.some(h => h.offset < last.offset + last.c.length && h.offset + h.source.length > first.offset)) continue;
                if (han(input[a - 1]) || han(input[b])) continue;
                const prefix = input.slice(Math.max(0, a - 60), a).join(""), suffix = input.slice(b, b + 6).join("");
                const quoted = /[「『“"]\s*$/u.test(prefix) && /^[\s，,。！？!?；;]*[」』”"]/u.test(suffix);
                const cited = (entry.citationNames || [ entry.bookTitle ]).some(name => prefix.includes("《" + name + "》")) && /(?:曰|云|有言|寫道|写道|說|说|道|記|记)[：:\s「『“"]*$/u.test(prefix);
                const length = end - start + 1;
                if (entry.contextRequirement && !quoted && !cited) continue;
                const targets = letters(entry.target);
                if (units.slice(start, end + 1).some((u, i) => u.c !== u.key && u.c !== targets[i])) continue;
                candidates.push({
                    entry: entry,
                    units: units.slice(start, end + 1),
                    quoted: quoted,
                    cited: cited,
                    length: length
                });
            }
        }
        candidates.sort((a, b) => b.length - a.length || a.units[0].index - b.units[0].index);
        const claimed = new Set, hits = [];
        for (const match of candidates) {
            if (match.units.some(u => claimed.has(u.index))) continue;
            const target = letters(match.entry.target), start = match.units[0].offset, last = match.units.at(-1);
            const changed = [];
            let targetOffset = 0;
            match.units.forEach((u, i) => {
                const localOffset = targetOffset;
                targetOffset += target[i].length;
                claimed.add(u.index);
                if (options.semanticOnly && !match.entry.semanticOffsets.has(localOffset)) return;
                if (u.c === "修" && !match.entry.semanticOffsets.has(localOffset)) return;
                let chosen = preferredGlyphs(retainSourceLetters(u.c, excluded.mapping(u.c, target[i])));
                if (u.c === "象") chosen = "象";
                if (output[u.index] !== chosen) {
                    changed.push({
                        offset: u.offset,
                        source: u.c,
                        before: output[u.index],
                        target: chosen
                    });
                    output[u.index] = chosen;
                }
            });
            hits.push({
                source: before.slice(start, last.offset + last.c.length),
                target: output.slice(match.units[0].index, last.index + 1).join(""),
                offset: start,
                end: last.offset + last.c.length,
                category: "古籍固定引文",
                layer: "classical-quotes",
                entryId: match.entry.id,
                book: match.entry.bookTitle,
                evidence: match.entry.evidence,
                reviewStatus: match.entry.reviewStatus,
                fullyHumanReviewed: false,
                gate: match.cited ? "source-citation" : match.quoted ? "explicit-quotation" : "complete-long-span",
                reason: "依已保存的傳統字白文引文句段選字；不改原生分詞／詞性，既有繁體字不跨異文改寫。",
                changes: changed
            });
        }
        return {
            text: output.join(""),
            hits: hits.sort((a, b) => a.offset - b.offset)
        };
    }
    return {
        apply: apply
    };
}

const eligibleEntries = generated.entries.filter(e => sensePositions(e.target).length);

const matcher = createMatcher(eligibleEntries);

let quoteCache, quarantineCache;

function catalogue(options = {}) {
    const summary = JSON.parse(fs.readFileSync(path.join(root, "build-report.json"), "utf8"));
    if (!quoteCache) quoteCache = generated.entries;
    const query = String(options.query || "").slice(0, 100), qkey = key(query), qletters = letters(query).join(""), book = options.book || "", status = options.status || "";
    const searchFoldedKey = ![ ...query ].some(c => fold(c) !== c);
    if (status === "quarantine" && !quarantineCache) {
        const reasons = {
            "suspected-modern-simplified": "原稿疑似混入現代簡體",
            "unresolved-markup-or-display-conversion": "白文標記或網站繁簡顯示規則未解",
            "non-white-text-or-damaged-glyph": "疑似非白文或殘損字",
            "source-catalogue-marked-lost": "來源目錄已標明闕佚"
        };
        quarantineCache = fs.readFileSync(path.join(root, "sentence-quarantine.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).map(r => ({
            id: r.id,
            book: r.book,
            bookTitle: r.bookTitle || config.sources.find(b => b.id === r.book)?.title,
            source: key(r.text || ""),
            target: r.text || r.title,
            enabled: false,
            reviewStatus: "quarantined",
            reason: (r.reasons || [ r.reason ]).map(x => reasons[x] || x).join("；") + (r.simplifiedSignals?.length ? "（" + r.simplifiedSignals.join("、") + "）" : ""),
            evidence: [ {
                original: r.text || "（來源目錄項，無可匯入白文）",
                page: r.page || r.title,
                revisionId: r.revisionId,
                sourceSha256: r.sourceSha256,
                block: r.block,
                sentence: r.sentence,
                url: r.sourceUrl || "https://zh.wikisource.org/wiki/" + encodeURIComponent(r.page || r.title)
            } ]
        }));
    }
    let rows = status === "quarantine" ? quarantineCache : quoteCache;
    rows = rows.filter(e => (!book || e.book === book) && (!query || (e.quote || e.target).includes(query) || qletters && e.target.includes(qletters) || e.source.includes(query) || searchFoldedKey && qkey && e.source.includes(qkey)));
    const page = Math.max(1, Math.min(1e5, Number(options.page) || 1)), size = 40;
    return {
        version: config.version,
        fullyHumanReviewed: false,
        summary: summary,
        books: summary.books,
        total: rows.length,
        page: page,
        pageSize: size,
        entries: rows.slice((page - 1) * size, page * size),
        recommendations: config.recommendations
    };
}

module.exports = {
    ...matcher,
    key: key,
    fold: fold,
    letters: letters,
    sensePositions: sensePositions,
    senseScope: senseScope,
    collectionReason: collectionReason,
    extractQuoteSpans: extraction.extractQuoteSpans,
    createMatcher: createMatcher,
    catalogue: catalogue,
    version: config.version,
    count: eligibleEntries.length
};

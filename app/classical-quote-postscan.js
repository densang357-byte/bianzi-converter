"use strict";

const quotes = require("./classical-quotes");

const replacements = require("./public/replacements");

const crypto = require("node:crypto");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");

const version = "2026-10-18-final-quotation-pass-v1";

function seal(plan) {
    const payload = {
        ...plan,
        libraryVersion: quotes.version
    };
    return {
        ...payload,
        planVersion: version,
        planSha256: hash(JSON.stringify(payload))
    };
}

function validate(plan) {
    if (!plan || plan.planVersion !== version || plan.libraryVersion !== quotes.version || typeof plan.planSha256 !== "string") throw Error("古籍掃描計畫版本不符，須重新轉換。");
    const {planVersion: planVersion, planSha256: planSha256, ...payload} = plan;
    if (hash(JSON.stringify(payload)) !== planSha256) throw Error("古籍掃描計畫已變更，須重新轉換。");
    let nodes = 0, characters = 0;
    function visit(node, depth) {
        if (!node || depth > 16 || ++nodes > 3e4) throw Error("古籍掃描計畫結構無效。");
        if (node.kind === "sentence") {
            if (typeof node.before !== "string" || typeof node.converted !== "string" || [ ...node.before ].length !== [ ...node.converted ].length) throw Error("古籍掃描文字無法與來源對齊。");
            characters += node.before.length;
            if (!Array.isArray(node.tokens) || !Array.isArray(node.protectedHits)) throw Error("古籍掃描缺少保護位置。");
        } else if (node.kind === "group") {
            if (!Array.isArray(node.children)) throw Error("古籍掃描缺少段落計畫。");
            node.children.forEach(c => visit(c, depth + 1));
        } else if (node.kind === "pipeline") {
            if (typeof node.before !== "string" || !Array.isArray(node.spans)) throw Error("古籍掃描缺少取代流程。");
            replacements.validate(node.replacements);
            node.spans.forEach(c => visit(c, depth + 1));
        } else if (node.kind === "protected") {
            if (typeof node.text !== "string") throw Error("古籍掃描保護文字無效。");
        } else throw Error("古籍掃描計畫類型無效。");
    }
    visit(payload, 0);
    if (characters > 25e4) throw Error("單個古籍掃描計畫過大。");
    return payload;
}

function execute(plan, {custom: custom, applyCustom: applyCustom, difference: difference}) {
    const root = validate(plan);
    let scannedSentences = 0;
    function patch(before, after, hits, custom) {
        return {
            after: after,
            changed: before !== after,
            classicalQuoteHits: hits,
            custom: custom,
            diff: difference(before, after).map(({value: value, added: added, removed: removed}) => ({
                value: value,
                added: !!added,
                removed: !!removed
            }))
        };
    }
    function visit(node, path) {
        if (node.kind === "protected") return {
            text: node.text,
            initialText: node.text,
            patches: [],
            hits: [],
            custom: []
        };
        if (node.kind === "sentence") {
            scannedSentences++;
            const found = quotes.apply(node.before, node.converted, node.protectedHits, {
                semanticOnly: true,
                matchConverted: true
            });
            const initialText = applyCustom(node.before, node.converted, custom, node.tokens).output;
            const final = applyCustom(node.before, found.text, custom, node.tokens), text = final.output;
            const hits = found.hits.map(h => ({
                ...h,
                phase: "post-conversion",
                matchOn: "converted-text",
                preparedPath: path,
                offsetSpace: "prepared-source-sentence",
                sourceSentence: node.before
            }));
            return {
                text: text,
                initialText: initialText,
                patches: [ patch(node.before, text, hits, final.hits) ],
                hits: hits,
                custom: final.hits
            };
        }
        if (node.kind === "group") {
            const children = node.children.map((c, i) => visit(c, path + "/children/" + i));
            return {
                text: children.map(c => c.text).join(""),
                initialText: children.map(c => c.initialText).join(""),
                patches: children.flatMap(c => c.patches),
                hits: children.flatMap(c => c.hits),
                custom: children.flatMap(c => c.custom)
            };
        }
        const config = replacements.validate(node.replacements), post = replacements.rules(config.post);
        const spans = node.spans.map((c, i) => {
            const r = visit(c, path + "/spans/" + i);
            if (c.kind === "protected") return r;
            const replaced = replacements.replace(r.text, post, "post");
            return {
                ...r,
                text: replaced.text,
                initialText: replacements.replace(r.initialText, post, "post").text,
                custom: [ ...r.custom.map(h => ({
                    ...h,
                    phase: "dictionary",
                    count: 1
                })), ...replaced.hits ]
            };
        });
        const text = spans.map(c => c.text).join(""), initialText = spans.map(c => c.initialText).join(""), hits = spans.flatMap(c => c.hits);
        const customHits = [ ...node.setupHits || [], ...spans.flatMap(c => c.custom) ];
        return {
            text: text,
            initialText: initialText,
            patches: [ patch(node.before, text, hits, customHits) ],
            hits: hits,
            custom: customHits
        };
    }
    const result = visit(root, "#");
    return {
        ...result,
        stats: {
            phase: "post-conversion",
            version: version,
            scanned_sentences: scannedSentences,
            hits: result.hits.length,
            corrections: result.hits.reduce((n, h) => n + h.changes.length, 0),
            changed: result.text !== result.initialText
        }
    };
}

module.exports = {
    version: version,
    seal: seal,
    validate: validate,
    execute: execute
};

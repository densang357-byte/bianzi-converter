"use strict";

const data = require("../dictionaries/specialized-terms.json");

const entries = data.entries.slice().sort((a, b) => b.source.length - a.source.length);

const segmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

function apply(before, converted, tokens = []) {
    if ([ ...before ].length !== [ ...converted ].length) throw new Error("專門語詞庫無法按原文對齊。");
    const result = [ ...converted ], claimed = new Set, hits = [];
    const units = tokens.length ? tokens : [ ...segmenter.segment(before) ].map(t => ({
        start: t.index,
        end: t.index + t.segment.length
    }));
    const boundaries = new Set(units.flatMap(t => [ t.start, t.end ]));
    for (const entry of entries) for (let start = before.indexOf(entry.source); start !== -1; start = before.indexOf(entry.source, start + entry.source.length)) {
        const end = start + entry.source.length;
        if (entry.word_boundaries && (!boundaries.has(start) || !boundaries.has(end))) continue;
        const position = [ ...before.slice(0, start) ].length, target = [ ...entry.target ];
        if ([ ...entry.source ].some((_, i) => claimed.has(position + i))) continue;
        target.forEach((character, i) => {
            result[position + i] = character;
            claimed.add(position + i);
        });
        hits.push({
            source: entry.source,
            target: entry.target,
            offset: start,
            category: entry.category,
            reason: entry.note
        });
    }
    return {
        text: result.join(""),
        hits: hits
    };
}

module.exports = {
    apply: apply,
    version: data.version,
    count: entries.length
};

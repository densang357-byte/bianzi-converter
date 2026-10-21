"use strict";

const han = c => /^\p{Script=Han}$/u.test(c);

const hanCount = text => [ ...text ].filter(han).length;

const standaloneClauseLength = 4;

const xiuAuthority = [ {
    url: "https://dict.variants.moe.edu.tw/dictView.jsp?ID=1576&q=1",
    title: "教育部異體字字典：脩為修的異體，經史通用"
}, {
    url: "https://dict.variants.moe.edu.tw/dictView.jsp?ID=36119&q=1",
    title: "教育部異體字字典：脩的乾肉、束脩、乾枯等義"
} ];

const xiuContexts = [ {
    sense: "乾肉／束脩",
    patterns: [ /束[修脩]|[腶段脯牛鹿羊肉][修脩]|[修脩]脯/gu, /脯、[修脩]、棗/gu, /書、?[修脩]、?苞苴/gu, /陳酒執[修脩]以將命/gu ]
}, {
    sense: "乾枯",
    patterns: [ /暵其[修脩]|熱則[修脩]/gu ]
}, {
    sense: "掃除祖廟",
    patterns: [ /春秋[修脩]其祖廟/gu ]
}, {
    sense: "姓名用字",
    patterns: [ /(?:歐陽|欧阳)[修脩]|[修脩]炳/gu ]
} ];

function localSense(source, text, offset) {
    if (source !== "修") return {
        basis: null
    };
    for (const rule of xiuContexts) for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            if (offset >= match.index && offset < match.index + match[0].length && /[修脩]/u.test(text[offset])) return {
                basis: "local-xiu-sense",
                sense: rule.sense,
                context: match[0]
            };
        }
    }
    return null;
}

const edge = /[\s「」『』“”"‘’'。，,；;：:！？!?]/u;

function trimRange(text, start, end) {
    while (start < end && edge.test(text[start])) start++;
    while (end > start && edge.test(text[end - 1])) end--;
    return {
        start: start,
        end: end
    };
}

function trimIntroduction(text, start, end) {
    let range = trimRange(text, start, end), value = text.slice(range.start, range.end);
    let intro = /^[\p{Script=Han}《》〈〉]{0,20}(?:曰|云|言|說|说|道|問|问)[「『“"]/u.exec(value);
    if (!intro) intro = /^(?:(?:是故|故又|故|又|子|孔子|孟子|荀子|君子|詩|書|易|傳|諺)?曰)[「『“"]?/u.exec(value);
    if (intro) range = trimRange(text, range.start + intro[0].length, range.end);
    return range;
}

const commonContextPatterns = [ /^(?:千[里裏裡]之外|鍥而不[舍捨]|如此而已|不過如此|不知所[云雲]|由是觀之|以此言之|可想而知|不得而知|無所不至|無所不能|不言而喻|一言以蔽之|是故君子|是以君子|不可不知|不可不察)$/u ];

const functionCharacters = new Set("之一其而以於于為爲是故亦乃則者也矣焉乎哉所不未無毋勿可何有自與及或因如若且遂此彼然吾我汝爾予");

function contextRequirement(text) {
    const chars = [ ...text ].filter(han), plain = chars.join("");
    if (chars.length < standaloneClauseLength) return "fewer-than-four-characters";
    if (commonContextPatterns.some(p => p.test(plain))) return "common-in-other-contexts";
    if (chars.length <= 6 && chars.filter(c => !functionCharacters.has(c)).length < 2) return "mostly-function-words";
    return null;
}

function extractQuoteSpans(text, hasSense = () => true) {
    const clauses = [], excluded = [];
    let group = 0, previousEnd = 0;
    for (const match of text.matchAll(/[^，,；;：:。！？!?\n]+/gu)) {
        const rawStart = match.index, rawEnd = rawStart + match[0].length;
        if (/[；;。！？!?\n]/u.test(text.slice(previousEnd, rawStart))) group++;
        previousEnd = rawEnd;
        const {start: start, end: end} = trimIntroduction(text, rawStart, rawEnd);
        const value = text.slice(start, end), colon = /[：:]/u.test(text[rawEnd] || ""), hangingQuote = /[「『“"]\s*$/u.test(match[0]);
        const cue = (colon || hangingQuote) && /(?:曰|云|言|說|说|道|問|问)$/u.test(value) || /^(?:故曰|是故曰|子曰|詩曰|詩云|書曰|易曰|傳曰|諺曰|易經|彖曰|象曰|文言曰)$/u.test(value);
        if (!value || !hanCount(value) || cue) {
            excluded.push({
                start: rawStart,
                end: rawEnd,
                reason: "empty-or-reporting-cue"
            });
            group++;
            continue;
        }
        clauses.push({
            start: start,
            end: end,
            count: hanCount(value),
            group: group
        });
    }
    const spans = [];
    function add(start, end) {
        const range = trimRange(text, start, end), quote = text.slice(range.start, range.end);
        if (hanCount(quote) < standaloneClauseLength) {
            excluded.push({
                ...range,
                reason: "insufficient-context"
            });
            return;
        }
        if (hasSense(quote)) spans.push({
            ...range,
            text: quote
        });
    }
    const groups = [ ...new Set(clauses.map(c => c.group)) ].map(id => clauses.filter(c => c.group === id));
    const causal = groups.filter(g => g.length === 2 && /^一(?:家|人)\p{Script=Han}{1,4}$/u.test(text.slice(g[0].start, g[0].end)) && /^一國\p{Script=Han}{2,5}$/u.test(text.slice(g[1].start, g[1].end)));
    const causalIds = new Set(causal.length >= 2 ? causal.map(g => g[0].group) : []);
    for (const g of groups) {
        if (causalIds.has(g[0].group)) {
            add(g[0].start, g.at(-1).end);
            continue;
        }
        for (let i = 0; i < g.length; i++) {
            const clause = g[i], value = text.slice(clause.start, clause.end);
            if (!contextRequirement(value)) {
                add(clause.start, clause.end);
                continue;
            }
            if (!hasSense(value)) continue;
            let best = null;
            for (let left = i; left >= 0; left--) for (let right = i; right < g.length; right++) {
                if (left === i && right === i) continue;
                const start = g[left].start, end = g[right].end, quote = text.slice(start, end), count = hanCount(quote);
                if (contextRequirement(quote)) continue;
                const width = right - left;
                if (!best || count < best.count || count === best.count && width < best.width || count === best.count && width === best.width && start < best.start) best = {
                    start: start,
                    end: end,
                    count: count,
                    width: width
                };
                break;
            }
            if (best) add(best.start, best.end); else excluded.push({
                start: clause.start,
                end: clause.end,
                reason: "insufficient-context",
                contextReason: contextRequirement(value)
            });
        }
    }
    const unique = [ ...new Map(spans.map(s => [ s.start + ":" + s.end, s ])).values() ].sort((a, b) => a.start - b.start || a.end - b.end);
    return {
        spans: unique,
        excluded: excluded
    };
}

module.exports = {
    extractQuoteSpans: extractQuoteSpans,
    localSense: localSense,
    contextRequirement: contextRequirement,
    standaloneClauseLength: standaloneClauseLength,
    xiuAuthority: xiuAuthority,
    version: "2026-10-17-four-character-clauses-v1"
};

"use strict";

const data = require("./data/review-risk-frequency.json");

const watch = new Map(data.watchWords.map(r => [ r.source, r ]));

function frequency(source) {
    return watch.get(source) || data.existingWords[source] || data.characters[source] || null;
}

const priority = f => f.reviewEvidence?.assistantReviewedErrors ?? f.errors ?? 0;

function compare(a, b) {
    const x = a.frequency || a, y = b.frequency || b;
    return priority(y) - priority(x) || (y.errorBooks || 0) - (x.errorBooks || 0) || (y.opportunities || 0) - (x.opportunities || 0);
}

function forForms(forms) {
    return forms.map(frequency).filter(Boolean).sort(compare)[0] || null;
}

function describe(f) {
    if (f?.reviewEvidence) return `本輪助理覆核 ${f.reviewEvidence.assistantReviewedErrors} 處錯誤、${f.reviewEvidence.assistantReviewedKeeps} 處正確保留；非全量抽樣，不計準確率。`;
    if (f?.legacyClassificationNote) return f.legacyClassificationNote;
    return !f || !f.opportunities ? "樣本未覆蓋，不代表安全。" : `既有樣本 ${f.errors}/${f.opportunities} 詞例轉錯，${f.errorBooks} 部作品；${f.opportunities < 5 ? "小樣本，僅供優先覆核。" : "僅代表本次樣本。"}`;
}

function decorateCatalogue(entries) {
    const result = entries.map(e => ({
        ...e,
        frequency: forForms([ e.source, ...e.activeTargets ])
    }));
    const bySource = new Map(result.filter(e => e.type === "risk-word").map(e => [ e.source, e ]));
    for (const row of data.watchWords) {
        const entry = bySource.get(row.source);
        if (entry) {
            entry.activeTargets = [ ...new Set([ ...entry.activeTargets, ...row.activeTargets ]) ];
            entry.matchForms = [ ...new Set([ ...entry.matchForms || [], ...row.matchForms ]) ];
            entry.frequency = row;
            entry.reason = row.reason;
            entry.reviewOnly = true;
            entry.riskKind = row.riskKind;
            entry.matchBoundary = row.matchBoundary;
            entry.excludeBeforePattern = row.excludeBeforePattern;
        } else result.push({
            source: row.source,
            activeTargets: row.activeTargets,
            matchForms: row.matchForms,
            type: "risk-word",
            reviewClass: "risk",
            risk: true,
            byPos: {},
            defaultsByPos: {},
            frequency: row,
            reason: row.reason,
            reviewOnly: true,
            riskKind: row.riskKind,
            matchBoundary: row.matchBoundary,
            excludeBeforePattern: row.excludeBeforePattern
        });
    }
    return result;
}

function risks(text, tokens, direction, existing = []) {
    if (direction !== "s2t") return existing;
    const result = existing.map(r => ({
        ...r,
        frequency: frequency(r.source)
    }));
    const seen = new Set(result.map(r => r.offset + "|" + r.source));
    const boundaries = new Set(tokens.flatMap(t => [ t.start, t.end ]));
    if (!tokens.length) for (const t of new Intl.Segmenter("zh", {
        granularity: "word"
    }).segment(text)) {
        boundaries.add(t.index);
        boundaries.add(t.index + t.segment.length);
    }
    for (const row of data.watchWords) {
        for (const form of new Set(row.matchForms || [ row.source ])) for (let at = text.indexOf(form); at >= 0; at = text.indexOf(form, at + form.length)) {
            if (row.excludeBeforePattern && new RegExp(row.excludeBeforePattern, "u").test(text.slice(0, at))) continue;
            if (row.matchBoundary === "word" && (!boundaries.has(at) || !boundaries.has(at + form.length))) continue;
            if (row.matchBoundary === "person-name" && !tokens.some(t => t.start <= at && t.end >= at + form.length && text.slice(t.start, t.end) === t.text && /^(?:nh|nr|nr1|nr2|nrj|nrf|PER|PERSON)$/u.test(t.pos))) continue;
            const key = at + "|" + form;
            const metadata = {
                frequency: row,
                reviewOnly: true,
                watchSource: row.source,
                riskKind: row.riskKind,
                reason: row.reason + " " + describe(row)
            };
            if (seen.has(key)) {
                Object.assign(result.find(r => r.offset === at && r.source === form), metadata);
                continue;
            }
            seen.add(key);
            const native = tokens.filter(t => t.start < at + form.length && t.end > at);
            result.push({
                source: form,
                pos: native.map(t => t.pos).join("+") || "未分析",
                offset: at,
                candidates: row.activeTargets,
                ...metadata
            });
        }
    }
    return result.sort((a, b) => compare(a, b) || a.offset - b.offset || a.source.localeCompare(b.source));
}

module.exports = {
    frequency: frequency,
    forForms: forForms,
    describe: describe,
    compare: compare,
    decorateCatalogue: decorateCatalogue,
    risks: risks,
    version: data.version
};

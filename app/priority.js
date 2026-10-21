"use strict";

const metadata = require("./data/ambiguity-priority.json");

const priorityBySource = new Map(metadata.entries.map(entry => [ entry.source, entry ]));

function rankCharacters(entries) {
    return entries.map(entry => {
        const info = priorityBySource.get(entry.source);
        return {
            ...entry,
            rank: info?.rank ?? null,
            priority: info?.priority ?? 3,
            priorityLabel: info?.priorityLabel ?? "待核對",
            reason: info?.reason ?? "此字條尚未完成資料核對。",
            branches: info?.branches ?? [],
            subcategories: info?.subcategories ?? [],
            frequencyScore: info?.frequencyScore ?? null
        };
    }).sort((a, b) => a.priority - b.priority || (b.frequencyScore ?? -1) - (a.frequencyScore ?? -1) || a.source.codePointAt(0) - b.source.codePointAt(0));
}

function characterCatalogue(profile = "modern", variants = []) {
    const {getDictionaries: getDictionaries, profileCandidates: profileCandidates, getProfile: getProfile} = require("./profiles");
    const {candidatesFor: candidatesFor, validateVariants: validateVariants} = require("./standard");
    getProfile(profile);
    validateVariants(variants);
    const entries = [ ...getDictionaries(profile).characters ].map(([source, raw]) => {
        const activeTargets = profile === "modern" ? candidatesFor(source, raw, variants) : profileCandidates(profile, source, raw);
        return {
            source: source,
            activeTargets: activeTargets
        };
    }).filter(entry => entry.activeTargets.length > 1);
    return rankCharacters(entries).map(entry => {
        const branches = entry.branches.filter(branch => entry.activeTargets.includes(branch.target));
        return {
            ...entry,
            branches: branches,
            subcategories: [ ...new Set(branches.map(branch => branch.subcategory).filter(Boolean)) ]
        };
    });
}

module.exports = {
    rankCharacters: rankCharacters,
    metadata: metadata,
    characterCatalogue: characterCatalogue
};

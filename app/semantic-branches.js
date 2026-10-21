"use strict";

const reference = require("./data/semantic-character-branches.json");

const glyphStandard = require("./data/lexicon-glyph-standard.json");

const directionPolicy = require("./data/lexicon-direction-policy.json");

const standardGlyphs = word => Array.from(word, ch => glyphStandard.mapping[ch] || ch).join("");

const entries = new Map(reference.entries.map(entry => [ entry.source, entry ]));

function semanticCandidates(source, inherited) {
    const excluded = require("./excluded-characters");
    if (excluded.excluded.has(source)) return [ source ];
    if (directionPolicy.characters[source]?.targets) return excluded.candidates(source, directionPolicy.characters[source].targets);
    const targets = inherited === undefined ? require("./profiles").getDictionaries("modern").characters.get(source) || [ source ] : inherited;
    return excluded.candidates(source, [ ...new Set([ ...targets, ...entries.get(source)?.targets || [] ].map(standardGlyphs)) ]);
}

function semanticCatalogue() {
    const characters = require("./profiles").getDictionaries("modern").characters;
    const sources = new Set([ ...characters.keys(), ...entries.keys() ]);
    return [ ...sources ].map(source => ({
        source: source,
        targets: semanticCandidates(source),
        reference: entries.get(source) || null,
        project_policy: directionPolicy.characters[source] || null,
        usage: "sense_and_word_boundary_review_required"
    })).filter(entry => entry.targets.length > 1);
}

module.exports = {
    reference: reference,
    directionPolicy: directionPolicy,
    semanticCandidates: semanticCandidates,
    semanticCatalogue: semanticCatalogue
};

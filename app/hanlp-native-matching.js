"use strict";

const relations = {
    root: "HED",
    nsubj: "SBV",
    csubj: "SBV",
    dobj: "VOB",
    obj: "VOB",
    iobj: "IOB",
    pobj: "POB",
    conj: "COO",
    nmod: "ATT",
    amod: "ATT",
    nummod: "ATT",
    det: "ATT",
    compound: "ATT",
    nn: "ATT",
    advmod: "ADV",
    neg: "ADV",
    asp: "RAD",
    punct: "WP",
    case: "RAD",
    mark: "RAD",
    cc: "LAD"
};

function project(tokens) {
    return tokens.map(t => ({
        ...structuredClone(t),
        native_relation: t.relation,
        relation: relations[t.relation] || t.relation,
        matchingSyntaxSource: "HanLP-native-label-compatibility-v1"
    }));
}

module.exports = {
    project: project
};

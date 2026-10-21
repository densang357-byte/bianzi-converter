"use strict";

const policy = require("./data/word-boundary-policy.json");

const omit = new Set(policy.omitSources);

function targets(source, values) {
    if (omit.has(source)) return [];
    return policy.lexicalTargets[source]?.slice() || values;
}

module.exports = {
    targets: targets,
    version: policy.version
};

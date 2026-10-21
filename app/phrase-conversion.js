"use strict";

const {getDictionaries: getDictionaries} = require("./profiles");

const tries = new Map;

function trieFor(profile) {
    if (!tries.has(profile)) {
        const root = new Map;
        for (const [source, targets] of getDictionaries(profile).phrases) {
            const width = Array.from(source).length;
            if (targets.some(target => Array.from(target).length !== width)) continue;
            let node = root;
            for (const character of source) {
                if (!node.has(character)) node.set(character, new Map);
                node = node.get(character);
            }
            node.targets = targets.map(target => Array.from(target));
        }
        tries.set(profile, root);
    }
    return tries.get(profile);
}

function phraseConversion(text, profile, tokens = []) {
    const chars = Array.from(text), offsets = [ 0 ], target = [], resolved = new Set;
    for (const char of chars) offsets.push(offsets.at(-1) + char.length);
    const boundaries = new Set(tokens.flatMap(token => [ token.start, token.end ]));
    const owners = new Map;
    for (const token of tokens) for (let at = token.start; at < token.end; at++) owners.set(at, token);
    const proper = new Set([ "nh", "nhf", "nhs" ]);
    const collectiveStarts = new Set(require("./collective-gan").matches(text, tokens).map(h => h.start - 1));
    const fits = (start, end, targets) => {
        if (text.slice(start, end) === "一干") return collectiveStarts.has(start);
        if (!tokens.length) return true;
        if (boundaries.has(start) && boundaries.has(end)) return true;
        const owner = owners.get(start);
        if (!owner || owner !== owners.get(end - 1)) return false;
        if (!proper.has(owner.pos)) return true;
        if (start === owner.start) return true;
        const source = [ ...text.slice(start, end) ];
        return source.every((c, i) => (dictionary.get(c)?.length || 0) <= 1 || targets[0][i] === c);
    };
    const trie = trieFor(profile), dictionary = getDictionaries(profile).characters;
    for (let start = 0; start < chars.length; ) {
        let node = trie, longest = start, targets;
        for (let end = start; end < chars.length && node.has(chars[end]); end++) {
            node = node.get(chars[end]);
            if (node.targets && fits(offsets[start], offsets[end + 1], node.targets)) {
                longest = end + 1;
                targets = node.targets;
            }
        }
        if (targets) {
            target.push(...targets[0]);
            for (let i = start; i < longest; i++) if (new Set(targets.map(value => value[i - start])).size === 1) resolved.add(i);
            start = longest;
        } else {
            target.push(dictionary.get(chars[start])?.[0] || chars[start]);
            start++;
        }
    }
    return {
        text: target.join(""),
        resolved: resolved
    };
}

module.exports = {
    phraseConversion: phraseConversion
};

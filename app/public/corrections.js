(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("diff")); else root.BianziCorrections = factory(root.Diff);
})(typeof globalThis === "object" ? globalThis : this, function(Diff) {
    "use strict";
    const {diffChars: diffChars} = Diff;
    function diff(before, after) {
        return diffChars(before, after, {
            timeout: 100
        }) || [ {
            value: before,
            removed: true
        }, {
            value: after,
            added: true
        } ];
    }
    function extract(before, after) {
        const entries = [];
        let offset = 0, pending = null;
        const flush = () => {
            if (!pending) return;
            pending.context = Array.from(before.slice(0, pending.offset)).slice(-12).join("") + "【" + pending.source + "】" + Array.from(before.slice(pending.offset + pending.source.length)).slice(0, 12).join("");
            entries.push(pending);
            pending = null;
        };
        for (const part of diff(before, after)) {
            if (!part.added && !part.removed) {
                flush();
                offset += part.value.length;
                continue;
            }
            pending ||= {
                source: "",
                target: "",
                offset: offset
            };
            if (part.removed) {
                pending.source += part.value;
                offset += part.value.length;
            } else pending.target += part.value;
        }
        flush();
        return entries;
    }
    function review(sentences, edited) {
        if (!sentences.length) return [];
        const outputs = sentences.map(() => "");
        let index = 0, used = 0;
        const advance = () => {
            while (index < sentences.length - 1 && used === sentences[index].after.length) {
                index++;
                used = 0;
            }
        };
        for (const part of diff(sentences.map(sentence => sentence.after).join(""), edited)) {
            advance();
            if (part.added) {
                outputs[index] += part.value;
                continue;
            }
            let position = 0;
            while (position < part.value.length) {
                advance();
                const length = Math.min(part.value.length - position, sentences[index].after.length - used);
                if (!part.removed) outputs[index] += part.value.slice(position, position + length);
                position += length;
                used += length;
            }
        }
        return sentences.map((sentence, i) => ({
            ...sentence,
            after: outputs[i],
            manuallyEdited: sentence.after !== outputs[i],
            changed: sentence.before !== outputs[i],
            diff: diff(sentence.before, outputs[i])
        }));
    }
    function updateCollection(existing, session, before, after, direction, excluded = new Set) {
        const entries = extract(before, after).map(entry => ({
            ...entry,
            id: JSON.stringify([ session, entry.offset, entry.source, entry.target ]),
            session: session,
            direction: direction,
            enabled: false,
            kind: "correction"
        })).filter(entry => !excluded.has(entry.id));
        return existing.filter(entry => entry.session !== session).concat(entries);
    }
    return {
        diff: diff,
        extract: extract,
        review: review,
        updateCollection: updateCollection
    };
});

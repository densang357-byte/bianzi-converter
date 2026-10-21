"use strict";

const version = "tai-policy-20261018-v2";

const authority = "https://dict.variants.moe.edu.tw/dictView.jsp?ID=-17044";

function chiOffsets(text) {
    const result = new Set;
    const head = /抬[」』”"']?\s*(?:[（(]\s*(?:chī|chi1|ㄔ)[）)]|[，,:：]?\s*(?:字)?(?:的)?(?:(?:在這[裏裡里])?(?:讀|读|唸|念)(?:音)?(?:作|為|为|是)?|音)\s*[「『"']?(?:chī|chi1|ㄔ)|[，,:：]?\s*(?:字)?\s*(?:音|同|通|即|古同|古通)\s*[「『"']?笞)/giu;
    for (const m of text.matchAll(head)) result.add(m.index);
    return result;
}

function decisions(text, tokens = []) {
    const chi = chiOffsets(text);
    return [ ...text.matchAll(/抬/gu) ].map(m => {
        const token = tokens.find(t => t.start <= m.index && m.index < t.end);
        return {
            source: "抬",
            target: chi.has(m.index) ? "抬" : "擡",
            offset: m.index,
            pos: token?.pos,
            reading: chi.has(m.index) ? "chī" : "tái",
            directionalRule: true,
            rule: version,
            reason: chi.has(m.index) ? "抬的本字訓讀明示 chī、同笞，保留抬。" : "默認標準：舉起、扛舉、提高、爭辯及計量等 tái 義用擡。"
        };
    });
}

function dictionary(source, targets) {
    if (source === "抬") return [ "擡", "抬" ];
    return [ ...new Set(targets.map(t => t.replace(/抬/gu, "擡"))) ];
}

module.exports = {
    version: version,
    authority: authority,
    chiOffsets: chiOffsets,
    decisions: decisions,
    dictionary: dictionary
};

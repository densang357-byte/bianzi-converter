"use strict";

module.exports = function backNodes(text, tokens, data, allowed) {
    const view = tokens.flatMap((t, i) => {
        const merged = t.text.match(/^(背[着著])(双手|雙手|手)$/u) || t.text.match(/^(背)(光)$/u);
        if (!merged) return [ {
            ...t,
            key: i
        } ];
        return [ {
            ...t,
            key: i,
            text: merged[1],
            end: t.start + merged[1].length
        }, {
            key: i + ":node",
            text: merged[2],
            start: t.start + merged[1].length,
            end: t.end,
            pos: "n",
            parent: i,
            relation: "VOB",
            decomposed: true
        } ];
    });
    const ownerShape = /^背(?:起|着|著|对|對|向|光|[着著](?:双手|雙手|手))?$/u;
    const facing = t => t.pos === "n" && t.relation === "SBV" && view.find(h => h.key === t.parent && /^(?:对|對|向)$/u.test(h.text) && h.pos === "v");
    const heads = view.filter(t => /^背(?:起|着|著|对|對|向)?$/u.test(t.text) && (!t.pos || [ "v", "a" ].includes(t.pos) || facing(t)) && allowed(t.start, ownerShape));
    const output = [], forms = {
        "手": data.handForms,
        "光": data.lightForms
    };
    for (const head of heads) for (const [node, aliases] of Object.entries(forms)) for (const clue of view.filter(t => aliases.includes(t.text) && ![ "nh", "nhf", "nhs", "ns", "ni", "nz" ].includes(t.pos))) {
        if (head.key === clue.key) continue;
        const a = Math.min(head.end, clue.end), b = Math.max(head.start, clue.start), bridge = text.slice(a, b);
        if (/[，,。！？!?；;：:\n]/u.test(bridge) || Math.abs(head.start - clue.start) > 40) continue;
        const anchor = node === "光" ? facing(head) || head : head;
        const prep = view.find(t => clue.parent === t.key && t.parent === anchor.key && /^(?:把|将|將)$/u.test(t.text));
        const direct = clue.parent === anchor.key && [ "VOB", "FOB" ].includes(clue.relation);
        const subject = clue.parent === head.key && clue.relation === "SBV" && /(?:身|腰|背)[后後]/u.test(text.slice(head.end, head.end + 12));
        const parsed = head.parent !== undefined && clue.parent !== undefined;
        const surface = !parsed && clue.start >= head.end && /^(?:[着著了起向对對]|一|两|兩|双|雙|只|隻|束|那|这|這|道|片)*$/u.test(bridge);
        const surfaceDisposal = !parsed && clue.end <= head.start && /^(?:都|也|已|已经|已經)?$/u.test(bridge) && /(?:把|将|將)(?:那|这|這|一|两|兩|双|雙|只|隻){0,6}$/u.test(text.slice(Math.max(0, clue.start - 9), clue.start)) && /^(?:在|到)(?:身|腰|背)[后後]/u.test(text.slice(head.end));
        const surfaceLight = !parsed && node === "光" && clue.start >= head.end && /^(?:[着著向对對]|那|这|這|一|束|道|片){0,7}[^，,。！？!?；;]{1,8}的$/u.test(bridge);
        const childModifiers = view.filter(t => t.parent === clue.key && t.relation === "ATT");
        const detachedHand = node === "手" && (childModifiers.some(t => ![ "m", "q" ].includes(t.pos) && !/^(?:双|雙)$/u.test(t.text)) || /(?:断|斷|截|假)[^，,。！？]{0,5}$/u.test(text.slice(Math.max(head.end, clue.start - 8), clue.start)));
        const local = (direct || prep || subject || surface || surfaceDisposal || surfaceLight) && !detachedHand;
        const gap = Math.max(clue.start - head.end, head.start - clue.end, 0);
        output.push({
            at: head.start,
            id: node === "手" ? "back-hands" : "back-light",
            clues: [ node ],
            weight: local ? data.weights.postureRelation : data.weights.bodyBackground / (1 + gap / 20),
            strength: local ? "local" : "background",
            structure: local ? direct ? "dependency-object" : prep ? "dependency-disposal" : subject ? "dependency-subject" : "token-object-chain" : "nearby-node"
        });
    }
    return output;
};

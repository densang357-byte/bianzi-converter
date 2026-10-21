(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(); else root.BianziClassicalQuotePass = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    "use strict";
    function batch(plans, start) {
        const selected = [];
        let bytes = 0;
        for (let i = start; i < plans.length && selected.length < 128; i++) {
            if (!plans[i]) throw Error("缺少普通轉換的引文掃描計畫，請重新轉換。");
            const size = (new TextEncoder).encode(JSON.stringify(plans[i])).length;
            if (size > 125e4) throw Error("單個引文掃描段落過大，請分段處理。");
            if (selected.length && bytes + size > 125e4) break;
            bytes += size;
            selected.push(plans[i]);
        }
        return {
            plans: selected,
            start: start,
            end: start + selected.length
        };
    }
    function apply(segment, scanned) {
        if (!segment?.classicalQuotePlan || scanned?.sentences?.[0]?.sourcePlanSha256 !== segment.classicalQuotePlan.planSha256) throw Error("引文後掃描結果與原段落不符。");
        if (scanned.sentences[0].before !== segment.text) throw Error("普通轉換結果已變更，無法套用引文後掃描。");
        if (!Array.isArray(scanned.patches) || scanned.patches.length !== segment.sentences.length) throw Error("引文後掃描句段數量不符。");
        if (scanned.patches.map(p => p.after).join("") !== scanned.text) throw Error("引文後掃描文字與句段不符。");
        segment.sentences.forEach((sentence, i) => Object.assign(sentence, scanned.patches[i]));
        segment.text = scanned.text;
        segment.classicalQuoteScan = scanned.classicalQuoteScan;
        return segment;
    }
    return {
        batch: batch,
        apply: apply
    };
});

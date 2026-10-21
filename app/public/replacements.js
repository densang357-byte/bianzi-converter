(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(); else root.BianziReplacements = factory();
})(typeof globalThis === "object" ? globalThis : this, function() {
    "use strict";
    const fields = [ "protect", "pre", "post" ];
    function validate(settings = {}) {
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("自訂取代設定格式錯誤。");
        const out = {
            enabled: settings.enabled !== false
        };
        for (const field of fields) {
            const value = settings[field] ?? "";
            if (typeof value !== "string" || value.length > 2e5) throw new Error("每段自訂取代最多 200,000 字。");
            const lines = value.replace(/\r\n?/g, "\n").split("\n");
            if (lines.filter(l => l.length).length > 2e3) throw new Error("每段自訂取代最多 2000 條。");
            for (const [index, line] of (out.enabled ? lines : []).entries()) {
                if (!line.length) continue;
                if (field === "protect") {
                    if (line.length > 500) throw new Error(`保護字詞第 ${index + 1} 行超過 500 字。`);
                } else {
                    const i = line.indexOf("=");
                    if (i < 1 || i > 500 || line.length - i - 1 > 500) throw new Error(`${field === "pre" ? "轉換前" : "轉換後"}取代第 ${index + 1} 行須為「原文=結果」，每邊最多 500 字；結果可留空。`);
                }
            }
            out[field] = value.replace(/\r\n?/g, "\n");
        }
        return out;
    }
    function active(s) {
        return s.enabled && fields.some(k => s[k].length);
    }
    function rules(text) {
        return text.split("\n").filter(Boolean).map(line => {
            const i = line.indexOf("=");
            return {
                source: line.slice(0, i),
                target: line.slice(i + 1)
            };
        });
    }
    function replace(text, list, phase) {
        const hits = [];
        for (const rule of list) {
            const parts = text.split(rule.source), count = parts.length - 1;
            if (!count) continue;
            const length = text.length + count * (rule.target.length - rule.source.length);
            if (length > 2e5) throw new Error("自訂取代展開後超過 200,000 字，請縮小範圍。");
            text = parts.join(rule.target);
            hits.push({
                ...rule,
                phase: phase,
                count: count
            });
        }
        return {
            text: text,
            hits: hits
        };
    }
    function protect(text, words) {
        const trie = new Map;
        for (const word of words.split("\n").filter(Boolean)) {
            let n = trie;
            for (const c of word) {
                if (!n.has(c)) n.set(c, new Map);
                n = n.get(c);
            }
            n.end = true;
        }
        const chars = Array.from(text), spans = [];
        let plain = "";
        for (let i = 0; i < chars.length; ) {
            let node = trie, end = i;
            for (let j = i; j < chars.length && node.has(chars[j]); j++) {
                node = node.get(chars[j]);
                if (node.end) end = j + 1;
            }
            if (end > i) {
                if (plain) {
                    spans.push({
                        text: plain,
                        protected: false
                    });
                    plain = "";
                }
                spans.push({
                    text: chars.slice(i, end).join(""),
                    protected: true
                });
                i = end;
            } else plain += chars[i++];
        }
        if (plain || !spans.length) spans.push({
            text: plain,
            protected: false
        });
        if (spans.length > 1e4) throw new Error("保護字詞切分超過 10,000 段，請分批處理。");
        return spans;
    }
    return {
        validate: validate,
        active: active,
        rules: rules,
        replace: replace,
        protect: protect
    };
});

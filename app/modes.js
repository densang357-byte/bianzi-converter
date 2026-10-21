"use strict";

const modes = [ {
    id: "fast",
    label: "快速模式（HanLP）",
    engine: "hanlp",
    analysis: true
}, {
    id: "slow",
    label: "慢速模式（LTP）",
    engine: "ltp",
    analysis: true
} ];

function resolveMode(mode = "slow") {
    if (mode === "context") return {
        ...modes[1],
        id: "context"
    };
    if (mode === "dictionary") return {
        id: mode,
        label: "純詞庫（相容介面）",
        engine: null,
        analysis: false
    };
    const selected = modes.find(m => m.id === mode);
    if (!selected) throw Error("轉換模式須爲快速（HanLP）或慢速（LTP）。");
    return selected;
}

module.exports = {
    modes: modes,
    resolveMode: resolveMode
};

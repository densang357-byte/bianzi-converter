"use strict";

module.exports = function recitation(text, tokens, data, allowed) {
    const out = [], content = /^(?:诗|詩|诗句|詩句|诗歌|詩歌|唐诗|唐詩|圣诗|聖詩|经文|經文|咒语|咒語|歌词|歌詞|课文|課文|口诀|口訣|古文|文章)$/u;
    const shape = /^背(?:诵|誦|熟|完|出|下|得|起)?(?:着|著|了)?$/u;
    const chain = /^(?:着|著|了|完|出|下|一|两|兩|三|首|篇|句|那|这|這|段|的){0,9}$/u;
    for (const m of text.matchAll(/背(?:诵|誦|熟|完|出|下|得|起)?(?:着|著|了)?/gu)) {
        const at = m.index;
        if (!allowed(at, shape)) continue;
        const t = tokens.find(t => t.start <= at && at < t.end), head = tokens.indexOf(t);
        if (t.pos && ![ "v", "a" ].includes(t.pos)) continue;
        const end = at + m[0].length, left = text.slice(Math.max(0, at - 24), at).split(/[，,。！？!?；;：:\n]/u).at(-1), right = text.slice(end).split(/[，,。！？!?；;：:\n]/u)[0], limit = end + right.length;
        const title = right.match(/^(?:着|著|了|的|那|这|這|一|两|兩|三|本|部|册|冊|卷|箱|袋|整套|几|幾|厚厚的){0,12}《([^《》]{1,40})》/u);
        const object = tokens.find(x => x.start >= end && x.end <= limit && x.start < end + 30 && content.test(x.text) && (Number.isInteger(x.parent) ? x.parent === head && [ "VOB", "FOB" ].includes(x.relation) : chain.test(text.slice(end, x.start))));
        if (!title && !object) continue;
        const prefix = title ? right.slice(0, right.indexOf("《")) : right.slice(0, object.start - end);
        const container = /(?:箱|袋|捆|套|包|书包|書包|印本|木箱|叠|疊|摞|张|張|页|頁)/u.test(prefix);
        const explicit = /^背(?:诵|誦|熟)/u.test(m[0]);
        const voice = /(?:大声|大聲|朗声|朗聲|高声|高聲|逐句|逐字|一字不漏|一首首|一篇篇|一句句|心中|心里|心裏)(?:地|的)?$/u.test(left);
        const portion = title && /^(?:里|裏|裡|中|上)(?:的|这|這|那|一|两|兩|三|几|幾|十|首|篇|句|段){1,10}(?:话|話|诗|詩|经文|經文|文字|内容|內容)/u.test(right.slice(title[0].length));
        const bridge = object ? text.slice(end, object.start) : "";
        const quietContent = object && /默默(?:地|的)?$/u.test(left);
        const quantityContent = object && chain.test(bridge) && /首|篇|句/u.test(bridge);
        const oral = explicit || voice || portion || quietContent || quantityContent;
        const local = Boolean(oral && !container);
        out.push({
            at: at,
            id: title ? "back-title-recitation" : "back-content-recitation",
            clues: title ? [ "《》", title[1] ] : [ object.text ],
            weight: local ? data.weights.recitationRelation : data.weights.titleBackground,
            strength: local ? "local" : "background"
        });
    }
    return out;
};

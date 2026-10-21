"use strict";

const explicit = require("../dictionaries/CN_to_TW.modern.PoS.json");

const lexicon = require("../dictionaries/CN_to_TW.modern.phrases.json");

const directional = require("./data/lexicon-direction-policy.json");

const {reviewedMatches: reviewedMatches} = require("./reviewed-rules");

const surnames = new Set(Array.from("余范姜朴郁于岳沈种宁万"));

const sortedLexicon = lexicon.slice().sort((a, b) => b.source.length - a.source.length);

const title = /^(?:先生|女士|小姐|老师|老師|教授|医生|醫生|医师|醫師|同学|同學|校长|校長|主任|经理|經理)/u;

const wordSegmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

function clauseAt(text, offset, separators) {
    let start = offset, end = offset;
    while (start > 0 && !separators.includes(text[start - 1])) start--;
    while (end < text.length && !separators.includes(text[end])) end++;
    return text.slice(start, end);
}

function speechKouChi(before, tokens, offset) {
    const left = tokens.find(token => token.start <= offset && offset < token.end);
    const right = tokens.find(token => token.start <= offset + 1 && offset + 1 < token.end);
    if (left && right) {
        if (left === right) return true;
        if (left.start !== offset || left.end !== offset + 1 || right.start !== offset + 1 || right.end !== offset + 2) return false;
    }
    return [ ...wordSegmenter.segment(before) ].some(word => word.index <= offset && offset + 2 <= word.index + word.segment.length);
}

function decisions(before, tokens, phraseResolved = new Set, neighbors = {}) {
    const found = [];
    for (const m of before.matchAll(/考/gu)) found.push({
        source: "考",
        target: "攷",
        offset: m.index,
        directionalRule: true,
        reason: directional.characters["考"].note
    });
    const speech = new Set;
    for (const m of before.matchAll(/口吃|吃吃(?=地?(?:说|說|笑))|吃讷|吃訥|吃然|吃语|吃語|迅吃/gu)) {
        if (m[0] === "口吃" && /(?:[一二两兩三几幾大每这這那小]|张|張|开|開)$/.test(before.slice(0, m.index))) continue;
        if (m[0] === "口吃" && !speechKouChi(before, tokens, m.index)) continue;
        for (let i = 0; i < m[0].length; i++) if (m[0][i] === "吃") speech.add(m.index + i);
    }
    for (let i = 0; i < before.length; i++) if (before[i] === "吃") found.push({
        source: "吃",
        target: speech.has(i) ? "吃" : "喫",
        offset: i,
        reason: "默認標準：喫是喫飯之喫；吃是口吃之吃。"
    });
    for (const m of before.matchAll(/咨(?:询|詢|商|议|議|访|訪|问|問|诹|諏)/gu)) found.push({
        source: "咨",
        target: "諮",
        offset: m.index,
        reason: "默認標準：商議詢問用諮；咨文、咨嗟保留咨。"
    });
    for (const m of before.matchAll(/咨(?:文|呈|送|嗟)|畴咨|疇咨/gu)) {
        const i = m.index + m[0].indexOf("咨");
        found.push({
            source: "咨",
            target: "咨",
            offset: i,
            reason: "公文或感嘆語境保留咨。"
        });
    }
    for (const m of before.matchAll(/确(?:瘠|薄|荦|犖)|荦确|犖确/gu)) found.push({
        source: "确",
        target: "确",
        offset: m.index + m[0].indexOf("确"),
        reason: "确的土地瘠薄等特殊義項保留。"
    });
    for (const m of before.matchAll(/(?:[0-9０-９]+|[零〇一二两兩三四五六七八九十百千万萬亿億兆]+)(?:多)?余/gu)) found.push({
        source: "余",
        target: "餘",
        offset: m.index + m[0].lastIndexOf("余"),
        reason: "數量後表示餘數或超出整數，如十餘年、百多餘里。"
    });
    for (const token of tokens) {
        if (token.end - token.start !== token.text.length) continue;
        const wordRule = directional.words[token.text];
        const branchRule = wordRule || directional.characters[token.text];
        let choice = branchRule?.default_by_pos?.[token.pos] || branchRule?.default_for_all_pos;
        if (wordRule?.cai_policy) choice = require("./cai-rules").choose(before, token, wordRule, choice);
        const context = branchRule?.clause_context?.[token.pos];
        const contextMatched = context?.contains.some(c => clauseAt(before, token.start, context.separators).includes(c));
        if (context) choice = contextMatched ? context.target : context.otherwise;
        const position = Array.from(before.slice(0, token.start)).length;
        const preferPos = branchRule?.prefer_pos_over_phrases || branchRule?.prefer_pos_over_phrases_by_pos?.[token.pos];
        if (choice && (wordRule || preferPos || !phraseResolved.has(position))) {
            let offset = token.start;
            Array.from(token.text).forEach((source, i) => {
                found.push({
                    source: source,
                    target: Array.from(choice)[i],
                    offset: offset,
                    pos: token.pos,
                    directionalRule: true,
                    reason: branchRule.note,
                    lexicon: wordRule ? token.text : undefined,
                    decisionBasis: context ? contextMatched ? "clause-cue" : "clause-fallback" : wordRule ? "word-pos" : "pos-default",
                    posPriority: !!preferPos || !!wordRule?.cai_policy
                });
                offset += source.length;
            });
        }
        const fixed = explicit.find(r => r.source === token.text && r.pos === token.pos);
        if (fixed) found.push({
            ...fixed,
            offset: token.start
        });
        if (token.text === "周" && token.pos === "q" || [ "m", "nt" ].includes(token.pos) && /^[0-9０-９零〇一二两兩三四五六七八九十百千万萬几幾数數]+周$/u.test(token.text)) found.push({
            source: "周",
            target: "週",
            offset: token.end - 1,
            pos: token.pos,
            directionalRule: true,
            posPriority: true,
            reason: "模型將周識別爲獨立量詞，或將數詞加周識別爲數量／時間單位；四周/nd方位義與人名地名不套用。"
        });
        if (token.pos === "nt" && token.text.length > 1 && token.text.endsWith("后")) found.push({
            source: "后",
            target: "後",
            offset: token.end - 1,
            pos: token.pos,
            directionalRule: true,
            posPriority: true,
            reason: "完整時間名詞尾部的后表示時間之後；不把名詞、人名或地名中的后套用時間義。"
        });
        if ([ "m", "q" ].includes(token.pos) && /^(?:[0-9０-９零〇一二两兩三四五六七八九十百千万萬]+)?里(?:许|許|半)?$/u.test(token.text.trim())) found.push({
            source: "里",
            target: "里",
            offset: token.start + token.text.indexOf("里"),
            pos: token.pos,
            directionalRule: true,
            posPriority: true,
            reason: "完整數量詞中的里保留距離義；不把所有m或含里的詞都判成距離。"
        });
        if ((token.pos === "nd" || token.pos === "nt") && token.text.length > 1 && token.text.startsWith("后")) found.push({
            source: "后",
            target: "後",
            offset: token.start,
            pos: token.pos,
            reason: "完整方位／時間詞以「後」表示；不採跨詞界的帝后、王后。"
        });
        if (token.pos === "nh" && surnames.has(token.text) && title.test(before.slice(token.end))) found.push({
            source: token.text,
            target: token.text,
            offset: token.start,
            pos: token.pos,
            reason: "姓氏加稱謂，明確保留原字；不影響同句的餘款、示範、樸實、憂鬱等一般詞。"
        });
    }
    const locked = new Set;
    const boundaries = new Set(tokens.flatMap(token => [ token.start, token.end ]));
    const lexicalBoundaries = tokens.length ? boundaries : new Set([ ...wordSegmenter.segment(before) ].flatMap(word => [ word.index, word.index + word.segment.length ]));
    for (const entry of sortedLexicon) {
        let start = before.indexOf(entry.source);
        while (start !== -1) {
            const end = start + entry.source.length;
            const fits = entry.posPriority || !tokens.length || boundaries.has(start) && boundaries.has(end) || tokens.some(token => token.start <= start && end <= token.end);
            const excluded = entry.notAfter?.some(suffix => before.startsWith(suffix, end));
            const wholeWord = !entry.wholeWord || (tokens.length ? tokens.some(token => token.start === start && token.end === end) : lexicalBoundaries.has(start) && lexicalBoundaries.has(end));
            const independent = !entry.independentWord || [ ...wordSegmenter.segment(before) ].some(word => word.index === start && word.index + word.segment.length === end);
            if (fits && !excluded && wholeWord && independent) for (let i = 0; i < entry.source.length; i++) {
                if (locked.has(start + i)) continue;
                found.push({
                    source: entry.source[i],
                    target: entry.target[i],
                    offset: start + i,
                    reason: entry.reason,
                    lexicon: entry.source,
                    posPriority: !!entry.posPriority
                });
                locked.add(start + i);
            }
            start = before.indexOf(entry.source, start + entry.source.length);
        }
    }
    for (const m of before.matchAll(/人干/gu)) {
        const start = m.index, end = start + 2, left = before.slice(0, start), right = before.slice(end);
        const nominal = tokens.some(t => t.start === start && t.end === end && /^n/.test(t.pos));
        const resultFrame = /(?:成|像|如)(?:了)?(?:一(?:个|個|具))?[「『“"']?$/u.test(left);
        const nounEnd = /^(?:$|[\s，。！？、；：」』”"']|不[说說]|一般|一[样樣]|似的|了|也|[还還])/u.test(right);
        if (nominal || resultFrame && nounEnd) found.push({
            source: "干",
            target: "乾",
            offset: start + 1,
            reason: "人乾表示被耗乾、風乾的人；完整名詞或「成／像……人乾」結果語境優先於誤分詞及「干不」片段。"
        });
    }
    for (const token of tokens) if (token.pos === "m" && /^[一二三四五六七八九十几幾数數两兩]+出出$/u.test(token.text)) {
        for (let i = 0; i < token.text.length; i++) if (token.text[i] === "出") found.push({
            source: "出",
            target: "齣",
            offset: token.start + i,
            reason: "重疊戲劇量詞。"
        });
    }
    for (const token of tokens) {
        if (token.end - token.start !== token.text.length) continue;
        for (let i = 0; i < token.text.length; i++) {
            const source = token.text[i], rule = directional.characters[source];
            const position = [ ...before.slice(0, token.start + i) ].length;
            const target = rule?.within_token_by_pos?.[token.pos] || !phraseResolved.has(position) && rule?.within_token_defaults_by_pos?.[token.pos];
            if (target) found.push({
                source: source,
                target: target,
                offset: token.start + i,
                pos: token.pos,
                directionalRule: true,
                posPriority: true,
                reason: rule.note
            });
        }
    }
    for (const match of contextualMatches(before, tokens, neighbors)) found.push({
        source: match.source,
        target: match.target,
        offset: match.offset,
        pos: match.pos,
        directionalRule: true,
        posPriority: true,
        reason: match.reason,
        ...match.rule ? {
            rule: match.rule,
            reference: match.reference,
            structure: match.structure
        } : {}
    });
    for (const name of directional.protected_names || []) for (let at = before.indexOf(name); at !== -1; at = before.indexOf(name, at + name.length)) for (let i = 0; i < name.length; i++) if (name[i] === "里") found.push({
        source: "里",
        target: "里",
        offset: at + i,
        directionalRule: true,
        posPriority: true,
        reason: "已確認地名" + name + "保留里；不因模型拆成nd/nl改作內部義。"
    });
    found.push(...require("./cai-rules").compositionalMatches(before, tokens));
    found.push(...require("./cai-rules").nominalMatches(before));
    return found;
}

function contextualMatches(before, tokens, neighbors = {}) {
    const matches = [], rules = directional.context_rules || {};
    const restraint = rules.chained_restraint;
    if (restraint?.enabled) for (const token of tokens) {
        if (token.pos !== restraint.pos) continue;
        for (let i = 0; i < token.text.length; i++) if (token.text[i] === restraint.source) {
            const offset = token.start + i, action = before.slice(offset + 1);
            if (!restraint.following_actions.some(s => action.startsWith(s))) continue;
            const left = clauseAt(before.slice(0, offset), offset, "。！？!?；;，,\n");
            const dogFrame = /(?:像|如)(?:一[只隻条條头頭])?狗(?:一[样樣]|那[样樣])?(?:地|的)?$/u.test(left);
            const chainFrame = /(?:[铁鐵][链鏈鍊炼煉]|[锁鎖][链鏈鍊炼煉]|[链鏈鍊][条條]|[项項]圈|枷[锁鎖])/u.test(left);
            if (dogFrame || chainFrame) matches.push({
                source: restraint.source,
                target: restraint.target,
                offset: offset,
                pos: token.pos,
                reason: restraint.note
            });
        }
    }
    if (rules.regional_noodles?.enabled) for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i], previous = tokens[i - 1];
        if (token.text === "面" && token.pos === "n" && previous.pos === "ns" && /^[ \t\u3000]*$/u.test(before.slice(previous.end, token.start))) matches.push({
            source: "面",
            target: "麪",
            offset: token.start,
            pos: token.pos,
            candidates: [ "麪", "面" ],
            reason: rules.regional_noodles.note
        });
    }
    if (rules.one_character_exclamation) for (const m of before.matchAll(/(?:^|[。！？!?；;：:，,\n「『“"‘'])\s*(干)\s*[!！]/gu)) {
        const offset = m.index + m[0].indexOf("干"), token = tokens.find(t => t.start <= offset && offset < t.end);
        matches.push({
            source: "干",
            target: "幹",
            offset: offset,
            pos: token?.pos || "",
            candidates: [ "幹", "乾", "干" ],
            reason: rules.one_character_exclamation.note
        });
    }
    const material = rules.manufactured_attribute;
    if (material?.enabled) for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i], next = tokens[i + 1], previous = tokens[i - 1];
        const materialWord = material.material_prefixes.includes(token.text.slice(0, -1)) || token.text === "制" && previous?.end === token.start && material.material_prefixes.includes(previous.text);
        const materialNoun = token.text !== "制" || previous?.pos === "n";
        if (token.pos === "v" && token.text.endsWith("制") && materialWord && materialNoun && next.text === "的" && token.end === next.start) matches.push({
            source: "制",
            target: "製",
            offset: token.end - 1,
            pos: token.pos,
            reason: material.note
        });
    }
    const drinking = rules.drinking_gan;
    if (drinking?.enabled) for (const token of tokens) {
        if (token.text !== "干" || token.pos !== drinking.pos && !drinking.qualified_actions) continue;
        const same = drinking.same_sentence_cues.some(c => before.includes(c));
        const linked = [ neighbors.previous, neighbors.next ].filter(Boolean).some(s => drinking.neighbor_sentence_pairs.some(c => s.includes(c)) || drinking.qualified_actions && /(?:举|舉)(?:起)?(?:酒)?[杯盃碗]|斟.{0,5}[杯碗酒]|[喝飲饮](?:下|盡|尽)/u.test(s));
        const drinkingAction = /^(?:了)?(?:[！!。？?，,」』”"']|(?:[一二两兩三四五六七八九十几幾]+)(?:杯|盃)|$)/u.test(before.slice(token.end));
        const left = before.slice(Math.max(0, token.start - 28), token.start), right = before.slice(token.end);
        const doing = /^(?:[么麼]|甚[么麼]|什[么麼]|事|活|这|這|来的|來的)/u.test(right) || /(?:事|活|工作|勾当|勾當)(?:都|也)?$/u.test(left) || /骂[声聲]?|罵[聲声]?/u.test(left);
        const object = /^(?:了)?(?:[这這此那一二两兩三四五六七八九十几幾]+)?[杯盃碗盞盏]/u.test(right);
        const local = /举(?:起)?(?:酒)?[杯盃碗]|舉(?:起)?(?:酒)?[杯盃碗]|斟[^。！？]{0,12}|一口(?:气|氣)?(?:便|就|又|而)?$|仰脖|喝(?:酒|[过過])|[饮飲]酒/u.test(left);
        const qualified = !doing && (object || drinkingAction && (local || linked));
        if (drinking.qualified_actions ? qualified : same || linked && drinkingAction) matches.push({
            source: "干",
            target: "乾",
            offset: token.start,
            pos: token.pos,
            candidates: [ "乾", "幹" ],
            reason: drinking.note
        });
    }
    matches.push(...reviewedMatches(before, tokens, neighbors, rules.reviewed_semantics));
    for (let i = 1; i < tokens.length - 1; i++) {
        const t = tokens[i], left = tokens[i - 1], right = tokens[i + 1];
        if (t.text === "出" && left.pos === "m" && left.end === t.start && t.end === right.start && /^(?:电视剧|電視劇|戏剧|戲劇|喜剧|喜劇|悲剧|悲劇|话剧|話劇|舞台剧|舞臺劇|歌剧|歌劇|京剧|京劇|粤剧|粵劇|戏|戲|电影|電影)/u.test(right.text)) matches.push({
            source: "出",
            target: "齣",
            offset: t.start,
            pos: t.pos,
            reason: "數量詞＋出＋戲劇名詞的明確量詞語境用齣；記錄原模型標籤，不將v冒充q。"
        });
    }
    return matches;
}

function contextRisks(before, tokens, neighbors) {
    return contextualMatches(before, tokens, neighbors).filter(m => m.candidates).map(m => ({
        source: m.source,
        pos: m.pos,
        offset: m.offset,
        candidates: m.candidates,
        default: {
            target: m.target,
            basis: "manual-context"
        },
        reason: m.reason,
        condition: "語境規則"
    }));
}

function retainZhe(before, converted) {
    const a = Array.from(before), b = Array.from(converted);
    if (a.length !== b.length) throw new Error("無法可靠對齊「着／著」區別。");
    return b.map((c, i) => a[i] === "着" || a[i] === "著" ? a[i] : c).join("");
}

module.exports = {
    decisions: decisions,
    retainZhe: retainZhe,
    contextRisks: contextRisks
};

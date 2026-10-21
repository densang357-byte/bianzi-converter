"use strict";

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const reference = "https://dict.revised.moe.edu.tw/dictView.jsp?ID=149252&la=0&powerMode=0";

const people = /(?:人(?:等|众|眾|群|士|物|员|員)?|弟子|门人|門人|同门|同門|师兄弟|師兄弟|师[兄弟姐妹]|師[兄弟姐妹]|同道|老道|道人|道友|道士|和尚|僧人|高僧|官兵|兵卒|佣兵|傭兵|护卫|護衞|護衛|侍卫|侍衞|侍衛|骑士|騎士|武师|武師|高手|游侠|遊俠|逆贼|逆賊|邪魔|妖魔|妖孽|佛陀|大儒|举子|舉子|进士|進士|权臣|權臣|君臣|大臣|姐妹|兄弟|朋友|长辈|長輩|小辈|小輩|小儿|小兒|家伙|傢伙|公子|子弟|勇士|大佬|主考|者)$/u;

const punctuation = /[，,。！？!?；;：:\n]/u;

const segmenter = new Intl.Segmenter("zh", {
    granularity: "word"
});

function matches(text, tokens = []) {
    const result = [];
    const owner = at => tokens.find(t => t.start <= at && at < t.end);
    const valid = t => t && text.slice(t.start, t.end) === t.text;
    for (const m of text.matchAll(/一干/gu)) {
        const start = m.index, at = start + 1, end = start + 2;
        const one = owner(start), gan = owner(at);
        const left = text.slice(0, start).split(punctuation).at(-1);
        const right = text.slice(end).split(punctuation)[0];
        if (/[第一]$/u.test(left) || /^(?:就(?!地)|便|到底|一辈|一輩|[过過了着著]|二[净淨]|而[尽盡]|挺擎|[儿兒爹娘妈媽爸父亲親]|部|活|净|淨|杯|盃|笑|枯)/u.test(right)) continue;
        if (/^事/u.test(right) && !/^(?:事情|事[务務])(?:也|都|[还還]|[，,。；;]|$)/u.test(right)) continue;
        if (/^(?:工程|工作|人事(?:工作)?|保安)(?:就|便|[了过過])/u.test(right)) continue;
        if (!tokens.length && /^人事工作/u.test(right)) continue;
        if (!right.trim() && /(?:值得|敢|想|愿意|願意|肯|打算|不妨|试着|試着)$/u.test(left)) continue;
        if (one && (!valid(one) || proper.has(one.pos))) continue;
        if (gan && (!valid(gan) || proper.has(gan.pos))) continue;
        const joined = one === gan && one?.start === start && one.text === "一干";
        const split = one?.start === start && one.text === "一" && gan?.start === at && gan.text === "干";
        const containing = one === gan && one?.start === start && one.text.startsWith("一干") && people.test(one.text.slice(2));
        const mergedTail = one?.start === start && one.text === "一" && [ "m", "n", "i" ].includes(one.pos) && gan?.start === at && gan.text.startsWith("干");
        const mergedWhole = one === gan && one?.start === start && one.text.startsWith("一干") && ![ "v" ].includes(one.pos);
        const internalIdiom = one === gan && one?.pos === "i" && one.start < start && people.test(text.slice(end, one.end));
        if (tokens.length && !joined && !split && !containing && !mergedTail && !mergedWhole && !internalIdiom) continue;
        const groupFrame = /(?:[这這那]|等|与|與|及|和|同|带|帶|带着|帶着|带领|帶領|率领|率領|你[们們]|我[们們])$/u.test(left) || tokens.some(t => t.end === start && [ "nh", "nhf", "nhs" ].includes(t.pos)) || /^\s*[「『“"']?$/u.test(left);
        let head, relative = false;
        if (containing) head = {
            text: one.text.slice(2),
            pos: "n",
            start: end,
            end: one.end
        }; else if (!tokens.length) {
            const first = [ ...segmenter.segment(right) ].find(t => t.isWordLike);
            if (first?.index === 0 && (people.test(first.segment) || [ "手下", "教众", "教眾", "饭铺", "飯鋪", "杂物", "雜物" ].includes(first.segment))) head = {
                text: first.segment,
                pos: "",
                start: end,
                end: end + first.segment.length
            };
        } else {
            const after = tokens.filter(t => t.start >= end && t.end <= end + right.length);
            let i = 0;
            while (i < 3 && after[i] && [ "a", "b", "m", "mq", "q" ].includes(after[i].pos)) i++;
            if (after[i]?.start === (i ? after[i - 1].end : end) && /^n/u.test(after[i].pos) && !proper.has(after[i].pos)) head = after[i];
            if (!head) {
                const rel = right.match(/^[^，,。！？!?；;：:\n]{1,16}?[的之]/u);
                if (rel) {
                    const suffix = text.slice(end + rel[0].length).split(punctuation)[0];
                    const candidates = tokens.filter(t => t.start >= end + rel[0].length && t.end <= end + rel[0].length + Math.min(8, suffix.length));
                    head = candidates.find(t => /^n/u.test(t.pos) && !proper.has(t.pos) && people.test(t.text));
                    relative = !!head;
                }
            }
            if (!head && joined) {
                const pair = after.slice(0, 2);
                if (pair.length === 2 && pair[0].start === end && pair[0].end === pair[1].start && pair[1].pos === "n" && /^[士者]$/u.test(pair[1].text)) head = {
                    text: pair.map(t => t.text).join(""),
                    pos: "n",
                    start: end,
                    end: pair[1].end
                };
            }
        }
        const numeric = joined && [ "m", "mq", "q", "n", "b", "j" ].includes(one.pos) || split && ([ "m", "mq" ].includes(one.pos) || gan.pos === "q");
        const lexicalPeople = head && people.test(head.text);
        const dictionaryDefault = !tokens.length || joined && one.pos !== "v" || mergedTail || mergedWhole || internalIdiom;
        if (!dictionaryDefault && (!head || !numeric && tokens.length && !(lexicalPeople && groupFrame) || relative && !numeric && !groupFrame)) continue;
        result.push({
            start: at,
            end: end,
            offset: at,
            source: "干",
            target: "干",
            pos: gan?.pos || "",
            kind: "collective-semantic-sense",
            rule: "collective-gan-nominal-head",
            reference: reference,
            structure: {
                numeral: one && {
                    text: one.text,
                    pos: one.pos
                },
                head: head ? {
                    text: head.text,
                    start: head.start,
                    end: head.end
                } : null,
                relativeClause: relative,
                basis: head ? "local-nominal-head" : "ordinary-dictionary-word",
                notAPosGoldLabel: true
            },
            reason: "優先保護一干表示一群、一批的常用詞義，包含中心詞省略及模型錯合詞界；明確做事、樹幹、乾燥及親屬語境另行排除，原生分詞和詞性保留。"
        });
    }
    return result;
}

function stemMatches(text, tokens = []) {
    const result = [];
    for (const m of text.matchAll(/一干挺擎/gu)) {
        const at = m.index + 1, token = tokens.find(t => t.start <= at && at < t.end);
        if (token && proper.has(token.pos)) continue;
        result.push({
            start: at,
            end: at + 1,
            source: "干",
            target: "幹",
            pos: token?.pos || "",
            rule: "stem-upright-predicate",
            reason: "一幹挺擎指樹木主幹挺立，不是集合量詞；即使原生模型標爲q也不以詞性詞庫改回干。"
        });
    }
    return result;
}

module.exports = {
    matches: matches,
    stemMatches: stemMatches,
    version: "collective-gan-v1",
    reference: reference
};

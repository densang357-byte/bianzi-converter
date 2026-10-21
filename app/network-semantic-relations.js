"use strict";

module.exports = function semantic(text, tokens, data, allowed) {
    const out = [], stop = /[，,。！？!?；;：:\n]/u, proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]), titleAt = at => [ ...text.slice(0, at).matchAll(/《|》/gu) ].at(-1)?.[0] === "《";
    const emit = (at, id, clues, structure) => out.push({
        at: at,
        id: id,
        clues: [ ...new Set(clues) ],
        structure: structure,
        weight: data.weights.directSemantic,
        strength: "local",
        priority: 4
    });
    const near = (a, b) => Math.abs(a.start - b.start) <= 32 && !stop.test(text.slice(Math.min(a.end, b.end), Math.max(a.start, b.start)));
    const index = t => tokens.indexOf(t), children = t => tokens.filter(x => x.parent === index(t));
    const sourceShape = /^背(?:着|著|了|起|上)?$/u;
    for (const h of tokens) {
        if (!sourceShape.test(h.text) || !allowed(h.start, sourceShape) || h.pos && ![ "v", "a" ].includes(h.pos) || titleAt(h.start)) continue;
        const hi = index(h), objects = tokens.filter(o => data.carryingForms.includes(o.text) && !proper.has(o.pos) && near(h, o) && !titleAt(o.start) && (Number.isInteger(o.parent) ? o.parent === hi && [ "VOB", "FOB" ].includes(o.relation) || tokens[o.parent]?.parent === hi && /^(?:把|将|將)$/u.test(tokens[o.parent].text) : o.start >= h.end && /^(?:着|著|了|起|上|[零一二三四五六七八九十百千万萬两兩0-9]|只|隻|个|個|件|那|这|這|斤|公斤|千克|沉重|沉甸甸|的){0,18}$/u.test(text.slice(h.end, o.start))));
        const quantity = tokens.find(t => /^(?:[零一二三四五六七八九十百千万萬两兩0-9]+)?(?:斤|公斤|千克)$/u.test(t.text) && near(h, t) && t.start >= h.end && /^(?:着|著|了|起|上|[零一二三四五六七八九十百千万萬两兩0-9])*$/u.test(text.slice(h.end, t.start)) && /[一二三四五六七八九十百千万萬两兩0-9]/u.test(text.slice(h.end, t.end)));
        const container = tokens.find(t => [ "箱", "包", "袋", "捆" ].includes(t.text) && t.pos === "q" && near(h, t) && !titleAt(t.start) && tokens[t.parent]?.parent === hi && tokens[t.parent]?.relation === "VOB");
        if (objects.length || quantity || container) {
            const attrs = tokens.filter(t => data.loadAttributes.includes(t.text) && objects.some(o => near(o, t) && (t.parent === index(o) || t.start >= h.end && t.end <= o.start)));
            emit(h.start, "back-load", [ ...objects.map(o => o.text), ...attrs.map(t => t.text), ...quantity ? [ quantity.text ] : [], ...container ? [ container.text ] : [] ], Number.isInteger(h.parent) ? "dependency-load-or-quantity" : "bounded-load-chain");
        }
    }
    for (const m of text.matchAll(/丑/gu)) {
        const at = m.index, h = tokens.find(t => t.start <= at && at < t.end);
        if (!h || !allowed(at, /^丑(?:后|後|前)?$/u) || text[at - 1] === "九") continue;
        const a = Math.max(text.lastIndexOf("。", at - 1) + 1, text.lastIndexOf("；", at - 1) + 1, at - 30), right = text.slice(at + 1, at + 32).split(/[。；;！？!?\n]/u)[0], left = text.slice(a, at), context = left + "丑" + right;
        const adjective = /(?:我|你|他|她|它|很|真|太|好|最|更|如此|这么|這麼|自己)(?:也|都|有点|有點|得|的)?$/u.test(left) || /^(?:陋|恶|惡|怪|态|態|化|闻|聞|得|极|極)/u.test(right);
        const definition = /^丑(?:是|属|屬|为|為)(?:十二)?地支/u.test("丑" + right) || /(?:地支|十二支)(?:中|里|裏|内|內|的)*$/u.test(left);
        const leftMembers = tokens.filter(t => t.end <= at && t.start >= a && /^[甲乙丙丁戊己庚辛壬癸子寅卯辰巳午未申酉戌亥]+(?:时|時|年|月|日)?$/u.test(t.text) && !proper.has(t.pos)), rightMember = /^(?:后|後|前|之后|之後)?(?:便|就|即|又|才)?(?:是|到|为|為)?[子寅卯辰巳午未申酉戌亥](?:时|時|年|月|日)/u.test(right);
        if (!adjective && (definition || leftMembers.length && rightMember)) emit(at, "calendar-context", definition ? [ "地支" ] : leftMembers.map(t => t.text), "calendar-role-with-members");
    }
    const abstract = /^(?:产业链|產業鏈|供应链|供應鏈|区块链|區塊鏈|食物链|食物鏈|链接|鏈接|链路|鏈路|价值链|價值鏈)$/u;
    for (const h of tokens) {
        if (abstract.test(h.text) || proper.has(h.pos)) continue;
        const m = h.text.match(/[链炼]/u);
        if (!m) continue;
        const at = h.start + m.index, source = text[at], shape = /^(?:铁|鐵|锁|鎖)?(?:链|炼)(?:子|条|條)?$/u;
        if (!allowed(at, shape) || source === "炼" && !/^(?:铁|鐵|锁|鎖)炼/u.test(h.text) || h.pos && !/^n/u.test(h.pos)) continue;
        const left = text.slice(Math.max(0, h.start - 20), h.start).split(stop).at(-1), objectEnd = h.end + (/^[子条條]/u.test(text.slice(h.end)) ? 1 : 0), right = text.slice(objectEnd).split(stop)[0];
        const material = /^(?:铁|鐵|锁|鎖)/u.test(h.text) || /(?:铁|鐵)(?:制|製|做|打)(?:的|成的)?$/u.test(left) || /^(?:是|为|為|用|由)(?:铁|鐵)(?:制|製|做|打|铸|鑄)/u.test(right);
        const dog = /(?:狗|犬)(?:颈|頸|脖子)?(?:上|下|旁)?的$/u.test(left) || /(?:用|拿|以)(?:一|这|這|那|根|条|條|长|長|短|的){0,8}$/u.test(left) && /^(?:把|将|將)?(?:那|这|這|一|条|條|只|隻)?(?:狗|犬)(?:拴|栓|锁|鎖|缚|縛|系|繫|套)/u.test(right) || /^(?:拴|栓|锁|鎖|缚|縛|系|繫|套)(?:住|着|著|了)?(?:那|这|這|一|条|條|只|隻){0,4}(?:狗|犬)/u.test(right);
        if (material || dog) emit(at, source === "炼" ? "physical-chain-typo" : "physical-chain", [ ...material ? [ "鐵" ] : [], ...dog ? [ "狗", "拴繫" ] : [] ], "material-or-restraint-role");
    }
    for (const h of tokens) {
        if (!/^划(?:着|著|了|过|過|往|向|到|入|出|去|来|來|回)?$/u.test(h.text) || !allowed(h.start, /^划(?:着|著|了|过|過|往|向|到|入|出|去|来|來|回)?$/u) || h.pos && !/^v/u.test(h.pos)) continue;
        const at = h.start, related = children(h), left = text.slice(Math.max(0, at - 32), at).split(stop).at(-1), right = text.slice(at + 1).split(stop)[0];
        const time = related.find(t => t.relation === "SBV" && /^(?:时间|時間|岁月|歲月|光阴|光陰)$/u.test(t.text));
        const timeSurface = !Number.isInteger(h.parent) && /^(?:时间|時間|岁月|歲月|光阴|光陰)(?:就|那么|那麼|一劫一劫地|慢慢地|悄悄地)*$/u.test(left);
        const writing = /(?:伸|用)(?:一|根|只|隻|个|個|自己的|他的|她的){0,5}(?:指|手指|指尖)(?:在|于|於)(?:水中|水面|沙上|地上|桌上)(?:轻轻|輕輕|地)*$/u.test(left) && /^道[：:]/u.test(text.slice(at + 1));
        const result = related.find(t => [ "VOB", "FOB" ].includes(t.relation) && /(?:痕|线|線|字|口子|伤|傷)/u.test(t.text));
        const surfaceResult = /^(?:出|下|开|開|了|一道|一条|一條|一个|一個|一|道|条|條|个|個){0,6}(?:痕迹|痕跡|裂痕|线|線|字|口子|伤口|傷口)/u.test(right);
        if ((time || timeSurface) && /^(?:过|過)/u.test(right)) {
            emit(at, "figurative-trajectory", [ time?.text || "時間" ], "trajectory-subject");
            continue;
        }
        if (writing || result || surfaceResult) {
            emit(at, "surface-mark-argument", [ writing ? "指" : result?.text || "痕／線／字" ], "writing-tool-or-result");
            continue;
        }
        const craft = related.find(t => [ "SBV", "VOB", "FOB" ].includes(t.relation) && /^(?:小船|船|舟|木筏|竹筏|筏子|筏|艇|舟子|船夫|船家)$/u.test(t.text));
        const surfaceCraft = !Number.isInteger(h.parent) && /(?:小船|船夫|舟子|筏子|木筏|竹筏|船|舟|筏)(?:正|在|就|已|已经|已經|飞快|飛快|慢慢|又|急忙)*$/u.test(left);
        const disposal = related.find(t => t.pos === "p" && t.text === "把" && children(t).some(o => /^(?:小船|船|舟|筏子|筏)$/u.test(o.text)));
        const boundedDisposal = /(?:把|将|將)(?:那|这|這|小|一|只|隻|艘){0,5}(?:舟子|小船|船|舟|筏子|木筏|竹筏)$/u.test(left);
        if (craft || surfaceCraft || disposal || boundedDisposal) emit(at, "rowing-argument", [ craft?.text || "船" ], "rowing-argument");
    }
    return out;
};

"use strict";

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const body = /^(?:眼|眼睛|双眼|雙眼|脸|臉|面|头|頭|口鼻)$/u;

const coverMaterial = /^(?:手|手掌|双手|雙手|布|黑布|白布|毛巾|手帕|衣袖|围巾|圍巾|纱布|紗布|眼罩)$/u;

const tax = /^(?:赋|賦|税|稅|地税|地稅|田赋|田賦|租税|租稅|赋税|賦稅|贡赋|貢賦)$/u;

const refs = {
    cover: "https://dict.revised.moe.edu.tw/dictView.jsp?ID=1306",
    levy: "https://dict.revised.moe.edu.tw/dictView.jsp?ID=7557",
    bird: "https://dict.revised.moe.edu.tw/dictView.jsp?ID=2204"
};

function matches(text, tokens) {
    if (!tokens.some(t => /^(?:蒙(?:住|上|着|著)?|征|胡|雕|雕儿)$/u.test(t.text))) return [];
    const result = [], children = tokens.map(() => []);
    tokens.forEach((t, i) => {
        if (Number.isInteger(t.parent) && t.parent >= 0 && t.parent < tokens.length && t.parent !== i) children[t.parent].push(t);
    });
    const add = (t, target, rule, reason, reference) => result.push({
        start: t.start,
        end: t.start + 1,
        source: t.text[0],
        target: target,
        pos: t.pos,
        kind: "shared-syntax-sense",
        rule: rule,
        reason: reason,
        ...reference ? {
            reference: reference
        } : {}
    });
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i], kids = children[i], head = tokens[t.parent];
        if (text.slice(t.start, t.end) !== t.text || proper.has(t.pos)) continue;
        if (t.pos === "v" && /^蒙(?:住|上|着|著)?$/u.test(t.text) && kids.some(k => k.relation === "VOB" && k.pos === "n" && body.test(k.text))) {
            const material = kids.some(k => k.relation === "SBV" && k.pos === "n" && coverMaterial.test(k.text) || k.relation === "ADV" && /^(?:用|以|拿|被)$/u.test(k.text) && children[tokens.indexOf(k)].some(c => [ "POB", "VOB" ].includes(c.relation) && c.pos === "n" && coverMaterial.test(c.text)));
            if (material) add(t, "蒙", "physical-cover-arguments", "蒙的直接賓語為頭面部位，並有手掌／布料等直接施事或工具依存證據；允許體標記和領屬修飾，不把欺騙或抽象蒙蔽改為覆蓋義。", refs.cover);
        }
        if (t.text === "征" && t.pos === "v" && kids.some(k => k.relation === "VOB" && k.pos === "n" && tax.test(k.text))) add(t, "徵", "levy-tax-object", "征作動詞，直接支配稅賦名詞，取徵收義；征戰、征服及姓名不套用。", refs.levy);
        if (t.text === "胡" && t.pos === "n" && t.relation === "VOB" && head?.pos === "v" && /^(?:捋|捻|拈|刮|揪)$/u.test(head.text)) add(t, "鬍", "beard-grooming-object", "胡為捋／捻／刮等整理動作的名詞賓語；合併的人名和胡琴等複合詞不拆開。");
        if (/^(?:雕|雕儿)$/u.test(t.text) && t.pos === "n" && t.relation === "SBV" && head?.pos === "v" && /^(?:飞(?:[上下起落来來去到向走回过過出入]|翔)*|飞来飞去|盘旋|盤旋|啄(?:食)?|振翅)$/u.test(head.text) && !kids.some(k => k.relation === "ATT" && k.pos === "n")) add(t, "鵰", "bird-agent-predicate", "獨立雕名詞作飛翔、盤旋或啄食的主語，取鳥類義；有名詞材質修飾、雕刻動詞或合併專名時不推斷。", refs.bird);
    }
    return result;
}

module.exports = {
    matches: matches,
    version: "joint-r7-v1"
};

"use strict";

const proper = new Set([ "nh", "nhf", "nhs", "ns", "ni", "nz" ]);

const rowingObjects = require("../dictionaries/semantic-context.json").hua.rowing_objects;

const boundary = /[，,。！？!?；;：:\n]/u;

const relevant = /^(?:(?:(?:合|兼|吞|归|歸|收)?并)|松(?:[手脚腳口绑綁])?|一干|里|[日夜晨晚]里|[大小]?坛|只|斗(?:酒)?|仆|卷|划(?:动|動|到|向|往|回|去|来|來|过|過)?)$/u;

function matches(text, tokens, neighbors = {}) {
    const result = [];
    const add = (t, offset, target, rule, reason) => result.push({
        start: t.start + offset,
        end: t.start + offset + 1,
        source: text[t.start + offset],
        target: target,
        pos: t.pos,
        kind: "hanlp-structural-sense",
        rule: rule,
        reason: reason
    });
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i], prev = tokens[i - 1], next = tokens[i + 1];
        if (proper.has(t.pos) || text.slice(t.start, t.end) !== t.text) continue;
        if (!relevant.test(t.text)) continue;
        const left = text.slice(0, t.start).split(boundary).at(-1), right = text.slice(t.end).split(boundary)[0];
        if (t.pos === "v" && /^(?:合|兼|吞|归|歸|收)并$/u.test(t.text)) add(t, t.text.length - 1, "併", "merge-verb", "合、兼、吞、歸、收等動詞成分與併構成合入動作，非平行並列。");
        if (t.text === "并") {
            const nominal = next && next.start === t.end && /^n/u.test(next.pos) && !proper.has(next.pos);
            const parallel = nominal && (/^(?:肩|排|列|行|肩膀|脚|腳|足|手|腿|辔|轡|驾|駕|轨|軌)/u.test(next.text) || /^(?:齐|齊|一同|同时|同時)/u.test(text.slice(next.end)));
            const objectVerb = t.pos === "v" && t.relation !== "ATT" && nominal && !parallel;
            const nominalized = nominal && !parallel && (/^(?:之(?:议|議|事)|一事|之后|之後|之前)/u.test(text.slice(next.end)) || t.pos === "v" && (/^的/u.test(text.slice(next.end)) || /(?:支持|同意|反对|反對|赞成|贊成|主张|主張|建议|建議|否决|否決)$/u.test(left)));
            const resultComplement = t.pos === "v" && /^(?:成|作|为|為|在)(?:了)?(?:一(?:个|個|处|處|体|體|块|塊)?|一起)/u.test(right);
            if (objectVerb || nominalized || resultComplement) add(t, 0, "併", "merge-construction", "動詞帶名詞賓語、事件名詞化或合為一體的結果結構；排除並肩、並排等並列關係。");
        }
        if (t.text === "松" && [ "n", "v", "a" ].includes(t.pos)) {
            const changeState = /(?:手|心|心头|心頭|骨头|骨頭|头|頭|浑身|渾身|全身|身体|身體|筋骨)(?:中|上|里|裏)?(?:又是|便是|已是)?(?:一|大|微微|稍稍|陡|顿|頓|突然)$/u.test(left);
            const releaseBinding = /^(?:了|开|開)?(?:我|他|她|其|这|這|那)?(?:的)?绑/u.test(right);
            if (changeState || releaseBinding) add(t, 0, "鬆", "state-predicate", "身體／感受主語後的狀態變化或鬆綁的動賓結構，恢復鬆緩義。");
        }
        if (t.text === "里" && t.pos === "q" && prev && ([ "nl", "nd" ].includes(prev.pos) || prev.pos === "n" && /(?:屋|房|室|宫|宮|殿|院|楼|樓|店|角落|朝廷|箱|盒|袋|洞|坑|水|心|脑|腦|眼|怀|懷|口|肚|手)$/u.test(prev.text)) && prev.end === t.start && !/[零〇一二两兩三四五六七八九十百千万萬亿億几幾数數0-9]$/u.test(prev.text)) add(t, 0, "裏", "locative-head", "名詞／處所詞後的里為方位成分；前項為數量時不套用。");
        if (t.pos === "nt" && /^[日夜晨晚]里$/u.test(t.text)) add(t, t.text.length - 1, "裏", "temporal-locative", "時間名詞加里為時間範圍方位結構，非里程。");
        if (/^[大小]?坛$/u.test(t.text) && [ "n", "q", "mq" ].includes(t.pos) && /^(?:[大小]?)[“「『‘"]?(?:[\p{Script=Han}]{0,4})?(?:酒|清水|醋|酿|釀)/u.test(right)) {
            const counted = prev && [ "m", "mq", "r" ].includes(prev.pos) || prev && prev.pos === "a" && /^[大小]$/u.test(prev.text) && tokens[i - 2]?.pos === "m";
            if (counted) add(t, t.text.length - 1, "罈", "counted-vessel", "數詞／指示詞加大小修飾及酒水內容物，容器罈不受分詞合併方式影響。");
        }
        if (t.pos === "v" && /^松[手脚腳口绑綁]$/u.test(t.text)) add(t, 0, "鬆", "release-object", "動詞鬆帶身體部位或綁縛賓語，非松樹名詞。");
        if (t.text === "只" && [ "d", "n" ].includes(t.pos) && prev?.pos === "m" && /^[零〇一二两兩三四五六七八九十百千万萬亿億几幾数數0-9]+$/u.test(prev.text) && next && /^n/u.test(next.pos) && prev.end === t.start && next.start === t.end) add(t, 0, "隻", "numeral-classifier-noun", "數詞＋只＋名詞構成量詞短語，修復副詞／名詞標籤造成的匹配缺口。");
        if (t.text === "斗" && t.pos === "n" && prev?.pos !== "m" && (/^(?:将|將)(?:下|上|出|起)(?:去|来|來)/u.test(right) || /^到(?:酣处|酣處|天明|深夜|最后|最後)/u.test(right))) add(t, 0, "鬥", "event-complement", "斗後接持續趨向或終點補語，為交鬥事件，前有數詞時排除容量義。");
        if (t.text === "斗酒" && t.pos === "v" && /(?:跟|与|與|和|同)[^，,。；;]{1,8}$/u.test(left)) add(t, 0, "鬥", "comitative-contest", "與對手鬥酒的動詞結構，非一斗酒的容量名詞。");
        const numeralBefore = prev && [ "m", "mq", "q" ].includes(prev.pos) || /[一二两兩三四五六七八九十百千万萬数數几幾0-9]$/u.test(left);
        if (t.text === "斗" && [ "n", "q", "v" ].includes(t.pos) && !numeralBefore && (/^得(?:[\p{Script=Han}]{1,8})/u.test(right) || /^(?:不多时|不多時|了?(?:[一二两兩三四五六七八九十百千数數几幾]+)(?:个|個)?(?:回合|招|合|时辰|時辰|小时|小時))/u.test(right))) add(t, 0, "鬥", "combat-complement", "程度、時量或回合補語限定交鬥事件；排除前接數量的容量名詞。");
        if (t.text === "仆" && [ "n", "v" ].includes(t.pos) && !/(?:的|之|主|奴|家|老)$/u.test(left) && (!numeralBefore && /^(?:倒(?:在)?(?:地|地下)|地(?:不起|跪倒|而起|而亡))/u.test(right) || /一$/u.test(left) && /^一跌/u.test(right))) add(t, 0, "仆", "fall-result", "仆與倒地、仆地的結果結構或一仆一跌反覆結構；排除僕人的名詞限定語。");
        if (t.text === "卷" && [ "v", "n", "q" ].includes(t.pos) && /^[\s（(【\[]*$/u.test(left) && /^[零〇一二两兩三四五六七八九十百千万萬0-9]+(?:[终終完]|[）)】\]\s]|$)/u.test(right)) add(t, 0, "卷", "volume-label", "獨立卷次標題的卷＋序數結構，不按動詞標籤轉成捲。");
        if (/^划(?:动|動)?$/u.test(t.text) && t.pos === "v") {
            const instrument = /(?:刀|刃|剑|劍|笔|筆|柴|刀锋|刀鋒|刀尖|剑尖|劍尖|笔尖|筆尖)(?:在[^，,。；;]{0,6}|[却卻仍正又已]*在?[向往][上下])?$/u.test(left);
            const objectText = right.replace(/^(?:着|著|了)?(?:一[只隻艘条條叶葉])?/u, "");
            if (instrument && !rowingObjects.some(w => objectText.startsWith(w))) add(t, 0, "劃", "stroke-instrument", "刀刃或書寫工具作局部施事／工具，划動表示切劃或筆劃；直接撥水賓語優先。");
        }
        if (/^划(?:到|向|往|回|去|来|來|过|過)?$/u.test(t.text) && t.pos === "v") {
            const directBoat = prev && prev.end === t.start && /^n/u.test(prev.pos) && /(?:舟|船|艇|筏|舟楫)$/u.test(prev.text);
            const nearbyTool = /(?:船|舟|艇|筏|桨|槳)[，,]?$/u.test(text.slice(0, t.start));
            const destination = /^(?:划)?(?:到|向|往|回|去|来|來|过|過)(?:无水处|無水處|岸|江岸|河岸|对岸|對岸|湖心|江心|河心)/u.test(t.text.slice(1) + right);
            if (destination && (directBoat || nearbyTool)) add(t, 0, "划", "rowing-destination", "船舟主語或緊接船槳工具，配合水上目的地補語，表示划行。");
        }
        if (t.text === "坛" && [ "n", "q" ].includes(t.pos) && /^(?:畅饮|暢飲|痛饮|痛飲|喝|饮|飲)/u.test(right) && prev?.pos === "v" && /(?:捧|抱|举|舉|持)$/u.test(prev.text)) add(t, 0, "罈", "held-drinking-vessel", "捧抱舉持的物體緊接飲用動作，確定酒罈容器義。");
    }
    return result;
}

module.exports = {
    matches: matches
};

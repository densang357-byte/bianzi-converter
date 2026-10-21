(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(); else root.BianziProofreading = factory();
})(typeof globalThis === "object" ? globalThis : this, function() {
    "use strict";
    function indexCatalogue(entries) {
        const index = new Map;
        index.riskTrie = new Map;
        for (const entry of entries) {
            if (entry.type === "risk-word") {
                for (const word of new Set([ entry.source, ...entry.activeTargets, ...entry.matchForms || [] ])) {
                    let node = index.riskTrie;
                    for (const c of word) {
                        if (!node.has(c)) node.set(c, new Map);
                        node = node.get(c);
                    }
                    if (!node.risk) node.risk = {
                        candidates: [],
                        sources: [],
                        byPos: {},
                        defaultsByPos: {},
                        reviewClass: "risk",
                        risk: true
                    };
                    node.risk.candidates = [ ...new Set([ ...node.risk.candidates, ...entry.activeTargets ]) ];
                    node.risk.sources = [ ...new Set([ ...node.risk.sources, entry.source ]) ];
                    for (const [pos, targets] of Object.entries(entry.byPos)) node.risk.byPos[pos] = [ ...new Set([ ...node.risk.byPos[pos] || [], ...targets ]) ];
                    Object.assign(node.risk.defaultsByPos, entry.defaultsByPos || {});
                    if (entry.frequency && (!node.risk.frequency || (entry.frequency.errors || 0) > (node.risk.frequency.errors || 0))) node.risk.frequency = entry.frequency;
                    if (entry.reason) node.risk.reason = entry.reason;
                    if (entry.condition) node.risk.condition = entry.condition;
                    if (entry.matchBoundary) node.risk.matchBoundary = entry.matchBoundary;
                    if (entry.suppressNounPos) node.risk.suppressNounPos = true;
                    if (entry.riskKind) node.risk.riskKind = entry.riskKind;
                    if (entry.excludeBeforePattern) node.risk.excludeBeforePattern = entry.excludeBeforePattern;
                }
                continue;
            }
            const targets = [ ...new Set(entry.activeTargets) ].filter(c => Array.from(c).length === 1);
            if (targets.length < 2) continue;
            for (const char of new Set([ entry.source, ...targets ])) {
                const row = index.get(char) || {
                    candidates: [],
                    sources: [],
                    reviewClass: entry.reviewClass || "uncommon"
                };
                row.candidates = [ ...new Set([ ...row.candidates, ...targets ]) ];
                if (entry.frequency && (!row.frequency || (entry.frequency.errors || 0) > (row.frequency.errors || 0))) row.frequency = entry.frequency;
                row.sources = [ ...new Set([ ...row.sources, entry.source ]) ];
                index.set(char, row);
            }
        }
        return index;
    }
    function scan(text, index, tokens = []) {
        const items = [];
        let offset = 0;
        const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", {
            granularity: "word"
        }) : null;
        const boundaries = segmenter ? new Set([ ...segmenter.segment(text) ].flatMap(t => [ t.index, t.index + t.segment.length ])) : null;
        while (offset < text.length) {
            let node = index.riskTrie, at = offset, match = null;
            if (node) while (at < text.length) {
                const c = String.fromCodePoint(text.codePointAt(at));
                node = node.get(c);
                if (!node) break;
                at += c.length;
                const left = text.slice(0, offset).trimEnd();
                const condition = !node.risk?.condition || node.risk.condition !== "isolated-exclamation" || !left || /[。！？!?；;：:，,\n「『“"‘']$/u.test(left);
                const excluded = node.risk?.excludeBeforePattern && new RegExp(node.risk.excludeBeforePattern, "u").test(text.slice(0, offset));
                const person = node.risk?.matchBoundary === "person-name";
                const tokenOnly = node.risk?.matchBoundary === "token";
                const exact = tokens.find(t => t.start === offset && t.end === at);
                const noun = node.risk?.suppressNounPos && exact && /^n/u.test(exact.pos || "") && exact.pos !== "nt";
                const tokenMatch = !tokenOnly || (tokens.length ? !!exact : !boundaries || boundaries.has(offset) && boundaries.has(at));
                const personMatch = person && tokens.some(t => t.start <= offset && t.end >= at && text.slice(t.start, t.end) === t.text && /^(?:nh|nr|nr1|nr2|nrj|nrf|PER|PERSON)$/u.test(t.pos));
                if (node.risk && condition && !excluded && !noun && tokenMatch && (person ? personMatch : node.risk.matchBoundary === "literal" || tokenOnly || !boundaries || boundaries.has(offset) && boundaries.has(at))) match = {
                    ...node.risk,
                    offset: offset,
                    char: text.slice(offset, at)
                };
            }
            if (match) {
                items.push({
                    ...match,
                    candidates: [ ...new Set([ match.char, ...match.candidates ]) ]
                });
                offset += match.char.length;
                continue;
            }
            const char = String.fromCodePoint(text.codePointAt(offset)), row = index.get(char);
            if (row) items.push({
                offset: offset,
                char: char,
                candidates: [ ...new Set([ char, ...row.candidates ]) ],
                sources: row.sources,
                reviewClass: row.reviewClass,
                frequency: row.frequency
            });
            offset += char.length;
        }
        return items;
    }
    function reviewOrder(items, mode = "risk") {
        if (![ "risk", "text" ].includes(mode)) throw new Error("未知的校對順序。");
        const order = items.map((_, i) => i);
        return order.sort((a, b) => mode === "text" ? items[a].offset - items[b].offset : (items[b].frequency?.reviewEvidence?.assistantReviewedErrors ?? items[b].frequency?.errors ?? 0) - (items[a].frequency?.reviewEvidence?.assistantReviewedErrors ?? items[a].frequency?.errors ?? 0) || (items[b].frequency?.errorBooks || 0) - (items[a].frequency?.errorBooks || 0) || (items[b].frequency?.opportunities || 0) - (items[a].frequency?.opportunities || 0) || Number(Boolean(items[b].risk)) - Number(Boolean(items[a].risk)) || items[a].offset - items[b].offset);
    }
    function replaceAt(text, item, choice) {
        if (!item.candidates.includes(choice) || text.slice(item.offset, item.offset + item.char.length) !== item.char) throw new Error("文字已變動，請重新選擇校對位置。");
        return text.slice(0, item.offset) + choice + text.slice(item.offset + item.char.length);
    }
    function scope(units, separator = "") {
        let text = "";
        const spans = [];
        for (const [index, unit] of units.entries()) {
            if (index) text += separator;
            const start = text.length;
            text += unit.after ?? unit.before;
            spans.push({
                unit: unit,
                start: start,
                end: text.length
            });
        }
        return {
            text: text,
            spans: spans
        };
    }
    function updateScope(view, text) {
        if (text === view.text) return null;
        let start = 0, end = view.text.length, newEnd = text.length;
        while (start < end && start < newEnd && view.text[start] === text[start]) start++;
        while (end > start && newEnd > start && view.text[end - 1] === text[newEnd - 1]) {
            end--;
            newEnd--;
        }
        const span = view.spans.find(s => s.start <= start && end <= s.end && start < s.end);
        if (!span) throw new Error("校對位置已變動，請重新選字。");
        const old = span.unit.after ?? span.unit.before;
        span.unit.after = old.slice(0, start - span.start) + text.slice(start, newEnd) + old.slice(end - span.start);
        return span.unit;
    }
    function create(container, options) {
        const make = (tag, text, cls) => {
            const n = document.createElement(tag);
            if (text !== undefined) n.textContent = text;
            if (cls) n.className = cls;
            return n;
        };
        const title = make("h3", "選字校對"), note = make("p", "點選標出的字詞選擇候選。淡橙為需按語義核對的風險詞；參考舊樣本及本輪小說助理覆核排序。風險不等於錯誤，覆核數不代表準確率；保留原詞也可標為已核對。", "muted");
        const modeLabel = make("label", "校對模式 "), modeSelect = make("select"), modeStatus = make("p", "", "muted");
        modeSelect.setAttribute("aria-label", "校對模式");
        for (const [value, label] of [ [ "classical", "古典 · 完整候選" ], [ "modern", "現代 · OpenCC、新舊港臺、默認標準" ] ]) {
            const option = make("option", label);
            option.value = value;
            modeSelect.append(option);
        }
        modeLabel.append(modeSelect);
        modeStatus.setAttribute("role", "status");
        const orderLabel = make("label", "校對順序 "), orderSelect = make("select");
        orderSelect.setAttribute("aria-label", "校對順序");
        for (const [value, label] of [ [ "risk", "風險頻率" ], [ "text", "正文順序" ] ]) {
            const o = make("option", label);
            o.value = value;
            orderSelect.append(o);
        }
        orderLabel.append(orderSelect);
        const bar = make("div", undefined, "proof-toolbar"), previous = make("button", "← 上一處", "secondary"), next = make("button", "下一處 →", "secondary"), undo = make("button", "撤回上次選字", "text-button"), count = make("span");
        const picker = make("div", undefined, "proof-picker"), context = make("p"), choices = make("div", undefined, "proof-choices");
        const content = make("div", undefined, "proof-text");
        content.setAttribute("aria-label", "可選字校對正文");
        count.setAttribute("role", "status");
        bar.append(previous, next, undo, count);
        picker.append(context, choices);
        const legend = make("div", undefined, "proof-legend");
        for (const [kind, label] of [ [ "plain", "一對一 · 白底" ], [ "common", "常見分化 · 淡黃" ], [ "uncommon", "較少見分化 · 淡紫" ], [ "risk", "風險詞 · 淡橙" ] ]) {
            const item = make("span", label, "proof-key " + kind);
            legend.append(item);
        }
        legend.title = "常見：至少兩個候選的現有新聞／社群平均字頻達每百萬字 10 次；其餘多字形組（含資料不足）列為較少見。字頻不等於義項頻率。";
        container.append(title, modeLabel, orderLabel, modeStatus, note, legend, bar, picker, content);
        let index = new Map, items = [], order = [], selected = 0, record = null, currentText = "", writable = false, resetSelection = true;
        let loading = false, loadedMode = "classical", request = 0;
        async function loadCatalogue() {
            const ticket = ++request, mode = modeSelect.value;
            loading = true;
            modeStatus.textContent = "正在載入校對候選…";
            render();
            try {
                const entries = await options.loadCatalogue(mode);
                if (ticket !== request) return null;
                index = indexCatalogue(entries);
                loadedMode = mode;
                resetSelection = true;
                modeStatus.textContent = mode === "modern" ? "現代：合併 OpenCC 通用繁體、新舊港臺及默認標準（含可選異體）的候選。" : "古典：保留原有完整候選，包含古籍與其他收錄字形。";
                return entries;
            } catch (error) {
                if (ticket === request) {
                    modeSelect.value = loadedMode;
                    modeStatus.textContent = "候選載入失敗，保留原模式：" + error.message;
                }
                throw error;
            } finally {
                if (ticket === request) {
                    loading = false;
                    render();
                }
            }
        }
        modeSelect.addEventListener("change", () => {
            loadCatalogue().catch(() => {});
        });
        orderSelect.addEventListener("change", () => {
            resetSelection = true;
            render(true);
        });
        function render(focus = false) {
            const data = options.read();
            record = data?.record;
            writable = Boolean(data?.enabled) && !loading;
            currentText = data?.text || "";
            modeSelect.disabled = orderSelect.disabled = loading || !data?.enabled;
            items = scan(currentText, index, data?.tokens || []);
            order = reviewOrder(items, orderSelect.value);
            selected = resetSelection ? order[0] ?? 0 : Math.max(0, Math.min(selected, items.length - 1));
            resetSelection = false;
            const slot = order.indexOf(selected);
            const scrollTop = content.scrollTop;
            content.replaceChildren();
            let offset = 0;
            for (const [i, item] of items.entries()) {
                content.append(document.createTextNode(currentText.slice(offset, item.offset)));
                const b = make("button", item.char, "proof-char " + item.reviewClass + (i === selected ? " selected" : "") + (record?.checked?.has(item.offset) ? " checked" : ""));
                b.title = {
                    plain: "一對一",
                    common: "常見分化",
                    uncommon: "較少見分化／字頻資料不足",
                    risk: "風險詞：需按語境核對"
                }[item.reviewClass] + (item.frequency?.reviewEvidence ? `；助理覆核 ${item.frequency.reviewEvidence.assistantReviewedErrors} 處錯誤、${item.frequency.reviewEvidence.assistantReviewedKeeps} 處保留；不計準確率` : item.frequency?.legacyClassificationNote ? "；" + item.frequency.legacyClassificationNote : item.frequency?.opportunities ? `；樣本 ${item.frequency.errors}/${item.frequency.opportunities} 次轉錯，${item.frequency.errorBooks} 部作品` : "；此樣本未觀測風險頻率");
                b.type = "button";
                b.disabled = !writable;
                b.setAttribute("aria-label", `第 ${i + 1} 處：${item.char}`);
                b.setAttribute("aria-pressed", String(i === selected));
                b.addEventListener("click", () => {
                    selected = i;
                    render();
                });
                content.append(b);
                offset = item.offset + item.char.length;
            }
            content.append(document.createTextNode(currentText.slice(offset)));
            count.textContent = items.length ? `${slot + 1} / ${items.length} 處 · ${orderSelect.value === "risk" ? "按風險頻率" : "按正文順序"} · 風險詞 ${items.filter(i => i.risk).length} 處 · 已核對 ${items.filter(i => record?.checked?.has(i.offset)).length} 處` : "目前正文沒有此校對模式下可選的字。";
            previous.disabled = !writable || slot <= 0;
            next.disabled = !writable || slot >= items.length - 1;
            undo.disabled = !writable || !record?.history?.length;
            choices.replaceChildren();
            picker.hidden = !items.length || !writable;
            if (items.length && writable) {
                const item = items[selected];
                context.textContent = "…" + currentText.slice(Math.max(0, item.offset - 24), item.offset) + "【" + item.char + "】" + currentText.slice(item.offset + item.char.length, item.offset + 25) + "…";
                if (item.risk) context.textContent += " 風險詞：" + Object.entries(item.byPos).map(([pos, targets]) => {
                    const d = item.defaultsByPos?.[pos];
                    return pos + "：" + targets.join("／") + (d?.basis === "word-frequency" ? "（詞頻默認 " + d.target + "）" : "");
                }).join("；") + "。" + (item.reason || "候選仍需按語義核對。");
                if (item.frequency?.reviewEvidence) context.textContent += ` 本輪助理覆核 ${item.frequency.reviewEvidence.assistantReviewedErrors} 處錯誤、${item.frequency.reviewEvidence.assistantReviewedKeeps} 處正確保留，非全量抽樣，不計準確率。`; else if (item.frequency?.legacyClassificationNote) context.textContent += " " + item.frequency.legacyClassificationNote; else if (item.frequency?.opportunities) context.textContent += ` 樣本 ${item.frequency.errors}/${item.frequency.opportunities} 次轉錯，涉及 ${item.frequency.errorBooks} 部作品。` + (item.frequency.opportunities < 5 ? " 小樣本，不能當作普遍錯誤率。" : "");
                for (const candidate of item.candidates) {
                    const b = make("button", candidate + (candidate === item.char ? " · 保留" : ""), "secondary");
                    b.addEventListener("click", () => {
                        if (!options.read()?.enabled || options.read()?.text !== currentText) {
                            render();
                            return;
                        }
                        record.history ||= [];
                        record.checked ||= new Set;
                        record.history.push({
                            text: currentText,
                            checked: new Set(record.checked),
                            selected: selected
                        });
                        if (record.history.length > 100) record.history.shift();
                        record.checked.add(item.offset);
                        options.write(replaceAt(currentText, item, candidate));
                        selected = order[Math.min(slot + 1, order.length - 1)] ?? selected;
                        render(true);
                    });
                    choices.append(b);
                }
            }
            content.scrollTop = scrollTop;
            if (focus) content.querySelector(".selected")?.scrollIntoView({
                block: "nearest",
                behavior: "smooth"
            });
        }
        previous.addEventListener("click", () => {
            selected = order[Math.max(0, order.indexOf(selected) - 1)] ?? selected;
            render(true);
        });
        next.addEventListener("click", () => {
            selected = order[Math.min(order.length - 1, order.indexOf(selected) + 1)] ?? selected;
            render(true);
        });
        undo.addEventListener("click", () => {
            const last = record?.history?.pop();
            if (!last) return;
            record.checked = last.checked;
            selected = last.selected;
            options.write(last.text);
            render(true);
        });
        return {
            loadCatalogue: loadCatalogue,
            setCatalogue(entries) {
                if (entries) index = indexCatalogue(entries);
                resetSelection = true;
                render();
            },
            render: render,
            reset() {
                resetSelection = true;
                render();
            }
        };
    }
    return {
        indexCatalogue: indexCatalogue,
        scan: scan,
        reviewOrder: reviewOrder,
        replaceAt: replaceAt,
        scope: scope,
        updateScope: updateScope,
        create: create
    };
});

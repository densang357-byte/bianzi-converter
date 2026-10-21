"use strict";

const $ = id => document.getElementById(id);

const state = {
    direction: "s2t",
    result: null,
    ambiguous: [],
    page: 0,
    dictionary: [],
    busy: false,
    reviewLimit: 100,
    corrections: [],
    correctionLimit: 100,
    session: null,
    excludedCorrections: new Set,
    variants: [],
    variantGroups: [],
    profile: "modern",
    profiles: [],
    preserveZhe: true,
    usePosLexicon: false,
    replacements: {}
};

const storageKey = "bianzi.custom-dictionary.v1";

const correctionKey = "bianzi.corrections.v1";

const variantKey = "bianzi.variants.v1";

let correctionTimer, composing = false;

const pageSize = 40;

const sample = "这只是一只猫，头发干燥了。\n他干完工作后喝了一杯酒。\n皇后住在宫殿后面，里面的软件运行很慢。\n这只是个普通的句子。";

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function message(text, error = false) {
    $("message").textContent = text;
    $("message").className = error ? "error" : "";
    $("message").hidden = !text;
}

function invalidate() {
    saveCorrections();
    state.result = null;
    state.reviewLimit = 100;
    $("output").value = "";
    $("output").readOnly = true;
    $("output").classList.add("empty");
    $("output-count").textContent = "—";
    [ "copy", "download-text", "download-report" ].forEach(id => {
        $(id).disabled = true;
    });
    $("review-count").textContent = "";
    $("review-list").replaceChildren(element("div", "轉換後，這裏會逐句顯示原文與結果。", "blank-state"));
    $("restore-output").disabled = true;
    $("correction-status").textContent = "成品修改後會自動另存修正詞庫，不參與後續轉換。";
}

function updateInput() {
    $("input-count").textContent = Array.from($("input").value).length.toLocaleString() + " 字";
    invalidate();
}

async function api(path, options) {
    try {
        const response = await fetch(path, options);
        if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("轉換服務沒有返回有效結果，請檢查後端連線。");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "請求未完成。");
        window.dispatchEvent(new CustomEvent("bianzi-backend-status", {
            detail: {
                connected: true
            }
        }));
        return data;
    } catch (error) {
        window.dispatchEvent(new CustomEvent("bianzi-backend-status", {
            detail: {
                connected: false
            }
        }));
        throw error;
    }
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([ content ], {
        type: type
    }));
    const link = element("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
}

function escape(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    saveCorrections();
    window.BianziFiles?.save();
    document.querySelectorAll("[data-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
    [ "convert", "files", "characters", "custom", "corrections" ].forEach(name => {
        $(name + "-panel").hidden = name !== button.dataset.tab;
    });
    message("");
}));

document.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => {
    if (state.busy) return;
    state.direction = button.dataset.direction;
    document.querySelectorAll("[data-direction]").forEach(item => item.classList.toggle("active", item === button));
    $("input-label").textContent = state.direction === "s2t" ? "簡體中文" : "繁體中文";
    $("output-label").textContent = "可直接修改成品";
    invalidate();
}));

$("input").addEventListener("input", updateInput);

$("mode").addEventListener("change", () => {
    $("mode-hint").textContent = $("mode").value === "fast" ? "快速模式使用 HanLP，分析分詞、詞性與句法；首次載入模型需要一些時間。" : "慢速模式使用 LTP，分析分詞、詞性與句法；首次載入模型需要一些時間。";
    invalidate();
});

$("sample").addEventListener("click", () => {
    $("input").value = sample;
    updateInput();
});

$("clear").addEventListener("click", () => {
    $("input").value = "";
    updateInput();
    message("");
});

$("input").addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        $("convert").click();
    }
});

$("convert").addEventListener("click", async () => {
    if (state.busy) return;
    if (!$("input").value.trim()) {
        message("請先輸入要轉換的文字。", true);
        $("input").focus();
        return;
    }
    try {
        state.replacements = readReplacementSettings();
    } catch (error) {
        message(error.message, true);
        return;
    }
    saveCorrections();
    state.busy = true;
    const text = $("input").value;
    $("convert").disabled = true;
    $("convert").classList.add("busy");
    $("convert").textContent = "正在轉換…";
    $("input").readOnly = true;
    $("mode").disabled = true;
    setProfileBusy(true);
    $("output").readOnly = true;
    document.querySelectorAll("#standard-settings input").forEach(input => {
        input.disabled = true;
    });
    [ "sample", "clear" ].forEach(id => {
        $(id).disabled = true;
    });
    message("正在以 " + modeLabel($("mode").value) + " 分析與轉換。首次載入模型可能需要一段時間。");
    try {
        state.result = await api("/api/convert", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text,
                direction: state.direction,
                mode: $("mode").value,
                dictionary: state.dictionary,
                variants: state.variants,
                profile: state.profile,
                preserveZhe: state.preserveZhe,
                usePosLexicon: state.usePosLexicon,
                replacements: state.replacements
            })
        });
        state.session = crypto.randomUUID();
        state.excludedCorrections = new Set;
        state.reviewLimit = 100;
        $("output").value = state.result.text;
        $("output").classList.remove("empty");
        $("correction-status").textContent = "可直接修改成品；修改會另存修正詞庫，不參與轉換。";
        $("restore-output").disabled = true;
        $("output-count").textContent = Array.from(state.result.text).length.toLocaleString() + " 字 · " + (state.result.elapsed_ms / 1e3).toFixed(2) + " 秒" + (state.result.engine && state.result.stats.analysis ? ` · 分析 ${state.result.stats.analysis.analyzed_sentences} 句／跳過 ${state.result.stats.analysis.skipped_sentences} 句` : "");
        [ "copy", "download-text", "download-report" ].forEach(id => {
            $(id).disabled = false;
        });
        renderReview();
        const stats = state.result.stats;
        const summary = `完成轉換。${stats.ambiguous_sentences} ${state.result.sentences.some(s => s.pipeline) ? "個區塊" : "句"}含一簡多繁字，${stats.context_choices} 處由語境／分義規則選字，${stats.custom_hits} 處套用自訂規則。`;
        const analysis = stats.analysis;
        const lexiconSummary = state.result.stats.pos_lexicon?.enabled ? `詞性詞庫已啟用，匹配 ${state.result.stats.pos_lexicon.hits} 個詞。` : "詞性詞庫未啟用。";
        const analysisSummary = lexiconSummary + " " + (state.result.engine && analysis ? `詞性分析 ${analysis.analyzed_sentences} 句，跳過 ${analysis.skipped_sentences} 句；需要分析的句子保留完整語境。` : "");
        message([ summary, analysisSummary, ...state.result.warnings ].join(" "));
    } catch (error) {
        invalidate();
        message(error.message, true);
    } finally {
        state.busy = false;
        $("convert").disabled = false;
        $("convert").classList.remove("busy");
        $("convert").replaceChildren(document.createTextNode("開始轉換 "), element("span", "→"));
        $("input").readOnly = false;
        $("mode").disabled = false;
        setProfileBusy(false);
        $("output").readOnly = !state.result;
        document.querySelectorAll("#standard-settings input").forEach(input => {
            input.disabled = false;
        });
        [ "sample", "clear" ].forEach(id => {
            $(id).disabled = false;
        });
    }
});

function renderReview() {
    if (!state.result) return;
    const sentences = currentRecords().filter(sentence => sentence.before.trim() && (!$("only-ambiguous").checked || sentence.occurrences.length || sentence.riskWords?.length || sentence.manuallyEdited));
    $("review-count").textContent = `／ ${sentences.length} 句`;
    $("review-list").replaceChildren();
    if (!sentences.length) {
        $("review-list").append(element("div", "這段文字沒有含一簡多繁字的句子。取消勾選可查看全部句子。", "blank-state"));
        return;
    }
    for (const [index, sentence] of sentences.slice(0, state.reviewLimit).entries()) {
        const card = element("article", undefined, "sentence-card");
        const heading = element("div", undefined, "sentence-header");
        heading.append(element("span", String(index + 1).padStart(2, "0") + " ／ 句子檢視"));
        const badges = element("div");
        if (sentence.manuallyEdited) badges.append(element("span", "已人工修正", "badge custom"));
        badges.append(element("span", sentence.changed ? "已轉換" : "字形未變", "badge"));
        if (sentence.choices.length) badges.append(element("span", "規則選字 " + sentence.choices.length + " 處", "badge"));
        if (sentence.custom.length) badges.append(element("span", "自訂詞條 " + sentence.custom.length + " 處", "badge custom"));
        heading.append(badges);
        card.append(heading);
        for (const [after, label] of [ [ false, "原文" ], [ true, "結果" ] ]) {
            const row = element("div", undefined, "compare-line" + (after ? " after" : ""));
            row.append(element("small", label));
            const content = element("div");
            for (const part of sentence.diff) {
                if (after ? part.removed : part.added) continue;
                content.append(element((after ? part.added : part.removed) ? "mark" : "span", part.value));
            }
            row.append(content);
            card.append(row);
        }
        const candidates = element("div", undefined, "candidate-list");
        for (const occurrence of sentence.occurrences) {
            const chip = element("span", occurrence.source + " → " + occurrence.candidates.join(" · ") + (occurrence.pos ? "  [" + occurrence.pos + "]" : ""), "candidate-chip");
            chip.title = "目前可用候選：" + occurrence.candidates.join(" · ") + "；原句位置 " + (occurrence.offset + 1);
            candidates.append(chip);
        }
        for (const risk of sentence.riskWords || []) {
            const chip = element("span", "風險詞：" + risk.source + " [" + risk.pos + "] → " + risk.candidates.join(" · "), "candidate-chip risk-word");
            chip.title = risk.reason + (risk.frequency?.opportunities ? `；樣本 ${risk.frequency.errors}/${risk.frequency.opportunities} 次轉錯，${risk.frequency.errorBooks} 部作品` : "");
            candidates.append(chip);
        }
        card.append(candidates);
        if (sentence.pipeline) {
            card.append(element("p", "自訂流程區塊：包含前後取代及保護字詞；差異對照原始輸入。", "form-note"));
            for (const hit of sentence.custom.slice(0, 30)) card.append(element("p", `${{
                protect: "保護",
                pre: "轉換前",
                post: "轉換後",
                dictionary: "指定詞條"
            }[hit.phase]}：${hit.source} → ${hit.target || "（刪除）"} · ${hit.count || 1} 處`, "form-note"));
        }
        const explained = sentence.choices.filter(choice => choice.reason);
        for (const choice of explained) card.append(element("p", `${choice.source} → ${choice.target}${choice.pos ? ` [${choice.pos}]` : ""}：${choice.reason}`, "form-note"));
        if (sentence.analysisCorrections?.length) {
            const details = element("details");
            details.append(element("summary", "詞性與詞界校正（原始模型標籤保留如下）"));
            for (const c of sentence.analysisCorrections) details.append(element("p", `${c.original.map(t => t.text + "/" + t.pos).join(" + ")} → ${c.source}/${c.pos}：${c.reason}`, "form-note"));
            card.append(details);
        }
        if (sentence.tokens.length) {
            const tokens = element("div", undefined, "pos-list");
            for (const token of sentence.tokens) {
                const pill = element("span", token.text);
                pill.append(element("small", token.pos));
                tokens.append(pill);
            }
            card.append(tokens);
        }
        $("review-list").append(card);
    }
    if (sentences.length > state.reviewLimit) {
        const more = element("button", `已顯示 ${state.reviewLimit} / ${sentences.length} 句，載入接續 100 句 ↓`, "secondary");
        more.addEventListener("click", () => {
            state.reviewLimit += 100;
            renderReview();
        });
        $("review-list").append(more);
    }
}

$("only-ambiguous").addEventListener("change", () => {
    state.reviewLimit = 100;
    renderReview();
});

$("copy").addEventListener("click", async () => {
    saveCorrections();
    try {
        await navigator.clipboard.writeText($("output").value);
        message("已複製目前成品（包含人工修正）。");
    } catch {
        message("無法寫入剪貼簿，請直接選取結果文字複製。", true);
    }
});

$("download-text").addEventListener("click", () => {
    saveCorrections();
    download("辨字-轉換結果.txt", $("output").value, "text/plain;charset=utf-8");
});

$("download-report").addEventListener("click", () => {
    saveCorrections();
    const records = currentRecords().filter(sentence => sentence.before.trim() && (!$("only-ambiguous").checked || sentence.occurrences.length || sentence.riskWords?.length || sentence.manuallyEdited));
    const html = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>辨字差異報告</title>' + "<style>body{max-width:1000px;margin:40px auto;padding:20px;font:16px/1.9 sans-serif;color:#253a32}article{padding:20px;border:1px solid #ddd;margin:15px 0;white-space:pre-wrap;overflow-wrap:anywhere}mark{background:#f8e3db}.after mark{background:#deede1}small{color:#7b8277}</style>" + "<h1>辨字 · 轉換差異報告</h1><p>" + escape(profileLabel(state.result.profile)) + " · " + escape(state.result.direction) + " · " + modeLabel(state.result.mode) + "</p>" + records.map(sentence => "<article><small>原文</small><div>" + sentence.diff.filter(part => !part.added).map(part => part.removed ? "<mark>" + escape(part.value) + "</mark>" : escape(part.value)).join("") + "</div><small>" + (sentence.manuallyEdited ? "成品（已人工修正）" : "成品") + '</small><div class="after">' + sentence.diff.filter(part => !part.removed).map(part => part.added ? "<mark>" + escape(part.value) + "</mark>" : escape(part.value)).join("") + "</div><small>" + sentence.occurrences.map(item => escape(item.source + " → " + item.candidates.join(" / "))).join("；") + "</small></article>").join("") + "</html>";
    download("辨字-差異報告.html", html, "text/html;charset=utf-8");
});

function renderCharacters() {
    const query = $("character-search").value.trim();
    const priority = $("character-priority").value;
    const subcategory = $("character-subcategory").value;
    const matches = state.ambiguous.filter(entry => (!subcategory || entry.subcategories?.includes(subcategory)) && (!priority || String(entry.priority) === priority) && (!query || entry.source.includes(query) || entry.activeTargets.some(target => target.includes(query))));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    state.page = Math.min(state.page, pages - 1);
    $("character-table").replaceChildren();
    for (const entry of matches.slice(state.page * pageSize, (state.page + 1) * pageSize)) {
        const row = element("tr");
        [ entry.source, entry.activeTargets.join(" · ") ].forEach(value => row.append(element("td", value)));
        const priorityCell = element("td");
        for (const target of entry.activeTargets) {
            const branch = (entry.branches || []).find(branch => branch.target === target);
            const examples = branch?.conversionExamples || [];
            priorityCell.append(element("strong", target + "：" + (examples.join("、") || "分化用例待逐義核對")));
            if (!branch) {
                priorityCell.append(element("small", "各表頻次尚未核對"));
                continue;
            }
            const frequency = value => value ? `${value.count ?? "未收錄"} 次；每百萬字 ${value.perMillion ?? "未收錄"}` : "未收錄";
            priorityCell.append(element("small", `新聞字頻：${frequency(branch.news)}｜社群字頻：${frequency(branch.social)}`));
            const historical = Object.entries(branch.historical || {}).map(([name, value]) => `${name}：${value.count ?? "未收錄"} 次`).join("；");
            if (historical) priorityCell.append(element("small", historical));
            const words = (branch.frequencyExamples || []).map(x => `${x.word}：${x.meanPerMillionWords == null ? "未收錄" : Number(x.meanPerMillionWords.toFixed(3))}`).join("；");
            if (words) {
                const raw = element("details");
                raw.append(element("summary", "原表詞頻詞例（不作本標準分化用例）"));
                raw.append(element("small", "每百萬詞：" + words));
                priorityCell.append(raw);
            }
            priorityCell.append(element("small", "華語文基準漢字等級：" + (branch.teachingLevel || "未收錄")));
        }
        priorityCell.className = "priority-cell";
        row.append(priorityCell);
        $("character-table").append(row);
    }
    if (!matches.length) {
        const row = element("tr"), cell = element("td", "沒有找到符合的字。");
        cell.colSpan = 3;
        row.append(cell);
        $("character-table").append(row);
    }
    $("character-result-count").textContent = `共 ${matches.length} 個字`;
    $("page-count").textContent = `${state.page + 1} / ${pages}`;
    $("previous-page").disabled = state.page === 0;
    $("next-page").disabled = state.page + 1 >= pages;
}

$("character-search").addEventListener("input", () => {
    state.page = 0;
    renderCharacters();
});

$("character-subcategory").addEventListener("change", () => {
    state.page = 0;
    renderCharacters();
});

$("character-priority").addEventListener("change", () => {
    state.page = 0;
    renderCharacters();
});

$("previous-page").addEventListener("click", () => {
    state.page--;
    renderCharacters();
});

$("next-page").addEventListener("click", () => {
    state.page++;
    renderCharacters();
});

$("export-ambiguous").addEventListener("click", () => download(profileLabel(state.profile) + "-一簡多繁字庫.json", JSON.stringify(state.ambiguous, null, 2), "application/json;charset=utf-8"));

$("lookup-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        const results = await api("/api/lookup?q=" + encodeURIComponent($("lookup-input").value.trim()));
        $("lookup-results").replaceChildren();
        for (const result of results) {
            const row = element("div", undefined, "lookup-result");
            row.append(element("span", result.source + " → " + result.targets.join(" / ")), element("small", result.dictionary));
            $("lookup-results").append(row);
        }
        if (!results.length) $("lookup-results").append(element("p", "沒有找到相符詞條。", "muted"));
    } catch (error) {
        message(error.message, true);
    }
});

function validateRules(entries) {
    if (!Array.isArray(entries) || entries.length > 2e3) throw new Error("詞庫須為 JSON 陣列，最多 2000 條。");
    const keys = new Set;
    return entries.map(entry => {
        if (!entry || typeof entry.source !== "string" || !entry.source.length || typeof entry.target !== "string" || !entry.target.length || entry.source.length > 500 || entry.target.length > 500 || ![ "s2t", "t2s" ].includes(entry.direction)) throw new Error("詞條須包含有效的 source、target 及 direction。");
        const pos = entry.pos || "";
        if (typeof pos !== "string" || !/^[a-z]*$/.test(pos)) throw new Error("詞性須為 LTP 小寫標籤。");
        const key = JSON.stringify([ entry.source, entry.direction, pos ]);
        if (keys.has(key)) throw new Error("詞庫含重複的原文、方向及詞性。");
        keys.add(key);
        return {
            id: crypto.randomUUID(),
            source: entry.source,
            target: entry.target,
            direction: entry.direction,
            pos: pos,
            enabled: entry.enabled !== false
        };
    });
}

function persistRules() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(state.dictionary));
    } catch {
        message("詞庫已更新，但瀏覽器無法儲存；請匯出 JSON 備份。", true);
    }
    renderCustom();
    invalidate();
}

function resetForm() {
    $("custom-form").reset();
    $("edit-id").value = "";
    $("save-rule").textContent = "新增詞條";
    $("cancel-edit").hidden = true;
}

function renderCustom() {
    $("custom-count").textContent = state.dictionary.length;
    $("custom-table").replaceChildren();
    $("custom-empty").hidden = !!state.dictionary.length;
    for (const entry of state.dictionary) {
        const row = element("tr"), active = element("td"), checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.checked = entry.enabled;
        checkbox.setAttribute("aria-label", "啟用詞條 " + entry.source);
        checkbox.addEventListener("change", () => {
            entry.enabled = checkbox.checked;
            persistRules();
        });
        active.append(checkbox);
        row.append(active);
        [ entry.source, entry.target, entry.direction === "s2t" ? "簡 → 繁" : "繁 → 簡", entry.pos || "不限" ].forEach(value => row.append(element("td", value)));
        const actions = element("td"), edit = element("button", "編輯", "text-button"), remove = element("button", "刪除", "delete-button");
        edit.addEventListener("click", () => {
            $("edit-id").value = entry.id;
            $("custom-source").value = entry.source;
            $("custom-target").value = entry.target;
            $("custom-direction").value = entry.direction;
            $("custom-pos").value = entry.pos;
            $("save-rule").textContent = "儲存修改";
            $("cancel-edit").hidden = false;
            $("custom-source").focus();
        });
        remove.addEventListener("click", () => {
            state.dictionary = state.dictionary.filter(rule => rule.id !== entry.id);
            if ($("edit-id").value === entry.id) resetForm();
            persistRules();
        });
        actions.append(edit, remove);
        row.append(actions);
        $("custom-table").append(row);
    }
}

$("custom-form").addEventListener("submit", event => {
    event.preventDefault();
    if (state.busy) {
        message("請待轉換完成後再修改詞庫。");
        return;
    }
    const id = $("edit-id").value || crypto.randomUUID();
    const existing = state.dictionary.find(rule => rule.id === id);
    const entry = {
        id: id,
        source: $("custom-source").value,
        target: $("custom-target").value,
        direction: $("custom-direction").value,
        pos: $("custom-pos").value.trim(),
        enabled: existing?.enabled ?? true
    };
    try {
        const next = state.dictionary.filter(rule => rule.id !== id).concat(entry);
        validateRules(next);
        state.dictionary = next;
        persistRules();
        resetForm();
        message("詞條已儲存，下次轉換時生效。");
    } catch (error) {
        message(error.message, true);
    }
});

$("cancel-edit").addEventListener("click", resetForm);

$("export-custom").addEventListener("click", () => {
    try {
        download("辨字-自訂詞庫.json", JSON.stringify({
            kind: "conversion-dictionary",
            version: 2,
            entries: state.dictionary,
            replacements: readReplacementSettings()
        }, null, 2), "application/json;charset=utf-8");
    } catch (error) {
        message(error.message, true);
    }
});

$("import-custom").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        if (file.size > 2 * 1024 * 1024) throw new Error("詞庫檔案最多 2 MB。");
        const data = JSON.parse(await file.text());
        if (data?.kind === "correction-dictionary" || data?.appliesToConversion === false) throw new Error("修正詞庫是校對紀錄，不能匯入轉換詞庫。");
        const imported = validateRules(Array.isArray(data) ? data : data.entries);
        const stages = Array.isArray(data) || !data.replacements ? null : BianziReplacements.validate(data.replacements);
        const byKey = new Map(state.dictionary.map(rule => [ JSON.stringify([ rule.source, rule.direction, rule.pos ]), rule ]));
        for (const rule of imported) byKey.set(JSON.stringify([ rule.source, rule.direction, rule.pos ]), rule);
        const next = [ ...byKey.values() ];
        validateRules(next);
        state.dictionary = next;
        if (stages) setReplacementSettings(stages);
        persistRules();
        resetForm();
        message(`已匯入 ${imported.length} 條詞條${stages ? "及三段取代設定" : ""}；相同原文、方向與詞性的詞條已更新。`);
    } catch (error) {
        message("匯入失敗：" + error.message, true);
    }
    event.target.value = "";
});

function currentRecords() {
    return !state.result ? [] : $("output").value === state.result.text ? state.result.sentences : BianziCorrections.review(state.result.sentences, $("output").value);
}

function readCorrectionStore() {
    const entries = JSON.parse(localStorage.getItem(correctionKey) || "[]");
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.source !== "string" || typeof entry.target !== "string" || typeof entry.id !== "string" || typeof entry.session !== "string" || ![ "s2t", "t2s" ].includes(entry.direction))) throw new Error("修正紀錄格式不正確");
    return entries.map(entry => ({
        ...entry,
        enabled: false
    }));
}

function saveCorrections() {
    clearTimeout(correctionTimer);
    if (!state.result || !state.session || composing) return;
    let existing = state.corrections, readable = true;
    try {
        existing = readCorrectionStore();
    } catch {
        readable = false;
    }
    state.corrections = BianziCorrections.updateCollection(existing, state.session, state.result.text, $("output").value, state.result.direction, state.excludedCorrections);
    const count = state.corrections.filter(entry => entry.session === state.session).length;
    const changed = $("output").value !== state.result.text;
    $("restore-output").disabled = !changed;
    $("output-count").textContent = Array.from($("output").value).length.toLocaleString() + " 字" + (changed ? " · 已人工修改" : " · " + (state.result.elapsed_ms / 1e3).toFixed(2) + " 秒");
    try {
        if (!readable) throw new Error("無法讀取現有修正詞庫");
        localStorage.setItem(correctionKey, JSON.stringify(state.corrections));
        $("correction-status").textContent = changed ? `本次 ${count} 條修正已另存；修正詞庫不參與轉換。` : "可直接修改成品；修改會另存修正詞庫，不參與轉換。";
    } catch {
        $("correction-status").textContent = "瀏覽器儲存失敗，修正暫存在此頁；請匯出修正詞庫與成品備份。";
    }
    renderCorrections();
}

function queueCorrections() {
    if (composing) return;
    clearTimeout(correctionTimer);
    $("correction-status").textContent = "正在保存修正…";
    correctionTimer = setTimeout(() => {
        saveCorrections();
        renderReview();
    }, 350);
}

$("output").addEventListener("compositionstart", () => {
    composing = true;
    clearTimeout(correctionTimer);
});

$("output").addEventListener("compositionend", () => {
    composing = false;
    queueCorrections();
});

$("output").addEventListener("input", queueCorrections);

$("output").addEventListener("blur", () => {
    saveCorrections();
    renderReview();
});

window.addEventListener("pagehide", saveCorrections);

$("restore-output").addEventListener("click", () => {
    if (!state.result || state.busy) return;
    $("output").value = state.result.text;
    saveCorrections();
    renderReview();
});

function renderCorrections() {
    $("correction-count").textContent = state.corrections.length;
    $("correction-empty").hidden = !!state.corrections.length;
    $("correction-table").replaceChildren();
    for (const entry of state.corrections.slice().reverse().slice(0, state.correctionLimit)) {
        const row = element("tr");
        [ entry.source || "（新增）", entry.target || "（刪除）", entry.direction === "s2t" ? "簡 → 繁" : "繁 → 簡", entry.context || "" ].forEach(value => row.append(element("td", value)));
        const actions = element("td"), remove = element("button", "刪除紀錄", "delete-button");
        remove.addEventListener("click", () => {
            state.excludedCorrections.add(entry.id);
            window.BianziFiles?.exclude(entry.id);
            try {
                state.corrections = readCorrectionStore().filter(item => item.id !== entry.id);
                localStorage.setItem(correctionKey, JSON.stringify(state.corrections));
            } catch {
                message("刪除紀錄未能儲存，請匯出詞庫備份。", true);
            }
            renderCorrections();
        });
        actions.append(remove);
        row.append(actions);
        $("correction-table").append(row);
    }
    $("more-corrections").hidden = state.correctionLimit >= state.corrections.length;
}

$("more-corrections").addEventListener("click", () => {
    state.correctionLimit += 100;
    renderCorrections();
});

$("export-corrections").addEventListener("click", () => {
    saveCorrections();
    window.BianziFiles?.save();
    download("辨字-修正詞庫.json", JSON.stringify({
        kind: "correction-dictionary",
        version: 1,
        appliesToConversion: false,
        entries: state.corrections
    }, null, 2), "application/json;charset=utf-8");
});

window.addEventListener("storage", event => {
    if (event.key !== correctionKey) return;
    try {
        state.corrections = readCorrectionStore();
        renderCorrections();
    } catch {
        message("另一分頁的修正詞庫無法讀取，請保留備份。", true);
    }
});

let characterRequest = 0;

async function refreshCharacters() {
    const request = ++characterRequest;
    try {
        const entries = await api("/api/ambiguous?variants=" + encodeURIComponent(state.variants.join(",")) + "&profile=" + encodeURIComponent(state.profile));
        if (request !== characterRequest) return;
        state.ambiguous = entries;
        $("ambiguous-count").textContent = entries.length;
        renderCharacters();
    } catch (error) {
        message("詞庫載入失敗：" + error.message, true);
    }
}

function renderVariants() {
    $("variant-summary").textContent = state.variants.length ? `已開啟 ${state.variants.length} 組異體` : "異體轉換已關閉";
    $("all-variants").checked = state.variants.length === state.variantGroups.length && !!state.variantGroups.length;
    $("all-variants").indeterminate = state.variants.length > 0 && state.variants.length < state.variantGroups.length;
    $("variant-options").replaceChildren();
    for (const group of state.variantGroups) {
        const label = element("label"), checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.variants.includes(group.id);
        checkbox.addEventListener("change", () => {
            state.variants = state.variants.filter(id => id !== group.id);
            if (checkbox.checked) state.variants.push(group.id);
            persistVariants();
        });
        label.append(checkbox, document.createTextNode(" " + group.label));
        $("variant-options").append(label);
    }
}

function persistVariants() {
    try {
        localStorage.setItem(variantKey, JSON.stringify(state.variants));
    } catch {
        message("異體設定未能儲存，下次開啟將使用預設。", true);
    }
    invalidate();
    renderVariants();
    refreshCharacters();
}

$("all-variants").addEventListener("change", () => {
    state.variants = $("all-variants").checked ? state.variantGroups.map(group => group.id) : [];
    persistVariants();
});

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) state.dictionary = validateRules(JSON.parse(saved));
    } catch {
        message("無法讀取已儲存詞庫，請重新匯入備份。", true);
    }
    renderCustom();
    try {
        state.corrections = readCorrectionStore();
    } catch {
        message("修正詞庫讀取失敗，請保留已匯出的備份。", true);
    }
    renderCorrections();
    try {
        const meta = await api("/api/meta");
        state.variantGroups = meta.variantGroups;
        initializeProfiles(meta.profiles);
        try {
            const saved = JSON.parse(localStorage.getItem(variantKey) || "[]");
            if (Array.isArray(saved)) state.variants = saved.filter(id => state.variantGroups.some(group => group.id === id));
        } catch {
            state.variants = [];
        }
        renderVariants();
        await refreshCharacters();
        $("ambiguous-count").textContent = meta.ambiguous;
        $("source-info").textContent = `OpenCC ${meta.version} · ${meta.characters.toLocaleString()} 字條 · ${meta.phrases.toLocaleString()} 詞條`;
    } catch (error) {
        message("詞庫載入失敗：" + error.message, true);
    }
});

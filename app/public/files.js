"use strict";

(() => {
    const fileState = {
        book: null,
        file: null,
        part: 0,
        unit: 0,
        controller: null,
        busy: false,
        importing: false,
        timer: null,
        composing: false,
        excluded: new Set
    };
    const status = text => {
        $("file-status").textContent = text;
    };
    const current = () => fileState.book?.parts[fileState.part]?.units[fileState.unit];
    const proofScope = () => BianziProofreading.scope(fileState.book?.parts[fileState.part]?.units || [], fileState.book?.type === "epub" ? "\n\n" : "");
    const proof = BianziProofreading.create($("file-proof"), {
        loadCatalogue: mode => api("/api/ambiguous?scope=proof&proofMode=" + encodeURIComponent(mode)),
        read: () => {
            const part = fileState.book?.parts[fileState.part];
            return {
                text: proofScope().text,
                record: part && (part.proof ||= {}),
                enabled: !!fileState.book?.complete && !state.busy
            };
        },
        write: text => {
            const unit = BianziProofreading.updateScope(proofScope(), text);
            if (unit) {
                fileState.unit = fileState.book.parts[fileState.part].units.indexOf(unit);
                $("file-unit").value = fileState.unit;
                $("file-before").value = unit.before;
                $("file-after").value = unit.after.replace(/\r\n?/g, "\n");
                save();
                renderDiff();
                $("file-after").dispatchEvent(new Event("input", {
                    bubbles: true
                }));
            }
        }
    });
    function save() {
        clearTimeout(fileState.timer);
        const unit = current();
        if (!unit?.result || !fileState.book.complete || fileState.composing) return;
        const edited = $("file-after").value;
        if (edited !== unit.after.replace(/\r\n?/g, "\n")) unit.after = unit.before.includes("\r\n") ? edited.replace(/\n/g, "\r\n") : edited;
        $("file-restore").disabled = unit.after === unit.result.text;
        let existing;
        try {
            existing = readCorrectionStore();
        } catch {
            $("file-correction-status").textContent = "修正詞庫無法讀取，成品修改仍暫存在本頁；請下載成品備份。";
            return;
        }
        state.corrections = BianziCorrections.updateCollection(existing, unit.session, unit.result.text, unit.after, fileState.book.settings.direction, fileState.excluded);
        for (const entry of state.corrections) if (entry.session === unit.session) {
            entry.file = fileState.book.name;
            entry.chapter = fileState.book.parts[fileState.part].path;
        }
        try {
            localStorage.setItem(correctionKey, JSON.stringify(state.corrections));
            $("file-correction-status").textContent = unit.after === unit.result.text ? "可直接修改本段；修改會另存修正詞庫，不參與轉換。" : "本段修改已另存修正詞庫；下載成品會包含修改，後續轉換不會自動套用。";
        } catch {
            $("file-correction-status").textContent = "修正紀錄暫存於本頁，瀏覽器儲存空間不足；請匯出修正詞庫及下載成品。";
        }
        renderCorrections();
    }
    function renderDiff() {
        const unit = current();
        $("file-diff").replaceChildren();
        if (!unit?.result) return;
        const diff = Diff.diffChars(unit.before, unit.after, {
            timeout: 100
        });
        for (const part of diff || [ {
            value: unit.before,
            removed: true
        }, {
            value: unit.after,
            added: true
        } ]) $("file-diff").append(element(part.added ? "ins" : part.removed ? "del" : "span", part.value));
    }
    function showUnit() {
        const unit = current();
        $("file-before").value = unit?.before || "";
        $("file-after").value = unit?.after ?? "";
        $("file-after").readOnly = !unit?.result || !fileState.book.complete || fileState.busy;
        $("file-restore").disabled = !unit?.result || unit.after === unit.result.text || fileState.busy;
        $("file-prev").disabled = fileState.busy || fileState.unit === 0;
        $("file-next").disabled = fileState.busy || !fileState.book || fileState.unit >= fileState.book.parts[fileState.part].units.length - 1;
        $("file-correction-status").textContent = unit?.result ? "可直接修改本段；修改會另存修正詞庫，不參與轉換。" : "EPUB 以純文字檢視，原始排版保留在下載檔中。";
        renderDiff();
        $("file-proof").hidden = !unit?.result || !fileState.book?.complete;
        proof.render();
    }
    function showPart() {
        $("file-unit").replaceChildren();
        const units = fileState.book.parts[fileState.part].units;
        units.forEach((unit, index) => {
            const option = element("option", `${index + 1} · ${unit.before.trim().replace(/\s+/g, " ").slice(0, 38)}`);
            option.value = index;
            $("file-unit").append(option);
        });
        fileState.unit = 0;
        showUnit();
        proof.reset();
    }
    function setBusy(busy) {
        fileState.busy = busy;
        state.busy = busy;
        setProfileBusy(busy);
        for (const id of [ "choose-document", "document-file", "file-encoding", "file-direction", "file-mode", "convert-file", "file-part", "file-unit", "proof-file", "convert", "mode", "sample", "clear" ]) $(id).disabled = busy;
        document.querySelectorAll("#standard-settings input").forEach(input => {
            input.disabled = busy;
        });
        $("cancel-file").hidden = !busy;
        $("file-after").readOnly = busy || !fileState.book?.complete;
        $("download-file").disabled = busy || !fileState.book?.complete;
        $("file-restore").disabled = busy || !current()?.result || current()?.after === current()?.result?.text;
        $("convert-file").disabled = busy || !fileState.book;
        $("proof-file").disabled = busy || !fileState.book;
        proof.render();
        $("file-prev").disabled = busy || fileState.unit === 0;
        $("file-next").disabled = busy || !fileState.book || fileState.unit >= fileState.book.parts[fileState.part].units.length - 1;
    }
    async function importSelected(file, manualEncoding = false) {
        if (!file || state.busy || fileState.importing) return;
        save();
        fileState.importing = true;
        fileState.file = file;
        $("choose-document").disabled = true;
        $("convert-file").disabled = true;
        $("proof-file").disabled = true;
        $("download-file").disabled = true;
        status("正在讀取檔案…");
        try {
            if (file.size > BianziDocuments.LIMITS.file) throw new Error("檔案最多 50 MB，TXT 最多 10 MB。");
            const sourceBytes = new Uint8Array(await file.arrayBuffer());
            const book = BianziDocuments.importFile(file.name, sourceBytes, manualEncoding ? $("file-encoding").value : "auto");
            book.sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", sourceBytes)), b => b.toString(16).padStart(2, "0")).join("");
            if (book.encoding) $("file-encoding").value = book.encoding;
            fileState.book = book;
            fileState.file = file;
            fileState.part = 0;
            fileState.unit = 0;
            $("file-part").replaceChildren();
            book.parts.forEach((part, index) => {
                const option = element("option", `${index + 1} · ${part.label}`);
                option.value = index;
                $("file-part").append(option);
            });
            $("file-preview").hidden = false;
            $("file-progress").hidden = true;
            $("download-file").disabled = true;
            $("file-info").textContent = `${book.name} · ${book.characters.toLocaleString()} 字 · ${book.parts.length} 個內容檔` + (book.encoding ? ` · ${book.encoding}` : " · 含章節、目錄及書籍資料");
            showPart();
            status(book.encodingUncertain ? `已自動選擇 ${book.encoding}，但編碼判斷信心較低；請檢查原文，亦可手動改選編碼。` : `匯入完成${book.encodingAutomatic ? "，已自動識別並選擇 " + book.encoding : ""}。可直接轉換，亦可手動改選編碼。`);
        } catch (error) {
            status("匯入失敗：" + error.message + (fileState.book ? " 原先匯入的檔案仍保留。" : ""));
        } finally {
            fileState.importing = false;
            $("choose-document").disabled = false;
            $("convert-file").disabled = !fileState.book;
            $("proof-file").disabled = !fileState.book;
            $("download-file").disabled = !fileState.book?.complete;
        }
    }
    $("choose-document").addEventListener("click", () => {
        if (!state.busy) $("document-file").click();
    });
    $("document-file").addEventListener("change", event => {
        const file = event.target.files[0];
        event.target.value = "";
        importSelected(file);
    });
    $("file-encoding").addEventListener("change", () => {
        if (fileState.file?.name.toLowerCase().endsWith(".txt")) importSelected(fileState.file, true);
    });
    for (const name of [ "dragenter", "dragover" ]) $("file-drop").addEventListener(name, event => {
        event.preventDefault();
        if (!state.busy) $("file-drop").classList.add("dragging");
    });
    for (const name of [ "dragleave", "drop" ]) $("file-drop").addEventListener(name, event => {
        event.preventDefault();
        $("file-drop").classList.remove("dragging");
        if (name === "drop") {
            if (event.dataTransfer.files.length !== 1) status("請一次匯入一份檔案。"); else importSelected(event.dataTransfer.files[0]);
        }
    });
    $("file-part").addEventListener("change", () => {
        save();
        fileState.part = Number($("file-part").value);
        showPart();
    });
    $("file-unit").addEventListener("change", () => {
        save();
        fileState.unit = Number($("file-unit").value);
        showUnit();
    });
    for (const [id, step] of [ [ "file-prev", -1 ], [ "file-next", 1 ] ]) $(id).addEventListener("click", () => {
        save();
        fileState.unit += step;
        $("file-unit").value = fileState.unit;
        showUnit();
    });
    $("file-after").addEventListener("compositionstart", () => {
        fileState.composing = true;
        clearTimeout(fileState.timer);
    });
    const queueSave = () => {
        if (fileState.composing) return;
        clearTimeout(fileState.timer);
        fileState.timer = setTimeout(() => {
            save();
            renderDiff();
            proof.render();
        }, 350);
    };
    $("file-after").addEventListener("compositionend", () => {
        fileState.composing = false;
        queueSave();
    });
    $("file-after").addEventListener("input", event => {
        if (event.isTrusted && current()) fileState.book.parts[fileState.part].proof = {};
        queueSave();
    });
    $("file-after").addEventListener("blur", () => {
        save();
        renderDiff();
        proof.render();
    });
    $("file-restore").addEventListener("click", () => {
        if (!current()?.result) return;
        fileState.book.parts[fileState.part].proof = {};
        $("file-after").value = current().result.text;
        save();
        renderDiff();
        proof.render();
    });
    window.addEventListener("pagehide", save);
    $("convert-file").addEventListener("click", async () => {
        if (state.busy || !fileState.book || fileState.importing) return;
        try {
            state.replacements = readReplacementSettings();
        } catch (error) {
            status(error.message);
            return;
        }
        save();
        const book = fileState.book;
        book.complete = false;
        const diagnosticRunId = crypto.randomUUID();
        book.settings = {
            profile: state.profile,
            preserveZhe: state.preserveZhe,
            usePosLexicon: state.usePosLexicon,
            replacements: {
                ...state.replacements
            },
            direction: $("file-direction").value,
            mode: $("file-mode").value,
            variants: [ ...state.variants ],
            dictionary: state.dictionary.map(rule => ({
                ...rule
            }))
        };
        const units = book.parts.flatMap(part => part.units);
        const scanQuotes = book.settings.direction === "s2t" && book.settings.profile === "modern";
        book.settings.deferClassicalQuotes = scanQuotes;
        book.parts.forEach(part => {
            part.proof = {};
        });
        units.forEach(unit => {
            unit.after = null;
            unit.result = null;
            unit.session = null;
            unit.proof = {};
        });
        setBusy(true);
        showUnit();
        $("file-progress").hidden = false;
        $("file-progress").max = units.length * (scanQuotes ? 2 : 1) || 1;
        $("file-progress").value = 0;
        fileState.controller = new AbortController;
        const started = performance.now(), warnings = new Set;
        const snapshot = `${profileLabel(book.settings.profile)}，${book.settings.preserveZhe ? "保留着／著" : "依標準處理着／著"}，${book.settings.direction === "s2t" ? "簡 → 繁" : "繁 → 簡"}，${modeLabel(book.settings.mode)}，${book.settings.profile === "modern" ? book.settings.variants.length + " 組異體" : "依所選標準字形"}`;
        $("file-settings-note").textContent = "本次使用：" + snapshot + "；已啟用的自訂詞庫已於開始時讀取。";
        try {
            await proof.loadCatalogue();
            let offset = 0;
            while (offset < units.length) {
                const batch = [];
                let size = 0;
                while (offset + batch.length < units.length && batch.length < 64) {
                    const unit = units[offset + batch.length];
                    if (batch.length && size + unit.before.length > 24e3) break;
                    batch.push(unit);
                    size += unit.before.length;
                }
                status(`正在轉換 ${offset + 1}–${offset + batch.length} / ${units.length} 個文字區塊。${modeLabel(book.settings.mode)}；首次載入模型可能需要一段時間。`);
                const result = await api("/api/convert-batch", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal: fileState.controller.signal,
                    body: JSON.stringify({
                        ...book.settings,
                        diagnosticsContext: {
                            runId: diagnosticRunId,
                            kind: "file",
                            sourceName: book.name || book.filename || "檔案",
                            sourceSha256: book.sourceSha256,
                            unitOffset: offset
                        },
                        segments: batch.map(u => u.before)
                    })
                });
                if (result.segments.length !== batch.length) throw new Error("段落數量不符，已停止以保護檔案結構。");
                batch.forEach((unit, index) => {
                    unit.result = result.segments[index];
                    unit.after = unit.result.text;
                    unit.session = crypto.randomUUID();
                });
                result.warnings.forEach(w => warnings.add(w));
                offset += batch.length;
                $("file-progress").value = offset;
            }
            if (fileState.controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
            if (scanQuotes) {
                const plans = units.map(u => u.result.classicalQuotePlan);
                let cursor = 0, hits = 0, corrections = 0;
                while (cursor < units.length) {
                    const batch = BianziClassicalQuotePass.batch(plans, cursor);
                    status(`普通轉換完成，正在掃描全書古籍引文：${cursor + 1}–${batch.end} / ${units.length} 個文字區塊。`);
                    const scanned = await api("/api/classical-quotes/scan", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        signal: fileState.controller.signal,
                        body: JSON.stringify({
                            ...book.settings,
                            plans: batch.plans,
                            diagnosticsContext: {
                                runId: diagnosticRunId,
                                kind: "file",
                                sourceName: book.name || book.filename || "檔案",
                                sourceSha256: book.sourceSha256,
                                unitOffset: cursor
                            }
                        })
                    });
                    if (scanned.segments.length !== batch.plans.length) throw Error("引文後掃描段落數量不符。");
                    scanned.segments.forEach((result, i) => {
                        const unit = units[cursor + i];
                        BianziClassicalQuotePass.apply(unit.result, result);
                        unit.after = unit.result.text;
                    });
                    hits += scanned.stats.classical_quotes.hits;
                    corrections += scanned.stats.classical_quotes.corrections;
                    cursor = batch.end;
                    $("file-progress").value = units.length + cursor;
                }
                book.classicalQuoteScan = {
                    phase: "post-conversion",
                    scanned_units: units.length,
                    hits: hits,
                    corrections: corrections
                };
            }
            if (fileState.controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
            book.complete = true;
            book.proofOnly = false;
            proof.reset();
            status(`整份轉換完成；風險與原生詞性已分類收集，共 ${units.length} 個文字區塊${scanQuotes ? "；古籍引文後掃描命中 " + book.classicalQuoteScan.hits + " 處" : ""}，用時 ${((performance.now() - started) / 1e3).toFixed(1)} 秒。可連續校對全篇／整章後下載。${[ ...warnings ].join(" ")}`);
        } catch (error) {
            status(error.name === "AbortError" ? "已取消。部分結果不會當作完整成品下載；可重新開始整份轉換。" : "轉換未完成：" + error.message + "。請重新開始。");
        } finally {
            fileState.controller = null;
            setBusy(false);
            showUnit();
        }
    });
    $("proof-file").addEventListener("click", async () => {
        if (state.busy || fileState.importing || !fileState.book) return;
        save();
        setBusy(true);
        status("正在載入校對候選…");
        try {
            const book = fileState.book;
            const settings = book.complete ? book.settings : {
                profile: state.profile,
                variants: [ ...state.variants ],
                direction: $("file-direction").value
            };
            await proof.loadCatalogue();
            if (!book.complete) {
                book.settings = settings;
                book.proofOnly = true;
                for (const part of book.parts) for (const unit of part.units) {
                    unit.after = unit.before;
                    unit.result = {
                        text: unit.before
                    };
                    unit.session = crypto.randomUUID();
                    unit.proof = {};
                }
                book.complete = true;
            }
            proof.reset();
            $("file-settings-note").textContent = "保留書籍原字及已完成的修改；可切換古典／現代候選，不受自動轉換異體開關限制。只修改點選位置。";
            status("已開啟選字校對。TXT 顯示全篇，EPUB 選擇章節後顯示整章；直接點選標出的字；完成後下載成品。");
        } catch (error) {
            status("校對未開啟：" + error.message);
        } finally {
            setBusy(false);
            showUnit();
        }
    });
    $("cancel-file").addEventListener("click", () => {
        fileState.controller?.abort();
        status("正在取消…");
    });
    $("download-file").addEventListener("click", () => {
        if (state.busy || fileState.importing || !fileState.book?.complete) return;
        save();
        $("download-file").disabled = true;
        status("正在打包轉換成品…");
        setTimeout(() => {
            try {
                const result = BianziDocuments.exportFile(fileState.book, fileState.book.proofOnly ? null : fileState.book.settings.direction);
                download(result.name, result.data, result.type);
                status("成品已準備下載：" + result.name);
            } catch (error) {
                status("下載失敗：" + error.message);
            } finally {
                $("download-file").disabled = !fileState.book?.complete;
            }
        }, 0);
    });
    window.BianziFiles = {
        save: save,
        exclude: id => fileState.excluded.add(id)
    };
})();

(() => {
    let record = {}, session = null;
    const viewer = BianziProofreading.create($("text-proof"), {
        loadCatalogue: mode => api("/api/ambiguous?scope=proof&proofMode=" + encodeURIComponent(mode)),
        read: () => ({
            text: $("output").value,
            record: record,
            enabled: !!state.result && !state.busy
        }),
        write: text => {
            $("output").value = text;
            saveCorrections();
            renderReview();
            $("output").dispatchEvent(new Event("input", {
                bubbles: true
            }));
        }
    });
    $("proof-output").addEventListener("click", async () => {
        if (state.busy) return;
        if (!state.result) {
            message("請先完成文字轉換，或在「檔案／校對模式」匯入檔案直接校對。", true);
            return;
        }
        const result = state.result;
        try {
            await viewer.loadCatalogue();
            if (state.result !== result) return;
            if (session !== state.session) {
                record = {};
                session = state.session;
            }
            $("text-proof").hidden = false;
            viewer.reset();
            $("text-proof").scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        } catch (error) {
            message("校對未開啟：" + error.message, true);
        }
    });
    $("output").addEventListener("input", event => {
        if (event.isTrusted) record = {};
        viewer.render();
    });
    for (const id of [ "convert", "clear", "sample", "restore-output" ]) $(id).addEventListener("click", () => {
        $("text-proof").hidden = true;
    });
    $("input").addEventListener("input", () => {
        $("text-proof").hidden = true;
    });
})();

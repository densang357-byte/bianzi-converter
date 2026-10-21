"use strict";

const profileKey = "bianzi.profile.v1", replacementKey = "bianzi.replacements.v1";

function modeLabel(id) {
    return id === "fast" ? "快速模式（HanLP）" : id === "dictionary" ? "純詞庫" : "慢速模式（LTP）";
}

function profileLabel(id) {
    return state.profiles.find(p => p.id === id)?.label || id || "默認標準";
}

function setProfileBusy(busy) {
    for (const id of [ "profile", "file-profile", "file-mode", "preserve-zhe", "use-pos-lexicon", "file-use-pos-lexicon", "replace-protect", "replace-pre", "replace-post", "replacements-enabled", "import-replacements" ]) $(id).disabled = busy;
}

function showProfile() {
    const p = state.profiles.find(p => p.id === state.profile);
    if (!p) return;
    $("profile").value = $("file-profile").value = state.profile;
    $("profile-title").textContent = p.label;
    $("profile-source").textContent = p.source;
    $("profile-description").textContent = p.description;
    $("standard-settings").hidden = state.profile !== "modern";
    $("preserve-zhe").checked = state.preserveZhe;
    $("use-pos-lexicon").checked = $("file-use-pos-lexicon").checked = state.usePosLexicon;
}

function initializeProfiles(profiles) {
    state.profiles = profiles;
    try {
        const saved = JSON.parse(localStorage.getItem(profileKey) || "{}");
        if (profiles.some(p => p.id === saved.profile)) state.profile = saved.profile;
        state.preserveZhe = saved.preserveZhe !== false;
        state.usePosLexicon = saved.usePosLexicon === true;
        $("mode").value = $("file-mode").value = [ "fast", "slow" ].includes(saved.mode) ? saved.mode : "slow";
    } catch {
        message("標準設定無法讀取，暫用現代漢語及保留着／著。", true);
    }
    for (const id of [ "profile", "file-profile" ]) {
        $(id).replaceChildren();
        for (const p of profiles) {
            const option = element("option", p.label);
            option.value = p.id;
            $(id).append(option);
        }
    }
    showProfile();
}

function saveProfile() {
    try {
        localStorage.setItem(profileKey, JSON.stringify({
            profile: state.profile,
            preserveZhe: state.preserveZhe,
            usePosLexicon: state.usePosLexicon,
            mode: $("mode").value
        }));
    } catch {
        message("標準設定未能儲存，僅在本頁生效。", true);
    }
    showProfile();
    refreshCharacters();
    message("已選擇 " + profileLabel(state.profile) + "；下次轉換生效。");
}

for (const id of [ "profile", "file-profile" ]) $(id).addEventListener("change", () => {
    if (state.busy) {
        showProfile();
        return;
    }
    state.profile = $(id).value;
    saveProfile();
});

$("preserve-zhe").addEventListener("change", () => {
    if (state.busy) return;
    state.preserveZhe = $("preserve-zhe").checked;
    saveProfile();
});

function readReplacementSettings() {
    return BianziReplacements.validate({
        enabled: $("replacements-enabled").checked,
        protect: $("replace-protect").value,
        pre: $("replace-pre").value,
        post: $("replace-post").value
    });
}

function saveReplacementSettings() {
    try {
        const settings = readReplacementSettings();
        state.replacements = settings;
        localStorage.setItem(replacementKey, JSON.stringify(settings));
        $("replacement-status").textContent = settings.enabled ? "已儲存；下次文字及檔案轉換生效。修正詞庫仍不參與轉換。" : "自訂取代已停用；內容仍保存，指定詞條不受影響。";
        $("replacement-status").className = "muted";
        return true;
    } catch (error) {
        $("replacement-status").textContent = error.message + " 設定尚未儲存，請修正後再轉換。";
        $("replacement-status").className = "error";
        return false;
    }
}

function setReplacementSettings(settings) {
    const s = BianziReplacements.validate(settings);
    $("replacements-enabled").checked = s.enabled;
    for (const k of [ "protect", "pre", "post" ]) $("replace-" + k).value = s[k];
    saveReplacementSettings();
}

for (const id of [ "replace-protect", "replace-pre", "replace-post" ]) $(id).addEventListener("input", saveReplacementSettings);

$("replacements-enabled").addEventListener("change", saveReplacementSettings);

$("export-replacements").addEventListener("click", () => {
    try {
        download("辨字-三段取代設定.json", JSON.stringify({
            kind: "replacement-settings",
            version: 1,
            ...readReplacementSettings()
        }, null, 2), "application/json;charset=utf-8");
    } catch (error) {
        message(error.message, true);
    }
});

$("import-replacements").addEventListener("click", () => {
    if (!state.busy) $("replacement-file").click();
});

$("replacement-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || state.busy) return;
    try {
        if (file.size > 2 * 1024 * 1024) throw new Error("取代設定最多 2 MB。");
        const data = JSON.parse(await file.text());
        if (data.kind !== "replacement-settings") throw new Error("請選擇「三段取代設定」JSON；修正詞庫不能作為轉換規則。");
        setReplacementSettings(data);
    } catch (error) {
        message(error.message, true);
    }
});

try {
    const saved = localStorage.getItem(replacementKey);
    if (saved) setReplacementSettings(JSON.parse(saved));
} catch (error) {
    $("replacement-status").textContent = "已儲存的取代設定無法讀取；請匯入備份。";
}

for (const id of [ "use-pos-lexicon", "file-use-pos-lexicon" ]) $(id).addEventListener("change", () => {
    if (state.busy) {
        showProfile();
        return;
    }
    state.usePosLexicon = $(id).checked;
    saveProfile();
    message(state.usePosLexicon ? "詞性詞庫已開啓；下次文字及檔案轉換生效。" : "詞性詞庫已關閉；下次轉換沿用原有流程。");
});

$("mode").addEventListener("change", () => {
    $("file-mode").value = $("mode").value;
    saveProfile();
});

$("file-mode").addEventListener("change", () => {
    $("mode").value = $("file-mode").value;
    $("mode").dispatchEvent(new Event("change"));
});

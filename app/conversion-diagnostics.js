"use strict";

const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const raw = new WeakMap, stages = new WeakMap;

const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function savable(value) {
    const ancestors = new Map;
    let cyclic = false;
    function copy(v, p) {
        if (!v || typeof v !== "object") return v;
        if (ancestors.has(v)) {
            cyclic = true;
            return {
                $ref: ancestors.get(v)
            };
        }
        ancestors.set(v, p);
        let out;
        if (Array.isArray(v)) out = v.map((x, i) => copy(x, p + "/" + i)); else {
            out = {};
            for (const [k, x] of Object.entries(v)) Object.defineProperty(out, k, {
                value: copy(x, p + "/" + k.replace(/~/g, "~0").replace(/\//g, "~1")),
                enumerable: true,
                writable: true,
                configurable: true
            });
        }
        ancestors.delete(v);
        return out;
    }
    const result = copy(value, "#");
    if (cyclic && !Array.isArray(result)) result.referenceEncoding = "JSON pointer relative to this record";
    return result;
}

const attach = (record, tokens) => {
    record = savable(record);
    raw.set(record, structuredClone(tokens));
    return record;
};

const attachStages = (record, records) => {
    stages.set(record, records);
    return record;
};

const categories = {
    sentences: "句段",
    native: "原生詞性與句法",
    ambiguities: "一簡多繁字位",
    risks: "待核風險詞",
    pos: "疑似詞性問題",
    tokenization: "疑似分詞問題",
    rules: "自動規則修正",
    network: "詞網命中",
    networkPending: "詞網待核關聯",
    custom: "自訂取代",
    failures: "轉換失敗"
};

function versions() {
    const paths = [ "classical-quotes.js", "classical-quote-scope.js", "classical-quote-extraction.js", "classical-quote-postscan.js", "public/classical-quote-pass.js", "data/semantic-character-branches.json", "data/ambiguity-priority.json", "data/lexicon-direction-policy.json", "data/lexicon-glyph-standard.json", "../dictionaries/pos-lexicon/resolution_policy.json", "../dictionaries/classical-quotes/active.json", "../dictionaries/classical-quotes/sources.json", "excluded-characters.js", "data/excluded-conversion-characters.json", "../dictionaries/CN_to_TW.LTP.PoS.txt", "converter.js", "profiles.js", "data/historical-profiles.json", "filtered-opencc.js", "linguistic-analysis.js", "lexical-network.js", "network-local-relations.js", "network-back-node-relations.js", "network-recitation-relations.js", "network-semantic-relations.js", "data/pos-lexicon.json", "data/lexical-network-local-relations.json" ];
    paths.push("student-standard.js", "../dictionaries/student-standard/policy.json", "standard.js", "profile-rules.js");
    paths.push("tai-policy.js", "zhan-policy.js", "data/zhan-policy.json", "hair-state-rules.js", "fu-liao-preferences.js", "zhi-policy.js", "dou-policy.js", "data/dou-policy.json", "../dictionaries/hanlp/pos-lexicon.json");
    paths.push("modern-rules.js", "cai-rules.js", "data/cai-policy.json", "cai-risk.js", "data/cai-risk-policy.json");
    paths.push("word-boundary-policy.js", "word-boundary-risk.js", "data/word-boundary-policy.json", "data/word-boundary-risks.json");
    paths.push("collective-gan.js", "reviewed-rules.js", "phrase-conversion.js", "modes.js", "hanlp-native-matching.js", "hanlp-analysis.js", "hanlp-pos-lexicon.js", "../resources/hanlp_runtime.py", "../resources/HanLP_parse.py", "../resources/hanlp_worker.js", "../resources/ltp_worker.js", "../resources/active-hanlp-model.json");
    paths.push("review-risk.js", "data/review-risk-frequency.json", "public/proofreading.js", "../resources/review-risk-policy.json", "../dictionaries/CN_to_TW.modern.phrases.json");
    return {
        engine: "LTP",
        runtime: require("./data/ltp-runtime.json"),
        model: process.env.CECC_LTP_MODEL || "LTP/base@97d6e77d2d7e93c435ec0fb297800f54964323be",
        files: Object.fromEntries(paths.map(p => [ p, hash(fs.readFileSync(path.join(__dirname, p))) ]))
    };
}

let hanlpIdentity;

function engineVersion(base, mode) {
    let engine;
    try {
        engine = require("./modes").resolveMode(mode).engine;
    } catch {
        return {
            ...base,
            engine: "unknown",
            model: null
        };
    }
    if (engine === "ltp") return base;
    if (!engine) return {
        ...base,
        engine: "dictionary",
        model: null,
        runtime: null
    };
    if (!hanlpIdentity) {
        const active = require("../resources/active-hanlp-model.json"), model = process.env.CECC_HANLP_MODEL || path.resolve(__dirname, "..", active.path), weights = path.join(model, "model.pt");
        hanlpIdentity = {
            model: model,
            modelSHA256: fs.existsSync(weights) ? hash(fs.readFileSync(weights)) : null,
            runtime: {
                engine: "HanLP",
                model: active.model,
                posTask: active.pos_task,
                syntax: "native HanLP dep/sdp/srl"
            }
        };
    }
    return {
        ...base,
        ...hanlpIdentity,
        engine: "HanLP"
    };
}

class Recorder {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.root = options.root || path.join(__dirname, "../outputs/轉換問題收集");
        this.version = versions();
    }
    record(input, result, error) {
        if (!this.enabled) return null;
        const context = input.diagnosticsContext || {}, runId = context.runId || crypto.randomUUID();
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(runId)) throw Error("診斷 runId 格式不正確。");
        if (context.stage !== undefined && ![ "test", "regression", "conversion" ].includes(context.stage)) throw Error("未知的診斷 stage。");
        const stage = process.env.NODE_TEST_CONTEXT ? "test" : context.stage || process.env.CECC_DIAGNOSTICS_STAGE || "conversion";
        if (!/^[a-z-]{1,32}$/.test(stage)) throw Error("診斷 stage 不正確。");
        const dir = path.join(this.root, stage, runId);
        fs.mkdirSync(dir, {
            recursive: true
        });
        const manifestFile = path.join(dir, "索引.json"), now = (new Date).toISOString();
        const settings = Object.fromEntries([ "direction", "mode", "profile", "usePosLexicon", "preserveZhe", "useLinguisticCorrections", "variants", "dictionary", "replacements", "deferClassicalQuotes" ].filter(k => input[k] !== undefined).map(k => [ k, input[k] ]));
        const version = engineVersion(this.version, input.mode);
        const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {
            schema: 1,
            runId: runId,
            stage: stage,
            createdAt: now,
            sourceName: String(context.sourceName || "文字輸入").slice(0, 300),
            sourceSha256: context.sourceSha256 || null,
            kind: context.kind || "text",
            versions: version,
            settings: settings,
            counts: {},
            requests: 0,
            status: "collecting",
            policy: "原生標註是觀測資料；風險與疑似問題未經人工確認，不計為已確認錯誤。"
        };
        if (JSON.stringify(manifest.settings) !== JSON.stringify(settings) || JSON.stringify(manifest.diagnosticExpectedVersions || manifest.versions) !== JSON.stringify(version) || manifest.sourceSha256 !== (context.sourceSha256 || null)) throw Error("續跑的來源、設定或規則版本已變更，須另開 runId。");
        const requestId = crypto.randomUUID(), rows = Object.fromEntries(Object.keys(categories).map(k => [ k, [] ]));
        const postScan = context.phase === "classical-quote-postscan";
        const base = {
            requestId: requestId,
            unitOffset: Number(context.unitOffset) || 0,
            conversionPhase: context.phase || "conversion"
        };
        let serial = 0;
        const captured = [];
        function collect(s, unitIndex, offset, space = "source") {
            captured.push(s);
            const key = requestId + ":" + serial++, ref = {
                ...base,
                sentenceId: key,
                unit: base.unitOffset + unitIndex + 1,
                sentenceOffset: offset,
                offsetSpace: space
            };
            rows.sentences.push({
                ...ref,
                before: s.before,
                after: s.after,
                inputSha256: hash(s.before)
            });
            if (!postScan) {
                const native = raw.get(s) || s.tokens || [];
                rows.native.push({
                    ...ref,
                    engine: version.engine,
                    status: native.length ? "observed" : "not-analyzed",
                    capturePhase: "tag-snapshot-before-upstream-conversion",
                    tokens: native,
                    analysisTokens: s.analysisTokens || [],
                    ...s.analysisSyntax ? {
                        analysisSyntax: s.analysisSyntax
                    } : {}
                });
                for (const h of s.occurrences || []) rows.ambiguities.push({
                    ...ref,
                    status: "observed",
                    ...h
                });
                for (const h of s.riskWords || []) rows.risks.push({
                    ...ref,
                    ...h,
                    status: "unreviewed"
                });
                for (const h of s.analysisCorrections || []) {
                    const original = h.original || [], derived = h.derived || [ {
                        text: h.source,
                        pos: h.pos
                    } ];
                    const changedBoundaries = original.length !== derived.length || original.some((t, i) => t.text !== derived[i]?.text);
                    const kind = changedBoundaries ? "tokenization" : "pos";
                    rows[kind].push({
                        ...ref,
                        ...h,
                        status: "suspected",
                        basis: "分析層修正，原生標註未改寫；尚非人工詞性金標"
                    });
                }
            }
            for (const layer of postScan ? [ "classicalQuoteHits" ] : [ "choices", "studentStandardHits", "profileRuleHits", "posLexiconHits", "specializedHits", "linguisticHits", "classicalQuoteHits" ]) for (const h of s[layer] || []) rows.rules.push({
                ...ref,
                layer: layer,
                ...h,
                status: "automatic"
            });
            for (const h of s.networkHits || []) rows.network.push({
                ...ref,
                ...h,
                status: "automatic"
            });
            for (const h of s.networkPending || []) rows.networkPending.push({
                ...ref,
                ...h,
                status: h.status || "deferred-background-only"
            });
            for (const h of s.custom || []) rows.custom.push({
                ...ref,
                ...h,
                status: "user-configured"
            });
            for (const inner of stages.get(s) || []) collect(inner, unitIndex, 0, "pre-replacement-sentence");
        }
        if (error) rows.failures.push({
            ...base,
            error: error.message,
            phase: error.phase || "conversion",
            at: now,
            inputSha256: hash(JSON.stringify(input.plans || input.segments || input.text || ""))
        }); else if (result.segments) result.segments.forEach((u, i) => {
            let offset = 0;
            for (const s of u.sentences) {
                collect(s, i, offset);
                offset += s.before.length;
            }
        }); else {
            let offset = 0;
            for (const s of result.sentences || []) {
                collect(s, 0, offset);
                offset += s.before.length;
            }
        }
        const payloads = Object.entries(rows).filter(([, items]) => items.length).map(([category, items]) => ({
            category: category,
            file: path.join(dir, categories[category] + ".jsonl"),
            text: items.map(r => JSON.stringify(savable(r))).join("\n") + "\n"
        }));
        if (postScan) {
            const prior = manifest.postScan || {
                requests: 0,
                units: 0,
                hits: 0,
                corrections: 0
            };
            manifest.postScan = {
                requests: prior.requests + 1,
                units: prior.units + (result?.segments?.length || 0),
                hits: prior.hits + (result?.stats?.classical_quotes?.hits || 0),
                corrections: prior.corrections + (result?.stats?.classical_quotes?.corrections || 0),
                version: require("./classical-quote-postscan").version
            };
        }
        manifest.requests++;
        manifest.updatedAt = now;
        manifest.status = error ? "failed" : "collected";
        manifest.diagnosticFormat = 2;
        payloads.push({
            file: path.join(dir, "批次.jsonl"),
            text: JSON.stringify({
                ...base,
                at: now,
                counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [ k, v.length ])),
                error: error?.message
            }) + "\n"
        });
        const lengths = [];
        try {
            for (const item of payloads) {
                const exists = fs.existsSync(item.file);
                lengths.push({
                    file: item.file,
                    exists: exists,
                    size: exists ? fs.statSync(item.file).size : 0
                });
                fs.appendFileSync(item.file, item.text);
                if (item.category) manifest.counts[item.category] = (manifest.counts[item.category] || 0) + rows[item.category].length;
            }
            fs.writeFileSync(manifestFile + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
            fs.renameSync(manifestFile + ".tmp", manifestFile);
        } catch (writeError) {
            for (const r of lengths.reverse()) try {
                if (r.exists) fs.truncateSync(r.file, r.size); else fs.unlinkSync(r.file);
            } catch {}
            throw writeError;
        }
        for (const r of captured) {
            raw.delete(r);
            stages.delete(r);
        }
        return {
            runId: runId,
            requestId: requestId,
            stage: stage,
            counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [ k, v.length ]))
        };
    }
}

module.exports = {
    Recorder: Recorder,
    attach: attach,
    attachStages: attachStages,
    categories: categories,
    savable: savable
};

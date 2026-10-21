"use strict";

const fs = require("fs");

const path = require("path");

const {diffChars: diffChars} = require("diff");

const {validateVariants: validateVariants, applyStandard: applyStandard, candidatesFor: candidatesFor, glyphPreferences: glyphPreferences, restrictOutput: restrictOutput} = require("./standard");

const {getProfile: getProfile, getConverter: getConverter, readDictionary: readDictionary, getDictionaries: getDictionaries, profileCandidates: profileCandidates, applyHistorical: applyHistorical} = require("./profiles");

const posLexicon = require("./pos-lexicon");

const specialized = require("./specialized-terms");

const classicalQuotes = require("./classical-quotes");

const classicalPostScan = require("./classical-quote-postscan");

const linguistic = require("./linguistic-analysis");

const lexicalNetwork = require("./lexical-network");

const {preferredGlyphs: preferredGlyphs, preferredWords: preferredWords, productiveManual: productiveManual} = require("./lexicon-resolution");

const {decisions: decisions, retainZhe: retainZhe, contextRisks: contextRisks} = require("./modern-rules");

const diagnostics = require("./conversion-diagnostics");

const excludedCharacters = require("./excluded-characters");

const replacements = require("./public/replacements");

const {resolveMode: resolveMode} = require("./modes");

const studentStandard = require("./student-standard");

const profileRules = require("./profile-rules");

const openccRoot = path.dirname(require.resolve("opencc/package.json"));

const dictionaries = Object.fromEntries([ "STCharacters", "STPhrases", "TSCharacters", "TSPhrases" ].map(name => [ name, readDictionary(path.join(openccRoot, "data/dictionary", name + ".txt")) ]));

const ambiguous = new Map([ ...dictionaries.STCharacters ].filter(([source, targets]) => Array.from(source).length === 1 && targets.length > 1));

const inverseAmbiguous = new Map;

const modernAmbiguous = new Map(ambiguous);

modernAmbiguous.set("抬", [ "擡", "抬" ]);

modernAmbiguous.set("佔", [ "佔", "占" ]);

modernAmbiguous.set("發", [ "發", "髮" ]);

for (const [source, targets] of ambiguous) for (const target of targets) {
    if (!inverseAmbiguous.has(target)) inverseAmbiguous.set(target, []);
    inverseAmbiguous.get(target).push(source);
}

const {phraseConversion: phraseConversion} = require("./phrase-conversion");

const analysisCharacterSets = new Map;

function analysisCharacters(profile, variants) {
    const key = JSON.stringify([ profile, [ ...new Set(variants) ].sort() ]);
    if (analysisCharacterSets.has(key)) return analysisCharacterSets.get(key);
    const characters = new Set([ ...getDictionaries(profile).characters ].filter(([source, raw]) => !(profile === "modern" && glyphPreferences[source]) && (profile === "modern" ? candidatesFor(source, raw, variants) : profileCandidates(profile, source, raw)).length > 1).map(([source]) => source));
    if (profile === "modern") for (const [source, rule] of Object.entries(require("./data/lexicon-direction-policy.json").characters)) if (rule.default_by_pos) characters.add(source);
    if (analysisCharacterSets.size >= 32) analysisCharacterSets.delete(analysisCharacterSets.keys().next().value);
    analysisCharacterSets.set(key, characters);
    return characters;
}

function difference(before, after) {
    const source = Array.from(before), target = Array.from(after);
    if (source.length !== target.length) return diffChars(before, after, {
        timeout: 100
    }) || [ {
        value: before,
        removed: true
    }, {
        value: after,
        added: true
    } ];
    const result = [];
    for (let index = 0; index < source.length; ) {
        const changed = source[index] !== target[index];
        let old = "", next = "";
        do {
            old += source[index];
            next += target[index];
            index++;
        } while (index < source.length && source[index] !== target[index] === changed);
        if (changed) result.push({
            value: old,
            removed: true
        }, {
            value: next,
            added: true
        }); else result.push({
            value: old
        });
    }
    return result;
}

function splitSentences(text) {
    return text.match(/[^。！？!?\n]*(?:[。！？!?]+[」』”"’']*|\n+|$)/gu)?.filter(Boolean) || [];
}

function validateCustom(entries) {
    if (!Array.isArray(entries) || entries.length > 2e3) throw new Error("自訂詞庫最多可設定 2000 條。");
    const keys = new Set;
    return entries.map(entry => {
        if (!entry || typeof entry.source !== "string" || !entry.source.length || typeof entry.target !== "string" || !entry.target.length || entry.source.length > 500 || entry.target.length > 500) throw new Error("自訂詞條的原文與轉換結果須為 1–500 字的文字。");
        if (![ "s2t", "t2s" ].includes(entry.direction)) throw new Error("詞條方向須為 s2t 或 t2s。");
        const pos = entry.pos || "";
        if (typeof pos !== "string" || !/^[a-z]*$/.test(pos)) throw new Error("詞性須使用 LTP 標籤，例如 n、v、a、q。");
        const key = JSON.stringify([ entry.source, entry.direction, pos ]);
        if (keys.has(key)) throw new Error("同一原文、方向及詞性只能設定一條規則。");
        keys.add(key);
        return {
            ...entry,
            pos: pos,
            enabled: entry.enabled !== false
        };
    });
}

function tokenPositions(words, text) {
    let offset = 0;
    return words.map(word => {
        const start = text.indexOf(word.text, offset);
        if (start < 0) return {
            ...word,
            start: offset,
            end: offset
        };
        offset = start + word.text.length;
        return {
            ...word,
            start: start,
            end: offset
        };
    });
}

function applyCustom(before, after, entries, tokens) {
    if (!entries.length) return {
        output: after,
        hits: []
    };
    const original = Array.from(before), converted = Array.from(after);
    if (original.length !== converted.length) throw new Error("轉換後字數與原文不符，無法可靠套用自訂詞庫。");
    const rules = entries.slice().sort((a, b) => b.source.length - a.source.length || Number(!!b.pos) - Number(!!a.pos));
    const hits = [];
    let output = "", position = 0, codepoint = 0;
    while (position < before.length) {
        const rule = rules.find(rule => before.startsWith(rule.source, position) && (!rule.pos || tokens.some(token => token.start === position && token.end === position + rule.source.length && token.pos === rule.pos)));
        if (rule) {
            output += rule.target;
            hits.push({
                source: rule.source,
                target: rule.target,
                pos: rule.pos,
                offset: position
            });
            position += rule.source.length;
            codepoint += Array.from(rule.source).length;
        } else {
            output += converted[codepoint];
            position += original[codepoint].length;
            codepoint++;
        }
    }
    return {
        output: output,
        hits: hits
    };
}

class Converter {
    constructor(options = {}) {
        this.recorder = new diagnostics.Recorder({
            enabled: options.diagnostics !== false,
            root: options.diagnosticsRoot
        });
        this.cecc = null;
        this.hanlpCecc = null;
        this.posLexicon = options.posLexicon || posLexicon;
        this.linguistic = options.linguistic || linguistic;
        this.fastPosLexicon = options.posLexicon || require("./hanlp-pos-lexicon");
        this.fastLinguistic = options.linguistic || require("./hanlp-analysis");
        this.lexicalNetworkEnabled = options.lexicalNetwork !== false;
    }
    getHanlpCecc() {
        if (!this.hanlpCecc) {
            const CeCC = require("../Chinese_converter.js");
            this.hanlpCecc = new CeCC({
                using_LTP: true,
                LTP_batch_size: 16,
                load_default_text_to_check: false
            });
            this.hanlpCecc.LTP_worker.close();
            this.hanlpCecc.LTP_worker = new (require("../resources/hanlp_worker"));
            const identity = text => text;
            identity.base_function = {
                max_convert_word_length: 20
            };
            this.hanlpCecc.CN_to_TW = identity;
            this.hanlpCecc.TW_to_CN = identity;
        }
        return this.hanlpCecc;
    }
    getCecc() {
        if (!this.cecc) {
            const CeCC = require("../Chinese_converter.js");
            const model = path.join(__dirname, "../.cache/huggingface/hub/models--LTP--base/snapshots/97d6e77d2d7e93c435ec0fb297800f54964323be");
            this.cecc = new CeCC({
                LTP_model: process.env.CECC_LTP_MODEL || (fs.existsSync(path.join(model, "config.json")) ? model : undefined),
                using_LTP: true,
                LTP_batch_size: 16,
                load_default_text_to_check: false
            });
            const identity = text => text;
            identity.base_function = {
                max_convert_word_length: 20
            };
            this.cecc.CN_to_TW = identity;
            this.cecc.TW_to_CN = identity;
        }
        return this.cecc;
    }
    async convertSegments(input) {
        return this.recordConversion(input, () => this._convertSegments(input));
    }
    async convert(input, groupedSentences, groupIds) {
        return this.recordConversion(input, () => this._convert(input, groupedSentences, groupIds));
    }
    async recordConversion(input, work) {
        let result;
        try {
            result = await work();
        } catch (error) {
            this.recorder.record(input, null, error);
            throw error;
        }
        try {
            result.diagnostics = this.recorder.record(input, result);
        } catch (error) {
            error.phase = "diagnostic-persistence";
            try {
                this.recorder.record(input, null, error);
            } catch {}
            throw error;
        }
        return result;
    }
    async _convertSegments({segments: segments, ...options}) {
        if (!Array.isArray(segments) || !segments.length || segments.length > 128 || segments.some(text => typeof text !== "string") || segments.join("").length > 5e4) throw new Error("每批須為 1–128 個文字段落，合計最多 50,000 字。");
        const replacementConfig = replacements.validate(options.replacements);
        if (replacements.active(replacementConfig)) {
            const result = await this.convertPipeline({
                ...options,
                text: segments.join("")
            }, segments, replacementConfig);
            return {
                mode: result.mode,
                engine: result.engine,
                usePosLexicon: result.usePosLexicon,
                stats: result.stats,
                warnings: result.warnings,
                elapsed_ms: result.elapsed_ms,
                segments: result.sentences.map((sentence, i) => ({
                    text: sentence.after,
                    sentences: [ sentence ],
                    ...result.classicalQuotePlan ? {
                        classicalQuotePlan: classicalPostScan.seal({
                            kind: "group",
                            children: [ result.classicalQuotePlan.children[i] ]
                        })
                    } : {}
                }))
            };
        }
        const groups = segments.map(splitSentences);
        const groupIds = groups.flatMap((group, i) => group.map(() => i));
        const result = await this._convert({
            ...options,
            text: segments.join("")
        }, groups.flat(), groupIds);
        let offset = 0;
        return {
            mode: result.mode,
            engine: result.engine,
            usePosLexicon: result.usePosLexicon,
            stats: result.stats,
            warnings: result.warnings,
            elapsed_ms: result.elapsed_ms,
            segments: groups.map(group => {
                const sentences = result.sentences.slice(offset, offset += group.length);
                const segment = {
                    text: sentences.map(sentence => sentence.after).join(""),
                    sentences: sentences
                };
                if (result.classicalQuotePlan) segment.classicalQuotePlan = classicalPostScan.seal({
                    kind: "group",
                    children: result.classicalQuotePlan.children.slice(offset - group.length, offset)
                });
                return segment;
            })
        };
    }
    async _convert({text: text, direction: direction = "s2t", mode: mode = "context", dictionary: dictionary = [], variants: variants = [], profile: profile = "modern", preserveZhe: preserveZhe = true, usePosLexicon: usePosLexicon = false, useLinguisticCorrections: useLinguisticCorrections = true, deferClassicalQuotes: deferClassicalQuotes = false, replacements: replacementSettings}, groupedSentences, groupIds) {
        const selectedMode = resolveMode(mode);
        const engine = selectedMode.engine;
        const posLexicon = engine === "hanlp" ? this.fastPosLexicon : this.posLexicon;
        const linguistic = engine === "hanlp" ? this.fastLinguistic : this.linguistic;
        if (typeof text !== "string" || text.length > 1e5) throw new Error("請輸入文字，每次最多 100,000 字。");
        if (![ "s2t", "t2s" ].includes(direction)) throw new Error("轉換設定不正確。");
        getProfile(profile);
        if (typeof deferClassicalQuotes !== "boolean") throw Error("古籍引文後掃描設定須為布林值。");
        if (typeof usePosLexicon !== "boolean") throw new Error("詞性詞庫設定須為布林值。");
        if (usePosLexicon && !selectedMode.analysis) throw new Error("使用詞性詞庫時，請選擇快速（HanLP）或慢速（LTP）模式。");
        if (typeof preserveZhe !== "boolean") throw new Error("着／著設定須為布林值。");
        validateVariants(variants);
        const replacementConfig = replacements.validate(replacementSettings);
        if (replacements.active(replacementConfig)) return this.convertPipeline({
            text: text,
            direction: direction,
            mode: mode,
            dictionary: dictionary,
            variants: variants,
            profile: profile,
            preserveZhe: preserveZhe,
            usePosLexicon: usePosLexicon,
            useLinguisticCorrections: useLinguisticCorrections,
            deferClassicalQuotes: deferClassicalQuotes
        }, [ text ], replacementConfig);
        const started = performance.now();
        const custom = validateCustom(dictionary).filter(rule => rule.enabled && rule.direction === direction);
        const sentences = groupedSentences || splitSentences(text);
        const selected = getConverter(profile, direction);
        const parsed = sentences.map(() => []);
        const nativeParsed = sentences.map(() => []);
        const warnings = [];
        const contextual = new Map;
        const analysisStats = {
            engine: engine,
            input_sentences: sentences.length,
            analyzed_sentences: 0,
            skipped_sentences: sentences.length,
            input_characters: Array.from(text).length,
            analyzed_characters: 0
        };
        const semanticProfile = profile === "modern" || profile.endsWith("-old");
        if (selectedMode.analysis) {
            const analysisSet = direction === "s2t" ? analysisCharacters(profile, variants) : new Set;
            const needsAnalysis = sentence => profile === "student" && !!sentence.trim() || /计划|計劃|計畫|[咨諮](?:询|詢|文)|[铲鏟剷]/u.test(sentence) || Array.from(sentence).some(character => analysisSet.has(character)) || custom.some(rule => rule.pos && sentence.includes(rule.source)) || usePosLexicon && posLexicon.needsAnalysis(sentence, direction);
            const selectedIndices = sentences.map((sentence, index) => needsAnalysis(sentence) ? index : -1).filter(index => index >= 0);
            const selectedSentences = selectedIndices.map(index => sentences[index]);
            analysisStats.analyzed_sentences = selectedIndices.length;
            analysisStats.skipped_sentences -= selectedIndices.length;
            analysisStats.analyzed_characters = selectedSentences.reduce((n, sentence) => n + Array.from(sentence).length, 0);
            if (selectedSentences.length) try {
                const cecc = engine === "hanlp" ? this.getHanlpCecc() : this.getCecc();
                let tags = await cecc.tag_paragraph(selectedSentences);
                selectedIndices.forEach((index, i) => {
                    nativeParsed[index] = tokenPositions(structuredClone(tags[i]), sentences[index]);
                });
                if (engine === "hanlp") tags = tags.map(require("./hanlp-native-matching").project);
                const proposals = direction === "s2t" ? await cecc.to_TW(selectedSentences, {
                    tagged_word_list_of_paragraphs: tags,
                    forced_convert_mode: false
                }) : selectedSentences;
                selectedIndices.forEach((index, i) => {
                    parsed[index] = tokenPositions(tags[i], sentences[index]);
                    contextual.set(index, proposals[i]);
                });
            } catch (error) {
                throw new Error((engine === "hanlp" ? "HanLP 快速模式" : "LTP 慢速模式") + "詞性分析無法完成：" + error.message);
            }
        } else if (custom.some(rule => rule.pos)) {
            warnings.push("純詞庫相容模式未套用帶有詞性條件的自訂詞條。");
        }
        const quoteEnabled = direction === "s2t" && profile === "modern", quotePlans = [];
        const records = sentences.map((before, index) => {
            const neighbors = {
                previous: !groupIds || groupIds[index - 1] === groupIds[index] ? sentences[index - 1] : undefined,
                next: !groupIds || groupIds[index + 1] === groupIds[index] ? sentences[index + 1] : undefined,
                previousContext: sentences.slice(Math.max(0, index - 3), index).filter((_, j) => !groupIds || groupIds[Math.max(0, index - 3) + j] === groupIds[index]).join("")
            };
            const analysis = direction === "s2t" && profile === "modern" && useLinguisticCorrections ? linguistic.analyze(before, parsed[index], neighbors) : {
                tokens: parsed[index],
                corrections: [],
                matches: []
            };
            const effective = analysis.tokens;
            const sourceBaseline = direction === "s2t" ? phraseConversion(before, profile, semanticProfile ? effective : []) : null;
            let baseline = direction === "s2t" && semanticProfile ? sourceBaseline.text : selected.convertSync(before);
            const choices = [];
            const resolvedPositions = sourceBaseline?.resolved || new Set;
            const phraseResolved = new Set(resolvedPositions);
            const posPriority = new Set;
            const proposal = contextual.get(index);
            if (proposal !== undefined) {
                const source = Array.from(before), target = Array.from(proposal);
                const protectedPositions = resolvedPositions;
                if (source.length === target.length) {
                    let offset = 0;
                    const converted = Array.from(baseline);
                    source.forEach((character, i) => {
                        const choice = target[i];
                        const accepted = !protectedPositions.has(i) && character !== choice && ambiguous.get(character)?.includes(choice) && (profile === "modern" || profileCandidates(profile, character, [ character ]).includes(selected.convertSync(choice)));
                        if (accepted) {
                            choices.push({
                                source: character,
                                target: choice,
                                offset: offset
                            });
                            converted[i] = semanticProfile ? choice : selected.convertSync(choice);
                            resolvedPositions.add(i);
                        }
                        offset += character.length;
                    });
                    baseline = converted.join("");
                } else warnings.push("有一個句子的詞性規則改變了字數，該句使用所選標準的詞庫結果。");
            }
            if (direction === "s2t" && semanticProfile) {
                const characters = Array.from(baseline);
                for (const rule of [ ...decisions(before, effective, phraseResolved, neighbors), ...profile === "modern" ? require("./tai-policy").decisions(before, effective) : [] ]) {
                    if (!rule.directionalRule && !ambiguous.get(rule.source)?.includes(rule.target) && !(rule.lexicon && rule.source === rule.target)) continue;
                    const position = Array.from(before.slice(0, rule.offset)).length;
                    characters[position] = rule.target;
                    resolvedPositions.add(position);
                    if (rule.posPriority) posPriority.add(position);
                    const previous = choices.findIndex(choice => choice.offset === rule.offset);
                    if (previous !== -1) choices.splice(previous, 1);
                    choices.push(rule);
                }
                baseline = profile === "modern" ? applyStandard(before, characters.join(""), variants, resolvedPositions) : characters.join("");
            }
            if (direction === "s2t") baseline = applyHistorical(profile, before, baseline);
            const lexical = usePosLexicon ? posLexicon.apply(before, baseline, effective, direction, {
                resolved: resolvedPositions,
                phraseResolved: phraseResolved,
                posPriority: posPriority,
                variants: profile === "modern" ? variants : undefined
            }) : {
                text: baseline,
                hits: []
            };
            baseline = lexical.text;
            if (direction === "s2t" && profile === "modern") baseline = preferredGlyphs(preferredWords(before, productiveManual(before, restrictOutput(before, baseline), effective), effective));
            for (const hit of lexical.hits) {
                for (let i = choices.length - 1; i >= 0; i--) if (choices[i].offset >= hit.offset && choices[i].offset < hit.offset + hit.source.length) choices.splice(i, 1);
                let offset = hit.offset;
                const target = Array.from(hit.target);
                Array.from(hit.source).forEach((character, i) => {
                    if (character !== target[i]) choices.push({
                        source: character,
                        target: target[i],
                        offset: offset,
                        pos: hit.pos,
                        reason: "詞性詞庫：完整詞「" + hit.source + "」匹配 " + hit.pos + "；採用「" + hit.target + "」。" + (hit.basis === "word-frequency" ? "按整詞詞頻兜底，仍需語義校對。" : hit.basis?.startsWith("manual") ? "人工指定詞性分化。" : "")
                    });
                    offset += character.length;
                });
            }
            if (preserveZhe) baseline = retainZhe(before, baseline);
            const special = direction === "s2t" && profile === "modern" ? specialized.apply(before, baseline, effective) : {
                text: baseline,
                hits: []
            };
            baseline = special.text;
            const linguisticResult = linguistic.apply(before, baseline, analysis);
            baseline = linguisticResult.text;
            const network = lexicalNetwork.apply(before, baseline, parsed[index], {
                enabled: this.lexicalNetworkEnabled,
                direction: direction,
                profile: profile,
                mode: selectedMode.analysis ? "context" : "dictionary",
                useLinguisticCorrections: useLinguisticCorrections,
                protectedPositions: posPriority,
                choices: choices,
                analysisMatches: analysis.matches,
                specializedHits: special.hits
            });
            const student = direction === "s2t" && profile === "student" ? studentStandard.apply(before, network.text, effective, {
                preserveZhe: preserveZhe
            }) : {
                text: network.text,
                hits: [],
                risks: []
            };
            const profileResult = direction === "s2t" ? profileRules.apply(before, student.text, effective, profile, nativeParsed[index]) : {
                text: student.text,
                hits: []
            };
            baseline = excludedCharacters.mapping(before, profileResult.text);
            for (const h of profileResult.hits) {
                let offset = h.offset;
                [ ...h.source ].forEach((source, i) => {
                    const target = [ ...h.target ][i];
                    if (source !== target) choices.push({
                        source: source,
                        target: target,
                        offset: offset,
                        reason: h.rule,
                        version: profileRules.version
                    });
                    offset += source.length;
                });
            }
            for (const h of student.hits) {
                let offset = h.offset;
                [ ...h.source ].forEach((source, i) => {
                    const target = [ ...h.target ][i];
                    if (source !== target) choices.push({
                        source: source,
                        target: target,
                        offset: offset,
                        reason: h.rule,
                        version: studentStandard.version
                    });
                    offset += source.length;
                });
            }
            for (const h of network.hits) choices.push({
                source: h.source,
                target: h.target,
                offset: h.start,
                pos: h.pos,
                reason: h.reason
            });
            const finalCharacters = Array.from(baseline);
            for (let choice = choices.length - 1; choice >= 0; choice--) {
                const position = Array.from(before.slice(0, choices[choice].offset)).length;
                if (finalCharacters[position] !== choices[choice].target) choices.splice(choice, 1);
            }
            if (quoteEnabled) quotePlans.push({
                kind: "sentence",
                before: before,
                converted: baseline,
                tokens: custom.some(r => r.pos) ? effective.map(({text: text, pos: pos, start: start, end: end}) => ({
                    text: text,
                    pos: pos,
                    start: start,
                    end: end
                })) : [],
                protectedHits: special.hits.map(({source: source, offset: offset}) => ({
                    source: source,
                    offset: offset
                }))
            });
            const {output: after, hits: hits} = applyCustom(before, baseline, custom, effective);
            const occurrences = [];
            let offset = 0;
            for (const character of before) {
                const activeAmbiguous = profile === "modern" ? modernAmbiguous : ambiguous;
                const sources = direction === "s2t" ? activeAmbiguous.has(character) ? [ character ] : [] : inverseAmbiguous.get(character) || [];
                for (const source of sources) occurrences.push({
                    character: character,
                    source: source,
                    offset: offset,
                    candidates: direction === "s2t" ? profile === "modern" ? candidatesFor(source, activeAmbiguous.get(source), variants) : profileCandidates(profile, source, activeAmbiguous.get(source)) : ambiguous.get(source),
                    pos: parsed[index].find(token => token.start <= offset && offset < token.end)?.pos || ""
                });
                offset += character.length;
            }
            return diagnostics.attach({
                before: before,
                after: after,
                changed: before !== after,
                occurrences: occurrences.filter(item => item.candidates.length > 1),
                choices: choices,
                custom: hits,
                posLexiconHits: lexical.hits,
                studentStandardHits: student.hits,
                profileRuleHits: profileResult.hits,
                ...engine === "hanlp" ? {
                    analysisSyntax: {
                        source: "HanLP-native-label-compatibility-v1",
                        notNativePredictions: true,
                        tokens: effective.map(({text: text, pos: pos, parent: parent, relation: relation, native_relation: native_relation}) => ({
                            text: text,
                            pos: pos,
                            parent: parent,
                            relation: relation,
                            native_relation: native_relation
                        }))
                    }
                } : {},
                specializedHits: special.hits,
                classicalQuoteHits: [],
                networkHits: network.hits,
                networkPending: network.pending || [],
                analysisTokens: effective.map(({text: text, pos: pos}) => ({
                    text: text,
                    pos: pos
                })),
                analysisCorrections: analysis.corrections,
                linguisticHits: linguisticResult.hits,
                riskWords: [ ...student.risks, ...posLexicon.risks(before, parsed[index], direction), ...direction === "s2t" ? require("./zhi-policy").risks(before, nativeParsed[index]) : [], ...direction === "s2t" ? require("./dou-policy").risks(before, nativeParsed[index]) : [], ...direction === "s2t" && profile === "modern" ? [ ...contextRisks(before, parsed[index], neighbors), ...require("./zhan-policy").analyze(before, parsed[index]).pending, ...require("./hair-state-rules").risks(before, parsed[index]), ...require("./fu-liao-preferences").risks(before, nativeParsed[index]), ...require("./word-boundary-risk").risks(before, parsed[index], require("./cai-risk").risks(before, parsed[index])) ] : [] ],
                tokens: parsed[index].map(({text: text, pos: pos}) => ({
                    text: text,
                    pos: pos
                })),
                diff: difference(before, after).map(({value: value, added: added, removed: removed}) => ({
                    value: value,
                    added: !!added,
                    removed: !!removed
                }))
            }, nativeParsed[index]);
        });
        const result = {
            text: records.map(record => record.after).join(""),
            sentences: records,
            elapsed_ms: Math.round(performance.now() - started),
            direction: direction,
            mode: mode,
            engine: engine,
            variants: variants,
            profile: profile,
            preserveZhe: preserveZhe,
            usePosLexicon: usePosLexicon,
            warnings: [ ...new Set(warnings) ],
            stats: {
                classical_quotes: {
                    enabled: direction === "s2t" && profile === "modern",
                    version: classicalQuotes.version,
                    count: classicalQuotes.count,
                    phase: quoteEnabled ? "deferred" : "disabled",
                    hits: 0
                },
                specialized_terms: {
                    enabled: direction === "s2t" && profile === "modern",
                    version: specialized.version,
                    hits: records.reduce((n, r) => n + r.specializedHits.length, 0)
                },
                pos_lexicon: {
                    enabled: usePosLexicon,
                    version: usePosLexicon ? posLexicon.version : null,
                    hits: records.reduce((n, r) => n + r.posLexiconHits.length, 0)
                },
                analysis: analysisStats,
                sentences: records.length,
                ambiguous_sentences: records.filter(record => record.occurrences.length).length,
                occurrences: records.reduce((n, record) => n + record.occurrences.length, 0),
                context_choices: records.reduce((n, record) => n + record.choices.length, 0),
                custom_hits: records.reduce((n, record) => n + record.custom.length, 0)
            }
        };
        if (quoteEnabled) {
            const plan = classicalPostScan.seal({
                kind: "group",
                children: quotePlans
            });
            if (deferClassicalQuotes) result.classicalQuotePlan = plan; else this.applyClassicalPostScan(result, plan, custom);
        }
        result.elapsed_ms = Math.round(performance.now() - started);
        return result;
    }
    async convertPipeline(options, groups, config) {
        const started = performance.now(), prepared = [], flat = [], flatGroups = [];
        const pre = replacements.rules(config.pre), post = replacements.rules(config.post);
        for (const before of groups) {
            const hits = [], spans = replacements.protect(before, config.protect);
            for (const span of spans) {
                if (span.protected) {
                    hits.push({
                        source: span.text,
                        target: span.text,
                        phase: "protect",
                        count: 1
                    });
                    continue;
                }
                const replaced = replacements.replace(span.text, pre, "pre");
                span.text = replaced.text;
                hits.push(...replaced.hits);
                span.start = flat.length;
                const sentences = splitSentences(span.text);
                flatGroups.push(...sentences.map(() => span.start));
                flat.push(...sentences);
                span.end = flat.length;
            }
            prepared.push({
                before: before,
                spans: spans,
                hits: hits,
                setupHits: [ ...hits ]
            });
        }
        const inner = await this._convert({
            ...options,
            text: flat.join(""),
            replacements: {},
            deferClassicalQuotes: true
        }, flat, flatGroups);
        const records = prepared.map(({before: before, spans: spans, hits: hits}) => {
            const after = spans.map(span => {
                if (span.protected) return span.text;
                const records = inner.sentences.slice(span.start, span.end);
                for (const record of records) hits.push(...record.custom.map(h => ({
                    ...h,
                    phase: "dictionary",
                    count: 1
                })));
                const replaced = replacements.replace(records.map(r => r.after).join(""), post, "post");
                hits.push(...replaced.hits);
                return replaced.text;
            }).join("");
            if (after.length > 2e5) throw new Error("自訂取代結果超過 200,000 字，請分批處理。");
            let offset = 0;
            const occurrences = [];
            for (const character of before) {
                const activeAmbiguous = inner.profile === "modern" ? modernAmbiguous : ambiguous;
                const sources = inner.direction === "s2t" ? activeAmbiguous.has(character) ? [ character ] : [] : inverseAmbiguous.get(character) || [];
                for (const source of sources) occurrences.push({
                    character: character,
                    source: source,
                    offset: offset,
                    pos: "",
                    candidates: inner.profile === "modern" ? candidatesFor(source, activeAmbiguous.get(source), inner.variants) : profileCandidates(inner.profile, source, activeAmbiguous.get(source))
                });
                offset += character.length;
            }
            return diagnostics.attachStages({
                before: before,
                after: after,
                changed: before !== after,
                occurrences: occurrences.filter(item => item.candidates.length > 1),
                choices: [],
                tokens: [],
                custom: hits,
                pipeline: true,
                classicalQuoteHits: [],
                diff: difference(before, after).map(({value: value, added: added, removed: removed}) => ({
                    value: value,
                    added: !!added,
                    removed: !!removed
                }))
            }, spans.filter(s => !s.protected).flatMap(s => inner.sentences.slice(s.start, s.end)));
        });
        const result = {
            ...inner,
            text: records.map(r => r.after).join(""),
            sentences: records,
            elapsed_ms: Math.round(performance.now() - started),
            warnings: [ ...inner.warnings, "自訂流程已套用；差異以完整文字區塊顯示。保護字詞隔離於轉換及前後取代之外。" ],
            stats: {
                classical_quotes: inner.stats.classical_quotes,
                specialized_terms: inner.stats.specialized_terms,
                pos_lexicon: inner.stats.pos_lexicon,
                analysis: inner.stats.analysis,
                sentences: records.length,
                ambiguous_sentences: records.filter(r => r.occurrences.length).length,
                occurrences: records.reduce((n, r) => n + r.occurrences.length, 0),
                context_choices: inner.stats.context_choices,
                custom_hits: records.reduce((n, r) => n + r.custom.reduce((n, h) => n + (h.count || 1), 0), 0)
            }
        };
        if (inner.classicalQuotePlan) {
            const plan = classicalPostScan.seal({
                kind: "group",
                children: prepared.map(p => ({
                    kind: "pipeline",
                    before: p.before,
                    replacements: config,
                    setupHits: p.setupHits,
                    spans: p.spans.map(span => span.protected ? {
                        kind: "protected",
                        text: span.text
                    } : {
                        kind: "group",
                        children: inner.classicalQuotePlan.children.slice(span.start, span.end)
                    })
                }))
            });
            if (options.deferClassicalQuotes) result.classicalQuotePlan = plan; else {
                delete result.classicalQuotePlan;
                this.applyClassicalPostScan(result, plan, validateCustom(options.dictionary || []).filter(r => r.enabled && r.direction === (options.direction || "s2t")));
            }
        }
        result.elapsed_ms = Math.round(performance.now() - started);
        return result;
    }
    applyClassicalPostScan(result, plan, custom) {
        const scanned = classicalPostScan.execute(plan, {
            custom: custom,
            applyCustom: applyCustom,
            difference: difference
        });
        if (scanned.patches.length !== result.sentences.length) throw Error("古籍後掃描的句段數量不符。");
        result.sentences.forEach((record, i) => Object.assign(record, scanned.patches[i]));
        result.text = scanned.text;
        result.stats.classical_quotes = {
            ...result.stats.classical_quotes,
            ...scanned.stats
        };
        result.stats.custom_hits = result.sentences.reduce((n, s) => n + (s.custom || []).reduce((m, h) => m + (h.count || 1), 0), 0);
        return scanned;
    }
    async scanClassicalQuotes(input) {
        const context = {
            ...input.diagnosticsContext || {},
            phase: "classical-quote-postscan"
        };
        return this.recordConversion({
            ...input,
            diagnosticsContext: context
        }, async () => {
            if ((input.direction || "s2t") !== "s2t" || (input.profile || "modern") !== "modern") throw Error("古籍引文後掃描只用於現代標準的簡轉繁。");
            if (!Array.isArray(input.plans) || !input.plans.length || input.plans.length > 128 || JSON.stringify(input.plans).length > 15e5) throw Error("每批古籍後掃描須為1–128個段落，計畫合計最多1,500,000字元。");
            const custom = validateCustom(input.dictionary || []).filter(r => r.enabled && r.direction === "s2t");
            const scanned = input.plans.map(plan => classicalPostScan.execute(plan, {
                custom: custom,
                applyCustom: applyCustom,
                difference: difference
            }));
            const segments = scanned.map((s, i) => ({
                text: s.text,
                patches: s.patches,
                classicalQuoteScan: s.stats,
                sentences: [ {
                    before: s.initialText,
                    after: s.text,
                    classicalQuoteHits: s.hits,
                    custom: s.custom,
                    sourcePlanSha256: input.plans[i].planSha256
                } ]
            }));
            return {
                segments: segments,
                stats: {
                    classical_quotes: {
                        enabled: true,
                        version: classicalQuotes.version,
                        phase: "post-conversion",
                        scanned_units: scanned.length,
                        scanned_sentences: scanned.reduce((n, s) => n + s.stats.scanned_sentences, 0),
                        hits: scanned.reduce((n, s) => n + s.stats.hits, 0),
                        corrections: scanned.reduce((n, s) => n + s.stats.corrections, 0)
                    }
                }
            };
        });
    }
    close() {
        this.cecc?.close();
        this.hanlpCecc?.close();
    }
}

module.exports = {
    Converter: Converter,
    dictionaries: dictionaries,
    ambiguous: ambiguous,
    splitSentences: splitSentences,
    validateCustom: validateCustom,
    ...require("./semantic-branches"),
    openccVersion: require("opencc/package.json").version
};

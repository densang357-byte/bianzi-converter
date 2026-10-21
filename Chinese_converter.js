"use strict";

let CeL;

try {
    CeL = require("cejs");
} catch (e) {
    require("./_CeL.loader.nodejs.js");
    CeL = globalThis.CeL;
}

CeL.env.ignore_COM_error = true;

CeL.run([ "application.debug", "application.locale", "interact.console", "data.Convert_Pairs", "extension.zh_conversion", "application.net.Ajax", "application.storage" ]);

const NOT_FOUND = "".indexOf("_");

const PATTERN_non_Chinese_characters = /^[\u0000-\u00ff]*$/;

const module_base_path = CeL.append_path_separator(module.path);

const test_directory = CeL.append_path_separator(module_base_path + "_test suite");

const CeL_CN_to_TW = CeL.zh_conversion.CN_to_TW, CeL_TW_to_CN = CeL.zh_conversion.TW_to_CN;

const KEY_word = "word", KEY_PoS_tag = "tag", KEY_filter_name = "filter_name";

const DEFAULT_TEST_FILE_EXTENSION = "txt";

const dictionary_template = {
    TW: "CN_to_TW.%name.%type.txt",
    CN: "TW_to_CN.%name.%type.txt"
};

function get_dictionary_file_paths(type) {
    if (!this.parser_name) throw new Error("No parser name specified!");
    const dictionary_file_paths = Object.create(null);
    for (const language in dictionary_template) {
        let path = dictionary_template[language].replace("%name", this.parser_name).replace("%type", type || "PoS");
        if (type === "filters") path = path.replace(/[^.]+$/, "js");
        dictionary_file_paths[language] = path;
    }
    if (!type) this.dictionary_file_paths = dictionary_file_paths;
    return dictionary_file_paths;
}

class Chinese_converter {
    constructor(options) {
        this.conversion_pairs = Object.create(null);
        this.tailored_conversion_pairs = Object.create(null);
        this.KEY_word = KEY_word;
        this.KEY_PoS_tag = KEY_PoS_tag;
        if (options?.LTP_URL) {
            this.LTP_URL = options.LTP_URL;
            options.using_LTP = options.using_LTP || true;
        }
        if (options?.using_LTP) {
            this.KEY_word = "text";
            this.KEY_PoS_tag = "pos";
            this.TAG_punctuation = "wp";
            this.condition_filter = condition_filter_LTP;
            this.parser_name = "LTP";
            this.filters = get_dictionary_file_paths.call(this, "filters");
            for (const language in this.filters) {
                const dictionary_file_path = this.dictionaries_directory + this.filters[language];
                this.filters[language] = require(dictionary_file_path);
            }
            this.generate_condition = generate_condition_LTP;
            load_synonym_dictionary.call(this);
            this.tag_paragraph = tag_paragraph_LTP;
            this.LTP_batch_size = options.LTP_batch_size ?? 1;
            if (!Number.isInteger(this.LTP_batch_size) || this.LTP_batch_size < 1) throw new RangeError("LTP_batch_size must be a positive integer");
            this.batch_get_tag = !this.LTP_URL || this.LTP_batch_size > 1;
            if (!this.LTP_URL) this.LTP_worker = new (require("./resources/ltp_worker.js"))(options);
        } else if (options?.CoreNLP_URL) {
            this.KEY_PoS_tag = "pos";
            this.CoreNLP_URL = new URL(options.CoreNLP_URL);
            this.parser_name = "CoreNLP";
            this.CoreNLP_URL_properties = {
                annotators: "tokenize,ssplit,pos,depparse"
            };
            this.tag_paragraph = tag_paragraph_via_CoreNLP;
        } else {
            this.nodejieba_CN = require("nodejieba");
            this.nodejieba_CN.load({
                dict: this.dictionaries_directory + "commons.txt"
            });
            this.parser_name = "jieba";
            this.tag_paragraph = tag_paragraph_jieba;
        }
        get_dictionary_file_paths.call(this);
        this.dictionary_file_path_loaded_Set = new Set;
        for (const convert_to_language in this.dictionary_file_paths) {
            const dictionary_file_path = this.dictionary_file_paths[convert_to_language] = this.dictionaries_directory + this.dictionary_file_paths[convert_to_language];
            load_dictionary.call(this, dictionary_file_path, {
                convert_to_language: convert_to_language
            });
        }
        if (CeL.is_debug()) {
            for (const [language, conversion_pairs] of Object.entries(this.conversion_pairs)) {
                CeL.info({
                    T: [ "%1轉換對：", CeL.gettext.get_alias(language) ]
                });
                function show_conversion_pairs(_pairs, tag = "general") {
                    const size = _pairs.size;
                    if (size > 0) {
                        CeL.log(`\t${tag || "general"}\t${size} conversion(s)${size < 9 ? "\t" + Array.from(_pairs.keys()).join("\t") : ""}`);
                    }
                }
                show_conversion_pairs(conversion_pairs.get(KEY_general_pattern_filter));
                for (const [tag, _pairs] of Object.entries(conversion_pairs.get(KEY_tag_pattern_filter))) {
                    show_conversion_pairs(_pairs, tag);
                }
            }
        }
        if (options?.load_default_text_to_check !== false) this.load_default_text_to_check();
    }
    close() {
        this.LTP_worker?.close();
    }
    async to_TW(paragraphs, options) {
        return await convert_Chinese.call(this, await paragraphs, {
            convert_to_language: "TW",
            ...options
        });
    }
    to_TW_sync(paragraphs, options) {
        return convert_Chinese.call(this, paragraphs, {
            convert_to_language: "TW",
            ...options
        });
    }
    async to_CN(paragraphs, options) {
        return await convert_Chinese.call(this, await paragraphs, {
            convert_to_language: "CN",
            ...options
        });
    }
    to_CN_sync(paragraphs, options) {
        return convert_Chinese.call(this, paragraphs, {
            convert_to_language: "CN",
            ...options
        });
    }
    detect_domain(paragraphs, options) {}
    static async has_LTP_server(options) {
        if (typeof options === "string") {
            options = {
                LTP_URL: options
            };
        } else {
            options = {
                LTP_URL: "http://localhost:5000/",
                ...options
            };
        }
        if (options.skip_server_test) {
            CeL.debug("強制使用 LTP server，跳過對 LTP server 的運作測試。請只在您準備全程使用 cache 的情況下才使用這個選項。", 1, Chinese_converter.has_LTP_server.name);
            return options.LTP_URL;
        }
        try {
            const result = await tag_paragraph_LTP.call(options, "測試繁簡轉換伺服器是否正常運作");
            return Array.isArray(result) && options.LTP_URL;
        } catch (e) {}
    }
}

function to_converted_file_path(convert_from_text__file_name) {
    return convert_from_text__file_name.replace(/(\.\w+)$/, ".converted$1");
}

async function regenerate_converted(convert_from_text__file_path, convert_to_text__file_status, options) {
    CeL.info([ regenerate_converted.name + ": ", {
        T: [ "生成 %1 的解答檔", options.convert_from_text__file_name || convert_from_text__file_path ]
    } ]);
    let converted_text = CeL.read_file(convert_from_text__file_path).toString();
    converted_text = options.text_is_TW ? await this.to_CN(converted_text, options.convert_options || regenerate_converted.default_convert_options) : await this.to_TW(converted_text, options.convert_options || regenerate_converted.default_convert_options);
    CeL.write_file(convert_to_text__file_status, converted_text, {
        backup: {
            directory_name: "backup"
        }
    });
}

regenerate_converted.default_convert_options = {
    cache_directory: CeL.append_path_separator(test_directory + "cache_data"),
    cache_file_for_short_sentences: true,
    min_cache_length: 40
};

function get_convert_from_text__file_path(convert_from_text__file_name, options) {
    let test_articles_directory = this.test_articles_directory;
    let file_path = test_articles_directory + convert_from_text__file_name;
    if (CeL.file_exists(file_path)) return file_path;
    test_articles_directory += this.test_articles_archives_directory;
    file_path = test_articles_directory + convert_from_text__file_name;
    if (options?.check_file_exists && !CeL.file_exists(file_path)) return;
    return file_path;
}

function get_convert_to_text__file_status(convert_from_text__file_name, options) {
    options = CeL.setup_options(options);
    let test_articles_directory = this.test_articles_directory;
    const convert_from_text__file_path = options.is_file_path ? convert_from_text__file_name : get_convert_from_text__file_path.call(this, convert_from_text__file_name);
    const convert_from_text__file_status = CeL.fso_status(convert_from_text__file_path);
    const convert_to_text__file_path = options.convert_to_text__file_path || (options.convert_to_text__file_name ? test_articles_directory + options.convert_to_text__file_name : Chinese_converter.to_converted_file_path(convert_from_text__file_path));
    const convert_to_text__file_status = CeL.fso_status(convert_to_text__file_path);
    const need_to_generate_new_convert_to_text__file = options.regenerate_converted || !convert_to_text__file_status || convert_from_text__file_status.mtime - convert_to_text__file_status.mtime > 0;
    return {
        convert_from_text__file_path: convert_from_text__file_path,
        convert_from_text__file_status: convert_from_text__file_status,
        convert_to_text__file_path: convert_to_text__file_path,
        convert_to_text__file_status: convert_to_text__file_status,
        need_to_generate_new_convert_to_text__file: need_to_generate_new_convert_to_text__file
    };
}

async function not_new_article_to_check(convert_from_text__file_name, options) {
    options = CeL.setup_options(options);
    const {convert_from_text__file_path: convert_from_text__file_path, convert_from_text__file_status: convert_from_text__file_status, convert_to_text__file_path: convert_to_text__file_path, convert_to_text__file_status: convert_to_text__file_status, need_to_generate_new_convert_to_text__file: need_to_generate_new_convert_to_text__file} = get_convert_to_text__file_status.call(this, convert_from_text__file_name, options);
    if (need_to_generate_new_convert_to_text__file) {
        await this.regenerate_converted(convert_from_text__file_path, convert_to_text__file_path, {
            ...options,
            convert_from_text__file_name: convert_from_text__file_name
        });
    }
    if (options.recheck) {
        return;
    }
    const latest_test_result = options.latest_test_result && options.latest_test_result[options.test_name];
    const latest_test_result_for_file = latest_test_result && latest_test_result.test_results && latest_test_result.test_results[convert_from_text__file_name];
    const latest_test_result_date = latest_test_result_for_file?.error_count === 0 ? Date.parse(latest_test_result_for_file?.date) : convert_to_text__file_status ? Math.max(convert_from_text__file_status.mtime.getTime(), convert_to_text__file_status.mtime.getTime()) : convert_from_text__file_status.mtime.getTime();
    for (const dictionary_file_path of Object.values(this.dictionary_file_paths)) {
        const dictionary_file_status = CeL.fso_status(dictionary_file_path);
        if (dictionary_file_status.mtime - latest_test_result_date > 0) {
            CeL.info(`${not_new_article_to_check.name}: ${convert_from_text__file_name}: 自上次測試後，有新修改的辭典檔 ${dictionary_file_path}`);
            if (latest_test_result) delete latest_test_result[convert_from_text__file_name];
            return;
        }
    }
    if (latest_test_result_date - convert_from_text__file_status.mtime > 0) {
        return !convert_to_text__file_status || latest_test_result_date > convert_to_text__file_status.mtime;
    }
}

function load_tailored_dictionary(options) {
    if (!options.export) {
        return;
    }
    const {work_title: work_title, original_work_title: original_work_title} = options.export;
    const path_prefix = this.tailored_dictionaries_directory + work_title + ".";
    const original_work_title__path_prefix = this.tailored_dictionaries_directory + original_work_title + ".";
    const _this = this;
    function check_and_load(is_CeCC, to_TW, try_original_work_title) {
        const using_title = try_original_work_title ? original_work_title : work_title;
        let dictionary_file_path_to_load = (try_original_work_title ? original_work_title__path_prefix : path_prefix) + (is_CeCC ? get_dictionary_file_paths.call(_this, "PoS")[to_TW ? "TW" : "CN"] : "additional." + (to_TW ? "to_TW" : "to_CN") + ".txt");
        if (_this.dictionary_file_path_loaded_Set.has(dictionary_file_path_to_load)) {
            return;
        }
        if (!CeL.file_exists(dictionary_file_path_to_load)) {
            if (!try_original_work_title) check_and_load(is_CeCC, to_TW, true);
            return;
        }
        if (try_original_work_title) {
            CeL.info(`${load_tailored_dictionary.name}: 無《${work_title}》之特設辭典，改採原標題《${original_work_title}》之特設辭典。`);
        }
        const contains = CeL.read_file(dictionary_file_path_to_load);
        const PATTERN_indicate_work_title = /(\n\/\/|@)\s*(《(?<work_title>[^.\n]+?)》)/g;
        let matched;
        while (matched = PATTERN_indicate_work_title.exec(contains)) {
            if (!matched.groups.work_title.startsWith(using_title)) {
                CeL.warn(`${load_tailored_dictionary.name}: 特設辭典可能混入了其他作品的設定？ (${dictionary_file_path_to_load}) ${matched[0]}`);
            }
        }
        matched = null;
        if (options.show_message) CeL.info(`${load_tailored_dictionary.name}: ${is_CeCC ? "載入 CeCC" : "設定載入 zh_conversion"} 用作品特設辭典 ${dictionary_file_path_to_load}`);
        if (is_CeCC) {
            load_dictionary.call(_this, dictionary_file_path_to_load, {
                convert_to_language: to_TW ? "TW" : "CN",
                priority: 0,
                tailored_key: using_title
            });
        } else {
            _this.dictionary_file_path_loaded_Set.add(dictionary_file_path_to_load);
            (to_TW ? CeL_CN_to_TW : CeL_TW_to_CN)[CeL.zh_conversion.KEY_converter].add_conversions({
                file_path: dictionary_file_path_to_load,
                remove_comments: true,
                sort: "主要繁簡轉換",
                tailored_key: using_title
            });
        }
    }
    check_and_load(false, true);
    check_and_load(false, false);
    check_and_load(true, true);
    check_and_load(true, false);
}

const KEY_files_loaded = Symbol("files loaded");

const KEY_watch_target_file_name_prefix = "watch_target.";

const MIN_English_WORK_TITLE_LENGTH = 3;

const MIN_NON_English_WORK_TITLE_LENGTH = 2;

const PATTERN_watch_target_file_name = new RegExp(CeL.to_RegExp_pattern(KEY_watch_target_file_name_prefix) + /(?<work_title>[^.\n]+)\.(?<to_language>TW|CN)\.\w+$/.source);

function extract_work_title_from_file_path(file_path) {
    const matched = file_path.match(PATTERN_watch_target_file_name);
    if (!matched) return;
    const work_title = matched.groups.work_title;
    const MIN_WORK_TITLE_LENGTH = /^[\u0020-\u00ff]*$/.test(work_title) ? MIN_English_WORK_TITLE_LENGTH : MIN_NON_English_WORK_TITLE_LENGTH;
    if (work_title.length < MIN_WORK_TITLE_LENGTH) {
        CeL.error(`${extract_work_title_from_file_path.name}: 作品名稱長度起碼須有${MIN_WORK_TITLE_LENGTH}個字元！跳過字典檔: ${file_path}`);
        return;
    }
    return work_title;
}

function load_text_to_check(should_be_text__file_name, options) {
    if (CeL.is_Object(should_be_text__file_name)) {
        if (should_be_text__file_name.all) {
            function load_directory(directory_name) {
                CeL.read_directory(directory_name).forEach(from_file_name => {
                    const work_title = extract_work_title_from_file_path(from_file_name);
                    if (work_title) {
                        this.load_text_to_check(from_file_name, {
                            export: {
                                work_title: work_title
                            }
                        });
                    }
                });
            }
            load_directory(this.test_articles_directory);
            load_directory(this.test_articles_directory + this.test_articles_archives_directory);
            return;
        }
        if (should_be_text__file_name.work_title) {
            options = CeL.setup_options(options);
            if (!options.export) {
                options.export = {
                    work_title: should_be_text__file_name.work_title,
                    original_work_title: should_be_text__file_name.original_work_title
                };
            }
            let first_file_name;
            if (![ "work_title", "original_work_title" ].some(key => {
                const work_title = should_be_text__file_name[key];
                if (!work_title) return;
                const file_name = `${KEY_watch_target_file_name_prefix}${work_title}.${should_be_text__file_name.convert_to_language}.${DEFAULT_TEST_FILE_EXTENSION}`;
                if (get_convert_from_text__file_path.call(this, file_name, {
                    check_file_exists: true
                })) {
                    should_be_text__file_name = file_name;
                    return true;
                }
                if (!first_file_name) first_file_name = file_name;
            })) {
                should_be_text__file_name = first_file_name;
            }
        } else {
            throw new Error(`${load_text_to_check.name}: Invalid should_be_text__file_name: ${JSON.stringify(should_be_text__file_name)}`);
        }
    }
    let check_language = should_be_text__file_name.match(/\.(TW|CN)\.\w+$/);
    if (!check_language) {
        CeL.error(`${load_text_to_check.name}: 無法判別檔案之語言: ${should_be_text__file_name}`);
        return;
    }
    check_language = check_language[1];
    options.show_message = true;
    this.load_tailored_dictionary(options);
    const convert_to_text__data = get_convert_to_text__file_status.call(this, should_be_text__file_name, options);
    const should_be_text__file_path = convert_to_text__data.convert_from_text__file_path;
    if (!this.generate_condition_for_language || options?.reset && !this.generate_condition_for_language.only_default) {
        this.generate_condition_for_language = {
            [KEY_files_loaded]: [],
            only_default: true
        };
        if (!options?.is_default) this.load_default_text_to_check();
    }
    if (this.generate_condition_for_language[KEY_files_loaded].includes(should_be_text__file_path)) {
        CeL.log([ load_text_to_check.name + ": ", {
            T: [ "跳過已載入的檔案：%1", should_be_text__file_path ]
        } ]);
        return;
    }
    if (!options?.is_default) delete this.generate_condition_for_language.only_default;
    this.generate_condition_for_language[KEY_files_loaded].push(should_be_text__file_path);
    const should_be_texts = get_paragraphs_of_file(should_be_text__file_path, {
        with_configurations: true
    });
    if (!should_be_texts) return;
    const source_text__file_path = convert_to_text__data.convert_to_text__file_path;
    if (convert_to_text__data.need_to_generate_new_convert_to_text__file) {
        const base_cache_directory = regenerate_converted.default_convert_options.cache_directory;
        CeL.create_directory(base_cache_directory);
        return this.regenerate_converted(should_be_text__file_path, source_text__file_path, {
            ...options,
            convert_from_text__file_name: should_be_text__file_name,
            text_is_TW: check_language === "TW",
            convert_options: {
                ...regenerate_converted.default_convert_options,
                cache_directory: CeL.append_path_separator(base_cache_directory + should_be_text__file_name)
            }
        }).then(setup_generate_condition_for.bind(this));
    } else {
        return setup_generate_condition_for.call(this);
    }
    function setup_generate_condition_for() {
        const source_texts = get_paragraphs_of_file(source_text__file_path);
        if (!source_texts) return;
        if (should_be_texts.length !== source_texts.length) {
            CeL.error(`${should_be_text__file_name} 與 ${should_be_text__file_path} 含有不同數量之字串！此${CeL.gettext.get_alias(check_language)}之標的檔與欲測試之項目數不符，將不採用解答！若檔案為自動生成，您可以刪除舊檔後，重新生成轉換標的檔案。`);
            return;
        }
        const generate_condition_for = this.generate_condition_for_language[check_language] || (this.generate_condition_for_language[check_language] = new Map);
        const generate_condition_for__title = `${options?.export?.work_title ? `《${options.export.work_title}》` : "通用 "}${CeL.gettext.get_alias(check_language === "TW" ? "CN" : "TW")}→${CeL.gettext.get_alias(check_language)}`;
        should_be_texts.forEach((should_convert_to_text, index) => {
            const configuration = should_be_texts.configurations[should_convert_to_text];
            let text = source_texts[index];
            if (false && configuration) {
                console.trace([ text, should_convert_to_text, configuration ]);
            }
            if (configuration?.原文) {
                if (configuration.原文 === text) {
                    CeL.info(`${setup_generate_condition_for.name}: 轉換前後文字相同，無需設定"原文" ${JSON.stringify(text)}: ${JSON.stringify(configuration)}`);
                } else {
                    configuration.original_text_converted = text;
                    text = configuration.原文;
                }
            }
            if (generate_condition_for.has(text)) {
                CeL.log(`${setup_generate_condition_for.name}: ${generate_condition_for__title}: 重複設定 ${JSON.stringify(text)}。先前於這個檔案設定: ${generate_condition_for.get(text).source_text__file_path}`);
            }
            generate_condition_for.set(text, {
                should_convert_to_text: should_convert_to_text,
                source_text__file_path: source_text__file_path,
                ...options?.export,
                ...configuration
            });
        });
        const totle_count = generate_condition_for.size;
        CeL.info(`${load_text_to_check.name}: 自動檢核 ${should_be_texts.length}個${generate_condition_for__title} 之字串。${totle_count === should_be_texts.length ? "" : `總共檢核 ${totle_count}個。`} From ${should_be_text__file_path}`);
        return this.generate_condition_for_language;
    }
}

function load_default_text_to_check() {
    this.text_to_check_files.forEach(from_file_name => this.load_text_to_check(from_file_name, {
        is_default: true
    }));
}

function report_text_to_check(options) {
    if (!this.generate_condition_for_language) return;
    const SGR_style = CeL.interact.console.SGR_style;
    const normal_style = new SGR_style("fg=green;bg=black").toString(), NG_style = new SGR_style("fg=red;bg=white").toString(), reset_style = new SGR_style({
        reset: true
    }).toString();
    const generate_condition_for = this.generate_condition_for_language[options.convert_to_language];
    const lost_texts = [], multi_matched = Object.create(null);
    let OK_count = 0, NG_count = 0;
    for (const [convert_from, convert_data] of generate_condition_for.entries()) {
        if (!convert_data.work_title) {
            continue;
        }
        const {check_result: check_result} = convert_data;
        if (!check_result) {
            lost_texts.push(convert_data.should_convert_to_text);
            continue;
        }
        if (check_result.NG.length > 0 || check_result.OK.length > 1) {
            multi_matched[convert_from] = check_result.OK.length;
            if (check_result.NG.length > 0) multi_matched[convert_from] += ` + ${NG_style}${check_result.NG.length} NG${normal_style}`;
        }
        if (check_result.NG.length > 0) NG_count++; else OK_count++;
    }
    const message = `${report_text_to_check.name}: ${OK_count} OK, ${NG_count} NG.${lost_texts.length > 0 ? ` ${lost_texts.length} lost:\n\t${lost_texts.join("\n\t")}` : ""}`;
    if (NG_count > 0) {
        CeL.error(message);
    } else {
        CeL.log(message);
    }
    const multi_matched_keys = Object.keys(multi_matched);
    if (multi_matched_keys.length > 0) {
        CeL.log({
            T: "多次匹配的計數："
        });
        CeL.log(`${normal_style}${multi_matched_keys.map(convert_from => `\t${convert_from}: \t${multi_matched[convert_from]}`).join("\n")}${reset_style}`);
    }
    return {
        lost_texts: lost_texts,
        OK_count: OK_count,
        NG_count: NG_count
    };
}

const condition_delimiter = "+";

const PATTERN_condition = /^(?<is_target>~)?(?<not_match>!)?(?:(?<tag>[^:+<>?\\\/]+):)?(?<word>.*?)(?<is_optional>\?)?$/;

const PATTERN_do_after_converting = new RegExp("^(?<word>.*?)~(?<do_after_converting>" + CeL.PATTERN_RegExp_replacement.source.slice(1, -1) + ")?$");

function stringify_condition(condition_text) {
    return JSON.stringify(condition_text).slice(1, -1).replace(/\\"/g, '"');
}

function word_data_to_condition(word_data, options) {
    const tag = word_data[this.KEY_PoS_tag];
    return (tag ? tag + ":" : "") + (options?.including_prefix_spaces && word_data[KEY_prefix_spaces] ? stringify_condition(word_data[KEY_prefix_spaces]) : "") + (typeof word_data[this.KEY_word] === "string" && stringify_condition(word_data[this.KEY_word]) || word_data[this.KEY_word] || "");
}

function parse_condition(full_condition_text, options) {
    let target_index;
    function set_as_target(condition_data) {
        condition_data.is_target = true;
        condition_data.full_condition_text = full_condition_text;
        if (options?.matched_condition) condition_data.matched_condition = options.matched_condition;
    }
    const condition = [];
    const full_condition_splitted = full_condition_text.split(condition_delimiter);
    for (let index = 0, accumulated_target_index_diff = 0; index < full_condition_splitted.length; index++) {
        let token = full_condition_splitted[index];
        let matched = token.match(PATTERN_condition).groups;
        if (/^\//.test(matched.tag) && /\(\?$/.test(matched.tag)) {
            matched.word = matched.tag + ":" + matched.word;
            matched.tag = undefined;
        }
        const PATTERN_word_with_filter = /^(?<word>.*?)<(?<filter_name>[^<>\n*+?]+)>(?<filter_target>.*?)$/;
        {
            function test_if_is_regular(matched_group) {
                let word_to_test = matched_group.word;
                const filter = word_to_test.match(PATTERN_word_with_filter);
                if (filter) {
                    word_to_test = filter.groups.filter_target;
                }
                if (!word_to_test.startsWith("/")) {
                    return true;
                }
                return CeL.PATTERN_RegExp.test(word_to_test) || CeL.PATTERN_RegExp_replacement.test(word_to_test);
            }
            if (!test_if_is_regular(matched)) {
                const full_condition_splitted_expanded = Array.isArray(options.full_condition_splitted) ? full_condition_splitted.concat(options.full_condition_splitted.slice(options.index + 1)) : full_condition_splitted;
                for (let combined_token = token, next_index = index; next_index < full_condition_splitted_expanded.length; ) {
                    const next_token = full_condition_splitted_expanded[++next_index];
                    combined_token += condition_delimiter + next_token;
                    const _matched = combined_token.match(PATTERN_condition).groups;
                    if (test_if_is_regular(_matched)) {
                        token = combined_token;
                        matched = _matched;
                        accumulated_target_index_diff += next_index - index;
                        index = next_index;
                        break;
                    }
                }
                if (index >= full_condition_splitted.length) {
                    options.combined_token_count = index - full_condition_splitted.length + 1;
                }
            }
        }
        const condition_data = Object.create(null);
        if (matched.is_target && !options?.no_target) {
            set_as_target(condition_data);
            if (target_index >= 0) CeL.warn([ parse_condition.name + ": ", {
                T: [ "有多個轉換標的：%1", full_condition_text ]
            } ]); else target_index = index - accumulated_target_index_diff;
        }
        let do_after_converting = matched.word && matched.word.match(PATTERN_do_after_converting);
        if (do_after_converting) {
            do_after_converting = do_after_converting.groups;
            matched.word = do_after_converting.word;
            if (do_after_converting = do_after_converting.do_after_converting?.to_RegExp({
                allow_replacement: true
            })) condition_data.do_after_converting = do_after_converting;
        }
        if (matched.word) {
            let filter = matched.word.match(PATTERN_word_with_filter);
            if (filter) {
                if (!this.condition_filter) throw new Error("No .condition_filter set but set filter: " + matched.word);
                filter = filter.groups;
                const _options = {
                    no_target: true,
                    full_condition_splitted: full_condition_splitted,
                    index: index
                };
                Object.assign(condition_data, {
                    [this.KEY_word]: filter.word,
                    [KEY_filter_name]: filter.filter_name,
                    filter_target: parse_condition.call(this, filter.filter_target, _options)
                });
                if (_options.combined_token_count > 0) {
                    token = full_condition_splitted.slice(index, index + _options.combined_token_count + 1).join(condition_delimiter);
                    accumulated_target_index_diff += _options.combined_token_count;
                    index += _options.combined_token_count;
                }
            } else {
                condition_data[this.KEY_word] = CeL.PATTERN_RegExp.test(matched.word) || CeL.PATTERN_RegExp_replacement.test(matched.word) ? matched.word.to_RegExp({
                    allow_replacement: true
                }) : matched.word.replace(/\\\w/g, char => JSON.parse(`"${char}"`));
            }
        }
        condition_data.condition_text = token;
        if (matched.not_match) {
            condition_data.not_match = !!matched.not_match;
        }
        if (matched.tag) condition_data[this.KEY_PoS_tag] = matched.tag;
        if (matched.is_optional) condition_data.is_optional = true;
        condition.push(condition_data);
    }
    if (!(target_index >= 0) && !options?.no_target) {
        set_as_target(condition[0]);
    }
    if (condition.length === 1) {
        return condition[0];
    }
    if (!options?.no_target) {
        condition.target_index = target_index || 0;
    }
    return condition;
}

const KEY_matched_condition = "matched condition";

function print_correction_condition(correction_condition, {work_title: work_title, original_sentence_word_list: original_sentence_word_list, tagged_convert_from_text: tagged_convert_from_text, zh_conversion_converted_pairs: zh_conversion_converted_pairs}) {
    const to_word_data = correction_condition.parsed[KEY_matched_condition];
    let matched_condition_mark;
    if (to_word_data) {
        matched_condition_mark = ` 匹配的條件式: ${to_word_data.matched_condition ? `${to_word_data.matched_condition} → ` : ""}${to_word_data.full_condition_text}`;
        CeL.warn(`Matched condition${matched_condition_mark}`);
    }
    CeL.info(`Candidate correction for ${JSON.stringify(correction_condition.parsed.text)}→${JSON.stringify(correction_condition.target)} (錯誤轉換為 ${JSON.stringify(correction_condition.error_converted_to)}):`);
    if (tagged_convert_from_text) {
        const list = correction_condition.slice(1).filter(correction => !correction.includes("<←"));
        list.push(tagged_convert_from_text.join(condition_delimiter));
        let zh_conversion_converted;
        if (Array.isArray(zh_conversion_converted_pairs) && zh_conversion_converted_pairs.length > 0) {
            const condition_text = correction_condition.parsed.text;
            const pattern = new RegExp(`[${CeL.to_RegExp_pattern(condition_text).replace(/([-])/g, "\\$1")}]`);
            zh_conversion_converted = zh_conversion_converted_pairs.filter(pair_text => pattern.test(pair_text.replace(/→.*$/, "")));
            zh_conversion_converted = zh_conversion_converted.length > 0 ? " 單純 zh_conversion 轉換過程: " + zh_conversion_converted.unique().join(" ") : null;
        }
        CeL.info(`//${matched_condition_mark ? " 解析錯誤 @" : ""}${work_title ? ` 《${work_title}》` : ""}\t${stringify_condition(original_sentence_word_list)} (${list.join(" ")})${matched_condition_mark || ""}${zh_conversion_converted || ""}`);
    }
    CeL.info(correction_condition.join("\t"));
}

function print_section_report(configuration, options) {
    const {tagged_word_list: tagged_word_list, condition_list: condition_list, convert_from_text: convert_from_text, convert_to_text: convert_to_text, should_convert_to_text: should_convert_to_text, show_tagged_word_list: show_tagged_word_list, start_index: start_index, end_index: end_index, distance_token_header_to_metched: distance_token_header_to_metched} = configuration;
    const {index_hash: index_hash} = condition_list;
    const SGR_style = CeL.interact.console.SGR_style;
    const normal_style_tagged = new SGR_style("fg=blue;bg=cyan").toString(), marked_style_row = "fg=red;bg=white", marked_style = new SGR_style(marked_style_row).toString(), reset_style = new SGR_style({
        reset: true
    }).toString();
    const normal_style_convert_from_text_row = "fg=green;bg=black";
    const ansi_convert_from_text = new CeL.interact.console.SGR(convert_from_text);
    let backward = 0, forward = 0;
    const is_fragment = start_index >= 0 && should_convert_to_text.chars().length <= 4;
    if (is_fragment) {
        let index = start_index;
        while (index > 0) {
            const word_data = tagged_word_list[--index];
            if (word_data[this.KEY_PoS_tag] === this.TAG_punctuation) {
                if (index < start_index && /[、，；：。？！…]$/.test(word_data[this.KEY_word])) index++;
                break;
            }
        }
        backward = start_index - index;
        index = end_index;
        while (index < tagged_word_list.length) {
            const word_data = tagged_word_list[index++];
            if (word_data[this.KEY_PoS_tag] === this.TAG_punctuation) {
                break;
            }
        }
        forward = index - end_index;
    }
    const tagged_word_list_pieces = start_index >= 0 ? tagged_word_list.slice(start_index - backward, end_index + forward) : tagged_word_list;
    let offset = convert_from_text.match(/^\s*/)[0].length, original_sentence_word_list = [];
    const tagged_convert_from_text = [];
    const matched_conditions = [];
    CeL.log(`${normal_style_tagged}${CeL.gettext.get_alias(options.convert_to_language === "TW" ? "CN" : "TW").slice(0, 1)}\t${tagged_word_list_pieces.map((word_data, index) => {
        const prefix_spaces = index > 0 && word_data[KEY_prefix_spaces] || "";
        const text = stringify_condition(prefix_spaces) + word_data_to_condition.call(this, word_data);
        tagged_convert_from_text.push(text);
        original_sentence_word_list.push(prefix_spaces + word_data[this.KEY_word]);
        const matched_condition_data = word_data[KEY_matched_condition];
        if (matched_condition_data) {
            matched_conditions.push(matched_condition_data.matched_condition + " → " + matched_condition_data.full_condition_text);
        }
        if (backward && (index -= backward) < 0) {
            return text;
        }
        if (prefix_spaces) offset += prefix_spaces.length;
        const start_offset = offset;
        offset += word_data[this.KEY_word].length;
        if (index === 0) {
            if (distance_token_header_to_metched) {
                offset -= distance_token_header_to_metched - (word_data[KEY_prefix_spaces] || "").length;
            }
        }
        if (!index_hash[start_index >= 0 ? start_index + index : index]) {
            return text;
        }
        if (ansi_convert_from_text.style_at(start_offset, true)) {
            ansi_convert_from_text.style_at(start_offset, null);
        } else {
            ansi_convert_from_text.style_at(start_offset, marked_style_row);
        }
        ansi_convert_from_text.style_at(offset, normal_style_convert_from_text_row);
        return marked_style + text + normal_style_tagged;
    }).join(condition_delimiter)}${reset_style}`);
    original_sentence_word_list = original_sentence_word_list.join("");
    if (is_fragment) {
        CeL.log(`\t原文⇒${reset_style}${JSON.stringify(original_sentence_word_list)}`);
    }
    CeL.log(`${new SGR_style(normal_style_convert_from_text_row).toString()}原文:\t ${ansi_convert_from_text.toString().replace(/\r/g, "\\r").replace(/\n/g, "\\n")}${reset_style}`);
    CeL.coloring_diff(JSON.stringify(convert_to_text), JSON.stringify(should_convert_to_text), {
        headers: [ `→ ${CeL.gettext.get_alias(options.convert_to_language).slice(0, 1)}\t`, ` ${options.message_should_be || "應為"}\t` ],
        header_style: {
            fg: "cyan"
        },
        print: true
    });
    let {work_title: work_title} = options;
    if (!work_title && (work_title = configuration.test_title)) {
        work_title = work_title.match(PATTERN_watch_target_file_name);
        if (work_title) work_title = work_title.groups.work_title;
    }
    const zh_conversion_converted_pairs = [];
    zh_conversion_converted_pairs.result = (options.convert_to_language === "TW" ? CeL_CN_to_TW : CeL_TW_to_CN)(convert_from_text, {
        ...options,
        show_matched(convert_from_text, convert_to_text) {
            zh_conversion_converted_pairs.push(convert_from_text + "→" + convert_to_text);
            return false;
        }
    });
    condition_list.forEach(condition => print_correction_condition(condition, {
        work_title: work_title,
        original_sentence_word_list: original_sentence_word_list,
        tagged_convert_from_text: tagged_convert_from_text,
        zh_conversion_converted_pairs: zh_conversion_converted_pairs
    }));
    if (matched_conditions.length > 0) {
        matched_conditions.unshift("匹配的條件式:");
        CeL.log(matched_conditions.join("\n\t"));
    }
    if (!is_fragment) {
        CeL.log(`單純 zh_conversion 轉換過程:`);
        zh_conversion_converted_pairs.forEach(pair_text => CeL.info(pair_text));
        CeL.log("單純 zh_conversion 轉換:\t" + zh_conversion_converted_pairs.result);
    }
    if (show_tagged_word_list) {
        CeL.debug(beautify_tagged_word_list(tagged_word_list_pieces), 1);
    }
}

const skip_tests_convert_to_different_length = true;

function check_convert_to_different_length(converted_text_String, should_be_text, no_warning, is_convert_from) {
    if (converted_text_String.chars().length === should_be_text?.chars().length) {
        return;
    }
    if (no_warning) {
    } else if (skip_tests_convert_to_different_length) {
        CeL.warn(`${check_convert_to_different_length.name}: 預設解答與轉換後之文字長度不符！`);
    } else {
        CeL.error(`${check_convert_to_different_length.name}: 預設解答與轉換後之文字長度不符，跳過此項！`);
    }
    CeL.coloring_diff(converted_text_String, should_be_text, {
        headers: [ (is_convert_from ? "轉換前:" : "轉換後:") + "\t", `解答:\t` ],
        header_style: {
            fg: "yellow"
        },
        print: true
    });
    return !skip_tests_convert_to_different_length;
}

const KEY_tag_filter = Symbol("tag filter"), KEY_tag_pattern_filter = Symbol("tag pattern filter"), KEY_general_pattern_filter = Symbol("general pattern filter"), KEY_pattern = "pattern";

function get_convert_to_conditions(options) {
    const {word_data: word_data, conversion_pairs: conversion_pairs} = options === null ? Object.create(null) : options;
    let conversion_set, key = word_data[this.KEY_word], pattern;
    const KEY_PoS_tag = this.KEY_PoS_tag;
    function set_tag_conversion(KEY) {
        conversion_set = conversion_pairs.get(KEY);
        if (!conversion_set[word_data[KEY_PoS_tag]]) {
            if (!options?.create) return;
            conversion_set[word_data[KEY_PoS_tag]] = new Map;
        }
        return conversion_set = conversion_set[word_data[KEY_PoS_tag]];
    }
    if (CeL.is_RegExp(key) || options?.search_pattern) {
        if (options?.try_tag && word_data[KEY_PoS_tag]) {
            if (!set_tag_conversion(KEY_tag_pattern_filter)) return;
        } else {
            conversion_set = conversion_pairs.get(KEY_general_pattern_filter);
        }
        if (CeL.is_RegExp(key)) {
            pattern = key;
            key = key.toString().replace(/(\w)+$/, flags => flags.replace(/[g]/, ""));
        } else {
            const all_matched_conditions = [];
            for (const convert_to_conditions of conversion_set.values()) {
                if (convert_to_conditions[KEY_pattern].test(key)) {
                    if (!options.get_all_matched_conditions) return convert_to_conditions;
                    all_matched_conditions.push(convert_to_conditions);
                }
            }
            if (all_matched_conditions.length > 0) {
                if (all_matched_conditions.length > 1) {}
                return all_matched_conditions;
            }
        }
    } else {
        if (options?.try_tag && word_data[KEY_PoS_tag]) {
            if (!set_tag_conversion(KEY_tag_filter)) return;
        } else {
            conversion_set = conversion_pairs;
        }
    }
    if (!conversion_set.has(key)) {
        if (!options?.create) return;
        const convert_to_conditions = [];
        if (pattern) convert_to_conditions[KEY_pattern] = pattern;
        conversion_set.set(key, convert_to_conditions);
    }
    const convert_to_conditions = conversion_set.get(key);
    return options.get_all_matched_conditions ? [ convert_to_conditions ] : convert_to_conditions;
}

const KEY_postfix = Symbol("postfix");

function load_dictionary(file_path, options) {
    if (this.dictionary_file_path_loaded_Set.has(file_path)) {
        return;
    }
    this.dictionary_file_path_loaded_Set.add(file_path);
    const word_list = get_paragraphs_of_file(file_path);
    if (!word_list) {
        return;
    }
    let conversion_pairs_set;
    if (options.tailored_key) {
        if (!this.tailored_conversion_pairs[options.tailored_key]) this.tailored_conversion_pairs[options.tailored_key] = Object.create(null);
        conversion_pairs_set = this.tailored_conversion_pairs[options.tailored_key];
    } else {
        conversion_pairs_set = this.conversion_pairs;
    }
    if (!conversion_pairs_set[options.convert_to_language]) {
        const conversion_pairs = conversion_pairs_set[options.convert_to_language] = new Map;
        conversion_pairs.set(KEY_tag_filter, Object.create(null));
        conversion_pairs.set(KEY_tag_pattern_filter, Object.create(null));
        conversion_pairs.set(KEY_general_pattern_filter, new Map);
        conversion_pairs.set(KEY_postfix, []);
    }
    const conversion_pairs = conversion_pairs_set[options.convert_to_language];
    for (let conditions of word_list) {
        conditions = conditions.split("\t");
        const matched_condition = conditions[0].trim();
        if (conditions.length < 2 || !matched_condition) {
            CeL.error(`${load_dictionary.name}: 未設定轉換條件: ${conditions.join("\t")}`);
            continue;
        }
        const filter = parse_condition.call(this, matched_condition);
        if (filter.filter_name === "postfix") {} else if (!filter[this.KEY_word] && !filter[this.KEY_PoS_tag]) {
            CeL.error(`Invalid word filter: ${matched_condition}`);
            continue;
        }
        if (filter.not_match) throw new Error("NYI: not_match");
        const convert_to_conditions = filter.filter_name === "postfix" ? conversion_pairs.get(KEY_postfix) : get_convert_to_conditions.call(this, {
            word_data: filter,
            conversion_pairs: conversion_pairs,
            create: true,
            try_tag: true
        });
        for (let index = 1; index < conditions.length; index++) {
            let condition = conditions[index];
            if (!condition.trim()) {
                CeL.error(`${load_dictionary.name}: Empty condition[${index}] in ${JSON.stringify(conditions)}`);
                continue;
            }
            condition = parse_condition.call(this, condition, {
                matched_condition: matched_condition
            });
            if (condition.do_after_converting || convert_to_conditions.length === 0 || !convert_to_conditions[convert_to_conditions.length - 1].do_after_converting) {
                if (false && options.priority < 0) {
                    convert_to_conditions.unshift(condition);
                } else if (options.priority >= 0) {
                    const priority_to_set = Math.floor(options.priority);
                    if (!convert_to_conditions.priority_index) convert_to_conditions.priority_index = [];
                    if (!(convert_to_conditions.priority_index[priority_to_set] >= 0)) {
                        for (let priority = 0; priority < priority_to_set; priority++) {
                            if (!(convert_to_conditions.priority_index[priority] >= 0)) convert_to_conditions.priority_index[priority] = convert_to_conditions.priority_index[priority - 1] || 0;
                        }
                        convert_to_conditions.priority_index[priority_to_set] = convert_to_conditions.priority_index[priority_to_set - 1] || 0;
                    }
                    convert_to_conditions.splice(convert_to_conditions.priority_index[priority_to_set]++, 0, condition);
                } else {
                    convert_to_conditions.push(condition);
                }
            } else {
                let index = convert_to_conditions.length - 1;
                while (index > 0 && convert_to_conditions[index - 1].do_after_converting) index--;
                convert_to_conditions.splice(index, 0, condition);
            }
        }
    }
}

const KEY_synonym_pattern = Symbol("synonym pattern");

function load_synonym_dictionary() {
    if (!this.synonyms_of_language) this.synonyms_of_language = Object.create(null);
    const file_paths = Object.create(null);
    for (const language in dictionary_template) {
        if (!this.synonyms_of_language[language]) {
            this.synonyms_of_language[language] = new Map;
            this.synonyms_of_language[language][KEY_synonym_pattern] = [];
        }
        const synonyms_Map = this.synonyms_of_language[language];
        let synonym_data = CeL.read_file(this.dictionaries_directory + `synonym.${language}.txt`);
        if (!synonym_data) continue;
        synonym_data = CeL.data.Convert_Pairs.remove_comments(synonym_data.toString().replace(/\r/g, ""));
        synonym_data.split("\n").forEach(line => {
            if (!line) return;
            const synonyms = line.split("\t");
            const 正字正詞 = synonyms.shift();
            if (synonyms.length === 0) {
                if (CeL.PATTERN_RegExp_replacement.test(正字正詞)) {
                    synonyms_Map[KEY_synonym_pattern].push(正字正詞.to_RegExp({
                        allow_replacement: true
                    }));
                } else {
                    CeL.error([ load_synonym_dictionary.name + ": ", {
                        T: [ "未設定任何同義詞：%1", 正字正詞 ]
                    } ]);
                }
                return;
            }
            const allowed_synonyms = 正字正詞 ? [ 正字正詞 ] : synonyms;
            synonyms.forEach(synonym => {
                if (!synonym) return;
                if (synonyms_Map.has(synonym)) CeL.error(`${load_synonym_dictionary.name}: 重複設定: ${JSON.stringify(synonym)}`);
                synonyms_Map.set(synonym, allowed_synonyms);
            });
        });
    }
}

function condition_filter_LTP(single_condition, word_data, options) {
    if (single_condition.filter_name in this.filters[options.convert_to_language]) return true;
    const {tagged_word_list: tagged_word_list} = options;
    const tagged_word_list_index_offset = (options.word_data__index_of_target >= 0 ? options.word_data__index_of_target : options.index_of_tagged_word_list) - word_data.id;
    if (single_condition.filter_name === word_data.relation) {
        return match_single_condition.call(this, single_condition.filter_target, tagged_word_list[tagged_word_list_index_offset + word_data.parent], options);
    }
    let matched;
    matched = single_condition.filter_name.match(/^←(.+)$/);
    if (matched) {
        matched = matched[1];
        for (let index = tagged_word_list_index_offset, latest_id = -1; index < tagged_word_list.length; index++) {
            const word_data_to_test = tagged_word_list[index];
            if (latest_id >= word_data_to_test.id) {
                return;
            }
            latest_id = word_data_to_test.id;
            if (word_data_to_test.parent === word_data.id && word_data_to_test.relation === matched && match_single_condition.call(this, single_condition.filter_target, word_data_to_test, options)) {
                return true;
            }
        }
    }
    matched = single_condition.filter_name.match(/(?<property_name>(?:role|parent))(?:\.(?<sub_property_name>[^:]+):(?<sub_property_value>.+))?/);
    if (matched) {
        matched = matched.groups;
        const filter_target = single_condition.filter_target;
        return word_data[matched.property_name + "s"].some(token => {
            const parent_index = tagged_word_list_index_offset + token.parent;
            if (parent_index in tagged_word_list) {
                Object.assign(token, tagged_word_list[parent_index]);
            }
            return (!matched.sub_property_name || token[matched.sub_property_name] === matched.sub_property_value) && match_single_condition.call(this, filter_target, token, options);
        });
    }
}

function match_single_condition(single_condition, word_data, options) {
    if (single_condition[KEY_filter_name]) {
        return this.condition_filter && this.condition_filter(single_condition, word_data, options);
    }
    let filter;
    filter = single_condition[this.KEY_PoS_tag];
    if (filter && !CeL.fit_filter(filter, word_data[this.KEY_PoS_tag])) {
        return single_condition.not_match;
    }
    filter = single_condition[this.KEY_word];
    if (!filter || single_condition.is_target && !CeL.is_RegExp(filter)) {
        return !single_condition.not_match;
    }
    return single_condition.not_match ^ CeL.fit_filter(filter, word_data[this.KEY_word]);
}

function match_condition(options) {
    const {conditions: conditions, word_data: word_data, tagged_word_list: tagged_word_list} = options;
    if (!Array.isArray(conditions)) return match_single_condition.call(this, conditions, word_data, options) && conditions;
    const target_index = conditions.target_index || 0;
    if (!match_single_condition.call(this, conditions[target_index], word_data, options)) return;
    for (let index_of_condition = target_index + 1, index_of_target = options.index_of_tagged_word_list + 1; index_of_condition < conditions.length; index_of_condition++) {
        if (index_of_target >= tagged_word_list.length) return;
        const condition = conditions[index_of_condition];
        if (match_single_condition.call(this, condition, tagged_word_list[index_of_target], {
            ...options,
            word_data__index_of_target: index_of_target
        })) {
            index_of_target++;
        } else {
            if (!condition.is_optional) return;
        }
    }
    for (let index_of_condition = target_index - 1, index_of_target = options.index_of_tagged_word_list - 1; index_of_condition >= 0; index_of_condition--) {
        if (index_of_target < 0) return;
        const condition = conditions[index_of_condition];
        if (match_single_condition.call(this, condition, tagged_word_list[index_of_target], {
            ...options,
            word_data__index_of_target: index_of_target
        })) {
            index_of_target--;
        } else {
            if (!condition.is_optional) return;
        }
    }
    return conditions[target_index];
}

function get_matched_condition(options) {
    let all_convert_to_conditions = get_convert_to_conditions.call(this, {
        ...options,
        get_all_matched_conditions: true
    });
    if (!all_convert_to_conditions) {
        return;
    }
    const all_matched_conditions = [];
    all_convert_to_conditions.forEach(convert_to_conditions => {
        for (let index_of_conditions = 0; index_of_conditions < convert_to_conditions.length; index_of_conditions++) {
            const conditions = convert_to_conditions[index_of_conditions];
            const matched_condition = match_condition.call(this, {
                ...options,
                conditions: conditions
            });
            if (matched_condition) {
                all_matched_conditions.push(matched_condition);
                if (!convert_to_conditions.pattern) {
                    return;
                }
            }
        }
    });
    if (all_matched_conditions.length > 0) {
        return {
            all_matched_conditions: all_matched_conditions,
            all_convert_to_conditions: all_convert_to_conditions
        };
    }
    return {
        all_convert_to_conditions: all_convert_to_conditions
    };
}

const get_all_possible_matched_condition_options = [ {
    try_tag: true
}, , {
    try_tag: true,
    search_pattern: true
}, {
    search_pattern: true
} ];

function get_all_possible_matched_condition(options) {
    let best_matched_data;
    for (const _options of get_all_possible_matched_condition_options) {
        const matched_data = get_matched_condition.call(this, {
            ...options,
            ..._options
        });
        if (matched_data) {
            if (matched_data.all_matched_conditions) return matched_data;
            best_matched_data = best_matched_data || matched_data;
        }
    }
    return best_matched_data;
}

const web_request_queues = new Map;

function add_new_web_request(host, promise) {
    if (typeof promise === "function") {
        const request = promise;
        promise = (web_request_queues.get(host) || Promise.resolve()).catch(() => null).then(request);
        web_request_queues.set(host, promise);
        promise.finally(() => {
            if (web_request_queues.get(host) === promise) web_request_queues.delete(host);
        }).catch(() => null);
        return promise;
    }
    if (web_request_queues.has(host)) {
        const _promise = promise;
        promise = web_request_queues.get(host).catch(() => null).then(() => _promise);
    }
    web_request_queues.set(host, promise);
    return promise;
}

function tag_paragraph_jieba(paragraph, options) {
    return this.nodejieba_CN.tag(paragraph);
}

const KEY_prefix_spaces = "prefix spaces";

function recover_spaces(parsed, paragraph) {
    const KEY_word = this.KEY_word;
    let offset = 0;
    for (let parsed_index = 0; parsed_index < parsed.length; parsed_index++) {
        const word_data = parsed[parsed_index];
        const word = word_data[KEY_word];
        const index = paragraph.indexOf(word, offset);
        if (index === offset) {
            offset += word.length;
            continue;
        }
        if (index > offset) {
            word_data[KEY_prefix_spaces] = paragraph.slice(offset, index);
            offset = index + word.length;
            continue;
        }
        console.log(parsed);
        console.log([ parsed_index, word_data ]);
        throw new Error(`Not found: ${JSON.stringify(word)} in ${JSON.stringify(paragraph)}`);
    }
    if (offset < paragraph.length) {
        const tail = paragraph.slice(offset).match(/^(\s*)([\s\S]*?)$/);
        const word_data = {
            [KEY_prefix_spaces]: tail[1],
            [KEY_word]: tail[2]
        };
        parsed.push(word_data);
    }
}

function generate_condition_LTP(configuration, options) {
    const synonyms_Map = options.skip_check_for_synonyms && this.synonyms_of_language[options.convert_to_language];
    const synonym_pattern_list = synonyms_Map && synonyms_Map[KEY_synonym_pattern];
    const {tagged_word_list: tagged_word_list, converted_text: converted_text, should_be_text: should_be_text} = configuration;
    const start_index = configuration.start_index >= 0 ? configuration.start_index : 0;
    const end_index = isNaN(configuration.end_index) ? tagged_word_list.length : Math.min(tagged_word_list.length, configuration.end_index);
    const tagged_word_list_index_offset = start_index - tagged_word_list[start_index].id;
    const diff_list = CeL.LCS(converted_text.slice(start_index, end_index).join(""), should_be_text, {
        diff: true,
        try_to_merge_diff: true
    });
    const condition_list = [], index_hash = Object.create(null);
    condition_list.index_hash = index_hash;
    for (let index = start_index, index_of_converted_to_slice = 0; index < end_index; index++) {
        const word_data = tagged_word_list[index];
        const converted_to = converted_text[index];
        const should_be_slice = (should_be_text || "").slice(CeL.LCS.corresponding_index(diff_list, index_of_converted_to_slice), CeL.LCS.corresponding_index(diff_list, index_of_converted_to_slice += converted_to.length));
        if (false) {
            console.trace([ [ index_of_converted_to_slice, index_of_converted_to_slice + converted_to.length, converted_to ], [ CeL.LCS.corresponding_index(diff_list, index_of_converted_to_slice - converted_to.length), CeL.LCS.corresponding_index(diff_list, index_of_converted_to_slice), should_be_slice ] ]);
        }
        if (should_be_slice === converted_to) {
            continue;
        }
        const target = should_be_slice.trim();
        if (synonyms_Map) {
            if (synonyms_Map.has(target) && synonyms_Map.get(target).includes(converted_to.trimStart())) {
                continue;
            }
            if (synonym_pattern_list.some(synonym_pattern => synonym_pattern.test(target) && synonym_pattern.replace(target) === converted_to.trimStart())) {
                continue;
            }
        }
        const condition = [ word_data_to_condition.call(this, word_data) ];
        const base_condition = "~" + stringify_condition(target);
        word_data.condition = condition;
        if (word_data.parent >= 0) {
            condition.push(`${base_condition}<${word_data.relation}>${word_data_to_condition.call(this, tagged_word_list[tagged_word_list_index_offset + word_data.parent])}`);
        }
        word_data.roles.forEach(role => condition.push(`${base_condition}<role.type:${role.type}>${word_data_to_condition.call(this, role)}`));
        word_data.parents.forEach(parent => {
            const parent_condition = word_data_to_condition.call(this, parent);
            if (parent_condition) {
                condition.push(`${base_condition}<parent.relate:${parent.relate}>${parent_condition}`);
            } else {}
        });
        for (let _index = tagged_word_list_index_offset, latest_id = -1; _index < tagged_word_list.length; _index++) {
            const word_data_to_test = tagged_word_list[_index];
            if (latest_id >= word_data_to_test.id) {
                break;
            }
            latest_id = word_data_to_test.id;
            if (word_data_to_test.parent === word_data.id) {
                condition.push(`${base_condition}<←${word_data_to_test.relation}>${word_data_to_condition.call(this, word_data_to_test)}`);
            }
        }
        if (condition.length === 1) {
            condition.push(base_condition);
        }
        Object.assign(condition, {
            parsed: word_data,
            target: target,
            error_converted_to: converted_to
        });
        condition_list.push(condition);
        index_hash[index] = condition;
    }
    return condition_list;
}

function recover_original_paragraphs(parsed, {token_count_array: token_count_array}) {
    if (!token_count_array) return parsed;
    return token_count_array.map((length, index) => {
        let parsed_index = index === 0 ? 0 : token_count_array[index - 1];
        const result_token = parsed[parsed_index];
        while (++parsed_index < length) {
            result_token.append(parsed[parsed_index]);
        }
        return result_token;
    });
}

function parse_LTP_result(parsed, options) {
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    if (!Array.isArray(parsed) || parsed.length !== options.paragraphs_before_convert.length) throw new Error("LTP returned an unexpected number of paragraphs");
    let result = parsed.map((parsed_paragraph, index) => {
        const words = parsed_paragraph.words;
        if (!Array.isArray(words)) throw new Error("LTP response has no words array");
        if (!options.ignore_spaces && (!words.length || words[words.length - 1].offset + words[words.length - 1].length !== options.paragraphs_before_convert[index].length)) {
            recover_spaces.call(this, words, options.paragraphs_before_convert[index]);
        }
        return words;
    });
    result = recover_original_paragraphs(result, options);
    if (!options.is_Array) {
        return result[0];
    }
    return result;
}

async function get_LTP_data(options) {
    const parsed_array = [];
    const missing = [];
    options.paragraphs_before_convert.forEach((paragraph, index) => {
        const cached = options.cached_tagged_word_list_Map?.get(paragraph);
        if (cached) parsed_array[index] = {
            words: cached
        }; else if (PATTERN_non_Chinese_characters.test(paragraph)) parsed_array[index] = {
            words: []
        }; else missing.push({
            paragraph: paragraph,
            index: index
        });
    });
    const batch_size = this.LTP_batch_size || 1;
    for (let start = 0; start < missing.length; start += batch_size) {
        const batch = missing.slice(start, start + batch_size);
        const result = await add_new_web_request(this.LTP_URL, () => new Promise((resolve, reject) => {
            CeL.get_URL(this.LTP_URL, (XMLHttp, error) => {
                if (error) return reject(error);
                try {
                    const response = JSON.parse(XMLHttp.responseText);
                    if (response.error) throw new Error(response.error);
                    const data = batch_size > 1 ? response : [ response ];
                    if (!Array.isArray(data) || data.length !== batch.length) throw new Error("LTP returned an unexpected batch response");
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            }, null, {
                text: batch_size > 1 ? batch.map(item => item.paragraph) : batch[0].paragraph
            }, {
                timeout: 60 * 60 * 1e3,
                error_retry: 0,
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                }
            });
        }));
        batch.forEach((item, index) => {
            parsed_array[item.index] = result[index];
        });
    }
    return parse_LTP_result.call(this, parsed_array, options);
}

const LTP_paragraph_MAX_LENGTH = 500;

function preserve_tail(tail) {
    return tail.match(/^(?:["'’”」』：\s]|<\/\w[^<>]*>)*/)[0];
}

function fill_cached_tagged_word_list_Map(paragraphs, options, cached_tagged_word_list_Map) {
    if (!cached_tagged_word_list_Map) return;
    const cached_tagged_word_list = [];
    if (paragraphs.every((paragraph, index) => {
        const _options = set__options_tagged_word_list__via_cache.call(this, paragraph, options)[0];
        const tagged_word_list = _options.tagged_word_list;
        if (tagged_word_list) {
            cached_tagged_word_list_Map.set(paragraph, tagged_word_list);
            cached_tagged_word_list[index] = tagged_word_list;
            return true;
        }
    })) {
        return options.is_Array ? cached_tagged_word_list : cached_tagged_word_list[0];
    }
}

function tag_paragraph_LTP(paragraphs, options) {
    options = {
        ...options,
        is_Array: Array.isArray(paragraphs)
    };
    if (!options.is_Array) {
        paragraphs = [ paragraphs ];
    }
    const cached_tagged_word_list_Map = new Map;
    let cached_tagged_word_list = fill_cached_tagged_word_list_Map.call(this, paragraphs, options, cached_tagged_word_list_Map);
    if (cached_tagged_word_list) {
        return cached_tagged_word_list;
    }
    if (paragraphs.some(paragraph => paragraph.length > LTP_paragraph_MAX_LENGTH)) {
        const paragraphs_before_convert = [];
        const token_count_array = [];
        paragraphs.forEach(paragraph => {
            while (paragraph.length > LTP_paragraph_MAX_LENGTH) {
                let piece = paragraph.slice(0, LTP_paragraph_MAX_LENGTH);
                let token = piece.replace(/<(?:\w[^<>]*)$/, "");
                if (/\S/.test(token)) {
                    piece = token;
                    token = piece.replace(/[^。？！…]*$/, preserve_tail) || piece.replace(/[^.?!，]*$/, preserve_tail) || piece;
                } else {
                    token = piece;
                }
                if (!/\S/.test(token) && (token === piece || !/\S/.test(token = piece))) {
                    CeL.error(`${tag_paragraph_LTP.name}: 輸入的文字包含大段空白或者過長的 HTML tag！`);
                }
                paragraph = paragraph.slice(token.length);
                const matched = paragraph.match(/^\s+/);
                if (matched) {
                    paragraph = paragraph.slice(matched[0].length);
                    token += matched[0];
                }
                paragraphs_before_convert.push(token);
            }
            if (paragraph) {
                paragraphs_before_convert.push(paragraph);
            }
            token_count_array.push(paragraphs_before_convert.length);
        });
        cached_tagged_word_list = fill_cached_tagged_word_list_Map.call(this, paragraphs_before_convert, options, cached_tagged_word_list_Map);
        if (cached_tagged_word_list) {
            return cached_tagged_word_list;
        }
        Object.assign(options, {
            token_count_array: token_count_array,
            paragraphs_before_convert: paragraphs_before_convert
        });
    } else {
        options.paragraphs_before_convert = paragraphs;
    }
    Object.assign(options, {
        cached_tagged_word_list_Map: cached_tagged_word_list_Map
    });
    if (this.LTP_URL) {
        return get_LTP_data.call(this, options);
    }
    return this.LTP_worker.predict(options.paragraphs_before_convert).then(parsed => parse_LTP_result.call(this, parsed, options));
}

function convert_CoreNLP_result(result) {
    result = JSON.parse(result).sentences;
    const tokens = result[0].tokens;
    delete result[0].tokens;
    tokens.result = result;
    for (let index = 1; index < result.length; index++) {
        tokens.append(result[index].tokens);
        delete result[index].tokens;
    }
    return tokens;
}

function tag_paragraph_via_CoreNLP(paragraph, options) {
    return add_new_web_request(this.CoreNLP_URL, new Promise((resolve, reject) => {
        this.CoreNLP_URL_properties.date = new Date;
        this.CoreNLP_URL.searchParams.set("properties", JSON.stringify(this.CoreNLP_URL_properties));
        this.CoreNLP_URL.searchParams.set("pipelineLanguage", "zh");
        CeL.log_temporary(`${tag_paragraph_via_CoreNLP.name}: Query CoreNLP server for ${paragraph.length} chars text.`);
        CeL.get_URL(this.CoreNLP_URL, (XMLHttp, error) => {
            if (error) {
                reject(error);
            } else {
                resolve(convert_CoreNLP_result(XMLHttp.responseText));
            }
        }, null, paragraph, {
            error_retry: 4
        });
    }));
}

function forced_convert_to_TW(paragraph, index, tagged_word_list, options) {
    return CeL_CN_to_TW(paragraph, options);
}

forced_convert_to_TW.base_function = CeL_CN_to_TW;

function forced_convert_to_CN(paragraph, index, tagged_word_list, options) {
    return CeL_TW_to_CN(paragraph, options);
}

forced_convert_to_CN.base_function = CeL_CN_to_TW;

function beautify_tagged_word_list(tagged_word_list) {
    return JSON.stringify(tagged_word_list).replace(/,{"id":/g, ',\n{"id":');
}

function load_general_word_list_cache_file(cache_file_path, options, rebuild_cache) {
    if (rebuild_cache || !this.general_word_list_cache) this.general_word_list_cache = Object.create(null);
    if (rebuild_cache || !this.general_word_list_cache_files_loaded) this.general_word_list_cache_files_loaded = [];
    if (this.general_word_list_cache_files_loaded.includes(cache_file_path)) return;
    let cache_data = CeL.read_file(cache_file_path);
    if (!cache_data) return;
    CeL.info(`${load_general_word_list_cache_file.name}: ${cache_file_path}`);
    cache_data = JSON.parse(cache_data.toString());
    Object.assign(this.general_word_list_cache, cache_data);
    this.general_word_list_cache_files_loaded.push(cache_file_path);
}

function set__options_tagged_word_list__via_cache(paragraph, options) {
    let {cache_directory: cache_directory} = options;
    if (!cache_directory) {
        return [ options, cache_directory ];
    }
    cache_directory = CeL.append_path_separator(cache_directory);
    if (options.cache_file_for_short_sentences) {
        if (options.cache_file_for_short_sentences === true) options.cache_file_for_short_sentences = "!short_sentences_word_list.json";
        load_general_word_list_cache_file.call(this, cache_directory + options.cache_file_for_short_sentences, options, this.latest_cache_directory !== cache_directory);
    }
    this.latest_cache_directory = cache_directory;
    if (this.general_word_list_cache && this.general_word_list_cache[paragraph]) {
        options = {
            ...options,
            tagged_word_list: Object.clone(this.general_word_list_cache[paragraph], true)
        };
    } else if (!options.tagged_word_list && (!options.min_cache_length || paragraph.length >= options.min_cache_length)) {
        const paragraph_code = paragraph.slice(0, 40);
        options = {
            ...options,
            cache_file_path: cache_directory + CeL.to_file_name(paragraph_code + "." + paragraph.hashCode() + ".json"),
            paragraph_code: paragraph_code
        };
        let cache_data = CeL.read_file(options.cache_file_path);
        if (cache_data) {
            try {
                cache_data = JSON.parse(cache_data.toString());
                options.tagged_word_list = cache_data;
                options.tagged_word_list.is_cache = true;
            } catch (e) {
                CeL.error(`${set__options_tagged_word_list__via_cache.name}: Skip ${options.cache_file_path}: ${e}`);
            }
        }
    }
    return [ options, cache_directory ];
}

function save_cache_file_for_short_sentences(cache_file_path, options) {
    if (options.before_save_cache_file) options.before_save_cache_file(cache_file_path, this.general_word_list_cache, true);
    CeL.write_file(cache_file_path, this.general_word_list_cache);
    delete this.save_cache_file_for_short_sentences;
}

function convert_paragraph(paragraph, options) {
    if (typeof paragraph !== "string" || PATTERN_non_Chinese_characters.test(paragraph)) {
        return paragraph;
    }
    let cache_directory;
    [options, cache_directory] = set__options_tagged_word_list__via_cache.call(this, paragraph, options);
    const tagged_word_list = options.tagged_word_list || this.tag_paragraph(paragraph, options);
    if (CeL.is_thenable(tagged_word_list)) {
        return tagged_word_list.then(tagged_word_list => convert_paragraph.call(this, paragraph, {
            ...options,
            tagged_word_list: tagged_word_list
        }));
    }
    if (cache_directory) {
        if (options.cache_file_path) {
            if (!options.tagged_word_list.is_cache) {
                CeL.create_directory(cache_directory);
                if (options.before_save_cache_file) options.before_save_cache_file(options.cache_file_path, beautify_tagged_word_list(tagged_word_list));
                const error = CeL.write_file(options.cache_file_path, beautify_tagged_word_list(tagged_word_list));
                if (!error) {
                    if (cache_directory.startsWith(regenerate_converted.default_convert_options.cache_directory)) {
                        CeL.remove_files_in_directory(cache_directory, file_name => file_name.startsWith(CeL.to_file_name(options.paragraph_code)) && cache_directory + file_name !== options.cache_file_path);
                    }
                } else if (error.code === "ENOENT" && options.cache_file_for_short_sentences && paragraph.length < 2 * options.min_cache_length) {
                    CeL.error(`有特殊字元，改存到 ${options.cache_file_for_short_sentences}：${JSON.stringify(paragraph)}`);
                    delete options.cache_file_path;
                }
            }
        }
        if (!options.cache_file_path && options.cache_file_for_short_sentences) {
            if (!this.general_word_list_cache[paragraph]) {
                this.general_word_list_cache[paragraph] = Object.clone(tagged_word_list, true);
                const cache_file_path = cache_directory + options.cache_file_for_short_sentences;
                if (options.delay_save_file) {
                    this.save_cache_file_for_short_sentences = save_cache_file_for_short_sentences.bind(this, cache_file_path, options);
                } else {
                    save_cache_file_for_short_sentences.call(this, cache_file_path, options);
                }
            }
        }
    }
    const conversion_pairs = this.conversion_pairs[options.convert_to_language];
    const tailored_conversion_pairs = (() => {
        for (const key of [ "tailored_key", "work_title", "original_work_title" ]) {
            let tailored_key = options[key];
            let tailored_conversion_pairs = tailored_key && this.tailored_conversion_pairs[tailored_key];
            if (tailored_conversion_pairs) return tailored_conversion_pairs[options.convert_to_language];
        }
    })();
    const [forced_convert, max_convert_word_length] = (() => {
        let converter = options.convert_to_language === "TW" ? this.CN_to_TW || forced_convert_to_TW : this.TW_to_CN || forced_convert_to_CN;
        converter("");
        return [ converter.bind(this), converter.base_function.max_convert_word_length || 20 ];
    })();
    const word_convert_mode = options.forced_convert_mode === undefined ? true : options.forced_convert_mode;
    const {check_dictionary: check_dictionary} = options;
    const word_mode_options = options;
    const generate_condition_for = options.generate_condition_for || this.generate_condition_for_language && this.generate_condition_for_language[options.convert_to_language];
    let converted_text = [], waiting_queue = [];
    tagged_word_list.forEach((word_data, index_of_tagged_word_list) => {
        const matched_condition_data = (() => {
            if (tailored_conversion_pairs) {
                const matched_condition_data = get_all_possible_matched_condition.call(this, {
                    ...options,
                    word_data: word_data,
                    conversion_pairs: tailored_conversion_pairs,
                    index_of_tagged_word_list: index_of_tagged_word_list,
                    tagged_word_list: tagged_word_list
                });
                if (matched_condition_data?.all_matched_conditions) {
                    return matched_condition_data;
                }
            }
            return get_all_possible_matched_condition.call(this, {
                ...options,
                word_data: word_data,
                conversion_pairs: conversion_pairs,
                index_of_tagged_word_list: index_of_tagged_word_list,
                tagged_word_list: tagged_word_list
            });
        })();
        const prefix_spaces = word_data[KEY_prefix_spaces];
        if (!matched_condition_data) {
            if (word_convert_mode === "combine") {
                waiting_queue.push(prefix_spaces ? prefix_spaces + word_data[this.KEY_word] : word_data[this.KEY_word]);
                return;
            }
            const processed_word = word_convert_mode ? forced_convert(word_data[this.KEY_word], index_of_tagged_word_list, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
            converted_text.push(prefix_spaces ? prefix_spaces + processed_word : processed_word);
            return;
        }
        if (options.show_all_matched_conditions) {
            console.log(matched_condition_data);
        }
        const {all_matched_conditions: all_matched_conditions} = matched_condition_data;
        if (all_matched_conditions) {
            if (all_matched_conditions.length > 1) {}
            let word = word_data[this.KEY_word], had_forced_converted;
            all_matched_conditions.forEach(to_word_data => {
                if (options.generate_condition || generate_condition_for) {
                    word_data[KEY_matched_condition] = to_word_data;
                }
                if (to_word_data.filter_name in this.filters[options.convert_to_language]) {
                    return this.filters[options.convert_to_language][to_word_data.filter_name].call(this, {
                        word_data: word_data,
                        index_of_tagged_word_list: index_of_tagged_word_list,
                        tagged_word_list: tagged_word_list,
                        matched_condition_data: matched_condition_data,
                        options: options
                    });
                }
                const to_word = to_word_data[this.KEY_word];
                if (to_word) {
                    if (to_word.replace_to) {
                        word = to_word.replace(word);
                    } else if (typeof to_word === "string") {
                        word = to_word;
                    } else {
                        throw new Error("Invalid KEY_word: " + to_word);
                    }
                }
                const do_after_converting = to_word_data.do_after_converting;
                if (do_after_converting) {
                    if (!had_forced_converted) {
                        had_forced_converted = true;
                        word = forced_convert(word, index_of_tagged_word_list, tagged_word_list, word_mode_options);
                    }
                    word = do_after_converting.replace(word);
                }
            });
            if (prefix_spaces) word = prefix_spaces + word;
            let converted_word_list;
            if (waiting_queue.length > 0) {
                converted_word_list = forced_convert(waiting_queue, index_of_tagged_word_list, tagged_word_list, word_mode_options);
                if (converted_text.length === 0) converted_text = converted_word_list; else converted_text.append(converted_word_list);
            }
            if (check_dictionary) {
                if (converted_word_list) {
                    converted_word_list.push(word);
                } else {
                    converted_word_list = [ word ];
                }
                waiting_queue.push(prefix_spaces ? prefix_spaces + word_data[this.KEY_word] : word_data[this.KEY_word]);
                for (let append_index = index_of_tagged_word_list, length_left = max_convert_word_length - word.length; length_left > 0 && ++append_index < tagged_word_list.length; ) {
                    const word_to_append = tagged_word_list[append_index][this.KEY_word];
                    length_left -= word_to_append.length;
                    waiting_queue.push(word_to_append);
                }
                let converted_word_list_without_rule = forced_convert(waiting_queue, index_of_tagged_word_list, tagged_word_list, word_mode_options);
                converted_word_list_without_rule = converted_word_list_without_rule.slice(0, converted_word_list.length);
                if (converted_word_list.join("") === converted_word_list_without_rule.join("")) {
                    const to_word_data = word_data[KEY_matched_condition];
                    CeL.info({
                        T: [ "這條規則似乎沒有必要", `${to_word_data.matched_condition ? `${to_word_data.matched_condition} → ` : ""}${to_word_data.full_condition_text}` ]
                    });
                }
            }
            if (waiting_queue.length > 0) {
                waiting_queue = [];
            }
            converted_text.push(word);
            return;
        }
        if (word_convert_mode === "combine") {
            waiting_queue.push(prefix_spaces ? prefix_spaces + word_data[this.KEY_word] : word_data[this.KEY_word]);
            return;
        }
        const processed_word = word_convert_mode ? forced_convert(word_data[this.KEY_word], index_of_tagged_word_list, tagged_word_list, word_mode_options) : word_data[this.KEY_word];
        converted_text.push(prefix_spaces ? prefix_spaces + processed_word : processed_word);
    });
    if (waiting_queue.length > 0) {
        const converted_word_list = forced_convert(waiting_queue, tagged_word_list.length, tagged_word_list, word_mode_options);
        if (converted_text.length === 0) converted_text = converted_word_list; else converted_text.append(converted_word_list);
        waiting_queue = null;
    }
    tailored_conversion_pairs && tailored_conversion_pairs.get(KEY_postfix).forEach(single_condition => {
        if (single_condition.filter_name in this.filters[options.convert_to_language]) {
            this.filters[options.convert_to_language][single_condition.filter_name].call(this, {
                single_condition: single_condition,
                converted_text: converted_text,
                tagged_word_list: tagged_word_list,
                options: options
            });
        }
    });
    conversion_pairs.get(KEY_postfix).forEach(single_condition => {
        if (single_condition.filter_name in this.filters[options.convert_to_language]) {
            this.filters[options.convert_to_language][single_condition.filter_name].call(this, {
                single_condition: single_condition,
                converted_text: converted_text,
                tagged_word_list: tagged_word_list,
                options: options
            });
        }
    });
    if (generate_condition_for && this.generate_condition) {
        let tagged_word_list_length_accumulation, converted_text_length_accumulation;
        for (let [convert_from_text, should_convert_to] of generate_condition_for.entries()) {
            const should_convert_to_is_Object = CeL.is_Object(should_convert_to);
            const should_convert_to_text = should_convert_to_is_Object ? should_convert_to.should_convert_to_text : should_convert_to;
            if (convert_from_text.chars().length !== should_convert_to_text.chars().length) {
                if (!skip_tests_convert_to_different_length) {
                    CeL.error(`${convert_paragraph.name}: 預設解答與轉換前之文字長度不符，刪除解答：`);
                    check_convert_to_different_length(convert_from_text, should_convert_to_text, true, true);
                    generate_condition_for.delete(convert_from_text);
                    continue;
                }
                if (!should_convert_to_is_Object || !should_convert_to.warned_convert_to_different_length) {
                    if (should_convert_to_is_Object) should_convert_to.warned_convert_to_different_length = true;
                    CeL.warn(`${convert_paragraph.name}: 預設解答與轉換前之文字長度不符：`);
                    check_convert_to_different_length(convert_from_text, should_convert_to_text, true, true);
                }
            }
            for (let offset = 0; (offset = paragraph.indexOf(convert_from_text, offset)) !== NOT_FOUND; offset += convert_from_text.length) {
                if (!tagged_word_list_length_accumulation) {
                    let length = 0;
                    tagged_word_list_length_accumulation = [ length ];
                    tagged_word_list.forEach(word_data => tagged_word_list_length_accumulation.push(length += (word_data[KEY_prefix_spaces] ? word_data[KEY_prefix_spaces].length : 0) + word_data[this.KEY_word].length));
                }
                if (!converted_text_length_accumulation) {
                    converted_text_length_accumulation = [ 0 ];
                    converted_text.reduce((accumulated_length, token) => {
                        converted_text_length_accumulation.push(accumulated_length += token.length);
                        return accumulated_length;
                    }, 0);
                }
                let start_index = offset;
                tagged_word_list_length_accumulation.search_sorted(offset, {
                    found(index, is_near) {
                        start_index += converted_text_length_accumulation[index] - tagged_word_list_length_accumulation[index];
                    }
                });
                let should_be_text = should_convert_to_text, end_index;
                converted_text_length_accumulation.search_sorted(start_index + should_be_text.length, {
                    found(index, is_near) {
                        if (false && is_near && !converted_text[index]) {
                            console.trace({
                                paragraph: paragraph,
                                start_index: start_index,
                                should_be_text_length: should_be_text.length,
                                converted_text_length_accumulation: converted_text_length_accumulation,
                                is_near: is_near,
                                index: index,
                                converted_text: converted_text
                            });
                            console.log(matched_condition_data);
                            console.log(tagged_word_list);
                        }
                        if (is_near) {
                            should_be_text += converted_text[index].slice(start_index + should_be_text.length - converted_text_length_accumulation[index]);
                            end_index = index + 1;
                        } else {
                            end_index = index;
                        }
                    }
                });
                let distance_token_header_to_metched = 0;
                converted_text_length_accumulation.search_sorted(start_index, {
                    found(index, is_near) {
                        if (is_near) {
                            distance_token_header_to_metched = start_index - converted_text_length_accumulation[index];
                            should_be_text = converted_text[index].slice(0, distance_token_header_to_metched) + should_be_text;
                        }
                        start_index = index;
                    }
                });
                const converted_text_String = converted_text.slice(start_index, end_index).join("");
                if (check_convert_to_different_length(converted_text_String, should_be_text)) {
                    continue;
                }
                if (!should_convert_to_is_Object) {
                    generate_condition_for.set(convert_from_text, should_convert_to = {
                        should_convert_to_text: should_convert_to_text
                    });
                }
                if (!should_convert_to.check_result) {
                    should_convert_to.check_result = {
                        OK: [],
                        NG: []
                    };
                }
                if (converted_text_String === should_be_text) {
                    should_convert_to.check_result.OK.push(true);
                    continue;
                }
                if (false && converted_text_String.length > should_convert_to_text.length && !converted_text_String.includes(should_convert_to_text)) {
                    CeL.warn(`${convert_paragraph.name}: 預設解答詞 ${JSON.stringify(converted_text_String)} 不包含轉換後的文字 ${JSON.stringify(should_convert_to_text)}。`);
                }
                const condition_list = this.generate_condition({
                    tagged_word_list: tagged_word_list,
                    converted_text: converted_text,
                    should_be_text: should_be_text,
                    start_index: start_index,
                    end_index: end_index
                }, {
                    skip_check_for_synonyms: should_convert_to.work_title,
                    ...options
                });
                if (condition_list.length === 0) {
                    should_convert_to.check_result.OK.push(true);
                    continue;
                }
                should_convert_to.check_result.NG.push(true);
                this.print_section_report({
                    tagged_word_list: tagged_word_list,
                    condition_list: condition_list,
                    convert_from_text: convert_from_text,
                    convert_to_text: converted_text_String.slice(distance_token_header_to_metched).trimStart(),
                    should_convert_to_text: should_convert_to_text,
                    start_index: start_index,
                    end_index: end_index,
                    distance_token_header_to_metched: distance_token_header_to_metched
                }, options);
            }
        }
    }
    if (options.generate_condition && this.generate_condition) {
        if (options.should_be) {
            const should_be_text = options.should_be[options.paragraph_index];
            const converted_text_String = converted_text.join("");
            if (check_convert_to_different_length(converted_text_String, should_be_text)) {
            } else if (converted_text_String !== should_be_text) {
                const condition_list = this.generate_condition({
                    tagged_word_list: tagged_word_list,
                    converted_text: converted_text,
                    should_be_text: should_be_text
                }, options);
                if (condition_list.length > 0) {
                    if (!options.should_be.correction_conditions) options.should_be.correction_conditions = [];
                    options.should_be.correction_conditions[options.paragraph_index] = condition_list;
                } else {}
            }
        } else {
            CeL.error(`${convert_paragraph.name}: 未設定 options.should_be！`);
        }
    }
    converted_text = converted_text.join("");
    if (!word_convert_mode) {
        converted_text = forced_convert(converted_text);
    }
    return converted_text;
}

function convert_Chinese(paragraphs, options) {
    if (!paragraphs) return paragraphs === 0 ? String(paragraphs) : "";
    if (Array.isArray(options.converted_paragraphs)) {
        return return_converted_paragraphs(options, options.converted_paragraphs);
    }
    if (typeof paragraphs === "string") {
        options.input_string = true;
        paragraphs = [ paragraphs ];
    }
    const domain = this.detect_domain(paragraphs, options);
    if (this.batch_get_tag && !Array.isArray(options.tagged_word_list_of_paragraphs)) {
        const tagged_word_list_of_paragraphs = this.tag_paragraph(paragraphs, options);
        if (CeL.is_thenable(tagged_word_list_of_paragraphs)) {
            return tagged_word_list_of_paragraphs.then(tagged_word_list_of_paragraphs => {
                options.tagged_word_list_of_paragraphs = tagged_word_list_of_paragraphs;
                return execute_convert_Chinese.call(this, paragraphs, options);
            });
        }
        options.tagged_word_list_of_paragraphs = tagged_word_list_of_paragraphs;
    }
    return execute_convert_Chinese.call(this, paragraphs, options);
}

function execute_convert_Chinese(paragraphs, options) {
    let converted_paragraphs = [];
    const {tagged_word_list_of_paragraphs: tagged_word_list_of_paragraphs} = options;
    let some_async;
    for (let paragraph_index = 0; paragraph_index < paragraphs.length; paragraph_index++) {
        const paragraph = paragraphs[paragraph_index];
        let _options = options;
        if (Array.isArray(tagged_word_list_of_paragraphs)) {
            _options = {
                ..._options,
                tagged_word_list: tagged_word_list_of_paragraphs[paragraph_index]
            };
        }
        if (options.generate_condition) {
            _options = {
                ..._options,
                paragraph_index: paragraph_index
            };
        }
        const converted_paragraph = convert_paragraph.call(this, paragraph, _options);
        converted_paragraphs.push(converted_paragraph);
        some_async = some_async || CeL.is_thenable(converted_paragraph);
    }
    if (!some_async) return return_converted_paragraphs(options, converted_paragraphs);
    return Promise.all(converted_paragraphs).then(converted_paragraphs => return_converted_paragraphs(options, converted_paragraphs));
}

function return_converted_paragraphs(options, converted_paragraphs) {
    if (options.input_string && Array.isArray(converted_paragraphs) && converted_paragraphs.length === 1) converted_paragraphs = converted_paragraphs[0];
    if (options.get_full_data) return {
        converted_paragraphs: converted_paragraphs,
        tagged_word_list_of_paragraphs: options.tagged_word_list_of_paragraphs
    };
    return converted_paragraphs;
}

function get_paragraphs_of_text(text, options) {
    if (!text) return;
    text = text.toString();
    const with_configurations = !!options?.with_configurations;
    if (with_configurations) {
        text = text.replace(/\/\*[\s\S]*?\*\//g, "");
    } else {
        text = CeL.data.Convert_Pairs.remove_comments(text);
    }
    text = text.trim();
    if (!text) return;
    const configurations = with_configurations && Object.create(null);
    let this_config;
    const paragraphs = text.split("\n").reduce(with_configurations ? (filtered, text) => {
        if (text = text.trim()) {
            if (text.startsWith("//")) {
                this_config = null;
                text = text.slice(2).trimStart();
                if (text.endsWith("}") && /^{\s*"/.test(text)) {
                    try {
                        this_config = JSON.parse(text);
                    } catch {
                        CeL.warn(`${get_paragraphs_of_text.name}: Invalid JSON? ${text}`);
                    }
                }
                return filtered;
            }
            text = text.replace(/\/\/.*/, "").trim();
            filtered.push(text);
            if (this_config) {
                configurations[text] = this_config;
                this_config = null;
            }
        }
        this_config = null;
        return filtered;
    } : (filtered, text) => {
        if (text = text.trim()) filtered.push(text);
        return filtered;
    }, []);
    if (paragraphs.length > 0) {
        if (with_configurations) {
            paragraphs.configurations = configurations;
        }
        return paragraphs;
    }
}

function get_paragraphs_of_file(file_name, options) {
    return get_paragraphs_of_text(CeL.read_file(file_name), options);
}

function normalize_HTML(html) {
    html = CeL.HTML_to_Unicode(html).replace(/<br(?:\s[^<>]*)?>/gi, "\n").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
    return html;
}

Object.assign(Chinese_converter, {
    KEY_watch_target_file_name_prefix: KEY_watch_target_file_name_prefix,
    extract_work_title_from_file_path: extract_work_title_from_file_path,
    get_paragraphs_of_text: get_paragraphs_of_text,
    get_paragraphs_of_file: get_paragraphs_of_file,
    beautify_tagged_word_list: beautify_tagged_word_list,
    to_converted_file_path: to_converted_file_path
});

Object.assign(Chinese_converter.prototype, {
    tag_paragraph_jieba: tag_paragraph_jieba,
    tag_paragraph_via_CoreNLP: tag_paragraph_via_CoreNLP,
    dictionaries_directory: CeL.append_path_separator(module_base_path + "dictionaries"),
    tailored_dictionaries_directory: CeL.append_path_separator(CeL.append_path_separator(module_base_path + "dictionaries") + "tailored"),
    test_articles_directory: CeL.append_path_separator(test_directory + "articles"),
    test_articles_archives_directory: CeL.append_path_separator("archives"),
    text_to_check_files: [ KEY_watch_target_file_name_prefix + "TW.txt", KEY_watch_target_file_name_prefix + "CN.txt" ],
    print_section_report: print_section_report,
    regenerate_converted: regenerate_converted,
    not_new_article_to_check: not_new_article_to_check,
    load_tailored_dictionary: load_tailored_dictionary,
    load_text_to_check: load_text_to_check,
    load_default_text_to_check: load_default_text_to_check,
    report_text_to_check: report_text_to_check
});

module.exports = Chinese_converter;

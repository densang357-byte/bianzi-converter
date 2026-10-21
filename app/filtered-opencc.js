"use strict";

const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const {OpenCC: OpenCC} = require("opencc");

const excluded = require("./excluded-characters");

const root = path.dirname(require.resolve("opencc/package.json"));

const target = path.join(__dirname, "../.cache/source-retained-opencc");

function retainElephant(source, value) {
    const a = [ ...source ], b = [ ...value ];
    if (a.length !== b.length) {
        if (source.includes("象") && value.includes("像")) throw Error("象字詞條長度不符：" + source);
        return value;
    }
    return excluded.mapping(source, b.map((c, i) => a[i] === "象" && c === "像" ? "象" : c).join(""));
}

function filteredText(file, options = {}) {
    const raw = fs.readFileSync(file, "utf8");
    let changes = 0;
    const text = raw.split("\n").map(line => {
        if (!line || /^[#/]/u.test(line)) return line;
        const [s, v] = line.split("\t");
        if (!v) return line;
        const original = v.split(" ");
        const values = /^(?:ST|SG|SC)Phrases\.txt$/u.test(path.basename(file)) ? require("./word-boundary-policy").targets(s, original) : original;
        let approved = values.map(t => retainElephant(s, t));
        if (options.modernTai && /^(?:STCharacters|STPhrases)\.txt$/u.test(path.basename(file))) approved = require("./zhan-policy").dictionary(s, require("./tai-policy").dictionary(s, approved));
        const next = [ ...new Set(approved) ].join(" ");
        if (next !== v) changes++;
        return next ? s + "\t" + next : "";
    }).join("\n");
    if (options.modernTai && path.basename(file) === "STCharacters.txt" && !/^抬\t/mu.test(text)) return {
        text: text.replace(/\n?$/u, "\n") + "抬\t擡 抬\n",
        changes: changes + 1,
        sha256: crypto.createHash("sha256").update(raw).digest("hex")
    };
    return {
        text: text,
        changes: changes,
        sha256: crypto.createHash("sha256").update(raw).digest("hex")
    };
}

function converter(name, customRoot, options = {}) {
    const base = customRoot || OpenCC._assetsPath;
    const config = JSON.parse(fs.readFileSync(path.join(customRoot || path.join(root, "data/config"), name + ".json"), "utf8"));
    fs.mkdirSync(target, {
        recursive: true
    });
    const audit = [];
    function visit(dict) {
        if (!dict) return;
        if (dict.type === "group") {
            dict.match_policy ||= "short_circuit";
            dict.dicts.forEach(visit);
            return;
        }
        if (!dict.file) return;
        const original = path.resolve(base, dict.file), txt = customRoot ? original : path.join(root, "data/dictionary", path.basename(dict.file).replace(/\.ocd2$/, ".txt"));
        if (fs.existsSync(txt)) {
            const r = filteredText(txt, options);
            if (r.changes) {
                const output = path.join(target, (options.modernTai ? "modern-" : customRoot ? "guji-" : "") + path.basename(txt));
                if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== r.text) fs.writeFileSync(output, r.text);
                dict.type = "text";
                dict.file = output;
                audit.push({
                    source: txt,
                    sourceSha256: r.sha256,
                    removedMappings: r.changes,
                    active: output
                });
                return;
            }
        }
        dict.file = original;
    }
    for (const step of Array.isArray(config.normalization) ? config.normalization : [ config.normalization ]) visit(step?.dict);
    visit(config.segmentation?.dict);
    config.conversion_chain.forEach(s => visit(s.dict));
    fs.writeFileSync(path.join(target, (options.modernTai ? "modern-" : "") + name + "-policy.json"), JSON.stringify({
        policy: "象不轉像；哩覆榦澂保留來源字；清理跨詞界的整詞候選",
        boundaryPolicy: require("./word-boundary-policy").version,
        taiPolicy: options.modernTai ? require("./tai-policy").version : undefined,
        zhanPolicy: options.modernTai ? require("./zhan-policy").version : undefined,
        dictionaries: audit
    }, null, 2) + "\n");
    return new OpenCC(config, {
        configDirectory: base
    });
}

module.exports = {
    converter: converter,
    retainElephant: retainElephant,
    filteredText: filteredText
};

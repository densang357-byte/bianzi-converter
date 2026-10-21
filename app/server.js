"use strict";

const http = require("http");

const fs = require("fs");

const path = require("path");

const {Converter: Converter, dictionaries: dictionaries, openccVersion: openccVersion} = require("./converter");

const {variantGroups: variantGroups, defaults: defaults, validateVariants: validateVariants} = require("./standard");

const {characterCatalogue: characterCatalogue} = require("./priority");

const {profiles: profiles, getProfile: getProfile, getDictionaries: getDictionaries, gujiSource: gujiSource} = require("./profiles");

const modernLexicon = require("../dictionaries/CN_to_TW.modern.phrases.json");

const {canonicalGlyphs: canonicalGlyphs} = require("./source-letter-policy");

const inverseLookup = Object.fromEntries([ "TSCharacters", "TSPhrases" ].map(name => {
    const map = new Map;
    for (const [word, targets] of dictionaries[name]) {
        const key = canonicalGlyphs(word);
        map.set(key, [ ...new Set([ ...map.get(key) || [], ...targets ]) ]);
    }
    return [ name, map ];
}));

const converter = new Converter;

const port = Number(process.env.PORT || 8787);

const assets = new Map([ [ "/student-standard.html", [ "student-standard.html", "text/html" ] ], [ "/historical-review.html", [ "historical-review.html", "text/html" ] ], [ "/standard-review.html", [ "standard-review.html", "text/html" ] ], [ "/editor-diff.js", [ "editor-diff.js", "application/javascript" ] ], [ "/encoding-data.js", [ "encoding-data.js", "application/javascript" ] ], [ "/replacements.js", [ "replacements.js", "application/javascript" ] ], [ "/settings.js", [ "settings.js", "application/javascript" ] ], [ "/", [ "index.html", "text/html" ] ], [ "/app.js", [ "app.js", "application/javascript" ] ], [ "/proofreading.js", [ "proofreading.js", "application/javascript" ] ], [ "/documents.js", [ "documents.js", "application/javascript" ] ], [ "/files.js", [ "files.js", "application/javascript" ] ], [ "/classical-quote-pass.js", [ "classical-quote-pass.js", "application/javascript" ] ], [ "/corrections.js", [ "corrections.js", "application/javascript" ] ], [ "/style.css", [ "style.css", "text/css" ] ] ]);

function json(res, status, body) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (req.method === "GET" && url.pathname.startsWith("/student-standard/")) {
            const name = decodeURIComponent(url.pathname.slice("/student-standard/".length));
            const allowed = [ "學生字典標準.json", "完整比較.tsv", "字形取捨.tsv", "分義與兼用.json", "待核清單.json", "核驗.json", "policy.json" ];
            if (!allowed.includes(name)) return json(res, 404, {
                error: "找不到此項資料。"
            });
            res.writeHead(200, {
                "Content-Type": name.endsWith(".json") ? "application/json; charset=utf-8" : "text/tab-separated-values; charset=utf-8"
            });
            res.end(fs.readFileSync(path.join(__dirname, "public/student-standard", name)));
            return;
        }
        if (await require("./diagnostics-browser").handle(req, res, url, json)) return;
        if (req.method === "GET" && url.pathname === "/fflate.js") {
            res.writeHead(200, {
                "Content-Type": "application/javascript; charset=utf-8"
            });
            res.end(fs.readFileSync(path.join(path.dirname(require.resolve("fflate/package.json")), "umd/index.js")));
        } else if (req.method === "GET" && url.pathname === "/diff.js") {
            res.writeHead(200, {
                "Content-Type": "application/javascript; charset=utf-8"
            });
            res.end(fs.readFileSync(path.join(path.dirname(require.resolve("diff/package.json")), "dist/diff.js")));
        } else if (req.method === "GET" && assets.has(url.pathname)) {
            const [file, type] = assets.get(url.pathname);
            res.writeHead(200, {
                "Content-Type": type + "; charset=utf-8"
            });
            res.end(fs.readFileSync(path.join(__dirname, "public", file)));
        } else if (req.method === "GET" && url.pathname === "/classical-quotes.html") {
            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8"
            });
            res.end(fs.readFileSync(path.join(__dirname, "public/classical-quotes.html")));
        } else if (req.method === "GET" && url.pathname === "/api/classical-quotes") {
            json(res, 200, require("./classical-quotes").catalogue(Object.fromEntries(url.searchParams)));
        } else if (req.method === "GET" && url.pathname === "/api/meta") {
            json(res, 200, {
                capabilities: {
                    protocol: 2,
                    automaticDiagnostics: true,
                    diagnosticsRoot: "outputs/轉換問題收集",
                    modes: [ "fast", "slow", "context", "dictionary" ],
                    analysis: "ltp",
                    engines: [ "hanlp", "ltp" ],
                    conversionModes: require("./modes").modes,
                    tokenBoundaries: true,
                    posLexicon: require("./pos-lexicon").version
                },
                studentStandard: {
                    version: require("./student-standard").version,
                    glyphMappings: Object.keys(require("./student-standard").policy.glyphs).length,
                    pendingGroups: require("./student-standard").policy.pending.length,
                    report: "/student-standard.html"
                },
                lexicalNetwork: {
                    enabled: true,
                    version: require("./lexical-network").version,
                    localRelations: require("./lexical-network").localRelationVersion
                },
                reviewRisks: {
                    version: require("./review-risk").version,
                    watchWords: require("./data/review-risk-frequency.json").watchWords.length,
                    reviewOnly: true,
                    frequencyCohortsSeparate: true
                },
                version: openccVersion,
                ambiguous: characterCatalogue().length,
                specializedTerms: {
                    version: require("./specialized-terms").version,
                    count: require("./specialized-terms").count,
                    enabled: true
                },
                classicalQuotes: {
                    version: require("./classical-quotes").version,
                    count: require("./classical-quotes").count,
                    enabled: true,
                    catalogue: "/classical-quotes.html",
                    phase: "post-conversion",
                    postScanVersion: require("./classical-quote-postscan").version,
                    bookScan: "/api/classical-quotes/scan"
                },
                characters: getDictionaries("modern").characters.size,
                phrases: getDictionaries("modern").phrases.size,
                standards: [ "s2t", "t2s" ],
                profiles: profiles,
                gujiRevision: gujiSource.commit,
                rules: "dictionaries/CN_to_TW.LTP.PoS.txt",
                semanticRules: "dictionaries/CN_to_TW.modern.PoS.json",
                supplementalPhrases: modernLexicon.length,
                variantGroups: variantGroups,
                defaults: defaults
            });
        } else if (req.method === "GET" && url.pathname === "/api/ambiguous") {
            const variants = url.searchParams.get("variants")?.split(",").filter(Boolean) || [];
            validateVariants(variants);
            const profile = url.searchParams.get("profile") || "modern";
            getProfile(profile);
            json(res, 200, url.searchParams.get("scope") === "proof" ? require("./proof-catalogue").proofCatalogue(url.searchParams.get("proofMode") || "classical") : characterCatalogue(profile, variants));
        } else if (req.method === "GET" && url.pathname === "/api/lookup") {
            const query = canonicalGlyphs(url.searchParams.get("q") || "");
            if (!query || query.length > 100) return json(res, 200, []);
            const matches = modernLexicon.filter(entry => entry.source.includes(query) || entry.target.includes(query)).map(entry => ({
                source: entry.source,
                targets: [ entry.target ],
                dictionary: "默認標準補充詞庫",
                reason: entry.reason
            }));
            const effective = {
                STCharacters: getDictionaries("modern").characters,
                STPhrases: getDictionaries("modern").phrases,
                ...inverseLookup
            };
            for (const [name, dictionary] of Object.entries(effective)) {
                for (const [source, targets] of dictionary) {
                    if (source.includes(query) || targets.some(target => target.includes(query))) matches.push({
                        source: source,
                        targets: targets,
                        dictionary: "默認底層 " + name
                    });
                    if (matches.length >= 100) break;
                }
                if (matches.length >= 100) break;
            }
            matches.push(...require("../dictionaries/specialized-terms.json").entries.filter(e => e.source.includes(query) || e.target.includes(query)).map(e => ({
                source: e.source,
                targets: [ e.target ],
                dictionary: "專門語詞庫",
                reason: e.note
            })));
            json(res, 200, matches.slice(0, 100));
        } else if (req.method === "POST" && [ "/api/convert", "/api/convert-batch", "/api/classical-quotes/scan" ].includes(url.pathname)) {
            if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, {
                error: "請從本機工具頁面提交。"
            });
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 2 * 1024 * 1024) return json(res, 413, {
                    error: "提交的文字或詞庫過大。"
                });
                chunks.push(chunk);
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            json(res, 200, await (url.pathname === "/api/convert-batch" ? converter.convertSegments(input) : url.pathname === "/api/classical-quotes/scan" ? converter.scanClassicalQuotes(input) : converter.convert(input)));
        } else json(res, 404, {
            error: "找不到此頁面。"
        });
    } catch (error) {
        json(res, 400, {
            error: error.message
        });
    }
});

server.listen(port, "127.0.0.1", () => console.log(`辨字已啟動：http://127.0.0.1:${server.address().port}/`));

function stop() {
    converter.close();
    server.close(() => process.exit(0));
}

process.on("SIGINT", stop);

process.on("SIGTERM", stop);

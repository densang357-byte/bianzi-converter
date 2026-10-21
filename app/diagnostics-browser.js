"use strict";

const fs = require("node:fs"), path = require("node:path"), readline = require("node:readline");

const root = path.join(__dirname, "../outputs/轉換問題收集");

const stages = new Set([ "conversion", "review-import", "test", "regression" ]);

function directory(url) {
    const stage = url.searchParams.get("stage") || "conversion", run = url.searchParams.get("run") || "";
    if (!stages.has(stage) || !run || run.length > 160 || /[\\/\x00]/u.test(run) || [ ".", ".." ].includes(run)) throw Error("未知診斷批次。");
    return path.join(root, stage, run);
}

function list() {
    const rows = [];
    for (const stage of [ "conversion", "review-import" ]) {
        const parent = path.join(root, stage);
        if (!fs.existsSync(parent)) continue;
        for (const name of fs.readdirSync(parent)) {
            const dir = path.join(parent, name), index = path.join(dir, "索引.json");
            if (!fs.existsSync(index)) continue;
            const m = JSON.parse(fs.readFileSync(index));
            rows.push({
                stage: stage,
                runId: name,
                sourceName: m.sourceName || m.book,
                updatedAt: m.updatedAt || fs.statSync(index).mtime.toISOString(),
                kind: m.kind || "review-import",
                progress: fs.existsSync(path.join(dir, "來源進度.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "來源進度.json"))) : null,
                counts: stage === "conversion" ? {
                    ...Object.fromEntries(Object.keys(require("./conversion-diagnostics").categories).map(k => [ k, 0 ])),
                    ...m.counts
                } : m.counts,
                policy: m.policy,
                files: fs.readdirSync(dir).filter(n => n.endsWith(".jsonl"))
            });
        }
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function handle(req, res, url, json) {
    if (req.method !== "GET") return false;
    if (url.pathname === "/diagnostics/") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
        });
        res.end(fs.readFileSync(path.join(__dirname, "public/diagnostics.html")));
        return true;
    }
    if (url.pathname === "/api/diagnostics-runs") {
        json(res, 200, list());
        return true;
    }
    if (![ "/api/diagnostics-records", "/api/diagnostics-file" ].includes(url.pathname)) return false;
    const dir = directory(url), category = url.searchParams.get("category");
    if (!category || !fs.readdirSync(dir).includes(category) || !category.endsWith(".jsonl")) throw Error("未知診斷分類。");
    const file = path.join(dir, category);
    if (url.pathname === "/api/diagnostics-file") {
        res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(category)
        });
        fs.createReadStream(file).pipe(res);
        return true;
    }
    const offset = Math.max(0, Math.min(1e7, Number(url.searchParams.get("offset")) || 0)), limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
    const q = url.searchParams.get("q") || "";
    if (q.length > 100) throw Error("搜尋詞最多100字。");
    const input = fs.createReadStream(file), lines = readline.createInterface({
        input: input,
        crlfDelay: Infinity
    }), rows = [];
    let at = 0, more = false;
    try {
        for await (const line of lines) {
            if (!line.trim()) continue;
            const r = JSON.parse(line);
            if (q && ![ r.source, r.word, r.before, r.after, r.target, ...r.candidates || [], r.tokens?.map(t => t.text).join("") ].some(v => typeof v === "string" && v.includes(q))) continue;
            if (at++ < offset) continue;
            if (rows.length === limit) {
                more = true;
                break;
            }
            rows.push(r);
        }
    } finally {
        lines.close();
        input.destroy();
    }
    const needed = new Set(rows.map(r => r.sentenceId).filter(Boolean)), contexts = new Map, sentences = path.join(dir, "句段.jsonl");
    if (needed.size && fs.existsSync(sentences)) {
        const stream = fs.createReadStream(sentences), reader = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
        });
        try {
            for await (const line of reader) {
                if (!line.trim()) continue;
                const s = JSON.parse(line);
                if (needed.delete(s.sentenceId)) contexts.set(s.sentenceId, {
                    before: s.before,
                    after: s.after
                });
                if (!needed.size) break;
            }
        } finally {
            reader.close();
            stream.destroy();
        }
    }
    json(res, 200, {
        rows: rows.map(r => contexts.has(r.sentenceId) ? {
            ...r,
            sentenceContext: contexts.get(r.sentenceId)
        } : r),
        offset: offset,
        more: more
    });
    return true;
}

module.exports = {
    handle: handle
};

"use strict";

const {spawn: spawn} = require("child_process");

const fs = require("fs");

const path = require("path");

const readline = require("readline");

class LTPWorker {
    constructor(options = {}) {
        this.options = options;
        this.pending = new Map;
        this.next_id = 0;
        this.stats = {
            memory_hits: 0,
            disk_hits: 0,
            inferred: 0
        };
    }
    start() {
        const env_python = path.join(__dirname, "..", ".venv-ltp", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
        const python = this.options.python_path || process.env.CECC_LTP_PYTHON || (fs.existsSync(env_python) ? env_python : "python3");
        const args = [ "-u", this.options.worker_script || path.join(__dirname, "LTP_parse.py"), "--worker" ];
        for (const [name, value] of Object.entries({
            path: this.options.LTP_model,
            device: this.options.LTP_device,
            batch_size: this.options.LTP_batch_size,
            threads: this.options.LTP_threads,
            cache_size: this.options.LTP_cache_size
        })) {
            if (value !== undefined) args.push("--" + name, String(value));
        }
        const child = this.child = spawn(python, args, {
            stdio: [ "pipe", "pipe", "inherit" ]
        });
        readline.createInterface({
            input: child.stdout
        }).on("line", line => {
            let reply;
            try {
                reply = JSON.parse(line);
            } catch (error) {
                this.fail(new Error("Invalid " + (this.options.engine_name || "LTP") + " worker response: " + line));
                return;
            }
            const pending = this.pending.get(reply.id);
            if (!pending) return;
            this.pending.delete(reply.id);
            if (reply.stats) for (const name of Object.keys(this.stats)) this.stats[name] += reply.stats[name] || 0;
            if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply.result);
            if (this.pending.size === 0) this.set_ref(false);
        });
        child.on("error", error => this.fail(error));
        child.on("exit", (code, signal) => {
            if (this.child === child) this.fail(new Error(`${this.options.engine_name || "LTP"} worker exited (${signal || code})`));
        });
        child.stdin.on("error", error => this.fail(error));
        this.on_exit = () => child.kill();
        process.once("exit", this.on_exit);
    }
    set_ref(ref) {
        if (!this.child) return;
        for (const handle of [ this.child, this.child.stdin, this.child.stdout ]) if (typeof handle[ref ? "ref" : "unref"] === "function") handle[ref ? "ref" : "unref"]();
    }
    predict(text) {
        if (!this.child) this.start();
        this.set_ref(true);
        const id = ++this.next_id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve: resolve,
                reject: reject
            });
            this.child.stdin.write(JSON.stringify({
                id: id,
                text: text
            }) + "\n");
        });
    }
    fail(error) {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.close();
    }
    close() {
        if (this.on_exit) process.removeListener("exit", this.on_exit);
        if (!this.child) return;
        const child = this.child;
        this.child = null;
        child.kill();
        for (const pending of this.pending.values()) pending.reject(new Error("LTP worker closed"));
        this.pending.clear();
    }
}

module.exports = LTPWorker;

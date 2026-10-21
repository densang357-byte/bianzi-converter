"use strict";

const path = require("node:path");

const Worker = require("./ltp_worker");

const active = require("./active-hanlp-model.json");

module.exports = class HanLPWorker extends Worker {
    constructor(options = {}) {
        super({
            ...options,
            engine_name: "HanLP",
            worker_script: path.join(__dirname, "HanLP_parse.py"),
            python_path: process.env.CECC_HANLP_PYTHON || path.join(__dirname, "../.venv-pos-models", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
            LTP_model: process.env.CECC_HANLP_MODEL || path.resolve(__dirname, "..", active.path),
            LTP_batch_size: 16,
            LTP_threads: 2
        });
    }
};

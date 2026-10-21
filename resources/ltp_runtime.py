"""Shared LTP 4.2 adapter for the HTTP server and the persistent Node worker."""
from collections import OrderedDict
from contextlib import redirect_stdout
from copy import deepcopy
import os
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
import sys

TASKS = ("cws", "pos", "srl", "dep", "sdp")


def ensure_runtime():
    """Allow a newer system Python to launch the supported inference Python."""
    env = Path(__file__).resolve().parent.parent / ".venv-ltp"
    candidate = os.environ.get("CECC_LTP_PYTHON")
    if not candidate:
        candidate = env / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
        if not Path(candidate).exists():
            return
        if Path(sys.prefix).resolve() == env.resolve():
            return
    elif os.path.abspath(sys.executable) == os.path.abspath(candidate):
        return
    os.execv(str(candidate), [str(candidate), *sys.argv])


def utf16_length(text):
    # CeCC indexes JavaScript strings in UTF-16 code units.
    return len(text.encode("utf-16-le")) // 2


class Parser:
    def __init__(self, path="LTP/base", batch_size=16, device=None,
                 cache_size=2048, threads=4, full=False, cache_path=None, length_buckets=True):
        if batch_size < 1 or cache_size < 0 or threads < 1:
            raise ValueError("batch_size/threads must be positive; cache_size must be nonnegative")
        import torch
        from ltp import LTP

        self.torch = torch
        torch.set_num_threads(threads)
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        if path in ("base", "base1", "base2", "small", "tiny"):
            path = "LTP/" + path
        self.path = path
        self.batch_size = batch_size
        self.cache_size = cache_size
        self.cache = OrderedDict()
        self.length_buckets = length_buckets
        self.disk_cache = None
        self.tasks = [*TASKS, *(["ner"] if full else [])]
        # Upstream prints while loading local models. Keep the worker's stdout JSON-only.
        with redirect_stdout(sys.stderr):
            self.ltp = LTP(path)
            if not set(TASKS).issubset(self.ltp.supported_tasks):
                raise ValueError("CeCC requires a neural LTP model with dep/srl/sdp support")
            self.ltp.to(self.device)
            self.ltp.eval()

        # Cache raw model output, never conversion choices or user dictionaries.
        cache_path = cache_path if cache_path is not None else os.environ.get(
            "CECC_LTP_CACHE", str(Path(__file__).resolve().parents[1] / ".cache/ltp/analyses.sqlite3"))
        if cache_path and cache_path != "off":
            try:
                from huggingface_hub import snapshot_download
                from ltp_cache import AnalysisCache
                model_root = Path(path) if Path(path).is_dir() else Path(snapshot_download(path, local_files_only=True))
                files = [(str(f.relative_to(model_root)), str(f.resolve()), f.stat().st_size, f.stat().st_mtime_ns)
                         for f in sorted(model_root.rglob("*")) if f.is_file()]
                identity = {"model": path, "files": files, "tasks": self.tasks, "device": self.device,
                            "versions": {name: version(name) for name in ("ltp", "torch", "transformers")},
                            "adapter": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                            "threads": threads, "batch_size": batch_size, "length_buckets": length_buckets}
                namespace = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
                self.disk_cache = AnalysisCache(cache_path, namespace)
            except Exception as error:
                print(f"LTP disk cache identity unavailable; using memory cache: {error}", file=sys.stderr)

    def _remember(self, sentence, parsed):
        if self.cache_size:
            self.cache[sentence] = parsed
            self.cache.move_to_end(sentence)
            while len(self.cache) > self.cache_size:
                self.cache.popitem(last=False)


    def predict(self, sentences):
        if not isinstance(sentences, list) or any(not isinstance(s, str) for s in sentences):
            raise ValueError("text must be a string or an array of strings")
        result = {}
        missing = []
        token_lengths = {}
        disk = getattr(self, "disk_cache", None)
        self.last_stats = {"memory_hits": 0, "disk_hits": 0, "inferred": 0}
        for sentence in dict.fromkeys(sentences):
            if not sentence.strip():
                result[sentence] = {"text": sentence, "nes": [], "words": []}
            elif sentence in self.cache:
                self.last_stats["memory_hits"] += 1
                self.cache.move_to_end(sentence)
                result[sentence] = self.cache[sentence]
            else:
                cached = disk.get(sentence) if disk else None
                if cached is not None:
                    result[sentence] = cached
                    self._remember(sentence, cached)
                    self.last_stats["disk_hits"] += 1
                    continue
                # Do not silently let the upstream tokenizer truncate long inputs.
                tokens = self.ltp.tokenizer(sentence, add_special_tokens=True, truncation=False)
                if len(tokens["input_ids"]) > 512:
                    raise ValueError("text exceeds LTP's 512-token limit; split it into sentences")
                missing.append(sentence)
                token_lengths[sentence] = len(tokens["input_ids"])
        if getattr(self, "length_buckets", True):
            missing.sort(key=token_lengths.__getitem__)
        self.last_stats["inferred"] = len(missing)
        for start in range(0, len(missing), self.batch_size):
            batch = missing[start:start + self.batch_size]
            with redirect_stdout(sys.stderr), self.torch.inference_mode():
                output = self.ltp.pipeline(batch, tasks=self.tasks)
            for index, sentence in enumerate(batch):
                parsed = self._format(sentence, output, index)
                result[sentence] = parsed
                self._remember(sentence, parsed)
                if disk:
                    disk.put(sentence, parsed)
        if disk:
            disk.flush()
        # Callers may change words while converting or matching dictionary rules.
        return [deepcopy(result[sentence]) for sentence in sentences]

    def _format(self, sentence, output, index):
        words = []
        offset = 0
        dep = output.dep[index]
        for word_id, (text, pos, head, relation) in enumerate(zip(
                output.cws[index], output.pos[index], dep["head"], dep["label"])):
            length = utf16_length(text)
            words.append({"id": word_id, "length": length, "offset": offset,
                          "text": text, "pos": pos, "parent": head - 1,
                          "relation": relation, "roles": [], "parents": []})
            offset += length
        for predicate in output.srl[index]:
            for role, text, start, end in predicate["arguments"]:
                words[predicate["index"]]["roles"].append({
                    "text": text, "offset": words[start]["offset"],
                    "length": utf16_length(text), "type": role,
                })
        sdp = output.sdp[index]
        for word, head, label in zip(words, sdp["head"], sdp["label"]):
            word["parents"].append({"parent": head - 1, "relate": label})
        nes = []
        if "ner" in self.tasks:
            for role, text, start, end in output.ner[index]:
                nes.append({"text": text, "offset": words[start]["offset"],
                            "ne": role.lower(), "length": utf16_length(text)})
        return {"text": sentence, "nes": nes, "words": words}

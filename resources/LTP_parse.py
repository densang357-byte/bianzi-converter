#!/usr/bin/env python3
"""Parse once, or keep a model loaded for JSON-lines requests from Node.js."""
import argparse
import json
import sys

from ltp_runtime import Parser, ensure_runtime


def main():
    args = argparse.ArgumentParser(description=__doc__)
    inputs = args.add_mutually_exclusive_group(required=True)
    inputs.add_argument("-t", "--text")
    inputs.add_argument("-j", "--json")
    inputs.add_argument("--worker", action="store_true")
    args.add_argument("--path", default="base")
    args.add_argument("--device", default=None)
    args.add_argument("--batch_size", type=int, default=16)
    args.add_argument("--cache_size", type=int, default=2048)
    args.add_argument("--threads", type=int, default=4)
    options = args.parse_args()
    ensure_runtime()
    parser = Parser(options.path, options.batch_size, options.device,
                    options.cache_size, options.threads)
    if options.worker:
        for line in sys.stdin:
            request = None
            try:
                request = json.loads(line)
                result = parser.predict(request["text"])
                response = {"id": request["id"], "result": result, "stats": parser.last_stats}
            except Exception as error:
                response = {"id": request.get("id") if isinstance(request, dict) else None,
                            "error": str(error)}
            print(json.dumps(response, ensure_ascii=False), flush=True)
        return
    try:
        sentences = [options.text] if options.text is not None else json.loads(options.json)
        result = parser.predict(sentences)
    except (ValueError, TypeError) as error:
        args.exit(1, f"{error}\n")
    print("Parsed JSON:")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

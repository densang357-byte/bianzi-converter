"""JSON-lines protocol for the installed HanLP model."""
import argparse
import json
import sys
from hanlp_runtime import Parser

def main():
    args = argparse.ArgumentParser()
    args.add_argument('--worker', action='store_true', required=True)
    args.add_argument('--path', required=True)
    args.add_argument('--batch_size', type=int, default=16)
    args.add_argument('--threads', type=int, default=2)
    args.add_argument('--cache_size', type=int, default=2048)
    args.add_argument('--device', default='cpu')
    options = args.parse_args()
    parser = Parser(options.path, options.batch_size, options.threads, options.cache_size)
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            result = parser.predict(request['text'])
            response = dict(id=request['id'], result=result, stats=parser.last_stats)
        except Exception as error:
            response = dict(id=request.get('id') if isinstance(request, dict) else None, error=str(error))
        print(json.dumps(response, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()

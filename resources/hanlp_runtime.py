"""Native HanLP multitask inference adapter."""
from collections import OrderedDict
from contextlib import redirect_stdout
from copy import deepcopy
import os
from pathlib import Path
import sys


def u16(text):
    return len(text.encode('utf-16-le')) // 2


class Parser:
    def __init__(self, path, batch_size=16, threads=2, cache_size=2048):
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        from hanlp_model_assets import configure
        with redirect_stdout(sys.stderr):
            configure()
            import torch
            import hanlp
            torch.set_num_threads(threads)
            self.model = hanlp.load(str(Path(path)), devices=-1)
        self.torch = torch
        self.batch_size, self.cache_size = batch_size, cache_size
        self.cache = OrderedDict()

    def predict(self, texts):
        if not isinstance(texts, list) or any(not isinstance(t, str) for t in texts):
            raise ValueError('text must be an array of strings')
        result, missing = {}, []
        self.last_stats = dict(memory_hits=0, disk_hits=0, inferred=0)
        for text in dict.fromkeys(texts):
            if not text.strip():
                result[text] = dict(text=text, words=[], nes=[])
            elif text in self.cache:
                self.last_stats['memory_hits'] += 1
                result[text] = self.cache[text]
                self.cache.move_to_end(text)
            else:
                missing.append(text)
        self.last_stats['inferred'] = len(missing)
        for at in range(0, len(missing), self.batch_size):
            batch = missing[at:at+self.batch_size]
            with redirect_stdout(sys.stderr), self.torch.inference_mode():
                doc = self.model(batch, tasks=['tok/fine', 'pos/863', 'dep', 'sdp', 'srl'])
            for i, text in enumerate(batch):
                row = self.format(text, doc, i)
                result[text] = row
                if self.cache_size:
                    self.cache[text] = row
                    while len(self.cache) > self.cache_size:
                        self.cache.popitem(last=False)
        return [deepcopy(result[text]) for text in texts]

    @staticmethod
    def format(text, doc, index):
        native_words, tags = doc['tok/fine'][index], doc['pos/863'][index]
        dep, sdp, srl = doc['dep'][index], doc['sdp'][index], doc['srl'][index]
        assert len(native_words) == len(tags) == len(dep) == len(sdp)
        words, cp = [], 0
        aliases = {'w':'wp', 'f':'nd', 'nhf':'nh', 'nhs':'nh', 'vd':'v', 'vl':'v', 'vu':'v'}
        for i, (word, tag, (head, relation), parents) in enumerate(zip(native_words, tags, dep, sdp, strict=True)):
            start = text.find(word, cp)
            assert start >= cp and not text[cp:start].strip(), 'HanLP skipped or changed source'
            cp = start + len(word)
            assert 0 <= head <= len(native_words)
            words.append(dict(id=i, text=word, pos=aliases.get(tag, tag), raw_pos=tag,
                              offset=u16(text[:start]), length=u16(word), parent=head-1, relation=relation,
                              roles=[], parents=[dict(parent=h-1, relate=r) for h, r in parents],
                              native_engine='HanLP', native_dependency=[head, relation]))
        assert not text[cp:].strip(), 'HanLP truncated source'
        for frame in srl:
            predicates = [r for r in frame if r[1] == 'PRED']
            for pred in predicates:
                p = pred[2]
                words[p]['native_srl'] = deepcopy(frame)
                for surface, role, start, end in frame:
                    assert 0 <= start < end <= len(words)
                    if role == 'PRED':
                        continue
                    words[p]['roles'].append(dict(text=surface, offset=words[start]['offset'],
                                                  length=u16(surface), type=role))
        return dict(text=text, words=words, nes=[], backend='HanLP native multitask863')

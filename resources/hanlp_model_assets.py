"""Use HanLP's documented official mirror, including URLs embedded in configs."""
import hashlib
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def configure():
    os.environ['HANLP_HOME']=str(ROOT/'.cache/hanlp')
    os.environ['HANLP_URL']='https://ftp.hankcs.com/hanlp/'
    os.environ['HF_HOME']=str(ROOT/'.cache/huggingface-pos')
    import hanlp.utils.io_util as io
    import requests
    original=io.download

    def mirrored(url,save_path=None,**kwargs):
        prefix='https://file.hankcs.com/hanlp/'
        mirror=url.replace(prefix,'https://ftp.hankcs.com/hanlp/',1)if url.startswith(prefix)else url
        if not mirror.startswith('https://ftp.hankcs.com/hanlp/'):
            return original(url,save_path=save_path,**kwargs)
        target=Path(save_path or io.path_from_url(url))
        if target.exists():return str(target)
        target.parent.mkdir(parents=True,exist_ok=True)
        temporary=target.with_name(target.name+'.mirror-part')
        digest=hashlib.sha256();size=0
        print('Downloading official mirror:',mirror,flush=True)
        with requests.get(mirror,stream=True,timeout=(15,60))as response:
            response.raise_for_status()
            with temporary.open('wb')as f:
                for chunk in response.iter_content(1024*1024):
                    f.write(chunk);digest.update(chunk);size+=len(chunk)
        temporary.replace(target)
        manifest=ROOT/'.cache/model-assets.json'
        manifest.parent.mkdir(parents=True,exist_ok=True)
        records=json.loads(manifest.read_text())if manifest.exists()else []
        records.append(dict(original_url=url,download_url=mirror,bytes=size,sha256=digest.hexdigest(),path=str(target.relative_to(ROOT))))
        manifest.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
        return str(target)
    io.download=mirrored

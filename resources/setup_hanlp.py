"""Install the isolated HanLP inference environment and its public model."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--python', default='3.12')
    opts = args.parse_args()
    uv = shutil.which('uv')
    if not uv:
        args.exit(1, 'Install uv first: python -m pip install uv\n')
    root = Path(__file__).resolve().parents[1]
    env = root / '.venv-pos-models'
    python = env / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.exists():
        subprocess.check_call([uv, 'venv', '--python', opts.python, str(env)])
    subprocess.check_call([uv, 'pip', 'install', '--python', str(python), '-r', str(root / 'resources/requirements-hanlp.txt')])
    code = "from hanlp_model_assets import configure; configure(); import hanlp; from hanlp.pretrained.mtl import CLOSE_TOK_POS_NER_SRL_DEP_SDP_CON_ELECTRA_SMALL_ZH; hanlp.load(CLOSE_TOK_POS_NER_SRL_DEP_SDP_CON_ELECTRA_SMALL_ZH)"
    subprocess.check_call([str(python), '-c', code], cwd=root / 'resources')


if __name__ == '__main__':
    main()

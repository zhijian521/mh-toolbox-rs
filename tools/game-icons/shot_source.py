"""切图脚本共用的截图来源参数；导入模块时不访问用户目录。"""
import argparse
import os
from pathlib import Path


def shot_parser(description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument('--src', help='截图目录；未指定时读取 GAME_SHOT_DIR')
    return parser


def shot_directory(parser, args):
    source = args.src or os.environ.get('GAME_SHOT_DIR')
    if not source:
        parser.error('请用 --src 指定截图目录，或设置 GAME_SHOT_DIR')
    path = Path(source).expanduser().resolve()
    if not path.is_dir():
        parser.error('截图目录不存在：{}'.format(path))
    return path

"""下载固定版本的 UI 字体，复用文楷覆盖范围生成可再生的 WOFF2 子集。

    python tools/font/import-ui-fonts.py

依赖 fonttools[woff]；原件仅缓存在 .runtime/font-sources，版本与 SHA256 固定在下表。
思源保留名称不用于修改后的字体内部名称；界面选项保留原字体来源名称。
"""

import argparse
import hashlib
import io
from pathlib import Path
import runpy
import subprocess
import urllib.request
import zipfile

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.runtime/font-sources'
DEST = ROOT / 'assets/fonts'
SOURCES = [
    {
        'id': 'sans',
        'source': 'sans.otf',
        'url': 'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/'
               'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2/SubsetOTF/CN/SourceHanSansCN-Regular.otf',
        'sha256': 'e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4',
        'family': 'MH Toolbox Hei',
        'output': 'MHHei.woff2',
        'license': 'SourceHanSans-OFL.txt',
        'license_url': 'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/'
                       'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2/LICENSE.txt',
    },
    {
        'id': 'serif',
        'source': 'serif.otf',
        'url': 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/'
               '7889f11bf31170b5d092a083b357c8c8130f89e0/SubsetOTF/CN/SourceHanSerifCN-Regular.otf',
        'sha256': '3754ea669c530e2473354f8f6d9f79680a44d7e26ec7d00eeabee4a7e0753c5d',
        'family': 'MH Toolbox Song',
        'output': 'MHSong.woff2',
        'license': 'SourceHanSerif-OFL.txt',
        'license_url': 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/'
                       '7889f11bf31170b5d092a083b357c8c8130f89e0/LICENSE.txt',
    },
    {
        'id': 'zhuque',
        'source': 'zhuque.zip',
        'url': 'https://github.com/TrionesType/zhuque/releases/download/v0.212/'
               'ZhuqueFangsong-v0.212.zip',
        'sha256': 'bb8b661a7643d2296a72d9d10530a00949419c4e527fb61783f73c2ba1a8c062',
        'family': 'MH Toolbox Fangsong',
        'output': 'MHFangsong.woff2',
        'license': 'ZhuqueFangsong-OFL.txt',
        'license_url': 'https://raw.githubusercontent.com/TrionesType/zhuque/'
                       '005a8d0d620cb1fe2a576620a69daea3cc7477b4/LICENSE.txt',
    },
    {
        'id': 'rounded',
        'source': 'rounded.7z',
        'url': 'https://github.com/CyanoHao/Resource-Han-Rounded/releases/download/v0.990/'
               'RHR-CN-0.990.7z',
        'sha256': 'e7005f7b4a7a0b8352d32c4a1358ff47564eb73be7fdb2db00d9f792755e9dc7',
        'member': 'ResourceHanRoundedCN-Regular.ttf',
        'family': 'MH Toolbox Rounded',
        'output': 'MHRounded.woff2',
        'license': 'ResourceHanRounded-OFL.txt',
        'license_url': 'https://raw.githubusercontent.com/CyanoHao/Resource-Han-Rounded/'
                       'be90fee7a031c1297da5a260ccfb91756088d51c/OFL-License.txt',
    },
]


def cached_download(name, url):
    path = CACHE / name
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'mh-toolbox-fonts'})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def rename(font, family):
    """子集作为修改版分发，避免沿用上游保留名称。"""
    postscript = family.replace(' ', '') + '-Regular'
    values = {1: family, 2: 'Regular', 3: postscript + '-Subset', 4: family + ' Regular',
              6: postscript, 16: family, 17: 'Regular', 18: family + ' Regular',
              21: family, 22: 'Regular'}
    names = font['name']
    for record in names.names:
        if record.nameID in values:
            record.string = values[record.nameID]
    for name_id, value in values.items():
        names.setName(value, name_id, 3, 1, 0x409)
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = [postscript]
        cff.topDictIndex[0].FamilyName = family
        cff.topDictIndex[0].FullName = family + ' Regular'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=[source['id'] for source in SOURCES])
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    chars = runpy.run_path(str(ROOT / 'tools/font/subset-font.py'))['coverage']()
    for source in SOURCES:
        if args.only and args.only != source['id']:
            continue
        print('生成 ' + source['output'], flush=True)
        data = cached_download(source['source'], source['url'])
        if hashlib.sha256(data).hexdigest() != source['sha256']:
            raise ValueError('字体原件校验失败：' + source['source'])
        if source['source'].endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                candidates = [name for name in archive.namelist()
                              if name.lower().endswith(('.ttf', '.otf'))]
                if len(candidates) != 1:
                    raise ValueError('字体压缩包内容不唯一，请明确选择原件')
                data = archive.read(candidates[0])
        elif source['source'].endswith('.7z'):
            # Windows 自带 bsdtar；只取固定成员到内存，不解压到工作区。
            data = subprocess.run(
                ['tar', '-xOf', str(CACHE / source['source']), source['member']],
                check=True, stdout=subprocess.PIPE,
            ).stdout
        with TTFont(io.BytesIO(data), recalcTimestamp=False) as font:
            rename(font, source['family'])
            options = subset.Options()
            # 数字签使用 tabular-nums；仿宋西文的等宽替换不能随竖排特性裁掉。
            options.layout_features = ['kern', 'liga', 'tnum']
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(text=''.join(chars))
            subsetter.subset(font)
            font.flavor = 'woff2'
            output = DEST / source['output']
            font.save(output)
        license_data = cached_download(source['license'], source['license_url'])
        (DEST / source['license']).write_bytes(license_data)
        print(f'{source["output"]}: {output.stat().st_size / 1048576:.2f} MB', flush=True)


if __name__ == '__main__':
    main()

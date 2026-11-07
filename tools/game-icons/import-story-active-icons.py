"""把剧情技能 / 装备特技图标换成客户端资源包里的原生 PNG。

## 源

    C:/games/MHXY-icons/ready/index.csv     group,name,id,file,width,height,resourceMd5,sourceFile
    C:/games/MHXY-icons/ready/<group>/<中文名>.png

`ready/` 由 `C:/games/MHXY-icons/prepare-future-icons.py` 生成：以项目里已命名的
截图图标为参考，对 `extract.py` 解出的 42,664 张客户端 PNG 做 40×40 中心 RGB 的
MSE 匹配，逐格复核后按中文名归档。剧情 11 项 MSE 69–113，特技 69 项 MSE 78–2700，
**80/80 命中、0 未匹配**。

## 为什么换

`story/` `active/` 原先是 `slice.py` 从游戏面板截图切的 96×96：格子里那枚图本体是
游戏把 40×40 源放大渲染的结果，切下来再缩到 96 是二道手，过 webp q92 又损一次。
换来源与第 139 批（师门，锐度 +71%）、第 142 批（生活技能，23px 下 +31%）同理。

## 清单

`icons.json` 是三组共用的多源清单，`generated-by` 保持 `slice.py` 不动，另在
`imports` 里记 `story` / `active` 两组各被谁覆写过；每条加 `source: client40`。
**id / name / 顺序是 `slice.py` 的产物，一个都不改**——按名字连，不按序号。

**先 `slice.py`，再跑 `import-skill-icons.py` 和本脚本**：前者整份重写清单，会把
图和 `source` 一起打回截图那版。两个导入脚本各写各的 `imports` 键，互不覆盖。

## 重跑

    python tools/game-icons/import-story-active-icons.py
    python tools/game-icons/import-story-active-icons.py --check       # 只报告，不写盘
    python tools/game-icons/import-story-active-icons.py --src D:/x   # 换素材目录
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path(r'C:\games\MHXY-icons\ready')
MANIFEST = ROOT / 'public/game/data/icons.json'

SIZE = 96
QUALITY = 92
GROUPS = ('story', 'active')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default=str(DEFAULT_SRC))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    src = Path(args.src)

    if not MANIFEST.exists():
        raise SystemExit('找不到 {}——先跑 python tools/game-icons/slice.py'.format(MANIFEST))
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    source_csv = src / 'index.csv'
    if not source_csv.exists():
        raise SystemExit('找不到 {}——用 --src 指向 ready/ 目录'.format(source_csv))

    rows = list(csv.DictReader(open(source_csv, encoding='utf-8-sig')))
    by_group = defaultdict(dict)
    for row in rows:
        group = row['group']
        if group not in GROUPS:
            continue
        name = row['name']
        if name in by_group[group]:
            raise SystemExit('源清单里「{}/{}」出现了两次'.format(group, name))
        by_group[group][name] = row

    total = 0
    for group in GROUPS:
        entries = manifest['groups'][group]
        have = by_group[group]
        want = {entry['name'] for entry in entries}
        # 名字双向比对：少一条就没图，多一条就是技能表改了没同步
        if want - set(have):
            raise SystemExit('{} 我方清单有、源里没有：{}'.format(group, '、'.join(sorted(want - set(have)))))
        if set(have) - want:
            raise SystemExit('{} 源里有、我方清单没有：{}'.format(group, '、'.join(sorted(set(have) - want))))
        if len(entries) != len(have):
            raise SystemExit('{} 条数对不上：清单 {} 条、源 {} 条'.format(group, len(entries), len(have)))

        out_dir = ROOT / 'public/game/icons' / group
        if not args.check:
            out_dir.mkdir(parents=True, exist_ok=True)

        sizes: dict[tuple[int, int], int] = {}
        for entry in entries:
            row = have[entry['name']]
            png = src / row['file']
            if not png.exists():
                raise SystemExit('缺文件：{}（{}/{}）'.format(png, group, entry['name']))
            with Image.open(png) as im:
                size = im.size
                sizes[size] = sizes.get(size, 0) + 1
                # 源是 RGBA，alpha 几乎全 255（自带底板）。保留 alpha，不转成 RGB，
                # 免得把少数边缘像素的半透明信息丢掉、也不填任何背景色。
                image = im.convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
            if not args.check:
                image.save(out_dir / (entry['id'] + '.webp'), 'WEBP', quality=QUALITY, method=6)
            entry['source'] = 'client{}'.format(max(size))
            total += 1

        imports = manifest.setdefault('imports', {})
        imports[group] = 'tools/game-icons/import-story-active-icons.py'
        dist = '、'.join('{}×{} {} 张'.format(w, h, n) for (w, h), n in sorted(sizes.items()))
        print('{} {} 张 → {}×{} webp q{}；源尺寸 {}'.format(
            group, len(entries), SIZE, SIZE, QUALITY, dist))

    if not args.check:
        with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(manifest, ensure_ascii=False, indent=4) + '\n')
        bytes_total = sum(
            (ROOT / 'public/game/icons' / g / (e['id'] + '.webp')).stat().st_size
            for g in GROUPS for e in manifest['groups'][g])
        print('共 {} 张，写入 {} 与清单，合计 {:.0f}KB'.format(
            total, '、'.join('public/game/icons/' + g for g in GROUPS), bytes_total / 1024))
    else:
        print('（--check，未写文件）')
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""把门派技能图标换成**客户端资源包里的原生 PNG**，不再从师门面板截图切。

## 为什么换

`school/` 那 147 张原先是 `slice-school.py` 从师门面板截图切的。面板里那一格图标
本体只有 **60×59**，缩到 96 是**上采样**；而那 60×59 本身又是游戏把 40×40 的源
放大渲染进格子的结果——等于中间已经插值过一次。最后再过一遍 webp q92 有损。
三层叠起来的结果是「像素 96，信息 40×40」，界面上明显比 `gear/` `weapon/`
（客户端 120 大图）软一档。

换来源之后是**原生像素直出**：源 PNG 未重采样、无损、图案与游戏里一致。
实测（2026-11-07，147 对，按 48px 真实显示管线比）：

| 指标                        | 截图切（旧） | 客户端原图（新） |
| --------------------------- | ------------ | ---------------- |
| 48px 显示下的拉普拉斯方差中位 | 2416         | **4123（+71%）** |
| 新图更锐的项数               | —            | **146 / 147**    |

（新图那一栏是**存成 webp q92 之后**重新量的；直接拿源 PNG 算是 4237，多出来的那点被有损吃掉了。）

唯一变差的是「弥勒山 / 慈悲为怀」（源 30×30，1282 → 1204，降 6%）。

## 源

    <src>/index.csv     school, skill, order, file, width, height, resourceMd5, sourceFile
    <src>/png/<门派>/<技能名>.png

`index.csv` 的 `skill` 列与 `public/game/data/school-icons.json` 的 `name` 一一对应
（两边都源自同一份技能名表）。**按名字连，不按序号**——两边的顺序本来就不同：
图标编号是师门面板里的上下顺序，对方的 CSV 是技能表的顺序（大唐的「十方无敌」
我方是 `-1`、对方是第 5 行）。

## 归一

源图 40×40（8 张 30×30），统一 **LANCZOS 缩到 96×96** 存 webp q92。为什么不留原尺寸：
界面按 48px 显示，2 倍屏要 80px，40 不够；而同目录同尺寸是 `README.md` 里写死的规矩
（一排图标里混着 88 和 96，基线就对不齐）。

**不裁边、不补底**：这批图标自带红棕卡片底（游戏里就长这样），裁边会把底板裁掉半圈。

## 清单

只回填 `source` 与 `generated-by`，**不动 `id` / `name` / `school` / 顺序**——
那四样是 `slice-school.py` 的产物，是名字真源。`source` 记源图边长
（`client40` / `client30`），混用状态写在数据里而不是文档里。

**先 `slice-school.py` 再跑本脚本**：前者会整份重写清单，单独跑它等于把图和清单
一起打回截图那版。

## 重跑

    python tools/game-icons/import-school-icons.py
    python tools/game-icons/import-school-icons.py --check          # 只报告，不写盘
    python tools/game-icons/import-school-icons.py --src D:/x      # 换素材目录
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path(r'C:\games\MHXY-icons\school-skills')

SIZE = 96           # 输出边长，与 skill/ story/ active/ 一致
QUALITY = 92


def load_manifest() -> dict:
    path = ROOT / 'public/game/data/school-icons.json'
    if not path.exists():
        raise SystemExit('找不到 {}——先跑 python tools/game-icons/slice-school.py'.format(path))
    return json.loads(path.read_text(encoding='utf-8'))


def load_source(src: Path) -> list[dict]:
    path = src / 'index.csv'
    if not path.exists():
        raise SystemExit('找不到 {}——用 --src 指向提取产物目录'.format(path))
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
    if not rows:
        raise SystemExit('{} 是空的'.format(path))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default=str(DEFAULT_SRC))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    src = Path(args.src)
    manifest = load_manifest()
    entries = manifest['groups']['skill']
    rows = load_source(src)

    # ---- 名字集合双向比对：少一条就没图，多一条就是名字表改了没同步 ----
    by_name = {}
    for row in rows:
        if row['skill'] in by_name:
            raise SystemExit('源清单里「{}」出现了两次（{} / {}）'
                             .format(row['skill'], by_name[row['skill']]['file'], row['file']))
        by_name[row['skill']] = row

    want = {entry['name'] for entry in entries}
    have = set(by_name)
    if want - have:
        raise SystemExit('我方清单有、源里没有：' + '、'.join(sorted(want - have)))
    if have - want:
        raise SystemExit('源里有、我方清单没有（技能表改了？）：' + '、'.join(sorted(have - want)))
    if len(entries) != len(rows):
        raise SystemExit('条数对不上：清单 {} 条、源 {} 条'.format(len(entries), len(rows)))

    # ---- 逐张归一 ----
    out_dir = ROOT / 'public/game/icons/school'
    if not args.check:
        out_dir.mkdir(parents=True, exist_ok=True)

    sizes: dict[tuple[int, int], int] = {}
    written = 0
    for entry in entries:
        row = by_name[entry['name']]
        png = src / row['file']
        if not png.exists():
            raise SystemExit('缺文件：{}（{}）'.format(png, entry['name']))
        im = Image.open(png)
        sizes[im.size] = sizes.get(im.size, 0) + 1
        if not args.check:
            # 带底、不透明：直接整块缩，不裁边也不垫色。
            im.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(
                out_dir / (entry['id'] + '.webp'), 'WEBP', quality=QUALITY, method=6)
        entry['source'] = 'client{}'.format(max(im.size))
        written += 1

    manifest['generated-by'] = 'tools/game-icons/import-school-icons.py'
    if not args.check:
        with open(ROOT / 'public/game/data/school-icons.json', 'w',
                  encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(manifest, ensure_ascii=False, indent=4) + '\n')

    dist = '、'.join('{}×{} {} 张'.format(w, h, n) for (w, h), n in sorted(sizes.items()))
    print('门派技能 {} 张 → {}×{} webp q{}'.format(written, SIZE, SIZE, QUALITY))
    print('源尺寸分布：' + dist)
    if args.check:
        print('（--check，未写文件）')
    else:
        total = sum((out_dir / (e['id'] + '.webp')).stat().st_size for e in entries)
        print('写入 {}，合计 {:.0f}KB'.format(out_dir.relative_to(ROOT), total / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""把生活技能（辅助技能）图标换成**客户端资源包里的原生 PNG**，不再从技能面板截图切。

## 为什么换

`skill/` 那 21 张原先是 `slice.py` 从「生活技能」目录两页截的。面板里一格图标本体
本来就是游戏把 40×40 源放大渲染进 96 格子的结果，切下来再缩到 96 是二道手；最后
再过 webp q92 有损。三层叠起来就是「像素 96、信息 40×40」，同一个格子里比 `gear/`
`weapon/`（客户端 120 大图）软一档。

实测（2026-11-07，21 对，按 23px 真实显示管线——`IconTile` 的 `--shot` 默认 23）：

| 指标                          | 截图切（旧） | 客户端原图（新） |
| ----------------------------- | ------------ | ---------------- |
| 23px 显示下的拉普拉斯方差均值 | 8086         | **10509（+30%）** |
| 新图更锐的项数                | —            | **21 / 21**      |

## 为什么还是存 96×96（上采样），不像装备那样留原尺寸

40×40 直存的实测：23px 下 10139、46px（2 倍屏）下 4519；上采样到 96 再存是
23px 10509、46px 4064。**23px 反而高 3.6%**——96 那张的放大本身带了 LANCZOS 的
锐化，浏览器缩 96→23 时把那点高频留下了；而 46px 那档 40 原生高 10%。

两档都只差几个百分点，真正决定选 96 的是目录规矩：`public/game/icons/README.md`
写死「同一类目的图标必须同尺寸」，`story/` `active/` 与 `school/` 都是 96，
`skill/` 单独一半 40 一半 96 会让同一行图标基线对不齐。体积代价 21 张共 ~44KB。

## 源

    <src>/index.csv     order,skill,file,width,height,resourceMd5,sourceFile
    <src>/png/<技能名>.png

`index.csv` 的 `skill` 列与 `public/game/data/icons.json` 的 `groups.skill[].name`
一一对应。**按名字连，不按序号**——虽然这批两边顺序恰好一样（都源自同一份生活技能
面板），但序号是「图标编号」、CSV 是「整理顺序」，将来任一边插一项就会静默错位。

## 归一

源图 40×40，LANCZOS 到 96×96 存 webp q92。**不裁边、不补底**：客户端里这枚图标
本来就画在金色底板上，那是图案的一部分，不是可以剥掉的背景。

## 清单

只回填 `source`（`client40`）与顶层 `imports.skill`，**不动 `id` / `name` / 顺序**——
那三样是 `slice.py` 的产物，也是名字真源。`icons.json` 是三组共用的多源清单
（`story/` `active/` 仍从截图切），所以顶层 `generated-by` 保持 `slice.py` 不改，
另用 `imports` 记下哪一组被哪个脚本覆写过——改 `generated-by` 会把另外两组一起说谎。

**先 `slice.py` 再跑本脚本**：前者整份重写清单，会把图和 `source` 一起打回截图那版。

## 重跑

    python tools/game-icons/import-skill-icons.py
    python tools/game-icons/import-skill-icons.py --check          # 只报告，不写盘
    python tools/game-icons/import-skill-icons.py --src D:/x      # 换素材目录
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path(r'C:\games\MHXY-icons\auxiliary-skills')

SIZE = 96           # 输出边长，与 story/ active/ school/ 一致
QUALITY = 92
GROUP = 'skill'


def load_manifest() -> dict:
    path = ROOT / 'public/game/data/icons.json'
    if not path.exists():
        raise SystemExit('找不到 {}——先跑 python tools/game-icons/slice.py'.format(path))
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
    entries = manifest['groups'][GROUP]
    rows = load_source(src)

    # ---- 名字集合双向比对：少一条就没图，多一条就是技能表改了没同步 ----
    by_name = {}
    for row in rows:
        name = row['skill']
        if name in by_name:
            raise SystemExit('源清单里「{}」出现了两次（{} / {}）'
                             .format(name, by_name[name]['file'], row['file']))
        by_name[name] = row

    want = {entry['name'] for entry in entries}
    have = set(by_name)
    if want - have:
        raise SystemExit('我方清单有、源里没有：' + '、'.join(sorted(want - have)))
    if have - want:
        raise SystemExit('源里有、我方清单没有（技能表改了？）：' + '、'.join(sorted(have - want)))
    if len(entries) != len(rows):
        raise SystemExit('条数对不上：清单 {} 条、源 {} 条'.format(len(entries), len(rows)))

    # ---- 逐张归一 ----
    out_dir = ROOT / 'public/game/icons' / GROUP
    if not args.check:
        out_dir.mkdir(parents=True, exist_ok=True)

    sizes: dict[tuple[int, int], int] = {}
    written = 0
    for entry in entries:
        row = by_name[entry['name']]
        png = src / row['file']
        if not png.exists():
            # 提取侧偶尔把文件名里的斜杠写成别的分隔符，报出来才看得见
            raise SystemExit('缺文件：{}（{}）'.format(png, entry['name']))
        im = Image.open(png)
        sizes[im.size] = sizes.get(im.size, 0) + 1
        if not args.check:
            # 带底、不透明：直接整块缩，不裁边也不垫色。
            im.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(
                out_dir / (entry['id'] + '.webp'), 'WEBP', quality=QUALITY, method=6)
        entry['source'] = 'client{}'.format(max(im.size))
        written += 1

    imports = manifest.setdefault('imports', {})
    imports[GROUP] = 'tools/game-icons/import-skill-icons.py'
    if not args.check:
        with open(ROOT / 'public/game/data/icons.json', 'w',
                  encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(manifest, ensure_ascii=False, indent=4) + '\n')

    dist = '、'.join('{}×{} {} 张'.format(w, h, n) for (w, h), n in sorted(sizes.items()))
    print('生活技能 {} 张 → {}×{} webp q{}'.format(written, SIZE, SIZE, QUALITY))
    print('源尺寸分布：' + dist)
    if args.check:
        print('（--check，未写文件）')
    else:
        total = sum((out_dir / (e['id'] + '.webp')).stat().st_size for e in entries)
        print('写入 {}，合计 {:.0f}KB'.format(out_dir.relative_to(ROOT), total / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())

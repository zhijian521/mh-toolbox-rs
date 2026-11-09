"""从客户端资源里导入**大图**（`item120`），写 `public/game/icons/` 下的两组图。

目前两组：

| 组        | 目录              | 是什么                                  |
| --------- | ----------------- | --------------------------------------- |
| `lingshi` | `lingshi/`        | 灵饰 20 件（4 部位 × 60~140）           |
| `yupo`    | `yupo/`           | 玉魄 2 件（上古玉魄·阴 / ·阳，不分级）  |

## 为什么换来源

灵饰第一批是百科典藏列表截图切的（旧的 `slice-lingshi.py`）：一格 94×94，带游戏卡片底，
放大到 40px 显示时是一块米黄方片，四角还留着卷云暗纹。`public/game/icons/README.md`
当时就写过「要透明版就换素材来源，别在截图上抠」。现在客户端里有现成的透明大图，
所以这批改成直接导入，**截图那条路废弃**（脚本已删，坐标与拼页规则记在 `docs/RECORD.md`）。

玉魄本来就没有截图可切——它从来没进过百科典藏的列表，卡上那两格一直是「首字印」占位。
客户端里这两件有现成的 120 图，一并导进来。

## 取哪一张

同名物品在客户端里有两个尺寸：

| 目录           | 实际面积         | 用途                 |
| -------------- | ---------------- | -------------------- |
| `item50/*.tcp` | 38×48 ~ 50×50    | 游戏内背包小图标     |
| `item120/*.tcp`| 89×113 ~ 120×120 | 大图（本次用这一档） |

两个尺寸不是同一张图缩放出来的，是两套画稿——所以「大图」不能靠放大 `item50` 得到。

**唯一例外：`玄龙苍珀`（佩饰 140）没有 `item120`**。它的那条资源在本地客户端里缺失
（`game-icon-extract/output/missing-images.csv` 记着 21129 个本地找不到的图资源），
只能拿 `item50` 放大。脚本会把这件事打出来，清单里该条的 `source` 也写明 `item50`。

## 归一

原图尺寸不一（最长边 106~120），直接铺进格子会让「大件显大、小件显小」。统一按
**最长边缩到 108、居中放进 120×120 透明画布**：同尺寸、同视觉占比。透明底不垫任何颜色
——底色由用它的地方决定（`IconTile` 的块面）。

## 清单

灵饰写 `data/lingshi-icons.json`（20 条，按部位分组）。**玉魄不写清单**：只有两件、
名字固定，清单只会变成第二份真源——它由 `character-rules.json` 的部位图标直接引用。

## 重跑

    python tools/game-icons/import-client-icons.py            # 导入 + 写清单
    python tools/game-icons/import-client-icons.py --check    # 只报告，不写文件
    python tools/game-icons/import-client-icons.py --only yupo
    python tools/game-icons/import-client-icons.py --src D:/x # 换提取产物目录

`--src` 指向 `game-icon-extract` 那一层（要读到它的 `output/names.csv` 与 `output/*.png`）。
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path(r'E:\zhijian\mh-tool\.workbuddy\game-icon-extract')

# 四部位 × 60~140，共 20 件。到 140 就结束了：官网另列的 160 级四件这个客户端里没有。
LINGSHI = {
    'jiezhi': [(60, '枫华戒'), (80, '芙蓉戒'), (100, '金麟绕'), (120, '悦碧水'), (140, '九曜光华')],
    'ershi': [(60, '翠叶环'), (80, '明月珰'), (100, '玉蝶翩'), (120, '点星芒'), (140, '凤羽流苏')],
    'shouzhuo': [(60, '香木镯'), (80, '翡玉镯'), (100, '墨影扣'), (120, '花映月'), (140, '金水菩提')],
    'peishi': [(60, '芝兰佩'), (80, '逸云佩'), (100, '莲音玦'), (120, '相思染'), (140, '玄龙苍珀')],
}

LABEL = {'jiezhi': '戒指', 'ershi': '耳饰', 'shouzhuo': '手镯', 'peishi': '佩饰'}

# 玉魄两件：客户端名带「上古」前缀，装备格里写作「玉魄·阴 / ·阳」。
YUPO = [('yupo-yin', '上古玉魄·阴'), ('yupo-yang', '上古玉魄·阳')]

SIZE = 120          # 画布边长
INNER = 108         # 图形最长边
TRIM_ALPHA = 8      # 低于这个 alpha 算透明（清掉羽化边缘的 1px 毛刺）


def load_map(src: Path) -> dict[str, dict[int, str]]:
    """names.csv → {物品名: {尺寸: png 相对路径}}。"""
    path = src / 'output' / 'names.csv'
    if not path.exists():
        raise SystemExit('找不到 {}——先在 game-icon-extract 里跑一遍 name-output.cjs，'
                         '或用 --src 指到它的目录'.format(path))
    table: dict[str, dict[int, str]] = {}
    for row in csv.DictReader(open(path, encoding='utf-8-sig')):
        entry = table.setdefault(row['name'], {})
        entry[int(row['size'])] = row['png']
    return table


def normalize(im: Image.Image) -> Image.Image:
    """裁掉透明边 → 最长边缩到 INNER → 居中放进 SIZE 画布。"""
    im = im.convert('RGBA')
    box = im.getchannel('A').point(lambda v: 255 if v > TRIM_ALPHA else 0).getbbox()
    if box:
        im = im.crop(box)
    scale = INNER / max(im.size)
    if abs(scale - 1) > 0.01:
        im = im.resize((max(1, round(im.width * scale)),
                        max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return canvas


def pick(table, name: str, where: str):
    """取一件物品的源图；没有大图就退到小图，并把它记下来。"""
    sizes = table.get(name, {})
    if 120 in sizes:
        return 'item120', sizes[120]
    if 50 in sizes:
        return 'item50', sizes[50]
    raise SystemExit('{} 在 names.csv 里一条都没有（{}）——映射表变了，重跑前先核对'
                     .format(name, where))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default=str(DEFAULT_SRC))
    parser.add_argument('--only', choices=['lingshi', 'yupo'])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    src = Path(args.src)
    table = load_map(src)
    groups = [args.only] if args.only else ['lingshi', 'yupo']
    total = 0
    fallback: list[str] = []

    for group in groups:
        out_dir = ROOT / 'public/game/icons' / group
        if not args.check:
            out_dir.mkdir(parents=True, exist_ok=True)

        if group == 'yupo':
            for fid, name in YUPO:
                source, png = pick(table, name, '玉魄')
                if source != 'item120':
                    fallback.append(name)
                if not args.check:
                    normalize(Image.open(src / 'output' / png)).save(
                        out_dir / (fid + '.webp'), 'WEBP', quality=92, method=6)
                total += 1
            print('玉魄  {:2d} 件  {}'.format(len(YUPO), '、'.join(n for _, n in YUPO)))
            continue

        manifest: dict = {'generated-by': 'tools/game-icons/import-client-icons.py',
                          'groups': {}}
        for key, items in LINGSHI.items():
            entries = []
            for level, name in items:
                source, png = pick(table, name, '{} {}'.format(LABEL[key], level))
                if source != 'item120':
                    fallback.append(name)
                fid = 'ling-{}-{:03d}'.format(key, level)
                if not args.check:
                    normalize(Image.open(src / 'output' / png)).save(
                        out_dir / (fid + '.webp'), 'WEBP', quality=92, method=6)
                entries.append({'id': fid, 'img': fid + '.webp', 'name': name,
                                'level': level, 'source': source})
                total += 1
            manifest['groups'][key] = entries
            print('{:5s} {:2d} 件  {} … {}'.format(
                LABEL[key], len(entries), entries[0]['name'], entries[-1]['name']))

        if not args.check:
            with open(ROOT / 'public/game/data/lingshi-icons.json', 'w',
                      encoding='utf-8', newline='\n') as fh:
                fh.write(json.dumps(manifest, ensure_ascii=False, indent=4) + '\n')

    if fallback:
        print('用 item50 放大（客户端缺 item120）：' + '、'.join(fallback))
    print('合计', total, '件' + '（check，未写文件）' if args.check else '')
    return 0


if __name__ == '__main__':
    sys.exit(main())

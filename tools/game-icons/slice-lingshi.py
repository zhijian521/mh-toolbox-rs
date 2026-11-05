"""从「百科典藏 → 灵饰」列表截图切出灵饰图标。

## 这批为什么只有 20 件

灵饰面板按「种类 → 等级」排列，四个部位 × 60/80/100/120/140，共 20 件，
列表到 140 级就结束了（截图最后一行第三格是空的）。官网介绍页另列了 160 级那四件
（太虚渺云 / 焰云霞珠 / 浮雪幻音 / 碧海青天），但这个客户端里**没有**，所以不收——
不要凭官网表补齐，补出来的图只能是自己画的。

## 两张截图的关系

第二张是第一张**往下滚了三格**：页 2 的最后一行（凤羽流苏 / 香木镯 / 翡玉镯）
就是页 1 的第一行。用官方图标双向比对确认过，两边各自唯一命中同一件。
所以一遍就能拼出完整序列，不需要去重。

## 取景

与 `slice-gear.py` / `slice-weapon.py` **完全同规格**：卡片 94×94、每边内缩 2、
裁 90×90 缩到 96×96。卡片四角的卷云暗纹要靠四个格子拼成完整图案，内缩多一点就缺一瓣。

## 重跑

    python tools/game-icons/slice-lingshi.py          # 切图 + 写清单
    python tools/game-icons/slice-lingshi.py --check  # 只打印数量
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(r'C:\Users\pc\.workbuddy\clipboard-images')

# 两张截图：页 1 = 列表下半（手镯后半 + 佩饰），页 2 = 列表上半（戒指 + 耳饰 + 手镯前两件）。
# `tops` 是**每页各自**的格顶：两张图的滚动位置差 8px，套同一个值会让页 2 的图顶部带一条格子缝。
PAGES = [
    {'file': 'clipboard-2026-11-05T01-04-40-012Z-cbfc1e54.png', 'tops': [498, 608, 718, 828]},
    {'file': 'clipboard-2026-11-05T01-04-40-015Z-86208516.png', 'tops': [506, 616, 726, 836]},
]

# 卡片矩形：三列的 x 范围（各 94 宽，由竖向间隙量出）；行距 110、卡高 94
COLS = [(156, 249), (280, 373), (404, 497)]
CELL, INSET = 94, 2

# 官方 xyq.163.com 灵饰介绍页（2014/11/6/5015_474275）的名称表，顺序即列表顺序
NAMES = {
    'jiezhi': [(60, '枫华戒'), (80, '芙蓉戒'), (100, '金麟绕'), (120, '悦碧水'), (140, '九曜光华')],
    'ershi': [(60, '翠叶环'), (80, '明月珰'), (100, '玉蝶翩'), (120, '点星芒'), (140, '凤羽流苏')],
    'shouzhuo': [(60, '香木镯'), (80, '翡玉镯'), (100, '墨影扣'), (120, '花映月'), (140, '金水菩提')],
    'peishi': [(60, '芝兰佩'), (80, '逸云佩'), (100, '莲音玦'), (120, '相思染'), (140, '玄龙苍珀')],
}

LABEL = {'jiezhi': '戒指', 'ershi': '耳饰', 'shouzhuo': '手镯', 'peishi': '佩饰'}

# 截图格子 → 灵饰。页内按阅读顺序排，序号 0 基：(页, 行, 列)
CELLS = {
    'jiezhi': [(2, 0, 0), (2, 0, 1), (2, 0, 2), (2, 1, 0), (2, 1, 1)],
    'ershi': [(2, 1, 2), (2, 2, 0), (2, 2, 1), (2, 2, 2), (2, 3, 0)],
    'shouzhuo': [(2, 3, 1), (2, 3, 2), (1, 1, 0), (1, 1, 1), (1, 1, 2)],
    'peishi': [(1, 2, 0), (1, 2, 1), (1, 2, 2), (1, 3, 0), (1, 3, 1)],
}

CARD = np.array([240, 212, 176])


def has_band(im):
    """顶边或底边是不是一条「格子之间的缝」——列表最底那一行会这样，拼图时是横贯亮带。"""
    d = np.abs(np.asarray(im.convert('RGB')).astype(int) - CARD).sum(axis=2)
    for seg in (d[0], d[1], d[-2], d[-1]):
        if ((seg >= 8) & (seg <= 55)).mean() > 0.85 and float(seg.std()) < 26:
            return True
    return False


def cut(im, a, tops, row, col):
    """切一格并缩到 96×96；空格返回 None。"""
    x0, x1 = COLS[col]
    y0 = tops[row]
    blk = a[y0:y0 + CELL, x0:x1 + 1]
    if (np.abs(blk - CARD).sum(axis=2) <= 45).mean() > 0.9:      # 空格
        return None
    img = im.crop((x0 + INSET, y0 + INSET, x1 - INSET + 1, y0 + CELL - INSET)) \
            .resize((96, 96), Image.LANCZOS)
    return None if has_band(img) else img


def main() -> int:
    check = '--check' in sys.argv
    shots = []
    for page in PAGES:
        path = SRC / page['file']
        if not path.exists():
            raise SystemExit('找不到截图：{}'.format(path))
        im = Image.open(path).convert('RGB')
        shots.append((im, np.asarray(im).astype(int), page['tops']))

    out_dir = ROOT / 'public/game/icons/lingshi'
    manifest = {'generated-by': 'tools/game-icons/slice-lingshi.py', 'groups': {}}
    total = 0

    if not check:
        # 整目录改名备份再重建：逐文件 unlink 在本机被 safe-delete 拦，会中途断掉
        if out_dir.is_dir():
            bak = ROOT / '.runtime' / 'lingshi-bak'
            bak.mkdir(parents=True, exist_ok=True)
            for old in out_dir.glob('*.webp'):
                old.replace(bak / old.name)
        out_dir.mkdir(parents=True, exist_ok=True)

    for key, items in NAMES.items():
        entries = []
        for (level, name), (page, row, col) in zip(items, CELLS[key]):
            im, a, tops = shots[page - 1]
            img = cut(im, a, tops, row, col)
            if img is None:
                raise SystemExit('{} {} 那一格是空的或带了格子缝（页{} 行{} 列{}）——'
                                 '截图或坐标变了，重跑前先核对'.format(LABEL[key], level, page, row, col))
            fid = 'ling-{}-{:03d}'.format(key, level)
            if not check:
                # 有损 92、不带 alpha：这批图标本来就带卡片底
                img.save(out_dir / (fid + '.webp'), 'WEBP', quality=92, method=6)
            entries.append({'id': fid, 'img': fid + '.webp', 'name': name, 'level': level})
            total += 1
        manifest['groups'][key] = entries
        print('{:5s} {:2d} 件  {} … {}'.format(
            LABEL[key], len(entries), entries[0]['name'], entries[-1]['name']))

    if not check:
        with open(ROOT / 'public/game/data/lingshi-icons.json', 'w',
                  encoding='utf-8', newline='\n') as fh:
            fh.write(json.dumps(manifest, ensure_ascii=False, indent=4) + '\n')
    print('合计', total, '件' + ('（check，未写文件）' if check else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

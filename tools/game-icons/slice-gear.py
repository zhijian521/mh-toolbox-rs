"""从游戏「百科典藏 → 装备」面板截图里裁出各部位装备图标。

面板形态与技能页不同：3 列 × 4 行的方格（技能页是 4×3 的「图标 + 名字」卡片），
格子本身没有名字，只有图。所以这里只做「按格子裁图」，不解析名字。

用法：
    python tools/game-icons/slice-gear.py            # 写文件 + 清单
    python tools/game-icons/slice-gear.py --check    # 只打印每页裁出几个

几条实测结论（别重新发现）：

1. **只裁切、不抠底**（2026-11-04 用户定）。装备图标本身就画在米黄卡片上，
   图形与卡片底同色系（白衣 (240,240,235) 与卡片底 (243,222,192) 只差 64），
   任何色键都会把浅色装备挖空——试过 flood fill + 腐蚀，女衣/项链那几页必出空洞。
   深色背景下看着像「一圈黄边」，那其实是游戏原图的卡片底，不是裁歪了。

2. **列是固定的**，三列 x 落在 156-249 / 280-373 / 404-497（1304×1086 截图）。
   行不固定——列表可以滚动，每页的第一行位置都不一样，所以行带靠投影检测。

3. **滚动后上下会露出半行**：页 7（项链第二张）顶部有一行被下拉框盖住、底部有一行
   被面板底边裁掉，两行高度只有 44 / 42（完整行 94）。裁出来是半截图，**必须丢掉**，
   判据就是「行带高度 < 70」。

4. **滚动页与上一页有重叠**：页 7 的第 3~5 行就是页 6 的第 1~3 行（像素完全一致，
   MAE = 0.0）。所以每个部位用 `rows` 显式声明「取哪几行」，而不是全裁了再去重——
   去重是兜底，不是主手段。

5. **被面板底边裁掉的整行不要用**：页 8 的第 4 行只有 82 高（正常 94），裁出的图标
   底部缺一块；同一行在页 9 里是完整的。所以那一行从页 9 取（见 PAGES 里的 rows=[2,3]）。

6. **这批截图只覆盖 60 级以上**，所以每个部位的数量与官网「60 级及以上」的条目数一一对应：
   头盔/发钗/铠甲/女衣/鞋子各 11 件（60~160 每 10 级一件），腰带与饰品各 14 件
   （60/70/80 各有两款）。数量吻合 = 序号可以直接当名称表下标用，`NAMES` 就是这么定的。
   **序号即等级升序**，已用图像比对验证（见 `NAMES` 上方注释）。
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CROP = 96  # 与 icons/ 其余图标一致：界面最多按 48px 显示，2 倍屏够用
CARD = np.array([248, 228, 184])  # 格子底的取样色（暖黄），用来判空格与行带
COLS = [(156, 249), (280, 373), (404, 497)]
INSET = 2  # 格子边框是深褐色，裁进来会是一道深色描边，每边去掉 2px
MIN_ROW_H = 70  # 低于它就是被盖住/裁掉的半行

# 每页一张图。顺序 = 部位内的图标顺序（行优先）。rows 是「过滤掉半行之后」的下标。
PAGES = [
    {'key': 'toukui', 'file': 'clipboard-2026-11-04T07-40-24-238Z-b60a101d.png', 'rows': [0, 1, 2, 3]},
    {'key': 'fachai', 'file': 'clipboard-2026-11-04T07-40-24-240Z-326473e6.png', 'rows': [0, 1, 2, 3]},
    {'key': 'kaijia', 'file': 'clipboard-2026-11-04T07-40-24-243Z-23d761c7.png', 'rows': [0, 1, 2, 3]},
    {'key': 'nvyi', 'file': 'clipboard-2026-11-04T07-40-24-246Z-3a269a3f.png', 'rows': [0, 1, 2, 3]},
    {'key': 'xiezi', 'file': 'clipboard-2026-11-04T07-40-24-248Z-9536ac2a.png', 'rows': [0, 1, 2, 3]},
    # 项链：第二张只取顶部那一行（页 6 没有的、更低等级的 3 件），其余三行与页 6 重叠
    {'key': 'xianglian', 'file': 'clipboard-2026-11-04T07-40-24-253Z-d4940a0f.png', 'rows': [0]},
    {'key': 'xianglian', 'file': 'clipboard-2026-11-04T07-40-24-250Z-99eae7f2.png', 'rows': [0, 1, 2, 3]},
    # 腰带：前一张取前 3 行，第 4 行在下一张里是完整的
    {'key': 'yaodai', 'file': 'clipboard-2026-11-04T07-40-24-255Z-2ce09ab0.png', 'rows': [0, 1, 2]},
    {'key': 'yaodai', 'file': 'clipboard-2026-11-04T07-40-24-258Z-95ef637e.png', 'rows': [2, 3]},
]

# 60 级以上各部位的装备名（按等级升序），抄自官网 xyq.163.com 防具五页：
# 头盔 dj005.html、铠甲/女衣 dj005_2.html、靴子 dj005_3.html、腰带 dj005_4.html、
# 饰品 dj005_5.html。**只收 60 级以上**——正是用户截图的那一段。
#
# 顺序即序号：第 1 项是 60 级，最后一项是 160 级。这条已用图像比对验证过
# （2026-11-04：把 83 张截图与官网 131 张图标逐个比对，头盔 1~10 连续命中
# 60/70/80/90/100/110/120/130/140/150，首尾两端目视复核 60=水晶帽、160=浑天玄火盔）。
#
# 饰品与腰带在 60/70/80 各有两个同名等级的款式，所以这两组是 14 项而不是 11 项。
NAMES = {
    'toukui': [
        ('水晶帽', 60), ('乾坤帽', 70), ('黑魔冠', 80), ('白玉龙冠', 90),
        ('水晶夔帽', 100), ('翡翠曜冠', 110), ('金丝黑玉冠', 120), ('白玉琉璃冠', 130),
        ('兽鬼珐琅面', 140), ('紫金磐龙冠', 150), ('浑天玄火盔', 160),
    ],
    'fachai': [
        ('玉女发冠', 60), ('魔女发冠', 70), ('七彩花环', 80), ('凤翅金翎', 90),
        ('寒雉霜蚕', 100), ('曜月嵌星', 110), ('郁金流苏簪', 120), ('玉翼附蝉翎', 130),
        ('鸾羽九凤冠', 140), ('金珰紫焰冠', 150), ('乾元鸣凤冕', 160),
    ],
    'kaijia': [
        ('夜魔披风', 60), ('龙骨甲', 70), ('死亡斗篷', 80), ('神谕披风', 90),
        ('珊瑚玉衣', 100), ('金蚕披风', 110), ('乾坤护心甲', 120), ('蝉翼金丝甲', 130),
        ('金丝鱼鳞甲', 140), ('紫金磐龙甲', 150), ('混元一气甲', 160),
    ],
    'nvyi': [
        ('霓裳羽衣', 60), ('流云素裙', 70), ('七宝天衣', 80), ('飞天羽衣', 90),
        ('穰花翠裙', 100), ('金蚕丝裙', 110), ('紫香金乌裙', 120), ('碧霞彩云衣', 130),
        ('金丝蝉翼衫', 140), ('五彩凤翅衣', 150), ('鎏金浣月衣', 160),
    ],
    'xiezi': [
        ('追星踏月', 60), ('九州履', 70), ('万里追云履', 80), ('踏雪无痕', 90),
        ('平步青云', 100), ('追云逐电', 110), ('乾坤天罡履', 120), ('七星逐月靴', 130),
        ('碧霞流云履', 140), ('金丝逐日履', 150), ('辟尘分光履', 160),
    ],
    'yaodai': [
        ('攫魂铃', 60), ('双魂引', 60), ('兽王腰带', 70), ('百窜云', 70),
        ('八卦锻带', 80), ('圣王坠', 80), ('幻彩玉带', 90), ('珠翠玉环', 100),
        ('金蟾含珠', 110), ('乾坤紫玉带', 120), ('琉璃寒玉带', 130), ('蝉翼鱼佩带', 140),
        ('磐龙凤翔带', 150), ('紫霄云芒带', 160),
    ],
    'xianglian': [
        ('风月宝链', 60), ('八卦坠', 60), ('碧水青龙', 70), ('鬼牙攫魂', 70),
        ('万里卷云', 80), ('疾风之铃', 80), ('七彩玲珑', 90), ('黄玉琉佩', 100),
        ('鸾飞凤舞', 110), ('衔珠金凤佩', 120), ('七璜珠玉佩', 130), ('鎏金点翠佩', 140),
        ('紫金碧玺佩', 150), ('落霞陨星坠', 160),
    ],
}

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(os.environ.get('GAME_SHOT_DIR', r'C:\Users\pc\.workbuddy\clipboard-images'))


def find_rows(content, y_lo=460, y_hi=945):
    """行方向找「有内容的带」，合并间隔 ≤ 6 的相邻段，丢掉矮于 MIN_ROW_H 的半行。

    **必须先把 y 限死在列表区**：整张图里带内容的横带还有窗口标题栏（0-247）、
    下拉框那一行（280-395）和面板底部装饰（950 以后）。不限定范围时它们会排在
    列表行前面，rows=[0,1,2,3] 就整体错位 2 行——裁出来的是下拉框和标题栏，
    而且数量刚好也够，不报错。
    """
    sub = content[y_lo:y_hi, COLS[0][0]:COLS[-1][1]]
    proj = sub.sum(axis=1)
    raw, start = [], None
    for i, v in enumerate(proj):
        if v >= 20 and start is None:
            start = i
        elif v < 20 and start is not None:
            raw.append([start, i - 1])
            start = None
    if start is not None:
        raw.append([start, len(proj) - 1])
    merged = []
    for b in raw:
        if merged and b[0] - merged[-1][1] <= 6:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    return [
        (b[0] + y_lo, b[1] + y_lo) for b in merged if b[1] - b[0] + 1 >= MIN_ROW_H
    ]


def cut_cell(im, x0, x1, y0, y1):
    """裁一格；整格都是卡片底（列表末行的空格）返回 None。"""
    box = (x0 + INSET, y0 + INSET, x1 - INSET + 1, y1 - INSET + 1)
    tile = np.asarray(im.crop(box)).astype(int)
    near_bg = np.abs(tile - CARD).sum(axis=2) < 60
    if near_bg.mean() > 0.95:
        return None
    return im.crop(box).resize((CROP, CROP), Image.LANCZOS)


def hash_of(img, side=24):
    """缩略灰度，用来判重。同一图标在两页里像素完全一致（MAE 实测 0.0），
    不同图标的最近距离也有 17 以上——阈值 8 落在中间，两端都不沾。"""
    return np.asarray(img.convert('L').resize((side, side), Image.LANCZOS)).astype(int)


def main():
    dry = '--check' in sys.argv
    groups, seen = {}, {}
    for page in PAGES:
        path = SRC / page['file']
        if not path.exists():
            raise SystemExit(f'找不到截图 {path}')
        im = Image.open(path).convert('RGB')
        content = np.abs(np.asarray(im).astype(int) - CARD).sum(axis=2) > 60
        bands = find_rows(content)
        want = page['rows']
        if max(want) >= len(bands):
            raise SystemExit(
                f'{page["file"]}: 检测到 {len(bands)} 行，但要取 {want}——截图或参数不对'
            )
        got = []
        for ri in want:
            y0, y1 = bands[ri]
            for (x0, x1) in COLS:
                img = cut_cell(im, x0, x1, y0, y1)
                if img is not None:
                    got.append(img)
        print(f'{page["key"]:10s} {page["file"][-16:-4]} 行 {want} → {len(got):2d} 个')
        if dry:
            continue
        bucket = groups.setdefault(page['key'], [])
        hashes = seen.setdefault(page['key'], [])
        for img in got:
            h = hash_of(img)
            dup = next((i for i, o in enumerate(hashes) if np.abs(o - h).mean() < 8), None)
            if dup is not None:
                print(f'           跳过重复（与第 {dup + 1} 个相同）')
                continue
            hashes.append(h)
            bucket.append(img)

    if dry:
        return

    out_dir = ROOT / 'public/game/icons/gear'
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {'generated-by': 'tools/game-icons/slice-gear.py', 'groups': {}}
    total = 0
    for key, imgs in groups.items():
        names = NAMES[key]
        # 数量对不上就直接退出：序号即名称表下标，少一个多一个都会整体错位，
        # 而错位不会让任何别的东西变红，只会表现为「装备图配了别人的名字」。
        if len(imgs) != len(names):
            raise SystemExit(
                f'{key}: 裁出 {len(imgs)} 个图标，名称表有 {len(names)} 项——对不上，先核截图'
            )
        entries = []
        for i, img in enumerate(imgs):
            fid = f'gear-{key}-{i + 1:02d}'
            name, level = names[i]
            # 有损 92、不带 alpha：这批图标本来就带卡片底，不需要透明通道
            img.save(out_dir / f'{fid}.webp', 'WEBP', quality=92, method=6)
            entries.append(
                {'id': fid, 'img': f'{fid}.webp', 'name': name, 'level': level}
            )
        manifest['groups'][key] = entries
        total += len(entries)
        lv = '/'.join(str(e['level']) for e in entries)
        print(f'{key:10s} {len(entries):2d} 个  等级 {lv}')
    (ROOT / 'public/game/data').mkdir(parents=True, exist_ok=True)
    # 4 空格缩进对齐 Prettier：`npm run check` 会 check 这份 json
    (ROOT / 'public/game/data/gear-icons.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=4) + '\n', encoding='utf-8'
    )
    print(f'\n裁出 {total} 个图标 → public/game/icons/gear/')
    print('清单 → public/game/data/gear-icons.json')


if __name__ == '__main__':
    main()

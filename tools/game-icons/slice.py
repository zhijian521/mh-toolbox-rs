"""从游戏截图里切出技能 / 特技图标。

游戏面板是 4 列 × 3 行的卡片网格，每格「图标在左、名字在右」。这个脚本只切图标方块，
裁成统一边长输出 webp，并生成 `icons.json` 记录「文件 → 中文名」。

用法：
    python tools/game-icons/slice.py <输出目录>

为什么不用固定坐标：同一界面的三张目录（生活技能 / 剧情技能 / 特技特效）行距不同
（生活 134、特技 136），且末行常常只有 1 项。所以先检测、再按间距外推补空行，
外推出的位置上没有图标就跳过——顺序仍然是「行优先、从左到右」。

为什么要外推：末行只有 1 项时，「深色像素带」形成不了完整的高峰，检测不到那一行；
但那一项确实存在（生活技能第二页的「雪之感应」、特技第六页的「神机之护」）。
不补就会少切一个，而且是**默默少切**——数量对不上才发现。
"""

import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CROP = 96  # 输出边长。界面最多按 40px 显示，2 倍屏也够；再大只是浪费体积
CARD_SUM = 230 + 196 + 155  # 卡片底 RGB 之和，用来把图标与底色分开

# 每页一张图。顺序 = 阅读顺序，与 src/views/characters 里的名字表一致。
PAGES = {
    'skill': [
        ('clipboard-2026-11-02T07-15-56-210Z-2d67f6e8.png', 12),
        ('clipboard-2026-11-02T07-15-56-212Z-d8e4a6db.png', 9),
    ],
    'story': [
        ('clipboard-2026-11-02T07-21-02-151Z-b9526187.png', 11),
    ],
    'active': [
        ('clipboard-2026-11-02T07-25-16-958Z-e0d3b93e.png', 12),
        ('clipboard-2026-11-02T07-25-16-960Z-e32fff97.png', 12),
        ('clipboard-2026-11-02T07-25-16-962Z-45304fd3.png', 12),
        ('clipboard-2026-11-02T07-25-16-964Z-898712cb.png', 12),
        ('clipboard-2026-11-02T07-25-16-966Z-5ae1500a.png', 12),
        ('clipboard-2026-11-02T07-25-16-969Z-5cc9929f.png', 9),
    ],
}

ROOT = Path(__file__).resolve().parents[2]
# 截图从哪儿读。默认是本机剪贴板目录（图的来路），换机器时用 --src 指定，
# 或者把图放好之后直接改这一行。截图本身不入库——它们是「一次性的原料」。
SRC = Path(os.environ.get('GAME_SHOT_DIR', r'C:\Users\pc\.workbuddy\clipboard-images'))


def find_bands(proj, thr, minw=18, gap=8):
    raw, start = [], None
    for i, v in enumerate(proj):
        if v >= thr and start is None:
            start = i
        elif v < thr and start is not None:
            raw.append((start, i - 1))
            start = None
    if start is not None:
        raw.append((start, len(proj) - 1))
    merged = []
    for b in raw:
        if merged and b[0] - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    return [b for b in merged if b[1] - b[0] >= minw]


def centers_with_expand(bands, count, fallback_spacing):
    """把检测到的带转成 count 个中心点。带不足时按间距外推。

    间距取**最小相邻差**而不是首尾平均：某一列因为图标偏亮没检出时，首尾平均会把
    间距算成两倍（缺 1 个就变成 2 倍），外推出的位置全部错位。取最小值等于「相邻两格
    的真实间距」，缺谁都不影响。
    """
    cs = [(b[0] + b[1]) // 2 for b in bands]
    if not cs:
        return []
    gaps = [b - a for a, b in zip(cs, cs[1:])]
    spacing = min(gaps) if gaps else fallback_spacing
    first = cs[0]
    return [int(round(first + i * spacing)) for i in range(count)]


def icon_box(a, cx, cy, radius=58):
    """在估计点附近找图标方块的主体外框，返回 (x0, y0, x1, y1)。

    用投影找「主体」而不是直接取包围盒：游戏会给选中项画一圈金色高亮框，
    它紧贴在图标外围、中间只隔 2-3px 的卡片底。包围盒会把这圈框一起框进去，
    裁出来就带着一道金边。投影后金框只是一段 4px 宽的窄峰，按宽度筛掉即可。
    """
    h, w = a.shape[:2]
    x0, x1 = max(0, cx - radius), min(w, cx + radius)
    y0, y1 = max(0, cy - radius), min(h, cy + radius)
    blk = a[y0:y1, x0:x1].astype(int)
    R, G, B = blk[:, :, 0], blk[:, :, 1], blk[:, :, 2]
    mask = (blk.sum(axis=2) - CARD_SUM) < -90
    # 把选中框（亮金黄）从掩膜里剔掉，而不是靠投影阈值分开。
    # 实测：金框与图标之间的间隙投影值是 4-6（有阴影），任何「>6 才算内容」的阈值
    # 都断不开；阈值再抬高又会漏掉浅色图标。而金框的颜色很独特——R 极高、B 很低，
    # 卡片底（B=181）与银灰图标（R≈B）都不满足。按颜色剔最干净。
    gold = (R > 228) & (G > 140) & (G < 238) & (B < 135)
    mask &= ~gold

    def span(proj, min_len=45):
        """找最宽的连续段。

        所以分两步：先按低阈值（2，只滤噪点）切段，再合并间隔 ≤ 8 的相邻段
        （图标内部的横向空洞不会超过 8px），最后取最宽的一段。
        """
        raw, start = [], None
        for i, v in enumerate(proj):
            if v >= 2 and start is None:
                start = i
            elif v < 2 and start is not None:
                raw.append((start, i - 1))
                start = None
        if start is not None:
            raw.append((start, len(proj) - 1))
        merged = []
        for b in raw:
            if merged and b[0] - merged[-1][1] <= 8:
                merged[-1] = (merged[-1][0], b[1])
            else:
                merged.append(b)
        if not merged:
            return None
        best = max(merged, key=lambda b: b[1] - b[0])
        if best[1] - best[0] < min_len:
            return None
        return best

    cs = span(mask.sum(axis=0))
    rs = span(mask.sum(axis=1))
    if cs is None or rs is None:
        return None
    box = [x0 + cs[0], y0 + rs[0], x0 + cs[1] + 1, y0 + rs[1] + 1]
    return trim_cardside(a, trim_gold(a, box))


def trim_gold(a, box, max_steps=4):
    """若框的边缘带仍是金黄（选中框残留），向内收 2px，最多收 4 次。

    为什么还需要这一步：颜色剔除之后仍有 2px 左右的金边留在段内——金框内侧那两列
    像素偏暗（R≈220，没到 228 的阈值），投影上算作内容。与其把颜色阈值调到会误伤
    金色图标（生活技能全是金底），不如在框定之后再看一眼边缘。
    """
    x0, y0, x1, y1 = box
    for _ in range(max_steps):
        moved = False
        for side in range(4):
            if side == 0:  # 左
                band, axis = a[y0:y1, x0:x0 + 2], 0
            elif side == 1:  # 右
                band, axis = a[y0:y1, x1 - 2:x1], 0
            elif side == 2:  # 上
                band, axis = a[y0:y0 + 2, x0:x1], 1
            else:  # 下
                band, axis = a[y1 - 2:y1, x0:x1], 1
            R, G, B = band[:, :, 0].astype(int), band[:, :, 1].astype(int), band[:, :, 2].astype(int)
            gold = (R > 200) & (G > 130) & (B < 150)
            if gold.mean() > 0.25 and (x1 - x0) > 60 and (y1 - y0) > 60:
                if axis == 0:
                    x0, x1 = (x0 + 2, x1) if side == 0 else (x0, x1 - 2)
                else:
                    y0, y1 = (y0 + 2, y1) if side == 2 else (y0, y1 - 2)
                moved = True
        if not moved:
            break
    return x0, y0, x1, y1


def is_cardside(rgb):
    """这个颜色是不是游戏卡片底（米黄）。

    不能只看亮度：图标里也有大片白（银灰图标的亮部 ≈ (240,248,240)），亮度和卡片底
    相近。区别在**色偏**——卡片底是暖黄（R 比 B 高 70 以上），图标里的白是中性灰
    （R≈G≈B）。所以按 R−B 判断。

    再叠一个亮度下限（R>175）：「生活技能」那批图标本身是金色的，暗金边
    `(130,110,62)` 的 R−B 也有 68，只看色偏会把它当成卡片底。亮的那批金色
    （R>175 且偏暖）确实会命中判据，但它们出现在图标**内部**，而这里是整行/列
    85% 命中才会剥——边缘一圈是暗褐框，不会误伤。
    """
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    return r > 175 and r - b >= 25 and g - b >= 12


def trim_cardside(a, box, max_steps=8):
    """把框边缘残留的卡片底剥掉。

    为什么需要：`icon_box` 按「与卡片底差异」找边界，但银白图标与米黄底的**亮度**
    差得不多，边界会扩出去 2-4px，导出的图标就套了一圈米黄（2026-11-02 用户看到的
    「一圈黄边」）。这里换成按色偏判断，逐行/列剥到遇见真图标为止。
    """
    x0, y0, x1, y1 = box
    for _ in range(max_steps):
        if x1 - x0 <= 40 or y1 - y0 <= 40:
            break
        moved = False
        # 四边**每轮都看**，不写成 if/elif：选中框是四条边都有，若一轮只剥一条，
        # 循环次数会被同一侧吃光，底部永远轮不到（实测 active-01 / story-01 就卡在这）。
        if sum(is_cardside(p) for p in a[y0:y1, x0]) > (y1 - y0) * 0.85:
            x0 += 1
            moved = True
        if sum(is_cardside(p) for p in a[y0:y1, x1 - 1]) > (y1 - y0) * 0.85:
            x1 -= 1
            moved = True
        if sum(is_cardside(p) for p in a[y0, x0:x1]) > (x1 - x0) * 0.85:
            y0 += 1
            moved = True
        if sum(is_cardside(p) for p in a[y1 - 1, x0:x1]) > (x1 - x0) * 0.85:
            y1 -= 1
            moved = True
        if not moved:
            break
    return x0, y0, x1, y1


def normalize(img, size=CROP):
    """把图标裁块缩放成统一边长，不添任何背景。

    早先版本四周垫了一圈米黄（`(230,196,155)`，取自游戏卡片底），看着像「画在卡片上」。
    实际用起来那是错的方向：图标要贴到我们自己的纸面上，垫一圈游戏里的卡片色，
    等于把一个界面的底色搬到另一个界面里——**看上去就是图标外面套了一圈黄边**。
    改成透明：图标本体铺满画布，底色由用它的地方决定。

    宽高不等时用透明补成正方形再缩放，避免拉伸变形。
    """
    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def slice_page(path, expect, spacing_hint=(280, 134)):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im)
    lum = np.asarray(im.convert('L'), dtype=np.int16)
    H, W = lum.shape
    y0, y1 = int(H * 0.24), int(H * 0.70)
    x0, x1 = int(W * 0.07), int(W * 0.96)

    cols = find_bands((lum[y0:y1, :] < 145).sum(axis=0), 110)
    cols = [c for c in cols if 55 <= c[1] - c[0] <= 115]
    rows = find_bands((lum[y0:y1, x0:x1] < 145).sum(axis=1), 130)
    rows = [(r[0] + y0, r[1] + y0) for r in rows if 55 <= r[1] - r[0] <= 115]

    xs = centers_with_expand(cols, 4, spacing_hint[0])
    ys = centers_with_expand(rows, 3, spacing_hint[1])
    if not xs or not ys:
        raise SystemExit(f'{path}: 找不到网格（列 {cols} 行 {rows}）')

    out = []
    for cy in ys:
        for cx in xs:
            box = icon_box(a, cx, cy)
            if box is None:
                continue
            x0b, y0b, x1b, y1b = box
            if x0b < 0 or y0b < 0 or x1b > W or y1b > H:
                raise SystemExit(f'{path.name}: 裁切框出界 {box}')
            out.append((normalize(im.crop(box)), box))
    if len(out) != expect:
        raise SystemExit(f'{path.name}: 切出 {len(out)} 个，应为 {expect} 个')
    return out


def read_active_names():
    """装备特技名与前端同读 character-rules.json，不再解析 TS 或复制名字表。"""
    path = ROOT / 'public/game/data/character-rules.json'
    names = json.loads(path.read_text(encoding='utf-8'))['gear']['actives']
    if not names or not all(isinstance(name, str) and name for name in names):
        raise SystemExit(f'{path}: 装备特技名录无效')
    return names


def read_skill_table():
    """从 `public/game/data/skills.json` 读生活 / 剧情技能名。

    读 JSON 而不是解析 TS：那张表已经是**数据文件**（游戏事实，换版本只换文件），
    脚本要是还去 TS 里找，等于把「唯一真源」又说回到了代码里。
    """
    path = ROOT / 'public/game/data/skills.json'
    if not path.exists():
        raise SystemExit(f'{path}: 找不到技能名录')
    table = json.loads(path.read_text(encoding='utf-8'))
    for key in ('life', 'story'):
        if not table.get(key):
            raise SystemExit(f'{path}: 缺少 {key}')
    return table


def main():
    # 参数是**图标的根**（`public/game/icons`），不是某一类的目录：这个脚本一次写三类，
    # 各自落到与自己同名的子目录（`skill/` `story/` `active/`）。一个类目一个文件夹，
    # 与 `slice-school.py` → `school/`、`slice-gear.py` → `gear/` 是同一条规矩：
    # 目录名就是文件名前缀，新人往哪个目录放图不用猜。
    out_root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public/game/icons')
    out_root.mkdir(parents=True, exist_ok=True)
    skills = read_skill_table()
    names = {
        'skill': skills['life'],
        'story': skills['story'],
        'active': read_active_names(),
    }
    manifest = {'generated-by': 'tools/game-icons/slice.py', 'groups': {}}
    total = 0
    for kind, pages in PAGES.items():
        kind_dir = out_root / kind
        kind_dir.mkdir(parents=True, exist_ok=True)
        items = []
        for name, expect in pages:
            page = slice_page(SRC / name, expect)
            items.extend(page)
            print(f'{kind:7s} {name.split("-")[-1]:16s} {len(page):2d} 格')
        if len(items) != len(names[kind]):
            raise SystemExit(
                f'{kind}: 切出 {len(items)} 个图标，名字表里有 {len(names[kind])} 个——对不上'
            )
        entries = []
        for i, (img, box) in enumerate(items, start=1):
            fid = f'{kind}-{i:02d}'
            # 有损 92 而不是无损：这 101 个图标无损要 957KB，q92 只要约 350KB，而图标
            # 最大只按 48px 显示，两者肉眼无差。method=6 是体积与耗时的折中（101 个约 3 秒）。
            img.save(kind_dir / f'{fid}.webp', 'WEBP', quality=92, method=6)
            entries.append({'id': fid, 'name': names[kind][i - 1]})
        manifest['groups'][kind] = entries
        total += len(entries)
        print(f'{kind:7s} 合计 {len(items)} 个图标 → {kind_dir}/  \n')
    (out_root.parent / 'data').mkdir(parents=True, exist_ok=True)
    # 缩进 4 空格是**对齐 Prettier 的配置**：`npm run check` 会 `prettier --check`
    # 这份 json，脚本若写 2 空格，重跑一次就把格式检查弄红。
    (out_root.parent / 'data' / 'icons.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=4) + '\n', encoding='utf-8'
    )
    print(f'写出 {total} 个图标 + data/icons.json')


if __name__ == '__main__':
    main()

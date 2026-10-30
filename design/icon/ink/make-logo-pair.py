# -*- coding: utf-8 -*-
"""
左侧栏牌记 · 双版标（2026-10-30）

应用图标（`ink-lab.py` 的 `plan_a`）只有墨底一版。侧栏要跟着主题翻面，
所以照同一构图补一张纸底版：字换成焦墨，朱印留着。

**底色去掉了（透明）**。理由不是省事：
1. 图标原尺寸 1024px，侧栏栏顶只有 34×45，那个圆角方块在这个尺寸下只剩
   「一圈比纸略深的边」——读作贴了张图标，和整页的纸面语言打架；
2. 图标自带的墨不匀纹理在 34px 上变成噪点，方块边反而显脏；
3. 去掉底之后，字才能吃满 34px 宽度——留白在方图里是构图，在 34px 里是浪费。

所以这里只取图标里的**图案**：行楷「梦」+ 右下朱印「耶」，透明底两版。

**颜色与令牌一致**，这样切换主题时字色和正文完全同步，不会出现「logo 的墨
比正文深一档」：
    亮色 字 #292520 (= --ink)   印 #a8322b (= --cinnabar)
    暗色 字 #ece3cd (= --ink)   印 #d0755f (= --cinnabar)

构图参数与 `plan_a` 逐项相同（字高 0.660 / 位置 0.498,0.436 / 印 0.192）：
两版要在切换主题的瞬间**不跳动**——差 1% 换主题时那只字就会挪一下，
读起来是两张图而不是一张图翻了面。

用法：python design/icon/ink/make-logo-pair.py
输出：assets/mark-ink.png（亮色用）、assets/mark-paper.png（暗色用），与 `assets/fonts/` 同处
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets')

spec = importlib.util.spec_from_file_location('inklab', os.path.join(HERE, 'ink-lab.py'))
ink = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ink)

GLYPH = dict(h_ratio=0.660, cx=0.498, cy=0.436)
GLYPH_OPT = dict(soft=0.0022, amp=0.14, halo=0.0, fade=0.92, core=0.90)
STAMP = dict(cx=0.742, cy=0.782, side=0.192, c_ratio=0.70, t_ratio=0.090)

INK = (0x29, 0x25, 0x20)
INK_DARK = (0xec, 0xe3, 0xcd)
CINN = (0xa8, 0x32, 0x2b)
CINN_DARK = (0xd0, 0x75, 0x5f)

# 输出高度。侧栏按 36px 显示，2x 屏要 72px，取 192 留到 5x 也够。
H = 192
# 裁到墨迹后再留一圈空气：紧贴 bbox 会让「梦」的最后一笔顶到图边。
PAD = 0.04


def build(ink_color, seal_color):
    # 字单独合成一次，用来取「视觉中心」。
    # 整体 bbox 的中心不能用来居中：朱印在右下，会把中心拉到字的右侧，
    # 于是方框居中、字偏左——栏只有 34px 宽，偏 3px 就看得出来。
    # 所以按**字**的中心对齐，印允许伸出去。
    glyph = ink.lay(ink.Image.new('RGBA', (ink.S, ink.S), (0, 0, 0, 0)),
                    ink.brush(ink.glyph('梦', **GLYPH), **GLYPH_OPT), ink_color)
    cx = (lambda b: (b[0] + b[2]) / 2)(glyph.getbbox())

    im = ink.stamp(
        glyph, STAMP['cx'], STAMP['cy'], int(ink.S * STAMP['side']),
        c_ratio=STAMP['c_ratio'], t_ratio=STAMP['t_ratio'], color=seal_color,
    )
    x0, y0, x1, y1 = im.getbbox()
    pad = int(ink.S * PAD)
    half = max(cx - x0, x1 - cx) + pad
    im = im.crop((round(cx - half), max(0, y0 - pad), round(cx + half), min(ink.S, y1 + pad)))
    w = max(1, round(im.width * H / im.height))
    return im.resize((w, H), ink.Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, (i, c) in (('mark-ink', (INK, CINN)), ('mark-paper', (INK_DARK, CINN_DARK))):
        im = build(i, c)
        path = os.path.join(OUT, f'{name}.png')
        im.save(path, optimize=True)
        print(name, im.size, os.path.getsize(path) // 1024, 'KB')

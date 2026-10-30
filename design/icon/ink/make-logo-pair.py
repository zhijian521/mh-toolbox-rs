# -*- coding: utf-8 -*-
"""
左侧栏牌记 · 双版标（2026-10-30）

应用图标（`ink-lab.py` 的 `plan_a`）只有墨底一版。侧栏要跟着主题翻面，
所以照同一构图补一张纸底版：字换成焦墨，朱印留着。

**底色去掉了（透明）**，立方底座改由 CSS 画（`AppRail.vue` 的 `.rail-mark`）：
1. 图标原尺寸 1024px，侧栏栏顶只有 34×34，那个圆角方块在这个尺寸下只剩
   「一圈比纸略深的边」——读作贴了张图标，和整页的纸面语言打架；
2. 图标自带的墨不匀纹理在 34px 上变成噪点，方块边反而显脏；
3. 去掉底之后，底座的高光、边框、投影都能跟着主题令牌走，而不是烧死在 PNG 里。

所以这里只取图标里的**图案**：行楷「梦」+ 右下朱印「耶」，透明底、正方形画布。

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

# 输出边长。侧栏按 34px 显示（与目录槽同宽），2x 屏要 68px，取 192 留到 5x 也够。
H = 192
# 裁到墨迹后再留一圈空气：紧贴 bbox 会让「梦」的最后一笔顶到图边。
PAD = 0.04
# 补成正方形之后，四周再统一留一点白。标现在装在一个 34px 的立体底座里，
# 底座自己已经有 1px 边线与内影，图里这圈白只需要把墨迹从框线上让开——
# 给多了字就显小，撑不满底座，「饱满」也就没了。
EDGE = 0.03


def build(ink_color, seal_color):
    # 字单独合成一次再落印：直接在大画布上落印会让印盖到字的墨迹上，
    # 而 `stamp` 需要一张只有字的底图来判断哪里已经有墨。
    glyph = ink.lay(ink.Image.new('RGBA', (ink.S, ink.S), (0, 0, 0, 0)),
                    ink.brush(ink.glyph('梦', **GLYPH), **GLYPH_OPT), ink_color)

    im = ink.stamp(
        glyph, STAMP['cx'], STAMP['cy'], int(ink.S * STAMP['side']),
        c_ratio=STAMP['c_ratio'], t_ratio=STAMP['t_ratio'], color=seal_color,
    )
    x0, y0, x1, y1 = im.getbbox()
    pad = int(ink.S * PAD)
    # 按**整体墨迹**的 bbox 裁，不再按字心对称裁。
    # 字心居中会让朱印把右边吃掉：171 宽的图里左边空 40、右边只空 22，
    # 缩到 32px 是 3px 的偏差——一个正方形框里明显偏左。牌记现在是「方框 + 标」，
    # 读者比较的是框线到墨迹的四条边距，字偏不偏已经退到第二位。
    im = im.crop((
        max(0, x0 - pad), max(0, y0 - pad),
        min(ink.S, x1 + pad), min(ink.S, y1 + pad),
    ))

    # 补成正方形。牌记是方的、落款框是方的，图也必须是方的：
    # 原来输出 171×192，`object-fit: contain` 之后左右贴边、上下留白，
    # 「四周等距」就只是句口号。按长边补成方画布再居中，留白由 EDGE 统一给。
    side = int(round(max(im.size) * (1 + EDGE)))
    canvas = ink.Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return canvas.resize((H, H), ink.Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, (i, c) in (('mark-ink', (INK, CINN)), ('mark-paper', (INK_DARK, CINN_DARK))):
        im = build(i, c)
        path = os.path.join(OUT, f'{name}.png')
        im.save(path, optimize=True)
        print(name, im.size, os.path.getsize(path) // 1024, 'KB')

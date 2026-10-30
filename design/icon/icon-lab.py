# -*- coding: utf-8 -*-
"""
应用图标方案实验室 —— 账簿方向（宣纸 / 墨 / 朱红 / 文武线）
产出：4 个方案 × (256 主图 + 64/32/16 小尺寸) + 一张对比长图
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

S = 2048                      # 超采样画布
OUT = os.path.dirname(os.path.abspath(__file__))
FONT_KAI = 'C:/Windows/Fonts/simkai.ttf'
FONT_HEI = 'C:/Windows/Fonts/msyh.ttc'

# ---- 令牌（与 design/tokens.css 对齐）----
PAPER   = (248, 243, 230)
PAPER_2 = (242, 234, 214)
BG      = (238, 229, 207)
INK     = (41, 37, 32)
INK_2   = (74, 66, 56)
RULE    = (220, 205, 171)
RULE_2  = (188, 168, 124)
CINN    = (168, 50, 43)
CINN_INK= (138, 38, 32)
OCHRE   = (138, 90, 43)
ON_C    = (251, 244, 228)

# 暗色令牌
D_BG    = (19, 17, 9)
D_PAPER = (28, 25, 18)
D_PAPER2= (35, 31, 22)
D_INK   = (236, 227, 205)
D_RULE  = (56, 50, 31)
D_RULE2 = (84, 74, 51)
D_CINN  = (188, 62, 50)

RADIUS = 82                   # 圆角：纸摞起来的微圆角，约 4%


def canvas(fill):
    """整张画布用纸色填充、alpha=0 —— 缩小到 16px 时圆角边缘不会往黑色偏。"""
    return Image.new('RGBA', (S, S), fill + (0,))


def paper(fill, outline=None, ol_w=0, radius=RADIUS):
    im = canvas(fill)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=fill + (255,))
    if outline and ol_w:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius,
                            outline=outline + (255,), width=ol_w)
    return im


def text_mask(char, box, target_h, bold=0.0, font_path=FONT_KAI):
    """在 box×box 的 mask 上居中排一个字，字高精确等于 target_h；bold 为膨胀半径。"""
    m = Image.new('L', (box, box), 0)
    d = ImageDraw.Draw(m)
    fs = int(box * 0.9)
    f = ImageFont.truetype(font_path, fs)
    bb = d.textbbox((0, 0), char, font=f)
    h = bb[3] - bb[1]
    if h <= 0:
        return m
    fs = max(8, int(fs * target_h / h))
    f = ImageFont.truetype(font_path, fs)
    bb = d.textbbox((0, 0), char, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    x = (box - w) / 2 - bb[0]
    y = (box - h) / 2 - bb[1]
    offs = [(0, 0)]
    if bold > 0:
        for i in range(12):
            a = i * math.pi / 6
            offs.append((math.cos(a) * bold, math.sin(a) * bold))
    for dx, dy in offs:
        d.text((x + dx, y + dy), char, font=f, fill=255)
    # 按「真实墨迹」再居中一次：楷体「梦」的下半部长撇会让 font bbox 的重心偏高，
    # 只信 bbox 的话字会视觉偏下。
    bb = m.getbbox()
    if bb:
        ndx = int((box - (bb[2] - bb[0])) / 2 - bb[0])
        ndy = int((box - (bb[3] - bb[1])) / 2 - bb[1])
        if ndx or ndy:
            m = ImageChops.offset(m, ndx, ndy)
    return m


def ink_grain(layer, strength=0.07, cell=90):
    """印泥不匀：极低频的明暗斑，让印看起来是「盖」上去的，不是贴上去的。
    只调低频、不调高频 —— 细沙点缩到 256 就成了脏，大斑块缩下去才是墨色厚薄。"""
    lw, lh = layer.size
    w, h = max(3, lw // cell), max(3, lh // cell)
    small = Image.new('L', (w, h), 128)
    px = small.load()
    seed = 20261030
    for y in range(h):
        for x in range(w):
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
            px[x, y] = 128 + int(((seed >> 16) % 1000 - 500) * 0.16)
    noise = small.resize((lw, lh), Image.BICUBIC).filter(
        ImageFilter.GaussianBlur(max(2, lw // 90)))
    n = noise.load()
    a = layer.getchannel('A')
    pa = a.load()
    for y in range(lh):
        for x in range(lw):
            v = pa[x, y]
            if v:
                f = 1.0 - strength + strength * 2.0 * (n[x, y] / 255.0)
                pa[x, y] = max(0, min(255, int(v * f)))
    layer.putalpha(a)
    return layer


def stamp(layer, deg=-2.5):
    """整枚印轻微旋转，居中贴回。印是唯一允许不端正的元素。"""
    r = layer.rotate(deg, resample=Image.BICUBIC, expand=True)
    out = canvas(PAPER)
    out.paste(r, ((S - r.width) // 2, (S - r.height) // 2), r)
    return out


def square_seal(side, thickness, char_ratio, fg, fill_block=None,
                char=None, bold=None, radius_ratio=0.03, char_color=None):
    """一枚方印。
    - 朱文：thickness>0，字用 fg 色画在纸上。
    - 白文：thickness=0 + fill_block，字从实心块里挖空（透出纸）。
    - 白文改色：再给 char_color，就把字直接画成该色（深底上更亮）。"""
    L = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    rad = int(side * radius_ratio)
    if fill_block:
        d.rounded_rectangle([0, 0, side - 1, side - 1], radius=rad, fill=fill_block + (255,))
    if thickness:
        d.rounded_rectangle([thickness // 2, thickness // 2, side - 1 - thickness // 2,
                             side - 1 - thickness // 2], radius=rad,
                            outline=fg + (255,), width=thickness)
    if char:
        target = side * char_ratio
        b = bold if bold is not None else side * 0.014
        m = text_mask(char, side, target, bold=b)
        if fill_block and char_color:
            color = Image.new('RGBA', (side, side), char_color + (255,))
            L = Image.composite(color, L, m)
        elif fill_block:
            L.putalpha(Image.composite(Image.new('L', (side, side), 0), L.getchannel('A'), m))
        else:
            color = Image.new('RGBA', (side, side), fg + (255,))
            L = Image.composite(color, L, m)
    return L


# ---------------------------------------------------------------- 方案 A
def plan_a():
    """朱文印：一张纸上只有一枚朱红细边框的「梦」印。"""
    im = paper(PAPER, RULE, 3)
    side = 1330
    seal = square_seal(side, thickness=int(side * 0.068), char_ratio=0.63,
                       fg=CINN_INK, char='梦', bold=side * 0.011)
    seal = ink_grain(seal, 0.08)
    im = stamp_over(im, seal, -2.5)
    return im


# ---------------------------------------------------------------- 方案 B
def plan_b():
    """墨字朱印：一个大的墨色「梦」，右下角一枚小朱印落款。"""
    im = paper(PAPER, RULE, 3)
    th = 980
    m = text_mask('梦', S, th, bold=15)
    ink_layer = Image.new('RGBA', (S, S), INK + (255,))
    ink_layer.putalpha(m)
    im.paste(ink_layer, (0, 0), ink_layer)

    side = 370
    seal = square_seal(side, int(side * 0.072), 0.58, CINN_INK, char='梦', bold=side * 0.034)
    seal = ink_grain(seal, 0.08)
    r = seal.rotate(-4, resample=Image.BICUBIC, expand=True)
    im.paste(r, (S - 250 - r.width, S - 250 - r.height), r)
    return im


# ---------------------------------------------------------------- 方案 C
def plan_c():
    """账页：文武线框 + 墨色基线 + 三根柱子（最高一根朱红），柱组在框内居中。"""
    im = paper(PAPER, RULE, 3)
    d = ImageDraw.Draw(im)

    o, t = 250, 40
    d.rounded_rectangle([o, o, S - 1 - o, S - 1 - o], radius=6, outline=RULE_2 + (255,), width=t)
    o2, t2 = o + t + 44, 14
    d.rounded_rectangle([o2, o2, S - 1 - o2, S - 1 - o2], radius=4, outline=RULE + (255,), width=t2)

    base_y = S - o2 - 250
    bw = 56
    bar_w, gap = 192, 126
    span = bar_w * 3 + gap * 2
    bx0 = (S - span) // 2
    x0, x1 = bx0 - 96, bx0 + span + 96
    d.rectangle([x0, base_y - bw, x1, base_y], fill=INK + (255,))

    for i, (h, c) in enumerate([(370, OCHRE), (590, OCHRE), (810, CINN)]):
        bx = bx0 + i * (bar_w + gap)
        d.rectangle([bx, base_y - bw - h, bx + bar_w, base_y - bw], fill=c + (255,))
    return im


# ---------------------------------------------------------------- 方案 D
def plan_d():
    """夜账：深墨纸 + 米白文武线 + 实心朱印，米白「梦」反白。深色任务栏上最跳。"""
    im = paper(D_PAPER, D_RULE2, 3)
    d = ImageDraw.Draw(im)
    o, t = 214, 32
    d.rounded_rectangle([o, o, S - 1 - o, S - 1 - o], radius=6, outline=D_RULE2 + (255,), width=t)
    o2 = o + t + 42
    d.rounded_rectangle([o2, o2, S - 1 - o2, S - 1 - o2], radius=4, outline=D_RULE + (255,), width=11)
    side = 1120
    seal = square_seal(side, thickness=0, char_ratio=0.60, fg=None,
                       fill_block=D_CINN, char='梦', bold=side * 0.018,
                       char_color=ON_C)
    seal = ink_grain(seal, 0.09)
    im = stamp_over(im, seal, -2.5)
    return im


def stamp_over(base, layer, deg):
    r = layer.rotate(deg, resample=Image.BICUBIC, expand=True)
    base.paste(r, ((S - r.width) // 2, (S - r.height) // 2), r)
    return base


def resize(im, size):
    return im.resize((size, size), Image.LANCZOS)


SCHEMES = [('A', '朱文印', plan_a), ('B', '墨字朱印', plan_b),
           ('C', '账页三柱', plan_c), ('D', '夜账', plan_d)]

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'png'), exist_ok=True)
    for key, name, fn in SCHEMES:
        im = fn()
        for sz in (512, 256, 128, 64, 48, 32, 24, 16):
            resize(im, sz).save(os.path.join(OUT, 'png', f'{key}_{sz}.png'))
        print('ok', key, name)

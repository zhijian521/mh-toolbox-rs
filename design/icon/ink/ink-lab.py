# -*- coding: utf-8 -*-
"""
应用图标 · 水墨方向 v3
笔意只来自两处：行楷字形本身，以及从行楷里取出的「一」「丨」两笔。
四个方案的区别在墨怎么用：焦、淡、晕、界格。
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

S = 2048
OUT = os.path.dirname(os.path.abspath(__file__))
F_XING = 'C:/Windows/Fonts/STXINGKA.TTF'

PAPER = (249, 245, 235)
JIAO = (28, 23, 20)
CINN = (166, 43, 34)
DAN = (116, 105, 92)
# ---- 暗色（拓片）：
NIGHT = (38, 33, 27)        # 墨底（比 #202020 任务栏亮一档，否则边界消失）
NIGHT_DEEP = (9, 7, 6)      # 压深用的更深的墨
PAPER_L = (243, 236, 219)   # 拓片留白（碑字凹处）
CINN_L = (188, 64, 50)      # 暗底上的朱
RAD = int(2048 * 0.18)


# ---------------------------------------------------------------- 纸与墨
def lowfreq(seed, cell, contrast=2.8):
    w = max(4, S // cell)
    im = Image.new('L', (w, w), 128)
    px = im.load()
    rnd = random.Random(seed)
    for y in range(w):
        for x in range(w):
            px[x, y] = max(0, min(255, 128 + int(rnd.gauss(0, 54))))
    im = im.resize((S, S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(max(2, S // 200)))
    return im.point(lambda v: max(0, min(255, int(128 + (v - 128) * contrast))))


def clip_to_shape(im):
    """把 alpha 裁到圆角矩形内。叠加层（渐变、纹理）会溢出到圆角外的透明区，
    不裁的话四角残留半透明深色，在浅色桌面上就是一圈脏边。"""
    shape = Image.new('L', (S, S), 0)
    ImageDraw.Draw(shape).rounded_rectangle([0, 0, S - 1, S - 1], radius=RAD, fill=255)
    shape = shape.filter(ImageFilter.GaussianBlur(S * 0.0015))
    a = ImageChops.multiply(im.getchannel('A'), shape)
    im.putalpha(a)
    return im


def night_paper():
    """拓片的底：深墨 + 墨不匀 + 底部压深。"""
    im = Image.new('RGBA', (S, S), NIGHT + (0,))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RAD, fill=NIGHT + (255,))
    # 墨不匀用更深的墨叠，不用纸色——亮斑在暗底上像脏点
    im = lay(im, lowfreq(3, 30).point(lambda v: int(v * 0.22)), NIGHT_DEEP)
    # 底部压深一档：让色块有体积，深色任务栏上不至于糊成一块
    im = lay(im, vgrad(0.0).point(lambda v: 255 - v).point(lambda v: int(v * 0.45)),
             NIGHT_DEEP, opacity=0.65)
    return clip_to_shape(im)


def paper():
    im = Image.new('RGBA', (S, S), PAPER + (0,))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RAD, fill=PAPER + (255,))
    im = lay(im, lowfreq(3, 26).point(lambda v: int(v * 0.011)), JIAO)
    return clip_to_shape(im)


def lay(base, alpha, color=JIAO, opacity=1.0):
    if opacity != 1.0:
        alpha = alpha.point(lambda v: int(v * opacity))
    if alpha.size != base.size:
        raise ValueError(f'alpha {alpha.size} != base {base.size}')
    layer = Image.new('RGBA', base.size, color + (255,))
    layer.putalpha(alpha)
    return Image.alpha_composite(base, layer)


_VG = {}


def vgrad(lo):
    """上浓下淡：写得越往下墨越少。"""
    lo = round(lo, 3)
    if lo not in _VG:
        g = Image.new('L', (S, S))
        px = g.load()
        for y in range(S):
            v = int(255 * (1.0 - (1.0 - lo) * (y / (S - 1))))
            row = [v] * S
            for x in range(S):
                px[x, y] = row[x]
        _VG[lo] = g
    return _VG[lo]


# ---------------------------------------------------------------- 字形与笔画
def raw_glyph(char, box, font_size=None):
    """在 box×box 画布上居中渲染一个字，裁到墨迹。"""
    fs = font_size or int(box * 0.92)
    m = Image.new('L', (box, box), 0)
    d = ImageDraw.Draw(m)
    f = ImageFont.truetype(F_XING, fs)
    bb = d.textbbox((0, 0), char, font=f)
    d.text(((box - (bb[2] - bb[0])) / 2 - bb[0], (box - (bb[3] - bb[1])) / 2 - bb[1]),
           char, font=f, fill=255)
    c = m.getbbox()
    return m.crop(c) if c else m


def glyph(char, h_ratio, cx=0.5, cy=0.5, bold=0.0):
    """按字高占画面的比例放到 S×S 画布上。"""
    g = raw_glyph(char, int(S * 1.2))
    w = max(1, int(g.width * (S * h_ratio) / g.height))
    h = max(1, int(S * h_ratio))
    g = g.resize((w, h), Image.LANCZOS)
    out = Image.new('L', (S, S), 0)
    offs = [(0, 0)]
    if bold:
        for i in range(12):
            a = i * math.pi / 6
            offs.append((math.cos(a) * bold, math.sin(a) * bold))
    for dx, dy in offs:
        out.paste(g, (int(S * cx - w / 2 + dx), int(S * cy - h / 2 + dy)), g)
    return out


def stroke(char, w, h):
    """取一笔（'一' 或 '丨'），拉伸到指定尺寸。"""
    g = raw_glyph(char, int(S * 1.2))
    return g.resize((max(2, int(w)), max(2, int(h))), Image.LANCZOS)


def brush(mask, soft=0.005, spread=0.032, amp=0.16, seed=5,
          halo=0.22, fade=0.86, core=0.82, gain=None):
    """关键：调制完要把主体 alpha 拉回满值，否则三层衰减叠起来字就是灰的。
    浓淡只该在局部凹下去，不该把整片压低。"""
    rs = max(1, int(S * soft))
    inner = mask.filter(ImageFilter.GaussianBlur(rs))
    a = ImageChops.multiply(mask, inner.point(lambda v: int(255 * (core + (1 - core) * v / 255))))
    a = ImageChops.multiply(a, lowfreq(seed, 132).point(lambda v: int(255 * (1 - amp + amp * v / 255))))
    if fade < 1.0:
        a = ImageChops.multiply(a, vgrad(fade))
    g = gain if gain else 1.0 / (1.0 - amp * 0.5)
    a = a.point(lambda v: min(255, int(v * g)))
    ring = mask.filter(ImageFilter.GaussianBlur(max(2, int(S * spread)))).point(lambda v: int(v * halo))
    return ImageChops.lighter(a, ring)


def seal(side, char='耶', t_ratio=0.078, c_ratio=0.62, color=CINN, broken=0.10):
    L = Image.new('L', (side, side), 0)
    d = ImageDraw.Draw(L)
    t = int(side * t_ratio)
    d.rounded_rectangle([t // 2, t // 2, side - 1 - t // 2, side - 1 - t // 2],
                        radius=int(side * 0.018), outline=255, width=t)
    if char:
        cm = raw_glyph(char, int(side * c_ratio * 2.4), font_size=int(side * c_ratio * 1.3))
        k = (side * c_ratio) / max(cm.width, cm.height)
        nw, nh = max(1, int(cm.width * k)), max(1, int(cm.height * k))
        # 章法：偏扁的字在方印里纵向撑一撑，不然上下两块空
        if nh < nw * 0.94:
            nh = int(nw * 0.94)
        cm = cm.resize((nw, nh), Image.LANCZOS)
        holder = Image.new('L', (side, side), 0)
        holder.paste(cm, ((side - cm.width) // 2 + int(side * 0.012),
                          (side - cm.height) // 2 + int(side * 0.018)), cm)
        L = ImageChops.lighter(L, holder)

    L = L.filter(ImageFilter.GaussianBlur(side * 0.005))
    n = lowfreq(11, 62).resize((side, side), Image.BILINEAR)
    rough = n.point(lambda v: 255 if v > 120 - broken * 60 else 0)
    L = ImageChops.multiply(L, ImageChops.lighter(rough, L.point(lambda v: int(255 - v * broken))))
    layer = Image.new('RGBA', (side, side), color + (255,))
    a = ImageChops.multiply(L, n.point(lambda v: int(255 * (0.96 + 0.06 * v / 255))))
    layer.putalpha(a.point(lambda v: int(v * 0.97)))
    return layer


def stamp(base, cx, cy, side, angle=-3.2, **kw):
    s = seal(side, **kw).rotate(angle, resample=Image.BICUBIC, expand=True)
    base.paste(s, (int(cx * S - s.width / 2), int(cy * S - s.height / 2)), s)
    return base


# ---------------------------------------------------------------- 甲 · 焦墨
def plan_a():
    """拓片：墨底上留白的字，落一枚朱印。碑刻的读法。"""
    im = night_paper()
    im = lay(im, brush(glyph('梦', 0.660, 0.498, 0.436),
                       soft=0.0022, amp=0.14, halo=0.0, fade=0.92, core=0.90), PAPER_L)
    return stamp(im, 0.742, 0.782, int(S * 0.192), c_ratio=0.70,
                 color=CINN_L, t_ratio=0.090)


# ---------------------------------------------------------------- 乙 · 界格
def plan_b():
    """毛笔围一圈界格，字在格内。古籍封面的样子。"""
    im = paper()
    m = Image.new('L', (S, S), 0)
    x0, x1 = int(S * 0.182), int(S * 0.818)
    y0, y1 = int(S * 0.166), int(S * 0.834)
    th = int(S * 0.026)
    ov = int(th * 0.75)

    top = stroke('一', x1 - x0, th)
    m.paste(top, (x0, y0), top)
    bot = stroke('一', x1 - x0, th).transpose(Image.FLIP_TOP_BOTTOM)
    m.paste(bot, (x0, y1 - th), bot)
    lf = stroke('丨', th, y1 - y0 + ov * 2)
    m.paste(lf, (x0, y0 - ov), lf)
    rt = stroke('丨', th, y1 - y0 + ov * 2).transpose(Image.FLIP_LEFT_RIGHT)
    m.paste(rt, (x1 - th, y0 - ov), rt)

    im = lay(im, brush(m, soft=0.0022, halo=0.22, fade=0.95, amp=0.16, core=0.94), opacity=1.0)
    im = lay(im, brush(glyph('梦', 0.452, 0.502, 0.500),
                       soft=0.0022, amp=0.14, halo=0.20, fade=0.94, core=0.88))
    return stamp(im, 0.856, 0.853, int(S * 0.100))


# ---------------------------------------------------------------- 丙 · 印为记
def plan_c():
    """一枚朱印压在纸上，字退成淡墨的影子。"""
    im = paper()
    im = lay(im, brush(glyph('梦', 0.585, 0.472, 0.428),
                       soft=0.0022, amp=0.16, halo=0.20, fade=0.92, core=0.88), DAN)
    return stamp(im, 0.730, 0.732, int(S * 0.180), angle=-2.4,
                 t_ratio=0.068, c_ratio=0.60)


# ---------------------------------------------------------------- 丁 · 题跋
def plan_d():
    """字在上，右侧一行竖排小字，像题跋。"""
    im = paper()
    im = lay(im, brush(glyph('梦', 0.575, 0.452, 0.430),
                       soft=0.0022, amp=0.14, halo=0.20, fade=0.94, core=0.88))
    m = Image.new('L', (S, S), 0)
    for i, ch in enumerate('养老助手'):
        g = glyph(ch, 0.072, 0.760, 0.286 + i * 0.098)
        m = ImageChops.lighter(m, g)
    im = lay(im, brush(m, soft=0.0018, amp=0.10, halo=0.14, fade=0.96, core=0.92),
             opacity=0.72)
    return stamp(im, 0.762, 0.800, int(S * 0.098))


def resize(im, n):
    return im.resize((n, n), Image.LANCZOS)


SCHEMES = [('ink1', '焦墨', plan_a), ('ink2', '界格', plan_b),
           ('ink3', '印为记', plan_c), ('ink4', '题跋', plan_d)]

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'png'), exist_ok=True)
    for k, n, fn in SCHEMES:
        im = fn()
        for s in (512, 256, 128, 64, 48, 32, 24, 16):
            resize(im, s).save(os.path.join(OUT, f'png/{k}_{s}.png'))
        print('ok', k, n)

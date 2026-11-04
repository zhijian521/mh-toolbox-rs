"""从「师门技能」面板截图中切出门派技能图标，并生成图标清单。

与 `slice.py` 的区别：那一份切的是 4 列 × 3 行的卡片网格（生活 / 剧情 / 特技），
这一份切的是**竖排 7 行的门派面板**——只取左边那一列师门技能（红棕）。
中间那一列是师门法术（墨绿），这批**不收**：使用方只要门派技能。

用法：
    python tools/game-icons/slice-school.py            # 切图 + 写清单
    python tools/game-icons/slice-school.py --check    # 只校验名字，不写文件
    python tools/game-icons/slice-school.py --report   # 只打印每家量到的本体高度，不写文件

横向是固定值：21 张截图同分辨率（1218×995），列位置逐像素一致，图标本体 x 213..272
（左右各 1px 已是抗锯齿过渡、不含背景），行起点 y = 322 + 75·i。

**纵向不固定，逐格量**：同窗口不同次渲染会差半个多像素，最后六张（女魃墓、天机城、
花果山、东海渊、九黎城、弥勒山）的图标列就比前十五张高 1px。照固定坐标切，底部会留下
一行**半透明**像素——它比图标自带的深色描边浅，落在 96px 图上就是一道黄边。只补整数
像素（先试过 `dy: -1`）没用：半透明那行换成哪个整数位置都在。所以每一格单独量
`body_bottom()`，认准"跳变行比上一行亮就是混合行、丢掉"，具体判据见那个函数。

**别把长方形补成正方形再缩放**：补 1px 若填黑色，就是上下各一条黑边，看着正像图标被
截断（踩过一次）。直接缩放到 96×96，各向异性 1~3%，纹样上看不出来。
（曾经的 59×53 是量小了——右边少 1px、下面少 6px，那才是真的没截全。）

**第一行永远是选中项**，外面套一圈亮金高亮框（实测在 x=210~211 与 273~276）。框在
213 之外，横向不受影响；纵向**上界一律取标称行 y0**、不往上量（见 `body_bottom`）。
"""

import json
import sys
from pathlib import Path

from PIL import Image

CROP = 96  # 与 slice.py 同一个输出边长

# 横向几何写死（21 张截图逐像素一致）：起点 x=213、行起点 y=322、行距 75、宽 60。
# **高度不写死**——每一格的下界单独量，见 body_bottom()。
SKILL_BOX = (213, 322, 60)
ROW_STEP = 75
ROWS = 7

# 末行亮度兜底门限。正常本体末行是自带的深色描边（实测 6~110），半透明混合行 150 往上。
PALE_EDGE = 130
# 米黄底的亮度下限（L 通道）。空卡面实测 ~213~216，混合行 ~146，门限取中间偏上。
BG_TONE = 185

# 量行亮度时横向各收 1px（避开边缘抗锯齿）
X0, X1 = 214, 272

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(r"C:\Users\wenbo\.workbuddy\clipboard-images")
OUT_ICON = ROOT / 'public/game/icons/school'
OUT_MANIFEST = ROOT / 'public/game/data/school-icons.json'

# 截图 → 门派。顺序 = 交付顺序（用户截图时就按门派从上往下排的），
# `skills` 按**面板里的上下顺序**抄，不按 schools.json 的顺序——
# 后者是按重要度排的，与面板不同（大唐：面板「十方无敌」在第 1 位，表里在第 5 位）。
#
# 名字是这份脚本的原料描述，和 slice.py 的 PAGES 同性质；正确性由 `check_names()`
# 与 `public/game/data/schools.json` 的集合比对兜底——抄错一个字会当场报出来。
#
# 面板中间那一列（师门法术）刻意不收：使用方只要左边这一列门派技能。
PANELS = [
    {
        'shot': 'clipboard-2026-11-03T11-50-41-151Z-94a26695.jpg',
        'id': 'datang',
        'name': '大唐官府',
        'skills': ['十方无敌', '无双一击', '神兵鉴赏', '文韬武略', '为官之道', '紫薇之术', '疾风步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-154Z-906a3332.jpg',
        'id': 'huashengsi',
        'name': '化生寺',
        'skills': ['金刚伏魔', '小乘佛法', '诵经', '佛光普照', '大慈大悲', '歧黄之术', '渡世步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-155Z-0be25784.jpg',
        'id': 'nvercun',
        'name': '女儿村',
        'skills': ['毒经', '倾国倾城', '沉鱼落雁', '闭月羞花', '香飘兰麝', '玉质冰肌', '清歌妙舞'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-157Z-5f084585.jpg',
        'id': 'fangcunshan',
        'name': '方寸山',
        'skills': ['磬龙灭法', '黄庭经', '霹雳咒', '符之术', '归元心法', '神道无念', '斜月步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-159Z-494182d9.jpg',
        'id': 'tiangong',
        'name': '天宫',
        'skills': ['傲世诀', '天罡气', '清明自在', '宁气诀', '乾坤塔', '混天术', '云霄步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-161Z-a85e1efb.jpg',
        'id': 'putuoshan',
        'name': '普陀山',
        'skills': ['护法金刚', '金刚经', '观音咒', '灵性', '五行学说', '五行扭转', '莲花宝座'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-163Z-37e8c990.jpg',
        'id': 'longgong',
        'name': '龙宫',
        'skills': ['破浪诀', '九龙诀', '呼风唤雨', '龙腾', '逆鳞', '游龙术', '龙附'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-164Z-1bb0f2d7.jpg',
        'id': 'wuzhuangguan',
        'name': '五庄观',
        'skills': ['潇湘仙雨', '乾坤袖', '修仙术', '周易学', '混元道果', '明性修身', '七星遁'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-166Z-e21503d2.jpg',
        'id': 'shituoling',
        'name': '狮驼岭',
        'skills': ['生死搏', '训兽诀', '魔兽神功', '阴阳二气诀', '狂兽诀', '大鹏展翅', '魔兽反噬'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-167Z-98049147.jpg',
        'id': 'mowangzhai',
        'name': '魔王寨',
        'skills': ['震天诀', '牛逼神功', '火云术', '火牛阵', '牛虱阵', '回身击', '裂石步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-169Z-849ddf80.jpg',
        'id': 'yincaodifu',
        'name': '阴曹地府',
        'skills': ['六道轮回', '幽冥术', '拘魂诀', '灵通术', '九幽阴魂', '尸腐恶', '无常步'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-171Z-66897fcf.jpg',
        'id': 'pansidong',
        'name': '盘丝洞',
        'skills': ['秋波暗送', '天外魔音', '蛛丝阵法', '迷情大法', '盘丝大法', '移形换影', '姊妹相随'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-172Z-7e968bad.jpg',
        'id': 'shenmulin',
        'name': '神木林',
        'skills': ['瞬息万变', '万灵诸念', '巫咒', '万物轮转', '天人庇护', '神木恩泽', '驭灵咒'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-174Z-d53f5c3b.jpg',
        'id': 'lingbocheng',
        'name': '凌波城',
        'skills': ['天地无极', '九转玄功', '武神显圣', '啸傲', '气吞山河', '诛魔', '法天象地'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-176Z-9696c788.jpg',
        'id': 'wudidong',
        'name': '无底洞',
        'skills': ['枯骨心法', '阴风绝章', '鬼蛊灵蕴', '燃灯灵宝', '地冥妙法', '混元神功', '秘影迷踪'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-177Z-6b9698d8.jpg',
        'id': 'nvbamu',
        'name': '女魃墓',
        'skills': ['天火献誓', '天罚之焰', '煌火无明', '化神以灵', '弹指成烬', '藻光灵狱', '离魂'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-179Z-f084918c.jpg',
        'id': 'tianjicheng',
        'name': '天机城',
        'skills': ['神工无形', '攻玉以石', '擎天之械', '千机奇巧', '匠心不移', '运思如电', '探奥索隐'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-180Z-b8a7790f.jpg',
        'id': 'huaguoshan',
        'name': '花果山',
        'skills': ['神通广大', '如意金箍', '齐天逞胜', '金刚之躯', '灵猴九窍', '七十二变', '腾云驾雾'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-181Z-e167fc60.jpg',
        'id': 'donghaiyuan',
        'name': '东海渊',
        'skills': ['深海呓语', '远古之境', '混沌之谜', '长生之祀', '潮汐之咒', '澄心之浪', '遨游'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-183Z-d5765ff2.jpg',
        'id': 'jiulicheng',
        'name': '九黎城',
        'skills': ['九黎战歌', '魂枫战舞', '兵铸乾坤', '燃铁飞花', '战火雄魂', '魔神降世', '风行九黎'],
    },
    {
        'shot': 'clipboard-2026-11-03T11-50-41-185Z-07fd9864.jpg',
        'id': 'mileshan',
        'name': '弥勒山',
        'skills': ['缘起法随', '善果圆成', '慈悲为怀', '福慧无量', '欢喜自在', '光明净土', '来去自如'],
    },
]


def check_names():
    """截图里抄的 7 项技能名，必须与 schools.json 的那一家完全对上（集合比较）。

    为什么按集合而不按顺序：两份顺序本来就不同——schools.json 是「按重要度」排的
    历史顺序，面板是游戏自己的顺序。顺序差异不是错，名字写错才是。
    """
    table = json.loads((ROOT / 'public/game/data/schools.json').read_text(encoding='utf-8'))
    by_id = {s['id']: s for s in table['schools']}
    problems = []
    for panel in PANELS:
        entry = by_id.get(panel['id'])
        if entry is None:
            problems.append(f"{panel['id']}：schools.json 里没有这个门派")
            continue
        if entry['name'] != panel['name']:
            problems.append(f"{panel['id']}：门派名 {panel['name']} ≠ {entry['name']}")
        missing = set(entry['skills']) - set(panel['skills'])
        extra = set(panel['skills']) - set(entry['skills'])
        if missing:
            problems.append(f"{panel['name']}：截图里少了 {sorted(missing)}")
        if extra:
            problems.append(f"{panel['name']}：截图里多了 {sorted(extra)}")
        if len(panel['skills']) != ROWS:
            problems.append(f"{panel['name']}：面板应为 {ROWS} 项，抄了 {len(panel['skills'])} 项")
    if len(PANELS) != len(table['schools']):
        problems.append(f'截图 {len(PANELS)} 张，schools.json 有 {len(table["schools"])} 家')
    return problems


def row_tone(im, y0):
    """y0-2 .. y0+63 每一行的平均亮度（取中段 58px，避开左右抗锯齿）。

    用 `resize((1, h), BOX)` 把整行压成一个像素，就是行均值——比 PIL 的 getdata()
    快，也不吃 Pillow 的弃用警告。
    """
    band = im.crop((X0, y0 - 2, X1, y0 + 64)).convert('L')
    return list(band.resize((1, band.size[1]), Image.BOX).tobytes())


def body_bottom(im, y0):
    """量这一格图标本体的下界（绝对行号，闭区间）。

    找的是"深色描边 → 米黄底"那一次最陡的变亮跳变（本体高 57~59，所以窗口取 48..60）。
    跳变行本身有两种身份，这一步就是这次返工的全部内容：

    - 它比**上一行暗** → 它就是本体自带的最后一圈描边，留着（前十五家实测 -10~-23 级）；
    - 它比**上一行亮** → 它是"描边 + 米黄底"混出来的半透明行。留在图里，96px 下就是
      用户指认的那条淡黄线（后六家实测 +7~+50 级）。**丢掉这一行**，宁可少 0.1 行。

    这两类的亮度差有 17 级的间隔，不是勉强分开的。也别指望"补 1px"能解决：半透明的
    那一行换成哪个整数位置都在，只有"不取它"才消失。
    """
    tone = row_tone(im, y0)
    b = lambda k: tone[k + 2]  # noqa: E731 —— 只在本函数内用，写起来比到处 +2 清楚
    if b(60) < BG_TONE:
        raise SystemExit(f'y={y0} 这一格下方不是米黄底（60 行处亮度 {b(60):.0f}），先看坐标')
    k = max(range(48, 61), key=lambda k: b(k + 1) - b(k))
    # k+2 而不是 k+1：紧贴描边的那一行本身可能就是混合行（实测 L≈146），k+2 才是空卡面
    if b(k + 2) < BG_TONE:
        raise SystemExit(f'y={y0} 这一格找不到本体底边（最陡跳变在 +{k} 行，下方不是底色）')
    return y0 + k - 1 if b(k) > b(k - 1) else y0 + k


def crop_icon(im, box, row):
    """按行切一格：横向固定，纵向下界逐格量。"""
    x, y, w = box
    y0 = y + ROW_STEP * row
    return im.crop((x, y0, x + w, body_bottom(im, y0) + 1))


def to_square(img, size=CROP):
    """缩放到正方形。

    本体是 60×57~59（每格略有出入，见 body_bottom），与方形差几像素。**不要为了
    补齐而填色**——填黑就是上下各一条黑边，看着正像图标被截断（踩过）；填米黄则等于
    四周加了一圈黄边。直接 resize 到 96×96，各向异性 1~5%，纹样上看不出来。
    """
    return img.resize((size, size), Image.LANCZOS)


def bottom_brightness(img):
    """末行的平均亮度。

    这是「有没有多带一行背景」的机器判据：图标自带的底边是深色描边（实测 6~22），
    一旦切到米黄卡片底就是 180 往上。靠肉眼在 96px 缩略图上找黄边极不可靠，所以立这条。

    用直方图算均值而不用 `getdata()`：后者自 Pillow 11 起弃用（14 版移除），
    直方图版本跨版本都稳，且正好等于 `(r+g+b)/3` 的口径。
    """
    w, h = img.size
    row = img.crop((0, h - 1, w, h))
    total = count = 0
    for band in row.split():
        hist = band.histogram()
        total += sum(i * c for i, c in enumerate(hist))
        count += sum(hist)
    return total / (count * 3)


def assert_no_pale_edge(pale):
    """底边切到卡片底色就整体报错——绝不留半批图混着旧图。

    覆盖率判据已经保证末行是"整行图标"，这条是**兜底**：万一底色估错（取样区压到了
    文字或分隔线），覆盖率会跟着错，而亮度不受影响，两道判据同时失灵的概率很低。
    """
    if not pale:
        return
    raise SystemExit(
        '这些图标的底边切到了卡片底色（会看出一道黄边）：\n  '
        + '\n  '.join(pale)
        + '\n多半是截图换过窗口尺寸/缩放，或卡片换过色：先看 body_bottom() 的跳变行找没找对。'
    )


def main():
    if '--check' in sys.argv:
        problems = check_names()
        print('\n'.join(problems) if problems else '名字全部对得上')
        return 1 if problems else 0

    problems = check_names()
    if problems:
        raise SystemExit('\n'.join(problems))

    OUT_ICON.mkdir(parents=True, exist_ok=True)
    manifest = {'generated-by': 'tools/game-icons/slice-school.py', 'groups': {'skill': []}}
    # 先全部算完、校验过，再落盘：中途发现黄边就退出，不留半批新图混着旧图。
    pending = []
    pale = []  # 末行像背景的（底边切到卡片米黄）
    report = '--report' in sys.argv
    for panel in PANELS:
        im = Image.open(SRC / panel['shot']).convert('RGB')
        heights = []
        for i, name in enumerate(panel['skills']):
            # 前缀带 `skill`：光用 `school-<id>-<n>` 会和「门派徽记」的
            # `school-datang.webp` 撞在同一族里，看文件名分不清是徽记还是第 n 项技能。
            fid = f"school-skill-{panel['id']}-{i + 1}"
            crop = crop_icon(im, SKILL_BOX, i)
            heights.append(crop.size[1])
            icon = to_square(crop)
            level = bottom_brightness(icon)
            if level > PALE_EDGE:
                pale.append(f"{panel['name']} 第 {i + 1} 项（{name}）末行亮度 {level:.0f}")
            pending.append((fid, icon))
            manifest['groups']['skill'].append(
                {'id': fid, 'name': name, 'school': panel['id']}
            )
        # 同一家门派的 7 格必须同高：不同高说明判据在某格跑偏了（比如那行内容恰好偏亮）
        uniq = sorted(set(heights))
        flag = '' if len(uniq) == 1 else '   <-- 高度不一致，要看'
        print(f"{panel['name']:6s} {len(panel['skills'])} 项  本体高 {uniq} 行{flag}")

    if report:
        print('\n（--report：只看几何，没有写文件）')
        return 0

    assert_no_pale_edge(pale)

    for fid, icon in pending:
        icon.save(OUT_ICON / f'{fid}.webp', 'WEBP', quality=92, method=6)
    # 缩进 4 空格是**对齐 Prettier 的配置**，不是随手写的：`npm run check` 会
    # `prettier --check` 这个 json，脚本若写 2 空格，重跑一次就把格式检查弄红。
    OUT_MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=4) + '\n', encoding='utf-8'
    )
    print(f"\n共 {len(manifest['groups']['skill'])} 个门派技能图标")


if __name__ == '__main__':
    raise SystemExit(main())

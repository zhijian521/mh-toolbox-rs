"""把装备 / 武器的图标换成客户端 `item120` 大图（透明底），并回填清单的 `source`。

## 与 `import-client-icons.py` 的分工

那个脚本处理**灵饰 / 玉魄**——那两批物品少（20 + 2），名字在游戏里唯一，直接按名字查
`names.csv` 就够。装备 83 件、武器 229 件不行：**同名物品在客户端里不止一个**
（`如意` 同时是环圈、法宝、道具；`龙筋` 同时是鞭和材料；`月光` 同时是环圈和双短剑），
按名字取会静默抓到别的道具——画面上只是「看起来像」，不报错。这一批全部改按**物品编号段**
定位，见下节。

## 取哪一张：不是名字，是编号

每件物品在 `static-item-name-map.json` 里是 `{itemId, name, icons[{size, md5}]}`。同名的
多条记录之间，靠 **itemId 落在哪个段** 区分。两类的段规则不同：

- **武器**：21 组，每组有固定起始 `base`，组内按等级偏移——60/70/80 三档是 `base+7/8/9`，
  90 级三款是 `+50/51/52`，120 级三款是 `+60/61/62`，150 是 `+70`，160 是 `+80`。
  `base` 由「所有候选 id 减去对应偏移」投票得出，票数不过半直接报错（宁可停下，不猜）。
- **装备**：7 部位，全部落在 `2000–2999` 段内。段内仍有重名时，用**相邻锚点**收敛——
  取左右最近的两个「唯一候选」条目，只接受 id 落在两者之间的候选。

再加一条兜底断言：解析出的 itemId 必须**沿列表严格递增**（清单是按等级排的）。不递增说明
映射错位，直接退出——这条比任何抽查都便宜。

## 解码

`item120` 的图在 `res/itemN.wpk` 包里，索引是 `res/item.idx`（每 28 字节一条：md5、偏移、
包号）。解码要过 `container` + `was-variants` 两段，由外部提取工程的 `slot-icons.cjs` 完成
（读 targets.json → 输出 PNG）。本脚本只负责「算 targets → 归一 → 写 webp → 回填清单」。

## 归一

与灵饰 / 玉魄同一套：裁 alpha ≤ 8 的透明边 → 最长边缩到 108 → 居中放进 120×120 透明画布
→ webp q92。原图 106~120 不等，不归一会「大件显大、小件显小」。

## 缺图怎么办

客户端是按需下载的，`item120` 不一定在本地。**缺的条目保留原截图（96×96 带卡片底）**，
清单里 `source` 记 `shot`；有图的记 `item120`。混用状态写在数据里，不靠文档记。
下次客户端补下来重跑，只覆盖文件与改字段。

## 重跑

    python tools/game-icons/import-slot-icons.py                 # 装备 + 武器
    python tools/game-icons/import-slot-icons.py --only gear     # 只装备
    python tools/game-icons/import-slot-icons.py --check         # 只报告覆盖，不写任何文件
    python tools/game-icons/import-slot-icons.py --extract D:/x  # 换提取工程目录
    python tools/game-icons/import-slot-icons.py --client E:/y   # 换客户端目录
"""

from __future__ import annotations

import argparse
import json
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXTRACT = Path(r'E:\zhijian\mh-tool\.workbuddy\game-icon-extract')
DEFAULT_CLIENT = Path(r'E:\zhijian\mhxy')

# 每组武器的条目数不固定，偏移按「第几条」对：60/70/80 三档，90 三款，120 三款，150，160。
OFFSETS = [7, 8, 9, 50, 51, 52, 60, 61, 62, 70, 80]

GEAR_RANGE = (2000, 2999)

SIZE = 120          # 画布边长
INNER = 108         # 图形最长边
TRIM_ALPHA = 8      # 低于这个 alpha 算透明
QUALITY = 92

GROUPS = {'gear': 'gear-icons.json', 'weapon': 'weapon-icons.json'}


def load_json(path: Path):
    return json.load(open(path, encoding='utf-8'))


def local_md5(client: Path) -> set[str]:
    """`res/item.idx` 里已有的图片（= 本地能解出来的）。"""
    raw = (client / 'res' / 'item.idx').read_bytes()
    count = struct.unpack('<I', raw[12:16])[0]
    return {raw[32 + i * 28: 32 + i * 28 + 16].hex() for i in range(count)}


def index_by_name(extract: Path) -> dict[str, list[tuple[int, str]]]:
    """同名物品会有多条记录，全部留下，后面按编号段筛。"""
    table: dict[str, list[tuple[int, str]]] = {}
    for item in load_json(extract / 'static-item-name-map.json')['items']:
        for icon in item['icons']:
            if icon['size'] == 120:
                table.setdefault(item['name'], []).append((item['itemId'], icon['md5']))
    return table


def weapon_base(items, table, group: str) -> int:
    """用「候选 id − 偏移」投票求本组的起始编号。"""
    votes = Counter()
    for entry, offset in zip(items, OFFSETS):
        for item_id, _ in table.get(entry['name'], []):
            votes[item_id - offset] += 1
    if not votes:
        raise SystemExit('{} 一件候选都没有——名字表变了？'.format(group))
    base, count = votes.most_common(1)[0]
    if count * 2 <= len(items):
        raise SystemExit('{} 的起始编号投票只有 {}/{} 过半——编号段规则在这组不成立，停下来人工看'
                         .format(group, count, len(items)))
    return base


def resolve(items, table, kind: str, group: str) -> list[tuple[dict, list[tuple[int, str]]]]:
    """给每条清单项算出候选集合（可能为空 = 名字表里根本没有）。"""
    if kind == 'weapon':
        base = weapon_base(items, table, group)
        lo, hi = base + 1, base + 99
    else:
        lo, hi = GEAR_RANGE

    cands = [sorted(c for c in table.get(e['name'], []) if lo <= c[0] <= hi) for e in items]

    # 装备：段内仍有重名时用相邻锚点收敛（武器这一步通常用不上，也不该改变什么）
    anchor: list[int | None] = [c[0][0] if len(c) == 1 else None for c in cands]
    for i, cs in enumerate(cands):
        if anchor[i] is not None or len(cs) <= 1:
            continue
        left = next((anchor[j] for j in range(i - 1, -1, -1) if anchor[j] is not None), lo)
        right = next((anchor[j] for j in range(i + 1, len(anchor)) if anchor[j] is not None), hi + 1)
        inside = [c for c in cs if left < c[0] < right]
        if len(inside) == 1:
            anchor[i] = inside[0][0]

    out = []
    for i, cs in enumerate(cands):
        picked = [c for c in cs if c[0] == anchor[i]] if anchor[i] is not None else cs
        out.append((items[i], picked or cs))
    return out


def normalize(im: Image.Image) -> Image.Image:
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--extract', default=str(DEFAULT_EXTRACT))
    parser.add_argument('--client', default=str(DEFAULT_CLIENT))
    parser.add_argument('--only', choices=sorted(GROUPS))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    extract = Path(args.extract)
    table = index_by_name(extract)
    have = local_md5(Path(args.client))
    decode = extract / 'slot-icons.cjs'
    if not decode.exists():
        raise SystemExit('找不到解码脚本 {}——它属于提取工程，不在本仓库'.format(decode))

    kinds = [args.only] if args.only else list(GROUPS)
    targets: list[dict] = []
    plans: dict[str, dict] = {}

    for kind in kinds:
        manifest_path = ROOT / 'public/game/data' / GROUPS[kind]
        manifest = load_json(manifest_path)
        plans[kind] = manifest
        for group, items in manifest['groups'].items():
            for entry, cands in resolve(items, table, kind, '{} {}'.format(kind, group)):
                if not cands:
                    continue
                item_id, md5 = cands[0]
                if md5 not in have:
                    continue
                targets.append({'id': entry['id'], 'md5': md5, 'name': entry['name'],
                                'kind': kind, 'group': group, 'level': entry.get('level'),
                                'itemId': item_id})

    # 兜底断言，两条：
    # ① 不同等级段之间编号必须递增（base 求错时最先破的就是它）；
    # ② 组内不许两条清单项落到同一个 itemId（段内重名筛错时是这种形态）。
    # **段内允许倒序**：伞组 120 那三款在客户端里是 31362/61/60，而清单顺序是
    # 碧火琉璃 / 雪羽穿云 / 月影星痕——名字与编号各自都对，只是两者顺序相反。
    # 一开始写成「沿清单严格递增」，在这里误报过一次。
    for kind, manifest in plans.items():
        for group in manifest['groups']:
            picked = [t for t in targets if t['kind'] == kind and t['group'] == group]
            if len({t['itemId'] for t in picked}) != len(picked):
                raise SystemExit('{} / {} 有两条落到同一个 itemId——段内重名筛错了'
                                 .format(kind, group))
            by_level: dict[int, list[int]] = {}
            for t in picked:
                by_level.setdefault(t['level'] or 0, []).append(t['itemId'])
            levels = sorted(by_level)
            for low, high in zip(levels, levels[1:]):
                if max(by_level[low]) >= min(by_level[high]):
                    raise SystemExit('{} / {} 的 {} 级段编号不小于 {} 级段（{} vs {}）——'
                                     '映射错位，停下核对'
                                     .format(kind, group, low, high,
                                             by_level[low], by_level[high]))

    total = sum(len(v) for m in plans.values() for v in m['groups'].values())
    print('{}/{} 件有 item120'.format(len(targets), total))
    for kind, manifest in plans.items():
        for group, items in manifest['groups'].items():
            got = sum(1 for e in items if any(t['id'] == e['id'] for t in targets))
            print('  {:8s} {:5s} {:3d}/{:3d}'.format(kind, group, got, len(items)))

    if args.check:
        print('（check，未写文件）')
        return 0

    staging = ROOT / '.runtime' / 'slot-120'
    staging.mkdir(parents=True, exist_ok=True)
    spec = ROOT / '.runtime' / 'slot-targets.json'
    spec.write_text(json.dumps(targets, ensure_ascii=False), encoding='utf-8')
    subprocess.run(['node', str(decode), str(spec), str(staging)], check=True)

    done = 0
    for kind, manifest in plans.items():
        out_dir = ROOT / 'public/game/icons' / kind
        index = {t['id']: t for t in targets}
        for group, items in manifest['groups'].items():
            for entry in items:
                target = index.get(entry['id'])
                png = staging / (entry['id'] + '.png')
                if target and png.exists():
                    normalize(Image.open(png)).save(
                        out_dir / entry['img'], 'WEBP', quality=QUALITY, method=6)
                    entry['source'] = 'item120'
                    done += 1
                else:
                    entry['source'] = 'shot'
        manifest['generated-by'] = 'tools/game-icons/import-slot-icons.py'
        manifest_path = ROOT / 'public/game/data' / GROUPS[kind]
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')

    shot = total - done
    print('写入 {} 张；仍用截图 {} 张（清单里 source=shot）'.format(done, shot))
    return 0


if __name__ == '__main__':
    sys.exit(main())

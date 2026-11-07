"""导入已校正的召唤兽技能素材包，保留 PNG 原像素与来源，不缩放或转有损格式。

    python tools/game-icons/import-pet-skill-icons.py
    python tools/game-icons/import-pet-skill-icons.py --src D:/召唤兽技能专用包

生成 public/game/data/pet-skills.json 与 icons/pet-{basic,advanced,super,special}/。
技能按官网字符串 ID 关联；名称和分类只从来源清单读取，不按名称前缀推断。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path('C:/games/MHXY-icons/召唤兽技能专用包')
CATEGORY_DIRS = {
    'basic': 'pet-basic',
    'advanced': 'pet-advanced',
    'super': 'pet-super',
    'special': 'pet-special',
}
CORRECTED_HASHES = {
    '302': '3131b8e2dbc05e88315ba514faf176ae658ce92d4072974cae6237b0beceb6a5',
    '310': '3676feebf25c5dc6520c4c6fd35fbef314ccf5e4461802b969231cb3962197f2',
    '402': '5232eb2946757037d0c94ea6c2829bfcc5b66aaef06890007a57b0824c2144e3',
    '410': '531ec899f07286140054f046ad801880e2c0577302bde37bdc05eda0b81948bd',
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', type=Path, default=DEFAULT_SRC)
    args = parser.parse_args()
    source_root = args.src.resolve()
    manifest = json.loads((source_root / 'manifest.json').read_text(encoding='utf-8'))
    categories = {}
    icons = []
    pending = []
    seen = set()
    for row in manifest['icons']:
        skill_id = row['id']
        if not isinstance(skill_id, str) or not skill_id.isascii() or not skill_id.isdigit():
            raise ValueError(f'无效技能 ID：{skill_id}')
        if skill_id in seen:
            raise ValueError(f'重复技能 ID：{skill_id}')
        seen.add(skill_id)
        category_id = row['categoryId']
        directory = CATEGORY_DIRS[category_id]
        categories[category_id] = row['category']
        source = (source_root / row['icon']).resolve()
        if not source.is_relative_to(source_root):
            raise ValueError(f'来源路径越界：{skill_id}')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if skill_id in CORRECTED_HASHES and digest != CORRECTED_HASHES[skill_id]:
            raise ValueError(f'反击/冥思纠错图标与已核对版本不一致：{skill_id}')
        icon = {key: row[key] for key in (
            'id', 'name', 'displayName', 'categoryId', 'subgroup', 'scope',
        )}
        icon['img'] = f'{directory}-{skill_id}.png'
        icon.update({key: row[key] for key in ('width', 'height', 'provenance')})
        icon['sha256'] = digest
        icon['resourceMd5'] = row['resourceMd5']
        icons.append(icon)
        pending.append((source, ROOT / 'public/game/icons' / directory / icon['img']))
    if not set(CORRECTED_HASHES).issubset(seen):
        raise ValueError('来源缺少已校正的反击/冥思四个技能')
    missing = []
    for row in manifest['missing']:
        skill_id = row['id']
        if skill_id in seen:
            raise ValueError(f'缺图项 ID 重复：{skill_id}')
        seen.add(skill_id)
        item = {key: row[key] for key in (
            'id', 'name', 'displayName', 'categoryId', 'subgroup', 'scope', 'reason',
        )}
        item['img'] = None
        missing.append(item)
    result = {
        'schemaVersion': 1,
        'generated-by': 'tools/game-icons/import-pet-skill-icons.py',
        'checkedAt': manifest['summary']['checkedAt'],
        'sources': {
            'catalogue': 'https://cbg-xyq.res.netease.com/js/game_auto_config.js',
            'officialIconTemplate': 'https://cbg-xyq.res.netease.com/images/pet_child_skill/{id至少4位}.gif',
            'client': 'C:/games/MHXY（只读提取）',
            'pack': '召唤兽技能专用包/manifest.json',
            'correction': '2026-11-07 用户反馈及官网具名 GIF 复核：反击、冥思低级为蓝色，高级为红色。',
        },
        'categories': [
            {'id': key, 'name': categories[key], 'iconDir': directory}
            for key, directory in CATEGORY_DIRS.items()
        ],
        'icons': icons,
        'missing': missing,
    }
    for source, destination in pending:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    target = ROOT / 'public/game/data/pet-skills.json'
    with target.open('w', encoding='utf-8', newline='\r\n') as handle:
        handle.write(json.dumps(result, ensure_ascii=False, indent=4) + '\n')
    print(f'已导入 {len(icons)} 张召唤兽技能 PNG；缺图名称保留 {len(missing)} 项。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

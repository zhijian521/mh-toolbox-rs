import { describe, expect, it } from 'vitest';
import { GEAR_ACTIVES } from '../views/characters/character';
import { LIFE_SKILLS, STORY_SKILLS } from '../views/characters/skills';

/**
 * 图标文件与清单的一致性。
 *
 * 这批图标是从游戏截图里切出来的（`tools/game-icons/slice.py`），文件按**顺序**编号
 * （`skill-01` 就是生活技能表的第 1 项）。序号是唯一的连接方式，所以最要紧的一条是
 * **「第 n 个图标的名字 = 名字表的第 n 项」**——它一旦错了，界面上的图标会张冠李戴，
 * 而且看不出错：图标都是些纹样，谁也不会怀疑「举重的人形」不是强身术。
 *
 * 其余几条（存在、无孤儿、id 唯一）与地图那组同理：文件与清单必须一一对应。
 */
interface IconEntry {
    id: string;
    name: string;
}

const ICON_DIR = '/public/game/icons/';
const ICONS = import.meta.glob('/public/game/icons/*.webp');
const DATA = import.meta.glob('/public/game/data/*.json');

const jsonKey = Object.keys(DATA).find((key) => key === '/public/game/data/icons.json');
if (!jsonKey) {
    throw new Error(
        `public/game/data/icons.json 不存在（data/ 里 glob 到 ${Object.keys(DATA).length} 个文件）；` +
            '跑一遍 python tools/game-icons/slice.py',
    );
}

const manifest = (await DATA[jsonKey]()) as { groups: Record<string, IconEntry[]> };

const files = Object.keys(ICONS).map((key) => key.slice(ICON_DIR.length));

const all = Object.entries(manifest.groups).flatMap(([kind, entries]) =>
    entries.map((entry) => ({ ...entry, kind })),
);

describe('游戏图标清单', () => {
    it('每条记录都有对应的 webp', () => {
        const existing = new Set(files);
        const missing = all
            .filter((entry) => !existing.has(`${entry.id}.webp`))
            .map((entry) => `${entry.id}（${entry.name}）`);
        expect(missing, '清单里有、目录里没有：界面上那个位置会是一片空白').toEqual([]);
    });

    it('目录里每个 webp 都在清单里', () => {
        const listed = new Set(all.map((entry) => `${entry.id}.webp`));
        const orphans = files.filter((file) => !listed.has(file)).sort();
        expect(orphans, '目录里有、清单里没有：这张图永远不会被用到').toEqual([]);
    });

    it('id 唯一', () => {
        const ids = all.map((entry) => entry.id);
        expect(new Set(ids).size, 'id 重复会让查找命中第一条').toBe(ids.length);
    });

    it('三组数量与名字表一致', () => {
        expect(manifest.groups.skill?.length, '生活技能图标数').toBe(LIFE_SKILLS.length);
        expect(manifest.groups.story?.length, '剧情技能图标数').toBe(STORY_SKILLS.length);
        expect(manifest.groups.active?.length, '装备特技图标数').toBe(GEAR_ACTIVES.length);
    });

    it('第 n 个图标的名字就是名字表的第 n 项', () => {
        // 这条是本文件的核心：序号是图标与业务数据之间唯一的连接，错位不会报任何错。
        expect(manifest.groups.skill.map((entry) => entry.name)).toEqual([...LIFE_SKILLS]);
        expect(manifest.groups.story.map((entry) => entry.name)).toEqual([...STORY_SKILLS]);
        expect(manifest.groups.active.map((entry) => entry.name)).toEqual([...GEAR_ACTIVES]);
    });
});

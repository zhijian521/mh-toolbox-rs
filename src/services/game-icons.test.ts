import { describe, expect, it } from 'vitest';
import { GEAR_ACTIVES } from '../views/characters/character';
import { lifeSkills, storySkills } from './game-data';
import './game-data.fixture';
import { assistIcon, lifeSkillIcon, storySkillIcon } from './game-icons';

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
        expect(manifest.groups.skill?.length, '生活技能图标数').toBe(lifeSkills().length);
        expect(manifest.groups.story?.length, '剧情技能图标数').toBe(storySkills().length);
        expect(manifest.groups.active?.length, '装备特技图标数').toBe(GEAR_ACTIVES.length);
    });

    it('第 n 个图标的名字就是名字表的第 n 项', () => {
        // 这条是本文件的核心：序号是图标与业务数据之间唯一的连接，错位不会报任何错。
        expect(manifest.groups.skill.map((entry) => entry.name)).toEqual([...lifeSkills()]);
        expect(manifest.groups.story.map((entry) => entry.name)).toEqual([...storySkills()]);
        expect(manifest.groups.active.map((entry) => entry.name)).toEqual([...GEAR_ACTIVES]);
    });
});

describe('名字 → 图标路径', () => {
    const base = import.meta.env.BASE_URL;

    it('按名字表的下标拼文件名', () => {
        // 名字表第 1 项就是 skill-01，两边靠顺序对齐（上面那条断言盯着同一件事）。
        expect(lifeSkillIcon('强身术')).toBe(`${base}game/icons/skill-01.webp`);
        expect(lifeSkillIcon('雪之感应')).toBe(`${base}game/icons/skill-21.webp`);
        expect(storySkillIcon('调息')).toBe(`${base}game/icons/story-01.webp`);
        expect(storySkillIcon('火眼金睛')).toBe(`${base}game/icons/story-11.webp`);
    });

    it('不在表里的名字不给路径（用户手敲的、游戏新加的）', () => {
        expect(lifeSkillIcon('不存在的技能')).toBeUndefined();
        expect(storySkillIcon('强身术')).toBeUndefined();
        // 两类各查各的表：生活技能名去剧情表里查不到。
        expect(assistIcon('强身术', 'story')).toBeUndefined();
        expect(assistIcon('调息', 'life')).toBeUndefined();
    });
});

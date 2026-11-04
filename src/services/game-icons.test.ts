import { describe, expect, it } from 'vitest';
import { gameData, lifeSkills, storySkills } from './game-data';
import './game-data.fixture';
import { assistIcon, lifeSkillIcon, storySkillIcon } from './game-icons';

/**
 * 装备特技（`icons.json` 的 `active` 组，69 项）的名字表。
 *
 * 正本是 `views/characters/character.ts` 的 `GEAR_ACTIVES`。这里之所以是一份**副本**：
 * `services/` 不许 import `views/`——那一层装的是系统能力与跨页纯规则
 * （`docs/ARCHITECTURE.md` §1 的分层、§4 的归类表），反过来依赖某个页面的数据，
 * 依赖方向就倒了：那个页面一改名 / 一拆文件，这里就得跟着改。而这条比对又不能不做：图标按**序号**命名（`active-01`
 * 就是名字表第 1 项），序号和名字对不上时不会有任何报错，只是界面上的特技配了别人的图。
 *
 * 代价是「改 `GEAR_ACTIVES` 时要记得也改这里」。忘了的话，重跑
 * `tools/game-icons/slice.py` 之后这条测试会红在「名字对不上」，方向是安全的；
 * 等 `docs/GAME-ASSETS.md` 规划的 `public/game/data/gear.json` 落地，正本与这份副本
 * 一起改成读那张表，这段就该删掉。
 */
const ACTIVES = [
    '气疗术',
    '心疗术',
    '命疗术',
    '凝气诀',
    '凝神诀',
    '气归术',
    '命归术',
    '四海升平',
    '回魂咒',
    '起死回生',
    '水清诀',
    '冰清诀',
    '玉清诀',
    '晶清诀',
    '诅咒之伤',
    '诅咒之亡',
    '笑里藏刀',
    '绝幻魔音',
    '野兽之力',
    '魔兽之印',
    '光辉之甲',
    '圣灵之甲',
    '流云诀',
    '啸风诀',
    '太极护法',
    '罗汉金钟',
    '修罗咒',
    '天衣无缝',
    '放下屠刀',
    '河东狮吼',
    '破甲术',
    '碎甲术',
    '凝滞术',
    '停陷术',
    '破血狂攻',
    '弱点击破',
    '吸血',
    '残月',
    '冥王暴杀',
    '乾坤斩',
    '破碎无双',
    '帝释无双',
    '伽罗无双',
    '虚空之刃',
    '亡灵之刃',
    '死亡之音',
    '身似菩提',
    '心如明镜',
    '慈航普度',
    '移形换影',
    '凝心诀',
    '聚精会神',
    '先发制人',
    '燃烧之光',
    '毁灭之光',
    '金刚不坏',
    '菩提心佑',
    '金刚怒目',
    '琴音三叠',
    '乾坤挪移',
    '疾风荡魄',
    '玄鸟之灵',
    '神鸟之印',
    '伯牙绝弦',
    '焚琴煮鹤',
    '攻心术',
    '惊心术',
    '妙法之护',
    '神机之护',
];

/**
 * 图标文件与清单的一致性。
 *
 * 这批图标是从游戏截图里切出来的（`tools/game-icons/slice.py`），文件按**顺序**编号
 * （`skill-01` 就是生活技能表的第 1 项）。序号是唯一的连接方式，所以最要紧的一条是
 * **「第 n 个图标的名字 = 名字表的第 n 项」**——它一旦错了，界面上的图标会张冠李戴，
 * 而且看不出错：图标都是些纹样，谁也不会怀疑「举重的人形」不是强身术。
 *
 * 其余几条（存在、无孤儿、id 唯一）与地图那组同理：文件与清单必须一一对应。
 *
 * 门派技能走 `data/school-icons.json`（另一支脚本 `slice-school.py` 生成）。
 * 两份清单都算进「目录里的图有没有人认领」——只算一份的话，另一批图会被当成孤儿，
 * 而反过来（两批都写进同一份清单）又会被后跑的脚本互相清掉，所以清单分开、检查合并。
 */
interface IconEntry {
    id: string;
    name: string;
}

interface SchoolIconEntry extends IconEntry {
    school: string;
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

const schoolKey = Object.keys(DATA).find((key) => key === '/public/game/data/school-icons.json');
if (!schoolKey) {
    throw new Error(
        'public/game/data/school-icons.json 不存在；跑一遍 python tools/game-icons/slice-school.py',
    );
}

const manifest = (await DATA[jsonKey]()) as { groups: Record<string, IconEntry[]> };
const schoolManifest = (await DATA[schoolKey]()) as { groups: Record<string, SchoolIconEntry[]> };

const files = Object.keys(ICONS).map((key) => key.slice(ICON_DIR.length));

const all = [
    ...Object.entries(manifest.groups).flatMap(([kind, entries]) =>
        entries.map((entry) => ({ ...entry, kind })),
    ),
    ...Object.entries(schoolManifest.groups).flatMap(([kind, entries]) =>
        entries.map((entry) => ({ ...entry, kind })),
    ),
];

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
        expect(manifest.groups.active?.length, '装备特技图标数').toBe(ACTIVES.length);
    });

    it('第 n 个图标的名字就是名字表的第 n 项', () => {
        // 这条是本文件的核心：序号是图标与业务数据之间唯一的连接，错位不会报任何错。
        expect(manifest.groups.skill.map((entry) => entry.name)).toEqual([...lifeSkills()]);
        expect(manifest.groups.story.map((entry) => entry.name)).toEqual([...storySkills()]);
        expect(manifest.groups.active.map((entry) => entry.name)).toEqual([...ACTIVES]);
    });
});

describe('门派技能图标', () => {
    const schools = gameData().schools.schools;

    it('每家每一项技能都有图标，名字与该门派技能表一致', () => {
        for (const school of schools) {
            const entries = schoolManifest.groups.skill.filter(
                (entry) => entry.school === school.id,
            );
            expect(entries.length, `${school.name} 的技能图标数`).toBe(school.skills.length);
            // 按**集合**比：图标按面板顺序编号，schools.json 按重要度排，两份顺序本来就不同。
            // 顺序差异不是错，名字对不上才是。
            expect(new Set(entries.map((entry) => entry.name)), `${school.name} 的技能名`).toEqual(
                new Set(school.skills),
            );
        }
    });

    it('每张图的 school 都在门派表里', () => {
        const ids = new Set(schools.map((school) => school.id));
        const stray = schoolManifest.groups.skill
            .filter((entry) => !ids.has(entry.school))
            .map((entry) => `${entry.id}（${entry.name}）`);
        expect(stray, '门派 id 改了名、或者图还是旧的').toEqual([]);
    });

    it('文件名带 school-skill- 前缀，不与门派徽记混族', () => {
        // 前缀是「这张图是什么」的唯一线索：`school-datang.webp` 是徽记，
        // `school-datang-1.webp` 光看文件名分不清，所以技能必须带子类。
        expect(schoolManifest.groups.skill.every((e) => e.id.startsWith('school-skill-'))).toBe(
            true,
        );
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

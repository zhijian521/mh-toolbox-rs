import { describe, expect, it } from 'vitest';
import { gameData, lifeSkills, parseSchoolTable, schoolNames, storySkills } from './game-data';
import './game-data.fixture';

/**
 * `public/game/data/` 里那两张表本身是否成立。
 *
 * 这两条测试不是「测代码」，是**把 `docs/GAME-ASSETS.md` 的承诺变成断言**：
 * 数据搬出代码之后，唯一还会红的东西就是它们。名字错一个字、门派少一家、
 * 生活与剧情串了项——页面全都照常渲染，只是卡上少一项、图标配错，谁也看不出来。
 *
 * 读的是**真文件**（`game-data.fixture` 直接模块导入两份 JSON），不是手搓的假清单。
 */
describe('门派表（game/data/schools.json）', () => {
    const table = gameData().schools;

    it('二十一个门派，每家七项', () => {
        expect(table.schools).toHaveLength(21);
        for (const school of table.schools) {
            expect(school.skills, `${school.name} 的技能条数`).toHaveLength(7);
        }
    });

    it('上限是 180', () => {
        /* 用户 2026-11-02 确认的。它同时喂给 `schoolSkills()` 与编辑器的只读 `/180`，
         * 两边读同一个数——分开写就有一处会漂。 */
        expect(table.cap).toBe(180);
    });

    it('id 只含 [a-z0-9-] 且不重复；名字不重复', () => {
        /* id 会进 URL 与将来的存档，中文名不该出现在里面；重名的门派会让下拉出现
         * 两个一模一样的选项，而 `schoolSkills()` 按名字查表，第二个永远查不到。 */
        const ids = table.schools.map((school) => school.id);
        expect(
            ids.filter((id) => !/^[a-z0-9-]+$/.test(id)),
            'id 含非法字符',
        ).toEqual([]);
        expect(new Set(ids).size, 'id 有重复').toBe(ids.length);

        const names = schoolNames();
        expect(new Set(names).size, '门派名有重复').toBe(names.length);
    });

    it('同一门派里技能不重复、名字两端没有空白', () => {
        for (const school of table.schools) {
            expect(new Set(school.skills).size, `${school.name} 的技能名有重复`).toBe(
                school.skills.length,
            );
            const dirty = school.skills.filter((name) => name !== name.trim());
            expect(dirty, `${school.name} 的技能名带了空白：${dirty.join(' / ')}`).toEqual([]);
        }
    });
});

describe('技能名录（game/data/skills.json）', () => {
    it('生活 21 项、剧情 11 项', () => {
        /* 这两个数字与 `public/game/icons/` 里 `skill-*` / `story-*` 的文件数**是同一件事**：
         * 图标按名字表的序号命名，条数一变，全部序号整体错位（`game-icons.test.ts` 也盯着）。 */
        expect(lifeSkills()).toHaveLength(21);
        expect(storySkills()).toHaveLength(11);
    });

    it('两张表不重叠、各自内部不重复', () => {
        /* 重叠会让「强身术 100」与「强身术 5」读成同一个技能的两种刻度；
         * 剧情技能最高 5 级，混进生活表会被误判成「才练了 5 级」。 */
        const story = new Set(storySkills());
        const both = lifeSkills().filter((name) => story.has(name));
        expect(both, `这两项同时出现在两张表里：${both.join('、')}`).toEqual([]);

        expect(new Set(lifeSkills()).size, '生活技能表有重复').toBe(lifeSkills().length);
        expect(new Set(storySkills()).size, '剧情技能表有重复').toBe(storySkills().length);
    });
});

describe('校验器', () => {
    /* 校验只查形状，不查业务：「每家七个」是测试的事，写进校验器就等于说
     * 「游戏加了第八项时，先改代码才能用新数据」——那正好违反搬出来这件事的初衷。 */
    const good = { cap: 180, schools: [{ id: 'datang', name: '大唐官府', skills: ['为官之道'] }] };

    it('缺 cap / 空 schools / 技能不是字符串数组都会报错', () => {
        expect(() => parseSchoolTable({ schools: good.schools })).toThrow(/cap/);
        expect(() => parseSchoolTable({ cap: 180, schools: [] })).toThrow(/schools/);
        expect(() =>
            parseSchoolTable({ cap: 180, schools: [{ id: 'a', name: 'A', skills: [1] }] }),
        ).toThrow(/skills/);
    });

    it('形状对了就原样接住，不擅自补字段', () => {
        const parsed = parseSchoolTable(good);
        expect(parsed.cap).toBe(180);
        expect(parsed.schools[0]).toEqual({ id: 'datang', name: '大唐官府', skills: ['为官之道'] });
    });
});

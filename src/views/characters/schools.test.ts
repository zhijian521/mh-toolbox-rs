import { describe, expect, it } from 'vitest';
import { schoolNames, schoolSkillCap } from '../../services/game-data';
import '../../services/game-data.fixture';
import type { SkillRow } from './character';
import { CHARACTERS } from './mock';
import { schoolSkillNames, schoolSkills } from './schools';

/**
 * 门派技能的**规则**（表本身的完整性在 `services/game-data.test.ts`）。
 *
 * 这张表是**带下拉的唯一数据源**：`CharacterEditor` 选中门派就用它重建技能表。
 * 它错一项，卡上就少一项、图标也查不到，而页面照常渲染——这类错误只在
 * 「有人一条一条对过游戏面板」时才看得见，所以能盯的部分都用断言盯着。
 */
describe('种子角色与门派表', () => {
    it('每个种子角色的门派技能都出自自己门派那张表', () => {
        /* 这条是**反证出来才写的**：2026-11-03 之前 `mock.ts` 里化生寺那个号填着
         * 「推气过宫」「韦陀护法」——七项里只有两项是真的。当时没有任何断言会红，
         * 因为那时门派技能还是手输的自由列表。 */
        for (const character of CHARACTERS) {
            if (!character.school) continue;
            const table = new Set(schoolSkillNames(character.school) ?? []);
            for (const row of character.skills) {
                expect(
                    table.has(row.name),
                    `${character.name}（${character.school}）的门派技能「${row.name}」不在该门派的表里`,
                ).toBe(true);
            }
        }
    });

    it('种子角色的门派都在下拉里', () => {
        const names = new Set(schoolNames());
        const missing = CHARACTERS.map((character) => character.school).filter(
            (school) => school && !names.has(school),
        );
        expect(missing, '这些门派在表里查不到，下拉会显示「不在表里」').toEqual([]);
    });
});

describe('schoolSkills', () => {
    const previous: SkillRow[] = [
        { name: '周易学', level: 120, cap: 180 },
        { name: '别的门派技能', level: 60, cap: 180 },
    ];

    it('选门派后给出七项，上限取表里的 cap', () => {
        const rows = schoolSkills('五庄观');
        expect(rows.map((row) => row.name)).toEqual(schoolSkillNames('五庄观'));
        expect(rows.every((row) => row.cap === schoolSkillCap())).toBe(true);
        expect(rows.every((row) => row.level === 0)).toBe(true);
    });

    it('同名保留等级，不同名归零', () => {
        // 「转门派之后练过的等级大多跟着走」，先选错再选对也不该清掉刚填的数字。
        const rows = schoolSkills('五庄观', previous);
        expect(rows.find((row) => row.name === '周易学')?.level).toBe(120);
        // 上一版里那条不属于本门派的技能，不会跟着进来。
        expect(rows.some((row) => row.name === '别的门派技能')).toBe(false);
    });

    it('认不出的门派不动原表（未选、错字、将来新增的门派）', () => {
        expect(schoolSkills('', previous)).toBe(previous);
    });
});

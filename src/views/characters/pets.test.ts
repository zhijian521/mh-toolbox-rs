import { describe, expect, it } from 'vitest';
import {
    PET_PILL_SLOTS,
    PET_PREVIEW_SKILLS,
    PET_PREVIEW_STATS,
    PET_SKILL_SLOTS,
    joinShort,
    lifeLow,
    petDetailSlots,
    previewSkills,
    previewStats,
    type Pet,
} from './pets';

/**
 * 召唤兽「概览牌 / 详情档案」的取数口径。
 *
 * 这一组函数是 2026-11-05 从模板里提出来的：卡上要画五格、四个名字与一个差额，
 * 详情页要画六票、八行、十二格。放在模板里算的话，同一条口径会在两处各写一遍，
 * 而它们的正确性**只有眼睛能验**——卡片上少一格、顺序错位，看起来都"挺正常"。
 */

/** 造一只只有必要字段的兽，其余给空值。 */
function pet(over: Partial<Pet> = {}): Pet {
    return {
        name: '试兽',
        level: 100,
        joinLevel: 50,
        quality: { attack: 1000, defense: 1000, hp: 2000, mp: 1500, speed: 1000, dodge: 1000 },
        life: 200,
        growth: '1.100',
        element: '火',
        attrs: [],
        skills: [],
        innerPills: [],
        ...over,
    };
}

describe('概览五格', () => {
    it('按固定顺序取气血 / 攻击 / 防御 / 速度 / 法伤', () => {
        const rows = previewStats(
            pet({
                attrs: [
                    { label: '法伤', value: '747' },
                    { label: '气血', value: '1773' },
                    { label: '速度', value: '288' },
                    { label: '攻击', value: '2044' },
                    { label: '防御', value: '724' },
                ],
            }),
        );
        expect(rows.map((row) => row.label)).toEqual([...PET_PREVIEW_STATS]);
        expect(rows.map((row) => row.value)).toEqual(['1773', '2044', '724', '288', '747']);
    });

    it('缺项给空串，且**不省略那一格**', () => {
        const rows = previewStats(pet({ attrs: [{ label: '气血', value: '900' }] }));
        expect(rows).toHaveLength(5);
        expect(rows[0]).toEqual({ label: '气血', value: '900' });
        // 后面四格留着空位：省掉一格会让「速度」那一栏里其实是法伤。
        expect(rows.slice(1).every((row) => row.value === '')).toBe(true);
    });

    it('列表里的其它属性不进概览（魔法 / 法防 / 忠诚）', () => {
        const rows = previewStats(
            pet({
                attrs: [
                    { label: '气血', value: '1' },
                    { label: '魔法', value: '1198' },
                    { label: '法防', value: '747' },
                    { label: '忠诚', value: '90' },
                ],
            }),
        );
        expect(rows.map((row) => row.value)).toEqual(['1', '', '', '', '']);
    });

    it('标签两侧的空白不算另一项', () => {
        const rows = previewStats(pet({ attrs: [{ label: ' 气血 ', value: ' 1200 ' }] }));
        expect(rows[0]).toEqual({ label: '气血', value: '1200' });
    });
});

describe('概览技能行', () => {
    it('超过四个只列前四个，其余报个数', () => {
        const { names, rest } = previewSkills(
            pet({ skills: ['连击', '必杀', '吸血', '偷袭', '神佑', '高级必杀'] }),
        );
        expect(names).toEqual(['连击', '必杀', '吸血', '偷袭']);
        expect(rest).toBe(2);
        expect(PET_PREVIEW_SKILLS).toBe(4);
    });

    it('不足四个时全列，不报 +N', () => {
        const { names, rest } = previewSkills(pet({ skills: ['连击'] }));
        expect(names).toEqual(['连击']);
        expect(rest).toBe(0);
    });

    it('一个都没有时给空数组（模板据此写「无」）', () => {
        expect(previewSkills(pet())).toEqual({ names: [], rest: 0 });
    });
});

describe('参战差额', () => {
    it('带得动是 0', () => {
        expect(joinShort({ joinLevel: 65 }, 130)).toBe(0);
        expect(joinShort({ joinLevel: 130 }, 130)).toBe(0);
    });

    it('带不动报差额', () => {
        expect(joinShort({ joinLevel: 145 }, 130)).toBe(15);
    });

    it('参战等级没填（0）不告警', () => {
        expect(joinShort({ joinLevel: 0 }, 130)).toBe(0);
    });
});

describe('寿命告警', () => {
    it('低于 50 才亮', () => {
        expect(lifeLow(49)).toBe(true);
        expect(lifeLow(50)).toBe(false);
        expect(lifeLow(400)).toBe(false);
    });

    it('0 读作「还没填」，不亮', () => {
        // 编辑器新建一只兽时 life 默认 0；当成告警的话每只刚加的兽一上来就是红的。
        expect(lifeLow(0)).toBe(false);
    });
});

describe('详情格子', () => {
    it('默认留白为技能 12 格、内丹 8 格', () => {
        expect(PET_SKILL_SLOTS).toBe(12);
        expect(PET_PILL_SLOTS).toBe(8);
    });

    it('超过默认格数的技能与内丹不截断，缺少时补空格且不改原记录', () => {
        const names = Array.from({ length: 16 }, (_, i) => `技能${i + 1}`);
        expect(petDetailSlots(names, PET_SKILL_SLOTS)).toEqual(names);
        expect(petDetailSlots(names, PET_PILL_SLOTS)).toEqual(names);
        expect(petDetailSlots(['连击'], 3)).toEqual(['连击', '', '']);
        expect(petDetailSlots(names, 0)).toHaveLength(16);
        expect(names).toHaveLength(16);
    });
});

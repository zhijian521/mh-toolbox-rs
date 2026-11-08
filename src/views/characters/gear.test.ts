import { describe, expect, it } from 'vitest';
import { GEAR_ACTIVES, GEAR_SPECIALS, gearBrief, type BriefGroup, type GearSlot } from './gear';
import { CHARACTERS } from './mock';

describe('装备词表与空白演示数据', () => {
    it('特技和特效各自去重，主动与被动不混用', () => {
        expect(new Set(GEAR_SPECIALS).size).toBe(GEAR_SPECIALS.length);
        expect(new Set(GEAR_ACTIVES).size).toBe(GEAR_ACTIVES.length);
        expect(GEAR_SPECIALS).toContain('神佑');
        expect(GEAR_SPECIALS).not.toContain('起死回生');
        expect(GEAR_ACTIVES).toContain('起死回生');
        expect(GEAR_ACTIVES).not.toContain('神佑');
    });
    it('演示角色保留十二个空部位，不再生成旧装备与摘要值', () => {
        for (const character of CHARACTERS) {
            expect(character.gear).toHaveLength(12);
            expect(character.gear.every((one) => !one.caption && !one.detail)).toBe(true);
            expect(character.gearMeta).toEqual({ special: '', suit: '' });
        }
    });
});

describe('版心摘要', () => {
    /** 摘要里的不换行空格换成普通空格再比，测试读起来才不会被 `\u00A0` 淹掉。 */
    const plain = (value: string) => value.replace(/\u00A0/g, ' ');

    function rowsOf(groups: BriefGroup[]): Record<string, string> {
        const map: Record<string, string> = {};
        for (const group of groups) {
            for (const row of group.rows) map[row.label] = plain(row.value);
        }
        return map;
    }

    function slot(slotName: string, detail: Partial<GearSlot['detail']>): GearSlot {
        return { slot: slotName as GearSlot['slot'], detail: detail as GearSlot['detail'] };
    }

    it('固定三组七行，顺序就是玩家看这套装备的顺序', () => {
        const groups = gearBrief([], { special: '', suit: '' });
        expect(groups.map((group) => group.key)).toEqual(['effect', 'level', 'ambush']);
        expect(groups.flatMap((group) => group.rows).map((row) => row.label)).toEqual([
            '特技',
            '套装',
            '宝石',
            '灵饰',
            '钟灵石',
            '玉魄',
            '奇袭',
        ]);
    });

    it('按独立的装备记录汇总全部七项，不依赖页面演示数据', () => {
        const gear = [
            slot('头', {
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '太阳石' },
                    { label: '锻炼等级', value: '5' },
                ],
                lines: [
                    { label: '特技', value: '起死回生' },
                    { label: '套装', value: '天罡 5 / 5' },
                ],
            }),
            slot('武器', {
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '红玛瑙' },
                    { label: '锻炼等级', value: '4' },
                ],
            }),
            ...(['戒指', '耳饰', '配饰', '手镯'] as const).map((name, index) =>
                slot(name, {
                    stats: [],
                    cond: [
                        { label: '精炼等级', value: ['4', '3', '3', '2'][index] },
                        ...(index === 1 ? [{ label: '钟灵石', value: '3 段' }] : []),
                    ],
                }),
            ),
            slot('玉魄·阴', {
                stats: [],
                cond: [{ label: '灵尘等级', value: '3' }],
                lines: [{ label: '奇袭道具', value: '空' }],
            }),
            slot('玉魄·阳', {
                stats: [],
                cond: [{ label: '灵尘等级', value: '2' }],
                lines: [{ label: '奇袭特技', value: '空' }],
            }),
        ];
        const rows = rowsOf(gearBrief(gear, { special: '', suit: '' }));
        expect(rows['特技']).toBe('起死回生');
        expect(rows['套装']).toBe('天罡 5 / 5');
        expect(rows['宝石']).toBe('太阳石 5 段 · 红玛瑙 4 段');
        expect(rows['灵饰']).toBe('精炼 4 / 3 / 3 / 2');
        expect(rows['钟灵石']).toBe('3 段');
        expect(rows['玉魄']).toBe('灵尘 3 / 2');
        expect(rows['奇袭']).toBe('');
    });

    it('同一套效果写在两件上只算一次', () => {
        const gear = ['头', '衣服'].map((name) =>
            slot(name, { stats: [], lines: [{ label: '套装', value: '慈悲 3/5' }] }),
        );
        const rows = rowsOf(gearBrief(gear, { special: '', suit: '' }));
        expect(rows['套装']).toBe('慈悲 3 / 5');
    });

    it('detail 里一条都读不到时，特技与套装回落到 gearMeta', () => {
        const rows = rowsOf(gearBrief([], { special: '慈航普度', suit: '天罡 5/5' }));
        expect(rows['特技']).toBe('慈航普度');
        // 兜底值是照原样给的，这一层不再动它的空格（拆装是渲染那边的事）。
        expect(rows['套装']).toBe('天罡 5/5');
        // 其余五项没有兜底来源，只能是空——渲染成「—」。
        expect(rows['宝石']).toBe('');
        expect(rows['奇袭']).toBe('');
    });

    it('多件宝石按件列出，段数与品名绑在一起（不会断行断在中间）', () => {
        const gear = [
            slot('头', {
                name: '盔',
                kind: '帽子',
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '太阳石' },
                    { label: '锻炼等级', value: '6' },
                ],
            }),
            slot('武器', {
                name: '枪',
                kind: '长枪',
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '红玛瑙' },
                    { label: '锻炼等级', value: '5' },
                ],
            }),
        ];
        const groups = gearBrief(gear, { special: '', suit: '' });
        const value = groups[1].rows.find((row) => row.key === 'gem')?.value ?? '';
        // 中间是 `\u00A0`，不是普通空格：值只放得下两行，断了就把「段」甩下去。
        expect(value).toBe('太阳石\u00A06\u00A0段 · 红玛瑙\u00A05\u00A0段');
        expect(plain(value)).toBe('太阳石 6 段 · 红玛瑙 5 段');
    });

    it('奇袭道具与奇袭特技合成一行，各带自己的前缀', () => {
        const gear = [
            slot('玉魄·阴', {
                name: '阴',
                kind: '上古玉魄 · 阴',
                stats: [],
                lines: [{ label: '奇袭道具', value: '定神香' }],
            }),
            slot('玉魄·阳', {
                name: '阳',
                kind: '上古玉魄 · 阳',
                stats: [],
                lines: [{ label: '奇袭特技', value: '乾坤妙法' }],
            }),
        ];
        const rows = rowsOf(gearBrief(gear, { special: '', suit: '' }));
        expect(rows['奇袭']).toBe('道具 定神香 · 特技 乾坤妙法');
    });
});

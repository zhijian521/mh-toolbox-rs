import { describe, expect, it } from 'vitest';
import {
    GEAR_ACTIVES,
    GEAR_SPECIALS,
    briefText,
    gearBrief,
    slotMark,
    type BriefGroup,
    type BriefRow,
    type GearSlot,
} from './gear';
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
    function rowsOf(groups: BriefGroup[]): Record<string, BriefRow> {
        const map: Record<string, BriefRow> = {};
        for (const group of groups) {
            for (const row of group.rows) map[row.label] = row;
        }
        return map;
    }

    /** 一行压成 `头6 · 项0`，断言读起来才像界面上的那行字。 */
    const text = (row: BriefRow | undefined) => briefText(row ?? { key: '', label: '', items: [] });

    function slot(slotName: string, detail: Partial<NonNullable<GearSlot['detail']>>): GearSlot {
        return { slot: slotName as GearSlot['slot'], detail: detail as GearSlot['detail'] };
    }

    it('固定两组六行：特技 / 特效 / 套装 · 宝石 / 灵饰 / 玉魄', () => {
        const groups = gearBrief([], { special: '', suit: '' });
        expect(groups.map((group) => group.key)).toEqual(['effect', 'level']);
        expect(groups.flatMap((group) => group.rows).map((row) => row.label)).toEqual([
            '特技',
            '特效',
            '套装',
            '宝石',
            '灵饰',
            '玉魄',
        ]);
    });

    it('段数一行一件、按游戏面板顺序、没练的写 0 并退灰', () => {
        const gear = [
            slot('头', {
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '太阳石' },
                    { label: '锻炼等级', value: '5' },
                ],
                lines: [
                    { label: '特技', value: '起死回生' },
                    { label: '特效', value: '专注' },
                    { label: '套装', value: '天罡 5 / 5' },
                ],
            }),
            slot('武器', {
                stats: [],
                cond: [
                    { label: '镶嵌宝石', value: '红玛瑙' },
                    { label: '锻炼等级', value: '4' },
                ],
                /* 同一件特效常写在两件上，摘要里只列一次。 */
                lines: [{ label: '特效', value: '专注' }],
            }),
            ...(['戒指', '耳饰', '配饰', '手镯'] as const).map((name, index) =>
                slot(name, {
                    stats: [],
                    cond: [
                        { label: '精炼等级', value: ['4', '3', '3', '2'][index] },
                        ...(index === 1 ? [{ label: '钟灵石', value: '固若金汤(1级)' }] : []),
                    ],
                }),
            ),
            slot('玉魄·阴', {
                stats: [],
                cond: [{ label: '灵尘等级', value: '3' }],
                lines: [{ label: '奇袭道具', value: '定神香' }],
            }),
            slot('玉魄·阳', {
                stats: [],
                cond: [{ label: '灵尘等级', value: '2' }],
                lines: [{ label: '奇袭特技', value: '乾坤妙法' }],
            }),
        ];
        const rows = rowsOf(gearBrief(gear, { special: '', suit: '' }));
        expect(rows['特技'].items.map((item) => item.name)).toEqual(['起死回生']);
        /* 特效排在特技下面，同名在两件上只列一次。 */
        expect(rows['特效'].items.map((item) => item.name)).toEqual(['专注']);
        /* 套装名剥掉面板尾部那截「5 / 5」，件数按实际写了这套的部位数算。 */
        expect(rows['套装'].items).toEqual([{ name: '天罡', value: '*1', dim: true }]);
        /* 六件装备固定六个格：头、项链、武器、衣服、腰带、鞋子。 */
        expect(text(rows['宝石'])).toBe('头5 · 项0 · 武4 · 衣0 · 带0 · 鞋0');
        /* 读数三行都进等宽栅格，列数按「值列放得下几枚签」定：六件三列、四件四列、
         * 两件两列。列数不同，但签宽由 CSS 定死、三行共用同一个数。 */
        expect(rows['宝石'].perRow).toBe(3);
        expect(rows['灵饰'].perRow).toBe(4);
        expect(rows['玉魄'].perRow).toBe(2);
        /* 段数三行每格包一枚数值签（`NumTag`）；特技 / 特效 / 套装是词，不包。 */
        expect(rows['宝石'].tag).toBe(true);
        expect(rows['灵饰'].tag).toBe(true);
        expect(rows['玉魄'].tag).toBe(true);
        expect(rows['特技'].tag).toBeUndefined();
        expect(rows['特效'].tag).toBeUndefined();
        expect(rows['套装'].tag).toBeUndefined();
        expect(rows['宝石'].items.map((item) => item.dim)).toEqual([
            false,
            true,
            false,
            true,
            true,
            true,
        ]);
        expect(text(rows['灵饰'])).toBe('戒4 · 耳3 · 配3 · 手2');
        expect(text(rows['玉魄'])).toBe('阴3 · 阳2');
        /* 钟灵石与奇袭 2026-11-10 起不再进摘要，但数据本身还在 detail 里。 */
        expect(rows['钟灵石']).toBeUndefined();
        expect(rows['奇袭']).toBeUndefined();
    });

    it('套装配到三件才不退灰，件数按身上那几件数', () => {
        const gear = ['头', '衣服', '腰带'].map((name) =>
            slot(name, { stats: [], lines: [{ label: '套装', value: '慈悲 3/5' }] }),
        );
        const suit = rowsOf(gearBrief(gear, { special: '', suit: '' }))['套装'];
        expect(suit.items).toEqual([{ name: '慈悲', value: '*3', dim: false }]);
    });

    it('套装不足三件写 *件数并退灰，三件以上不封顶', () => {
        const two = ['头', '衣服'].map((name) =>
            slot(name, { stats: [], lines: [{ label: '套装', value: '碎星诀' }] }),
        );
        expect(rowsOf(gearBrief(two, { special: '', suit: '' }))['套装'].items).toEqual([
            { name: '碎星诀', value: '*2', dim: true },
        ]);

        const six = ['头', '项链', '武器', '衣服', '腰带', '鞋子'].map((name) =>
            slot(name, { stats: [], lines: [{ label: '套装', value: '天罡 5 / 5' }] }),
        );
        expect(rowsOf(gearBrief(six, { special: '', suit: '' }))['套装'].items).toEqual([
            { name: '天罡', value: '*6', dim: false },
        ]);
    });

    it('detail 里一条都读不到时，特技与套装回落到 gearMeta，特效没有兜底', () => {
        const rows = rowsOf(gearBrief([], { special: '慈航普度', suit: '天罡 5/5' }));
        expect(rows['特技'].items.map((item) => item.name)).toEqual(['慈航普度']);
        /* `gearMeta` 里没有特效这一项，读不到就整行空着，画淡「—」。 */
        expect(rows['特效'].items).toEqual([]);
        /* 兜底那条路没有分件信息，读出手填那句里的件数。 */
        expect(rows['套装'].items).toEqual([{ name: '天罡', value: '*5', dim: false }]);
        /* 强化三行没有兜底来源：格子照样在，但每件都是 0。 */
        expect(text(rows['宝石'])).toBe('头0 · 项0 · 武0 · 衣0 · 带0 · 鞋0');
        expect(rows['宝石'].items.every((item) => item.dim)).toBe(true);
    });

    it('套装没写件数时只写名字，不画星号也不判激活', () => {
        const rows = rowsOf(gearBrief([], { special: '', suit: '碎星诀' }));
        expect(rows['套装'].items).toEqual([{ name: '碎星诀', value: '', dim: false }]);
    });

    it('空装备时效果三行整行没有内容（界面画淡「—」），段数三行仍把十二格画全', () => {
        const groups = gearBrief([], { special: '', suit: '' });
        const rows = rowsOf(groups);
        expect(rows['特技'].items).toEqual([]);
        expect(rows['特效'].items).toEqual([]);
        expect(rows['套装'].items).toEqual([]);
        /* 段数是「这一件练到几段」，没装备也是 0——十二个格照画，不然「没练」与
         * 「没这件」在摘要上分不开（用户 2026-11-10：「0 段的也显示 0」）。 */
        expect(rows['宝石'].items).toHaveLength(6);
        expect(rows['灵饰'].items).toHaveLength(4);
        expect(rows['玉魄'].items).toHaveLength(2);
        expect(text(rows['宝石'])).toBe('头0 · 项0 · 武0 · 衣0 · 带0 · 鞋0');
    });

    it('部位首字：装备取首字，玉魄取阴阳', () => {
        expect(slotMark('头')).toBe('头');
        expect(slotMark('项链')).toBe('项');
        expect(slotMark('武器')).toBe('武');
        expect(slotMark('玉魄·阴')).toBe('阴');
        expect(slotMark('玉魄·阳')).toBe('阳');
    });
});

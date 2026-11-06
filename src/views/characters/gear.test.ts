import { describe, expect, it } from 'vitest';
import { GEAR_ACTIVES, GEAR_SPECIALS, gearBrief, type BriefGroup, type GearSlot } from './gear';
import { CHARACTERS } from './mock';

/**
 * 装备「特效」与「特技」必须是真实存在的词。
 *
 * 起因：`mock.ts` 里一度写着「特效：变化之术」与「特效：回春之术（4 级）」。
 * 前者是**剧情技能**（不是装备特效，也不是特技），后者这个游戏里根本没有。
 * 两处都照常渲染，看起来还挺像——这类错误的失败方式就是这样：编出来的名字
 * 往往比真名更"合理"，越合理越难被发现。
 *
 * **特效与特技不是一类**：特效是被动属性（神佑、愤怒、简易），
 * 特技是消耗愤怒值主动放的技能（起死回生、慈航普度、破血狂攻）。
 * 所以分两张表、两条断言，不合并成一张「装备词表」——合并之后
 * 「把特技填进特效栏」就不再是错误了，而这恰恰是最容易犯的错。
 */
const specials = new Set<string>(GEAR_SPECIALS);
const actives = new Set<string>(GEAR_ACTIVES);

/** 「神农（4 级）」→「神农」。游戏会在特效后面缀等级，表里只存名字。 */
function bareName(value: string): string {
    return value.replace(/（.*?）$/, '').trim();
}

describe('装备特效', () => {
    it('每个「特效」行都是真实特效名', () => {
        for (const character of CHARACTERS) {
            for (const slot of character.gear) {
                for (const line of slot.detail?.lines ?? []) {
                    if (line.label !== '特效') continue;
                    expect(
                        specials.has(bareName(line.value)),
                        `${character.name} 的${slot.slot}写着「特效：${line.value}」——特效表里没有这个词`,
                    ).toBe(true);
                }
            }
        }
    });

    it('特效表内部没有重复项', () => {
        expect(new Set(GEAR_SPECIALS).size, '特效表有重复').toBe(GEAR_SPECIALS.length);
    });
});

describe('装备特技', () => {
    it('每个「特技」行都是真实特技名', () => {
        for (const character of CHARACTERS) {
            for (const slot of character.gear) {
                for (const line of slot.detail?.lines ?? []) {
                    if (line.label !== '特技') continue;
                    expect(
                        actives.has(bareName(line.value)),
                        `${character.name} 的${slot.slot}写着「特技：${line.value}」——特技表里没有这个词`,
                    ).toBe(true);
                }
            }
        }
    });

    it('卡片底部的特技摘要也是真实特技名', () => {
        for (const character of CHARACTERS) {
            expect(
                actives.has(character.gearMeta.special),
                `${character.name} 的特技摘要写着「${character.gearMeta.special}」——特技表里没有这个词`,
            ).toBe(true);
        }
    });

    it('特技表内部没有重复项', () => {
        expect(new Set(GEAR_ACTIVES).size, '特技表有重复').toBe(GEAR_ACTIVES.length);
    });
});

/**
 * 版心摘要（卡上装备页中央那块）。
 *
 * 它**一个字都不另存**，全部从十二件装备的 `detail` 现算——所以这里测的不是
 * 「渲染对不对」，是**取数口径**：哪一行从哪一条字段来、重复的要不要去掉、
 * 「空」怎么处理、`detail` 全没有时回落到哪里。这些错了界面上不会报错，
 * 只会显示一串在游戏里不成立的话（比如把「空」当成一个特技）。
 */
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

    it('从 mock 那套真实截图数据里读得出全部七项', () => {
        const hero = CHARACTERS[0];
        const rows = rowsOf(gearBrief(hero.gear, hero.gearMeta));
        expect(rows['特技']).toBe('起死回生');
        expect(rows['套装']).toBe('天罡 5 / 5 · 治疗能力 +24（已生效）');
        expect(rows['宝石']).toBe('太阳石 5 段 · 红玛瑙 4 段');
        expect(rows['灵饰']).toBe('精炼 4 / 3 / 3 / 2');
        expect(rows['钟灵石']).toBe('3 段');
        expect(rows['玉魄']).toBe('灵尘 3 / 2');
        // 两枚玉魄的奇袭栏都写着「空」——摘要里跳过，落成空串（卡上画淡「—」）。
        expect(rows['奇袭']).toBe('');
    });

    it('同一套效果写在两件上只算一次', () => {
        /* 第二个角色把「慈悲 3/5」写在了两件装备上（照截图原样）。不去重的话
         * 卡上会读成「凑了两套」，而它其实是同一套。 */
        const other = CHARACTERS[1];
        const rows = rowsOf(gearBrief(other.gear, other.gearMeta));
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

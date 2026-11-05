import { describe, expect, it } from 'vitest';
import { GEAR_ACTIVES, GEAR_SPECIALS } from './gear';
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

import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './mock';
import { LIFE_SKILLS, STORY_SKILLS } from './skills';

/**
 * 把「名字得是游戏里真有的」变成断言。
 *
 * 起因很具体：2026-11-02 之前 `mock.ts` 的辅助技能里填着「丹元济会」「炼药」——
 * 前者其实是**剧情技能**，后者根本不是这个游戏里的技能名。两处都是照印象写的，
 * 而页面照常渲染，谁也看不出错。
 *
 * 这类错误的失败方式极安静：名字不通顺时人会怀疑自己看错，不会怀疑数据。
 * 所以只能靠断言盯着。表单做出来之后，这张表还会是下拉选项的来源，
 * 那时它从「校验用」变成「生产用」，更不能有脏数据。
 */
const life = new Set<string>(LIFE_SKILLS);
const story = new Set<string>(STORY_SKILLS);

describe('技能名字表', () => {
    it('辅助技能里的每一项都是生活技能', () => {
        for (const character of CHARACTERS) {
            for (const row of character.assists) {
                expect(
                    life.has(row.name),
                    `${character.name} 的辅助技能「${row.name}」不在生活技能表里`,
                ).toBe(true);
            }
        }
    });

    it('生活技能与剧情技能不重叠', () => {
        const both = LIFE_SKILLS.filter((name) => story.has(name));
        expect(both, `这两项同时出现在两张表里：${both.join('、')}`).toEqual([]);
    });

    it('两张表内部都没有重复项', () => {
        expect(new Set(LIFE_SKILLS).size, '生活技能表有重复').toBe(LIFE_SKILLS.length);
        expect(new Set(STORY_SKILLS).size, '剧情技能表有重复').toBe(STORY_SKILLS.length);
    });
});

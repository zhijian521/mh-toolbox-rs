import { describe, expect, it } from 'vitest';
import { lifeSkills, storySkills } from '../../services/game-data';
import '../../services/game-data.fixture';
import { CHARACTERS } from './mock';

/**
 * 把「名字得是游戏里真有的」变成断言（表本身在 `services/game-data.test.ts`，
 * 这里盯的是**种子数据有没有乱写**）。
 *
 * 起因很具体：2026-11-02 之前 `mock.ts` 的辅助技能里填着「丹元济会」「炼药」——
 * 前者其实是**剧情技能**，后者根本不是这个游戏里的技能名。两处都是照印象写的，
 * 而页面照常渲染，谁也看不出错。
 *
 * 这类错误的失败方式极安静：名字不通顺时人会怀疑自己看错，不会怀疑数据。
 * 表单做出来之后，这张表还会是下拉选项的来源，那时它从「校验用」变成「生产用」，
 * 更不能有脏数据。
 */
describe('种子的辅助技能与名字表', () => {
    /* 辅助技能现在分两类（`kind`），所以按类查表：生活技能进生活表、剧情技能进剧情表。
     * 不能只查一张——2026-11-02 给归ω岚加了「调息」「打坐」「变化之术」三条剧情技能，
     * 这条断言当场就红了，它盯的正是「名字得是游戏里真有的」这件事。 */
    it('辅助技能按类落在对应的名字表里', () => {
        const life = new Set(lifeSkills());
        const story = new Set(storySkills());
        for (const character of CHARACTERS) {
            for (const row of character.assists) {
                const table = row.kind === 'story' ? story : life;
                const label = row.kind === 'story' ? '剧情技能' : '生活技能';
                expect(
                    table.has(row.name),
                    `${character.name} 的${label}「${row.name}」不在对应的名字表里`,
                ).toBe(true);
            }
        }
    });
});

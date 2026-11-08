import { describe, expect, it, vi } from 'vitest';
import type { CharacterData } from '../character';
import type { OcrLine } from './attr-panel';
import type { IconHit } from './matcher';
import { applyAssistPanel, parseAssistPanel } from './assist-panel';

vi.mock('../../../services/game-data', () => ({
    lifeSkills: () => ['强身术', '冥想', '养生之道', '健身术', '炼金术', '淬灵之术'],
    storySkills: () => ['变化之术', '奇门遁甲', '打坐'],
}));

const line = (text: string, x: number, y: number, width = 18): OcrLine => ({
    text,
    x,
    y,
    width,
    height: 12,
    score: 0.99,
});
const icon = (name: string, x: number, y: number, score = 0.9): IconHit => ({
    name,
    score,
    box: { x, y, width: 40, height: 40 },
});

describe('辅助面板：按图标配对等级', () => {
    it('生活截图跨行读取，空格与页码不增加技能', () => {
        const lines = [
            line('生活技能', 50, 35, 60),
            line('剧情技能', 135, 35, 60),
            line('98', 65, 140),
            line('40', 130, 140),
            line('1', 65, 215),
            line('1', 150, 320),
        ];
        const result = parseAssistPanel(lines, [
            icon('强身术', 55, 90),
            icon('冥想', 120, 90),
            icon('淬灵之术', 55, 165),
        ]);
        expect(result.hit).toBe(3);
        expect(result.rows.map(({ name, kind, level }) => ({ name, kind, level }))).toEqual([
            { name: '强身术', kind: 'life', level: 98 },
            { name: '冥想', kind: 'life', level: 40 },
            { name: '淬灵之术', kind: 'life', level: 1 },
        ]);
    });

    it('剧情截图不把可用剧情点和页码认成技能等级', () => {
        const lines = [
            line('4', 140, 65),
            line('6', 75, 140),
            line('5', 135, 140),
            line('1', 150, 320),
        ];
        const result = parseAssistPanel(lines, [
            icon('变化之术', 65, 90),
            icon('奇门遁甲', 125, 90),
        ]);
        expect(result.rows.map(({ kind, level }) => ({ kind, level }))).toEqual([
            { kind: 'story', level: 6 },
            { kind: 'story', level: 5 },
        ]);
    });

    it('按截图从上到下、同排从左到右排序，不受得分和检测顺序影响', () => {
        const result = parseAssistPanel(
            [line('98', 65, 140), line('40', 130, 140), line('39', 65, 215), line('38', 130, 215)],
            [
                icon('养生之道', 55, 167, 0.99),
                icon('冥想', 120, 90, 0.98),
                icon('健身术', 120, 165, 0.88),
                icon('强身术', 55, 92, 0.72),
                icon('强身术', 180, 240, 0.65),
            ],
        );
        expect(result.rows.map(({ name, level }) => ({ name, level }))).toEqual([
            { name: '强身术', level: 98 },
            { name: '冥想', level: 40 },
            { name: '养生之道', level: 39 },
            { name: '健身术', level: 38 },
        ]);
    });

    it('等级漏识别、图标不可靠、名录外图案均不会当成已识别', () => {
        const result = parseAssistPanel(
            [line('40', 130, 140)],
            [icon('强身术', 55, 90), icon('冥想', 120, 90, 0.4), icon('不在技能表', 180, 90)],
        );
        expect(result.hit).toBe(0);
        expect(result.rows).toMatchObject([{ name: '强身术', state: 'miss' }]);
    });

    it('同排合并成一行的数字不分配给两项，师徒技能不参与辅助写回', () => {
        const result = parseAssistPanel(
            [line('65', 65, 140, 90)],
            [icon('变化之术', 55, 90), icon('打坐', 120, 90), icon('师徒技能', 55, 165)],
        );
        expect(result.hit).toBe(0);
        expect(result.rows.map(({ name, state }) => ({ name, state }))).toEqual([
            { name: '变化之术', state: 'miss' },
            { name: '打坐', state: 'miss' },
        ]);
    });

    it('最后一行漏了等级时，不把下方的页码当成等级', () => {
        const result = parseAssistPanel([line('1', 150, 320)], [icon('奇门遁甲', 125, 242)]);
        expect(result.hit).toBe(0);
        expect(result.rows[0].state).toBe('miss');
    });

    it('0 级可识别，重复图标只采用最高分结果', () => {
        const result = parseAssistPanel(
            [line('0', 65, 140)],
            [icon('强身术', 180, 90, 0.7), icon('强身术', 55, 90, 0.95)],
        );
        expect(result.hit).toBe(1);
        expect(result.rows[0].level).toBe(0);
    });
});

describe('辅助面板：按截图覆盖对应组', () => {
    const card = () =>
        ({
            id: 'assist',
            skills: [{ name: '周易学', level: 120 }],
            assists: [
                { name: '强身术', kind: 'life', level: 80, cap: 140, off: true },
                { name: '冥想', kind: 'life', level: 22 },
                { name: '变化之术', kind: 'story', level: 3 },
            ],
        }) as CharacterData;

    it('替换生活组，另一类、同名上限及其他角色字段不动', () => {
        const before = card();
        const result = parseAssistPanel(
            [line('98', 65, 140)],
            [icon('强身术', 55, 90), icon('冥想', 120, 90)],
        );
        const after = applyAssistPanel(before, result.rows);
        expect(after.assists).toEqual([
            { name: '强身术', kind: 'life', level: 98, cap: 140, off: true },
            before.assists[2],
        ]);
        expect(after.skills).toBe(before.skills);
        expect(before.assists[0].level).toBe(80);
    });

    it('生活与剧情各自覆盖旧组，不残留截图中没有的旧技能', () => {
        const life = parseAssistPanel([line('39', 65, 140)], [icon('炼金术', 55, 90)]);
        const story = parseAssistPanel([line('5', 65, 140)], [icon('奇门遁甲', 55, 90)]);
        const after = applyAssistPanel(applyAssistPanel(card(), life.rows), story.rows);
        expect(after.assists).toEqual([
            { name: '炼金术', kind: 'life', level: 39 },
            { name: '奇门遁甲', kind: 'story', level: 5 },
        ]);
    });

    it('覆盖后的技能按截图顺序排列，漏识别项不新增', () => {
        const before = card();
        const result = parseAssistPanel(
            [line('39', 65, 140), line('41', 130, 140), line('10', 65, 215), line('20', 130, 215)],
            [
                icon('健身术', 120, 165, 0.99),
                icon('淬灵之术', 55, 167, 0.98),
                icon('养生之道', 55, 240, 0.95),
                icon('冥想', 120, 90, 0.9),
                icon('炼金术', 55, 92, 0.8),
            ],
        );
        expect(applyAssistPanel(before, result.rows).assists).toEqual([
            { name: '炼金术', kind: 'life', level: 39 },
            { ...before.assists[1], level: 41 },
            { name: '淬灵之术', kind: 'life', level: 10 },
            { name: '健身术', kind: 'life', level: 20 },
            before.assists[2],
        ]);
    });

    it('没有成功识别的等级时不清空任何组', () => {
        const before = card();
        const result = parseAssistPanel([], [icon('强身术', 55, 90)]);
        expect(applyAssistPanel(before, result.rows).assists).toEqual(before.assists);
        expect(applyAssistPanel(before, []).assists).toEqual(before.assists);
    });
});

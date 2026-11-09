import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrFrame } from '../../../services/ocr';
import type { EquipmentName } from '../../../services/game-data';
import { gearStatGroup } from '../gear-properties';
import type { OcrLine } from './attr-panel';
import { parseGearPanel } from './gear-panel';
import { recognizeGearPanel } from './gear-recognition';

vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));

const names: EquipmentName[] = [
    { name: '攫魂铃', group: 'yaodai', family: 'gear' },
    { name: '混元金锤', group: '锤', family: 'weapon' },
    { name: '天龙破城', group: '枪矛', family: 'weapon' },
    { name: '香木镯', group: 'shouzhuo', family: 'lingshi' },
    { name: '芝兰佩', group: 'peishi', family: 'lingshi' },
];
const lines = (rows: string[]): OcrLine[] =>
    rows.map((text, i) => ({ text, x: 0, y: i * 16, width: 200, height: 13, score: 0.98 }));
function image(green = false): ImageData {
    const data = new Uint8ClampedArray(200 * 200 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([green ? 0 : 255, 255, 0, 255], i);
    return { data, width: 200, height: 200, colorSpace: 'srgb' } as ImageData;
}

function spiritImage(): ImageData {
    const shot = image();
    for (const top of [80, 96, 112])
        for (let y = top; y < top + 12; y++)
            for (let x = 0; x < 120; x++) shot.data.set([0, 255, 0, 255], (y * shot.width + x) * 4);
    return shot;
}

describe('装备原图补读', () => {
    beforeEach(() => {
        vi.mocked(ocrFrame).mockReset();
    });

    it.each([
        {
            title: '攫魂铃',
            broken: '1+360防御+38',
            raw: '气血+360防御33',
            values: [360, 33],
        },
        {
            title: '混元金锤',
            broken: '中+588伤害+508',
            raw: '命中+588伤害+508',
            values: [588, 508],
        },
    ])('$title 的首个标签漏读时从原图补回基础总值', async ({ title, broken, raw, values }) => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: lines([title, raw]) });
        const result = await recognizeGearPanel(
            lines([title, broken, '锻炼等级6', '镶嵌宝石光芒石']),
            image(),
            names,
        );
        expect(result.detail.stats?.map((row) => Number(row.value))).toEqual(values);
        expect(result.detail.stats?.map((row) => gearStatGroup(row, result.slot!))).toEqual([
            'base',
            'base',
        ]);
        expect(result.detail.cond).toContainEqual({ label: '锻炼等级', value: '6' });
        expect(ocrFrame).toHaveBeenCalledTimes(1);
    });

    it('缺项时整排基础值采用原图，不带入原图误读的强化等级和说明', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: lines(['攫魂铃', '气血+360防御33', '锻炼等级61', '特效：杂字']),
        });
        const result = await recognizeGearPanel(
            lines(['攫魂铃', '防御+38', '锻炼等级6']),
            image(),
            names,
        );
        expect(result.detail.stats?.map((row) => Number(row.value))).toEqual([360, 33]);
        expect(result.detail.cond).toEqual([{ label: '锻炼等级', value: '6' }]);
        expect(result.detail.lines).toBeUndefined();
    });

    it('基础齐全不补读，耐久后的黄字仍归基础，普通宝石不拆分或另算', async () => {
        const result = await recognizeGearPanel(
            lines(['攫魂铃', '耐久度219', '锻炼等级6', '气血+360防御+33']),
            image(),
            names,
        );
        expect(ocrFrame).not.toHaveBeenCalled();
        expect(result.detail.stats).toEqual([
            { label: '气血', value: '+360', group: 'base' },
            { label: '防御', value: '+33', group: 'base' },
        ]);
        const clothes = parseGearPanel(lines(['气血+160防御+229']), [], '衣服', image());
        expect(clothes.detail.stats?.map((row) => gearStatGroup(row, '衣服'))).toEqual([
            'base',
            'base',
        ]);
    });

    it('原图字色可区分绿字，不把独立绿字宝石归入基础', () => {
        const result = parseGearPanel(
            lines(['混元金锤', '伤害+32']),
            names,
            undefined,
            image(true),
        );
        expect(result.detail.stats).toEqual([{ label: '伤害', value: '+32', gain: true }]);
        expect(gearStatGroup(result.detail.stats![0], '武器')).toBe('gem');
    });

    it('原图基础区域排除同排背包文字，只补浮片里的命中，不采纳列表中其他装备', async () => {
        const box = (text: string, x: number, y: number): OcrLine => ({
            text,
            x,
            y,
            width: 140,
            height: 13,
            score: 0.98,
        });
        const primary = [
            box('天龙破城', 50, 0),
            box('等级150五行水', 50, 16),
            box('伤害+731帝中+561', 50, 32),
            box('耐久度59', 50, 48),
            box('耐力+30体质+29', 50, 64),
        ];
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: [
                box('力量+19敏捷-2', 0, 32),
                box('伤害+731命中+561', 50, 32),
                box('命中+934伤害+630', 50, 96),
            ],
        });
        const shot = image();
        for (let i = 64 * shot.width * 4; i < shot.data.length; i += 4)
            shot.data.set([0, 255, 0, 255], i);
        const result = await recognizeGearPanel(primary, shot, names);
        const base = result.detail.stats?.filter((row) => gearStatGroup(row, '武器') === 'base');
        expect(base).toEqual([
            { label: '伤害', value: '+731', group: 'base' },
            { label: '命中', value: '+561', group: 'base' },
        ]);
        expect(result.detail.stats?.some((row) => row.label === '力量')).toBe(false);
        expect(result.detail.stats?.find((row) => row.label === '耐力')?.value).toBe('+30');
    });

    it('补读失败保留已识别内容，灵饰不触发普通基础项补读', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'failed', error: '识别失败' });
        const source = lines(['攫魂铃', '防御+33']);
        const result = await recognizeGearPanel(source, image(), names);
        expect(result).toEqual(parseGearPanel(source, names, undefined, image()));
        vi.mocked(ocrFrame).mockClear();
        await recognizeGearPanel(lines(['[灵饰类型]手镯', '精炼等级3', '防御+23']), image(), []);
        expect(ocrFrame).not.toHaveBeenCalled();
    });

    it('香木镯两个气血标签损坏时逐行补齐，不合并同名行或带入钟灵石说明', async () => {
        const primary = lines([
            '香木镯',
            '[灵饰类型]手镯',
            '抵抗封印等级+13',
            '耐久度159',
            '精炼等级6',
            '血+53-+168]',
            '气面1+45[+168]',
            '防御+15',
            '特效：自我陶醉(4级)',
            '气血+4',
            '制造者：测试',
        ]);
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: [
                { ...lines(['气血+53[+168]'])[0], x: 8, y: 8, height: 14 },
                { ...lines(['气血+45'])[0], x: 8, y: 38, height: 14 },
            ],
        });
        const result = await recognizeGearPanel(primary, spiritImage(), names);
        expect(result.detail.stats).toEqual([
            { label: '抵抗封印命中等级', value: '+13' },
            { label: '气血', value: '+53', extra: '+168', gain: true },
            { label: '气血', value: '+45', extra: '+168', gain: true },
            { label: '防御', value: '+15', extra: '+48', gain: true },
        ]);
        expect(result.detail.cond).toContainEqual({ label: '钟灵石', value: '自我陶醉(4级)' });
        expect(ocrFrame).toHaveBeenCalledTimes(1);
    });

    it('芝兰佩中间气血补回原位置，前后重复防御及已读括号值不改', async () => {
        const primary = lines([
            '芝兰佩',
            '[灵饰类型]配饰',
            '速度+12',
            '耐久度233',
            '精炼等级6',
            '防御+12[+48]',
            '气面+45',
            '防御+14[+48]',
            '制造者：测试',
        ]);
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: [{ ...lines(['气面+45[+168]'])[0], x: 8, y: 38, height: 14 }],
        });
        const result = await recognizeGearPanel(primary, spiritImage(), names);
        expect(
            result.detail.stats?.map(({ label, value, extra }) => [label, value, extra]),
        ).toEqual([
            ['速度', '+12', undefined],
            ['防御', '+12', '+48'],
            ['气血', '+45', '+168'],
            ['防御', '+14', '+48'],
        ]);
    });

    it('绿字齐全不补读，缺项补读失败时保留主识别结果', async () => {
        const complete = lines([
            '香木镯',
            '[灵饰类型]手镯',
            '抵抗封印等级+13',
            '耐久度159',
            '精炼等级6',
            '气血+53',
            '气血+45',
            '防御+15',
            '制造者：测试',
        ]);
        await recognizeGearPanel(complete, spiritImage(), names);
        expect(ocrFrame).not.toHaveBeenCalled();
        const broken = complete.map((line) =>
            line.text === '气血+45' ? { ...line, text: '气面+45' } : line,
        );
        for (const outcome of [
            { status: 'failed' as const, error: '识别失败' },
            { status: 'ok' as const, lines: [] },
            { status: 'ok' as const, lines: [{ ...lines(['未知属性+45'])[0], x: 8, y: 38 }] },
        ]) {
            vi.mocked(ocrFrame).mockResolvedValue(outcome);
            expect(await recognizeGearPanel(broken, spiritImage(), names)).toEqual(
                parseGearPanel(broken, names, undefined, spiritImage()),
            );
        }
    });
});

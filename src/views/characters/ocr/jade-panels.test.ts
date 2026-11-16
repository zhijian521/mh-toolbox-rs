import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../services/game-data.fixture';
import { ocrFrame } from '../../../services/ocr';
import { GEAR_RULES } from '../../../services/game-rules';
import { normalizeCharacter, parseRoster, serializeRoster } from '../roster';
import { normalizeGearMeta } from '../details';
import { characterSnapshot, changeReport } from './change-summary';
import { gearPanelParts, mergeGearPanels, parseGearPanel } from './gear-panel';
import { recognizeGearPanel } from './gear-recognition';
import { jadeIdentity, jadePanels } from './jade-panels';
import { gearAmbushFrame } from './gear-image';
import originals from './jade-originals.fixture.json';
import type { OcrLine } from './attr-panel';

vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));
vi.mock('./gear-image', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./gear-image')>()),
    gearAmbushFrame: vi.fn(() => ({ pixels: 'ambush', width: 700, height: 120 })),
}));

const line = (text: string, x: number, y: number, width = 160): OcrLine => ({
    text,
    x,
    y,
    width,
    height: 20,
    score: 0.99,
});
const left = [
    '上古玉魄·阳',
    '封印命中等级+15',
    '奇袭法术+0.5%',
    '耐久度240',
    '灵尘等级2',
    '物理暴击等级+7[+12]',
    '速度+4[+9]',
    '奇袭特技:[空]',
];
const right = [
    '上古玉魄·阴',
    '格挡值+16',
    '奇袭法术+0.5%',
    '耐久度56',
    '灵尘等级2',
    '气血+40[+84]',
    '气血回复效果+8[+12]',
    '奇袭道具:[空]',
];
const rows = (values: string[], x = 10, top = 160) =>
    values.map((text, i) => line(text, x, top + i * 28));
const source = () => [
    line('命魂之玉', 220, 20),
    line('神天兵的命魂之玉，蕴藏着天命之力。', 220, 55),
    line('伤害9999', 5, 100),
    line('抗法术暴击率+0.5%', 220, 100),
    ...rows(left),
    ...rows(right, 220),
];
const image = (): ImageData => ({
    data: new Uint8ClampedArray(420 * 420 * 4),
    width: 420,
    height: 420,
    colorSpace: 'srgb',
});

beforeEach(() => {
    vi.mocked(gearAmbushFrame).mockClear();
    vi.mocked(ocrFrame).mockReset();
    vi.mocked(ocrFrame)
        .mockResolvedValueOnce({ status: 'ok', lines: rows(left, 10, 10) })
        .mockResolvedValueOnce({ status: 'ok', lines: rows(right, 10, 10) });
});

describe('命魂之玉双列截图', () => {
    it.each(
        (['玉魄·阴', '玉魄·阳'] as const).flatMap((slot) => {
            const rule = GEAR_RULES[slot]!;
            return [...new Set([...rule.base, ...rule.extra])]
                .filter((label) => label !== '奇袭法术')
                .map((label) => ({ slot, label }));
        }),
    )('$slot 独有属性 $label 在标题漏识别时仍可判断部位', ({ slot, label }) => {
        const result = parseGearPanel(rows(['上古玉', `${label}+15`, '灵尘等级2']));
        expect(result.slot).toBe(slot);
        expect(result.detail.name).toBe(`上古${slot}`);
    });

    it.each([
        ['玉魄·阳', '上古玉魄·阴', '封印命中等级+15'],
        ['玉魄·阴', '上古玉魄·阳', '格挡值+31'],
        ['玉魄·阴', '上古玉魄·阳', '抵抗封印等级+15'],
    ])('属性优先于误读的标题：%s', (slot, title, stat) => {
        expect(parseGearPanel(rows([title, stat])).slot).toBe(slot);
    });

    it('共有奇袭不区分阴阳，普通灵饰和武器不因属性被改成玉魄', () => {
        expect(jadeIdentity(rows(['灵尘等级2', '奇袭法术+0.5%'])).slot).toBeNull();
        expect(jadeIdentity(rows(['上古玉魄·阴', '奇袭法术+0.5%'])).slot).toBe('玉魄·阴');
        expect(jadeIdentity(rows(['灵饰类型：戒指', '伤害+15', '精炼等级2'])).slot).toBeNull();
        expect(jadeIdentity(rows(['命中+100', '伤害+100', '耐久度100'])).slot).toBeNull();
        expect(jadeIdentity(rows(['灵尘等级2', '气血不足时不能使用'])).slot).toBeNull();
    });

    it('阴阳均漏识别或被读成同一字时，仍由两列独有属性区分', () => {
        for (const title of ['上古玉错', '上古玉魄·阴']) {
            const lines = source().map((row) => ({
                ...row,
                text: row.text.startsWith('上古玉') ? title : row.text,
            }));
            expect(jadePanels(lines, image()).map((panel) => panel.slot)).toEqual([
                '玉魄·阳',
                '玉魄·阴',
            ]);
            expect(parseGearPanel(lines).soul).toEqual([{ label: '抗法术暴击率', value: '+0.5%' }]);
        }
    });

    it('两列左右互换时仍按实际属性归属，不写死左阳右阴', () => {
        const lines = [...rows(right), ...rows(left, 220)];
        expect(jadePanels(lines, image()).map((panel) => panel.slot)).toEqual([
            '玉魄·阴',
            '玉魄·阳',
        ]);
    });

    it('同列属性冲突时不按标题或当前格子写入，也不返回半份结果', async () => {
        const lines = rows(['上古玉魄·阴', '格挡值+31', '封印命中等级+15', '灵尘等级2']);
        expect(parseGearPanel(lines, [], '玉魄·阴').slot).toBeNull();
        await expect(recognizeGearPanel(lines, image(), [], '玉魄·阴')).rejects.toThrow(
            '同一件玉魄出现阴阳两类属性',
        );
        const mixed = [...source(), line('格挡值+31', 10, 390)];
        await expect(recognizeGearPanel(mixed, image(), [])).rejects.toThrow(
            '阴阳玉魄属性归属不明确',
        );
        expect(ocrFrame).not.toHaveBeenCalled();
    });

    it.each([
        '上古玉·阴',
        '上古玉朗·阴',
        '上古玉魂·阴',
        '上古玉魄·阴',
        '上古玉魏·阴',
        '上古玉晚·阴',
    ])('标题漏字或形近字仍定位阴玉魄：%s', (title) => {
        const result = parseGearPanel(rows([title, '格挡值+31']));
        expect(result.slot).toBe('玉魄·阴');
        expect(result.detail.name).toBe('上古玉魄·阴');
        expect(result.detail.stats).toContainEqual({ label: '格挡值', value: '+31' });
    });

    it.each(['上古玉', '上古玉佩·阴', '普通玉魄·阴'])(
        '标题缺少阴阳或不是上古玉魄时不猜部位：%s',
        (title) => {
            expect(parseGearPanel(rows([title, '格挡值+31'])).slot).toBeNull();
        },
    );

    it.each(originals.slice(1))('真实 $name 转录保留主值、强化值和独立奇袭行', async (shot) => {
        vi.mocked(ocrFrame).mockReset();
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: rows(['奇袭法术+0.5%'], 20, 20),
        });
        const result = await recognizeGearPanel(shot.processed, image(), []);
        const slot = shot.name === '阳玉魄' ? '玉魄·阳' : '玉魄·阴';
        expect(result.slot).toBe(slot);
        expect(parseGearPanel(shot.raw).slot).toBe(slot);
        expect(result.detail.stats).toContainEqual({ label: '奇袭法术', value: '+0.5%' });
        expect(result.detail.stats).toContainEqual(
            slot === '玉魄·阳'
                ? { label: '物理暴击等级', value: '+6', extra: '+12', gain: true }
                : { label: '气血', value: '+41', extra: '+84', gain: true },
        );
        expect(ocrFrame).toHaveBeenCalledWith('ambush', 700, 120);
    });

    it('真实同图标题误字和漏字仍分成阴阳两列，命魂抗物暴属性不混入玉魄', () => {
        const shot = originals[0];
        const pixels: ImageData = {
            width: shot.width,
            height: shot.height,
            data: new Uint8ClampedArray(shot.width * shot.height * 4),
            colorSpace: 'srgb',
        };
        expect(jadePanels(shot.processed, pixels).map((panel) => panel.slot)).toEqual([
            '玉魄·阳',
            '玉魄·阴',
        ]);
        expect(parseGearPanel(shot.processed).soul).toEqual([
            { label: '抗物理暴击率', value: '+0.5%' },
        ]);
    });

    it('奇袭补读没有明确百分号时保留原文，不把尾数强改成百分号', async () => {
        vi.mocked(ocrFrame).mockReset();
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: rows(['奇袭法术+0.596']),
        });
        const result = await recognizeGearPanel(originals[1].processed, image(), []);
        expect(result.detail.stats).toContainEqual({ label: '奇袭法术', value: '+0.596' });
    });

    it.each(['奇蓉法术+0.5%', '奇装法术+0.5%'])(
        '小图奇袭名称误读时仅接受原色补读的完整属性：%s',
        async (text) => {
            vi.mocked(ocrFrame).mockReset();
            vi.mocked(ocrFrame).mockResolvedValue({
                status: 'ok',
                lines: rows(['奇袭法术+0.5%']),
            });
            const lines = rows(left).map((row) => ({
                ...row,
                text: row.text.startsWith('奇袭法术') ? text : row.text,
            }));
            const result = await recognizeGearPanel(lines, image(), []);
            expect(result.detail.stats).toContainEqual({ label: '奇袭法术', value: '+0.5%' });
            expect(result.hit).toBe(parseGearPanel(lines).hit + 1);
            expect(result.total).toBe(result.hit);
        },
    );

    it('小图阳标题误读为晚、阴标题误读为魏时仍裁出两个格子', async () => {
        const lines = source().map((row) => ({
            ...row,
            text: row.text
                .replace('上古玉魄·阳', '上古玉晚·阳')
                .replace('上古玉魄·阴', '上古玉魏·阴'),
        }));
        const result = await recognizeGearPanel(lines, image(), [], '玉魄·阴');
        const parts = gearPanelParts(result);
        expect(parts.map((part) => part.slot)).toEqual(['玉魄·阴', '玉魄·阳']);
        expect(parts[0].detail.stats?.some((row) => row.label === '封印命中等级')).toBe(false);
        expect(parts[1].detail.stats?.some((row) => row.label === '格挡值')).toBe(false);
        expect(result.soul).toEqual([{ label: '抗法术暴击率', value: '+0.5%' }]);
    });

    it('两列裁图保留各自像素，标题被 OCR 合成一框时也能分列', () => {
        const shot = image();
        shot.data.fill(255, (160 * 420 + 220) * 4, (160 * 420 + 221) * 4);
        const panels = jadePanels(source(), shot);
        expect(panels.map((panel) => panel.slot)).toEqual(['玉魄·阳', '玉魄·阴']);
        expect(panels.map((panel) => panel.image.width)).toEqual([210, 210]);
        expect(panels[1].image.data.slice((10 * 210 + 10) * 4, (10 * 210 + 11) * 4)).toEqual(
            new Uint8ClampedArray([255, 255, 255, 255]),
        );
        expect(jadePanels([line('上古玉魄·阳 上古玉魄·阴', 10, 160, 400)], shot)).toHaveLength(2);
        expect(jadePanels(rows(left), shot)).toEqual([]);
        expect(
            jadePanels([line('上古玉魄·阳', 10, 160), line('上古玉魄·阴', 220, 250)], shot),
        ).toEqual([]);
    });

    it('分列读取基础、奇袭、状态与强化值，共用抗暴属性不混入任一玉魄', async () => {
        const result = await recognizeGearPanel(source(), image(), [], '玉魄·阴');
        expect(ocrFrame).toHaveBeenCalledTimes(2);
        expect(result.slot).toBe('玉魄·阴');
        expect(result.soul).toEqual([{ label: '抗法术暴击率', value: '+0.5%' }]);
        const parts = gearPanelParts(result);
        const yin = parts.find((part) => part.slot === '玉魄·阴')!.detail;
        const yang = parts.find((part) => part.slot === '玉魄·阳')!.detail;
        expect(yang.stats).toEqual([
            { label: '封印命中等级', value: '+15' },
            { label: '奇袭法术', value: '+0.5%' },
            { label: '物理暴击等级', value: '+7', extra: '+12', gain: true },
            { label: '速度', value: '+4', extra: '+9', gain: true },
        ]);
        expect(yin.stats).toEqual([
            { label: '格挡值', value: '+16' },
            { label: '奇袭法术', value: '+0.5%' },
            { label: '气血', value: '+40', extra: '+84', gain: true },
            { label: '气血回复效果', value: '+8', extra: '+12', gain: true },
        ]);
        expect(yin.cond).toEqual([
            { label: '耐久度', value: '56' },
            { label: '灵尘等级', value: '2' },
        ]);
        expect(yang.lines).toEqual([{ label: '奇袭特技', value: '空', tone: 'ochre' }]);
        expect(yin.lines).toEqual([{ label: '奇袭道具', value: '空', tone: 'ochre' }]);
        expect(gearAmbushFrame).not.toHaveBeenCalled();
    });

    it('同图阴标题误读为魏时仍分列，不能把两件属性合进阳玉魄', async () => {
        const lines = source().map((row) => ({
            ...row,
            text: row.text.replace('上古玉魄·阴', '上古玉魏·阴'),
        }));
        expect(jadePanels(lines, image()).map((panel) => panel.slot)).toEqual([
            '玉魄·阳',
            '玉魄·阴',
        ]);
        const result = await recognizeGearPanel(lines, image(), []);
        expect(result.related?.[0].slot).toBe('玉魄·阴');
        expect(result.detail.stats?.some((row) => row.label === '气血')).toBe(false);
        expect(result.related?.[0].detail.stats).toContainEqual({
            label: '气血',
            value: '+40',
            extra: '+84',
            gain: true,
        });
        expect(result.soul).toEqual([{ label: '抗法术暴击率', value: '+0.5%' }]);
    });

    it('一张图覆盖两件并保留各自备注，存档重载只保留一份命魂属性', async () => {
        const result = await recognizeGearPanel(source(), image(), []);
        const original = normalizeCharacter({
            id: 'jade',
            name: '角色',
            gear: [
                { slot: '头', caption: '帽子', detail: { name: '帽子', kind: '', stats: [] } },
                ...(['玉魄·阳', '玉魄·阴'] as const).map((slot) => ({
                    slot,
                    detail: {
                        name: '旧玉魄',
                        kind: '',
                        stats: [{ label: '伤害', value: '+999' }],
                        note: slot + '备注',
                    },
                })),
            ],
        });
        const before = characterSnapshot(original, 'gear');
        const next = {
            ...original,
            gear: mergeGearPanels(original.gear, result),
            gearMeta: normalizeGearMeta({ ...original.gearMeta, soul: result.soul }),
        };
        const restored = parseRoster(serializeRoster([next]))![0];
        expect(original.gear.find((slot) => slot.slot === '玉魄·阳')!.detail!.name).toBe('旧玉魄');
        expect(restored.gearMeta.soul).toEqual(result.soul);
        for (const slot of ['玉魄·阳', '玉魄·阴'] as const) {
            expect(restored.gear.find((one) => one.slot === slot)!.detail!.note).toBe(
                slot + '备注',
            );
        }
        expect(restored.gear.find((slot) => slot.slot === '头')).toEqual(
            original.gear.find((slot) => slot.slot === '头'),
        );
        const after = characterSnapshot(restored, 'gear');
        const report = changeReport('双列玉魄', before, after);
        expect(report.changes).toContainEqual({
            label: '命魂之玉·抗法术暴击率',
            before: '',
            after: '+0.5%',
        });
        expect(Object.keys(after).filter((key) => key.startsWith('命魂之玉·'))).toHaveLength(1);
    });

    it('单件含载体标题时独立提取命魂属性，没有载体标题不猜测', () => {
        const parsed = parseGearPanel(source().filter((one) => one.x < 200 || one.y < 160));
        expect(parsed.soul).toEqual([{ label: '抗法术暴击率', value: '+0.5%' }]);
        expect(
            parsed.detail.stats?.some(
                (stat) => stat.label === '抗法术暴击率' || stat.value === '9999',
            ),
        ).toBe(false);
        expect(parseGearPanel(rows(left)).soul).toBeUndefined();
        expect(
            normalizeGearMeta({
                soul: [null, { label: '抗法术暴击率', value: '' }, { value: '+5' }],
            }),
        ).toEqual({ special: '', suit: '' });
    });

    it('任一列引擎失败时不返回半份覆盖结果', async () => {
        vi.mocked(ocrFrame).mockReset();
        vi.mocked(ocrFrame)
            .mockResolvedValueOnce({ status: 'ok', lines: rows(left, 10, 10) })
            .mockResolvedValueOnce({ status: 'failed', error: '引擎失败' });
        await expect(recognizeGearPanel(source(), image(), [])).rejects.toThrow('引擎失败');
    });
});

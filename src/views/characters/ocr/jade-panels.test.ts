import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../services/game-data.fixture';
import { ocrFrame } from '../../../services/ocr';
import { normalizeCharacter, parseRoster, serializeRoster } from '../roster';
import { normalizeGearMeta } from '../details';
import { characterSnapshot, changeReport } from './change-summary';
import { gearPanelParts, mergeGearPanels, parseGearPanel } from './gear-panel';
import { recognizeGearPanel } from './gear-recognition';
import { jadePanels } from './jade-panels';
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
    it.each(['上古玉·阴', '上古玉朗·阴', '上古玉魂·阴', '上古玉魄·阴'])(
        '标题漏字或形近字仍定位阴玉魄：%s',
        (title) => {
            const result = parseGearPanel(rows([title, '格挡值+31']));
            expect(result.slot).toBe('玉魄·阴');
            expect(result.detail.name).toBe('上古玉魄·阴');
            expect(result.detail.stats).toContainEqual({ label: '格挡值', value: '+31' });
        },
    );

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

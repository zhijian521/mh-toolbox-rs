import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrFrame } from '../../../services/ocr';
import { createCharacterPanelReader } from './character-panel';
import { recognizeGearPanel } from './gear-recognition';
import { recognizePetPanel } from './pet-recognition';
import type { OcrLine } from './attr-panel';

const { readAssist } = vi.hoisted(() => ({ readAssist: vi.fn() }));
vi.mock('./assist-reader', () => ({ createAssistReader: () => readAssist }));
vi.mock('./gear-recognition', () => ({ recognizeGearPanel: vi.fn() }));
vi.mock('./pet-recognition', () => ({ recognizePetPanel: vi.fn() }));
vi.mock('./gear-image', () => ({
    gearFrame: () => ({ pixels: 'gear', width: 1, height: 1 }),
}));
vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));
vi.mock('../../../services/game-data', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/game-data')>()),
    loadEquipmentNames: vi.fn(async () => []),
}));
vi.mock('../schools', () => ({
    schoolSkillNames: (school: string) =>
        school === '五庄观' ? ['潇湘仙雨', '乾坤袖', '修仙术'] : undefined,
}));

const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData;
function lines(...texts: string[]): OcrLine[] {
    return texts.map((text, index) => ({
        text,
        x: 10,
        y: index * 25,
        width: 100,
        height: 20,
        score: 0.99,
    }));
}
beforeEach(() => {
    vi.clearAllMocks();
    readAssist.mockResolvedValue({ hit: 0, total: 0, rows: [] });
    vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: [] });
    vi.mocked(recognizeGearPanel).mockResolvedValue({
        slot: '头',
        detail: { name: '水晶帽' },
        hit: 1,
        total: 1,
    });
    vi.mocked(recognizePetPanel).mockResolvedValue({
        patch: { name: '鬼将', attrs: [{ label: '气血', value: '4238' }] },
        hit: 2,
        skillCount: 0,
    });
});

describe('角色截图自动分区', () => {
    it('从其他分区读人物属性，只运行文本解析，不启动图标匹配', async () => {
        const result = await createCharacterPanelReader()(
            lines('气血4238', '魔法931', '伤害2016'),
            image,
            '五庄观',
            'pets',
        );
        expect(result?.pane).toBe('attrs');
        if (result?.pane === 'attrs') {
            expect(result.value.fields).toContainEqual(
                expect.objectContaining({ key: '气血', value: '4238' }),
            );
        }
        expect(readAssist).not.toHaveBeenCalled();
        expect(recognizePetPanel).not.toHaveBeenCalled();
    });

    it('从属性页读修炼等级，不把经验写入人物属性', async () => {
        const result = await createCharacterPanelReader()(
            lines('攻击修炼 等级:11/20 修炼经验:100', '防御修炼 等级:5/20'),
            image,
            '五庄观',
            'attrs',
        );
        expect(result?.pane).toBe('training');
        if (result?.pane === 'training') {
            expect(result.value.rows).toContainEqual(
                expect.objectContaining({ name: '攻击修炼', level: 11 }),
            );
        }
    });

    it('按当前门派识别师门，不依赖上传时所在分区', async () => {
        const result = await createCharacterPanelReader()(
            lines('潇湘仙雨', '150', '乾坤袖', '140'),
            image,
            '五庄观',
            'attrs',
        );
        expect(result?.pane).toBe('skills');
        expect(result?.value?.hit).toBe(2);
    });

    it('辅助无技能名时使用图标结果，并保留截图行序', async () => {
        const value = {
            hit: 2,
            total: 2,
            rows: [
                { name: '强身术', level: 100, kind: 'life', state: 'guess', score: 0.9 },
                { name: '冥想', level: 80, kind: 'life', state: 'guess', score: 0.9 },
            ],
        };
        readAssist.mockResolvedValue(value);
        expect(await createCharacterPanelReader()([], image, '五庄观', 'attrs')).toEqual({
            pane: 'assist',
            value,
        });
    });

    it('在辅助页上传辅助截图不读取整图，上传其他面板时才回退一次', async () => {
        const readText = vi.fn().mockResolvedValue(lines('气血4238', '魔法931'));
        readAssist.mockResolvedValueOnce({ hit: 1, total: 1, rows: [] });
        const read = createCharacterPanelReader();
        expect((await read([], image, '五庄观', 'assist', readText))?.pane).toBe('assist');
        expect(readText).not.toHaveBeenCalled();
        expect((await read([], image, '五庄观', 'assist', readText))?.pane).toBe('attrs');
        expect(readText).toHaveBeenCalledOnce();
    });

    it('装备的气血、魔法不流入人物属性，沿用专用预处理', async () => {
        const result = await createCharacterPanelReader()(
            lines('水晶帽', '魔法60', '防御26', '耐久度191'),
            image,
            '五庄观',
            'attrs',
        );
        expect(result?.pane).toBe('gear');
        expect(ocrFrame).toHaveBeenCalledWith('gear', 1, 1);
        expect(recognizeGearPanel).toHaveBeenCalledOnce();
        expect(readAssist).not.toHaveBeenCalled();
    });

    it.each(['上古玉·阳', '上古玉朗·阴'])(
        '玉魄标题漏字和形近字仍进入装备识别：%s',
        async (title) => {
            const result = await createCharacterPanelReader()(
                lines(title, '格挡值+31'),
                image,
                '五庄观',
                'attrs',
            );
            expect(result?.pane).toBe('gear');
            expect(recognizeGearPanel).toHaveBeenCalledOnce();
            expect(readAssist).not.toHaveBeenCalled();
        },
    );

    it('召唤兽的同名属性只交给召唤兽解析器', async () => {
        const result = await createCharacterPanelReader()(
            lines('召唤兽属性', '气血4238', '魔法931', '攻击2016'),
            image,
            '五庄观',
            'attrs',
        );
        expect(result?.pane).toBe('pets');
        expect(recognizePetPanel).toHaveBeenCalledOnce();
        expect(recognizeGearPanel).not.toHaveBeenCalled();
    });

    it('专用面板没有有效命中时不回退写入人物字段', async () => {
        vi.mocked(recognizePetPanel).mockResolvedValue({ patch: {}, hit: 0, skillCount: 0 });
        expect(
            await createCharacterPanelReader()(
                lines('召唤兽属性', '气血4238'),
                image,
                '五庄观',
                'attrs',
            ),
        ).toBeNull();
    });

    it('装备未定位部位时不回退覆盖人物同名属性', async () => {
        vi.mocked(recognizeGearPanel).mockResolvedValue({
            slot: null,
            detail: {},
            hit: 2,
            total: 2,
        });
        expect(
            await createCharacterPanelReader()(
                lines('耐久度191', '气血4238', '魔法931'),
                image,
                '五庄观',
                'attrs',
            ),
        ).toBeNull();
        expect(readAssist).not.toHaveBeenCalled();
    });

    it('装备预处理识别失败时保留错误，不使用原色读数覆盖字段', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'failed', error: '识别引擎不可用' });
        await expect(
            createCharacterPanelReader()(
                lines('耐久度191', '气血4238', '魔法931'),
                image,
                '五庄观',
                'gear',
            ),
        ).rejects.toThrow('识别引擎不可用');
        expect(recognizeGearPanel).not.toHaveBeenCalled();
        expect(readAssist).not.toHaveBeenCalled();
    });

    it('混合面板与空截图不猜测归属', async () => {
        const read = createCharacterPanelReader();
        expect(await read(lines('召唤兽属性', '耐久度191'), image, '五庄观', 'attrs')).toBeNull();
        expect(await read([], image, '五庄观', 'attrs')).toBeNull();
        expect(recognizePetPanel).not.toHaveBeenCalled();
        expect(recognizeGearPanel).not.toHaveBeenCalled();
    });
});

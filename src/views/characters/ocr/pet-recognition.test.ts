import { beforeEach, describe, expect, it, vi } from 'vitest';
import panelJson from '../../../../public/game/data/pet-panel.json';
import { loadPetAssets, parsePetPanel } from '../../../services/pet-assets';
import { findTiles, matchIcons } from './matcher';
import { recognizePetPanel } from './pet-recognition';
import type { OcrLine } from './attr-panel';

vi.mock('../../../services/pet-assets', async (original) => ({
    ...(await original<typeof import('../../../services/pet-assets')>()),
    loadPetAssets: vi.fn(),
}));
vi.mock('./matcher', () => ({ findTiles: vi.fn(), matchIcons: vi.fn() }));
const line = (text: string, x: number, y: number): OcrLine => ({
    text,
    x,
    y,
    width: 80,
    height: 20,
    score: 0.99,
});

describe('召唤兽原图区域', () => {
    beforeEach(() => {
        vi.mocked(loadPetAssets).mockResolvedValue({
            panel: parsePetPanel(panelJson),
            skills: [{ id: 'a', name: '连击', url: '/skill.png' }],
            portraits: [
                { id: 'pet-1', name: '兽', url: '/1.png', fingerprint: 'same' },
                { id: 'pet-2', name: '变异兽', url: '/2.png', fingerprint: 'same' },
            ],
        });
        vi.mocked(findTiles).mockReturnValue([
            { x: 780, y: 50, width: 40, height: 40 }, // 装备图标
            { x: 780, y: 650, width: 40, height: 40 },
        ]);
        vi.mocked(matchIcons).mockReset();
    });
    it('只在资质窗口下方比对技能，按格子顺序写回', async () => {
        const image = {
            width: 1226,
            height: 946,
            data: new Uint8ClampedArray(1226 * 946 * 4),
        } as ImageData;
        vi.mocked(matchIcons).mockResolvedValue([
            { name: '连击', score: 0.9, box: { x: 780, y: 650, width: 40, height: 40 } },
        ]);
        const result = await recognizePetPanel(
            [
                line('攻击资质1616', 780, 220),
                line('防御资质1327', 780, 260),
                line('五行土', 780, 560),
            ],
            image,
        );
        expect(vi.mocked(matchIcons).mock.calls[0][2]?.tiles).toEqual([
            { x: 780, y: 650, width: 40, height: 40 },
        ]);
        expect(result.patch.skills).toEqual(['连击']);
        expect(vi.mocked(matchIcons).mock.calls[0][2]?.appearance?.color).toBe(true);
    });
    it('查看资质按钮不参与技能区域定位，五行漏识别仍保留技能', async () => {
        const image = {
            width: 1226,
            height: 946,
            data: new Uint8ClampedArray(1226 * 946 * 4),
        } as ImageData;
        vi.mocked(matchIcons).mockResolvedValue([]);
        await recognizePetPanel(
            [
                line('攻击资质1616', 780, 220),
                line('防御资质1327', 780, 260),
                line('查看资质', 576, 900),
            ],
            image,
        );
        expect(vi.mocked(matchIcons).mock.calls[0][2]?.tiles).toEqual([
            { x: 780, y: 650, width: 40, height: 40 },
        ]);
    });
    it('相近图标返回待确认候选，不把任一候选写成已识别技能', async () => {
        const image = { width: 1000, height: 900, data: new Uint8ClampedArray(0) } as ImageData;
        vi.mocked(matchIcons).mockImplementation(async (_image, _candidates, options) => {
            options?.onAmbiguous?.(['茁壮', '欣欣向荣'], { x: 780, y: 650, width: 40, height: 40 });
            return [];
        });
        const result = await recognizePetPanel(
            [line('攻击资质1616', 780, 220), line('防御资质1327', 780, 260)],
            image,
        );
        expect(result.ambiguousSkills).toEqual([['茁壮', '欣欣向荣']]);
        expect(result.patch.skills).toBeUndefined();
        expect(result.skillCount).toBe(0);
    });
    it('黄色参战兽不是当前查看项，按蓝色选中背景取第二只；相同原图不互相拉低头像匹配置信度', async () => {
        const image = {
            width: 800,
            height: 900,
            data: new Uint8ClampedArray(800 * 900 * 4),
        } as ImageData;
        for (let y = 100; y < 120; y++)
            for (let x = 110; x < 190; x++)
                image.data.set([255, 255, 0, 255], (y * image.width + x) * 4);
        for (let y = 200; y < 220; y++)
            for (let x = 110; x < 190; x++)
                image.data.set([90, 85, 220, 255], (y * image.width + x) * 4);
        vi.mocked(matchIcons)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { name: 'pet-1', score: 0.9, box: { x: 50, y: 170, width: 50, height: 50 } },
            ]);
        const result = await recognizePetPanel(
            [line('139级', 110, 100), line('123级', 110, 200), line('攻击2016', 24, 490)],
            image,
        );
        expect(result.patch.level).toBe(123);
        expect(result.patch.portrait).toBe('pet-1');
        expect(vi.mocked(matchIcons).mock.calls[1][1]).toHaveLength(1);
    });
});

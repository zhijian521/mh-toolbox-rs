import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrFrame } from '../../../services/ocr';
import { readAssistLevels } from './assist-image';
import { createAssistReader } from './assist-reader';
import { matchIcons } from './matcher';

vi.mock('../../../services/game-data', () => ({
    lifeSkills: () => ['强身术'],
    storySkills: () => ['打坐'],
}));
vi.mock('../../../services/game-icons', () => ({ assistIcon: (name: string) => name + '.webp' }));
vi.mock('./assist-image', () => ({ readAssistLevels: vi.fn() }));
vi.mock('./matcher', () => ({ matchIcons: vi.fn() }));
vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));
vi.mock('./pixels', () => ({
    base64Of: () => 'whole',
    swapToBgra: (data: Uint8ClampedArray) => data,
}));

const image = () => ({ width: 316, height: 424 }) as ImageData;
beforeEach(() => {
    vi.mocked(ocrFrame).mockReset().mockResolvedValue({ status: 'ok', lines: [] });
    vi.mocked(matchIcons)
        .mockReset()
        .mockResolvedValue([
            { name: '强身术', score: 0.99, box: { x: 54, y: 94, width: 40, height: 40 } },
        ]);
    vi.mocked(readAssistLevels)
        .mockReset()
        .mockResolvedValue([{ text: '98', x: 66, y: 142, width: 16, height: 13, score: 0.99 }]);
});

describe('辅助截图快速识别', () => {
    it('同图并发和切回共用一次匹配与等级识别，手动修改不污染原始结果', async () => {
        const read = createAssistReader();
        const shot = image();
        const [first, second] = await Promise.all([read(shot), read(shot)]);
        expect(matchIcons).toHaveBeenCalledTimes(1);
        expect(readAssistLevels).toHaveBeenCalledTimes(1);
        expect(ocrFrame).not.toHaveBeenCalled();
        expect(first.rows[0]).toMatchObject({ name: '强身术', level: 98 });
        first.rows[0].level = 120;
        expect(second.rows[0].level).toBe(98);
        expect((await read(shot)).rows[0].level).toBe(98);
        expect(readAssistLevels).toHaveBeenCalledTimes(1);

        await read(image());
        expect(matchIcons).toHaveBeenCalledTimes(2);
        expect(readAssistLevels).toHaveBeenCalledTimes(2);
    });

    it('没有可信图标时不送等级 OCR，也不猜技能', async () => {
        vi.mocked(matchIcons).mockResolvedValue([]);
        const result = await createAssistReader()(image());
        expect(result.hit).toBe(0);
        expect(result.rows).toEqual([]);
        expect(readAssistLevels).not.toHaveBeenCalled();
        expect(ocrFrame).not.toHaveBeenCalled();
    });

    it('裁切漏掉等级时才补整图，识别成功后不再重复调用', async () => {
        vi.mocked(readAssistLevels).mockResolvedValue([]);
        vi.mocked(ocrFrame).mockResolvedValue({
            status: 'ok',
            lines: [{ text: '98', x: 66, y: 142, width: 16, height: 13, score: 0.99 }],
        });
        const read = createAssistReader();
        const shot = image();
        expect((await read(shot)).rows[0].level).toBe(98);
        await read(shot);
        expect(ocrFrame).toHaveBeenCalledTimes(1);
        expect(ocrFrame).toHaveBeenCalledWith('whole', 316, 424);
    });

    it('等级识别失败时保留原错误并移除缓存，允许重试', async () => {
        vi.mocked(readAssistLevels).mockRejectedValueOnce(new Error('OCR 推理失败'));
        const read = createAssistReader();
        const shot = image();
        await expect(read(shot)).rejects.toThrow('OCR 推理失败');
        expect((await read(shot)).rows[0].level).toBe(98);
        expect(readAssistLevels).toHaveBeenCalledTimes(2);
    });
});

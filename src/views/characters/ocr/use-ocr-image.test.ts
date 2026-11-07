import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { ocrFrame, type OcrOutcome } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import { useOcrImage } from './use-ocr-image';

vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));
vi.mock('./pixels', () => ({
    prepareFrame: (bitmap: ImageBitmap) => ({
        frame: { pixels: String(bitmap.width), width: bitmap.width, height: 1 },
        image: { width: bitmap.width } as ImageData,
    }),
}));
function gate<T>() {
    let release!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
const tick = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};
const lines = (text: string): OcrLine[] => [{ text, x: 0, y: 0, width: 1, height: 1, score: 1 }];
const file = () => new File(['image'], 'panel.png', { type: 'image/png' });
let scope: EffectScope;
let bitmaps: { width: number; close: ReturnType<typeof vi.fn> }[];
function session(parse = async (rows: OcrLine[]) => ({ result: rows[0].text })) {
    scope = effectScope();
    return scope.run(() => useOcrImage(parse))!;
}
beforeEach(() => {
    bitmaps = [];
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => {
            const bitmap = { width: bitmaps.length + 1, close: vi.fn() };
            bitmaps.push(bitmap);
            return bitmap;
        }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:panel');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.mocked(ocrFrame).mockReset();
});
afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('OCR 图像请求生命周期', () => {
    it('整图没有文字时仍交给面板解析，让辅助图标和等级裁切可以接管', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: [] });
        const parse = vi.fn(async () => ({ result: 'assist' }));
        const image = session(parse);
        await image.takeFile(file());
        expect(parse).toHaveBeenCalledWith([], expect.objectContaining({ width: 1 }));
        expect(image.result.value).toBe('assist');
        expect(image.error.value).toBe('');
        expect(image.busy.value).toBe(false);
    });

    it('新图立即清旧结果，旧 OCR 后到也不能覆盖最新图，句柄各释放一次', async () => {
        vi.mocked(ocrFrame).mockResolvedValueOnce({ status: 'ok', lines: lines('old') });
        const image = session();
        await image.takeFile(file());
        expect(image.result.value).toBe('old');
        const a = gate<OcrOutcome>();
        const b = gate<OcrOutcome>();
        vi.mocked(ocrFrame).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
        const first = image.takeFile(file());
        expect(image.result.value).toBeNull();
        expect(image.busy.value).toBe(true);
        await tick();
        const second = image.takeFile(file());
        await tick();
        b.release({ status: 'ok', lines: lines('latest') });
        await second;
        a.release({ status: 'ok', lines: lines('stale') });
        await first;
        expect(image.result.value).toBe('latest');
        expect(image.rawLines.value[0].text).toBe('latest');
        expect(image.busy.value).toBe(false);
        expect(bitmaps.every((one) => one.close.mock.calls.length === 1)).toBe(true);
    });
    it('切分区的图标匹配后到时，只能保留最后一次解析', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: lines('panel') });
        const slow = gate<{ result: string }>();
        const parse = vi
            .fn()
            .mockReturnValueOnce(slow.promise)
            .mockResolvedValue({ result: 'new pane' });
        const image = session(parse);
        const first = image.takeFile(file());
        await tick();
        await image.classify();
        slow.release({ result: 'old pane' });
        await first;
        expect(image.result.value).toBe('new pane');
        expect(ocrFrame).toHaveBeenCalledTimes(1);
    });
    it('销毁后解码才完成也会释放位图，不再调用 OCR 或创建 URL', async () => {
        const decoded = gate<ImageBitmap>();
        vi.mocked(createImageBitmap).mockReturnValueOnce(decoded.promise);
        const image = session();
        const reading = image.takeFile(file());
        scope.stop();
        const close = vi.fn();
        decoded.release({ width: 1, close } as unknown as ImageBitmap);
        await reading;
        expect(close).toHaveBeenCalledOnce();
        expect(ocrFrame).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { ocrFrame, type OcrOutcome } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import { useOcrImage } from './use-ocr-image';
import { base64Of } from './pixels';

vi.mock('../../../services/ocr', () => ({ ocrFrame: vi.fn() }));
vi.mock('./pixels', () => ({
    imageDataOf: (bitmap: ImageBitmap) => ({
        width: bitmap.width,
        height: 1,
        data: Uint8ClampedArray.of(bitmap.width, 0, 0, 255),
    }),
    swapToBgra: (data: Uint8ClampedArray) => data,
    base64Of: vi.fn((bytes: Uint8Array) => String(bytes[0])),
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
    vi.mocked(base64Of).mockClear();
});
afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('OCR 图像请求生命周期', () => {
    it('装备预处理只替换送给 OCR 的像素，解析与原图预览仍使用原坐标', async () => {
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: lines('装备') });
        const parse = vi.fn(async () => ({ result: 'gear' }));
        scope = effectScope();
        const image = scope.run(() =>
            useOcrImage(parse, () => ({
                pixels: 'filtered',
                width: 1,
                height: 1,
            })),
        )!;
        await image.takeFile(file());
        expect(ocrFrame).toHaveBeenCalledWith('filtered', 1, 1);
        expect(parse).toHaveBeenCalledWith(lines('装备'), expect.objectContaining({ width: 1 }));
        expect(image.shotUrl.value).toBe('blob:panel');
    });
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

    it('辅助路径不编码或识别整图，切到文字分区后按需识别一次并复用', async () => {
        let whole = false;
        const parse = vi.fn(async (rows: OcrLine[]) => ({ result: rows[0]?.text ?? 'assist' }));
        vi.mocked(ocrFrame).mockResolvedValue({ status: 'ok', lines: lines('whole') });
        scope = effectScope();
        const image = scope.run(() => useOcrImage(parse, undefined, () => whole))!;
        await image.takeFile(file());
        expect(ocrFrame).not.toHaveBeenCalled();
        expect(base64Of).not.toHaveBeenCalled();
        expect(image.result.value).toBe('assist');
        expect(image.busy.value).toBe(false);

        whole = true;
        await image.classify();
        await image.classify();
        expect(image.result.value).toBe('whole');
        expect(ocrFrame).toHaveBeenCalledTimes(1);
        expect(base64Of).toHaveBeenCalledTimes(1);

        whole = false;
        await image.classify();
        expect(image.result.value).toBe('assist');
        expect(image.rawLines.value).toEqual([]);
        expect(ocrFrame).toHaveBeenCalledTimes(1);
    });

    it('整图识别尚未结束时切分区，复用在途请求，只解析最后一页', async () => {
        const pending = gate<OcrOutcome>();
        vi.mocked(ocrFrame).mockReturnValue(pending.promise);
        const parse = vi.fn(async () => ({ result: 'latest' }));
        const image = session(parse);
        const first = image.takeFile(file());
        await tick();
        const second = image.classify();
        expect(ocrFrame).toHaveBeenCalledTimes(1);
        pending.release({ status: 'ok', lines: lines('whole') });
        await Promise.all([first, second]);
        expect(parse).toHaveBeenCalledTimes(1);
        expect(image.result.value).toBe('latest');
        expect(image.busy.value).toBe(false);
    });

    it('整图识别失败后可重试，不把失败结果留作缓存', async () => {
        vi.mocked(ocrFrame)
            .mockResolvedValueOnce({ status: 'failed', error: '模型忙' })
            .mockResolvedValueOnce({ status: 'ok', lines: lines('retry') });
        const image = session();
        await image.takeFile(file());
        expect(image.error.value).toBe('模型忙');
        await image.classify();
        expect(image.result.value).toBe('retry');
        expect(image.error.value).toBe('');
        expect(ocrFrame).toHaveBeenCalledTimes(2);
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

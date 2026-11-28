import { afterEach, expect, it, vi } from 'vitest';
import { copySharePng } from './share-image';

class PngItem {
    constructor(readonly data: Record<string, Promise<Blob>>) {}
}

function mockClipboard(write: (items: PngItem[]) => Promise<unknown>) {
    vi.stubGlobal('ClipboardItem', PngItem);
    vi.stubGlobal('navigator', { clipboard: { write } });
}

afterEach(() => vi.unstubAllGlobals());

it('点击时立即请求写入，渲染完成后交付 PNG 图片', async () => {
    const image = new Blob(['png'], { type: 'image/png' });
    const write = vi.fn(async ([item]: PngItem[]) => {
        expect(await item.data['image/png']).toBe(image);
    });
    mockClipboard(write);
    const copied = copySharePng(() => Promise.resolve(image));
    expect(write).toHaveBeenCalledOnce();
    await copied;
});

it('图片渲染失败时保留原始错误', async () => {
    mockClipboard(async ([item]) => item.data['image/png']);
    await expect(copySharePng(() => Promise.reject(new Error('无法绘制卡片')))).rejects.toThrow(
        '无法绘制卡片',
    );
});

it('写入权限受限时提示重试', async () => {
    mockClipboard(async () => {
        throw new DOMException('denied', 'NotAllowedError');
    });
    await expect(copySharePng(async () => new Blob())).rejects.toThrow('允许写入剪贴板');
});

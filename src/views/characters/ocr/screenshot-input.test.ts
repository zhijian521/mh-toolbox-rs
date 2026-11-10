import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageFiles, pastedImages } from './screenshot-input';

const lower = {};
const upper = {};
const first = new File(['first'], 'first.png', { type: 'image/png' });
const second = new File(['second'], 'second.webp', { type: 'image/webp' });
const text = new File(['text'], 'note.txt', { type: 'text/plain' });

function host(modal: object | null, visible = true): HTMLElement {
    return {
        getClientRects: () => (visible ? [{}] : []),
        closest: () => modal,
    } as unknown as HTMLElement;
}

function paste(files: File[]): ClipboardEvent {
    return {
        clipboardData: {
            items: files.map((file) => ({ type: file.type, getAsFile: () => file })),
        },
    } as unknown as ClipboardEvent;
}

beforeEach(() => {
    vi.stubGlobal('document', { querySelectorAll: () => [lower, upper] });
});
afterEach(() => vi.unstubAllGlobals());

describe('截图上传入口', () => {
    it('选图与拖放忽略非图片，保留多图原顺序', () => {
        expect(imageFiles([second, text, first])).toEqual([second, first]);
        expect(imageFiles([])).toEqual([]);
    });

    it('叠窗时同一次粘贴只交给栈顶，背景窗不重复识别', () => {
        const event = paste([first, second]);
        expect(pastedImages(event, host(lower))).toEqual([]);
        expect(pastedImages(event, host(upper))).toEqual([first, second]);
    });

    it('隐藏分区、未挂载节点及不在弹窗内的节点不消费粘贴', () => {
        const event = paste([first]);
        expect(pastedImages(event, host(upper, false))).toEqual([]);
        expect(pastedImages(event, null)).toEqual([]);
        expect(pastedImages(event, host(null))).toEqual([]);
    });

    it('文本粘贴和无法取得文件的剪贴板项目不会触发识别', () => {
        expect(pastedImages(paste([text]), host(upper))).toEqual([]);
        const event = {
            clipboardData: { items: [{ type: 'image/png', getAsFile: () => null }] },
        } as unknown as ClipboardEvent;
        expect(pastedImages(event, host(upper))).toEqual([]);
        expect(pastedImages({} as ClipboardEvent, host(upper))).toEqual([]);
    });
});

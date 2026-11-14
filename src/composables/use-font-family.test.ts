import { afterEach, describe, expect, it, vi } from 'vitest';

const errorNotice = vi.hoisted(() => vi.fn());
vi.mock('./use-notify', () => ({ notify: { error: errorNotice } }));

async function setup(raw: string | null = null, blocked = false) {
    vi.resetModules();
    const vue = await import('vue');
    const store = new Map([
        ['mh-theme', 'dark'],
        ['mh-theme-style', 'crystal'],
        ['mh-font-scale', 'large'],
    ]);
    if (raw !== null) store.set('mh-font-family', raw);
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => {
            if (blocked) throw new Error('blocked');
            return store.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
            if (blocked) throw new Error('blocked');
            store.set(key, value);
        },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    errorNotice.mockClear();
    return { ...vue, dataset, store, ...(await import('./use-font-family')) };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('独立字体偏好', () => {
    it.each([null, '', 'constructor', 'unknown'])('没有有效设置时保留原文楷：%s', async (raw) => {
        const { useFontFamily, dataset } = await setup(raw);
        const { font, selectedFont } = useFontFamily();
        expect(font.value).toBe('wenkai');
        expect(dataset.font).toBe('wenkai');
        expect(selectedFont.value.label).toBe('霞鹜文楷');
        expect(errorNotice).not.toHaveBeenCalled();
    });

    it('全部字体均可切换，且只写字体偏好', async () => {
        const { useFontFamily, FONT_OPTIONS, nextTick, dataset, store } = await setup('sans');
        const { font, selectedFont } = useFontFamily();
        expect(dataset.font).toBe('sans');
        for (const option of FONT_OPTIONS) {
            font.value = option.value;
            await nextTick();
            expect(dataset.font).toBe(option.value);
            expect(store.get('mh-font-family')).toBe(option.value);
            expect(selectedFont.value.label).toBe(option.label);
        }
        expect(store.get('mh-theme')).toBe('dark');
        expect(store.get('mh-theme-style')).toBe('crystal');
        expect(store.get('mh-font-scale')).toBe('large');
    });

    it('重新打开时恢复圆体偏好', async () => {
        const { useFontFamily, dataset } = await setup('rounded');
        const { font, selectedFont } = useFontFamily();
        expect(font.value).toBe('rounded');
        expect(dataset.font).toBe('rounded');
        expect(selectedFont.value.label).toBe('资源圆体');
    });

    it('设置页卸载后仍保持共享状态与监听', async () => {
        const { useFontFamily, effectScope, nextTick, dataset } = await setup();
        const page = effectScope();
        const initial = page.run(useFontFamily)!;
        page.stop();
        const next = useFontFamily();
        expect(next.font).toBe(initial.font);
        next.font.value = 'serif';
        await nextTick();
        expect(dataset.font).toBe('serif');
    });

    it('存储被禁用时仍可切字体，初始化安静、用户操作给失败回执', async () => {
        const { useFontFamily, nextTick, dataset } = await setup(null, true);
        const { font } = useFontFamily();
        expect(dataset.font).toBe('wenkai');
        expect(errorNotice).not.toHaveBeenCalled();
        font.value = 'zhuque';
        await nextTick();
        expect(font.value).toBe('zhuque');
        expect(dataset.font).toBe('zhuque');
        expect(errorNotice).toHaveBeenCalledWith('本次设置已生效，未能记住');
    });
});

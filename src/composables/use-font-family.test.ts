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
    it.each([null, '', 'constructor', 'unknown', 'serif', 'zhuque'])(
        '未设置、无效或已移除的字体偏好回到文楷：%s',
        async (raw) => {
            const { useFontFamily, dataset } = await setup(raw);
            const { font, selectedFont } = useFontFamily();
            expect(font.value).toBe('wenkai');
            expect(dataset.font).toBe('wenkai');
            expect(selectedFont.value.label).toBe('霞鹜文楷');
            expect(errorNotice).not.toHaveBeenCalled();
        },
    );

    it('全部字体均可切换，且只写字体偏好', async () => {
        const { useFontFamily, FONT_OPTIONS, nextTick, dataset, store } = await setup('system');
        const { font, selectedFont } = useFontFamily();
        expect(dataset.font).toBe('system');
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

    it.each([
        ['rounded', '资源圆体'],
        ['system', '系统默认'],
    ])('重新打开时恢复字体偏好：%s', async (saved, label) => {
        const { useFontFamily, dataset } = await setup(saved);
        const { font, selectedFont } = useFontFamily();
        expect(font.value).toBe(saved);
        expect(dataset.font).toBe(saved);
        expect(selectedFont.value.label).toBe(label);
    });

    it('旧黑体偏好使用系统默认，后续可独立保存新选择', async () => {
        const { useFontFamily, FONT_OPTIONS, nextTick, dataset, store } = await setup('sans');
        const { font, selectedFont } = useFontFamily();
        expect(font.value).toBe('system');
        expect(dataset.font).toBe('system');
        expect(selectedFont.value.label).toBe('系统默认');
        expect(FONT_OPTIONS.map((option) => option.value)).toEqual(['wenkai', 'rounded', 'system']);
        font.value = 'rounded';
        await nextTick();
        font.value = 'system';
        await nextTick();
        expect(store.get('mh-font-family')).toBe('system');
        expect(store.get('mh-theme')).toBe('dark');
    });

    it('设置页卸载后仍保持共享状态与监听', async () => {
        const { useFontFamily, effectScope, nextTick, dataset } = await setup();
        const page = effectScope();
        const initial = page.run(useFontFamily)!;
        page.stop();
        const next = useFontFamily();
        expect(next.font).toBe(initial.font);
        next.font.value = 'system';
        await nextTick();
        expect(dataset.font).toBe('system');
    });

    it('存储被禁用时仍可切字体，初始化安静、用户操作给失败回执', async () => {
        const { useFontFamily, nextTick, dataset } = await setup(null, true);
        const { font } = useFontFamily();
        expect(dataset.font).toBe('wenkai');
        expect(errorNotice).not.toHaveBeenCalled();
        font.value = 'rounded';
        await nextTick();
        expect(font.value).toBe('rounded');
        expect(dataset.font).toBe('rounded');
        expect(errorNotice).toHaveBeenCalledWith('本次设置已生效，未能记住');
    });
});

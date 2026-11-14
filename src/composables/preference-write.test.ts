import { afterEach, describe, expect, it, vi } from 'vitest';

const errorNotice = vi.hoisted(() => vi.fn());
vi.mock('./use-notify', () => ({ notify: { error: errorNotice } }));

async function setup() {
    vi.resetModules();
    const { nextTick } = await import('vue');
    const values = new Map<string, string>();
    const classList = { toggle: vi.fn() };
    const dataset: Record<string, string> = {};
    let systemChange: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal('document', {
        documentElement: {
            style: { setProperty: (key: string, value: string) => values.set(key, value) },
            classList,
            dataset,
        },
    });
    vi.stubGlobal('window', {
        matchMedia: () => ({
            matches: false,
            addEventListener: (_: string, handler: typeof systemChange) => {
                systemChange = handler;
            },
        }),
    });
    vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {
            throw new Error('quota');
        },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    errorNotice.mockClear();
    return {
        nextTick,
        values,
        classList,
        dataset,
        systemChange: () => systemChange?.({ matches: true }),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('偏好记忆失败仍应用本次选择', () => {
    it('字号写入失败仍更新 CSS，并给一次简短回执', async () => {
        const { nextTick, values } = await setup();
        const { useFontScale } = await import('./use-font-scale');
        const { scale } = useFontScale();
        scale.value = 'large';
        await nextTick();
        expect(values.get('--fs-scale')).toBe('1.1');
        expect(errorNotice).toHaveBeenCalledOnce();
    });

    it('开发模式写入失败不抛异常，当前开关仍可关闭', async () => {
        await setup();
        const { useDevMode } = await import('./use-dev-mode');
        const { devMode } = useDevMode();
        expect(() => {
            devMode.value = true;
        }).not.toThrow();
        expect(devMode.value).toBe(true);
        devMode.value = false;
        expect(devMode.value).toBe(false);
        expect(errorNotice).toHaveBeenCalledTimes(2);
    });

    it('主题初始化和系统明暗变化不提示存储错误，用户更改才提示', async () => {
        const { nextTick, dataset, classList, systemChange } = await setup();
        const { useTheme } = await import('./use-theme');
        const { style, mode } = useTheme();
        expect(errorNotice).not.toHaveBeenCalled();
        systemChange();
        await nextTick();
        expect(classList.toggle).toHaveBeenLastCalledWith('dark', true);
        expect(errorNotice).not.toHaveBeenCalled();
        style.value = 'celadon';
        await nextTick();
        expect(dataset.style).toBe('celadon');
        expect(errorNotice).toHaveBeenCalledOnce();
        mode.value = 'light';
        await nextTick();
        expect(classList.toggle).toHaveBeenLastCalledWith('dark', false);
        expect(errorNotice).toHaveBeenCalledTimes(2);
    });
});

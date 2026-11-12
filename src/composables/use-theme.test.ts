import { afterEach, describe, expect, it, vi } from 'vitest';

async function setup(
    raw: string | null,
    systemDark = false,
    storageBlocked = false,
    rawStyle: string | null = null,
) {
    vi.resetModules();
    const { nextTick } = await import('vue');
    const classes = new Set<string>();
    const store = new Map<string, string>();
    if (raw !== null) store.set('mh-theme', raw);
    if (rawStyle !== null) store.set('mh-theme-style', rawStyle);
    const dataset: Record<string, string> = {};
    let systemChange: ((event: { matches: boolean }) => void) | undefined;
    const addEventListener = vi.fn(
        (_name: string, callback: (event: { matches: boolean }) => void) => {
            systemChange = callback;
        },
    );
    vi.stubGlobal('window', {
        matchMedia: () => ({ matches: systemDark, addEventListener }),
    });
    vi.stubGlobal('document', {
        documentElement: {
            dataset,
            classList: {
                toggle(name: string, enabled: boolean) {
                    if (enabled) classes.add(name);
                    else classes.delete(name);
                },
            },
        },
    });
    vi.stubGlobal('localStorage', {
        getItem(key: string) {
            if (storageBlocked) throw new Error('SecurityError');
            return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            if (storageBlocked) throw new Error('SecurityError');
            store.set(key, value);
        },
    });
    const { useTheme } = await import('./use-theme');
    return {
        useTheme,
        nextTick,
        classes,
        dataset,
        store,
        addEventListener,
        systemChange: (matches: boolean) => systemChange?.({ matches }),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('明暗主题', () => {
    it.each([null, 'invalid', '__proto__'])('无效存储 %j 跟随系统', async (raw) => {
        const env = await setup(raw, true);
        const theme = env.useTheme();
        expect(theme.mode.value).toBe('system');
        expect(env.classes.has('dark')).toBe(true);
        env.systemChange(false);
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(false);
    });

    it('显式明暗选择不跟随系统变化，并保存选择', async () => {
        const env = await setup('light', true);
        const theme = env.useTheme();
        expect(env.classes.has('dark')).toBe(false);
        env.systemChange(false);
        theme.mode.value = 'dark';
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(true);
        expect(env.store.get('mh-theme')).toBe('dark');
        env.systemChange(true);
        theme.mode.value = 'light';
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(false);
    });

    it('存储读写被禁用时仍能切换', async () => {
        const env = await setup(null, false, true);
        const theme = env.useTheme();
        expect(theme.mode.value).toBe('system');
        theme.toggle();
        theme.style.value = 'celadon';
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(true);
        expect(env.dataset.style).toBe('celadon');
    });

    it('多处调用共享状态，系统监听只注册一次', async () => {
        const env = await setup('light');
        const first = env.useTheme();
        const second = env.useTheme();
        first.toggle();
        await env.nextTick();
        expect(second.mode.value).toBe('dark');
        expect(env.addEventListener).toHaveBeenCalledTimes(1);
    });
});

describe('外观风格', () => {
    it.each([null, 'invalid', '__proto__', 'dark'])(
        '无效风格 %j 回落账簿，保留明暗',
        async (raw) => {
            const env = await setup('dark', false, false, raw);
            const theme = env.useTheme();
            expect(theme.style.value).toBe('ledger');
            expect(env.dataset.style).toBe('ledger');
            expect(env.classes.has('dark')).toBe(true);
        },
    );

    it('挂载前恢复青瓷，多处入口共享状态，切回账簿可保存', async () => {
        const env = await setup('dark', false, false, 'celadon');
        const first = env.useTheme();
        const second = env.useTheme();
        expect(first.style.value).toBe('celadon');
        expect(env.dataset.style).toBe('celadon');

        first.style.value = 'ledger';
        await env.nextTick();
        expect(second.style.value).toBe('ledger');
        expect(env.dataset.style).toBe('ledger');
        expect(env.store.get('mh-theme-style')).toBe('ledger');
        expect(env.store.get('mh-theme')).toBe('dark');
        expect(env.classes.has('dark')).toBe(true);
    });

    it('明暗和系统变化不改风格', async () => {
        const env = await setup('system', false, false, 'celadon');
        const theme = env.useTheme();
        env.systemChange(true);
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(true);
        theme.mode.value = 'light';
        await env.nextTick();
        expect(env.classes.has('dark')).toBe(false);
        expect(theme.style.value).toBe('celadon');
        expect(env.dataset.style).toBe('celadon');
        expect(env.store.get('mh-theme-style')).toBe('celadon');
    });
});

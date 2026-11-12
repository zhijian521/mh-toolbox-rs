import { afterEach, describe, expect, it, vi } from 'vitest';

async function setup() {
    vi.resetModules();
    const values = new Map([
        ['--font-ui', 'WenKai, sans-serif'],
        ['--fs-sm', '12px'],
        ['--fs-base', '13.5px'],
        ['--ghost-wash', 'rgb(240, 184, 170)'],
    ]);
    const root = {};
    const probe = {
        style: { color: '', fontSize: '', fontFamily: '', display: '' },
        remove: vi.fn(),
    };
    const createElement = vi.fn(() => probe);
    vi.stubGlobal('document', {
        documentElement: root,
        body: { append: vi.fn() },
        createElement,
    });
    const tokenValue = (value: string) => values.get(value.slice(4, -1)) ?? value;
    vi.stubGlobal('getComputedStyle', (element: unknown) => {
        if (element === root) {
            return {
                colorScheme: 'light',
                getPropertyValue: (name: string) => values.get(name) ?? '',
            };
        }
        return {
            color: tokenValue(probe.style.color),
            fontSize: tokenValue(probe.style.fontSize),
            fontFamily: tokenValue(probe.style.fontFamily),
        };
    });
    const { resolveColors } = await import('./map-paint');
    return { values, probe, createElement, resolveColors };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('地图样式读取', () => {
    it('样式不变时复用缓存，读完移除取色元素', async () => {
        const env = await setup();
        const colors = env.resolveColors();
        expect(env.resolveColors()).toBe(colors);
        expect(env.createElement).toHaveBeenCalledTimes(1);
        expect(env.probe.remove).toHaveBeenCalledTimes(1);
    });

    it('明暗不变时换色也会更新地图', async () => {
        const env = await setup();
        const before = env.resolveColors();
        env.values.set('--ghost-wash', 'rgb(100, 160, 140)');
        const after = env.resolveColors();
        expect(after).not.toBe(before);
        expect(after.wash).toBe('rgb(100, 160, 140)');
    });

    it('地图字体和字号都读取全局令牌', async () => {
        const env = await setup();
        expect(env.resolveColors().fontLabel).toBe('12px WenKai, sans-serif');
        env.values.set('--font-ui', 'AnotherFont, serif');
        env.values.set('--fs-sm', '14px');
        env.values.set('--fs-base', '16px');
        const colors = env.resolveColors();
        expect(colors.fontLabel).toBe('14px AnotherFont, serif');
        expect(colors.fontExact).toBe('16px AnotherFont, serif');
    });
});

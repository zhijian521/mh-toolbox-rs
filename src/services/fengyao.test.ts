import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    readFengyaoPreferences,
    saveFengyaoPreferences,
    type FengyaoPreferences,
} from './fengyao';

const key = 'mh-fengyao-preferences';
const preferences: FengyaoPreferences = {
    scenes: ['麒麟山', '蓬莱仙岛'],
    windowTitle: '梦幻西游 聊天窗口',
    region: { x: 0, y: 330, width: 740, height: 200, frameWidth: 740, frameHeight: 1024 },
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('封妖助手偏好持久化', () => {
    it('首次没有设置，保存后再次读取还原地图和选区，主动全关也保留', () => {
        const storage = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (name: string) => storage.get(name) ?? null,
            setItem: (name: string, value: string) => storage.set(name, value),
        });
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: null });
        expect(saveFengyaoPreferences(preferences)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
        expect(storage.get(key)).not.toContain('hwnd');
        const disabled = { ...preferences, scenes: [] };
        expect(saveFengyaoPreferences(disabled)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: disabled });
    });

    it.each([
        '{broken',
        JSON.stringify({ ...preferences, scenes: ['麒麟山', null] }),
        JSON.stringify({ ...preferences, region: { ...preferences.region, x: 1000 } }),
    ])('读取失败保留原设置，暂停覆盖：%s', (raw) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', { getItem: () => raw, setItem });
        expect(readFengyaoPreferences().ok).toBe(false);
        expect(saveFengyaoPreferences(preferences)).toBe(false);
        expect(setItem).not.toHaveBeenCalled();
    });

    it('写入失败明确返回失败，不丢掉之前保存的选择', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const raw = JSON.stringify(preferences);
        vi.stubGlobal('localStorage', {
            getItem: () => raw,
            setItem: () => { throw new Error('quota'); },
        });
        expect(saveFengyaoPreferences({ ...preferences, scenes: [] })).toBe(false);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
    });
});

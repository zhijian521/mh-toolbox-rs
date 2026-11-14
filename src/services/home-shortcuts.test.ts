import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHomeShortcuts, saveHomeShortcuts } from './home-shortcuts';

afterEach(() => vi.unstubAllGlobals());

function storage(initial: string | null = null) {
    let raw = initial;
    const mock = {
        getItem: vi.fn(() => raw),
        setItem: vi.fn((_key: string, value: string) => {
            raw = value;
        }),
    };
    vi.stubGlobal('localStorage', mock);
    return mock;
}

describe('首页常用功能本机偏好', () => {
    it('保持顺序与明确清空，读取不回写存储', () => {
        const mock = storage();
        expect(readHomeShortcuts()).toBeUndefined();
        expect(saveHomeShortcuts(['settings', 'account-new'])).toBe(true);
        expect(readHomeShortcuts()).toEqual(['settings', 'account-new']);
        expect(saveHomeShortcuts([])).toBe(true);
        expect(readHomeShortcuts()).toEqual([]);
        expect(mock.setItem).toHaveBeenCalledTimes(2);
        expect(mock.getItem).toHaveBeenCalledWith('mh-home-shortcuts');
    });

    it('损坏配置与不可用存储安全回退，不影响打开首页', () => {
        const mock = storage('{invalid');
        expect(readHomeShortcuts()).toBeUndefined();
        mock.getItem.mockImplementation(() => {
            throw new Error('denied');
        });
        expect(readHomeShortcuts()).toBeUndefined();
        vi.stubGlobal('localStorage', undefined);
        expect(readHomeShortcuts()).toBeUndefined();
        expect(saveHomeShortcuts([])).toBe(false);
    });

    it('写入失败返回失败，保留上一次已保存的顺序', () => {
        const mock = storage('["settings"]');
        mock.setItem.mockImplementation(() => {
            throw new Error('quota');
        });
        expect(saveHomeShortcuts(['account-new'])).toBe(false);
        expect(readHomeShortcuts()).toEqual(['settings']);
    });
});

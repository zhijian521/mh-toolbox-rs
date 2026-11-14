import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLocalList, readLocalData, writeLocalData, writePreference } from './local-data';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('本地数据读取边界', () => {
    it('只有未保存过才返回空值，合法空数组仍是有效数据', () => {
        const getItem = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce('[]');
        vi.stubGlobal('localStorage', { getItem });
        const parse = (raw: unknown) => parseLocalList(raw, (rows) => rows as unknown[]);
        expect(readLocalData('test', parse)).toEqual({ ok: true, value: null });
        expect(readLocalData('test', parse)).toEqual({ ok: true, value: [] });
    });

    it.each(['', '{broken', '{}', '[null]'])('损坏数据不回落成空列表：%s', (raw) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('localStorage', { getItem: () => raw });
        const result = readLocalData('test', (value) =>
            parseLocalList(value, (rows) => (rows as unknown[]).filter(Boolean)),
        );
        expect(result.ok).toBe(false);
    });

    it('访问被拒绝与写入不可用均明确失败', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('quota');
            },
        });
        expect(readLocalData('test', String).ok).toBe(false);
        expect(() => writeLocalData('test', [])).toThrow('quota');
        vi.stubGlobal('localStorage', undefined);
        expect(() => writeLocalData('test', [])).toThrow('本地存储不可用');
    });
});

describe('偏好字符串写入', () => {
    it('沿用原始字符串，不改变已有偏好格式', () => {
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', { setItem });
        expect(writePreference('mh-theme', 'dark')).toBe(true);
        expect(setItem).toHaveBeenCalledWith('mh-theme', 'dark');
    });
    it('存储缺失或配额不足返回失败，不向 UI 抛异常', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('localStorage', undefined);
        expect(writePreference('test', '1')).toBe(false);
        vi.stubGlobal('localStorage', {
            setItem: () => {
                throw new Error('quota');
            },
        });
        expect(writePreference('test', '1')).toBe(false);
    });
});

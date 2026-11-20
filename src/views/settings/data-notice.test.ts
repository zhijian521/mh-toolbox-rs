import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadWithDataNotice, takeDataNotice } from './data-notice';

afterEach(() => vi.unstubAllGlobals());

describe('整本替换后的回执交接', () => {
    it('备份位置与警示只读取一次，重载前切到可展示回执的页面', () => {
        const saved = new Map<string, string>();
        vi.stubGlobal('sessionStorage', {
            getItem: (key: string) => saved.get(key) ?? null,
            setItem: (key: string, value: string) => saved.set(key, value),
            removeItem: (key: string) => saved.delete(key),
        });
        const location = { hash: '#/dev', reload: vi.fn() };
        vi.stubGlobal('location', location);
        reloadWithDataNotice('备份在 D:/backup.json', '保留警示', '#/settings');
        expect(location.hash).toBe('#/settings');
        expect(location.reload).toHaveBeenCalledOnce();
        expect(takeDataNotice()).toEqual({ text: '备份在 D:/backup.json', warning: '保留警示' });
        expect(takeDataNotice()).toEqual({ text: '', warning: '' });
    });

    it('回执存储不可用也必须重载，不能继续使用替换前的内存', () => {
        vi.stubGlobal('sessionStorage', {
            setItem: () => { throw new Error('不可写'); },
            getItem: () => { throw new Error('不可读'); },
        });
        const reload = vi.fn();
        vi.stubGlobal('location', { reload });
        reloadWithDataNotice('已替换');
        expect(reload).toHaveBeenCalledOnce();
        expect(takeDataNotice()).toEqual({ text: '', warning: '' });
    });
});

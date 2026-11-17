import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverCharacterAssetsLocal, writeCharacterAssetsLocal } from './character-assets-local';

afterEach(() => vi.unstubAllGlobals());

describe('浏览器角色物品联动恢复', () => {
    it('仓库写入中断保留日志，重试完整恢复且不重复', () => {
        const values = new Map<string, string>();
        let fail = true;
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                if (fail && key === 'mh-warehouse') throw new Error('空间不足');
                values.set(key, value);
            },
            removeItem: (key: string) => values.delete(key),
        });
        const roster = [{ id: 'hero' }];
        const warehouse = [{ id: 'asset' }];
        expect(() => writeCharacterAssetsLocal(roster, warehouse)).toThrow();
        expect(values.has('mh-character-assets')).toBe(true);
        fail = false;
        recoverCharacterAssetsLocal();
        recoverCharacterAssetsLocal();
        expect(JSON.parse(values.get('mh-roster')!)).toEqual(roster);
        expect(JSON.parse(values.get('mh-warehouse')!)).toEqual(warehouse);
        expect(values.has('mh-character-assets')).toBe(false);
    });
});

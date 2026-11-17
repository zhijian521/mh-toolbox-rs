import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverAssetTradeLocal, writeAssetTradeLocal } from './asset-trade-local';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('浏览器关联交易恢复', () => {
    it('中断保留日志，下一次读取恢复完整账目与库存', () => {
        const data = new Map<string, string>();
        let fail = true;
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => {
                if (key === 'mh-warehouse' && fail) throw new Error('quota');
                data.set(key, value);
            },
            removeItem: (key: string) => data.delete(key),
        });
        expect(() => writeAssetTradeLocal([{ id: 'account' }], [{ id: 'pet' }])).toThrow();
        expect(data.has('mh-asset-trade')).toBe(true);
        fail = false;
        recoverAssetTradeLocal();
        expect(JSON.parse(data.get('mh-accounts')!)).toEqual([{ id: 'account' }]);
        expect(JSON.parse(data.get('mh-warehouse')!)).toEqual([{ id: 'pet' }]);
        expect(data.has('mh-asset-trade')).toBe(false);
    });
});

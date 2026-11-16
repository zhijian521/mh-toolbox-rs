import { describe, expect, it } from 'vitest';
import { usePriceViewState } from './price-view-state';

describe('物价浏览状态', () => {
    it('重新进入时保留四项筛选和滚动位置，清空可回到默认', () => {
        const first = usePriceViewState();
        first.keyword.value = '宝石';
        first.category.value = '材料';
        first.sub.value = '宝石';
        first.sort.value = 'price-desc';
        first.scroll.value.top = 280;
        const next = usePriceViewState();
        expect([
            next.keyword.value,
            next.category.value,
            next.sub.value,
            next.sort.value,
            next.scroll.value.top,
        ]).toEqual(['宝石', '材料', '宝石', 'price-desc', 280]);
        next.keyword.value = next.category.value = next.sub.value = '';
        next.sort.value = 'updated';
        next.scroll.value.top = 0;
        expect(first.keyword.value).toBe('');
        expect(first.scroll.value.top).toBe(0);
    });
});

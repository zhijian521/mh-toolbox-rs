import { describe, expect, it } from 'vitest';
import { pickerPlacement } from './picker-placement';

describe('召唤兽选择浮层的可见范围', () => {
    const bounds = { left: 100, right: 560, top: 100, bottom: 500 };

    it('上下都放不下时选择较宽裕的一侧并限制高度', () => {
        const anchor = { left: 460, right: 512, top: 320, bottom: 370 };
        const result = pickerPlacement(anchor, bounds, 344);
        expect(result.up).toBe(true);
        expect(result.maxHeight).toBe(206);
        expect(anchor.top - 6 - result.maxHeight).toBe(bounds.top + 8);
        expect(anchor.left + result.left + result.width).toBeLessThanOrEqual(bounds.right - 8);
    });

    it('默认向下，窄容器内收窄且不越过左右裁剪线', () => {
        const clipped = { left: 200, right: 480, top: 100, bottom: 600 };
        const anchor = { left: 190, right: 242, top: 110, bottom: 174 };
        const result = pickerPlacement(anchor, clipped, 344);
        expect(result.up).toBe(false);
        expect(result.width).toBe(264);
        expect(anchor.left + result.left).toBe(clipped.left + 8);
        expect(anchor.left + result.left + result.width).toBe(clipped.right - 8);
    });

    it('搜索结果较少时保持下方；没有可用空间时不产生负尺寸', () => {
        const anchor = { left: 110, right: 162, top: 320, bottom: 370 };
        expect(pickerPlacement(anchor, bounds, 80).up).toBe(false);
        const result = pickerPlacement(anchor, { ...bounds, right: 108, bottom: 105 }, 344);
        expect(result.width).toBe(0);
        expect(result.maxHeight).toBeGreaterThanOrEqual(0);
    });
});

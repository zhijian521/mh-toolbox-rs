import { describe, expect, it } from 'vitest';
import { columnGeometry } from './chart-columns';

describe('柱图布局', () => {
    it('正负柱从同一零线向两侧延伸，零值没有假高度', () => {
        const positive = columnGeometry(100, 20, 60, 80);
        const negative = columnGeometry(100, 100, 60, 80);
        expect(positive.y + positive.height).toBe(60);
        expect(negative.y).toBe(60);
        expect(positive.height).toBe(negative.height);
        expect(positive.negative).toBe(false);
        expect(negative.negative).toBe(true);
        expect(columnGeometry(100, 60, 60, 80).height).toBe(0);
    });

    it('同日多个角色并排且互不覆盖，侧面也留在日期槽内', () => {
        const columns = Array.from({ length: 8 }, (_, index) =>
            columnGeometry(100, 20, 60, 120, 8, index),
        );
        expect(columns[0].x).toBeGreaterThanOrEqual(40);
        expect(columns[7].x + columns[7].width + columns[7].depth).toBeLessThanOrEqual(160);
        for (let index = 1; index < columns.length; index++)
            expect(columns[index].x).toBeGreaterThan(
                columns[index - 1].x + columns[index - 1].width + columns[index - 1].depth,
            );
    });

    it('真实小额保留比例，不为立体效果增大数值高度', () => {
        const small = columnGeometry(50, 99.9, 100, 40);
        const large = columnGeometry(50, 90, 100, 40);
        expect(large.height / small.height).toBeCloseTo(100);
        expect(columnGeometry(50, 100, 100, 0).width).toBe(0);
    });
});

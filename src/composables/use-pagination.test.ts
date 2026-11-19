import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import { pagerItems, usePagination } from './use-pagination';

describe('分页页码', () => {
    it('少量页码全部展示，单页与空结果不生成省略号', () => {
        expect(pagerItems(1, 0)).toEqual([]);
        expect(pagerItems(1, 1)).toEqual([{ page: 1 }]);
        expect(pagerItems(4, 7)).toEqual(
            Array.from({ length: 7 }, (_, index) => ({ page: index + 1 })),
        );
    });

    it('首尾保留连续页码，中段保留当前页，两侧省略号跳五页', () => {
        expect(pagerItems(1, 20)).toEqual([
            { page: 1 },
            { page: 2 },
            { page: 3 },
            { page: 4 },
            { page: 5 },
            { page: 6, gap: 'next' },
            { page: 20 },
        ]);
        expect(pagerItems(10, 20)).toEqual([
            { page: 1 },
            { page: 5, gap: 'previous' },
            { page: 9 },
            { page: 10 },
            { page: 11 },
            { page: 15, gap: 'next' },
            { page: 20 },
        ]);
        expect(pagerItems(20, 20)).toEqual([
            { page: 1 },
            { page: 15, gap: 'previous' },
            { page: 16 },
            { page: 17 },
            { page: 18 },
            { page: 19 },
            { page: 20 },
        ]);
    });

    it('大页数仍最多七档，当前页不会被省略，跳转目标不会越界', () => {
        for (const pages of [8, 9, 20, 100000]) {
            for (const page of [1, 4, 5, 6, pages - 4, pages - 3, pages]) {
                const items = pagerItems(page, pages);
                const numbers = items.filter((item) => !item.gap).map((item) => item.page);
                expect(items).toHaveLength(7);
                expect(numbers[0]).toBe(1);
                expect(numbers.at(-1)).toBe(pages);
                expect(numbers).toContain(page);
                expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
                expect(items.every((item) => item.page >= 1 && item.page <= pages)).toBe(true);
            }
        }
    });
});

describe('记录分页', () => {
    it('重开记录保留外部页码；恢复时将已失效的末页夹到有效范围', () => {
        const scope = effectScope();
        try {
            const rows = ref(Array.from({ length: 41 }, (_, index) => index));
            const selected = ref(2);
            const first = scope.run(() => usePagination(rows, 20, selected))!;
            expect(first.page).toBe(selected);
            expect(first.visible.value[0]).toBe(20);
            selected.value = 9;
            const reopened = scope.run(() => usePagination(rows, 20, selected))!;
            expect(reopened.page.value).toBe(3);
            expect(reopened.visible.value).toEqual([40]);
        } finally {
            scope.stop();
        }
    });

    it('分页不改原始列表；删空末页后退到有效页', () => {
        const scope = effectScope();
        try {
            const rows = ref(Array.from({ length: 41 }, (_, index) => index));
            const { page, pages, visible } = scope.run(() => usePagination(rows))!;
            expect(pages.value).toBe(3);
            page.value = 3;
            expect(visible.value).toEqual([40]);
            expect(rows.value).toHaveLength(41);
            rows.value = rows.value.slice(0, 40);
            expect(page.value).toBe(2);
            expect(visible.value).toHaveLength(20);
            rows.value = [];
            expect(page.value).toBe(1);
            expect(pages.value).toBe(1);
            expect(visible.value).toEqual([]);
        } finally {
            scope.stop();
        }
    });
});

import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import { usePagination } from './use-pagination';

describe('记录分页', () => {
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

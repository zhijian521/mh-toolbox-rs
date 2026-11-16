import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import { usePagination } from './use-pagination';

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

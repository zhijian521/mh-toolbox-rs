import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useRecordFilters } from './use-record-filters';

describe('历史筛选衔接', () => {
    it('继承当前范围；上下文相同时保留历史筛选、页码和滚动位置', () => {
        const context = ref({ from: '2026-11-01', to: '2026-11-16', who: '角色甲' });
        const { filters, syncScope } = useRecordFilters(() => context.value, {
            keyword: '',
            page: 1,
            scrollTop: 0,
        });
        expect(filters.value).toMatchObject(context.value);
        Object.assign(filters.value, { who: '角色乙', keyword: '买入', page: 3, scrollTop: 200 });
        syncScope();
        expect(filters.value).toMatchObject({
            who: '角色乙',
            keyword: '买入',
            page: 3,
            scrollTop: 200,
        });
        context.value = { ...context.value, who: '角色丙' };
        syncScope();
        expect(filters.value).toEqual({ ...context.value, keyword: '', page: 1, scrollTop: 0 });
    });

    it('换日期范围重置细分筛选，保留不限日期和未指定角色的语义', () => {
        const context = ref({ from: '', to: '', who: '' });
        const { filters, syncScope } = useRecordFilters(() => context.value, {
            page: 1,
            scrollTop: 0,
        });
        filters.value.page = 2;
        context.value = { ...context.value, from: '2026-11-16', to: '2026-11-16' };
        syncScope();
        expect(filters.value).toEqual({ ...context.value, page: 1, scrollTop: 0 });
        expect(filters.value.who).toBe('');
    });
});

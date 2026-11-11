import { describe, expect, it } from 'vitest';
import { withCurrentOption } from './select-options';

describe('下拉选项保留当前值', () => {
    const options = [{ value: '大唐官府', label: '大唐官府' }];

    it('标准值沿用原选项，旧值补到最前，空值不生成选项', () => {
        expect(withCurrentOption(options, '大唐官府')).toBe(options);
        expect(withCurrentOption(options, '旧门派')).toEqual([
            { value: '旧门派', label: '旧门派' },
            ...options,
        ]);
        expect(withCurrentOption(options, '')).toBe(options);
    });
});

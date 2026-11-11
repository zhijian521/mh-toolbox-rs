import { describe, expect, it } from 'vitest';
import { useQuickable } from './quick-row';

/**
 * 卡上这一行能不能点。
 *
 * 这条判断原先在四个文件里逐字各写一遍（属性 / 辅助 / 修炼 / 师门行），
 * 而写反了**不会报错**：那一行照旧渲染，只是点了不开窗，或者编辑态里
 * 点输入框弹出另一个输入框。所以把三种组合钉在这里。
 */
describe('useQuickable', () => {
    it('卡上只读时可点', () => {
        expect(useQuickable({ quick: true, editable: false }).value).toBe(true);
    });

    it('编辑态里不可点：那一格已经是输入框', () => {
        expect(useQuickable({ quick: true, editable: true }).value).toBe(false);
    });

    it('预览卡与编辑页（不传 quick）都不可点', () => {
        expect(useQuickable({}).value).toBe(false);
        expect(useQuickable({ editable: false }).value).toBe(false);
    });
});

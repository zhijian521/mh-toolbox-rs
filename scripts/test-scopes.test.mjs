import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { collectTests, selectTests, TEST_SCOPES } from './test-scopes.mjs';

describe('业务测试分区', () => {
    const files = collectTests(fileURLToPath(new URL('../', import.meta.url)));

    it('工具分区包含养成公式与角色预算，避免只测页面逻辑', () => {
        const selected = selectTests(['tools'], files);
        expect(selected).toContain('src/services/level-costs.test.ts');
        expect(selected).toContain('src/services/fengyao.test.ts');
        expect(selected).toContain('src/views/tools/growth-plan.test.ts');
    });

    it('仓库测试均有归属，分区均能选择到文件', () => {
        expect(selectTests(Object.keys(TEST_SCOPES), files)).toEqual(files);
        for (const scope of Object.keys(TEST_SCOPES)) {
            expect(selectTests([scope], files).length).toBeGreaterThan(0);
        }
    });

    it('收益包含账号自动分账和首页读数，合并选择不会重复', () => {
        const income = selectTests(['income'], files);
        expect(income).toContain('src/views/accounts/daily-sync.test.ts');
        expect(income).toContain('src/views/overview/overview.test.ts');
        const combined = selectTests(['income', 'accounts', 'income'], files);
        expect(new Set(combined).size).toBe(combined.length);
    });

    it('收益与物价互相包含固定单价联动断言', () => {
        expect(selectTests(['income'], files)).toContain('src/views/prices/prices-store.test.ts');
        expect(selectTests(['prices'], files)).toContain('src/views/income/income-store.test.ts');
    });

    it('业务分区包含共享加载和只读契约，首页展示不捎带写入契约', () => {
        for (const scope of ['characters', 'income', 'accounts', 'prices', 'goals']) {
            const selected = selectTests([scope], files);
            expect(selected).toContain('src/services/load-data.test.ts');
            expect(selected).toContain('src/services/store-readonly.test.ts');
        }
        expect(selectTests(['overview'], files)).not.toContain(
            'src/services/store-readonly.test.ts',
        );
    });

    it('OCR 不捎带无关页面，未知或空范围明确失败', () => {
        expect(selectTests(['ocr'], files)).not.toContain('src/views/accounts/accounts.test.ts');
        expect(() => selectTests([], files)).toThrow('请指定');
        expect(() => selectTests(['typo'], files)).toThrow('未知');
        expect(() => selectTests(['ocr'], [])).toThrow('没有匹配');
    });

    it('角色和账号均包含仓库归属及联动恢复', () => {
        for (const scope of ['characters', 'accounts']) {
            const selected = selectTests([scope], files);
            expect(selected).toContain('src/views/warehouse/character-assets.test.ts');
            expect(selected).toContain('src/services/character-assets-local.test.ts');
        }
    });
});

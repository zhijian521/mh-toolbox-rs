import { describe, expect, it } from 'vitest';
import { recommendTests, statusPaths } from './test-impact.mjs';
import { TEST_SCOPES } from './test-scopes.mjs';

describe('根据改动推荐测试范围', () => {
    it('公共加载覆盖六个数据层及数据烟测，不只推荐服务层', () => {
        const result = recommendTests(['src/services/load-data.ts']);
        expect(result.scopes).toEqual([
            'characters',
            'income',
            'accounts',
            'prices',
            'goals',
            'core',
        ]);
        expect(result.smoke).toContain('数据');
    });

    it('收益口径带上账号及首页联动，合并路径不重复', () => {
        const result = recommendTests(['src/views/income/online.ts', 'src/views/income/online.ts']);
        expect(result.scopes).toEqual(['income', 'accounts', 'overview']);
        expect(result.smoke).toEqual(['收益']);
        expect(result.files).toHaveLength(1);
    });

    it('公共金额、名册与 OCR 提示各自联动，父烟测覆盖子项', () => {
        const result = recommendTests([
            'src/services/format.ts',
            'src/views/characters/ocr/attr-panel.ts',
            'src/views/characters/quick-row.ts',
        ]);
        expect(result.scopes).toEqual(
            expect.arrayContaining([
                'characters',
                'ocr',
                'income',
                'accounts',
                'overview',
                'ui',
                'core',
            ]),
        );
        expect(result.smoke).toContain('角色');
        expect(result.smoke).not.toContain('角色/截图');
        expect(result.unknown).toEqual([]);
        expect(result.scopes.every((scope) => Object.hasOwn(TEST_SCOPES, scope))).toBe(true);
    });

    it('仅改识别逻辑时推荐角色截图相关场景', () => {
        const result = recommendTests(['src/views/characters/ocr/attr-panel.ts']);
        expect(result.smoke).toEqual(['角色/截图', '角色/装备', '角色/召唤兽']);
        expect(result.scopes).toEqual(['characters', 'ocr']);
    });

    it('删除、含空格中文路径与重命名的两端均保留', () => {
        expect(
            statusPaths(
                ' M src/属性 文件.ts\0R  src/views/overview/new.ts\0src/views/income/old.ts\0 D src/旧.ts\0?? src/新.ts\0',
            ),
        ).toEqual([
            'src/属性 文件.ts',
            'src/views/overview/new.ts',
            'src/views/income/old.ts',
            'src/旧.ts',
            'src/新.ts',
        ]);
    });

    it('Windows 路径归一，文档与干净工作区不回退全量', () => {
        expect(recommendTests(['src\\views\\overview\\OverviewView.vue']).scopes).toEqual([
            'overview',
        ]);
        for (const paths of [[], ['docs/TESTING.md', 'README.md']]) {
            expect(recommendTests(paths)).toMatchObject({
                scopes: [],
                smoke: [],
                rust: [],
                unknown: [],
            });
        }
    });

    it('未知和配置路径显式提示，不能静默忽略风险', () => {
        const result = recommendTests(['src/new-feature/a.ts', 'package.json']);
        expect(result.unknown).toEqual(['src/new-feature/a.ts']);
        expect(result.notes.join('')).toContain('配置');
        expect(result.scopes).toEqual([]);
    });

    it('Rust 模块建议定向范围，入口与依赖变更扩大后端范围', () => {
        expect(
            recommendTests(['src-tauri/src/store/tests.rs', 'src-tauri/src/backup/tests.rs']).rust,
        ).toEqual(['backup::', 'store::']);
        const result = recommendTests([
            'src-tauri/src/store.rs',
            'src-tauri/src/lib.rs',
            'src-tauri/Cargo.toml',
        ]);
        expect(result.rust).toEqual(['']);
        expect(result.scopes).toContain('release');
        expect(result.notes.length).toBeGreaterThan(0);
    });

    it('共享时钟包含业务联动，拆分后的收益场景仍建议收益烟测', () => {
        const clock = recommendTests(['src/composables/shared-clock.ts']);
        expect(clock.scopes).toEqual(['income', 'accounts', 'goals', 'overview', 'tools', 'ui']);
        for (const file of ['use-today.ts', 'use-minute-now.ts']) {
            expect(recommendTests(['src/composables/' + file]).scopes).toContain('tools');
        }
        for (const file of ['04-income.mjs', 'income/quick.mjs', 'income/shared.mjs']) {
            const result = recommendTests(['tools/e2e/sections/' + file]);
            expect(result.scopes).toEqual(['tooling']);
            expect(result.smoke).toEqual(['收益']);
            expect(result.unknown).toEqual([]);
        }
    });
});

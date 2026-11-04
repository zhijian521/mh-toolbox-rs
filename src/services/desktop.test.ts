import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `services/desktop.ts` 的**返回值口径**：取消、错误原文。
 *
 * 这个文件是页面与 Rust 之间唯一的一层，它把几种完全不同的结局压成几种形状：
 * 成功 / 用户取消 / 出错。压错一次的后果都写在注释里，但**没有一条测试**：
 *
 * - `data_*` 的「取消」压成「失败」→ 用户点开另存为又关掉，界面上留一条红字指责他；
 * - `Err(String)` 被裹成 `Error: …` → 那句话是要原样给用户看的（「第 3 条角色没有 id」），
 *   多一个前缀就成了另一句话。
 *
 * 早先这里还有一条「`*LegacyImported` 三态压成布尔」的用例，随老版本兼容一起删了
 * （2026-11-04）。
 *
 * 这层是 mock 出来的 `invoke`，验的是**映射**而不是 IPC 本身——后者由
 * `ipc-contract.test.ts`（名字对不对）与 `tools/e2e`（真窗口跑不跑得通）覆盖。
 */

/** 假的 `invoke`：每条用例自己决定它 resolve 什么、reject 什么。 */
const invokeMock = vi.fn();

/** 模块在求值时就把 `hasTauri` 定下来了，所以宿主必须**先**装好再 import。 */
async function load() {
    vi.resetModules();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    vi.doMock('@tauri-apps/api/window', () => ({
        getCurrentWindow: () => ({
            isMaximized: async () => false,
            onResized: async () => () => {},
        }),
    }));
    return import('./desktop');
}

beforeEach(() => {
    invokeMock.mockReset();
    /* 失败路径会打 `console.error`（那是给真机排查用的，不该被吞掉）。测试里静音：
     * 断言已经写明「哪一条失败、返回什么」，再刷一屏红字只会埋掉真正的红。 */
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@tauri-apps/api/core');
    vi.doUnmock('@tauri-apps/api/window');
});

describe('账本备份：三种结局不能互相冒充', () => {
    it('导出成功：回执里带落盘路径', async () => {
        const { dataExport } = await load();
        invokeMock.mockResolvedValue('C:/Users/me/账本.json');

        const outcome = await dataExport();

        expect(invokeMock).toHaveBeenCalledWith('data_export');
        expect(outcome).toEqual({ status: 'ok', detail: '已导出到 C:/Users/me/账本.json' });
    });

    it('导出时用户取消：是 canceled，不是 failed', async () => {
        const { dataExport } = await load();
        invokeMock.mockResolvedValue(null);

        expect(await dataExport()).toEqual({ status: 'canceled' });
    });

    it('导入成功：回执带条数与备份路径，截断数原样透传', async () => {
        const { dataImport } = await load();
        invokeMock.mockResolvedValue({
            characters: 4,
            prices: 6,
            entries: 1,
            truncated: 12,
            truncatedItems: 2,
            backupPath: 'D:/备份/账本-before-import-1.json',
        });

        const outcome = await dataImport();

        expect(outcome.status).toBe('ok');
        expect(outcome).toMatchObject({
            detail: '已导入 4 个角色、6 件物价。替换前的数据备份在 D:/备份/账本-before-import-1.json',
            truncation: { points: 12, items: 2 },
        });
    });

    it('导入时用户取消：canceled', async () => {
        const { dataImport } = await load();
        invokeMock.mockResolvedValue(null);

        expect(await dataImport()).toEqual({ status: 'canceled' });
    });

    it('Rust 的 Err(String) 原样进界面，不加 `Error: ` 前缀', async () => {
        const { dataImport } = await load();
        /* Tauri 把 `Err(String)` 作为**字符串**抛到 JS，不是 Error 实例。 */
        invokeMock.mockRejectedValue('第 3 条角色没有 id');

        expect(await dataImport()).toEqual({ status: 'failed', error: '第 3 条角色没有 id' });
    });

    it('清除：报出清掉的条数，用户才分得清「清了一份账」和「本来就是空的」', async () => {
        const { dataClear } = await load();
        invokeMock.mockResolvedValue({ characters: 2, prices: 0, entries: 3 });

        expect(await dataClear()).toEqual({ status: 'ok', detail: '已清空 2 个角色、0 件物价' });
    });
});

describe('读写失败不炸页面，但也不能假装成功', () => {
    it('写物价失败返回 false（不是抛错，也不是 true）', async () => {
        const { pricesSave } = await load();
        invokeMock.mockRejectedValue('database is locked');

        expect(await pricesSave([{ id: 'a' }])).toBe(false);
    });

    it('读物价失败返回 null（调用方据此立 loadError 并停写）', async () => {
        const { pricesLoad } = await load();
        invokeMock.mockRejectedValue('no such table');

        expect(await pricesLoad()).toBeNull();
    });

    it('没有 Tauri 宿主时一律降级，不抛错（探针与浏览器预览走这条）', async () => {
        vi.resetModules();
        vi.stubGlobal('window', {});
        vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
        vi.doMock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({}) }));
        const desktop = await import('./desktop');

        expect(desktop.hasDesktop()).toBe(false);
        expect(await desktop.pricesLoad()).toBeNull();
        expect(await desktop.pricesSave([])).toBe(false);
        expect((await desktop.dataClear()).status).toBe('failed');
        /* 浏览器里一次 invoke 都不该发生。 */
        expect(invokeMock).not.toHaveBeenCalled();
    });
});

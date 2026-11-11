import { describe, expect, it, vi } from 'vitest';
import type { AutoInput } from './accounts-store';

/**
 * `accounts-store` 的 **`applyAutoEntries`（按天同步写账号的那一批）**。
 *
 * 与 `accounts-store.test.ts` 分开：那个文件只测「读失败闸门」，这里测的是另一件事——
 * 自动同步是**整批替换**，它必须做到三件互相牵制的事：
 *
 *   1. 只动 `source === 'auto'` 的，手记一条不碰；
 *   2. 输入没了（速记撤回、时长归零）那一条就得消失，而不是留一笔早已不存在的收益；
 *   3. 内容没变就不落盘——它挂在「速记一变就同步」上，连点十下不该写十次库。
 *
 * 三件事任何一件漏掉都不会报错，只会在账面上悄悄多一笔或少一笔，所以必须有用例钉住。
 */

function host(load: () => Promise<unknown>) {
    return {
        hasDesktop: () => true,
        accountLoad: vi.fn(load),
        accountSave: vi.fn(async () => true),
    };
}

async function loadStore(desktop: ReturnType<typeof host>) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    const store = await import('./accounts-store');
    await store.loadAccounts();
    return store;
}

/** 排队的写入落在微任务里，让出一个宏任务再断言。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 一条手记（用户自己填的）。 */
const MANUAL = {
    date: '2026-11-11',
    characterId: '',
    kind: 'expense' as const,
    currency: 'rmb' as const,
    category: '点卡充值',
    channel: '官方充值' as const,
    amount: 30,
};

/** 一条算出来的收益（与 `daily-sync.ts` 拼出来的是同一形）。 */
function autoRow(patch: Partial<AutoInput> = {}): AutoInput {
    return {
        id: 'auto-2026-11-11-none-income',
        date: '2026-11-11',
        characterId: '',
        category: '游戏收益',
        kind: 'income',
        amount: 46000,
        note: '收益页自动同步',
        ...patch,
    };
}

describe('applyAutoEntries：整批替换自动记录', () => {
    it('写进去的那条带 auto 与「游戏内 · 梦幻币」，手记原样留着', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { applyAutoEntries, entries } = store.useAccounts();

        expect(applyAutoEntries([autoRow()]).ok).toBe(true);
        await flush();

        const auto = entries.value.find((one) => one.source === 'auto');
        expect(auto?.category).toBe('游戏收益');
        expect(auto?.currency).toBe('cash');
        expect(auto?.channel).toBe('游戏内');
        expect(auto?.amount).toBe(46000);
        expect(desktop.accountSave).toHaveBeenCalledTimes(1);
    });

    it('内容一字没变时 changed 为 false，且不再写库', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { applyAutoEntries } = store.useAccounts();

        applyAutoEntries([autoRow()]);
        await flush();
        const writes = desktop.accountSave.mock.calls.length;

        const again = applyAutoEntries([autoRow()]);
        await flush();
        expect(again).toEqual({ ok: true, changed: false });
        expect(desktop.accountSave.mock.calls.length).toBe(writes);
    });

    it('这一天没收益了：那条自动记录消失，手记不动', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { addEntry, applyAutoEntries, entries } = store.useAccounts();

        addEntry(MANUAL);
        applyAutoEntries([autoRow()]);
        await flush();
        expect(entries.value).toHaveLength(2);

        /* 空数组 = 这一天什么都不该有。逐条 upsert 的实现到这里会留下那条收益，
         * 于是用户撤回速记之后，账号里还挂着一笔已经不存在的一天的收入。 */
        applyAutoEntries([]);
        await flush();
        expect(entries.value).toHaveLength(1);
        expect(entries.value[0].category).toBe('点卡充值');
        expect(entries.value[0].source).toBe('');
    });

    it('金额 ≤ 0 的条目被丢掉，不留一条 0 元的收入', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { applyAutoEntries, entries } = store.useAccounts();

        applyAutoEntries([autoRow({ amount: 0 }), autoRow({ id: 'auto-x', amount: -5 })]);
        await flush();
        expect(entries.value).toEqual([]);
    });

    it('第二次同步认领旧的 createdAt：列表里那两行不会一直往下跑', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { applyAutoEntries, entries } = store.useAccounts();

        applyAutoEntries([autoRow()]);
        await flush();
        const before = entries.value[0].createdAt;

        /* 等一拍再改内容：不认领 createdAt 的话，这一拍之后的同步会把时间戳刷新，
         * 「新的在上」的列表里那一行会莫名其妙往下掉。 */
        await new Promise((resolve) => setTimeout(resolve, 5));
        applyAutoEntries([autoRow({ amount: 50000 })]);
        await flush();

        expect(entries.value).toHaveLength(1);
        expect(entries.value[0].amount).toBe(50000);
        expect(entries.value[0].createdAt).toBe(before);
    });

    it('读失败时拒绝写，不把空表当成「这一天没有收益」', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { applyAutoEntries, entries } = store.useAccounts();

        const result = applyAutoEntries([autoRow()]);
        expect(result.ok).toBe(false);
        expect(entries.value).toEqual([]);
        await flush();
        expect(desktop.accountSave).not.toHaveBeenCalled();
    });
});

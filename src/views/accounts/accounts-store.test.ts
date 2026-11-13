import { describe, expect, it, vi } from 'vitest';

/**
 * `accounts-store.ts` 的**读失败闸门**。
 *
 * 与物价、名册、收益账同一套（各自一份，理由在 `persist.ts` 头部）：读失败时内存里是
 * 空账，任何一次写入都会把它整份顶掉。账号页尤其隐蔽——它有两本账（点卡 / 梦幻币），
 * 覆盖之后只有一本是空的，看起来像「另一本记错了」。
 *
 * 账号页是第 112 批才有的功能，没有更早的存档要搬，所以这里只测两件事：
 * 读失败**一个字节都不写**、下一轮读成功**闸要能放开**。
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

const ENTRY = {
    date: '2026-11-05',
    characterId: '',
    kind: 'expense' as const,
    currency: 'rmb' as const,
    category: '点卡',
    channel: '官方充值' as const,
    amount: 30,
};

describe('loadAccounts：读失败不等于空账', () => {
    it('accountLoad 返回 null：立错误位、账清空、一次都不写', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { entries, loadError } = store.useAccounts();

        expect(entries.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.accountSave).not.toHaveBeenCalled();
    });

    it('读失败时记一笔被拒，账里也不留半条', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { addEntry, entries } = store.useAccounts();

        expect(addEntry(ENTRY).ok).toBe(false);
        expect(entries.value).toEqual([]);
        await flush();
        expect(desktop.accountSave).not.toHaveBeenCalled();
    });

    it('下一轮读到数据时闸要放开——写入恢复', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { addEntry, loadError } = store.useAccounts();

        expect(loadError.value).toBe('');
        expect(addEntry(ENTRY).ok).toBe(true);
        await flush();
        expect(desktop.accountSave).toHaveBeenCalledTimes(1);
    });
});

describe('账号写入边界', () => {
    it('旧梦幻币记录只改备注保留原值，主动改金额才按两位万归一', async () => {
        const old = {
            ...ENTRY,
            id: 'manual',
            currency: 'cash' as const,
            amount: 12345,
            note: '',
            source: '',
            createdAt: 1,
        };
        const store = await loadStore(host(async () => [old]));
        const retained = store.updateEntry(old.id, {
            ...ENTRY,
            currency: 'cash',
            amount: 1.23,
            preserveAmount: true,
            note: '补备注',
        });
        expect(retained.ok && retained.entry.amount).toBe(12345);
        expect(retained.ok && retained.entry.note).toBe('补备注');
        const edited = store.updateEntry(old.id, { ...ENTRY, currency: 'cash', amount: 1.236 });
        expect(edited.ok && edited.entry.amount).toBe(12400);
        await store.useAccounts().flush();
    });

    it('极小旧账也可仅改备注，新建及换币种不能借保留标记绕过精度', async () => {
        const old = {
            ...ENTRY,
            id: 'small',
            currency: 'cash' as const,
            amount: 1,
            note: '',
            source: '',
            createdAt: 1,
        };
        const store = await loadStore(host(async () => [old]));
        const retained = store.updateEntry(old.id, {
            ...ENTRY,
            currency: 'cash',
            amount: 0,
            preserveAmount: true,
        });
        expect(retained.ok && retained.entry.amount).toBe(1);
        const changed = store.updateEntry(old.id, {
            ...ENTRY,
            amount: 2.346,
            preserveAmount: true,
        });
        expect(changed.ok && changed.entry.amount).toBe(2.35);
        const added = store.addEntry({
            ...ENTRY,
            currency: 'cash',
            amount: 1.236,
            preserveAmount: true,
        });
        expect(added.ok && added.entry.amount).toBe(12400);
        await store.useAccounts().flush();
    });
    it('梦幻币按万保留两位小数，舍入后为零的金额不落库', async () => {
        const store = await loadStore(host(async () => []));
        const result = store.addEntry({ ...ENTRY, currency: 'cash', amount: 4.606 });
        expect(result.ok && result.entry.amount).toBe(46100);
        expect(store.addEntry({ ...ENTRY, currency: 'cash', amount: 0.004 }).ok).toBe(false);
        await store.useAccounts().flush();
        expect(store.useAccounts().entries.value).toHaveLength(1);
    });

    it('自动记录只能由同步更新，手动修改和删除不产生写入', async () => {
        const automatic = {
            ...ENTRY,
            id: 'auto-one',
            currency: 'cash',
            source: 'auto',
            createdAt: 1,
            note: '',
        };
        const desktop = host(async () => [automatic]);
        const store = await loadStore(desktop);
        expect(store.updateEntry('auto-one', ENTRY).ok).toBe(false);
        store.removeEntry('auto-one');
        await store.useAccounts().flush();
        expect(store.useAccounts().entries.value).toEqual([automatic]);
        expect(desktop.accountSave).not.toHaveBeenCalled();
    });
});

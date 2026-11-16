import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

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

async function loadStore(desktop: ReturnType<typeof host>, gameRules = false) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    if (gameRules) await import('../../services/game-data.fixture');
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
    it.each(['{broken', '{}', '[null]'])('浏览器损坏存档不被新记录覆盖：%s', async (raw) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', { getItem: () => raw, setItem });
        const desktop = { ...host(async () => []), hasDesktop: () => false };
        const store = await loadStore(desktop);
        expect(store.useAccounts().loadError.value).not.toBe('');
        expect(store.addEntry(ENTRY).ok).toBe(false);
        expect(await store.useAccounts().retry()).toBe(false);
        expect(setItem).not.toHaveBeenCalled();
        expect(desktop.accountSave).not.toHaveBeenCalled();
    });

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
    const sale = {
        ...ENTRY,
        kind: 'income' as const,
        category: '游戏币卖出',
        channel: '藏宝阁',
        amount: 100.3,
    };

    it('藏宝阁卖币默认扣费，修改、重试落盘不重复扣费，主动填总价可重算', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop, true);
        const added = store.addEntry(sale);
        expect(added.ok && added.entry.amount).toBe(95.28);
        if (!added.ok) throw new Error(added.error);
        const edited = store.updateEntry(added.entry.id, {
            ...sale,
            amount: added.entry.amount,
            preserveAmount: true,
            note: '补充备注',
        });
        expect(edited.ok && edited.entry.amount).toBe(95.28);
        const recalculated = store.updateEntry(added.entry.id, {
            ...sale,
            amount: 200,
            preserveAmount: true,
            deductCbgFee: true,
        });
        expect(recalculated.ok && recalculated.entry.amount).toBe(190);
        await store.useAccounts().flush();
        await store.useAccounts().retry();
        expect(store.useAccounts().entries.value).toHaveLength(1);
        expect(store.useAccounts().entries.value[0].amount).toBe(190);
    });

    it('普通装备和召唤兽卖出手续费封顶，卖币不套用物品封顶', async () => {
        const store = await loadStore(
            host(async () => []),
            true,
        );
        for (const category of ['装备交易', '召唤兽交易']) {
            const result = store.addEntry({ ...sale, category, amount: 30000 });
            expect(result.ok && result.entry.amount).toBe(29000);
        }
        const coin = store.addEntry({ ...sale, amount: 30000 });
        expect(coin.ok && coin.entry.amount).toBe(28500);
        await store.useAccounts().flush();
    });

    it('购买、游戏内、梦幻币及直接填写实得都不扣手续费', async () => {
        const store = await loadStore(
            host(async () => []),
            true,
        );
        const inputs = [
            { ...sale, kind: 'expense' as const, category: '游戏币买入' },
            { ...sale, kind: 'expense' as const, category: '装备交易' },
            { ...sale, channel: '游戏内' },
            { ...sale, deductCbgFee: false },
        ];
        for (const input of inputs) {
            const result = store.addEntry(input);
            expect(result.ok && result.entry.amount).toBe(100.3);
        }
        const cash = store.addEntry({ ...sale, currency: 'cash', deductCbgFee: true });
        expect(cash.ok && cash.entry.amount).toBe(1003000);
        await store.useAccounts().flush();
    });

    it('扣费后无实得不写账；规则缺失时须直接填实得，不能静默漏扣', async () => {
        const store = await loadStore(host(async () => []));
        expect(store.addEntry(sale)).toMatchObject({
            ok: false,
            error: expect.stringContaining('规则未加载'),
        });
        expect(store.useAccounts().entries.value).toHaveLength(0);
        const net = store.addEntry({ ...sale, deductCbgFee: false });
        expect(net.ok && net.entry.amount).toBe(100.3);
        await import('../../services/game-data.fixture');
        expect(store.addEntry({ ...sale, amount: 0.01 })).toMatchObject({ ok: false });
        expect(store.useAccounts().entries.value).toHaveLength(1);
        await store.useAccounts().flush();
    });

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

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
});

async function setup(stock = false, failLoad = false, worn = false) {
    vi.resetModules();
    const accountSave = vi.fn().mockResolvedValue(true);
    const accountTradeSave = vi.fn().mockResolvedValue(true);
    const warehouseSave = vi.fn().mockResolvedValue(true);
    const accountLoad = vi.fn().mockResolvedValue([]);
    vi.doMock('../../services/desktop', () => ({ hasDesktop: () => true }));
    await import('../../services/game-data.fixture');
    const { normalizeWarehouseItem } = await import('../warehouse/warehouse');
    const item = normalizeWarehouseItem({
        id: 'trade-pet',
        kind: 'pet',
        server: '',
        createdAt: 1,
        updatedAt: 1,
        pet: { name: '画魂', growth: '1.287', life: '9999', skills: ['高级必杀'] },
    })!;
    const warehouseLoad = vi.fn().mockResolvedValue(failLoad ? null : stock ? [item] : []);
    const charactersLoad = vi.fn().mockResolvedValue(worn ? [{
        id: 'owner', name: '角色甲', updatedAt: 1,
        pets: [{ ...('pet' in item ? item.pet : {}), warehouseId: item.id }],
    }] : []);
    vi.doMock('../../services/storage', () => ({
        accountLoad,
        accountSave,
        accountTradeSave,
        warehouseSave,
        warehouseLoad,
        charactersLoad,
        charactersSave: vi.fn().mockResolvedValue(true),
    }));
    const accounts = await import('./accounts-store');
    const warehouse = await import('../warehouse/warehouse-store');
    await accounts.loadAccounts();
    await warehouse.loadWarehouse();
    if (worn) {
        const roster = await import('../characters/roster');
        await roster.loadRoster();
    }
    return {
        ...accounts,
        ...warehouse,
        item,
        accountSave,
        accountTradeSave,
        warehouseSave,
        accountLoad,
        warehouseLoad,
        charactersLoad,
    };
}

const INPUT = {
    date: '2026-11-17',
    characterId: '',
    kind: 'expense' as const,
    currency: 'rmb' as const,
    category: '召唤兽交易',
    channel: '游戏内',
    amount: 100,
    note: '',
};

describe('账号与仓库关联交易', () => {
    it('补记买入可关联携带物品，保留原编号、资料和角色归属', async () => {
        const s = await setup(true, false, true);
        const { useRoster } = await import('../characters/roster');
        const before = JSON.stringify(useRoster().roster.value);
        const selected = [...s.useWarehouse().items.value];
        expect(s.addEntry({ ...INPUT, assets: selected, assetSource: 'warehouse' }).ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.useWarehouse().items.value).toEqual(selected);
        expect(s.useWarehouse().owners.value.get(s.item.id)).toBe('角色甲');
        expect(JSON.stringify(useRoster().roster.value)).toBe(before);
        expect(s.useAccounts().entries.value[0].assets).toEqual(selected);
    });

    it('携带中的召唤兽出售与名册解除关联一起暂存，失败重试后回仓不自动携带', async () => {
        const s = await setup(true, false, true);
        const { useRoster } = await import('../characters/roster');
        expect(s.useWarehouse().owners.value.has(s.item.id)).toBe(true);
        s.accountTradeSave.mockResolvedValueOnce(false);
        const result = s.addEntry({ ...INPUT, kind: 'income', assets: [...s.useWarehouse().items.value] });
        if (!result.ok) throw new Error(result.error);
        expect(useRoster().roster.value[0].pets).toEqual([]);
        expect(await s.useAccounts().flush()).toBe(false);
        expect(s.useWarehouse().tradePending.value).toBe(true);
        expect(useRoster().update(useRoster().roster.value[0])).toBe(false);
        expect(await s.useAccounts().retry()).toBe(true);
        expect(s.useWarehouse().items.value).toEqual([]);
        expect(s.removeEntry(result.entry.id).ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.useWarehouse().items.value).toHaveLength(1);
        expect(s.useWarehouse().owners.value.has(s.item.id)).toBe(false);
    });

    it('买入选择现有库存保持唯一编号，临时来源不写入成交记录', async () => {
        const s = await setup(true);
        const result = s.addEntry({ ...INPUT, assets: [s.item], assetSource: 'warehouse' });
        expect(result.ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.useWarehouse().items.value).toEqual([s.item]);
        expect(s.accountTradeSave).toHaveBeenCalledOnce();
        expect(s.useAccounts().entries.value[0]).not.toHaveProperty('assetSource');
        expect(s.useAccounts().entries.value[0].assets).toEqual([s.item]);
        expect(s.warehouseSave).not.toHaveBeenCalled();
    });

    it('卖出录入失败可原样重试，成功后删除卖出一次回仓', async () => {
        const s = await setup();
        s.accountTradeSave.mockResolvedValueOnce(false);
        const result = s.addEntry({
            ...INPUT,
            kind: 'income',
            assets: [s.item],
            assetSource: 'draft',
        });
        if (!result.ok) throw new Error(result.error);
        expect(await s.useAccounts().flush()).toBe(false);
        expect(s.useWarehouse().tradePending.value).toBe(true);
        expect(s.useWarehouse().items.value).toEqual([]);
        expect(await s.useAccounts().retry()).toBe(true);
        expect(s.useAccounts().entries.value).toHaveLength(1);
        expect(s.useAccounts().entries.value[0].assets).toEqual([s.item]);
        expect(s.removeEntry(result.entry.id).ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.useWarehouse().items.value).toEqual([s.item]);
        expect(s.useAccounts().entries.value).toEqual([]);
        expect(s.accountSave).not.toHaveBeenCalled();
    });

    it('多件物品同笔买入和卖出，快照完整且库存一次更新', async () => {
        const s = await setup();
        const pair = [s.item, { ...s.item, id: 'second-pet' }];
        expect(s.addEntry({ ...INPUT, assets: pair }).ok).toBe(true);
        await s.useAccounts().flush();
        expect(s.useWarehouse().items.value).toHaveLength(2);
        const selected = [...s.useWarehouse().items.value];
        expect(s.addEntry({ ...INPUT, kind: 'income', assets: selected }).ok).toBe(true);
        await s.useAccounts().flush();
        expect(s.useWarehouse().items.value).toEqual([]);
        expect(s.useAccounts().entries.value.map((entry) => entry.assets?.length)).toEqual([2, 2]);
        expect(s.accountTradeSave).toHaveBeenCalledTimes(2);
    });
    it('买入只写事务接口；重载保留快照，修改金额不再次入仓', async () => {
        const s = await setup();
        const result = s.addEntry({ ...INPUT, assets: [s.item] });
        expect(result.ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.accountTradeSave).toHaveBeenCalledOnce();
        expect(s.accountSave).not.toHaveBeenCalled();
        expect(s.warehouseSave).not.toHaveBeenCalled();
        expect(s.useWarehouse().items.value).toHaveLength(1);
        expect(s.useWarehouse().tradePending.value).toBe(false);
        if (!result.ok) throw new Error(result.error);
        s.accountLoad.mockResolvedValue(JSON.parse(JSON.stringify(s.useAccounts().entries.value)));
        await s.loadAccounts();
        expect(s.useAccounts().entries.value[0].assets?.[0]).toMatchObject({
            pet: { name: '画魂' },
        });
        expect(s.updateEntry(result.entry.id, { ...INPUT, amount: 200 }).ok).toBe(true);
        await s.useAccounts().flush();
        expect(s.accountTradeSave).toHaveBeenCalledOnce();
        expect(s.useWarehouse().items.value).toHaveLength(1);
        expect(s.updateEntry(result.entry.id, { ...INPUT, kind: 'income' }).ok).toBe(false);
    });

    it('卖出失败时锁住仓库，重试只落盘；成功后再次卖出被拒绝', async () => {
        const s = await setup(true);
        s.accountTradeSave.mockResolvedValueOnce(false);
        const sale = { ...INPUT, kind: 'income' as const, assets: [s.item] };
        expect(s.addEntry(sale).ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(false);
        expect(s.useWarehouse().tradePending.value).toBe(true);
        expect(s.useWarehouse().save([{ ...s.item, id: 'another' }])).toBe(false);
        expect(await s.useAccounts().retry()).toBe(true);
        expect(s.useAccounts().entries.value).toHaveLength(1);
        expect(s.useWarehouse().items.value).toEqual([]);
        expect(s.addEntry(sale).ok).toBe(false);
        expect(s.useAccounts().entries.value).toHaveLength(1);
    });

    it('仓库未读到时不记半条账，普通记账不受仓库读取失败影响', async () => {
        const s = await setup(false, true);
        expect(s.addEntry({ ...INPUT, assets: [s.item] }).ok).toBe(false);
        expect(s.useAccounts().entries.value).toEqual([]);
        expect(s.accountTradeSave).not.toHaveBeenCalled();
        expect(s.addEntry(INPUT).ok).toBe(true);
        await s.useAccounts().flush();
        expect(s.accountSave).toHaveBeenCalledOnce();
    });

    it('删除多件卖出账目同事务回仓，重载保留物品并清除已卖出列表', async () => {
        const s = await setup();
        const pair = [s.item, { ...s.item, id: 'second-pet' }];
        const purchase = s.addEntry({ ...INPUT, assets: pair });
        expect(purchase.ok).toBe(true);
        await s.useAccounts().flush();
        const sale = s.addEntry({ ...INPUT, kind: 'income', assets: pair });
        if (!sale.ok) throw new Error(sale.error);
        await s.useAccounts().flush();
        expect(s.removeEntry(sale.entry.id)).toEqual({ ok: true });
        expect(await s.useAccounts().flush()).toBe(true);
        expect(s.useAccounts().entries.value).toHaveLength(1);
        expect(s.useWarehouse().items.value).toEqual(pair);
        expect(s.accountTradeSave).toHaveBeenLastCalledWith(
            s.useAccounts().entries.value,
            s.useWarehouse().items.value,
        );
        s.accountLoad.mockResolvedValue(JSON.parse(JSON.stringify(s.useAccounts().entries.value)));
        s.warehouseLoad.mockResolvedValue(JSON.parse(JSON.stringify(s.useWarehouse().items.value)));
        await s.loadAccounts();
        await s.loadWarehouse();
        const { soldWarehouseItems } = await import('./account-assets');
        expect(
            soldWarehouseItems(s.useAccounts().entries.value, s.useWarehouse().items.value),
        ).toEqual([]);
        expect(s.useWarehouse().items.value).toHaveLength(2);
        expect(s.warehouseSave).not.toHaveBeenCalled();
    });

    it('回仓保存失败后锁住库存，重试不重复恢复，不能再次删除同一记录', async () => {
        const s = await setup(true);
        const sale = s.addEntry({ ...INPUT, kind: 'income', assets: [s.item] });
        if (!sale.ok) throw new Error(sale.error);
        await s.useAccounts().flush();
        s.accountTradeSave.mockResolvedValueOnce(false);
        expect(s.removeEntry(sale.entry.id).ok).toBe(true);
        expect(await s.useAccounts().flush()).toBe(false);
        expect(s.useAccounts().entries.value).toEqual([]);
        expect(s.useWarehouse().items.value).toEqual([s.item]);
        expect(s.useWarehouse().tradePending.value).toBe(true);
        expect(s.useWarehouse().remove(s.item.id)).toBe(false);
        expect(await s.useAccounts().retry()).toBe(true);
        expect(s.useWarehouse().tradePending.value).toBe(false);
        expect(s.useWarehouse().items.value).toHaveLength(1);
        expect(s.removeEntry(sale.entry.id).ok).toBe(false);
    });

    it('仓库读取失败不能删除卖出记录，删除买入记录不改变库存', async () => {
        const s = await setup(false, true);
        s.accountLoad.mockResolvedValue([
            {
                ...INPUT,
                id: 'sale',
                createdAt: 1,
                kind: 'income',
                source: '',
                assets: [s.item],
            },
        ]);
        await s.loadAccounts();
        expect(s.removeEntry('sale').ok).toBe(false);
        expect(s.useAccounts().entries.value).toHaveLength(1);
        expect(s.accountTradeSave).not.toHaveBeenCalled();

        s.warehouseLoad.mockResolvedValue([s.item]);
        await s.loadWarehouse();
        s.accountLoad.mockResolvedValue([
            {
                ...INPUT,
                id: 'purchase',
                createdAt: 1,
                source: '',
                assets: [s.item],
            },
        ]);
        await s.loadAccounts();
        expect(s.removeEntry('purchase').ok).toBe(true);
        await s.useAccounts().flush();
        expect(s.useWarehouse().items.value).toEqual([s.item]);
        expect(s.accountTradeSave).not.toHaveBeenCalled();
        expect(s.accountSave).toHaveBeenCalledOnce();
    });
});

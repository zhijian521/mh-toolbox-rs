import { describe, expect, it, vi } from 'vitest';
import { isReadonly } from 'vue';

async function setup(failRead = false) {
    vi.resetModules();
    const save = vi.fn().mockResolvedValue(true);
    vi.doMock('../../services/desktop', () => ({ hasDesktop: () => true }));
    vi.doMock('../../services/storage', () => ({
        warehouseLoad: async () => failRead ? null : [],
        warehouseSave: save,
    }));
    await import('../../services/game-data.fixture');
    const { loadWarehouse, useWarehouse } = await import('./warehouse-store');
    const { newWarehouseItem } = await import('./warehouse');
    await loadWarehouse();
    const store = useWarehouse();
    const item = newWarehouseItem('pet');
    item.pet.name = '画魂';
    return { store, item, save };
}

describe('独立仓库存储', () => {
    it('保存隔离草稿、公开只读，并拒绝过期编辑覆盖', async () => {
        const { store, item } = await setup();
        expect(store.save([item])).toBe(true);
        expect(await store.flush()).toBe(true);
        const expected = JSON.stringify(store.items.value[0]);
        item.pet.name = '修改草稿';
        expect(store.items.value[0]).toMatchObject({ pet: { name: '画魂' } });
        expect(isReadonly(store.items.value[0])).toBe(true);
        expect(store.save([item], expected)).toBe(true);
        await store.flush();
        expect(store.save([item], expected)).toBe(false);
        expect(store.operationError.value).toContain('已被修改');
        expect(store.remove(item.id)).toBe(true);
        await store.flush();
        expect(store.items.value).toEqual([]);
    });

    it('读取失败拒写；保存失败后重试不重复入仓', async () => {
        const failed = await setup(true);
        expect(failed.store.save([failed.item])).toBe(false);
        expect(failed.save).not.toHaveBeenCalled();
        const { store, item, save } = await setup();
        save.mockResolvedValueOnce(false);
        expect(store.save([item])).toBe(true);
        expect(await store.flush()).toBe(false);
        expect(await store.retry()).toBe(true);
        expect(await store.flush()).toBe(true);
        expect(store.items.value).toHaveLength(1);
    });
});

/** 真窗口验证仓库选取只改草稿，保存改变归属，卸下后原物品保留。 */
import { importLoaded } from '../../cdp.mjs';

export async function assets(ctx) {
    const { cdp, ui, t } = ctx;
    let stockStateColor;
    const read = () =>
        cdp.evaluate(`(async () => {
        const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
        const { useWarehouse } = await ${importLoaded('/src/views/warehouse/warehouse-store.ts')};
        const role = useRoster().roster.value.find((one) => one.name === 'E2E改名后');
        const store = useWarehouse();
        // CDP 按值返回前先拍平成普通对象，避免只读代理的字段丢失。
        return JSON.parse(JSON.stringify({
            gear: role.gear.find((one) => one.slot === '武器'),
            pets: role.pets,
            stock: store.items.value.filter((one) => one.kind === 'gear'
                ? one.gear.detail.name === 'E2E刀' : one.pet.name === 'E2E兽')
                .map((one) => ({ id: one.id, kind: one.kind, owner: store.owners.value.get(one.id) })),
        }));
    })()`);
    async function edit(pane) {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.clickText('.ocr-tabs button', pane, { exact: true });
    }
    async function choose(kind, name) {
        await ui.clickLabel(`从仓库选择${kind}`);
        await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
        await ui.clickLabel(`选择穿戴 ${name}`);
        await ui.clickLabel('确认选择角色物品');
        await ui.waitFor(`!document.querySelector('.warehouse-content')`);
    }
    async function save() {
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
    }

    await t.step('角色物品自动入仓，已穿戴与未穿戴分开展示', async () => {
        const before = await read();
        t.check('已卸下的武器和当前召唤兽各保留一件', before.stock.length === 2);
        t.check(
            '召唤兽编号关联当前角色',
            before.stock.some(
                (one) =>
                    one.kind === 'pet' &&
                    one.id === before.pets[0]?.warehouseId &&
                    one.owner === 'E2E改名后',
            ),
        );
        await ui.clickLabel('打开装备和召唤兽仓库');
        await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
        t.check(
            '卸下的装备显示未穿戴',
            await ui.waitFor(
                `document.querySelector('.warehouse-item[aria-label$=" E2E刀"] .warehouse-item-state')?.textContent.trim() === '未穿戴'`,
            ),
        );
        stockStateColor = await cdp.evaluate(
            `getComputedStyle(document.querySelector('.warehouse-item[aria-label$=" E2E刀"] .warehouse-item-state')).color`,
        );
        await ui.clickText('[aria-label="仓库状态"] button', '已穿戴');
        t.check(
            '已穿戴分类不包含卸下的武器',
            await ui.waitFor(`!document.querySelector('.warehouse-item[aria-label$=" E2E刀"]')`),
        );
        await cdp.click('.warehouse-dialog:not([inert]) [data-modal-close]');
    });

    await t.step('装备从仓库选入后取消，物品归属不变', async () => {
        const before = await read();
        await edit('装备');
        await ui.clickLabel('编辑武器的装备');
        await choose('装备', 'E2E刀');
        t.check(
            '选取后填入右侧详情',
            await cdp.evaluate(
                `document.querySelector('input[aria-label="武器 的装备名"]').value === 'E2E刀'`,
            ),
        );
        await ui.clickLabel('放弃这次修改');
        await ui.clickLabel('确认放弃修改');
        await ui.waitFor(`!document.querySelector('.editor')`);
        t.check(
            '取消后角色与仓库保持原样',
            JSON.stringify(await read()) === JSON.stringify(before),
        );
    });

    await t.step('从仓库穿戴装备，保存重载不复制物品', async () => {
        const before = await read();
        const id = before.stock.find((one) => one.kind === 'gear').id;
        await edit('装备');
        await ui.clickLabel('编辑武器的装备');
        await choose('装备', 'E2E刀');
        await save();
        const after = await read();
        t.check(
            '保存重载保留原物品编号与所属角色',
            after.gear.warehouseId === id &&
                after.stock.length === before.stock.length &&
                after.stock.find((one) => one.id === id)?.owner === 'E2E改名后',
        );
        await ui.clickLabel('打开装备和召唤兽仓库');
        await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
        t.check(
            '已穿戴只用下方状态文字区分，移除外框填色',
            await ui.waitFor(
                `(() => {
                    const item = document.querySelector('.warehouse-item-worn[aria-label$=" E2E刀"]');
                    const state = item?.querySelector('.warehouse-item-state');
                    if (!item || !state) return false;
                    const style = getComputedStyle(item);
                    return state.dataset.state === 'worn' && state.textContent.trim() === '已穿戴' &&
                        state.classList.contains('num-tag') && state.classList.contains('num-slot') &&
                        getComputedStyle(state).fontWeight === '400' &&
                        style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
                        style.borderTopColor === 'rgba(0, 0, 0, 0)' &&
                        getComputedStyle(state).color !== ${JSON.stringify(stockStateColor)};
                })()`,
            ),
        );
        await cdp.click('.warehouse-dialog:not([inert]) [data-modal-close]');
    });

    await t.step('穿戴装备和携带召唤兽可补记买入或选择出售，取消不改关联', async () => {
        const before = await read();
        await ui.gotoReady('账号');
        for (const [direction, kind, name] of [
            ['买入', '装备', 'E2E刀'],
            ['买入', '召唤兽', 'E2E兽'],
            ['卖出', '装备', 'E2E刀'],
            ['卖出', '召唤兽', 'E2E兽'],
        ]) {
            await ui.clickText('.shortcut', `${direction}${kind}`);
            await ui.clickText('[aria-label="是否关联仓库物品"] button', '是');
            await ui.clickLabel('设置交易关联物品');
            await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
            await ui.clickLabel(`选择${direction} ${name}`);
            await ui.clickLabel('确认选择交易物品');
            await ui.waitFor(`!document.querySelector('.warehouse-content')`);
            t.check(
                `${kind}穿戴物品可加入${direction}草稿`,
                await ui.exists(`.account-asset-list [aria-label="查看物品属性 ${name}"]`),
            );
            await ui.clickLabel('关闭账目编辑');
            await ui.clickLabel('确认放弃修改');
            await ui.waitFor(`!document.querySelector('.modal-mask')`);
        }
        t.check('取消出售不改角色或库存', JSON.stringify(await read()) === JSON.stringify(before));
        await ui.gotoReady('角色');
    });

    await t.step('卸下装备与移除召唤兽后原物品留仓，再次选择沿用编号', async () => {
        const before = await read();
        await edit('装备');
        await ui.clickLabel('编辑武器的装备');
        await ui.clickLabel('卸下武器这件装备');
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        await ui.clickLabelPrefix('移除第 1 只');
        await save();
        const removed = await read();
        t.check(
            '卸下与移除只解除归属，不删除物品',
            !removed.gear.warehouseId &&
                removed.pets.length === 0 &&
                removed.stock.length === before.stock.length &&
                removed.stock.every((one) => !one.owner),
        );
        await edit('召唤兽');
        await choose('召唤兽', 'E2E兽');
        await save();
        const restored = await read();
        t.check(
            '仓库召唤兽可重新携带，保存重载沿用原编号',
            restored.pets.length === 1 &&
                restored.pets[0].warehouseId === before.pets[0].warehouseId &&
                restored.stock.length === before.stock.length,
        );
    });
}

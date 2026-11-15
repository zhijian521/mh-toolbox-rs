import { CONFIRM_DELETE } from '../shared.mjs';

export async function cleanup(ctx, { hasPet }) {
    const { cdp, ui, t, sleep, baseline } = ctx;
    if (hasPet) {
        await t.step('召唤兽：左栏 × 真的删掉这一只', async () => {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
                throw new Error('编辑态没打开');
            }
            await ui.clickText('.ocr-tabs button', '召唤兽');
            await sleep(300);
            t.check(
                '删之前左栏有一只',
                (await ui.count('.pet-editor .pet-choice')) === 1,
                `实际 ${await ui.count('.pet-editor .pet-choice')} 行`,
            );

            await ui.clickLabelPrefix('删除第 1 只');
            await sleep(350);
            t.check(
                '删之后左栏空了',
                (await ui.count('.pet-editor .pet-choice')) === 0,
                `实际 ${await ui.count('.pet-editor .pet-choice')} 行`,
            );
            /* 一只都不剩时右侧不该还留着一张绑不上数据的表单——那是「删了但没删干净」。 */
            t.check('右侧回到空态', !(await ui.exists('.pet-block')));

            await ui.clickLabel('保存这个角色');
            await sleep(700);
            const plates = await cdp.evaluate(
                `(() => {
                        const card = [...document.querySelectorAll('.roster .char')]
                            .find((c) => (c.textContent || '').includes('E2E改名后'));
                        if (!card) return -1;
                        return card.querySelectorAll('.plate').length;
                    })()`,
            );
            t.check('删掉的那只没有留在卡上', plates === 0, `实际 ${plates} 块兽牌`);
        });
    }

    await t.step('Esc 只关编辑器，不穿透到别的层', async () => {
        await ui.clickLabel('新建角色');
        await sleep(350);
        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 关掉编辑器', !(await ui.exists('.editor')));
        t.check('没有残留遮罩', !(await ui.exists('.editor-mask')));
    });

    await t.step('删除：先 Esc 取消，再确认删掉', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        await sleep(400);
        t.check('删除前弹确认窗', await ui.exists('[role="dialog"]'));

        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 取消，角色还在', (await ui.text()).includes('E2E改名后'));

        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        /* 等弹窗**真的挂上**再点确认。这里原来是一记固定的 `sleep(350)`：单跑这一节
         * 一直绿，全量跑到这里却红过一次（「找不到含「删除」的 button」）——
         * 上一记 Esc 的退场与这一记的入场抢同一段 300ms，典型的时间差。 */
        if (
            !(await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            }))
        ) {
            throw new Error('确认窗没打开');
        }
        await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
        /* 删完等名册自己少一格，别再固定等 700：库写完 → 页面重画这一段长度不固定。 */
        await ui.waitFor(
            `document.querySelectorAll('.roster .char').length === ${baseline.chars}`,
            { timeout: 5000 },
        );
        const back = await ui.count('.roster .char');
        t.check(
            '确认后角色被删掉',
            back === baseline.chars,
            `期望 ${baseline.chars}，实际 ${back}`,
        );
    });

    await t.step('重载后确认删除也进了库', async () => {
        await ui.goto('角色');
        await ui.reload();
        t.check('重载后没有残留的 E2E 角色', !(await ui.text()).includes('E2E改名后'));
    });
}

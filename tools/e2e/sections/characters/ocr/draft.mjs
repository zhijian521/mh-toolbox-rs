import { importLoaded } from '../../../cdp.mjs';

export async function draft(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { checkCardFits } = tools;
    await t.step('截图草稿：无图补录、清空和辅助增删，切页保留、取消不落库', async () => {
        const readCharacter = () =>
            cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            return JSON.parse(JSON.stringify(useRoster().roster.value
                .find((row) => row.name === 'E2E改名后')));
        })()`);
        const before = await readCharacter();
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        await ui.fillSel('.ocr-card input[aria-label="角色名"]', 'E2E截图草稿');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="角色帮派"]', '草稿帮派');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="乾元丹"]', '3');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="气血"]', '');
        await cdp.key('Enter');
        t.check(
            '固定属性不提供删除按钮，分组仍为两列',
            (await ui.count('.ocr-card .pane button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const groups = [...document.querySelectorAll('.ocr-card .attr-group')];
                    const first = groups[0].getBoundingClientRect();
                    const second = groups[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)),
        );
        await checkCardFits('属性');
        await ui.clickText('.ocr-tabs .step-opt', '师门', { exact: true });
        await ui.fillSel('.ocr-card .school-row input', '120');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card .school-row input', '0');
        await cdp.key('Enter');
        t.check(
            '师门固定七项可改等级，不提供删除按钮，仍一行两个',
            (await ui.count('.ocr-card .school-row')) === 7 &&
                (await ui.count('.ocr-card .school-row button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const rows = [...document.querySelectorAll('.ocr-card .school-row')];
                    const first = rows[0].getBoundingClientRect();
                    const second = rows[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)) &&
                (await cdp.evaluate(
                    `document.querySelector('.ocr-card .school-row input').value`,
                )) === '0',
        );
        await checkCardFits('师门');
        await ui.clickText('.ocr-tabs .step-opt', '修炼', { exact: true });
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '19');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '0');
        await cdp.key('Enter');
        t.check(
            '修炼固定十项只修改等级，不提供删除按钮，两组并排',
            (await ui.count('.ocr-card .training-list input')) === 10 &&
                (await ui.count('.ocr-card .pane button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const groups = [...document.querySelectorAll('.ocr-card .training-col')];
                    const first = groups[0].getBoundingClientRect();
                    const second = groups[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)),
        );
        await checkCardFits('修炼');
        t.check(
            '修炼可直接把等级改为 0',
            (await cdp.evaluate(
                `document.querySelector('.ocr-card input[aria-label="攻击修炼 等级"]').value`,
            )) === '0',
        );
        await ui.clickText('.ocr-tabs .step-opt', '辅助', { exact: true });
        await checkCardFits('辅助');
        t.check(
            '辅助两组的添加按钮统一为新增并保留图标',
            await cdp.evaluate(`(() => {
                const buttons = [...document.querySelectorAll('.ocr-card .assist-add')];
                return buttons.length === 2 && buttons.every((button) =>
                    button.textContent.trim() === '新增' && button.querySelector('svg'));
            })()`),
        );
        const rowCount = await ui.count('.ocr-card .assist-group .slip-row');
        await ui.clickLabel('新增生活技能');
        t.check(
            '新增辅助技能默认等级为 0，编辑态仍一行两个',
            await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.ocr-card .assist-group:first-child .slip-row')];
                const first = rows[0].getBoundingClientRect();
                const second = rows[1].getBoundingClientRect();
                return rows.at(-1).querySelector('input').value === '0' &&
                    Math.abs(first.top - second.top) < 1 && second.left > first.left;
            })()`),
        );
        await cdp.click(
            '.ocr-card .assist-group:first-child .slip-row:last-child [role="combobox"]',
        );
        await cdp.key('Enter');
        const added = await ui.text(
            '.ocr-card .assist-group:first-child .slip-row:last-child .select-text',
        );
        await ui.fillSel('.ocr-card .assist-group:first-child .slip-row:last-child input', '33');
        await cdp.key('Enter');
        t.check(
            '辅助可新增技能并直接改等级',
            added.length > 0 &&
                (await ui.count('.ocr-card .assist-group .slip-row')) === rowCount + 1 &&
                (await cdp.evaluate(
                    `document.querySelector('.ocr-card .assist-group:first-child .slip-row:last-child input').value`,
                )) === '33',
        );
        await cdp.key('Tab');
        await cdp.key('Enter');
        t.check(
            '辅助新增行可用键盘删除',
            (await ui.count('.ocr-card .assist-group .slip-row')) === rowCount,
        );
        await ui.clickText('.ocr-tabs .step-opt', '属性', { exact: true });
        t.check(
            '跨分区切回仍保留卡头补录、潜能与属性清空',
            await cdp.evaluate(`document.querySelector('.ocr-card input[aria-label="角色名"]').value === 'E2E截图草稿' &&
                document.querySelector('.ocr-card input[aria-label="角色帮派"]').value === '草稿帮派' &&
                document.querySelector('.ocr-card input[aria-label="乾元丹"]').value === '3' &&
                document.querySelector('.ocr-card input[aria-label="气血"]').value === ''`),
        );
        await ui.clickText('.modal-panel button', '取消', { exact: true });
        await ui.waitFor(`!document.querySelector('.ocr')`);
        t.check(
            '取消不修改真实角色',
            JSON.stringify(await readCharacter()) === JSON.stringify(before),
        );

        // 只有删除也能应用，持久化后再恢复本节前置数据。
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '辅助' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        await ui.clickLabel('删除强身术');
        await ui.clickText('.modal-panel button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const kept = await readCharacter();
        t.check(
            '无截图、仅删除技能也可保存，重载后删除生效',
            !kept.assists.some((row) => row.name === '强身术') &&
                kept.assists.length === before.assists.length - 1,
        );
        await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const roster = useRoster();
            roster.update(${JSON.stringify(before)});
            if (!(await roster.flush())) throw new Error('截图草稿烟测恢复失败');
        })()`);
    });
}

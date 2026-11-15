import { importLoaded } from '../../../cdp.mjs';

export async function training(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { pasteFixture } = tools;
    await t.step('修炼截图：只记等级、漏项可修正、重载保留', async () => {
        const expected = {
            攻击修炼: 11,
            防御修炼: 5,
            法术修炼: 0,
            抗法修炼: 5,
            猎术修炼: 7,
            攻击控制力: 0,
            防御控制力: 0,
            法术控制力: 0,
            抗法控制力: 0,
            育兽术: 0,
        };
        const beforeExp = await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const roster = useRoster();
            const one = roster.roster.value.find((row) => row.name === 'E2E改名后');
            roster.update({
                ...one,
                trainings: one.trainings.map((group) => ({
                    ...group,
                    rows: group.rows.map((row) => ({
                        ...row, level: 7,
                    })),
                })),
            });
            if (!(await roster.flush())) throw new Error('修炼识别前置数据未写入');
            return { ...one.experience };
        })()`);
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '修炼' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        t.check(
            '从修炼卡打开时自动选中修炼',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '修炼',
        );
        t.check(
            '修炼预览只挂当前分区，没有失效的页签关联',
            await cdp.evaluate(`document.querySelectorAll('.ocr-card .pane').length === 1 &&
                document.querySelector('.ocr-card .pane').getAttribute('role') === 'region' &&
                !document.querySelector('.ocr-card .pane').hasAttribute('aria-labelledby')`),
        );
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        await pasteFixture('training.png');
        await ui.waitFor(
            `!document.querySelector('.ocr-standard .upload-busy') && !!document.querySelector('.ocr-count')`,
            { timeout: 60000 },
        );
        t.check(
            '修炼原图十项全部识别',
            (await ui.text('.ocr-count')).replace(/\s+/g, '') === '认出10/10',
            await ui.text('.ocr-count'),
        );
        t.check(
            '召唤兽页粘修炼图自动切换为修炼',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '修炼',
        );
        await ui.fillSel('.ocr-card input[aria-label="猎术修炼 等级"]', '7');
        await cdp.key('Enter');
        await pasteFixture('training.png', true);
        t.check(
            '修炼截图识别完成',
            await ui.waitFor(
                `!document.querySelector('.ocr-standard .upload-busy') &&
                    !!document.querySelector('.ocr-count') &&
                    document.querySelectorAll('.ocr-card .training-list input').length === 10`,
                { timeout: 60000 },
            ),
        );
        t.check(
            '只识别九项，丢失的等级不从经验里取',
            (await ui.text('.ocr-count')).replace(/\s+/g, '') === '认出9/10',
            await ui.text('.ocr-count'),
        );
        const placed = await cdp.evaluate(`Object.fromEntries(
            [...document.querySelectorAll('.ocr-card .training-list input')]
                .map((one) => [one.getAttribute('aria-label').replace(/ 等级$/, ''), one.value]),
        )`);
        t.check(
            '等级按项名配对，0 级写入、漏项保留原值',
            Object.entries(expected).every(([name, level]) => placed[name] === String(level)),
            JSON.stringify(placed),
        );
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '12');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="猎术修炼 等级"]', '8');
        await cdp.key('Enter');
        expected.攻击修炼 = 12;
        expected.猎术修炼 = 8;
        await ui.clickText('.modal-panel button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`);
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        const kept = await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const one = useRoster().roster.value.find((row) => row.name === 'E2E改名后');
            return {
                rows: one.trainings.flatMap((group) => group.rows.map((row) => ({ ...row }))),
                exp: { ...one.experience },
            };
        })()`);
        t.check(
            '两组等级与手动修正重载后都保留',
            kept.rows.every((row) => row.level === expected[row.name]),
            JSON.stringify(kept.rows),
        );
        t.check(
            '保存后的修炼记录不含上限',
            kept.rows.every((row) => !Object.hasOwn(row, 'cap')),
        );
        t.check('修炼经验不写入角色经验', JSON.stringify(kept.exp) === JSON.stringify(beforeExp));
    });
}

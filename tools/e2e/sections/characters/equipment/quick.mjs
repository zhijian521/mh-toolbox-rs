import { checkButtonTheme } from '../theme.mjs';

export async function quick(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { readGear, upload, head, waitUpload, openHead } = tools;
    await t.step('快速修改上传：部位拦错、取消不写入、保存才生效', async () => {
        await openHead();
        await ui.waitFor(`!!document.querySelector('.gear-quick')`);
        // 入场会缩放面板；等动画结束后再比较固定高度，避免把中间帧留作后续基线。
        const settled = await ui.waitFor(`(() => {
            const panel = document.querySelector('.gear-quick')?.closest('.modal-panel');
            return panel && getComputedStyle(panel).transform === 'none';
        })()`);
        if (!settled) throw new Error('装备修改窗入场动画未结束');
        const quickHeight = await cdp.evaluate(
            `document.querySelector('.modal-panel').getBoundingClientRect().height`,
        );
        t.check(
            '装备快速修改与完整修改使用相同固定高度',
            Math.abs(quickHeight - (await cdp.evaluate('Math.min(740, innerHeight - 48)'))) < 1,
        );
        await checkButtonTheme(ctx, '.modal-panel');
        t.check(
            '无图时左侧保留截图入口，右侧详情只有一个名称',
            await cdp.evaluate(
                `!!document.querySelector('.gear-quick .upload-preview.empty') &&
                !document.querySelector('.gear-quick .gear-more, .gear-quick .flavor-field, .gear-quick .foot-field') &&
                !!document.querySelector('.gear-quick textarea[aria-label="装备备注"]') &&
                document.querySelectorAll('.gear-quick .gear-name-input').length === 1`,
            ),
        );
        await upload('.gear-quick .upload-file', [
            ['追星踏月', '[装备条件] 等级60', '敏捷+27 防御+31'],
        ]);
        t.check(
            '鞋子图不能填进头部',
            await ui.waitFor(
                `document.querySelector('.upload-error')?.textContent.includes('这张是鞋子')`,
                { timeout: 45000 },
            ),
        );
        t.check(
            '拦错后名字保持水晶帽',
            await cdp.evaluate(
                `document.querySelector('.gear-quick .gear-name-input').value === '水晶帽'`,
            ),
        );
        await upload('.gear-quick .upload-file', [head(30)]);
        t.check('识别结果填进快捷表单', await waitUpload());
        /* 类型与等级照召唤兽那两格：都是票面凹槽（`.slip-row.sm` + `.num-slot`），
         * 等级是数字格且只记一个数（2026-11-11）。 */
        const idPair = await cdp.evaluate(`(() => {
            const pair = document.querySelector('.gear-quick .gear-kind');
            const cells = [...pair.querySelectorAll('label.slip-row.sm')];
            const level = pair.querySelector('input[aria-label="装备等级"]');
            return {
                cells: cells.length,
                labels: cells.map((cell) => cell.querySelector('.slip-name')?.textContent.trim()),
                slots: cells.every((cell) => !!cell.querySelector('.num-slot')),
                level: level ? level.value : null,
                kind: pair.querySelector('input[aria-label="装备类型"]')?.value || '',
            };
        })()`);
        t.check(
            '装备类型与等级两格走票面凹槽，等级只记一个数',
            idPair.cells === 2 &&
                idPair.labels.join('/') === '类型/等级' &&
                idPair.slots &&
                idPair.level === '60' &&
                idPair.kind.length > 0,
            JSON.stringify(idPair),
        );
        t.check(
            '分类下拉文字居中，数值输入格不显示占位字',
            await cdp.evaluate(`(() => {
            const label = document.querySelector('.gear-quick .effect-label .select-text');
            return getComputedStyle(label).textAlign === 'center' &&
                [...document.querySelectorAll('.gear-quick .value-field')].every((field) => !field.placeholder);
        })()`),
        );
        t.check(
            '快捷添加按钮按分类着色，套装按钮与详情同色',
            await cdp.evaluate(`(() => {
                const footer = document.querySelector('.gear-quick .gear-add');
                const tiles = [...footer.querySelectorAll('.press-btn-tile')];
                const suit = footer.querySelector('[aria-label="添加套装行"] .press-btn-inner');
                const detail = document.querySelector('.gear-quick .kind-suit .property-items');
                return new Set(tiles.map((tile) => getComputedStyle(tile).backgroundColor)).size === tiles.length &&
                    getComputedStyle(suit).color === getComputedStyle(detail).color;
            })()`),
        );
        const preview = await cdp.evaluate(`(() => {
            const image = document.querySelector('.gear-quick .upload-preview');
            const detail = document.querySelector('.gear-quick .upload-detail');
            return {
                sideBySide: image.getBoundingClientRect().right <= detail.getBoundingClientRect().left,
                inline: !!detail.querySelector('.stat-row input[aria-label="防御属性值"]'),
            };
        })()`);
        t.check('有图后左原图右详情，数值可直接编辑', preview.sideBySide && preview.inline);
        t.check(
            '基础两项同排，分类、名称和数值等高，套装也有分类背景',
            await cdp.evaluate(`(() => {
                const base = document.querySelector('.gear-quick [data-group="base"]');
                const rows = [...base.querySelectorAll('.property-item')];
                const suite = document.querySelector('.gear-quick .kind-suit .property-label');
                return base.querySelector('.property-items').classList.contains('paired') &&
                    rows.every((row) => {
                        const name = row.querySelector('.row-name');
                        const value = row.querySelector('.value-field');
                        const height = base.querySelector('.property-label').getBoundingClientRect().height;
                        return name.classList.contains('slip-row') &&
                            value.getBoundingClientRect().width > name.getBoundingClientRect().width &&
                            value.getBoundingClientRect().width >= 70 &&
                            Math.abs(name.getBoundingClientRect().height - height) < 1 &&
                            Math.abs(value.getBoundingClientRect().height - height) < 1;
                    }) &&
                    Math.abs(rows[0].getBoundingClientRect().top - rows[1].getBoundingClientRect().top) < 1 &&
                    suite.classList.contains('tag') &&
                    getComputedStyle(base.querySelector('.property-items')).color !== getComputedStyle(document.querySelector('.gear-quick .kind-suit .property-items')).color;
            })()`),
        );
        await ui.clickLabel('添加宝石行');
        t.check(
            '宝石行的名称和数值按2比1分格，行尾删除直接可见',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-quick [data-group="gem"] .detail-row');
                const name = row.querySelector('.row-name').getBoundingClientRect();
                const value = row.querySelector('.stat-number').getBoundingClientRect();
                const remove = row.querySelector('.row-delete');
                return Math.abs(name.width - value.width * 2) < 1 &&
                    name.right < value.left && Math.abs(name.height - value.height) < 1 &&
                    getComputedStyle(remove).opacity === '1' && !row.querySelector('details');
            })()`),
        );
        await ui.clickLabel('删除伤害属性');
        t.check(
            '行尾删除只移除新增宝石行',
            !(await ui.exists('.gear-quick [data-group="gem"]')) &&
                (await ui.exists('.gear-quick [data-group="base"]')),
        );
        await ui.clickLabel('添加符石组合行');
        await ui.fillSel('.gear-quick .kind-upgrade .effect-row input', '高山流水');
        t.check(
            '符石组合快捷添加为独立名称行，不创建附加属性',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-quick .kind-upgrade:has(.effect-row)');
                return row?.querySelector('.property-label').textContent.includes('符石组合') &&
                    row.querySelector('input').value === '高山流水' &&
                    !row.querySelector('.stat-row');
            })()`),
        );
        await cdp.click('.gear-quick .kind-upgrade .effect-row .row-delete');
        await ui.clickLabel('添加特技行');
        t.check(
            '快捷添加特技归入独立分类，不改变已有套装',
            (await ui.exists('.gear-quick .kind-active')) &&
                (await ui.exists('.gear-quick .kind-suit')),
        );
        await cdp.click('.gear-quick .kind-active .row-delete');
        t.check(
            '特技行可直接删除，套装保留',
            !(await ui.exists('.gear-quick .kind-active')) &&
                (await ui.exists('.gear-quick .kind-suit')),
        );
        for (let index = 0; index < 12; index++) await ui.clickLabel('添加宝石行');
        t.check(
            '增添长属性保持弹窗高度和数值字重',
            await cdp.evaluate(`(() => {
                const panel = document.querySelector('.modal-panel');
                return Math.abs(panel.getBoundingClientRect().height - ${quickHeight}) < 1 &&
                    [...panel.querySelectorAll('.value-field')].every(
                        (input) => getComputedStyle(input).fontWeight === '700');
            })()`),
        );
        t.check(
            '长详情独立滚动，紧凑的快捷添加按钮固定在卡片底部',
            await cdp.evaluate(`(() => {
            const content = document.querySelector('.gear-quick .gear-content');
            const footer = document.querySelector('.gear-quick .gear-add');
            const scale = Number(getComputedStyle(footer).getPropertyValue('--fs-scale')) || 1;
            const top = footer.getBoundingClientRect().top;
            content.scrollTop = content.scrollHeight;
            return content.scrollTop > 0 &&
                Math.abs(footer.getBoundingClientRect().top - top) < 1 &&
                content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1 &&
                [...footer.querySelectorAll('.press-btn-tile')].every((tile) =>
                    tile.getBoundingClientRect().height >= 30 * scale - 1 &&
                    tile.getBoundingClientRect().width <=
                        tile.querySelector('.press-btn-inner').getBoundingClientRect().width + 24 * scale);
        })()`),
        );
        await ui.fillSel('.gear-quick textarea[aria-label="装备备注"]', '取消的备注');
        await ui.clickText('.modal-panel button', '取消', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
        t.check(
            '取消保持原防御',
            (await readGear())
                .find((one) => one.slot === '头')
                ?.detail?.stats.some((stat) => stat.label === '防御' && stat.value === '+26'),
        );
        await openHead();
        t.check(
            '取消不保存备注',
            await cdp.evaluate(
                `document.querySelector('.gear-quick textarea[aria-label="装备备注"]').value !== '取消的备注'`,
            ),
        );
        t.check(
            '重新打开不残留上次编辑原图，截图入口保留',
            await ui.exists('.gear-quick .upload-preview.empty'),
        );
        await ui.fillSel('.gear-quick textarea[aria-label="装备备注"]', '任务用\n暂不更换');
        await ui.clickLabel('添加特技行');
        await ui.clickLabel('添加宝石行');
        await ui.fillSel('.gear-quick input[aria-label="伤害属性值"]', '123');
        await cdp.key('Enter');
        await upload('.gear-quick .upload-file', [head(30)]);
        await waitUpload();
        t.check(
            '重新识别按部位整件覆盖，不保留旧特技和宝石行',
            !(await ui.exists('.gear-quick .kind-active')) &&
                !(await ui.exists('.gear-quick [data-group="gem"]')),
        );
        t.check(
            '重新识别保留自用备注',
            await cdp.evaluate(
                `document.querySelector('.gear-quick textarea[aria-label="装备备注"]').value === ${JSON.stringify('任务用\n暂不更换')}`,
            ),
        );
        await ui.clickText('.modal-panel button', '保存', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
    });
}

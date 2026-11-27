async function checkPriceMaintenance({ cdp, t, ui }, sheet, editor) {
    const name = '物价烟测' + Date.now();
    const renamed = name + '改';
    const historyButton = (title) => `.price-card [aria-label="查看${title}的价格历史"]`;
    const history = `${sheet} .liquid-price-history`;
    const header = `${sheet} .price-history-header`;
    const price = `${editor} [inputmode="decimal"]`;
    const nameInput = `${editor} label:first-child input`;
    const noteInput = `${editor} fieldset > label:last-child input`;
    const confirm = `${sheet} .price-remove`;
    const save = () => cdp.click(`${editor} footer glass-button:last-child`);
    const waitHistory = (title) =>
        ui.waitFor(`!!document.querySelector('${history}') &&
        document.querySelector('${header} h2').textContent.trim() === ${JSON.stringify(title)}`);
    const choose = async (menu, value) => {
        await cdp.click(`${menu} [slot="trigger"]`);
        await ui.waitFor(`!!document.querySelector('${menu}[open]')`);
        await cdp.evaluate(`document.querySelector('${menu}[open] [value="${value}"]').click()`);
    };
    const dateTrigger = `${editor} .glass-date-field .date-trigger`;
    const calendar = `${editor} .date-panel:popover-open`;
    const itemMenu = (title) =>
        `.price-card-header glass-menu:has([aria-label="${title}的物品操作"])`;
    const waitClosed = () =>
        ui.waitFor(`!document.querySelector('${sheet}:is([open], [data-visible])')`);
    const removeRow = `${history} tbody tr:first-child .record-remove`;

    await cdp.click('.liquid-prices .price-add');
    await ui.waitFor(`!!document.querySelector('${nameInput}')`);
    await ui.fillSel(nameInput, name);
    await ui.fillSel(noteInput, '原备注');
    await ui.fillSel(price, '12');
    await save();
    await ui.waitFor(
        `!!document.querySelector('${historyButton(name)}') && !document.querySelector('${sheet}:is([open], [data-visible])')`,
    );
    await ui.clickLabel(`更新${name}的价格`);
    await ui.waitFor(
        `!!document.querySelector('${sheet}:is([open], [data-visible]) .glass-price-field input')`,
    );
    t.check(
        '卡片记价自动带入当前的 12 万',
        await cdp.evaluate(`document.querySelector('${price}').value === '12'`),
    );
    const discard = '.glass-dialog[open]:has(.glass-confirm)';
    await ui.fillSel(price, '18');
    await cdp.key('Escape');
    await ui.waitFor(`!!document.querySelector('${discard}')`);
    t.check(
        'Esc 先确认是否放弃记价草稿',
        await cdp.evaluate(`
        document.querySelector('${discard} h2').textContent.trim() === '放弃未保存的修改？' &&
        document.querySelector('${price}').value === '18'`),
    );
    await cdp.click(`${discard} footer glass-button:first-child`);
    await ui.waitFor(`!document.querySelector('${discard}')`);
    t.check(
        '继续编辑保留原草稿',
        await cdp.evaluate(`
        document.querySelector('${price}').value === '18' &&
        !!document.querySelector('${sheet}:is([open], [data-visible])')`),
    );
    // 弹窗遮住 Dock，从标签栏自身的键盘入口发起导航，覆盖取消后的选中态回退。
    await cdp.evaluate(`document.querySelector('.liquid-dock-bar').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
    )`);
    await ui.waitFor(`!!document.querySelector('${discard}')`);
    await cdp.click(`${discard} footer glass-button:first-child`);
    await ui.waitFor(`!document.querySelector('${discard}') &&
        document.querySelector('.liquid-dock-bar').getAttribute('value') === 'prices'`);
    t.check(
        '取消切页后保留当前 Dock 选中项和草稿',
        await cdp.evaluate(`
        location.hash === '#/prices' && document.querySelector('${price}').value === '18'`),
    );
    await cdp.click(`${editor} footer glass-button:first-child`);
    await ui.waitFor(`!!document.querySelector('${discard}')`);
    const desktopMotion =
        await cdp.evaluate(`document.querySelector('${sheet}').matches('dialog:modal') &&
        matchMedia('(prefers-reduced-motion: no-preference)').matches`);
    if (desktopMotion) {
        const leaving = await cdp.evaluate(`(async () => {
            const dialog = document.querySelector('${sheet}');
            await Promise.all(dialog.getAnimations().map(animation => animation.finished));
            const closed = new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
            document.querySelector('${discard} footer glass-button:last-child').click();
            await closed;
            const shrinking = dialog.getAnimations().some(animation => animation.transitionProperty === 'transform');
            return !dialog.open && dialog.getClientRects().length > 0 && shrinking;
        })()`);
        t.check('取消记价后表单在退出动画期间仍然可见', leaving);
        await ui.waitFor(`!document.querySelector('${sheet}').getClientRects().length`);
    } else {
        await cdp.click(`${discard} footer glass-button:last-child`);
    }
    await waitClosed();
    const menu = itemMenu(name);
    await cdp.click(`${menu} [slot="trigger"]`);
    await ui.waitFor(`(() => {
        const node = document.querySelector('${menu}[open]');
        const panel = node?.shadowRoot.querySelector('[part="panel"]');
        const content = node?.shadowRoot.querySelector('[part="content"]');
        return panel && content && Number(getComputedStyle(panel).opacity) === 1 &&
            Math.abs(panel.getBoundingClientRect().width - content.offsetWidth) < 1;
    })()`);
    t.check(
        '物品菜单展开时三点按钮透明可见，小号面板在选项四周留白',
        await cdp.evaluate(`(() => {
        const node = document.querySelector('${menu}');
        const trigger = node.querySelector('[slot="trigger"]');
        const triggerStyle = getComputedStyle(trigger);
        const content = node.shadowRoot.querySelector('[part="content"]');
        const inset = getComputedStyle(content);
        const item = getComputedStyle(node.querySelector('glass-menu-item'));
        const category = getComputedStyle(document.querySelector('.price-filters glass-menu-item'));
        return trigger.firstElementChild?.matches('svg.app-icon') && triggerStyle.opacity === '1' &&
            triggerStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && trigger.offsetWidth === 26 && trigger.offsetHeight === 26 &&
            [inset.paddingTop, inset.paddingRight, inset.paddingBottom, inset.paddingLeft].every(value => parseFloat(value) >= 10) &&
            content.offsetWidth >= 100 && content.offsetWidth <= 150 && item.minHeight === category.minHeight &&
            item.borderRadius === category.borderRadius && item.padding === category.padding;
    })()`),
    );
    t.check(
        '三点菜单向右下展开，贴近视口边缘时避让',
        await cdp.evaluate(`(() => {
        const node = document.querySelector('${menu}');
        const anchor = node.querySelector('[slot="trigger"]').getBoundingClientRect();
        const panel = node.shadowRoot.querySelector('[part="panel"]').getBoundingClientRect();
        const left = Math.max(8, Math.min(anchor.left, document.documentElement.clientWidth - 8 - panel.width));
        const below = window.innerHeight - anchor.bottom - 16;
        const top = panel.height <= below + 1 || below >= anchor.top - 16 ? anchor.bottom + 8 : anchor.top - 8 - panel.height;
        return Math.abs(panel.left - left) < 2 && Math.abs(panel.top - top) < 2 && node.getAttribute('placement') === 'bottom-start';
    })()`),
    );
    const menuFadeEnabled = (opening) =>
        cdp.evaluate(`(() => {
        const panel = document.querySelector('${menu}').shadowRoot.querySelector('[part="panel"]');
        const style = getComputedStyle(panel);
        return matchMedia('(prefers-reduced-motion: reduce)').matches ||
            (style.transitionProperty === 'opacity' && (${opening} ? parseFloat(style.transitionDuration) >= 0.15 :
                Math.abs(parseFloat(style.transitionDuration) * 1000 - parseFloat(style.getPropertyValue('--lg-popup-fade'))) < 1));
    })()`);
    t.check('三点菜单展开有淡入过渡', await menuFadeEnabled(true));
    await cdp.key('Escape');
    await ui.waitFor(`!document.querySelector('${menu}[open]')`);
    t.check('三点菜单使用下拉菜单的收起时长', await menuFadeEnabled(false));
    await ui.waitFor(`(() => {
        const node = document.querySelector('${menu}');
        return !node.open && getComputedStyle(node.shadowRoot.querySelector('[part="panel"]')).opacity === '0';
    })()`);
    await choose(menu, 'edit');
    await ui.waitFor(`document.querySelector('${nameInput}')?.value === ${JSON.stringify(name)}`);
    t.check(
        '编辑物品回填资料，价格和记录日期仅在记价时出现',
        await cdp.evaluate(`
        document.querySelector('${noteInput}').value === '原备注' &&
        !document.querySelector('${price}, ${dateTrigger}')`),
    );
    await ui.fillSel(nameInput, renamed);
    await ui.fillSel(noteInput, '新备注');
    const group = `${editor} .glass-select:first-of-type glass-menu`;
    const otherGroup = await cdp.evaluate(
        `document.querySelector('${group} glass-menu-item:not([checked])').value`,
    );
    await choose(group, otherGroup);
    const sub = `${editor} glass-menu:has([value="__custom_subcategory__"])`;
    await choose(sub, '__custom_subcategory__');
    await ui.fillSel(`${editor} .glass-select + label input`, '烟测子类');
    await save();
    await waitClosed();
    await cdp.click(historyButton(renamed));
    await waitHistory(renamed);
    /* 历史弹窗不再放「记价」，新增记录回卡片；「卡片记价带入当前金额」本节开头已验。 */
    t.check(
        '物品操作位于卡片右上角，历史标题收起该菜单',
        (await ui.exists(itemMenu(renamed))) && !(await ui.exists(`${header} glass-menu`)),
    );
    t.check(
        '修改名称、分类、子类和备注后保留原有价格记录',
        await cdp.evaluate(`(() => {
        const card = document.querySelector('${historyButton(renamed)}').closest('.price-card');
        return card.querySelector('.price-category').textContent.trim() === ${JSON.stringify(otherGroup)} &&
            card.querySelector('.price-subcategory').textContent.trim() === '烟测子类' &&
            card.querySelector('.price-note').textContent.trim() === '新备注' &&
            document.querySelectorAll('${history} tbody tr').length === 1 &&
            document.querySelector('${history} tbody').textContent.includes('12 万');
    })()`),
    );

    await cdp.click(`${history} tbody .record-edit`);
    await ui.waitFor(`!!document.querySelector('${price}')`);
    t.check(
        '历史行内编辑回填原有金额',
        await cdp.evaluate(`document.querySelector('${price}').value === '12'`),
    );
    await cdp.click(dateTrigger);
    await ui.waitFor(`document.activeElement?.matches('${calendar} .day[aria-pressed="true"]')`);
    t.check(
        '月历与分类菜单共用面板底色和玻璃边缘，按动效偏好从日期按钮展开',
        await cdp.evaluate(`(() => {
        const panel = document.querySelector('${calendar}');
        const menu = document.querySelector('.price-filters glass-menu').shadowRoot.querySelector('[part="panel"]');
        const style = getComputedStyle(panel);
        const animated = matchMedia('(prefers-reduced-motion: no-preference)').matches;
        return style.backgroundColor === getComputedStyle(menu).backgroundColor &&
            !!panel.querySelector('gl-fx > .r') && !!style.getPropertyValue('--date-anchor-transform').trim() &&
            (!animated || (style.transitionProperty.includes('transform') && parseFloat(style.transitionDuration) > 0));
    })()`),
    );
    await cdp.key('Escape');
    await ui.waitFor(
        `document.activeElement === document.querySelector('${dateTrigger}') && !document.querySelector('${calendar}')`,
    );
    t.check(
        '收起期间月历退出键盘操作，焦点回到记价表单',
        await cdp.evaluate(`
        document.querySelector('${editor} .date-panel').inert &&
        document.querySelector('${dateTrigger}').getAttribute('aria-expanded') === 'false' &&
        !!document.querySelector('${price}')`),
    );
    await cdp.key('ArrowDown');
    await ui.waitFor(`document.activeElement?.matches('${calendar} .day')`);
    await cdp.key('PageDown');
    await cdp.key('Enter');
    await ui.waitFor(`!document.querySelector('${calendar}')`);
    const chosenDate = await cdp.evaluate(`document.querySelector('${dateTrigger} time').dateTime`);
    await ui.fillSel(price, '23');
    await save();
    await waitHistory(renamed);
    t.check(
        '月历所选日期写回编辑的记录',
        await cdp.evaluate(
            `document.querySelector('${history} tbody time').dateTime === ${JSON.stringify(chosenDate)}`,
        ),
    );
    await cdp.click(removeRow);
    await ui.waitFor(`document.querySelector('${confirm} p')?.textContent.includes('23 万')`);
    await cdp.key('Escape');
    await waitHistory(renamed);
    t.check('取消删除保留这笔记录', (await ui.count(`${history} tbody tr`)) === 1);
    await cdp.click(removeRow);
    await ui.waitFor(`!!document.querySelector('${confirm} .confirm-removal')`);
    await cdp.click(`${confirm} .confirm-removal`);
    await waitHistory(renamed);
    t.check(
        '删除唯一一笔后历史显示空态',
        await cdp.evaluate(`document.querySelectorAll('${history} tbody tr').length === 0 &&
        !!document.querySelector('${history} .glass-empty-state')`),
    );

    /* 删掉唯一一笔后，新增记录只能从卡片发起：关历史 → 卡片记价 → 重开历史。 */
    await ui.clickText(`${header} glass-button`, '关闭', { exact: true });
    await waitClosed();
    await ui.clickLabel(`更新${renamed}的价格`);
    await ui.waitFor(`!!document.querySelector('${price}')`);
    await ui.fillSel(price, '31');
    await save();
    await waitClosed();
    await cdp.click(historyButton(renamed));
    await waitHistory(renamed);
    t.check(
        '空历史从卡片记价后重新打开显示新增记录',
        await cdp.evaluate(
            `document.querySelectorAll('${history} tbody tr').length === 1 &&
        document.querySelector('${history} tbody').textContent.includes('31 万')`,
        ),
    );

    await ui.clickText(`${header} glass-button`, '关闭', { exact: true });
    await waitClosed();
    await choose(itemMenu(renamed), 'remove');
    await ui.waitFor(
        `document.querySelector('${confirm} p')?.textContent.includes(${JSON.stringify(renamed)})`,
    );
    t.check(
        '整件删除确认写明物品名，默认焦点落在取消',
        await cdp.evaluate(`
        document.querySelector('${confirm} p').textContent.includes(${JSON.stringify(renamed)}) &&
        document.activeElement === document.querySelector('${confirm} footer glass-button')`),
    );
    await cdp.click(`${confirm} footer glass-button:first-child`);
    await waitClosed();
    t.check(
        '取消删除物品后焦点回到原卡片的菜单',
        await cdp.evaluate(
            `document.activeElement === document.querySelector('${itemMenu(renamed)} [slot="trigger"]')`,
        ),
    );
    await choose(itemMenu(renamed), 'remove');
    await cdp.click(`${confirm} .confirm-removal`);
    await ui.waitFor(
        `!document.querySelector('${historyButton(renamed)}') && !document.querySelector('${sheet}:is([open], [data-visible])')`,
    );
    t.check(
        '删除样本物品后返回物价列表',
        await ui.exists('.liquid-prices .price-add:not([disabled])'),
    );
}

async function checkPrices({ cdp, t, ui }) {
    const page = '.liquid-prices';
    const filters = `${page} .price-filters`;
    const emptyState = `${page} > .price-empty`;
    await ui.waitFor(
        `!!document.querySelector('${filters}, ${emptyState}, ${page} [role="alert"]')`,
    );
    const loaded = await cdp.evaluate(`!!document.querySelector('${filters}, ${emptyState}')`);
    t.check('物价页读取账本并展示筛选或新增入口', loaded);
    if (!loaded) return;

    const sheet = `${page} .price-history-sheet`;
    const editor = `${sheet} .liquid-price-editor`;
    const closeSheet = async () => {
        await cdp.key('Escape');
        await ui.waitFor(`!document.querySelector('${sheet}:is([open], [data-visible])')`);
    };
    await cdp.click(`${page} .price-add`);
    try {
        await ui.waitFor(
            `!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`,
        );
        t.check(
            '页头显示新增物品按钮并打开录入弹窗',
            await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '新增物品' &&
                document.querySelector('${page} .price-add').textContent.trim() === '新增物品'`),
        );
        t.check(
            '居中新增弹窗和遮罩随系统动效偏好淡入',
            await cdp.evaluate(`(() => {
            const dialog = document.querySelector('${sheet}');
            if (dialog.localName !== 'dialog') return true;
            const panel = getComputedStyle(dialog);
            const backdrop = getComputedStyle(dialog, '::backdrop');
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                return [panel, backdrop].every(style => parseFloat(style.transitionDuration) <= 0.001);
            }
            return panel.transitionProperty.includes('transform') && [panel, backdrop].every(style =>
                style.transitionProperty.includes('opacity') && parseFloat(style.transitionDuration) > 0.1);
        })()`),
        );
        t.check(
            '物价编辑器的两个操作按钮使用无文字阴影的正常字距',
            await cdp.evaluate(`(() => {
                const buttons = document.querySelectorAll('${editor} footer glass-button');
                return buttons.length === 2 && [...buttons].every(button => {
                    const label = button.shadowRoot?.querySelector('[part="label"]');
                    if (!label) return false;
                    const style = getComputedStyle(label);
                    return style.textShadow === 'none' && style.letterSpacing === 'normal';
                });
            })()`),
        );
        t.check(
            '宽窗新增表单居中，窄窗保留底部弹层',
            await cdp.evaluate(`(() => {
                const panel = document.querySelector('${sheet}');
                if (innerWidth < 640) return panel.matches('glass-sheet[data-visible]');
                const box = panel.getBoundingClientRect();
                return panel.matches('dialog:modal') && box.width <= 480 &&
                    Math.abs(box.top - (innerHeight - box.bottom)) <= 2;
            })()`),
        );
        t.check(
            '新增表单的名称、金额和备注共用玻璃输入框',
            await cdp.evaluate(`document.querySelectorAll('${editor} .glass-input input').length === 3 &&
                !!document.querySelector('${editor} .glass-input [inputmode="decimal"]')`),
        );
        await cdp.click(`${editor} footer glass-button:last-child`);
        await ui.waitFor(
            `document.activeElement === document.querySelector('${editor} input[aria-invalid="true"]')`,
        );
        t.check(
            '空名称提交后，焦点和错误提示都指向名称输入框',
            await cdp.evaluate(`(() => {
            const input = document.activeElement;
            return input === document.querySelector('${editor} input') &&
                !!document.getElementById(input.getAttribute('aria-describedby'))?.textContent.trim();
        })()`),
        );
        const initialField = `${editor} .glass-price-field`;
        t.check(
            '初始价可留空，减价在零值时不可用',
            await cdp.evaluate(
                `document.querySelector('${initialField} input').value === '' &&
                !!document.querySelector('${initialField} [aria-label="减 1 万"][disabled]')`,
            ),
        );
        await cdp.click(`${initialField} [aria-label="加 1 万"]`);
        await ui.waitFor(`document.querySelector('${initialField} input').value === '1'`);
        await cdp.click(`${initialField} [aria-label="减 1 万"]`);
        await ui.waitFor(`document.querySelector('${initialField} input').value === ''`);
        const subMenu = `${editor} glass-menu:has([value="__custom_subcategory__"])`;
        const subTrigger = `${subMenu} .glass-select-trigger`;
        await cdp.evaluate(`document.querySelector('${subTrigger}').focus()`);
        await cdp.key('ArrowDown');
        await ui.waitFor(`(() => {
            const menu = document.querySelector('${subMenu}[open]');
            const content = menu?.shadowRoot.querySelector('[part="content"]');
            return content && Number(getComputedStyle(content).opacity) >= 0.99;
        })()`);
        t.check(
            '下拉菜单展开时触发按钮仍显示当前选项',
            await cdp.evaluate(`getComputedStyle(document.querySelector('${subTrigger}')).opacity === '1' &&
                document.querySelector('${subTrigger}').textContent.trim() === '未分类'`),
        );
        await cdp.key('Escape');
        await ui.waitFor(`getComputedStyle(document.querySelector('${subMenu}').shadowRoot
            .querySelector('[part="panel"]')).opacity === '0'`);
        t.check(
            'Esc 只收起分类菜单，并将焦点还给表单里的触发按钮',
            await cdp.evaluate(`!!document.querySelector('${sheet}:is([open], [data-visible])') &&
                !document.querySelector('${subMenu}[open]') &&
                document.activeElement === document.querySelector('${subTrigger}')`),
        );
        await cdp.key('ArrowDown');
        await cdp.key('End');
        await cdp.key('Enter');
        await ui.waitFor(`document.querySelector('${subTrigger}').textContent.trim() === '自定义'`);
        t.check(
            '键盘选择自定义子类后显示输入框',
            await cdp.evaluate(`[...document.querySelectorAll('${editor} label')].some(label =>
                label.textContent.includes('自定义子类') && label.querySelector('input'))`),
        );
    } finally {
        await closeSheet();
    }

    await checkPriceMaintenance({ cdp, t, ui }, sheet, editor);
    const card = `${page} .price-card`;
    const first = await cdp.evaluate(`(() => {
        const card = document.querySelector('${card}');
        return card && {
            name: card.querySelector('h2').textContent.trim(),
            category: card.querySelector('.price-category').textContent.trim(),
            sub: card.querySelector('.price-subcategory')?.textContent.trim() ?? '',
        };
    })()`);
    if (!first) {
        t.check(
            '空账本仅展示空态卡片，仍可从页头新增物品',
            await cdp.evaluate(`document.querySelector('${emptyState}')?.textContent.trim() === '还没有物品，点击右上角新增' &&
                !!document.querySelector('${page} .price-add:not([disabled])') && !document.querySelector('${filters}')`),
        );
        await cdp.click(`${page} .price-add`);
        await ui.waitFor(
            `!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`,
        );
        await closeSheet();
        return;
    }

    t.check(
        '物价标题与搜索框沿用正式版字号，一级分类标签不占行且仍为按钮命名',
        await cdp.evaluate(`(() => {
            const filters = document.querySelector('${filters}');
            const search = filters.querySelector('glass-search').shadowRoot.querySelector('input');
            const title = document.querySelector('#liquid-prices-title');
            const label = filters.querySelector('.glass-select label');
            const trigger = filters.querySelector('.glass-select-trigger');
            return getComputedStyle(title).fontSize === '14.5px' &&
                getComputedStyle(search).fontSize === '13.5px' &&
                label.textContent.trim() === '一级分类' && label.getClientRects().length === 0 &&
                trigger.getAttribute('aria-labelledby').split(' ').includes(label.id);
        })()`),
    );
    t.check(
        '物价卡片将历史放在标题区，价格与记价入口不越过卡片边界',
        await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('${card}')];
        return cards.length > 0 && cards.every(node => {
            const bounds = node.getBoundingClientRect();
            const reading = node.querySelector('.price-reading');
            const history = node.querySelector('.price-card-header .price-history-trigger');
            const update = node.querySelector('.price-card-footer .price-update-trigger');
            return reading && history?.getAttribute('aria-label') && update &&
                [reading, history, update].every(element => {
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right;
                });
        });
    })()`),
    );
    t.check(
        '物价搜索框与分类触发按钮使用等高的胶囊玻璃表面',
        await cdp.evaluate(`(() => {
            const filters = document.querySelector('${filters}');
            const search = filters.querySelector('glass-search');
            const face = filters.querySelector('.glass-select-trigger glass-surface');
            if (!face) return false;
            const height = search.getBoundingClientRect().height;
            return height > 0 && Math.abs(height - face.getBoundingClientRect().height) < 1 &&
                [search, face].every(el => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= height / 2 - 1) &&
                ['material', 'blur', 'shadow', 'specular'].every(attr =>
                    search.getAttribute(attr) === face.getAttribute(attr));
        })()`),
    );
    t.check(
        '未选一级分类时只显示一个分类控件',
        await cdp.evaluate(
            `document.querySelector('${filters} glass-menu-item[checked]').value !== '' ||
            document.querySelectorAll('${filters} glass-menu').length === 1`,
        ),
    );

    // 直接选择已有分类，经过菜单的选择事件，不写入物品或流水。
    const select = async (index, value) => {
        await cdp.evaluate(
            `document.querySelectorAll('${filters} .glass-select-trigger')[${index}].click()`,
        );
        await ui.waitFor(`!!document.querySelector('${filters} glass-menu[open]')`);
        await cdp.evaluate(`[...document.querySelectorAll('${filters} glass-menu[open] glass-menu-item')]
            .find(item => item.value === ${JSON.stringify(value)}).click()`);
    };
    await select(0, first.category);
    if (await ui.exists(`${filters} .glass-select:nth-of-type(2)`)) {
        t.check(
            '二级分类标签不占行，读屏名称仍与当前选项关联',
            await cdp.evaluate(`(() => {
            const group = document.querySelectorAll('${filters} .glass-select')[1];
            const label = group.querySelector('label');
            const trigger = group.querySelector('.glass-select-trigger');
            return label.textContent.trim() === '二级分类' && !label.getClientRects().length &&
                trigger.getAttribute('aria-labelledby').split(' ').includes(label.id);
        })()`),
        );
    }
    if (first.sub) await select(1, first.sub);
    t.check(
        '一级分类与可用的二级分类共同缩小范围',
        await cdp.evaluate(`(() => {
            const cards = [...document.querySelectorAll('${card}')];
            const { category, sub } = ${JSON.stringify(first)};
            return cards.length > 0 && cards.every(one =>
                one.querySelector('.price-category').textContent.trim() === category &&
                (!sub || one.querySelector('.price-subcategory')?.textContent.trim() === sub));
        })()`),
    );

    const reset = `${filters} .price-reset`;
    t.check(
        '仅选择分类也能从最后一个选择器之后重置',
        await cdp.evaluate(
            `document.querySelector('${reset}')?.previousElementSibling?.matches('.lg-category-filter') === true`,
        ),
    );
    const search = `${filters} glass-search`;
    await cdp.click(search);
    await cdp.send('Input.insertText', { text: `不存在的搜索词${Date.now()}` });
    t.check(
        '搜索无匹配时显示筛选结果空态',
        await ui.waitFor(
            `document.querySelector('${emptyState}')?.textContent.trim() === '没有符合条件的物品'`,
        ),
    );
    await cdp.click(reset);
    await ui.waitFor(`!!document.querySelector('${card}') && !document.querySelector('${reset}')`);
    t.check(
        '重置同时清空搜索与两级分类，并收起空态',
        await cdp.evaluate(`document.querySelector('${search}').value === '' &&
            document.querySelectorAll('${filters} glass-menu').length === 1 &&
            document.querySelector('${filters} glass-menu-item[checked]').value === '' &&
            !document.querySelector('${emptyState}')`),
    );
    await cdp.click(search);
    await cdp.send('Input.insertText', { text: first.name });
    await ui.waitFor(`!!document.querySelector('${reset}')`);
    t.check('仅输入关键词时也能重置', await ui.exists(reset));
    await cdp.click(reset);
    await ui.waitFor(`!document.querySelector('${reset}')`);

    await cdp.click(`${card} .price-update-trigger`);
    try {
        await ui.waitFor(
            `!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`,
        );
        t.check(
            '记价时价格在日期上方整行居中，数字和万字一起居中',
            await cdp.evaluate(`(() => {
            const form = document.querySelector('${editor}');
            const field = form.querySelector('.glass-price-field');
            const box = el => el.getBoundingClientRect();
            const center = el => (box(el).left + box(el).right) / 2;
            const well = field.querySelector('.glass-input');
            const input = well.querySelector('input');
            const unit = well.querySelector('.pf-unit');
            return box(field).bottom <= box(form.querySelector('.glass-date-field')).top &&
                Math.abs(center(well) - center(form.querySelector('fieldset'))) < 1.5 &&
                Math.abs(center(well) - (box(input).left + box(unit).right) / 2) < 1.5;
        })()`),
        );
        t.check(
            '卡片记价打开对应物品的更新窗口',
            await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '更新价格' &&
                document.querySelector('${editor} header p').textContent.trim() === ${JSON.stringify(first.name)}`),
        );
    } finally {
        await closeSheet();
    }

    const trigger = `${card} .price-history-trigger`;
    await cdp.click(trigger);
    try {
        await ui.waitFor(
            `!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-history')`,
        );
        t.check(
            '历史弹层显示所选物品和走势及流水，或未记价提示',
            await cdp.evaluate(`(() => {
                const sheet = document.querySelector('${sheet}');
                return sheet.matches('glass-sheet[detents="536"]') &&
                    sheet.querySelector('h2').textContent.trim() === ${JSON.stringify(first.name)} &&
                    (!!sheet.querySelector('.liquid-price-history .glass-empty-state') ||
                        (!!sheet.querySelector('.chart-svg') &&
                            !!sheet.querySelector('table.glass-table.has-sticky-header tbody tr')));
            })()`),
        );
        const next = `${sheet} .price-history-pager [aria-label="下一页"]`;
        const hasSecondPage = await ui.exists(next);
        if (hasSecondPage) {
            t.check(
                '完整页显示五条价格记录',
                await cdp.evaluate(`document.querySelectorAll('${sheet} tbody tr').length === 5`),
            );
            await cdp.click(next);
            await ui.waitFor(
                `document.querySelector('${sheet} .price-history-pager span').textContent.trim().startsWith('2 /')`,
            );
            t.check(
                '下一页切换记录，上一页可用',
                await cdp.evaluate(
                    `document.querySelectorAll('${sheet} tbody tr').length > 0 &&
                    document.querySelectorAll('${sheet} tbody tr').length <= 5 &&
                    !!document.querySelector('${sheet} [aria-label="上一页"]:not([disabled])')`,
                ),
            );
        }
        /* 历史弹窗不再有「记价」入口；下面改用行内「编辑」走同一条取消返回路径，
         * 顺带验页码保留（与原先「取消记价保留历史页码」重复，故删去那一段）。 */
        const edit = `${sheet} tbody .record-edit`;
        if (await ui.exists(edit)) {
            await cdp.click(edit);
            await ui.waitFor(`!!document.querySelector('${editor}')`);
            t.check(
                '历史里的编辑打开已记日期和价格',
                await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '编辑价格记录' &&
                    !!document.querySelector('${editor} .glass-date-field time')?.dateTime &&
                    Number(document.querySelector('${editor} [inputmode="decimal"]').value) > 0 &&
                    !!document.querySelector('${editor} .glass-date-field .glass-input')`),
            );
            await cdp.click(`${editor} footer glass-button[variant="plain"]`);
            await ui.waitFor(`!!document.querySelector('${edit}')`);
            await cdp.click(edit);
            await ui.waitFor(`!!document.querySelector('${editor} input[inputmode="decimal"]')`);
            await cdp.key('Escape');
            await ui.waitFor(`!!document.querySelector('${edit}')`);
            t.check(
                '取消和 Esc 返回历史后保留页码，编辑和关闭按钮文字无阴影',
                await cdp.evaluate(`(() => {
                const sheet = document.querySelector('${sheet}');
                const buttons = sheet.querySelectorAll('.price-history-header glass-button, tbody glass-button');
                return (${!hasSecondPage} || sheet.querySelector('.price-history-pager span').textContent.trim().startsWith('2 /')) &&
                    [...buttons].every(button => getComputedStyle(button).textShadow === 'none');
            })()`),
            );
            for (const gesture of ['遮罩', '下拉']) {
                await ui.waitFor(`!!document.querySelector('${edit}')`);
                await cdp.click(edit);
                await ui.waitFor(`!!document.querySelector('${editor}')`);
                if (gesture === '遮罩') {
                    await cdp.evaluate(
                        `document.querySelector('${sheet}').shadowRoot.querySelector('[part="scrim"]').click()`,
                    );
                } else {
                    const { x, y, bottom } = await cdp.evaluate(`(() => {
                        const grip = document.querySelector('${sheet}').shadowRoot.querySelector('[part="grabber"]').getBoundingClientRect();
                        return { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2, bottom: innerHeight - 2 };
                    })()`);
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'left',
                        buttons: 1,
                        clickCount: 1,
                    });
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved',
                        x,
                        y: bottom,
                        buttons: 1,
                    });
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y: bottom,
                        button: 'left',
                        clickCount: 1,
                    });
                }
                await ui.waitFor(
                    `!!document.querySelector('${sheet}[open] .price-history-header')`,
                );
                t.check(
                    gesture + '关闭编辑时回到原历史页码',
                    await cdp.evaluate(`
                    !!document.querySelector('${edit}') && (${!hasSecondPage} ||
                    document.querySelector('${sheet} .price-history-pager span').textContent.trim().startsWith('2 /'))`),
                );
            }
            if (hasSecondPage) {
                await cdp.click(`${sheet} [aria-label="上一页"]`);
                await ui.waitFor(
                    `!!document.querySelector('${sheet} [aria-label="上一页"][disabled]')`,
                );
            }
        }
    } finally {
        await closeSheet();
    }
    t.check(
        'Esc 关闭历史并把焦点还给打开历史的按钮',
        await cdp.evaluate(`document.activeElement === document.querySelector('${trigger}')`),
    );
}

export default async function liquidShell({ cdp, t, ui }) {
    t.section('Liquid Glass 应用壳');
    const dock = '.liquid-dock';
    const tab = (key) => `${dock} glass-tab[value="${key}"]`;
    const dockSettled = "!document.querySelector('.liquid-page-pane[inert]')";
    const ready = (key) =>
        `location.hash === '#/${key}' && !!document.querySelector('${tab(key)}[aria-selected="true"]') && ${dockSettled}`;
    // 组件目录没有 Dock 标签，只认地址与页面内容；入口是连点设置五次。
    const atComponents = () =>
        "location.hash === '#/components' && !!document.querySelector('.component-catalog')";
    const tapSettings = (count) =>
        cdp.evaluate(`(() => {
            const item = document.querySelector('${tab('settings')}');
            for (let i = 0; i < ${count}; i++) item.click();
        })()`);

    await ui.waitFor(`!!document.querySelector('${dock} glass-tab[role="tab"]')`);
    t.check(
        'Dock 复用标签栏透镜和原菜单顺序，组件目录不出现在用户界面',
        await cdp.evaluate(`(() => {
            const nav = document.querySelector('${dock}');
            const bar = nav.querySelector('glass-tab-bar');
            return [...bar.querySelectorAll('glass-tab')].map(item => item.value).join(',') ===
                'overview,income,accounts,characters,prices,goals,tools,settings' &&
                !nav.querySelector('glass-tab[value="components"]') &&
                getComputedStyle(nav).position === 'fixed' &&
                bar.getBoundingClientRect().height <= 50 &&
                !!bar.shadowRoot?.querySelector('[part="lens"]');
        })()`),
    );

    await cdp.click(tab('overview'));
    await ui.waitFor(ready('overview'));
    await ui.waitFor(`!!document.querySelector('.liquid-overview .overview-periods')`);
    t.check(
        '总览读取账本，展示周月统计、趋势、队伍与在途目标',
        await cdp.evaluate(`(() => {
            const page = document.querySelector('.liquid-overview');
            const trend = page.querySelector('.overview-trend');
            const goals = page.querySelector('.overview-goal-card');
            const amount = page.querySelector('.workbench-metrics dd');
            const scrollHost = page.closest('.liquid-content');
            const plotScroll = trend.querySelector('.chart-scroll');
            const actions = page.querySelector('.workbench-shortcuts .workbench-actions');
            const periods = page.querySelector('.overview-periods');
            const cards = [...periods.querySelectorAll(':scope > glass-surface')];
            const trendStyle = getComputedStyle(trend);
            return !page.querySelector('[role="alert"]') &&
                !page.querySelector('.online-count') &&
                trendStyle.paddingTop === trendStyle.paddingRight &&
                trendStyle.paddingRight === trendStyle.paddingBottom &&
                trendStyle.paddingBottom === trendStyle.paddingLeft &&
                cards.length === 3 && !periods.closest('glass-surface') &&
                Math.abs(cards[0].getBoundingClientRect().width - cards[1].getBoundingClientRect().width) < 1 &&
                actions.closest('glass-surface') === cards[2] &&
                [...actions.querySelectorAll('glass-button')].every(button =>
                    button.getBoundingClientRect().width < actions.clientWidth) &&
                (periods.clientWidth < 774 || cards.every((card) =>
                    Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 1)) &&
                page.querySelectorAll('.workbench-metrics > div').length === 4 &&
                page.querySelectorAll('.month-ledger tbody tr').length === 2 &&
                page.querySelectorAll('.month-ledger td').length === 4 &&
                goals.querySelectorAll('.overview-goals li').length === goals.querySelectorAll('[role="progressbar"][aria-valuenow]').length &&
                !!trend.querySelector('.trend, .overview-note') &&
                !!page.querySelector('section[aria-label="我的队伍"]') &&
                goals.querySelector('#overview-goals-title')?.textContent.trim() === '目标' &&
                getComputedStyle(amount).color === getComputedStyle(page).color &&
                getComputedStyle(amount).fontWeight === '400' &&
                getComputedStyle(scrollHost).scrollbarWidth === 'none' &&
                (!plotScroll || getComputedStyle(plotScroll).scrollbarWidth === 'none') &&
                (innerWidth <= 620 || trend.getBoundingClientRect().top === goals.getBoundingClientRect().top);
        })()`),
    );

    await cdp.click(tab('prices'));
    await ui.waitFor(ready('prices'));
    await checkPrices({ cdp, t, ui });
    const scrollTop = await cdp.evaluate(`(() => {
        const main = document.querySelector('.liquid-content');
        main.scrollTop = Math.min(140, main.scrollHeight - main.clientHeight);
        return main.scrollTop;
    })()`);
    if (scrollTop > 0) {
        await cdp.click(tab('settings'));
        await ui.waitFor(ready('settings'));
        await cdp.click(tab('prices'));
        await ui.waitFor(
            `!!document.querySelector('.liquid-prices .price-card, .liquid-prices .price-empty')`,
        );
        t.check(
            'Dock 返回物价恢复原列表位置',
            await cdp.evaluate(
                `Math.abs(document.querySelector('.liquid-content').scrollTop - ${scrollTop}) < 1`,
            ),
        );
    }

    await cdp.click(tab('overview'));
    await ui.waitFor(
        `${ready('overview')} && !!document.querySelector('[aria-label="选择角色上线"]')`,
    );
    // 在页面容器出现时记录动画，业务内容可能在下一帧才挂载。
    await cdp.evaluate(`(() => {
        const stage = document.querySelector('.liquid-page-stage');
        const bar = document.querySelector('.liquid-dock-bar');
        window.__dockHandoff = undefined;
        const observer = new MutationObserver(() => {
            if (location.hash !== '#/income' || !stage.querySelector('.liquid-content[data-dock-entry]')) return;
            const parts = bar.shadowRoot.querySelectorAll('[part="indicator"], [part="lens"]');
            const panes = stage.querySelectorAll('.liquid-page-pane');
            window.__dockHandoff = [...panes, ...parts].flatMap(el =>
                el.getAnimations().filter(motion => motion.id === 'liquid-dock-slide'));
            observer.disconnect();
        });
        observer.observe(stage, { childList: true, subtree: true });
    })()`);
    await cdp.click(tab('income'));
    await ui.waitFor(`${ready('income')} && !!document.querySelector('.liquid-income-page')`);
    t.check(
        'Dock 选中胶囊与新旧页面共用起点、时长和缓动，降动效时直接切换',
        await cdp.evaluate(`(() => {
        const motions = window.__dockHandoff;
        delete window.__dockHandoff;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return motions?.length === 0;
        if (motions?.length !== 4 || motions[0].startTime === null) return false;
        const timing = motions[0].effect.getTiming();
        return motions.every(motion => motion.startTime === motions[0].startTime &&
            motion.effect.getTiming().duration === timing.duration && motion.effect.getTiming().easing === timing.easing);
    })()`),
    );
    t.check(
        'Dock 从总览切到右侧的收益页，由右入场',
        await cdp.evaluate(`
        document.querySelector('.liquid-content').dataset.dockEntry === 'right'
    `),
    );
    await cdp.evaluate(`(() => {
        const bar = document.querySelector('.liquid-dock-bar');
        for (const key of ['Home', 'End', 'Home']) {
            bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        }
    })()`);
    await ui.waitFor(`${ready('overview')} && !!document.querySelector('.liquid-content [aria-label="选择角色上线"]') &&
        !document.querySelector('.liquid-page-pane[inert]')`);
    t.check(
        'Dock 连续改选后停在最后选中的总览页',
        await cdp.evaluate(`
        document.querySelector('.liquid-dock-bar').getAttribute('value') === 'overview' &&
        document.querySelectorAll('.liquid-page-pane').length === 1
    `),
    );
    t.check(
        'Dock 从收益切回左侧的总览，由左入场',
        await cdp.evaluate(`
        document.querySelector('.liquid-content').dataset.dockEntry === 'left'
    `),
    );
    await cdp.click('[aria-label="选择角色上线"]');
    await ui.waitFor(ready('income'));
    const income = '.liquid-income-page';
    const incomeDialog = '.liquid-income .modal-panel:not([inert])';
    const waitIncomeDialog = (title) =>
        ui.waitFor(`document.querySelector('${incomeDialog} h2')?.textContent === '${title}'`);
    await waitIncomeDialog('开始计时');
    t.check(
        '总览快捷入口打开弹窗时不叠加页面动画，且已消费路由动作',
        await cdp.evaluate(`
        !document.querySelector('.liquid-content').hasAttribute('data-dock-entry') && ${ready('income')}
    `),
    );
    t.check(
        '总览上线打开收益计时，角色支持全选',
        await cdp.evaluate(`(() => {
        const dialog = document.querySelector('${incomeDialog}');
        return Array.from(dialog.querySelectorAll('.glass-multi-option')).some((option) =>
            option.textContent.trim() === '全部' && !!option.querySelector('input[type="checkbox"]')) &&
            !!dialog.querySelector('.glass-input input[maxlength="40"]');
    })()`),
    );
    await cdp.click(`${incomeDialog} [data-modal-close]`);
    await ui.waitFor(`!document.querySelector('${incomeDialog}')`);
    t.check(
        '收益顶部并列三张玻璃卡，角色计时、点卡和记录操作留在角色卡',
        await cdp.evaluate(`(() => {
        const top = document.querySelector('${income} .online-bar-glass');
        const cards = [...(top?.children ?? [])];
        const roles = cards[2];
        return cards.length === 3 && cards.every((card) => card.matches('glass-surface')) &&
            cards[0].matches('.online-summary.stats-glass.stats-centered') &&
            cards[0].querySelector('h3')?.textContent.trim() === '今日在线' &&
            cards[1].matches('.income-summary.stats-glass.stats-centered') &&
            cards[1].querySelector('h3')?.textContent.trim() === '今日收益' &&
            roles.querySelector('h2')?.textContent.trim() === '角色记录' &&
            !!roles.querySelector('glass-button.price-tag') &&
            !!roles.querySelector('glass-switch.lg-small-switch[aria-label="点卡计入账号收支"]') &&
            [...roles.querySelectorAll('.role-item')].every((role) => {
                const action = role.querySelector('glass-button.role-start[size="small"]');
                if (!action) return false;
                const label = action.getAttribute('aria-label') ?? '';
                const running = role.matches('.is-running');
                return label.startsWith(running ? '结束 ' : '快速上线 ') &&
                    !!action.querySelector('svg.role-icon') &&
                    !!action.querySelector('.role-state') === running;
            });
    })()`),
    );
    t.check(
        '收益主界面保留物品速记、今日速记和走势图',
        await cdp.evaluate(`(() => {
        const page = document.querySelector('${income}');
        const headings = Array.from(page.querySelectorAll('h2, h3'), (node) => node.textContent.trim());
        const charts = [...page.querySelectorAll('.income-trends .chart-block')];
        const target = page.querySelector('.quick-panel .targets');
        return page.querySelectorAll('glass-surface.ledger-section').length === 5 &&
            charts.length === 2 && charts.every((chart) => !chart.parentElement.closest('glass-surface')) &&
            !!target.querySelector('glass-segmented[data-size="compact"][aria-label="指定人"]') &&
            getComputedStyle(target).overflowX === 'auto' &&
            getComputedStyle(target).scrollbarWidth === 'none' &&
            !headings.includes('每日走势') &&
            charts.every((card) => !!card.querySelector('.section-head glass-segmented')) &&
            ['物品速记', '今日速记', '每日时长', '每日收益'].every((text) => headings.includes(text));
    })()`),
    );
    for (const [selector, title] of [
        ['[aria-label="查看历史收益，按角色与按天"]', '历史收益'],
        ['[aria-label="查看全部上线记录"]', '上线记录'],
        ['[aria-label="补记一段已经过去的在线时长"]', '补记一段'],
        ['.price-tag', '点卡单价'],
    ]) {
        await cdp.click(`${income} ${selector}`);
        await waitIncomeDialog(title);
        t.check(
            `收益可打开${title}并使用右上角关闭`,
            await cdp.evaluate(`!!document.querySelector('${incomeDialog} [data-modal-close]')`),
        );
        if (title === '历史收益' || title === '上线记录') {
            t.check(
                `${title}复用玻璃日期、角色筛选与表格`,
                await cdp.evaluate(`(() => {
                const dialog = document.querySelector('${incomeDialog}');
                const table = dialog.querySelector('table');
                return dialog.querySelectorAll('.glass-date-field').length === 2 &&
                    !!dialog.querySelector('glass-segmented.income-role-filter') &&
                    (!table || table.matches('.glass-table.has-sticky-header')) &&
                    !dialog.querySelector('[aria-label="关闭历史收益"], [aria-label="关闭上线记录"]');
            })()`),
            );
        }
        if (title === '上线记录') {
            t.check(
                '玻璃上线记录移除关键词搜索',
                await cdp.evaluate(`
                    !document.querySelector('${incomeDialog} :is(.filter-search, [aria-label="搜索上线记录"])')
                `),
            );
        }
        if (title === '补记一段') {
            t.check(
                '补记使用玻璃多选、日期和时间输入',
                await cdp.evaluate(`(() => {
                const dialog = document.querySelector('${incomeDialog}');
                return !!dialog.querySelector('.glass-multi-select') &&
                    !!dialog.querySelector('.glass-date-field') &&
                    dialog.querySelectorAll('.time-control.is-glass').length === 2;
            })()`),
            );
        }
        if (title === '历史收益') await cdp.click(`${incomeDialog} [data-modal-close]`);
        else await cdp.key('Escape');
        await ui.waitFor(`!document.querySelector('.liquid-income.modal-mask') &&
            document.querySelector('.liquid-content').style.overflow !== 'hidden'`);
    }
    const durationRange = `${income} [aria-label="每日时长范围"]`;
    const earningsRange = `${income} [aria-label="每日收益范围"]`;
    const trendMonth = `${durationRange} glass-segment[value="month"]`;
    const trendSize = () =>
        cdp.evaluate(`
        [...document.querySelectorAll('${income} .chart-block')].map((card) => {
            const plot = card.querySelector('.chart');
            return { width: card.getBoundingClientRect().width, height: plot.getBoundingClientRect().height };
        })
    `);
    const weekSize = await trendSize();
    await cdp.click(trendMonth);
    await ui.waitFor(
        `document.querySelector('${trendMonth}')?.getAttribute('aria-selected') === 'true'`,
    );
    t.check(
        '每日时长切到近一月时，每日收益同步更新范围',
        await cdp.evaluate(`document.querySelector('${income} .chart-section').textContent.includes('30 天') &&
            !!document.querySelector('${earningsRange} glass-segment[value="month"][aria-selected="true"]')`),
    );
    const monthSize = await trendSize();
    const trendWeek = `${earningsRange} glass-segment[value="week"]`;
    await cdp.click(trendWeek);
    await ui.waitFor(
        `document.querySelector('${trendWeek}')?.getAttribute('aria-selected') === 'true'`,
    );
    const restoredSize = await trendSize();
    t.check(
        '周月切换不撑大走势卡片，绘图区保持原高度',
        weekSize.length === 2 &&
            [monthSize, restoredSize].every(
                (sizes) =>
                    sizes.length === weekSize.length &&
                    sizes.every(
                        (size, index) =>
                            Math.abs(size.width - weekSize[index].width) < 1 &&
                            Math.abs(size.height - weekSize[index].height) < 1,
                    ),
            ),
    );

    const variableItem = `${income} .grid:has(.item):last-child .item`;
    await cdp.click(variableItem);
    await ui.waitFor(`!!document.querySelector('${incomeDialog} .price-field input')`);
    await cdp.key('Escape');
    await ui.waitFor(`!document.querySelector('${incomeDialog}')`);

    await cdp.click(tab('overview'));
    await ui.waitFor(ready('overview'));
    const addEntry = '[aria-label="记一笔账号收支"]';
    const warehouse = '[aria-label="打开装备和召唤兽仓库"]';
    await ui.waitFor(`!!document.querySelector('${addEntry}')`);
    await cdp.click(addEntry);
    await ui.waitFor(ready('accounts'));
    const accounts = '.liquid-ledger-page.liquid-accounts';
    const accountMask = '.liquid-accounts.modal-mask';
    const accountDialog = `${accountMask} .modal-panel:not([inert])`;
    const waitAccountDialog = (title) =>
        ui.waitFor(`document.querySelector('${accountDialog} h2')?.textContent === '${title}'`);
    const closeAccountDialog = () => cdp.click(`${accountDialog} [data-modal-close]`);
    const waitAccountClosed = () => ui.waitFor(`!document.querySelector('${accountMask}')`);

    await waitAccountDialog('记一笔');
    const accountPrice = `${accountDialog} .glass-price-field`;
    const accountCurrency = `${accountDialog} glass-segmented[aria-label="记账币种"]`;
    t.check(
        '记账价格单独一行居中，币种、方向和角色使用分段单选',
        await cdp.evaluate(`(() => {
        const form = document.querySelector('${accountDialog} form');
        const currency = document.querySelector('${accountCurrency}').getBoundingClientRect();
        const field = form.querySelector('.glass-price-field .glass-input').getBoundingClientRect();
        const body = form.querySelector('fieldset').getBoundingClientRect();
        const roles = form.querySelector('glass-segmented[aria-label="这笔账记给哪个角色"]');
        return currency.bottom <= field.top && Math.abs(field.left + field.right - body.left - body.right) < 2 &&
            form.querySelector('.pf-unit')?.textContent === '元' &&
            !!form.querySelector('glass-segmented[aria-label="收支方向"]') &&
            roles?.querySelector('glass-segment[aria-selected="true"]')?.textContent.trim() === '不指定' &&
            form.querySelectorAll('.glass-select').length === 2;
    })()`),
    );
    await ui.fillSel(`${accountPrice} input.pf-input`, '12.34');
    await cdp.click(`${accountPrice} [aria-label="加 1 元"]`);
    t.check(
        '人民币价格加一元保留分',
        await ui.waitFor(`document.querySelector('${accountPrice} input').value === '13.34'`),
    );
    await cdp.click(`${accountCurrency} glass-segment[value="cash"]`);
    await cdp.click(`${accountPrice} [aria-label="加 1 万"]`);
    t.check(
        '切换梦幻币后按万输入并以万递增',
        await ui.waitFor(
            `document.querySelector('${accountPrice} .pf-unit').textContent === '万' &&
         document.querySelector('${accountPrice} input').value === '14.34'`,
        ),
    );
    await ui.fillSel(`${accountPrice} input.pf-input`, '');
    await cdp.click(`${accountCurrency} glass-segment[value="rmb"]`);
    await cdp.click(`${accountDialog} .glass-date-field .date-trigger`);
    const datePanel = `${accountDialog} .date-panel:popover-open`;
    await ui.waitFor(`!!document.querySelector('${datePanel}[data-ready]')`);
    await cdp.key('Escape');
    await ui.waitFor(`!document.querySelector('${datePanel}')`);
    await waitAccountDialog('记一笔');
    await closeAccountDialog();
    await waitAccountClosed();
    const accountRange = `${accounts} [data-book-currency="rmb"] glass-segmented[aria-label="人民币时间范围"]`;
    const cashRange = `${accounts} [data-book-currency="cash"] glass-segmented[aria-label="梦幻币时间范围"]`;
    await cdp.click(`${accountRange} glass-segment[value="week"]`);
    t.check(
        '人民币切换到近七天时梦幻币仍查看本月',
        await ui.waitFor(
            `!!document.querySelector('${accountRange} glass-segment[value="week"][aria-selected="true"]') &&
         !!document.querySelector('${cashRange} glass-segment[value="month"][aria-selected="true"]')`,
        ),
    );
    await cdp.click(`${accountRange} glass-segment[value="month"]`);
    t.check(
        '收支概览直接并排展示两张等宽玻璃卡',
        await cdp.evaluate(`(() => {
        const section = document.querySelector('${accounts} .account-overview');
        const books = section.querySelectorAll(':scope > glass-surface[data-book-currency]');
        if (section.closest('glass-surface') || books.length !== 2) return false;
        const [first, last] = Array.from(books, book => book.getBoundingClientRect());
        return first.width > 0 && first.right <= last.left && Math.abs(first.top - last.top) < 1 &&
            Math.abs(first.width - last.width) < 1 &&
            Array.from(books).every(book => {
                const cells = Array.from(book.querySelectorAll('[data-stat-id]'));
                const boxes = cells.map(cell => cell.getBoundingClientRect());
                return book.querySelector('h3')?.textContent === (book.dataset.bookCurrency === 'rmb' ? '人民币' : '梦幻币') &&
                    cells.length === 3 && cells.every((cell, index) =>
                        Math.abs(boxes[index].width - boxes[0].width) < 1 &&
                        Math.abs(boxes[index].top - boxes[0].top) < 1 &&
                        getComputedStyle(cell).textAlign === 'center' &&
                        parseFloat(getComputedStyle(cell).paddingBlockStart) > 0 &&
                        getComputedStyle(cell).paddingBlockStart === getComputedStyle(cell).paddingBlockEnd &&
                        (parseFloat(getComputedStyle(cell, '::before').borderInlineStartWidth) > 0) === (index > 0));
            });
    })()`),
    );
    t.check(
        '快捷记账长金额按币种换行且完整落在按钮内',
        await cdp.evaluate(`(() => {
        const button = document.querySelector('${accounts} glass-button.shortcut');
        const values = Array.from(button.querySelectorAll('.sc-value'));
        const original = values.map(value => value.textContent);
        try {
            values[0].textContent = '123,456,789,012.34 万';
            values[1].textContent = '987,654,321,098.76 元';
            const bounds = button.getBoundingClientRect();
            const [cash, rmb] = values.map(value => value.parentElement.getBoundingClientRect());
            return cash.bottom <= rmb.top && values.every(value => {
                const range = document.createRange();
                range.selectNodeContents(value);
                return Array.from(range.getClientRects()).every(rect =>
                    rect.left >= bounds.left && rect.right <= bounds.right + 1 &&
                    rect.top >= bounds.top && rect.bottom <= bounds.bottom + 1);
            });
        } finally {
            values.forEach((value, index) => { value.textContent = original[index]; });
        }
    })()`),
    );
    t.check(
        '账号保留双币种、快捷记账、收支图表和近期记录',
        await cdp.evaluate(`(() => {
        const page = document.querySelector('${accounts}');
        return page.querySelectorAll('[data-book-currency]').length === 2 &&
            !!page.querySelector('glass-button.shortcut[radius="10"] .sc-total') &&
            !!page.querySelector('.channel-card .bar-chart') &&
            !!page.querySelector('glass-segmented[aria-label="渠道收支币种"]') &&
            !!page.querySelector('glass-segmented[aria-label="角色收支币种"]') &&
            !!page.querySelector('.records') &&
            page.querySelectorAll('.account-charts .trend.chart-in-card').length === 1 &&
            getComputedStyle(page.closest('.liquid-content')).scrollbarWidth === 'none';
    })()`),
    );

    const trendCurrency = `${accounts} [aria-label="收支走势币种"]`;
    await cdp.click(`${trendCurrency} glass-segment[value="cash"]`);
    t.check(
        '同一走势区切换到梦幻币读数',
        await ui.waitFor(`(() => {
        const charts = document.querySelectorAll('${accounts} .account-charts .trend');
        return charts.length === 1 && (!!charts[0].querySelector('svg[aria-label^="梦幻币收支"]') ||
            charts[0].textContent.includes('暂无梦幻币收支记录'));
    })()`),
    );
    await cdp.click(`${accounts} [aria-label="查看账号历史记录"]`);
    await waitAccountDialog('历史记录');
    await cdp.click(`${accountDialog} [aria-label="展开或收起账号筛选"]`);
    t.check(
        '账号历史可展开组合筛选并保留双币种汇总',
        await cdp.evaluate(`(() => {
        const panel = document.querySelector('${accountDialog}');
        const footer = panel.querySelector('.modal-foot');
        const pager = footer?.querySelector('.record-page-buttons');
        const centered = !footer || (pager && Math.abs(
            pager.getBoundingClientRect().left + pager.getBoundingClientRect().right -
            footer.getBoundingClientRect().left - footer.getBoundingClientRect().right
        ) <= 2);
        return !!panel.querySelector('[aria-expanded="true"][aria-controls]') &&
            centered && !panel.querySelector('.record-foot-note') &&
            !!panel.querySelector('glass-search[aria-label="搜索记录"]') &&
            panel.querySelectorAll('.account-record-filter-grid .glass-select').length === 6 &&
            panel.querySelectorAll('.account-record-summary glass-surface.account-record-total').length === 2 &&
            [...panel.querySelectorAll('.account-record-total')].every(card =>
                ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].every(side =>
                    parseFloat(getComputedStyle(card)[side]) >= 18)) &&
            !!panel.querySelector('.record-table-frame > .income-log-scroll');
    })()`),
    );
    await closeAccountDialog();
    await waitAccountClosed();

    const automaticRecord = `${accounts} .recent-row[aria-label$="，查看详情"]`;
    if (await ui.exists(automaticRecord)) {
        const expected = await cdp.evaluate(
            `document.querySelector('${automaticRecord} .recent-amount').textContent.trim()`,
        );
        await cdp.click(automaticRecord);
        await waitAccountDialog('账目详情');
        t.check(
            '自动账详情显示与最近记录一致的带符号金额、日期和来源',
            await cdp.evaluate(`(() => {
            const panel = document.querySelector('${accountDialog}');
            return panel.querySelector('.detail-amount')?.textContent.trim() === ${JSON.stringify(expected)} &&
                !!panel.querySelector('.detail-summary time[datetime]') &&
                panel.querySelector('.detail-fields')?.textContent.includes('收益页自动同步') &&
                !!panel.querySelector('[aria-label="前往收益页修改原始记录"]');
        })()`),
        );
        await closeAccountDialog();
        await waitAccountClosed();
    }
    await cdp.click(`${accounts} glass-button.shortcut[aria-label^="卖出装备"]`);
    await waitAccountDialog('记一笔');
    const assetSwitch = `${accountDialog} glass-switch[aria-label="是否关联仓库物品"]`;
    const feeSwitch = `${accountDialog} glass-switch[aria-label="手续费"]`;
    await cdp.click(assetSwitch);
    t.check(
        '卖出装备继续提供手续费和仓库关联',
        await cdp.evaluate(`
        document.querySelector('${feeSwitch}').checked && document.querySelector('${assetSwitch}').checked &&
        !!document.querySelector('${accountDialog} [aria-label="录入交易物品"]')
    `),
    );
    await cdp.click(`${accountDialog} [aria-label="设置交易关联物品"]`);
    await waitAccountDialog('选择卖出的装备');
    await closeAccountDialog();
    await waitAccountDialog('记一笔');
    await cdp.click(assetSwitch);
    await cdp.click(feeSwitch);
    t.check(
        '关闭手续费后改填实得金额',
        await ui.exists(`${accountPrice} input[aria-label="实得金额，以元为单位"]`),
    );
    await cdp.click(feeSwitch);
    await closeAccountDialog();
    await waitAccountClosed();

    await cdp.click(tab('overview'));
    await ui.waitFor(ready('overview'));
    await ui.waitFor(`!!document.querySelector('${warehouse}')`);
    await cdp.click(warehouse);
    await ui.waitFor(ready('accounts'));
    await waitAccountDialog('仓库');
    const stock = `${accountDialog} [aria-label="仓库状态"]`;
    t.check(
        '仓库分类与状态标签单行排列，入仓按钮使用普通玻璃材质',
        await cdp.evaluate(`(() => {
        const panel = document.querySelector('${accountDialog}');
        const labels = panel.querySelectorAll('.lg-status-tabs > glass-segment');
        const add = panel.querySelector('[data-warehouse-add]');
        return labels.length === 6 && Array.from(labels).every(label =>
            getComputedStyle(label).whiteSpace === 'nowrap'
        ) && !!add && !add.hasAttribute('tint') && add.getAttribute('variant') !== 'prominent';
    })()`),
    );
    await cdp.click(`${stock} glass-segment[value="sold"]`);
    t.check(
        '已售出仓位支持浏览，录入入口随状态隐藏',
        await cdp.evaluate(`
        !!document.querySelector('${stock} glass-segment[value="sold"][aria-selected="true"]') &&
        !document.querySelector('${accountDialog} [data-warehouse-add]')
    `),
    );
    await cdp.click(`${stock} glass-segment[value="all"]`);
    await cdp.click(`${accountDialog} [aria-label="仓库分类"] glass-segment[value="pet"]`);
    t.check(
        '召唤兽仓库无搜索框，浏览时底栏仅用于翻页',
        await cdp.evaluate(`(() => {
        const panel = document.querySelector('${accountDialog}');
        const footer = panel.querySelector('.warehouse-list-actions');
        return !!panel.querySelector('[data-modal-close]') &&
            !panel.querySelector('.warehouse-filters input, .warehouse-filters glass-input') &&
            (!footer || (footer.children.length === 1 && footer.firstElementChild.matches('.record-pager')));
    })()`),
    );
    await cdp.click(`${accountDialog} [aria-label="新增或截图录入召唤兽"]`);
    await waitAccountDialog('召唤兽入仓');
    await ui.waitFor(`!!document.querySelector('${accountDialog} .pet-screenshot')`);
    await closeAccountDialog();
    await waitAccountDialog('仓库');
    await closeAccountDialog();
    await waitAccountClosed();

    await cdp.click(tab('characters'));
    await ui.waitFor(ready('characters'));
    const characters = '.liquid-ledger-page.liquid-characters';
    const characterMask = '.liquid-characters.modal-mask';
    const characterDialog = `${characterMask} .modal-panel:not([inert])`;
    const waitCharacterDialog = (title) =>
        ui.waitFor(`document.querySelector('${characterDialog} h2')?.textContent === '${title}'`);
    const closeCharacterDialog = () => cdp.click(`${characterDialog} [data-modal-close]`);
    const waitCharacterClosed = () => ui.waitFor(`!document.querySelector('${characterMask}')`);
    const newCharacter = `${characters} [aria-label="新建角色"]`;
    await ui.waitFor(`!!document.querySelector('${newCharacter}:not([disabled])')`);
    t.check(
        '角色页头的历史、仓库和新增按钮同排，新增使用默认材质',
        await cdp.evaluate(`(() => {
        const add = document.querySelector('${newCharacter}');
        const buttons = add.closest('.liquid-ledger-actions').querySelectorAll('glass-button');
        const top = add.getBoundingClientRect().top;
        return buttons.length === 3 && add.getAttribute('variant') !== 'prominent' &&
            Array.from(buttons).every(button => Math.abs(button.getBoundingClientRect().top - top) < 1);
    })()`),
    );
    await cdp.click(newCharacter);
    await waitCharacterDialog('新角色');
    const sections = `${characterDialog} glass-segmented[aria-label="修改分区"] > glass-segment`;
    const screenshotLayout = (file) =>
        cdp.evaluate(`(() => {
        const upload = document.querySelector('${characterDialog} ${file}')?.closest('.screenshot-upload');
        if (!upload?.getClientRects().length) return false;
        const body = upload.closest('.modal-body');
        const style = getComputedStyle(body);
        const width = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const left = upload.querySelector('.upload-preview').getBoundingClientRect();
        const right = upload.querySelector('.upload-detail').getBoundingClientRect();
        const bounds = body.getBoundingClientRect();
        const equalMargins = Math.abs((left.left - bounds.left) - (bounds.right - right.right)) < 1;
        if (!left.width || !right.width || !equalMargins) return false;
        const leftColumn = upload.querySelector('.upload-left').getBoundingClientRect();
        const tabs = body.querySelector('.ocr-tabs[data-size="compact"]')?.getBoundingClientRect();
        if (!tabs || Math.abs(tabs.left - left.left) >= 1 || Math.abs(tabs.right - left.right) >= 1) return false;
        if (width <= 639) return right.top >= leftColumn.bottom && Math.abs(left.width - right.width) < 1;
        const rosterCard = document.querySelector('${characters} .roster-card');
        const fitsCard = !rosterCard || right.width <= rosterCard.getBoundingClientRect().width + 1;
        return fitsCard && Math.abs(left.width - right.width) < 1 &&
            right.left >= left.right && Math.abs(right.top - leftColumn.top) < 1;
    })()`);
    t.check(
        '角色编辑内层表面在明暗主题下均有有效颜色',
        await cdp.evaluate(`(() => {
        const app = document.querySelector('.liquid-app');
        const root = document.querySelector('${characterDialog}.character-theme');
        if (!root) return false;
        const original = app.dataset.appearance;
        try {
            const colors = ['light', 'dark'].map(theme => {
                app.dataset.appearance = theme;
                const style = getComputedStyle(root);
                return ['--slip-base', '--card-bg', '--tile-face-hover'].map(name =>
                    style.getPropertyValue(name).trim());
            });
            return colors.flat().every(value => value && CSS.supports('background', value));
        } finally {
            app.dataset.appearance = original;
        }
    })()`),
    );
    try {
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
        });
        await cdp.evaluate(`document.querySelector('${sections}[aria-selected="true"]').focus()`);
        await cdp.key('ArrowRight');
        t.check(
            '降动效时方向键仍可切换到师门',
            await ui.waitFor(
                `document.querySelector('${sections}[aria-selected="true"]')?.textContent.trim() === '师门' &&
                !!document.querySelector('${characterDialog} [aria-label="师门截图文件"]')`,
            ),
        );
        await cdp.key('ArrowLeft');
    } finally {
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    }
    t.check(
        '新角色保留六个编辑分区和角色属性识别入口',
        await cdp.evaluate(`
        document.querySelectorAll('${sections}').length === 6 &&
        ['角色名', '角色等级', '区服', '角色帮派', '当前经验', '升级所需经验'].every(label =>
            document.querySelector('${characterDialog} .glass-compact-number-field input[aria-label="' + label + '"]')
        ) &&
        !!document.querySelector('${characterDialog} .identity-school.glass-select') &&
        !!document.querySelector('${characterDialog} [aria-label="属性截图文件"]')
    `),
    );
    t.check(
        '属性截图与表单按弹窗可用宽度排列',
        await screenshotLayout('[aria-label="属性截图文件"]'),
    );
    for (const [section, kind, selector] of [
        [5, '装备', 'input[aria-label="装备截图文件"]'],
        [6, '召唤兽', 'input[aria-label="召唤兽截图文件"]'],
    ]) {
        await cdp.click(`${sections}:nth-of-type(${section})`);
        const picker = `${characterDialog} [aria-label="从仓库选择${kind}"]`;
        await ui.waitFor(`!!document.querySelector('${picker}')`);
        t.check(
            `角色${kind}分区保留截图识别入口`,
            await cdp.evaluate(`
            !!document.querySelector('${characterDialog} ${selector}')
        `),
        );
        t.check(`${kind}截图与详情按弹窗可用宽度排列`, await screenshotLayout(selector));
        await cdp.click(picker);
        await waitCharacterDialog(`从仓库选择${kind}`);
        await closeCharacterDialog();
        await waitCharacterDialog('新角色');
    }
    await closeCharacterDialog();
    await waitCharacterClosed();

    const quick = `${characters} .roster-card .slip-row.quickable`;
    if (await cdp.evaluate(`!!document.querySelector('${quick}')`)) {
        await cdp.click(quick);
        await ui.waitFor(`!!document.querySelector('${characterDialog} input')`);
        await closeCharacterDialog();
        await waitCharacterClosed();
    }
    await cdp.click(`${characters} [aria-label="查看角色成长历史"]`);
    await waitCharacterDialog('成长历史');
    await closeCharacterDialog();
    await waitCharacterClosed();
    await cdp.click(`${characters} [aria-label="打开装备和召唤兽仓库"]`);
    await waitCharacterDialog('仓库');
    await closeCharacterDialog();
    await waitCharacterClosed();

    const goals = '.liquid-ledger-page.liquid-goals';
    const goalMask = '.liquid-goals.modal-mask';
    const goalDialog = `${goalMask} .modal-panel:not([inert])`;
    const goalTitle = `document.querySelector('${goalDialog} h2')?.textContent`;
    const closeGoals = () => cdp.click(`${goalDialog} [data-modal-close]`);
    const waitGoalsClosed = () => ui.waitFor(`!document.querySelector('${goalMask}')`);
    const discardGoalDraft = async () => {
        const confirm = '.glass-dialog[open]:has(.glass-confirm)';
        await ui.waitFor(
            `document.querySelector('${confirm} h2')?.textContent === '放弃未保存的修改？'`,
        );
        await cdp.click(`${confirm} footer glass-button:last-child`);
        await waitGoalsClosed();
    };

    await cdp.click(tab('overview'));
    await ui.waitFor(`${ready('overview')} && !!document.querySelector('.overview-goal-card')`);
    const linkedGoal = '.overview-goal-link';
    const newOverviewGoal = '.overview-goal-empty [aria-label="新建目标"]';
    if (await ui.exists(linkedGoal)) {
        await cdp.click(linkedGoal);
        await ui.waitFor(
            `${ready('goals')} && ['更新进度', '更新组合进度', '进度记录'].includes(${goalTitle})`,
        );
        if ((await cdp.evaluate(goalTitle)) === '进度记录') {
            await ui.fillSel(`${goalDialog} input[aria-label="备注"]`, '未保存的记录');
            await closeGoals();
            await discardGoalDraft();
        } else {
            await closeGoals();
            await waitGoalsClosed();
        }
    } else if (await ui.exists(newOverviewGoal)) {
        await cdp.click(newOverviewGoal);
        await ui.waitFor(`${ready('goals')} && ${goalTitle} === '新增目标'`);
        await closeGoals();
        await waitGoalsClosed();
    } else {
        await cdp.click(tab('goals'));
        await ui.waitFor(ready('goals'));
    }

    const goalFilters = `${goals} [aria-label="目标状态"]`;
    await ui.waitFor(`!!document.querySelector('${goalFilters}')`);
    await cdp.click(`${goalFilters} glass-segment[value="all"]`);
    t.check(
        '目标页在页头显示三档状态筛选和新增入口',
        await cdp.evaluate(`
        !!document.querySelector('${goals} .liquid-ledger-actions [aria-label="目标状态"]') &&
        !!document.querySelector('${goals} .liquid-ledger-actions [aria-label="新建目标"]') &&
        [...document.querySelectorAll('${goalFilters} glass-segment')].map(el => el.textContent.trim()).join(',') === '进行中,已达成,全部' &&
        document.querySelector('${goalFilters} [aria-selected="true"]').textContent.includes('全部')
    `),
    );
    t.check(
        '目标列表保留环形总体进度与直接可用的操作',
        await cdp.evaluate(`(() => {
        const page = document.querySelector('${goals}');
        const cards = [...page.querySelectorAll('.goal[data-goal-id]')];
        if (!cards.length) return !!page.querySelector('.glass-empty-state');
        return cards.every(card => card.querySelector('.progress-body .ring[role="progressbar"]') &&
            card.querySelector('.goal-head-actions [aria-label="目标历史"]') &&
            card.querySelector('.goal-head-actions [aria-label^="更新"]') &&
            card.querySelector('.goal-head-actions [aria-label="编辑目标"]') &&
            !/个角色|项达标/.test(card.querySelector('.heading')?.textContent.replace(card.querySelector('h2')?.textContent || '', '') || '') &&
            !card.querySelector('.goal-actions button, .goal-actions glass-button'));
    })()`),
    );
    const memberTicks = `${goals} .members .ticks`;
    if (await ui.exists(memberTicks)) {
        t.check(
            '角色刻度实际填色宽度与各自进度一致',
            await cdp.evaluate(`
            [...document.querySelectorAll('${memberTicks}')].every(bar => {
                const ticks = [...bar.querySelectorAll('.tick')];
                const width = ticks.reduce((sum, tick) => sum + tick.getBoundingClientRect().width, 0);
                const filled = ticks.reduce((sum, tick) => sum + tick.firstElementChild.getBoundingClientRect().width, 0);
                return width > 0 && Math.abs(100 * filled / width - Number(bar.getAttribute('aria-valuenow'))) <= 1;
            })
        `),
        );
    }
    if (await ui.exists(`${goals} .goal-head-actions [aria-label="目标历史"]`)) {
        await cdp.click(`${goals} .goal-head-actions [aria-label="目标历史"]`);
        const sheet = `${goals} glass-sheet.goal-history-sheet[data-visible]`;
        await ui.waitFor(`!!document.querySelector('${sheet} .history-content')`);
        t.check(
            '目标历史只显示一个底部弹层',
            await cdp.evaluate(`
            document.querySelectorAll('${sheet}').length === 1 && !document.querySelector('.modal-mask, dialog[open]')
        `),
        );
        t.check(
            '目标历史在底部展示表格或空状态',
            await cdp.evaluate(`
            !!document.querySelector('${sheet} table.glass-table.progress-history, ${sheet} .glass-empty-state')
        `),
        );
        t.check(
            '目标历史有记录时表头固定在滚动区域顶部',
            await cdp.evaluate(`(() => {
            const head = document.querySelector('${sheet} thead');
            return !head || getComputedStyle(head).position === 'sticky';
        })()`),
        );
        await cdp.click(`${sheet} [aria-label="关闭目标历史"]`);
        await ui.waitFor(`!document.querySelector('${sheet}')`);
    }
    const comboMember = `${goals} .goal button.member:not(:disabled)`;
    if (await ui.exists(comboMember)) {
        const member = await cdp.evaluate(`(() => {
            const row = document.querySelector('${comboMember}');
            return {
                name: row.querySelector('.who').textContent.trim(),
                count: row.closest('.members').children.length,
            };
        })()`);
        await cdp.click(comboMember);
        t.check(
            '组合卡按角色合并进度并打开对应角色',
            await ui.waitFor(`(() => {
            const tabs = document.querySelector('${goalDialog} [aria-label="更新组合角色"]');
            return tabs?.querySelectorAll('[role="tab"]').length === ${member.count} &&
                tabs.querySelector('[aria-selected="true"]')?.textContent.trim().startsWith(${JSON.stringify(member.name + ' · ')});
        })()`),
        );
        t.check(
            '组合更新共用玻璃表格和紧凑数字输入',
            await cdp.evaluate(`
            !!document.querySelector('${goalDialog} table.glass-table.combo-progress-table input.compact-number-input')
        `),
        );
        t.check(
            '组合角色切换横向单行排列，标签不互相重叠',
            await cdp.evaluate(`(() => {
            const tabs = document.querySelector('${goalDialog} [aria-label="更新组合角色"]');
            const items = [...tabs.querySelectorAll('glass-segment')];
            const rects = items.map(item => item.getBoundingClientRect());
            return rects.length > 0 && rects.every((rect, index) =>
                rect.width > 0 && Math.abs(rect.top - rects[0].top) <= 1 &&
                (index === 0 || rect.left >= rects[index - 1].right - 1));
        })()`),
        );
        t.check(
            '组合当前值输入不侵入目标列',
            await cdp.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('${goalDialog} .combo-current-input input')];
            return inputs.length > 0 && inputs.every(input => {
                const field = input.getBoundingClientRect();
                const cell = input.closest('td').getBoundingClientRect();
                const target = input.closest('td').nextElementSibling.getBoundingClientRect();
                return field.width > 0 && field.left >= cell.left && field.right <= cell.right &&
                    field.right <= target.left;
            });
        })()`),
        );
        await closeGoals();
        await waitGoalsClosed();
    }
    const manualUpdate = `${goals} [aria-label="更新目标进度"]`;
    if (await ui.exists(manualUpdate)) {
        await cdp.click(manualUpdate);
        t.check(
            '手动类更新的摘要、增减切换和输入使用公共组件',
            await ui.waitFor(`
            !!document.querySelector('${goalDialog} .goal-log-form .resource-grid') &&
            !!document.querySelector('${goalDialog} glass-segmented[aria-label="进度方向"]') &&
            !!document.querySelector('${goalDialog} .glass-date-face') &&
            !!document.querySelector('${goalDialog} .glass-number-field')
        `),
        );
        t.check(
            '日期和数值输入等高对齐，摘要与表单两侧对齐',
            await cdp.evaluate(`(() => {
            const form = document.querySelector('${goalDialog} .goal-log-form');
            const date = form.querySelector('.glass-date-face').getBoundingClientRect();
            const number = form.querySelector('.glass-number-field').getBoundingClientRect();
            const summary = form.querySelector('.resource-grid').getBoundingClientRect();
            const fields = form.querySelector('.entry-row').getBoundingClientRect();
            return Math.abs(date.top - number.top) <= 1 && Math.abs(date.bottom - number.bottom) <= 1 &&
                Math.abs(summary.left - fields.left) <= 1 && Math.abs(summary.right - fields.right) <= 1;
        })()`),
        );
        await closeGoals();
        await waitGoalsClosed();
    }
    await cdp.click(`${goals} [aria-label="新建目标"]`);
    await ui.waitFor(`${goalTitle} === '新增目标'`);
    const kinds = `${goalDialog} [aria-label="目标类型"]`;
    t.check(
        '目标编辑器有养成、存钱、装备、手动和组合五种类型',
        await cdp.evaluate(`
        [...document.querySelectorAll('${kinds} glass-segment')].map(button => button.textContent.trim()).join(',') ===
        '养成,存钱,装备,手动,组合'
    `),
    );
    t.check(
        '目标筛选和编辑器标签均与紧凑字段等高',
        await cdp.evaluate(`
        ['${goalFilters}', '${kinds}'].every(selector => {
            const el = document.querySelector(selector);
            return Math.abs(el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).getPropertyValue('--lg-form-height'))) < 1;
        })
    `),
    );
    const member = `${goalDialog} .glass-multi-option:has(input:not(:disabled))`;
    if (await ui.exists(member)) {
        const selected = await cdp.evaluate(`document.querySelector('${member} input').checked`);
        await cdp.click(member);
        await ui.waitFor(`document.querySelector('${member} input').checked === ${!selected}`);
        await cdp.click(member);
        await ui.waitFor(`document.querySelector('${member} input').checked === ${selected}`);
    }
    await cdp.click(`${kinds} glass-segment[value="combo"]`);
    await ui.waitFor(`!!document.querySelector('${goalDialog} .combo-settings')`);
    await ui.fillSel(`${goalDialog} input[aria-label="组合名称"]`, '玻璃组合草稿');
    await closeGoals();
    await discardGoalDraft();

    const toolList = '.liquid-tools .tool-grid';
    const atToolList = () =>
        ui.waitFor(`${ready('tools')} && !!document.querySelector('${toolList}')`);
    const toolTile = (name) => `${toolList} button[aria-label="${name}"]`;
    const atToolDetail = (name, page) =>
        ui.waitFor(`location.hash === '#/tools/${page}' &&
        !!document.querySelector('${tab('tools')}[aria-selected="true"]') &&
        document.querySelector('.liquid-tool-detail h1')?.textContent === ${JSON.stringify(name)}`);
    const openTool = async (name, page) => {
        await cdp.click(toolTile(name));
        await atToolDetail(name, page);
    };
    const toolBack = '.liquid-tool-detail [aria-label="返回工具列表"]';
    const toolMask = '.liquid-tools.modal-mask';
    const toolDialog = `${toolMask} .modal-panel:not([inert])`;
    const waitToolDialog = (selector) =>
        ui.waitFor(`!!document.querySelector('${toolDialog} ${selector}')`);
    const closeToolDialog = async () => {
        await cdp.click(`${toolDialog} [data-modal-close]`);
        await ui.waitFor(`!document.querySelector('${toolMask}')`);
    };
    await cdp.click(tab('tools'));
    await atToolList();
    t.check(
        '工具列表使用公共玻璃卡片，入口按钮不叠加自绘材质',
        await cdp.evaluate(`(() => {
        const items = [...document.querySelectorAll('${toolList} .tool-item')];
        return items.length > 0 && items.every((item) => {
            const style = getComputedStyle(item);
            return item.parentElement.matches('glass-surface.tool-card') &&
                style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
                style.boxShadow === 'none' && parseFloat(style.borderTopWidth) === 0;
        });
    })()`),
    );
    t.check(
        '工具目录登记六个站内工具和维护外链',
        await cdp.evaluate(`
        document.querySelectorAll('${toolList} [data-kind="page"]').length === 6 &&
        !!document.querySelector('${toolList} [data-kind="link"][aria-label="维护公告（浏览器打开）"]')
    `),
    );

    t.check(
        '工具目录按类别分组，入口用途可悬停查看或由读屏读取',
        await cdp.evaluate(`(() => {
        const groups = [...document.querySelectorAll('.liquid-tools-directory section[aria-labelledby]')];
        return groups.map(group => document.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim()).join(',') === '日程,资料,游戏' &&
            [...document.querySelectorAll('${toolList} button')].every(button => {
                const description = document.getElementById(button.getAttribute('aria-describedby'));
                return button.title.trim() && description?.hidden && description.textContent.trim() === button.title;
            });
    })()`),
    );

    // 点击工具前保留刚设置的滚动位置，避免 CDP 点击助手将按钮滚到中间。
    const directoryTop = await cdp.evaluate(`(() => {
        const pane = document.querySelector('.liquid-content');
        pane.scrollTop = 36;
        const top = pane.scrollTop;
        document.querySelector('${toolTile('活动日历')}').click();
        return top;
    })()`);
    await atToolDetail('活动日历', 'activities');
    t.check(
        '打开工具详情从右侧进入并从顶部开始',
        await cdp.evaluate(`(() => {
        const pane = document.querySelector('.liquid-content');
        return pane.dataset.pageEntry === 'tool-in' && pane.scrollTop === 0;
    })()`),
    );
    const activity = '.liquid-tool-detail .activity-card';
    await ui.waitFor(`!!document.querySelector('${activity}')`);
    t.check(
        '活动页直接显示紧凑卡片，日期与提醒状态分开',
        await cdp.evaluate(`
        !document.querySelector('.activity-page .tool-context') &&
        [...document.querySelectorAll('${activity}')].every(card => {
            const time = card.querySelector('.calendar-time');
            const reminder = card.querySelector('.card-reminder');
            const scale = Number(getComputedStyle(card).getPropertyValue('--fs-scale'));
            return time?.textContent.trim() && reminder && card.closest('glass-surface') &&
                card.getAttribute('aria-haspopup') === 'dialog' &&
                card.getBoundingClientRect().width <= 248 * scale + 1 &&
                card.scrollWidth <= card.clientWidth + 1;
        })
    `),
    );
    await cdp.evaluate(`document.querySelector('${activity}').focus()`);
    await cdp.key('Enter');
    const reminderDialog = '.activity-reminder-dialog:is([open], [data-visible])';
    await ui.waitFor(`!!document.querySelector('${reminderDialog} .activity-reminder')`);
    t.check(
        '活动提醒使用玻璃弹窗，保留五分钟提示和保存入口',
        await cdp.evaluate(`
        /(?:开场|时段开始)前 5 分钟提醒/.test(document.querySelector('${reminderDialog} .activity-reminder').textContent) &&
        [...document.querySelectorAll('${reminderDialog} footer glass-button')].some(button =>
            button.getAttribute('aria-label') === button.textContent.trim() + '这一场的提醒设置') &&
        !document.querySelector('${toolMask}')
    `),
    );
    const reminderSelect = `${reminderDialog} .glass-select-trigger`;
    if (await ui.exists(reminderSelect)) {
        await cdp.click(reminderSelect);
        await ui.waitFor(`!!document.querySelector('${reminderDialog} glass-menu[open]')`);
        await cdp.key('Escape');
        await ui.waitFor(`!document.querySelector('${reminderDialog} glass-menu[open]')`);
        t.check('活动场次菜单 Esc 只关闭选项，弹窗保持打开', await ui.exists(reminderDialog));
    }
    await cdp.key('Escape');
    await ui.waitFor(`!document.querySelector('${reminderDialog}')`);
    t.check(
        '键盘打开活动提醒后关闭，焦点返回活动卡',
        await cdp.evaluate(`
        document.activeElement === document.querySelector('${activity}')
    `),
    );
    await cdp.click(toolBack);
    await atToolList();
    t.check(
        '返回工具目录方向相反，并恢复原滚动位置',
        await cdp.evaluate(`(() => {
        const pane = document.querySelector('.liquid-content');
        return pane.dataset.pageEntry === 'tool-back' && Math.abs(pane.scrollTop - ${directoryTop}) < 1;
    })()`),
    );

    await openTool('闹钟', 'alarm');
    t.check(
        '闹钟隐藏页首摘要，紧凑卡片内操作文字不溢出',
        await cdp.evaluate(`(() => {
        const page = document.querySelector('.alarm-page');
        const cards = [...page.querySelectorAll('.alarm-card')];
        return !page.querySelector('.tool-context') &&
            (cards.length ? cards.every(card => {
                const rect = card.getBoundingClientRect();
                const scale = Number(getComputedStyle(card).getPropertyValue('--fs-scale'));
                const actions = [...card.querySelectorAll('.alarm-glass-action')];
                return card.querySelector('glass-switch.lg-small-switch')?.getAttribute('aria-checked') === String(!card.classList.contains('off')) &&
                    rect.width <= 224 * scale + 1 && card.scrollWidth <= card.clientWidth + 1 &&
                    actions.length === 2 && actions.every(button => {
                        const bounds = button.getBoundingClientRect();
                        const range = document.createRange();
                        range.selectNodeContents(button);
                        const text = range.getBoundingClientRect();
                        return bounds.left >= rect.left && bounds.right <= rect.right &&
                            text.left >= bounds.left - 1 && text.right <= bounds.right + 1 &&
                            text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1;
                    });
            }) : !!page.querySelector('.alarm-void'));
    })()`),
    );
    const alarmAdd = '.liquid-tool-detail [aria-label="新增一个闹钟"]';
    t.check(
        '详情页头返回在标题左侧，新增闹钟在右侧操作区',
        await cdp.evaluate(`(() => {
        const back = document.querySelector('${toolBack}');
        const add = document.querySelector('${alarmAdd}');
        const title = back?.parentElement.querySelector('h1');
        return !!title && back.getBoundingClientRect().right <= title.getBoundingClientRect().left + 1 &&
            !!add?.closest('.liquid-ledger-actions') && add.getAttribute('variant') !== 'prominent';
    })()`),
    );
    await cdp.click(alarmAdd);
    await waitToolDialog('.alarm-form');
    t.check(
        '闹钟支持四类重复方式和提前五分钟',
        await cdp.evaluate(`
        document.querySelectorAll('${toolDialog} glass-segmented[aria-label="重复方式"] glass-segment').length === 4 &&
        !!document.querySelector('${toolDialog} .glass-input .time-input') &&
        document.querySelector('${toolDialog} .alarm-hint').textContent.includes('提前 5 分钟提醒')
    `),
    );
    await ui.clickText(`${toolDialog} glass-segment`, '每周', { exact: true });
    const weekdays = `${toolDialog} .alarm-weekdays.glass-multi-select`;
    const mondayInput = `${weekdays} input[aria-label="星期一"]`;
    const monday = `${weekdays} .glass-multi-option:has(input[aria-label="星期一"])`;
    await ui.waitFor(`document.querySelector('${mondayInput}')?.checked === true`);
    t.check(
        '星期选项各行居中，控件不超出弹窗内容区',
        await cdp.evaluate(`(() => {
        const group = document.querySelector('${weekdays}');
        const bounds = group.getBoundingClientRect();
        const parent = group.parentElement.getBoundingClientRect();
        const rows = new Map();
        for (const option of group.querySelectorAll('.glass-multi-option')) {
            const rect = option.getBoundingClientRect();
            const row = Math.round(rect.top);
            const [left, right] = rows.get(row) ?? [rect.left, rect.right];
            rows.set(row, [Math.min(left, rect.left), Math.max(right, rect.right)]);
        }
        return rows.size > 0 && bounds.left >= parent.left - 1 && bounds.right <= parent.right + 1 &&
            [...rows.values()].every(([left, right]) => left >= bounds.left - 1 && right <= bounds.right + 1 &&
                Math.abs(left + right - bounds.left - bounds.right) <= 2);
    })()`),
    );
    const weekdayFill = () =>
        cdp.evaluate(`getComputedStyle(document.querySelector('${monday}')).backgroundColor`);
    const defaultFill = await weekdayFill();
    await cdp.click(monday);
    await ui.waitFor(`document.querySelector('${mondayInput}')?.checked === false`);
    const clearedFill = await weekdayFill();
    t.check(
        '取消星期一不影响其他已选日期',
        await cdp.evaluate(`
        document.querySelector('${weekdays} input[aria-label="星期二"]')?.checked === true &&
        document.querySelector('${weekdays} input[aria-label="星期日"]')?.checked === false
    `),
    );
    await cdp.click(monday);
    await ui.waitFor(`document.querySelector('${mondayInput}')?.checked === true`);
    t.check(
        '每周默认与重新选中的底色一致',
        defaultFill !== clearedFill && (await weekdayFill()) === defaultFill,
    );
    await cdp.evaluate(`document.querySelector('${mondayInput}').focus()`);
    await cdp.key('Enter');
    t.check(
        '星期复选框上的回车不提交闹钟',
        await cdp.evaluate(`
        document.querySelector('${mondayInput}')?.checked === true
    `),
    );
    await ui.fillSel(`${toolDialog} input[aria-label="备注"]`, '未保存的闹钟备注');
    await cdp.click(`${toolDialog} [data-modal-close]`);
    const alarmDiscard = '.glass-dialog[open]:has(.glass-confirm)';
    await ui.waitFor(
        `document.querySelector('${alarmDiscard} h2')?.textContent === '放弃未保存的修改？'`,
    );
    await cdp.click(`${alarmDiscard} footer glass-button:last-child`);
    await ui.waitFor(`!document.querySelector('${toolMask}')`);
    await cdp.click(tab('tools'));
    await atToolList();

    await openTool('游戏资源', 'assets');
    const assetCell = '.liquid-tool-detail .asset-cell';
    await ui.waitFor(`!!document.querySelector('${assetCell}')`);
    t.check(
        '资源页直接展示检索与图鉴，移除顶部说明',
        await cdp.evaluate(`
        !document.querySelector('.asset-page .tool-context')
    `),
    );
    t.check(
        '资源页的页码行与分页摘要均对齐图鉴中线',
        await cdp.evaluate(`(() => {
        const middle = element => {
            const rect = element.getBoundingClientRect();
            return rect.left + rect.width / 2;
        };
        const section = document.querySelector('.asset-section');
        const buttons = document.querySelector('.asset-pages .record-page-buttons');
        const summary = document.querySelector('.asset-pages .asset-page-info');
        const current = buttons?.querySelector('[aria-current="page"]');
        return current && getComputedStyle(current).textDecorationLine.includes('underline') && summary && [buttons, summary].every(element =>
            Math.abs(middle(element) - middle(section)) <= 1);
    })()`),
    );
    const resourceSearch = '.asset-bar glass-search[aria-label="搜索资源名"]';
    await cdp.click(resourceSearch);
    await cdp.send('Input.insertText', { text: '__E2E_NO_RESOURCE__' });
    await ui.waitFor(`document.querySelector('.asset-void h3')?.textContent === '没有匹配的资源'`);
    t.check(
        '玻璃资源搜索同步结果数并隐藏分页',
        await cdp.evaluate(`
        document.querySelector('.asset-count').textContent.trim() === '找到 0 项' &&
        !document.querySelector('.asset-pages')
    `),
    );
    await cdp.click('.asset-bar [aria-label="清除资源筛选"]');
    await ui.waitFor(`!!document.querySelector('${assetCell}')`);
    t.check(
        '清除搜索恢复图鉴，筛选栏与图标保持在页面内',
        await cdp.evaluate(`(() => {
        const page = document.querySelector('.asset-page');
        return document.querySelector('${resourceSearch}').value === '' &&
            document.querySelectorAll('${assetCell}').length <= 120 &&
            [...page.querySelectorAll('.asset-bar, .asset-section, .asset-cell')].every(element =>
                element.scrollWidth <= element.clientWidth + 1);
    })()`),
    );
    await cdp.evaluate(`document.querySelector('${assetCell}').focus()`);
    await cdp.key('Enter');
    await waitToolDialog('.asset-preview');
    await closeToolDialog();
    t.check(
        '资源大图关闭后焦点回到原图标',
        await cdp.evaluate(`
        document.activeElement === document.querySelector('${assetCell}')
    `),
    );
    await cdp.click(toolBack);
    await atToolList();

    await openTool('养成计算器', 'growth');
    const projects = '.calc-directory glass-segmented[aria-label="计算项目"]';
    await ui.waitFor(`!!document.querySelector('${projects}')`);
    t.check(
        '人物单项保留转门派和经验换算等级',
        await cdp.evaluate(`
        ['menpai', 'expGrade'].every(key => document.querySelector('${projects} glass-segment[value="' + key + '"]'))
    `),
    );
    await cdp.click(`${projects} glass-segment[value="expGrade"]`);
    t.check(
        '单项计算给长经验值留出更宽的输入空间',
        await cdp.evaluate(`(() => {
        const level = document.querySelector('.calc-fields input[aria-label="当前等级"]');
        const experience = document.querySelector('.calc-fields input[aria-label="手上经验"]');
        return level?.closest('.glass-compact-number-field') && experience?.closest('.glass-compact-number-field') &&
            experience.getBoundingClientRect().width > level.getBoundingClientRect().width &&
            getComputedStyle(level).textAlign === 'center' && getComputedStyle(experience).textAlign === 'end';
    })()`),
    );
    await ui.clickText('.calc-directory [aria-label="计算类别"] glass-segment', '技能', {
        exact: true,
    });
    t.check(
        '养成项目按类别显示并同步输入和结果',
        await cdp.evaluate(`
        document.querySelector('${projects} glass-segment[aria-selected="true"]')?.textContent.trim() === '师门技能' &&
        document.querySelectorAll('.calc-fields .glass-compact-number-field input[inputmode="numeric"]').length === 2 &&
        document.querySelector('.calc-panel .section-head h2').textContent.includes('师门技能') &&
        !!document.querySelector('.calc-panel .growth-result-card')
    `),
    );
    const mode = '.liquid-tool-detail glass-segmented[aria-label="计算方式"]';
    const plan = `${mode} glass-segment[value="plan"]`;
    await ui.waitFor(`!!document.querySelector('${plan}')`);
    t.check(
        '两种计算模式同排且标签不换行',
        await cdp.evaluate(`(() => {
        const control = document.querySelector('${mode}');
        const bounds = control.getBoundingClientRect();
        const options = [...control.querySelectorAll('glass-segment')];
        return options.length === 2 && options.every(option => {
            const rect = option.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(option);
            const [text, ...extraLines] = range.getClientRects();
            return text && extraLines.length === 0 && text.left >= rect.left - 1 && text.right <= rect.right + 1 &&
                text.top >= rect.top - 1 && text.bottom <= rect.bottom + 1 &&
                rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
                Math.abs(rect.top - options[0].getBoundingClientRect().top) <= 1;
        });
    })()`),
    );
    const calculator = '.liquid-tool-detail .growth-calculator';
    const calculatorEdges = `(() => {
        const { left, right } = document.querySelector('${calculator}').getBoundingClientRect();
        return { left, right };
    })()`;
    const singleEdges = await cdp.evaluate(calculatorEdges);
    await cdp.click(plan);
    await ui.waitFor(`!document.querySelector('.liquid-tool-detail .record-empty[role="status"]') &&
        !!document.querySelector('.liquid-tool-detail .plan-toolbar, .liquid-tool-detail .record-empty, .liquid-tool-detail [role="alert"]')`);
    const planEdges = await cdp.evaluate(calculatorEdges);
    t.check(
        '切换计算方式时内容区左右边缘保持对齐',
        Math.abs(planEdges.left - singleEdges.left) <= 1 &&
            Math.abs(planEdges.right - singleEdges.right) <= 1,
    );

    if (await cdp.evaluate("!!document.querySelector('.plan-toolbar')")) {
        t.check(
            '总消耗紧跟角色选择并位于计算项目之前',
            await cdp.evaluate(`
            document.querySelector('.plan-toolbar + .plan-layout > .plan-summary:first-child:has(+ .plan-groups) .section-head h2')
                ?.textContent.trim() === '总消耗'
        `),
        );
        t.check(
            '综合计算的当前和目标两列共用小数字框',
            await cdp.evaluate(`(() => {
            const row = document.querySelector('.plan-line');
            const fields = [...(row?.querySelectorAll('.glass-compact-number-field') ?? [])];
            return fields.length === 2 && fields.every(field =>
                field.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1) &&
                !!document.querySelector('.plan-owned .glass-compact-number-field.is-wide input');
        })()`),
        );
        if (
            await cdp.evaluate(
                "!!document.querySelector('.plan-summary') && !document.querySelector('.plan-summary [role=alert]')",
            )
        ) {
            await ui.fillSel('.plan-groups input[aria-label="人物等级当前"]', '69');
            await ui.fillSel('.plan-groups input[aria-label="人物等级目标"]', '70');
            await ui.fillSel('.plan-groups input[aria-label="乾元丹当前"]', '0');
            await ui.fillSel('.plan-groups input[aria-label="乾元丹目标"]', '1');
            const breakdown = '.plan-summary .plan-breakdown';
            t.check(
                '试算后消耗明细默认收起',
                await ui.waitFor(`document.querySelector('${breakdown}')?.open === false`),
            );
            await cdp.click(`${breakdown} > summary`);
            t.check(
                '消耗明细分卡显示人物经验、梦幻币及对应来源',
                await ui.waitFor(`(() => {
                const details = document.querySelector('${breakdown}');
                if (!details?.open) return false;
                const cards = [...details.querySelectorAll('.plan-breakdown-grid > .plan-resource')];
                const hasSource = (label, name) => cards.some(card =>
                    card.querySelector('h3 > span')?.textContent.trim() === label &&
                    [...card.querySelectorAll('dt')].some(row => row.textContent === name)
                );
                return hasSource('人物经验', '人物等级 69 → 70') && hasSource('梦幻币', '乾元丹 0 → 1');
            })()`),
            );
        }
        t.check(
            '角色综合预算只提供辅助技能扩展入口',
            await cdp.evaluate(`(() => {
            const groups = document.querySelector('.plan-groups');
            return !!groups && !groups.querySelector('[aria-label="新增计算卡片"]') &&
                !/转门派|经验换算等级/.test(groups.textContent) &&
                [...groups.querySelectorAll('.plan-add')].every(row =>
                    row.querySelector('[aria-label="新增辅助技能计算项目"]'));
        })()`),
        );
    }
    await cdp.click(toolBack);
    await atToolList();

    await openTool('捉鬼助手', 'ghost');
    t.check(
        '捉鬼助手保留地图和识别入口',
        await cdp.evaluate(`
        document.querySelector('.liquid-tool-detail .map-stage').clientHeight >= 240 &&
        !!document.querySelector('.hunt > .map-card + .hunt-side .hunt-controls .glass-select-trigger') &&
        document.querySelector('.map-card .group-head')?.textContent.includes('任务地图') &&
        !!document.querySelector('.hunt-controls .window-field [role="status"]') &&
        (() => {
            const map = document.querySelector('.hunt .map-card').getBoundingClientRect();
            const side = document.querySelector('.hunt .hunt-side').getBoundingClientRect();
            return document.querySelector('.hunt-frame').clientWidth > 660
                ? side.left >= map.right
                : side.top >= map.bottom;
        })() &&
        !!document.querySelector('.hunt-controls glass-switch.lg-small-switch[aria-label="高概率区域"]') &&
        !!document.querySelector('.liquid-tool-detail :is([aria-label="开始识别任务栏"], [aria-label="停止识别（回到未开始）"])')
    `),
    );
    await cdp.click(toolBack);
    await atToolList();

    await openTool('提醒助手', 'fengyao');
    await ui.waitFor(
        "document.querySelectorAll('.fy-type glass-switch:not([disabled])').length === 6",
    );
    t.check(
        '提醒时间线按实际内容宽度并排或堆叠，设置行样式已加载',
        await cdp.evaluate(`
        (() => {
            const layout = document.querySelector('.fy-layout');
            const history = layout.querySelector('.fy-history').getBoundingClientRect();
            const settings = layout.querySelector('.fy-settings').getBoundingClientRect();
            return getComputedStyle(layout).display === 'grid' &&
                getComputedStyle(layout.querySelector('.fy-type-row')).display === 'flex' &&
                (layout.clientWidth > 640
                    ? settings.left >= history.right && Math.abs(settings.top - history.top) < 1
                    : settings.top >= history.bottom);
        })()
    `),
    );
    t.check(
        '提醒助手先显示时间线，再显示集中设置的六种提醒',
        await cdp.evaluate(`
        !!document.querySelector('.fy-layout > glass-surface.fy-history + glass-surface.fy-settings') &&
        document.querySelectorAll('.fy-settings .fy-type glass-switch').length === 6 &&
        document.querySelector('[aria-label="二十八星宿提醒"]')?.closest('.fy-type-row')
            ?.querySelector('img')?.src.endsWith('/pet-2061.webp') &&
        document.querySelector('[aria-label="宝宝幼儿园提醒"]')?.closest('.fy-type-row')
            ?.querySelector('img')?.src.endsWith('/pet-2041.webp') &&
        !!document.querySelector('.fy-history .fy-reminders, .fy-history .fy-empty-alerts') &&
        document.querySelectorAll('.fy-maps-toggle[aria-expanded="false"]').length === 1 &&
        !!document.querySelector('.fy-settings .fy-window-control + .fy-status[role="status"]') &&
        new Set([...document.querySelectorAll('.fy-type-row .fy-mark img')].map((img) => img.src)).size === 6 &&
        document.querySelector('.fy-settings .fy-guide')?.textContent.includes('保持窗口可见') &&
        [...document.querySelectorAll('.fy-type glass-switch')].every(
            (toggle) => {
                const rect = toggle.getBoundingClientRect();
                const hit = getComputedStyle(toggle, '::before');
                return Math.abs(rect.width - 44) <= 1 && hit.content !== 'none' &&
                    rect.height - (parseFloat(hit.top) + parseFloat(hit.bottom)) * 0.6875 >= 30;
            }) &&
        !document.querySelector('.fy-history .fy-reading').open
    `),
    );
    const mapsToggle = '.fy-maps-toggle';
    const mapChoices = '#fy-maps-fengyao .glass-multi-select[aria-label="封妖地图"]';
    await cdp.click(mapsToggle);
    t.check(
        '封妖地图展开后用独立复选项显示监听规则所列地图',
        await cdp.evaluate(`(async () => {
        const status = await window.__TAURI_INTERNALS__.invoke('fengyao_status');
        const groups = document.querySelector('${mapChoices}');
        const choices = [...(groups?.querySelectorAll('input[type="checkbox"]') ?? [])];
        return document.querySelector('${mapsToggle}').getAttribute('aria-expanded') === 'true' &&
            !!groups?.getClientRects().length && choices.length > 0 &&
            JSON.stringify(choices.map(choice => choice.value)) === JSON.stringify(status.rules.scenes.map(scene => scene.name)) &&
            !!document.querySelector('#fy-maps-fengyao [aria-label="恢复全部地图"]');
    })()`),
    );
    await cdp.click(mapsToggle);
    await cdp.click(tab('overview'));
    const overviewFengyao = '.liquid-overview .workbench-actions glass-button';
    const fengyaoAction = await cdp.evaluate(`(async () => {
        const status = await window.__TAURI_INTERNALS__.invoke('fengyao_status');
        return status.running ? '停止公告监听' : '按上次设置开启提醒助手';
    })()`);
    await ui.waitFor(
        `!!document.querySelector('${overviewFengyao}[aria-label="${fengyaoAction}"]:not([disabled])')`,
    );
    t.check(
        '总览提醒按钮反映桌面监听状态',
        await cdp.evaluate(`
        location.hash === '#/overview' &&
        !!document.querySelector('${overviewFengyao}[aria-label="${fengyaoAction}"]')
    `),
    );

    // 已在设置页时标签栏不会再发 change，隐藏入口的计数必须只靠原生 click。
    await cdp.click(tab('settings'));
    await ui.waitFor(ready('settings'));
    await tapSettings(4);
    t.check(
        '连点设置不足五次不会进入组件目录',
        await cdp.evaluate(`!document.querySelector('.component-catalog') && ${ready('settings')}`),
    );
    // 点别的标签清零；随后这一次真实点击连同四次连点正好凑满五次。
    await cdp.click(tab('prices'));
    await ui.waitFor(ready('prices'));
    await cdp.click(tab('settings'));
    await ui.waitFor(ready('settings'));
    await tapSettings(4);
    await ui.waitFor(atComponents());
    const catalogTab = (key) => '#catalog-tab-' + key;
    const pickCatalog = async (key) => {
        await cdp.click(catalogTab(key));
        await ui.waitFor(`!!document.querySelector('#catalog-panel-${key}') &&
            document.querySelector('#catalog-tab-${key}').getAttribute('aria-selected') === 'true'`);
    };
    t.check(
        '组件目录默认展示卡片，左侧提供六个分类',
        await cdp.evaluate(`(() => {
        const root = document.querySelector('.component-catalog');
        const tabs = [...root.querySelectorAll('.catalog-menu [role="tab"]')];
        return tabs.map(item => item.textContent.trim()).join(',') ===
            '卡片,按钮与菜单,输入控件,选择控件,容器与表面,反馈与弹层' &&
            tabs.filter(item => item.tabIndex === 0).length === 1 &&
            tabs[0].getAttribute('aria-selected') === 'true' &&
            !!root.querySelector('#catalog-panel-cards .sample-card');
    })()`),
    );
    t.check(
        '卡片和按钮分别使用清透折射的内容面与操作面',
        await cdp.evaluate(`
        Number(document.querySelector('.component-catalog .sample-card').getAttribute('refraction')) === 10 &&
        Number(document.querySelector('.component-catalog .sample-card glass-button').getAttribute('refraction')) === 12 &&
        Number(document.querySelector('.component-catalog .sample-card').getAttribute('specular')) <
            Number(document.querySelector('.component-catalog .sample-card glass-button').getAttribute('specular'))`),
    );
    t.check(
        '组件示例和 Dock 共用正文、按钮与金额字号',
        await cdp.evaluate(`(() => {
        const catalog = document.querySelector('.component-catalog');
        const text = getComputedStyle(catalog);
        const button = getComputedStyle(catalog.querySelector('glass-button'));
        const amount = getComputedStyle(catalog.querySelector('.price-card .price-value'));
        const dock = getComputedStyle(document.querySelector('.liquid-dock-bar'));
        return text.fontSize === '13.5px' && text.fontFamily.includes('MH Toolbox Rounded') &&
            button.fontSize === '12px' && button.fontWeight === '400' &&
            Math.abs(parseFloat(amount.fontSize) - 18.9) < 0.1 && dock.fontSize === '11px';
    })()`),
    );

    await cdp.evaluate("document.querySelector('#catalog-tab-cards').focus()");
    await cdp.key('ArrowDown');
    await ui.waitFor("!!document.querySelector('#catalog-panel-actions')");
    t.check(
        '侧栏方向键切换分类并移动焦点',
        await cdp.evaluate(`
        document.activeElement.id === 'catalog-tab-actions' &&
        document.activeElement.getAttribute('aria-selected') === 'true'`),
    );
    await cdp.key('End');
    await ui.waitFor("!!document.querySelector('#catalog-panel-feedback')");
    await cdp.click('.component-catalog .sample-notice');
    await ui.waitFor(
        "document.querySelector('.notice-layer')?.textContent.includes('这是一条顶部消息提示。')",
    );
    t.check(
        '组件提示沿用固定顶部消息层',
        await cdp.evaluate(`(() => {
        const layer = document.querySelector('.notice-layer');
        const rect = layer.getBoundingClientRect();
        return getComputedStyle(layer).position === 'fixed' && rect.top >= 0 && rect.top < 64 &&
            Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2;
    })()`),
    );

    await pickCatalog('inputs');
    t.check(
        '输入示例保留标准、紧凑、错误与禁用状态',
        await cdp.evaluate(`(() => {
        const gallery = document.querySelector('.component-catalog .gallery');
        const near = (selector, height) => Math.abs(gallery.querySelector(selector).getBoundingClientRect().height - height) < 1;
        return ['.lg-price-search', '.glass-input', '.glass-select-face', '.glass-date-face'].every(face =>
                near('.field-comparison.lg-form-fields ' + face, 32) &&
                near('.field-comparison:not(.lg-form-fields) ' + face, 44)) &&
            !!gallery.querySelector('.glass-price-field input[aria-invalid="true"]') &&
            !!gallery.querySelector('.glass-select-trigger:disabled') &&
            near('.glass-price-field:not(.compact) .glass-input', 44) &&
            near('.glass-price-field.compact .glass-input', 36);
    })()`),
    );
    t.check(
        '输入控件保持公共折射档',
        await cdp.evaluate(`
        ['.field-example .glass-input', '.glass-select-face', '.glass-date-face', '.lg-price-search']
            .every(selector => document.querySelector('.gallery ' + selector)?.getAttribute('refraction') === '8')`),
    );
    const demoPrice = '.component-catalog .glass-price-field:not(.compact)';
    await cdp.click(`${demoPrice} [aria-label="加 10 万"]`);
    await ui.waitFor(`document.querySelector('${demoPrice} input').value === '330'`);
    await cdp.click(`${demoPrice} [aria-label="减 10 万"]`);
    await ui.fillSel('.component-catalog input[aria-label="紧凑数量"]', '27');
    await pickCatalog('choices');
    t.check(
        '选择示例提供两档单选、多选及紧凑开关',
        await cdp.evaluate(`(() => {
        const root = document.querySelector('.gallery');
        return ['compact', 'standard'].every(size => {
            const multi = root.querySelector('.glass-multi-select[data-size=' + size + ']');
            return multi?.querySelectorAll('input[type="checkbox"]:checked').length === 2 &&
                !!root.querySelector('glass-segmented[data-size=' + size + ']');
        }) && !!root.querySelector('glass-switch.lg-small-switch');
    })()`),
    );
    const compactMulti = '.gallery .glass-multi-select[data-size="compact"]';
    const extraOption = `${compactMulti} .glass-multi-option:has(input[value="装备灵饰"])`;
    await cdp.click(extraOption);
    t.check(
        '新增勾选保留其他选项，并且不影响另一组多选',
        await cdp.evaluate(`
        document.querySelectorAll('${compactMulti} input:checked').length === 3 &&
        document.querySelectorAll('.gallery .glass-multi-select[data-size="standard"] input:checked').length === 2`),
    );
    await cdp.click(extraOption);
    await pickCatalog('inputs');
    t.check(
        '切换分类保留数字与价格示例值',
        await cdp.evaluate(`
        document.querySelector('.gallery input[aria-label="紧凑数量"]').value === '27' &&
        document.querySelector('${demoPrice} input').value === '320'`),
    );
    const scrollPosition = await cdp.evaluate(`(() => {
        const gallery = document.querySelector('.gallery');
        gallery.scrollTop = gallery.scrollHeight;
        return gallery.scrollTop;
    })()`);
    await pickCatalog('surfaces');
    const chartSample = '.gallery .sample-chart';
    await cdp.evaluate(`document.querySelector('${chartSample} .chart-svg').focus()`);
    t.check(
        '趋势图示例聚焦后高亮日期并显示两个系列的读数',
        await ui.waitFor(`
        !!document.querySelector('${chartSample} .chart-hover-band') &&
        document.querySelectorAll('${chartSample} [role="tooltip"] .tooltip-value').length === 2
    `),
    );
    await cdp.key('Escape');
    await cdp.click(`${chartSample} glass-segment[value="category"]`);
    await cdp.evaluate(`document.querySelector('${chartSample} .column-group').focus()`);
    t.check(
        '分类柱图复用图例与悬停明细',
        await ui.waitFor(`
        document.querySelector('${chartSample} .tooltip-heading')?.textContent === '藏宝阁' &&
        document.querySelectorAll('${chartSample} .chart-legend-shelf .swatch').length === 2
    `),
    );
    t.check(
        '容器分类展示表格与滚动场景',
        (await ui.exists('.gallery table.glass-table tbody tr')) &&
            (await ui.exists('.gallery .timeline')),
    );
    const pager = '.gallery nav[aria-label="示例分页"]';
    t.check(
        '紧凑分页首页禁用上一页',
        await cdp.evaluate(`
        document.querySelector('${pager} [aria-label="上一页"]')?.hasAttribute('disabled') === true`),
    );
    await cdp.click(`${pager} [aria-label="下一页"]`);
    await ui.waitFor(
        `document.querySelector('${pager} [aria-live="polite"]')?.textContent.trim() === '2 / 3'`,
    );
    await cdp.click(`${pager} [aria-label="下一页"]`);
    await ui.waitFor(
        `document.querySelector('${pager} [aria-live="polite"]')?.textContent.trim() === '3 / 3'`,
    );
    t.check(
        '紧凑分页尾页禁用下一页',
        await cdp.evaluate(`
        document.querySelector('${pager} [aria-label="下一页"]')?.hasAttribute('disabled') === true`),
    );
    await pickCatalog('inputs');
    t.check(
        '回到分类时恢复详情滚动位置',
        await cdp.evaluate(`
        Math.abs(document.querySelector('.gallery').scrollTop - ${scrollPosition}) <= 1`),
    );
    t.check(
        '侧栏与详情左右排列，详情滚动不移动菜单和标题',
        await cdp.evaluate(`(() => {
        const sidebar = document.querySelector('.catalog-sidebar');
        const detail = document.querySelector('.catalog-detail');
        const heading = document.querySelector('.catalog-detail-heading');
        const gallery = document.querySelector('.gallery');
        const before = [sidebar, heading].map(el => el.getBoundingClientRect().top);
        const old = gallery.scrollTop;
        gallery.scrollTop = 0;
        const stable = [sidebar, heading].every((el, i) => el.getBoundingClientRect().top === before[i]);
        gallery.scrollTop = old;
        return sidebar.getBoundingClientRect().right <= detail.getBoundingClientRect().left && stable &&
            gallery.scrollWidth <= gallery.clientWidth + 1 && getComputedStyle(gallery).overflowY === 'auto';
    })()`),
    );

    await pickCatalog('actions');
    t.check(
        '排序菜单和表单操作沿用公共控件',
        await ui.exists('.gallery .glass-select-trigger .glass-select-face'),
    );
    const sampleForm = '.component-catalog .liquid-price-editor';
    await ui.clickText('.component-catalog .example-row glass-button', '编辑价格', { exact: true });
    await ui.waitFor(`document.querySelector('${sampleForm} h2')?.textContent === '编辑价格记录'`);
    await ui.fillSel(`${sampleForm} input[inputmode="decimal"]`, '88');
    await ui.clickText(`${sampleForm} glass-button`, '保存', { exact: true });
    await ui.waitFor(`!document.querySelector('${sampleForm}')`);
    const sampleCount = "document.querySelectorAll('.component-catalog .sample-history li').length";
    t.check('编辑最新示例价格后仍为两笔记录', await cdp.evaluate(`${sampleCount} === 2`));
    await cdp.click('.component-catalog .example-row [aria-label="新增价格记录"]');
    await ui.waitFor(`document.querySelector('${sampleForm} h2')?.textContent === '更新价格'`);
    t.check(
        '新增示例带入编辑后的当前价',
        await cdp.evaluate(
            `document.querySelector('${sampleForm} input[inputmode="decimal"]').value === '88'`,
        ),
    );
    await ui.clickText(`${sampleForm} glass-button`, '保存', { exact: true });
    await ui.waitFor(`${sampleCount} === 3`);
    await pickCatalog('cards');
    t.check(
        '返回卡片后展示跨分类更新的示例记录',
        await cdp.evaluate(`
        document.querySelector('.sample-card .price-spark polyline')?.points.numberOfItems === 3`),
    );

    await cdp.evaluate('history.back()');
    await ui.waitFor(ready('settings'));
    await cdp.evaluate(`document.querySelector('${tab('settings')}').focus()`);
    await cdp.key('ArrowRight');
    await ui.waitFor(ready('overview'));
    t.check(
        '键盘切换同步 Dock 选中项，并且只画一道焦点框',
        await cdp.evaluate(`(() => {
            const item = document.querySelector('${tab('overview')}');
            const style = getComputedStyle(item);
            return document.activeElement === item && item.matches(':focus-visible') &&
                style.outlineStyle === 'solid' && style.boxShadow === 'none';
        })()`),
    );

    await cdp.click(tab('settings'));
    await ui.waitFor(
        `${ready('settings')} && !!document.querySelector('.liquid-settings glass-segment[role="tab"]')`,
    );
    t.check(
        '鼠标点选 Dock 只显示选中胶囊',
        await cdp.evaluate(`(() => {
        const item = document.querySelector('${tab('settings')}');
        const style = getComputedStyle(item);
        return item.getAttribute('aria-selected') === 'true' &&
            style.outlineStyle === 'none' && style.boxShadow === 'none';
    })()`),
    );
    t.check(
        '设置标题使用紧凑的分栏字号，设置项与分段控件使用正文和控件字号',
        await cdp.evaluate(`(() => {
            const title = getComputedStyle(document.querySelector('#liquid-settings-title'));
            const label = getComputedStyle(document.querySelector('#liquid-theme-label'));
            const option = getComputedStyle(document.querySelector('.liquid-settings glass-segment'));
            return title.fontSize === '14.5px' && title.fontWeight === '400' &&
                label.fontSize === '13.5px' && option.fontSize === '12px';
        })()`),
    );
    const themeControl = '.liquid-settings glass-segmented[aria-labelledby="liquid-theme-label"]';
    t.check(
        '主题选项文字各占一行并位于选项内',
        await cdp.evaluate(`(() => {
        const options = document.querySelectorAll('${themeControl} > glass-segment');
        return options.length === 2 && [...options].every(option => {
            const range = document.createRange();
            range.selectNodeContents(option);
            const text = range.getBoundingClientRect();
            const item = option.getBoundingClientRect();
            return range.getClientRects().length === 1 && text.left >= item.left && text.right <= item.right;
        });
    })()`),
    );
    t.check(
        '主题分段的静止高光覆盖选中的一整项',
        await cdp.evaluate(`(() => {
        const selected = document.querySelector('.liquid-settings glass-segment[aria-selected="true"]');
        const item = selected.getBoundingClientRect();
        const pill = selected.parentElement.shadowRoot.querySelector('[part="indicator"]').getBoundingClientRect();
        return ['left', 'top', 'width', 'height'].every(key => Math.abs(item[key] - pill[key]) <= 1);
    })()`),
    );
    t.check(
        '设置页展示外观、数据和关于三张卡，关于提供数据目录和许可入口',
        await cdp.evaluate(`(() => {
            const cards = [...document.querySelectorAll('.liquid-settings-grid .card-heading h2')];
            const about = document.querySelector('.settings-about');
            return cards.map(el => el.textContent.trim()).join(',') === '外观,关于,数据' &&
                !!about?.querySelector('.about-path')?.textContent.trim() &&
                [...about.querySelectorAll('.license-links a')].length === 2 &&
                getComputedStyle(about).fontFamily.includes('MH Toolbox Rounded');
        })()`),
    );
    const desktop = await cdp.evaluate("'__TAURI_INTERNALS__' in window");
    t.check(
        '账本操作与当前环境的能力一致',
        await cdp.evaluate(`(() => {
        const actions = [...document.querySelectorAll('.settings-data glass-button')];
        return actions.length === 5 && actions.every(el => el.hasAttribute('disabled') === ${!desktop});
    })()`),
    );
    if (desktop) {
        const clearConfirm = '.glass-dialog[open][aria-label="清空全部账本？"]';
        await ui.clickText('.settings-data glass-button', '清除', { exact: true });
        await ui.waitFor(`!!document.querySelector('${clearConfirm}')`);
        t.check(
            '清空账本前提示不可撤销、不会自动备份并建议先导出',
            await cdp.evaluate(`(() => {
            const note = document.querySelector('${clearConfirm} p')?.textContent ?? '';
            return ['无法撤销', '不会自动备份', '先导出'].every(text => note.includes(text));
        })()`),
        );
        await ui.clickText(`${clearConfirm} footer glass-button`, '取消', { exact: true });
        await ui.waitFor(`!document.querySelector('${clearConfirm}')`);
    }
    const dialogs = [['选择壁纸', '.wallpaper-dialog', '.wallpaper-picker']];
    if (desktop) dialogs.push(['恢复', '.backup-dialog', '.backup-history']);
    for (const [name, selector, content] of dialogs) {
        await ui.clickText('.liquid-settings-panel glass-button', name, { exact: true });
        await ui.waitFor(`!!document.querySelector('${selector} ${content}')`);
        const retained = await cdp.evaluate(`(async () => {
            const host = document.querySelector('${selector}');
            await Promise.allSettled(host.getAnimations().map(a => a.finished));
            host.querySelector('header glass-button').click();
            await new Promise(requestAnimationFrame);
            return !host.getClientRects().length || !!host.querySelector('${content}');
        })()`);
        t.check(name + '退场期间保留面板内容', retained);
        await ui.waitFor(`!document.querySelector('${selector} ${content}')`);
    }
    t.check(
        '滚动条轨道常驻且玻璃按钮不带材质文字阴影，避免内容宽度与弹窗小字抖动',
        await cdp.evaluate(`(() => {
            const content = document.querySelector('.liquid-content');
            const button = document.querySelector('.liquid-settings glass-button');
            return getComputedStyle(content).scrollbarGutter === 'stable' &&
                getComputedStyle(button).textShadow === 'none';
        })()`),
    );
    const initialTheme = await cdp.evaluate(
        "document.querySelector('.liquid-app').dataset.appearance",
    );
    const theme = initialTheme === 'light' ? 'dark' : 'light';
    const themeOption = (value) => `${themeControl} [value="${value}"]`;
    const backgroundActions = '.background-row glass-button';
    const previewOption = '.wallpaper-picker .wallpaper-tile';
    const savedWallpaper = await cdp.evaluate("localStorage.getItem('mh-liquid-wallpaper')");
    async function chooseSystem(name) {
        await ui.clickText(backgroundActions, '选择壁纸', { exact: true });
        const trial = '.wallpaper-sources [value="system"]';
        await ui.waitFor(`!!document.querySelector('${trial}[role="tab"]')`);
        await cdp.click(trial);
        await ui.clickText(previewOption, name, { exact: true });
        await ui.waitFor("!document.querySelector('.wallpaper-picker')");
    }
    const backgroundUses = (file) =>
        `document.querySelector('.liquid-app').style.getPropertyValue('--liquid-wallpaper').includes(${JSON.stringify(file)})`;
    const usesDefaultWallpaper = (value) => `${backgroundUses(`beach-${value}`)} &&
        document.querySelector('.background-label small')?.textContent.includes('macOS Tahoe · 湖畔昼夜') &&
        ![...document.querySelectorAll('${backgroundActions}')].some(button => button.textContent.trim() === '恢复默认')`;
    try {
        await cdp.evaluate("localStorage.removeItem('mh-liquid-wallpaper')");
        await ui.reload({ waitFor: '.liquid-dock' });
        await ui.waitFor(
            `${ready('settings')} && !!document.querySelector('.background-label small')`,
        );
        t.check(
            '没有壁纸偏好时默认使用湖畔昼夜',
            await cdp.evaluate(usesDefaultWallpaper(initialTheme)),
        );
        await chooseSystem('彩色胶囊');
        const previewSelected = `document.querySelector('.liquid-app').dataset.wallpaperSource === 'system' &&
            ${backgroundUses(`blendpills-${initialTheme}`)}`;
        await ui.waitFor(previewSelected);
        t.check('点击系统壁纸后选中对应图片并更新应用背景', await cdp.evaluate(previewSelected));
        await cdp.click(themeOption(theme));
        const settingsMaterialMatches = `(() => {
            const panels = [...document.querySelectorAll('.liquid-settings-panel')];
            return panels.length === 3 && panels.every(
                panel => panel.dataset.glassAppearance === ${JSON.stringify(theme)},
            );
        })()`;
        await ui.waitFor(settingsMaterialMatches);
        t.check(
            '切换主题后设置三张卡片的玻璃材质随之更新',
            await cdp.evaluate(settingsMaterialMatches),
        );
        t.check(
            '切换主题会应用同组的另一张图片',
            await cdp.evaluate(backgroundUses(`blendpills-${theme}`)),
        );
        await ui.clickText(backgroundActions, '恢复默认', { exact: true });
        t.check(
            '恢复默认后回到当前主题的湖畔昼夜',
            await cdp.evaluate(usesDefaultWallpaper(theme)),
        );
        await chooseSystem('玻璃花瓣');
        await ui.reload({ waitFor: '.liquid-dock' });
        await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
        t.check(
            '重新加载后保留选择的系统壁纸',
            await cdp.evaluate(backgroundUses(`glass-chip-${theme}`)),
        );
        t.check(
            '刷新后恢复主题，设置仅提供一组分段切换，Dock 使用通透材质',
            await cdp.evaluate(`${ready('settings')} &&
                document.querySelector('.liquid-app').dataset.appearance === ${JSON.stringify(theme)} &&
                document.querySelectorAll('.liquid-settings glass-segmented').length === 1 &&
                document.querySelector('.liquid-dock-bar').getAttribute('material') === 'clear'`),
        );
        // 刷新后仍停在设置页，直接连点五次即可重新进入隐藏目录。
        await tapSettings(5);
        await ui.waitFor(atComponents());
        t.check(
            '组件示例卡片使用通透材质',
            await cdp.evaluate(
                `document.querySelector('.component-catalog .sample-card').getAttribute('material') === 'clear'`,
            ),
        );
        await pickCatalog('choices');
        await cdp.click('.component-catalog glass-switch');
        t.check(
            '开关同步更新 Vue 状态',
            await cdp.evaluate(`document.querySelector('.component-catalog glass-switch').checked === false &&
                document.querySelector('.component-catalog .setting-row output').textContent.trim() === '关闭'`),
        );

        const sheet = '.component-catalog .sample-history';
        await pickCatalog('inputs');
        const numberExample = '.component-catalog input[aria-label="紧凑数量"]';
        await ui.fillSel(numberExample, '23');
        await cdp.key('Tab');
        t.check(
            '数字示例保留输入值，禁用与错误状态各自独立',
            await cdp.evaluate(`(() => {
            const value = document.querySelector('${numberExample}');
            const disabled = document.querySelector('input[aria-label="禁用数量"]');
            const invalid = document.querySelector('input[aria-label="示例数量"]');
            return value.value === '23' && disabled.disabled &&
                invalid.getAttribute('aria-invalid') === 'true' &&
                document.getElementById(invalid.getAttribute('aria-describedby'))?.textContent.includes('大于 0');
        })()`),
        );
        const idleFill = await cdp.evaluate(
            `getComputedStyle(document.querySelector('${numberExample}').closest('.glass-input')).getPropertyValue('--lg-field-fill')`,
        );
        await cdp.click(numberExample);
        t.check(
            '鼠标聚焦数字输入只改变底色，不增加主题色描边',
            await cdp.evaluate(`(() => {
            const input = document.querySelector('${numberExample}');
            const face = input.closest('.glass-input');
            const style = getComputedStyle(face);
            return document.activeElement === input && style.outlineStyle === 'none' &&
                getComputedStyle(input).outlineStyle === 'none' &&
                style.getPropertyValue('--lg-field-fill') !== ${JSON.stringify(idleFill)};
        })()`),
        );
        await pickCatalog('choices');
        await cdp.click('.component-catalog glass-switch[aria-label="紧凑提醒示例"]');
        t.check(
            '紧凑开关更新示例状态，禁用开关保持关闭',
            await cdp.evaluate(`(() => {
            const active = document.querySelector('glass-switch[aria-label="紧凑提醒示例"]');
            const disabled = document.querySelector('glass-switch[aria-label="禁用提醒示例"]');
            return active.checked === false && active.parentElement.querySelector('output').textContent === '关闭' &&
                disabled.hasAttribute('disabled') && disabled.checked === false;
        })()`),
        );
        await pickCatalog('surfaces');
        t.check(
            '表格滚动后表头仍停留在可视区顶部',
            await cdp.evaluate(`(async () => {
            const frame = document.querySelector('.sample-table-scroll');
            const head = frame.querySelector('thead');
            const previous = frame.scrollTop;
            try {
                frame.scrollTop = 100;
                await new Promise(requestAnimationFrame);
                return frame.scrollTop > 0 &&
                    Math.abs(head.getBoundingClientRect().top - frame.getBoundingClientRect().top) <= 2;
            } finally {
                frame.scrollTop = previous;
            }
        })()`),
        );
        await pickCatalog('cards');
        await cdp.click('.component-catalog .sample-card .price-history-trigger');
        try {
            await ui.waitFor(`!!document.querySelector('${sheet}[data-visible]')`);
            t.check(
                '弹层使用比 Dock 更厚的玻璃，并模糊遮罩下的页面',
                await cdp.evaluate(`(() => {
                    const sheet = document.querySelector('${sheet}');
                    const scrim = sheet.shadowRoot.querySelector('[part="scrim"]');
                    const bar = document.querySelector('${dock} glass-tab-bar');
                    return sheet.getAttribute('material') === 'regular' &&
                        Number(sheet.getAttribute('blur')) > Number(bar.getAttribute('blur')) &&
                        getComputedStyle(scrim).backdropFilter.includes('blur(');
                })()`),
            );
        } finally {
            await cdp.key('Escape');
            await ui.waitFor(`!document.querySelector('${sheet}[data-visible]')`);
        }
    } finally {
        await cdp.click(tab('settings'));
        await ui.waitFor(
            `${ready('settings')} && !!document.querySelector('.liquid-settings glass-segment[role="tab"]')`,
        );
        await cdp.click(themeOption(initialTheme));
        await cdp.evaluate(
            savedWallpaper === null
                ? "localStorage.removeItem('mh-liquid-wallpaper')"
                : `localStorage.setItem('mh-liquid-wallpaper', ${JSON.stringify(savedWallpaper)})`,
        );
        await ui.reload({ waitFor: '.liquid-dock' });
    }

    const previousShell = await cdp.evaluate("localStorage.getItem('mh-app-shell')");
    const glassOptions = 'glass-segmented[aria-label="界面"]';
    const classicOptions = '[role="radiogroup"][aria-label="界面"]';
    const toClassic = `${glassOptions} glass-segment[value="legacy"]`;
    const toGlass = `${classicOptions} button:first-child`;
    try {
        await ui.waitFor(`!!document.querySelector('${toClassic}')`);
        const beforeClassic = await cdp.timeOrigin();
        await cdp.click(toClassic);
        await cdp.waitForReload(beforeClassic, { waitFor: toGlass });
        t.check(
            '切换经典账簿后重新加载设置页并应用账簿基础样式',
            await cdp.evaluate(`location.hash === '#/settings' && !!document.querySelector('.rail-nav') &&
                localStorage.getItem('mh-app-shell') === 'legacy' &&
                document.querySelector('${classicOptions} button[aria-checked="true"]')?.textContent.trim() === '经典账簿' &&
                getComputedStyle(document.querySelector('.app-root')).display === 'flex' &&
                getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() !== ''`),
        );
        await ui.reload({ waitFor: toGlass });
        const beforeGlass = await cdp.timeOrigin();
        await cdp.click(toGlass);
        await cdp.waitForReload(beforeGlass, { waitFor: toClassic });
        t.check(
            '再次启动记住经典账簿，切回后恢复玻璃基础样式',
            await cdp.evaluate(`location.hash === '#/settings' && !!document.querySelector('.liquid-dock') &&
                localStorage.getItem('mh-app-shell') === 'liquid' &&
                !!document.querySelector('${glassOptions} glass-segment[value="liquid"][aria-selected="true"]') &&
                getComputedStyle(document.querySelector('.liquid-app')).getPropertyValue('--lg-field-fill').trim() !== ''`),
        );
    } finally {
        await cdp.evaluate(
            previousShell === null
                ? "localStorage.removeItem('mh-app-shell')"
                : `localStorage.setItem('mh-app-shell', ${JSON.stringify(previousShell)})`,
        );
        await ui.reload({ waitFor: '.liquid-dock' });
    }
}

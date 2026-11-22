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
    const waitHistory = (title) => ui.waitFor(`!!document.querySelector('${history}') &&
        document.querySelector('${header} h2').textContent.trim() === ${JSON.stringify(title)}`);
    const choose = async (menu, value) => {
        await cdp.click(`${menu} [slot="trigger"]`);
        await ui.waitFor(`!!document.querySelector('${menu}[open]')`);
        await cdp.evaluate(`document.querySelector('${menu}[open] [value="${value}"]').click()`);
    };
    const dateTrigger = `${editor} .glass-date-field .date-trigger`;
    const calendar = `${editor} .date-panel:popover-open`;
    const itemMenu = (title) => `.price-card-header glass-menu:has([aria-label="${title}的物品操作"])`;
    const waitClosed = () => ui.waitFor(`!document.querySelector('${sheet}:is([open], [data-visible])')`);
    const rowMenu = `${history} tbody tr:first-child glass-menu`;

    await cdp.click('.liquid-prices .price-add');
    await ui.waitFor(`!!document.querySelector('${nameInput}')`);
    await ui.fillSel(nameInput, name);
    await ui.fillSel(noteInput, '原备注');
    await ui.fillSel(price, '12');
    await save();
    await ui.waitFor(`!!document.querySelector('${historyButton(name)}') && !document.querySelector('${sheet}:is([open], [data-visible])')`);
    await ui.clickLabel(`更新${name}的价格`);
    await ui.waitFor(`!!document.querySelector('${sheet}:is([open], [data-visible]) .glass-price-field input')`);
    t.check('卡片记价自动带入当前的 12 万', await cdp.evaluate(`document.querySelector('${price}').value === '12'`));
    await ui.fillSel(price, '18');
    const desktopMotion = await cdp.evaluate(`document.querySelector('${sheet}').matches('dialog:modal') &&
        matchMedia('(prefers-reduced-motion: no-preference)').matches`);
    if (desktopMotion) {
        const leaving = await cdp.evaluate(`(async () => {
            const dialog = document.querySelector('${sheet}');
            await Promise.all(dialog.getAnimations().map(animation => animation.finished));
            const closed = new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
            dialog.querySelector('footer glass-button:first-child').click();
            await closed;
            const shrinking = dialog.getAnimations().some(animation => animation.transitionProperty === 'transform');
            return !dialog.open && dialog.getClientRects().length > 0 && shrinking;
        })()`);
        t.check('取消记价后表单在退出动画期间仍然可见', leaving);
        await ui.waitFor(`!document.querySelector('${sheet}').getClientRects().length`);
    } else {
        await cdp.click(`${editor} footer glass-button:first-child`);
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
    t.check('物品菜单展开时三点按钮透明可见，小号面板在选项四周留白', await cdp.evaluate(`(() => {
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
    })()`));
    t.check('三点菜单向右下展开，贴近视口边缘时避让', await cdp.evaluate(`(() => {
        const node = document.querySelector('${menu}');
        const anchor = node.querySelector('[slot="trigger"]').getBoundingClientRect();
        const panel = node.shadowRoot.querySelector('[part="panel"]').getBoundingClientRect();
        const left = Math.max(8, Math.min(anchor.left, document.documentElement.clientWidth - 8 - panel.width));
        const below = window.innerHeight - anchor.bottom - 16;
        const top = panel.height <= below + 1 || below >= anchor.top - 16 ? anchor.bottom + 8 : anchor.top - 8 - panel.height;
        return Math.abs(panel.left - left) < 2 && Math.abs(panel.top - top) < 2 && node.getAttribute('placement') === 'bottom-start';
    })()`));
    const menuFadeEnabled = () => cdp.evaluate(`(() => {
        const panel = document.querySelector('${menu}').shadowRoot.querySelector('[part="panel"]');
        const style = getComputedStyle(panel);
        return matchMedia('(prefers-reduced-motion: reduce)').matches ||
            (style.transitionProperty === 'opacity' && parseFloat(style.transitionDuration) >= 0.15);
    })()`);
    t.check('三点菜单展开有淡入过渡', await menuFadeEnabled());
    await cdp.click(`${menu} [slot="trigger"]`);
    t.check('三点菜单收起有淡出过渡', await menuFadeEnabled());
    await ui.waitFor(`(() => {
        const node = document.querySelector('${menu}');
        return !node.open && getComputedStyle(node.shadowRoot.querySelector('[part="panel"]')).opacity === '0';
    })()`);
    await choose(menu, 'edit');
    await ui.waitFor(`document.querySelector('${nameInput}')?.value === ${JSON.stringify(name)}`);
    t.check('编辑物品回填资料，价格和记录日期仅在记价时出现', await cdp.evaluate(`
        document.querySelector('${noteInput}').value === '原备注' &&
        !document.querySelector('${price}, ${dateTrigger}')`));
    await ui.fillSel(nameInput, renamed);
    await ui.fillSel(noteInput, '新备注');
    const group = `${editor} .glass-select:first-of-type glass-menu`;
    const otherGroup = await cdp.evaluate(`document.querySelector('${group} glass-menu-item:not([checked])').value`);
    await choose(group, otherGroup);
    const sub = `${editor} glass-menu:has([value="__custom_subcategory__"])`;
    await choose(sub, '__custom_subcategory__');
    await ui.fillSel(`${editor} .glass-select + label input`, '烟测子类');
    await save();
    await waitClosed();
    await cdp.click(historyButton(renamed));
    await waitHistory(renamed);
    await ui.clickText(`${header} glass-button`, '记价', { exact: true });
    await ui.waitFor(`!!document.querySelector('${price}')`);
    t.check('历史记价带入当前金额', await cdp.evaluate(`document.querySelector('${price}').value === '12'`));
    await cdp.key('Escape');
    await waitHistory(renamed);
    t.check('物品操作位于卡片右上角，历史标题收起该菜单', await ui.exists(itemMenu(renamed)) && !(await ui.exists(`${header} glass-menu`)));
    t.check('修改名称、分类、子类和备注后保留原有价格记录', await cdp.evaluate(`(() => {
        const card = document.querySelector('${historyButton(renamed)}').closest('.price-card');
        return card.querySelector('.price-category').textContent.trim() === ${JSON.stringify(otherGroup)} &&
            card.querySelector('.price-subcategory').textContent.trim() === '烟测子类' &&
            card.querySelector('.price-note').textContent.trim() === '新备注' &&
            document.querySelectorAll('${history} tbody tr').length === 1 &&
            document.querySelector('${history} tbody').textContent.includes('12 万');
    })()`));

    await cdp.click(`${history} tbody .price-history-action glass-button`);
    await ui.waitFor(`!!document.querySelector('${price}')`);
    t.check('历史行内编辑回填原有金额', await cdp.evaluate(`document.querySelector('${price}').value === '12'`));
    await cdp.click(dateTrigger);
    await ui.waitFor(`document.activeElement?.matches('${calendar} .day[aria-pressed="true"]')`);
    t.check('月历与分类菜单共用面板底色和玻璃边缘，按动效偏好从日期按钮展开', await cdp.evaluate(`(() => {
        const panel = document.querySelector('${calendar}');
        const menu = document.querySelector('.price-filters glass-menu').shadowRoot.querySelector('[part="panel"]');
        const style = getComputedStyle(panel);
        const animated = matchMedia('(prefers-reduced-motion: no-preference)').matches;
        return style.backgroundColor === getComputedStyle(menu).backgroundColor &&
            !!panel.querySelector('gl-fx > .r') && !!style.getPropertyValue('--date-anchor-transform').trim() &&
            (!animated || (style.transitionProperty.includes('transform') && parseFloat(style.transitionDuration) > 0));
    })()`));
    await cdp.key('Escape');
    await ui.waitFor(`document.activeElement === document.querySelector('${dateTrigger}') && !document.querySelector('${calendar}')`);
    t.check('收起期间月历退出键盘操作，焦点回到记价表单', await cdp.evaluate(`
        document.querySelector('${editor} .date-panel').inert &&
        document.querySelector('${dateTrigger}').getAttribute('aria-expanded') === 'false' &&
        !!document.querySelector('${price}')`));
    await cdp.key('ArrowDown');
    await ui.waitFor(`document.activeElement?.matches('${calendar} .day')`);
    await cdp.key('PageDown');
    await cdp.key('Enter');
    await ui.waitFor(`!document.querySelector('${calendar}')`);
    const chosenDate = await cdp.evaluate(`document.querySelector('${dateTrigger} time').dateTime`);
    await ui.fillSel(price, '23');
    await save();
    await waitHistory(renamed);
    t.check('月历所选日期写回编辑的记录', await cdp.evaluate(`document.querySelector('${history} tbody time').dateTime === ${JSON.stringify(chosenDate)}`));
    await choose(rowMenu, 'remove');
    await ui.waitFor(`document.querySelector('${confirm} p')?.textContent.includes('23 万')`);
    await cdp.key('Escape');
    await waitHistory(renamed);
    t.check('取消删除保留这笔记录', (await ui.count(`${history} tbody tr`)) === 1);
    await choose(rowMenu, 'remove');
    await cdp.click(`${confirm} .confirm-removal`);
    await waitHistory(renamed);
    t.check('删除唯一一笔后历史显示空态', await cdp.evaluate(`document.querySelectorAll('${history} tbody tr').length === 0 &&
        !!document.querySelector('${history} .glass-empty-state')`));

    await ui.clickText(`${header} glass-button`, '记价', { exact: true });
    await ui.waitFor(`!!document.querySelector('${price}')`);
    await ui.fillSel(price, '31');
    await save();
    await waitHistory(renamed);
    t.check('空历史记价成功后返回同一物品并显示新增记录', await cdp.evaluate(
        `document.querySelectorAll('${history} tbody tr').length === 1 &&
        document.querySelector('${history} tbody').textContent.includes('31 万')`,
    ));

    await ui.clickText(`${header} glass-button`, '关闭', { exact: true });
    await waitClosed();
    await choose(itemMenu(renamed), 'remove');
    await ui.waitFor(`document.querySelector('${confirm} p')?.textContent.includes(${JSON.stringify(renamed)})`);
    t.check('整件删除确认写明物品名，默认焦点落在取消', await cdp.evaluate(`
        document.querySelector('${confirm} p').textContent.includes(${JSON.stringify(renamed)}) &&
        document.activeElement === document.querySelector('${confirm} footer glass-button')`));
    await cdp.click(`${confirm} footer glass-button:first-child`);
    await waitClosed();
    t.check('取消删除物品后焦点回到原卡片的菜单', await cdp.evaluate(`document.activeElement === document.querySelector('${itemMenu(renamed)} [slot="trigger"]')`));
    await choose(itemMenu(renamed), 'remove');
    await cdp.click(`${confirm} .confirm-removal`);
    await ui.waitFor(`!document.querySelector('${historyButton(renamed)}') && !document.querySelector('${sheet}:is([open], [data-visible])')`);
    t.check('删除样本物品后返回物价列表', await ui.exists('.liquid-prices .price-add:not([disabled])'));
}

async function checkPrices({ cdp, t, ui }) {
    const page = '.liquid-prices';
    const filters = `${page} .price-filters`;
    const emptyState = `${page} > .price-empty`;
    await ui.waitFor(`!!document.querySelector('${filters}, ${emptyState}, ${page} [role="alert"]')`);
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
        await ui.waitFor(`!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`);
        t.check(
            '顶部加号打开新增物品，页头没有数量统计',
            await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '新增物品' &&
                !document.querySelector('${page} .price-page-header').textContent.includes('件物品')`),
        );
        t.check('居中新增弹窗和遮罩随系统动效偏好淡入', await cdp.evaluate(`(() => {
            const dialog = document.querySelector('${sheet}');
            if (dialog.localName !== 'dialog') return true;
            const panel = getComputedStyle(dialog);
            const backdrop = getComputedStyle(dialog, '::backdrop');
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                return [panel, backdrop].every(style => parseFloat(style.transitionDuration) <= 0.001);
            }
            return panel.transitionProperty.includes('transform') && [panel, backdrop].every(style =>
                style.transitionProperty.includes('opacity') && parseFloat(style.transitionDuration) > 0.1);
        })()`));
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
        await ui.waitFor(`document.activeElement === document.querySelector('${editor} input[aria-invalid="true"]')`);
        t.check('空名称提交后，焦点和错误提示都指向名称输入框', await cdp.evaluate(`(() => {
            const input = document.activeElement;
            return input === document.querySelector('${editor} input') &&
                !!document.getElementById(input.getAttribute('aria-describedby'))?.textContent.trim();
        })()`));
        const initialField = `${editor} .glass-price-field`;
        t.check('初始价可留空，减价在零值时不可用', await cdp.evaluate(
            `document.querySelector('${initialField} input').value === '' &&
                !!document.querySelector('${initialField} [aria-label="减 1 万"][disabled]')`,
        ));
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
            await cdp.evaluate(`document.querySelector('${emptyState}')?.textContent.trim() === '暂无数据' &&
                !!document.querySelector('${page} .price-add:not([disabled])') && !document.querySelector('${filters}')`),
        );
        await cdp.click(`${page} .price-add`);
        await ui.waitFor(`!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`);
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
    t.check('未选一级分类时只显示一个分类控件', await cdp.evaluate(
        `document.querySelector('${filters} glass-menu-item[checked]').value !== '' ||
            document.querySelectorAll('${filters} glass-menu').length === 1`,
    ));

    // 直接选择已有分类，经过菜单的选择事件，不写入物品或流水。
    const select = async (index, value) => {
        await cdp.evaluate(`document.querySelectorAll('${filters} .glass-select-trigger')[${index}].click()`);
        await ui.waitFor(`!!document.querySelector('${filters} glass-menu[open]')`);
        await cdp.evaluate(`[...document.querySelectorAll('${filters} glass-menu[open] glass-menu-item')]
            .find(item => item.value === ${JSON.stringify(value)}).click()`);
    };
    await select(0, first.category);
    if (await ui.exists(`${filters} .glass-select:nth-of-type(2)`)) {
        t.check('二级分类标签不占行，读屏名称仍与当前选项关联', await cdp.evaluate(`(() => {
            const group = document.querySelectorAll('${filters} .glass-select')[1];
            const label = group.querySelector('label');
            const trigger = group.querySelector('.glass-select-trigger');
            return label.textContent.trim() === '二级分类' && !label.getClientRects().length &&
                trigger.getAttribute('aria-labelledby').split(' ').includes(label.id);
        })()`));
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
    t.check('仅选择分类也能从最后一个选择器之后重置', await cdp.evaluate(
        `document.querySelector('${reset}')?.previousElementSibling?.matches('.lg-category-filter') === true`,
    ));
    const search = `${filters} glass-search`;
    await cdp.click(search);
    await cdp.send('Input.insertText', { text: `不存在的搜索词${Date.now()}` });
    await ui.waitFor(`document.querySelector('${emptyState}')?.textContent.trim() === '暂无数据'`);
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
        await ui.waitFor(`!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-editor')`);
        t.check('记价时价格在日期上方整行居中，数字和万字一起居中', await cdp.evaluate(`(() => {
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
        })()`));
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
        await ui.waitFor(`!!document.querySelector('${sheet}:is([open], [data-visible]) .liquid-price-history')`);
        t.check(
            '历史弹层显示所选物品和走势及流水，或未记价提示',
            await cdp.evaluate(`(() => {
                const sheet = document.querySelector('${sheet}');
                return sheet.matches('glass-sheet[detents="536"]') &&
                    sheet.querySelector('h2').textContent.trim() === ${JSON.stringify(first.name)} &&
                    (!!sheet.querySelector('.liquid-price-history .glass-empty-state') ||
                        (!!sheet.querySelector('.chart-svg') && !!sheet.querySelector('tbody tr')));
            })()`),
        );
        const next = `${sheet} .price-history-pager [aria-label="下一页"]`;
        const hasSecondPage = await ui.exists(next);
        if (hasSecondPage) {
            t.check('完整页显示五条价格记录', await cdp.evaluate(
                `document.querySelectorAll('${sheet} tbody tr').length === 5`,
            ));
            await cdp.click(next);
            await ui.waitFor(`document.querySelector('${sheet} .price-history-pager span').textContent.trim().startsWith('2 /')`);
            t.check('下一页切换记录，上一页可用', await cdp.evaluate(
                `document.querySelectorAll('${sheet} tbody tr').length > 0 &&
                    document.querySelectorAll('${sheet} tbody tr').length <= 5 &&
                    !!document.querySelector('${sheet} [aria-label="上一页"]:not([disabled])')`,
            ));
        }
        await ui.clickText(`${sheet} .history-tools glass-button`, '记价', { exact: true });
        await ui.waitFor(`!!document.querySelector('${editor}')`);
        await cdp.click(`${editor} footer glass-button[variant="plain"]`);
        await ui.waitFor(`!!document.querySelector('${sheet} .price-history-header')`);
        t.check('取消记价保留历史页码', await cdp.evaluate(`${!hasSecondPage} ||
            document.querySelector('${sheet} .price-history-pager span').textContent.trim().startsWith('2 /')`));
        const edit = `${sheet} tbody .price-history-action glass-button`;
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
            t.check('取消和 Esc 返回历史后保留页码，编辑和关闭按钮文字无阴影', await cdp.evaluate(`(() => {
                const sheet = document.querySelector('${sheet}');
                const buttons = sheet.querySelectorAll('.price-history-header glass-button, tbody glass-button');
                return (${!hasSecondPage} || sheet.querySelector('.price-history-pager span').textContent.trim().startsWith('2 /')) &&
                    [...buttons].every(button => getComputedStyle(button).textShadow === 'none');
            })()`));
            for (const gesture of ['遮罩', '下拉']) {
                await ui.waitFor(`!!document.querySelector('${edit}')`);
                await cdp.click(edit);
                await ui.waitFor(`!!document.querySelector('${editor}')`);
                if (gesture === '遮罩') {
                    await cdp.evaluate(`document.querySelector('${sheet}').shadowRoot.querySelector('[part="scrim"]').click()`);
                } else {
                    const { x, y, bottom } = await cdp.evaluate(`(() => {
                        const grip = document.querySelector('${sheet}').shadowRoot.querySelector('[part="grabber"]').getBoundingClientRect();
                        return { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2, bottom: innerHeight - 2 };
                    })()`);
                    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
                    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: bottom, buttons: 1 });
                    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: bottom, button: 'left', clickCount: 1 });
                }
                await ui.waitFor(`!!document.querySelector('${sheet}[open] .price-history-header')`);
                t.check(gesture + '关闭编辑时回到原历史页码', await cdp.evaluate(`
                    !!document.querySelector('${edit}') && (${!hasSecondPage} ||
                    document.querySelector('${sheet} .price-history-pager span').textContent.trim().startsWith('2 /'))`));
            }
            if (hasSecondPage) {
                await cdp.click(`${sheet} [aria-label="上一页"]`);
                await ui.waitFor(`!!document.querySelector('${sheet} [aria-label="上一页"][disabled]')`);
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
    const ready = (key) =>
        `location.hash === '#/${key}' && !!document.querySelector('${tab(key)}[aria-selected="true"]')`;
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
        await ui.waitFor(`!!document.querySelector('.liquid-prices .price-card, .liquid-prices .price-empty')`);
        t.check('Dock 返回物价恢复原列表位置', await cdp.evaluate(`Math.abs(document.querySelector('.liquid-content').scrollTop - ${scrollTop}) < 1`));
    }

    for (const key of [
        'overview',
        'income',
        'accounts',
        'characters',
        'goals',
        'tools',
    ]) {
        await cdp.click(tab(key));
        await ui.waitFor(ready(key));
        t.check(
            `${key} 暂为空白页`,
            await cdp.evaluate(`!document.querySelector('.liquid-content').textContent.trim()`),
        );
    }

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
    await ui.waitFor(`!!document.querySelector('.component-catalog glass-switch[role="switch"]')`);
    t.check(
        '连点设置五次进入组件目录，页面默认在应用壁纸上展示全部独立示例',
        await cdp.evaluate(`${atComponents()} &&
            !document.querySelector('.component-catalog input[type=radio]') &&
            !!document.querySelector('.component-catalog .glass-select-trigger') &&
            !!document.querySelector('.component-catalog .glass-input input') &&
            !!document.querySelector('.component-catalog .glass-price-field.compact') &&
            !!document.querySelector('.component-catalog .sample-card .price-history-trigger') &&
            !!document.querySelector('.component-catalog .gallery > section .glass-empty-state')`),
    );

    t.check('示例复用卡内操作、表单和筛选尺寸，金额保留标准与紧凑两档', await cdp.evaluate(`(() => {
        const gallery = document.querySelector('.component-catalog .gallery');
        const height = selector => gallery.querySelector(selector).getBoundingClientRect().height;
        const near = (selector, expected) => Math.abs(height(selector) - expected) < 1;
        return near('.sample-card .lg-inline-action', 26) &&
            near('.field-example.lg-form-fields .glass-input', 32) &&
            near('.lg-price-search', 44) && near('.lg-category-filter .glass-select-face', 44) &&
            near('.lg-category-filter.lg-form-fields .glass-select-face', 32) &&
            near('.glass-price-field:not(.compact) .glass-input', 44) &&
            near('.glass-price-field.compact .glass-input', 36);
    })()`));

    const demoPrice = '.component-catalog .glass-price-field:not(.compact)';
    await cdp.click(`${demoPrice} [aria-label="加 10 万"]`);
    await ui.waitFor(`document.querySelector('${demoPrice} input').value === '330'`);
    await cdp.click(`${demoPrice} [aria-label="减 10 万"]`);
    t.check('价格示例按金额量级加减并还原为 320 万', await cdp.evaluate(
        `document.querySelector('${demoPrice} input').value === '320'`,
    ));

    t.check(
        '组件示例和 Dock 共用正式版正文、按钮、金额和小字尺寸',
        await cdp.evaluate(`(() => {
            const catalog = document.querySelector('.component-catalog');
            const text = getComputedStyle(catalog);
            const button = getComputedStyle(catalog.querySelector('glass-button'));
            const amount = getComputedStyle(catalog.querySelector('.price-card .price-value'));
            const dock = getComputedStyle(document.querySelector('.liquid-dock-bar'));
            return text.fontSize === '13.5px' && text.fontFamily.includes('MH Toolbox Rounded') &&
                button.fontSize === '12px' && button.fontWeight === '400' &&
                Math.abs(parseFloat(amount.fontSize) - 18.9) < 0.1 &&
                dock.fontSize === '11px' && dock.fontWeight === '400';
        })()`),
    );

    t.check(
        '组件示例按组件类型分组，不再按业务场景',
        await cdp.evaluate(`(() => {
            const headings = [...document.querySelectorAll('.component-catalog .gallery > h2')];
            return headings.map(item => item.textContent.trim()).join(',') ===
                '卡片,按钮与菜单,输入控件,选择控件,容器与表面,反馈与弹层';
        })()`),
    );

    t.check(
        '组件页没有独立页面标题，分组标题随画廊滚动、窗口栏保持在顶部',
        await cdp.evaluate(`(() => {
            const catalog = document.querySelector('.component-catalog');
            const gallery = catalog.querySelector('.gallery');
            const heading = gallery.querySelector('h2');
            const bar = document.querySelector('.liquid-app > :is(.titlebar, .liquid-header)');
            const { paddingLeft, paddingRight, gridTemplateColumns, overflowY } = getComputedStyle(gallery);
            const width = gallery.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
            const headingTop = heading.getBoundingClientRect().top;
            const barTop = bar.getBoundingClientRect().top;
            const scrollTop = gallery.scrollTop;
            gallery.scrollTop = gallery.scrollHeight;
            const scrolled = gallery.scrollHeight <= gallery.clientHeight || gallery.scrollTop > 0;
            const headingMoves = gallery.scrollTop === 0 || heading.getBoundingClientRect().top < headingTop;
            const barStays = bar.getBoundingClientRect().top === barTop;
            gallery.scrollTop = scrollTop;
            return !catalog.querySelector('.intro, h1') && !!heading && headingMoves && barStays &&
                overflowY === 'auto' && scrolled &&
                (width < 566 || gridTemplateColumns.split(' ').length > 1);
        })()`),
    );

    await cdp.evaluate('history.back()');
    await ui.waitFor(ready('settings'));
    await cdp.evaluate(`document.querySelector('${tab('settings')}').focus()`);
    await cdp.key('ArrowRight');
    await ui.waitFor(ready('overview'));
    t.check(
        '从隐藏页返回设置后，键盘切换仍同步 Dock 选中项',
        await cdp.evaluate(
            `document.activeElement === document.querySelector('${tab('overview')}')`,
        ),
    );

    await cdp.click(tab('settings'));
    await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
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
    t.check('设置页由外观与数据主卡、可折叠的关于资料组成，整页固定使用圆体',
        await cdp.evaluate(`(() => {
            const cards = [...document.querySelectorAll('.liquid-settings-grid .card-heading h2')];
            const about = document.querySelector('.settings-about');
            return cards.map(el => el.textContent.trim()).join(',') === '外观,数据' &&
                !!about?.querySelector('.license-links a') &&
                [...about.querySelectorAll('details')].every(el => !el.open) &&
                getComputedStyle(about).fontFamily.includes('MH Toolbox Rounded');
        })()`),
    );
    const desktop = await cdp.evaluate("'__TAURI_INTERNALS__' in window");
    t.check('账本操作与当前环境的能力一致', await cdp.evaluate(`(() => {
        const actions = [...document.querySelectorAll('.liquid-settings-panel:nth-child(2) glass-button')];
        return actions.length === 5 && actions.every(el => el.hasAttribute('disabled') === ${!desktop});
    })()`));
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
    const initialTheme = await cdp.evaluate("document.querySelector('.liquid-app').dataset.appearance");
    const theme = initialTheme === 'light' ? 'dark' : 'light';
    const themeOption = (value) =>
        `.liquid-settings #liquid-theme-label + glass-segmented [value="${value}"]`;
    try {
        await cdp.click(themeOption(theme));
        await ui.reload();
        await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
        t.check(
            '刷新后恢复主题，设置仅提供一组分段切换，Dock 使用通透材质',
            await cdp.evaluate(`${ready('settings')} &&
                document.querySelector('.liquid-app').dataset.appearance === ${JSON.stringify(theme)} &&
                document.querySelectorAll('.liquid-settings glass-segmented').length === 1 &&
                document.querySelector('.liquid-dock-bar').getAttribute('material') === 'clear'`),
        );
        // 刷新后仍停在设置页，直接连点五次即可重新进入隐藏目录。
        await tapSettings(5);
        await ui.waitFor(
            `!!document.querySelector('.component-catalog glass-switch[role="switch"]')`,
        );
        t.check(
            '组件示例卡片使用通透材质',
            await cdp.evaluate(
                `document.querySelector('.component-catalog .sample-card').getAttribute('material') === 'clear'`,
            ),
        );
        await cdp.click('.component-catalog glass-switch');
        t.check(
            '开关同步更新 Vue 状态',
            await cdp.evaluate(`document.querySelector('.component-catalog glass-switch').checked === false &&
                document.querySelector('.component-catalog .setting-row output').textContent.trim() === '关闭'`),
        );

        const sheet = '.component-catalog .sample-history';
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
        await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
        await cdp.click(themeOption(initialTheme));
    }
}

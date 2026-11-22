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
        '物价标题、搜索框和分类标签沿用正式版字号刻度',
        await cdp.evaluate(`(() => {
            const filters = document.querySelector('${filters}');
            const search = filters.querySelector('glass-search').shadowRoot.querySelector('input');
            const title = document.querySelector('#liquid-prices-title');
            return getComputedStyle(title).fontSize === '14.5px' &&
                getComputedStyle(search).fontSize === '13.5px' &&
                getComputedStyle(filters.querySelector('.glass-select label')).fontSize === '11px';
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
            return box(field).bottom <= box(form.querySelector('input[type="date"]')).top &&
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
        const edit = `${sheet} tbody .price-history-action glass-button`;
        if (await ui.exists(edit)) {
            await cdp.click(edit);
            await ui.waitFor(`!!document.querySelector('${editor}')`);
            t.check(
                '历史里的编辑打开已记日期和价格',
                await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '编辑价格记录' &&
                    !!document.querySelector('${editor} [type="date"]').value &&
                    Number(document.querySelector('${editor} [inputmode="decimal"]').value) > 0 &&
                    !!document.querySelector('${editor} .glass-input [type="date"]')`),
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

    await ui.waitFor(`!!document.querySelector('${dock} glass-tab[role="tab"]')`);
    t.check(
        'Dock 复用标签栏透镜和原菜单顺序',
        await cdp.evaluate(`(() => {
            const nav = document.querySelector('${dock}');
            const bar = nav.querySelector('glass-tab-bar');
            return [...bar.querySelectorAll('glass-tab')].map(item => item.value).join(',') ===
                'overview,income,accounts,characters,prices,goals,tools,components,settings' &&
                getComputedStyle(nav).position === 'fixed' &&
                bar.getBoundingClientRect().height <= 50 &&
                !!bar.shadowRoot?.querySelector('[part="lens"]');
        })()`),
    );

    await cdp.click(tab('prices'));
    await ui.waitFor(ready('prices'));
    await checkPrices({ cdp, t, ui });

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

    await cdp.click(tab('components'));
    await ui.waitFor(`!!document.querySelector('.component-catalog glass-switch[role="switch"]')`);
    t.check(
        '组件页默认在应用壁纸上展示全部独立示例',
        await cdp.evaluate(`${ready('components')} &&
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
        '组件示例按可用宽度排布，滚动时页面标题和窗口栏保持在顶部',
        await cdp.evaluate(`(() => {
            const gallery = document.querySelector('.component-catalog .gallery');
            const intro = document.querySelector('.component-catalog .intro');
            const bar = document.querySelector('.liquid-app > :is(.titlebar, .liquid-header)');
            const { paddingLeft, paddingRight, gridTemplateColumns, overflowY } = getComputedStyle(gallery);
            const width = gallery.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
            const introTop = intro.getBoundingClientRect().top;
            const barTop = bar.getBoundingClientRect().top;
            const scrollTop = gallery.scrollTop;
            gallery.scrollTop = gallery.scrollHeight;
            const scrolled = gallery.scrollHeight <= gallery.clientHeight || gallery.scrollTop > 0;
            const headersStay = intro.getBoundingClientRect().top === introTop &&
                bar.getBoundingClientRect().top === barTop;
            gallery.scrollTop = scrollTop;
            return overflowY === 'auto' && scrolled && headersStay &&
                (width < 566 || gridTemplateColumns.split(' ').length > 1);
        })()`),
    );

    await cdp.evaluate('history.back()');
    await ui.waitFor(ready('tools'));
    await cdp.evaluate(`document.querySelector('${tab('tools')}').focus()`);
    await cdp.key('ArrowRight');
    await ui.waitFor(ready('components'));
    t.check(
        '历史返回与键盘切换都同步 Dock 选中项',
        await cdp.evaluate(
            `document.activeElement === document.querySelector('${tab('components')}')`,
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
    const initialTheme = await cdp.evaluate("document.querySelector('.liquid-app').dataset.appearance");
    const theme = initialTheme === 'light' ? 'dark' : 'light';
    const themeOption = (value) =>
        `.liquid-settings #liquid-theme-label + glass-segmented [value="${value}"]`;
    try {
        await cdp.click(themeOption(theme));
        await ui.reload();
        await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
        t.check(
            '刷新后恢复主题，设置页仅提供主题分段切换，Dock 使用通透材质',
            await cdp.evaluate(`${ready('settings')} &&
                document.querySelector('.liquid-app').dataset.appearance === ${JSON.stringify(theme)} &&
                document.querySelectorAll('.liquid-settings glass-segmented').length === 1 &&
                document.querySelector('.liquid-dock-bar').getAttribute('material') === 'clear'`),
        );
        await cdp.click(tab('components'));
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

async function checkPrices({ cdp, t, ui }) {
    const page = '.liquid-prices';
    const filters = `${page} .price-filters`;
    await ui.waitFor(`!!document.querySelector('${filters}, ${page} [role="alert"]')`);
    const loaded = await cdp.evaluate(`!!document.querySelector('${filters}')`);
    t.check('物价页读取账本并展示筛选入口', loaded);
    if (!loaded) return;

    t.check(
        '物价标题、搜索框和分类标签沿用正式版字号刻度',
        await cdp.evaluate(`(() => {
            const filters = document.querySelector('${filters}');
            const search = filters.querySelector('glass-search').shadowRoot.querySelector('input');
            const title = document.querySelector('#liquid-prices-title');
            return getComputedStyle(title).fontSize === '14.5px' &&
                getComputedStyle(search).fontSize === '13.5px' &&
                getComputedStyle(filters.querySelector('label span')).fontSize === '11px';
        })()`),
    );
    const sheet = `${page} .price-history-sheet`;
    const editor = `${sheet} .liquid-price-editor`;
    const closeSheet = async () => {
        await cdp.key('Escape');
        await ui.waitFor(`!document.querySelector('${sheet}[data-visible]')`);
    };
    await cdp.click(`${page} .price-add`);
    try {
        await ui.waitFor(`!!document.querySelector('${sheet}[data-visible] .liquid-price-editor')`);
        t.check(
            '顶部加号打开新增物品，页头没有数量统计',
            await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '新增物品' &&
                !document.querySelector('${page} .price-page-header').textContent.includes('件物品')`),
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
            '空账本显示空态',
            await cdp.evaluate(`document.querySelector('${page} .price-state').textContent.includes('还没有物品')`),
        );
        return;
    }

    // 使用账本已有分类检验筛选，不为烟测写入物品或流水。
    const select = (index, value) =>
        cdp.evaluate(`(() => {
            const field = document.querySelectorAll('${filters} select')[${index}];
            field.value = ${JSON.stringify(value)};
            field.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
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

    const search = `${filters} glass-search`;
    await cdp.click(search);
    await cdp.send('Input.insertText', { text: `不存在的搜索词${Date.now()}` });
    const reset = `${page} .price-state glass-button`;
    await ui.waitFor(`!!document.querySelector('${reset}')`);
    t.check(
        '搜索无匹配时保留筛选，并区分无结果和空账本',
        await cdp.evaluate(`document.querySelector('${page} .price-state').textContent.includes('没有符合筛选')`),
    );
    await cdp.click(reset);

    await cdp.click(`${card} .price-update-trigger`);
    try {
        await ui.waitFor(`!!document.querySelector('${sheet}[data-visible] .liquid-price-editor')`);
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
        await ui.waitFor(`!!document.querySelector('${sheet}[data-visible] .liquid-price-history')`);
        t.check(
            '历史弹层显示所选物品和走势及流水，或未记价提示',
            await cdp.evaluate(`(() => {
                const sheet = document.querySelector('${sheet}');
                return sheet.querySelector('h2').textContent.trim() === ${JSON.stringify(first.name)} &&
                    (!!sheet.querySelector('.price-history-empty') ||
                        (!!sheet.querySelector('.chart-svg') && !!sheet.querySelector('tbody tr')));
            })()`),
        );
        const edit = `${sheet} tbody .price-history-action glass-button`;
        if (await ui.exists(edit)) {
            await cdp.click(edit);
            await ui.waitFor(`!!document.querySelector('${editor}')`);
            t.check(
                '历史里的编辑打开已记日期和价格',
                await cdp.evaluate(`document.querySelector('${editor} h2').textContent.trim() === '编辑价格记录' &&
                    !!document.querySelector('${editor} [type="date"]').value &&
                    Number(document.querySelector('${editor} [inputmode="decimal"]').value) > 0`),
            );
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
        '组件页展示全部独立示例',
        await cdp.evaluate(`${ready('components')} &&
            document.querySelectorAll('.component-catalog .gallery > section').length === 12`),
    );

    t.check(
        '组件示例和 Dock 共用正式版正文、按钮、金额和小字尺寸',
        await cdp.evaluate(`(() => {
            const catalog = document.querySelector('.component-catalog');
            const text = getComputedStyle(catalog);
            const button = getComputedStyle(catalog.querySelector('glass-button'));
            const amount = getComputedStyle(catalog.querySelector('.quote strong'));
            const dock = getComputedStyle(document.querySelector('.liquid-dock-bar'));
            return text.fontSize === '13.5px' && text.fontFamily.includes('MH Toolbox Rounded') &&
                button.fontSize === '12px' && button.fontWeight === '400' &&
                Math.abs(parseFloat(amount.fontSize) - 18.9) < 0.1 &&
                dock.fontSize === '10px' && dock.fontWeight === '400';
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
    const initial = await cdp.evaluate(`(() => {
        const { appearance, lgMode } = document.querySelector('.liquid-app').dataset;
        return { appearance, material: lgMode };
    })()`);
    const theme = initial.appearance === 'light' ? 'dark' : 'light';
    const material = initial.material === 'frosted' ? 'clear' : 'frosted';
    const themeOption = (value) =>
        `.liquid-settings #liquid-theme-label + glass-segmented [value="${value}"]`;
    const materialOption = (value) =>
        `.liquid-settings #liquid-material-label + glass-segmented [value="${value}"]`;
    try {
        await cdp.click(themeOption(theme));
        await cdp.click(materialOption(material));
        await ui.reload();
        await ui.waitFor(`!!document.querySelector('.liquid-settings glass-segment[role="tab"]')`);
        t.check(
            '设置里的主题与材质刷新后恢复，Dock 使用全局材质',
            await cdp.evaluate(`${ready('settings')} &&
                document.querySelector('.liquid-app').dataset.appearance === ${JSON.stringify(theme)} &&
                document.querySelector('.liquid-dock-bar').dataset.lgMode === ${JSON.stringify(material)}`),
        );
        await cdp.click(tab('components'));
        await ui.waitFor(
            `!!document.querySelector('.component-catalog glass-switch[role="switch"]')`,
        );
        t.check(
            '组件预览随全局材质切换',
            await cdp.evaluate(
                `document.querySelector('.component-catalog glass-switch').dataset.lgMode === ${JSON.stringify(material)}`,
            ),
        );
        await cdp.click('.component-catalog glass-switch');
        t.check(
            '开关同步更新 Vue 状态',
            await cdp.evaluate(`document.querySelector('.component-catalog glass-switch').checked === false &&
                document.querySelector('.component-catalog').textContent.includes('无线网络已关闭')`),
        );

        const sheet = '.component-catalog glass-sheet';
        await cdp.click('.component-catalog glass-button[variant="prominent"]');
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
        await cdp.click(themeOption(initial.appearance));
        await cdp.click(materialOption(initial.material));
    }
}

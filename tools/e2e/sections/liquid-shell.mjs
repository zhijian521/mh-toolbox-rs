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

    for (const key of [
        'overview',
        'income',
        'accounts',
        'characters',
        'prices',
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

export function createIncomeTools(ctx) {
    const { cdp, ui, sleep } = ctx;

    const autoIncomeMatches = () =>
        cdp.waitFor(
            `(async () => {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        const [income, accounts] = await Promise.all([invoke('income_load'), invoke('account_load')]);
        const net = new Map();
        for (const one of income.entries) {
            const key = JSON.stringify([one.date, one.characterId]);
            net.set(key, (net.get(key) || 0) + (one.kind === 'expense' ? -one.amount : one.amount));
        }
        const expected = [...net].filter(([, amount]) => amount !== 0)
            .map(([key, amount]) => JSON.stringify([key, amount])).sort();
        const actual = accounts.filter((one) => one.source === 'auto' && one.category === '游戏收益')
            .map((one) => JSON.stringify([JSON.stringify([one.date, one.characterId]), one.kind === 'expense' ? -one.amount : one.amount])).sort();
        return JSON.stringify(actual) === JSON.stringify(expected);
    })()`,
            { timeout: 4000 },
        );

    /** 读取实际统计文本与颜色，覆盖派生读数。 */
    const statCells = async () =>
        cdp.evaluate(`(() => [...document.querySelectorAll('.stats .stat')].map((el) => ({
            cap: el.querySelector('.cap')?.textContent?.trim() ?? '',
            value: el.querySelector('.v')?.textContent?.trim() ?? '',
            sub: el.querySelector('.sub')?.textContent?.trim() ?? '',
            delta: el.querySelector('.delta')?.textContent?.trim() ?? '',
            color: getComputedStyle(el.querySelector('.v')).color,
        })))()`);

    // 计数与清理覆盖所有角色，不受本节前一次手工筛选或速记目标影响。
    const showAllHistory = async () => {
        await ui.clickLabel('按角色筛选');
        await ui.clickText('.select-list .opt-label', '全部角色', { exact: true });
        await sleep(150);
    };

    /** 从全部角色的历史记录读取今日笔数。 */
    const todayCount = async () => {
        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .record-filters')`,
            {
                timeout: 4000,
            },
        );
        if (!opened) throw new Error('历史收益窗没打开');
        await showAllHistory();
        const raw = await cdp.evaluate(
            `document.querySelector('[role="dialog"] .record-foot-note')?.innerText ?? ''`,
        );
        const value = Number((raw.match(/(\d+)/) ?? [])[1]);
        await cdp.key('Escape');
        await sleep(250);
        if (!Number.isFinite(value)) throw new Error(`读不到今日笔数（原文「${raw}」）`);
        return value;
    };

    /** 按创建时间倒序清理本轮新增的同物品记录。 */
    const dropNewest = async (itemName, n) => {
        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .record-filters')`,
            {
                timeout: 4000,
            },
        );
        if (!opened) throw new Error('历史收益窗里没有流水行');
        await showAllHistory();

        let removed = 0;
        for (let i = 0; i < n; i += 1) {
            const found = await ui.markFirst(`() => {
                const row = [...document.querySelectorAll('[role="dialog"] .log tbody tr')]
                    .find((r) => (r.querySelector('.item-name')?.textContent || '').includes(${JSON.stringify(itemName)}));
                return row?.querySelector('[aria-label="删这一条"]') ?? null;
            }`);
            if (!found) break;
            await cdp.click('[data-e2e="1"]');
            await sleep(350);
            await ui.clickText('button', '删除', { exact: true });
            await sleep(550);
            removed += 1;
        }
        await cdp.key('Escape');
        await sleep(250);
        return removed;
    };

    return { autoIncomeMatches, statCells, showAllHistory, todayCount, dropNewest };
}

/* ============================ 6. 目标 ============================ */
import { importLoaded } from '../cdp.mjs';

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;
    if (!want('目标')) return;
    t.section('6 目标 · 多角色养成、档案补录与手动进度');
    const MARK = '⚠E2E目标';
    const names = ['E2E目标角色甲', 'E2E目标角色乙'];
    const q = JSON.stringify;
    const dialog = '[role="dialog"]';
    const picker = `${dialog} [aria-label="目标角色（多选）"] button`;
    const card = (title) =>
        `([...document.querySelectorAll('[data-goal-id]')].find((node) => node.querySelector('h2')?.textContent === ${q(title)}))`;
    const textOf = (title) => cdp.evaluate(`${card(title)}?.innerText ?? ''`);
    const all = () => ui.clickText('.filters button', '全部');
    const choose = async (label, text) => {
        await ui.clickLabel(label);
        await ui.clickText('[role="option"]', text, { exact: true });
    };
    const setMembers = async (wanted) => {
        const current = await cdp.evaluate(
            `[...document.querySelectorAll(${q(picker)})].filter((node) => node.getAttribute('aria-pressed') === 'true').map((node) => node.textContent.trim())`,
        );
        for (const name of current.filter((name) => !wanted.includes(name)))
            await ui.clickText(picker, name, { exact: true });
        for (const name of wanted.filter((name) => !current.includes(name)))
            await ui.clickText(picker, name, { exact: true });
    };
    const openNew = async () => {
        await ui.clickLabel('新建目标');
        await ui.waitFor(`!!document.querySelector('${dialog}')`, { timeout: 3000 });
        await sleep(250);
    };
    const saveNamed = async (title, target) => {
        await ui.fill('目标名称', title);
        await ui.fill('目标值', '');
        t.check(
            '清空目标立即禁用保存',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存目标"]')?.disabled === true`,
            ),
        );
        await ui.fill('目标值', String(target));
        t.check(
            '目标值未失焦即可保存',
            await cdp.evaluate(
                `document.activeElement?.getAttribute('aria-label') === '目标值' && document.querySelector('button[aria-label="保存目标"]')?.disabled === false`,
            ),
        );
        await ui.clickLabel('保存目标');
        t.check(
            '保存后关闭目标表单',
            await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 }),
        );
    };
    const sweep = async () => {
        await ui.dismiss();
        await all();
        for (let round = 0; round < 12; round += 1) {
            const title = await cdp.evaluate(
                `[...document.querySelectorAll('[data-goal-id] h2')].map((node) => node.textContent).find((text) => text.startsWith(${q(MARK)})) ?? ''`,
            );
            if (!title) return;
            await ui.clickIn('[data-goal-id]', title, { label: '编辑目标' });
            await ui.clickLabel('删除目标');
            await ui.clickLabel('确认删除');
            await ui.waitFor(`!${card(title)}`, { timeout: 5000 });
        }
    };
    await t.step('精简布局与临时角色', async () => {
        await ui.gotoReady('目标');
        await sweep();
        t.check('状态三段', (await ui.count('.filters .bevel-pill')) === 3);
        t.check(
            '筛选区只保留状态',
            (await ui.count('.filters > :not([aria-label="目标状态"])')) === 0,
        );
        t.check('不再重复展示概览', (await ui.count('.strip')) === 0);
        for (const name of names) {
            await ui.gotoReady('角色');
            const exists = await cdp.evaluate(
                `[...document.querySelectorAll('.roster .char')].some((node) => node.textContent.includes(${q(name)}))`,
            );
            if (exists) continue;
            await ui.clickLabel('新建角色');
            await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 });
            await ui.fill('角色名', name);
            await ui.clickText('button', '保存', { exact: false });
            await ui.waitFor(`!document.querySelector('.editor')`, { timeout: 5000 });
        }
        await ui.gotoReady('目标');
    });
    await t.step('装备目标买满、减少、删除记录后重新计算', async () => {
        const title = MARK + '装备';
        await openNew();
        await ui.clickText(`${dialog} button`, '装备', { exact: true });
        await setMembers([names[0]]);
        await saveNamed(title, 3);
        await ui.clickIn('[data-goal-id]', title, { label: '更新目标进度' });
        await cdp.click(`${dialog} .date-trigger`);
        await ui.waitFor(`document.activeElement?.matches('.date-panel .day')`);
        await cdp.key('ArrowLeft');
        const recordedDate = await cdp.evaluate(`(() => {
            const label = document.activeElement.getAttribute('aria-label');
            const parts = label.match(/[0-9]+/g);
            return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
        })()`);
        await cdp.key('Enter');
        await ui.waitFor(`!document.querySelector('.date-panel')`);
        for (let i = 0; i < 3; i += 1) {
            await ui.fill('这一笔的变化量', '1');
            await ui.clickLabel('记入这一笔');
            await ui.waitFor(
                `document.querySelector('input[aria-label="这一笔的变化量"]')?.value === '' &&
                    document.querySelector('${dialog} fieldset')?.disabled === false`,
                { timeout: 5000 },
            );
        }
        t.check(
            '买满即达成且留在眼前',
            await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`),
        );
        await ui.clickText(`${dialog} button`, '减少', { exact: true });
        await ui.fill('这一笔的变化量', '1');
        t.check(
            '进度记录未失焦即可记入',
            await cdp.evaluate(
                `document.activeElement?.getAttribute('aria-label') === '这一笔的变化量' && document.querySelector('button[aria-label="记入这一笔"]')?.disabled === false`,
            ),
        );
        await cdp.key('Enter');
        await ui.waitFor(
            `document.querySelector('input[aria-label="这一笔的变化量"]')?.value === '' &&
                document.querySelector('${dialog} fieldset')?.disabled === false`,
            {
                timeout: 5000,
            },
        );
        t.check(
            '减少后回到 2 / 3',
            await cdp.evaluate(`(() => {
                const node = ${card(title)};
                return node?.querySelector('.manual-value b')?.textContent === '2'
                    && node.querySelector('.ring')?.getAttribute('aria-valuenow') === '67'
                    && !node.querySelector('.mark');
            })()`),
        );
        t.check('更新弹窗只录入进度，不重复显示历史表格',
            !(await ui.exists(`${dialog} table[aria-label="进度流水"]`)));
        await ui.clickLabel('关闭记录');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        await ui.clickIn('[data-goal-id]', title, { label: '目标历史' });
        await ui.waitFor(
            `document.querySelectorAll('${dialog} table[aria-label="目标更新历史"] tbody tr').length === 4`,
            { timeout: 5000 },
        );
        t.check('手动类历史展示补记日期，录入时间保留在悬停说明', await cdp.evaluate(`(() => {
            const times = [...document.querySelectorAll('${dialog} .progress-history tbody time')];
            return times.length === 4 && times.every(time =>
                time.textContent.trim() === ${q(recordedDate)} &&
                time.getAttribute('datetime') === ${q(recordedDate)} &&
                time.title.startsWith('录入时间：'));
        })()`));
        await cdp.click(`${dialog} table[aria-label="目标更新历史"] tbody tr:first-child [aria-label="删掉这一笔"]`);
        await ui.clickText(`${dialog} button`, '删除', { exact: true });
        await ui.waitFor(`document.querySelectorAll('${dialog} table[aria-label="目标更新历史"] tbody tr').length === 3`, {
            timeout: 5000,
        });
        t.check(
            '删除减少记录后恢复达成',
            await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`),
        );
        await ui.dismiss();
    });
    await t.step('任意两个角色分别达标，未触碰的值保持不动', async () => {
        const title = MARK + '多人修炼';
        await openNew();
        await setMembers(names);
        await saveNamed(title, 20);
        t.check(
            '只含所选两名成员',
            await cdp.evaluate(`${card(title)}?.querySelectorAll('.member').length === 2`),
        );
        t.check(
            '总体圆环与角色分格进度分别呈现',
            await cdp.evaluate(`(() => {
                const node = ${card(title)};
                return node?.querySelectorAll('.goal-figure > .ring[role="progressbar"]').length === 1
                    && !!node.querySelector('.goal-figure > .ring + figcaption.category')
                    && !node.textContent.includes('人达标')
                    && [...node.querySelectorAll('.member')].every((row) => row.querySelectorAll('.tick').length === 10);
            })()`),
        );
        await ui.clickIn('[data-goal-id]', title, { label: '更新各角色的当前值' });
        await ui.fill(names[0] + ' 的当前值', '25');
        t.check(
            '更新养成未失焦即可保存',
            await cdp.evaluate(
                `document.activeElement?.tagName === 'INPUT' && document.querySelector('button[aria-label="保存养成"]')?.disabled === false`,
            ),
        );
        await cdp.key('Enter');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        t.check(
            '一人超额不能抵另一人的进度',
            !(await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`)),
        );
        t.check(
            '超额角色填满刻度，总体仍为一半',
            await cdp.evaluate(`(() => {
                const node = ${card(title)};
                const row = [...node.querySelectorAll('.member')].find((one) => one.querySelector('.who')?.textContent === ${q(names[0])});
                return node.querySelectorAll('.member.complete').length === 1
                    && node.querySelector('.ring')?.getAttribute('aria-valuenow') === '50'
                    && row?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '100';
            })()`),
        );
        t.check(
            '未改的另一个角色仍为零',
            await cdp.evaluate(
                `(() => {
                    const row = [...${card(title)}.querySelectorAll('.member')].find((node) => node.querySelector('.who')?.textContent === ${q(names[1])});
                    return row?.querySelector('.value b')?.textContent === '0' && row?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '0';
                })()`,
            ),
        );
        await ui.clickIn('[data-goal-id]', title, { label: '更新各角色的当前值' });
        await ui.fill(names[1] + ' 的当前值', '20');
        await cdp.key('Enter');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        t.check('两人都达到才完成', await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`));
        await ui.clickIn('[data-goal-id]', title, { label: '目标历史' });
        await ui.waitFor(
            `document.querySelectorAll('${dialog} table[aria-label="目标更新历史"] tbody tr').length === 2`,
            { timeout: 5000 },
        );
        await ui.clickLabel('关闭目标历史');
    });
    await t.step('未学的剧情技能可建目标并补入角色档案', async () => {
        const title = MARK + '剧情技能';
        await openNew();
        await setMembers([names[0]]);
        await choose('养成项目分类', '剧情技能');
        await choose('具体项目', '变化之术');
        await saveNamed(title, 5);
        t.check('未录项目明确显示待补录', (await textOf(title)).includes('待补录'));
        t.check(
            '待补录进度不冒充零值',
            await cdp.evaluate(`(() => {
                const progress = ${card(title)}?.querySelector('.member [role="progressbar"]');
                return !!progress && !progress.hasAttribute('aria-valuenow') && progress.getAttribute('aria-valuetext') === '待补录';
            })()`),
        );
        await ui.clickIn('[data-goal-id]', title, { label: '更新各角色的当前值' });
        t.check(
            '打开不会自动保存未知值为零',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存养成"]')?.disabled === true`,
            ),
        );
        await ui.fill(names[0] + ' 的当前值', '5');
        await cdp.key('Enter');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        t.check('补录后达成', await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`));
        await ui.reload();
        await ui.gotoReady('目标');
        await all();
        t.check(
            '重载后目标和养成值仍在',
            await cdp.evaluate(
                `${card(title)}?.querySelector('.member [role="progressbar"]')?.getAttribute('aria-valuetext') === '5 / 5 级 · 已达标'`,
            ),
        );
    });
    await t.step('手动目标小数累计、修改与筛选', async () => {
        const title = MARK + '坐骑成长';
        await openNew();
        await ui.clickText(`${dialog} button`, '手动', { exact: true });
        await setMembers([names[0]]);
        await ui.fill('目标单位', '点');
        await saveNamed(title, 1.5);
        await ui.clickIn('[data-goal-id]', title, { label: '更新目标进度' });
        for (const value of ['0.5', '1']) {
            await ui.fill('这一笔的变化量', value);
            await ui.clickLabel('记入这一笔');
            await ui.waitFor(
                `document.querySelector('button[aria-label="记入这一笔"]')?.disabled === true`,
                { timeout: 5000 },
            );
        }
        await ui.dismiss();
        t.check('手动小数累计达成', await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`));
        await ui.clickIn('[data-goal-id]', title, { label: '编辑目标' });
        await ui.fill('目标值', '2');
        await ui.clickLabel('保存目标');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        t.check(
            '修改目标保留累计，按新目标重算',
            await cdp.evaluate(`(() => {
            const node = ${card(title)};
            return node?.querySelector('.manual-value b')?.textContent === '1.5'
                && node.querySelector('.ring')?.getAttribute('aria-valuenow') === '75';
        })()`),
        );
        await ui.clickIn('[data-goal-id]', title, { label: '目标历史' });
        await ui.waitFor(
            `document.querySelectorAll('${dialog} table[aria-label="目标更新历史"] tbody tr').length === 2`,
            { timeout: 5000 },
        );
        await ui.clickLabel('关闭目标历史');
        await ui.reload();
        await ui.gotoReady('目标');
        await all();
        t.check(
            '手动目标修改与小数记录重载保留',
            await cdp.evaluate(
                `${card(title)}?.querySelector('.manual-value b')?.textContent === '1.5' && ${card(title)}?.querySelector('.ring')?.getAttribute('aria-valuenow') === '75'`,
            ),
        );
    });
    await t.step('独立组合：多角色多项目、按项进度与统一回写', async () => {
        const title = MARK + '组合计划';
        await openNew();
        await ui.clickText(`${dialog} button`, '组合', { exact: true });
        await ui.fill('组合名称', title);
        t.check(
            '默认展示全部角色，移除选择角色和复制入口，空角色不阻止保存',
            await cdp.evaluate(`(() => {
                const form = document.querySelector('${dialog} .goal-form');
                return ${JSON.stringify(names)}.every((name) => [...form.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent.includes(name)))
                    && !form.querySelector('[aria-label="选择组合角色"]')
                    && !form.querySelector('[aria-label="复制组合设置"]');
            })()`),
        );
        await ui.clickText(`${dialog} [role="tab"]`, names[0]);
        await ui.clickLabel('继续添加组合项目');
        await choose('组合项目分类', '角色等级');
        await ui.fill('组合项目目标值', '130');
        await ui.clickLabel('添加组合项目');
        await ui.clickText(`${dialog} [role="tab"]`, names[1]);
        await ui.clickLabel('继续添加组合项目');
        await choose('组合项目分类', '角色等级');
        await ui.fill('组合项目目标值', '120');
        await ui.clickLabel('添加组合项目');
        await ui.clickLabel('继续添加组合项目');
        await choose('组合项目分类', '生活技能');
        await choose('组合具体项目', '强身术');
        await ui.fill('组合项目目标值', '100');
        await ui.clickLabel('添加组合项目');
        await ui.clickLabel('继续添加组合项目');
        await choose('组合项目分类', '乾元丹 / 潜能果');
        await choose('组合具体项目', '乾元丹');
        await ui.fill('组合项目目标值', '7');
        await ui.clickLabel('添加组合项目');
        t.check(
            '项目名称与分类同行、表格行区分底色，添加按钮右对齐且不撑满',
            await cdp.evaluate(`(() => {
                const pane = document.querySelector('${dialog} .combo-projects');
                const rows = [...pane.querySelectorAll('tbody tr')];
                const name = rows.find((row) => row.textContent.includes('乾元丹')).querySelector('.combo-project-name');
                const metric = name.querySelector('span').getBoundingClientRect();
                const category = name.querySelector('small').getBoundingClientRect();
                const button = pane.querySelector('[aria-label="继续添加组合项目"]').getBoundingClientRect();
                const bounds = pane.getBoundingClientRect();
                return Math.max(metric.top, category.top) < Math.min(metric.bottom, category.bottom)
                    && getComputedStyle(rows[0].querySelector('td')).backgroundColor !== getComputedStyle(rows[1].querySelector('td')).backgroundColor
                    && Math.abs(button.right - bounds.right) < 2 && button.width < bounds.width / 2;
            })()`),
        );
        await ui.clickLabel('保存目标');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        t.check(
            '组合逐项展示角色进度，并使用同一总体圆环',
            await cdp.evaluate(`(() => {
            const node = ${card(title)};
            return node?.querySelectorAll('.member').length === 4
                && node.querySelectorAll('.goal-figure > .ring[role="progressbar"]').length === 1
                && node.textContent.includes('强身术');
        })()`),
        );
        await ui.clickIn('[data-goal-id]', title, {
            label: `更新${names[0]} · 角色等级的组合进度`,
        });
        t.check(
            '更新窗口使用表格且不再显示同步档案提示',
            await cdp.evaluate(`!!document.querySelector('${dialog} table[aria-label="组合项目进度"]')
                && !document.querySelector('${dialog}').textContent.includes('保存后同步角色档案')`),
        );
        await ui.fill(names[0] + '的角色等级当前值', '130');
        await ui.clickText(`${dialog} [role="tab"]`, names[1]);
        await ui.fill(names[1] + '的角色等级当前值', '120');
        await ui.fill(names[1] + '的强身术当前值', '100');
        await ui.fill(names[1] + '的乾元丹当前值', '7');
        await ui.clickText(`${dialog} [role="tab"]`, names[0]);
        t.check(
            '切换角色保留待保存修改',
            await cdp.evaluate(
                `document.querySelector('input[aria-label=${q(names[0] + '的角色等级当前值')}]')?.value === '130'`,
            ),
        );
        const rulesSnapshot = await cdp.evaluate(`(async () => {
            const rules = await ${importLoaded('/src/services/game-data.ts')};
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const snapshot = { ready: rules.gameDataReady.value, roster: JSON.stringify(useRoster().roster.value) };
            rules.gameDataReady.value = false;
            return snapshot;
        })()`);
        try {
            await ui.clickLabel('保存组合进度');
            await ui.waitFor(
                `document.querySelector('${dialog} .save-error')?.textContent.includes('角色规则')`,
                { timeout: 5000 },
            );
            t.check(
                '规则未就绪时保留草稿，不进入假保存重试，不改角色档案',
                await cdp.evaluate(`(async () => {
                    const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
                    const form = document.querySelector('${dialog}');
                    return JSON.stringify(useRoster().roster.value) === ${q(rulesSnapshot.roster)}
                        && form.querySelector('button[aria-label="保存组合进度"]')?.disabled === false
                        && !form.textContent.includes('重试保存')
                        && form.querySelector('input[aria-label=${q(names[0] + '的角色等级当前值')}]')?.value === '130';
                })()`),
            );
        } finally {
            await cdp.evaluate(`(async () => {
                const rules = await ${importLoaded('/src/services/game-data.ts')};
                rules.gameDataReady.value = ${JSON.stringify(rulesSnapshot.ready)};
            })()`);
        }
        await ui.clickLabel('保存组合进度');
        await ui.waitFor(`!document.querySelector('${dialog}')`, { timeout: 5000 });
        await all();
        t.check(
            '统一保存后各角色按达标项数满进度',
            await cdp.evaluate(`(() => {
            const node = ${card(title)};
            return node?.querySelector('.ring')?.getAttribute('aria-valuenow') === '100'
                && node.querySelectorAll('.member [role="progressbar"]').length === 4
                && [...node.querySelectorAll('.member [role="progressbar"]')].every((bar) => bar.getAttribute('aria-valuenow') === '100');
        })()`),
        );
        await ui.reload();
        await ui.gotoReady('目标');
        await all();
        t.check('组合定义与整批档案修改重载保留', await cdp.evaluate(`(() => {
            const node = ${card(title)};
            const bars = [...(node?.querySelectorAll('.member [role="progressbar"]') ?? [])];
            return node?.querySelector('.ring')?.getAttribute('aria-valuenow') === '100'
                && bars.length === 4
                && bars.every((bar) => bar.getAttribute('aria-valuenow') === '100');
        })()`));
    });
    await t.step('清理临时目标与角色', async () => {
        await sweep();
        await ui.gotoReady('角色');
        for (const name of names) {
            await ui.clickIn('.roster .char', name, { label: '删除这个角色' });
            await ui.clickText(`${dialog} button`, '删除', { exact: true });
            await sleep(350);
        }
        await ui.gotoReady('目标');
        t.check(
            '临时目标已清理',
            !(await cdp.evaluate(
                `[...document.querySelectorAll('[data-goal-id] h2')].some((node) => node.textContent.startsWith(${q(MARK)}))`,
            )),
        );
    });
}

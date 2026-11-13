/* ============================ 6. 目标 ============================ */
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
        await cdp.click(`${dialog} details > summary`);
        await ui.fill('目标标题', title);
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
            await ui.clickIn('[data-goal-id]', title, { label: '删除目标' });
            await ui.clickText(`${dialog} button`, '删除', { exact: true });
            await ui.waitFor(`!${card(title)}`, { timeout: 5000 });
        }
    };
    await t.step('精简布局与临时角色', async () => {
        await ui.gotoReady('目标');
        await sweep();
        t.check('状态三段', (await ui.count('.filters .bevel-pill')) === 3);
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
        for (let i = 0; i < 3; i += 1) {
            await ui.clickIn('[data-goal-id]', title, { label: '买了一件，进度加一' });
            await sleep(350);
        }
        t.check(
            '买满即达成且留在眼前',
            await cdp.evaluate(`!!${card(title)}?.querySelector('.mark')`),
        );
        await ui.clickIn('[data-goal-id]', title, { text: '记录' });
        await ui.clickText(`${dialog} button`, '减少', { exact: true });
        await ui.fill('这一笔的变化量', '1');
        t.check(
            '进度记录未失焦即可记入',
            await cdp.evaluate(
                `document.activeElement?.getAttribute('aria-label') === '这一笔的变化量' && document.querySelector('button[aria-label="记入这一笔"]')?.disabled === false`,
            ),
        );
        await cdp.key('Enter');
        await ui.waitFor(`document.querySelectorAll('${dialog} .log-row').length === 4`, {
            timeout: 5000,
        });
        t.check(
            '减少后回到 2 / 3',
            await cdp.evaluate(`(() => {
                const node = ${card(title)};
                return node?.querySelector('.manual-value b')?.textContent === '2'
                    && node.querySelector('.ring')?.getAttribute('aria-valuenow') === '67'
                    && !node.querySelector('.mark');
            })()`),
        );
        await ui.clickLabel('删掉这一笔');
        await ui.clickText(`${dialog} button`, '删除', { exact: true });
        await ui.waitFor(`document.querySelectorAll('${dialog} .log-row').length === 3`, {
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
                return node?.querySelectorAll('.milestones i').length === 2
                    && node.querySelectorAll('.progress-body > .ring[role="progressbar"]').length === 1
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
                return node.querySelectorAll('.milestones .on').length === 1
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
        await ui.clickIn('[data-goal-id]', title, { label: '记录目标进度' });
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
        await ui.fill('搜索目标', title);
        t.check('搜索收拢到指定目标', (await ui.count('[data-goal-id]')) === 1);
        await ui.fill('搜索目标', '');
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

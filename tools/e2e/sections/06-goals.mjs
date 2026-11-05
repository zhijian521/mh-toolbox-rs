/* ============================ 6. 目标 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('目标')) {
        t.section('6 目标 · 新建 → 买满 → 达成 → 流水删一笔 → 删除');

        /* 标题写死一个标记：自动标题（「4 个角色 · 买满 3 件装备」）会跟着名册人数变，
         * 拿它当定位依据，测试就会因为「用户恰好有 5 个角色」而红。
         * 删的时候也认这个标记，不会误删用户自己的目标。 */
        const MARK = '⚠E2E目标';

        const goalCount = () => cdp.evaluate(`document.querySelectorAll('[data-goal-id]').length`);
        /** 删掉带标记的目标，逐张点、逐张确认。 */
        const sweep = async () => {
            /* 先切到「全部」：已达成的不在「进行中」里，不切就删不到——
             * 上一次失败留下的那条就是这么活下来的。 */
            await cdp.evaluate(`(() => {
                const b = [...document.querySelectorAll('.filters .bevel-pill')]
                    .find((one) => (one.textContent || '').trim().startsWith('全部'));
                b?.click();
            })()`);
            await sleep(250);
            for (let round = 0; round < 6; round += 1) {
                const has = await cdp.evaluate(
                    `[...document.querySelectorAll('[data-goal-id]')].some((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}))`,
                );
                if (!has) return;
                await cdp.evaluate(`(() => {
                    const card = [...document.querySelectorAll('[data-goal-id]')]
                        .find((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}));
                    card?.querySelector('[aria-label="删除目标"]')?.click();
                })()`);
                await sleep(320);
                await cdp.evaluate(`(() => {
                    const b = [...document.querySelectorAll('[role="dialog"] button')]
                        .find((one) => (one.textContent || '').trim() === '删除');
                    b?.click();
                })()`);
                await sleep(380);
            }
        };

        await t.step('概览四格与筛选都在', async () => {
            await ui.gotoReady('目标');
            await sweep();
            const shape = await cdp.evaluate(`(() => ({
                cells: document.querySelectorAll('.strip > div').length,
                pills: document.querySelectorAll('.filters .bevel-pill').length,
                selects: document.querySelectorAll('.filters .select-field, .filters [role="combobox"]').length,
            }))()`);
            t.check('概览四格', shape.cells === 4, `实际 ${shape.cells}`);
            /* 三档状态：进行中 / 已达成 / 全部。少一档就查不了「做完的」。 */
            t.check('状态三段', shape.pills === 3, `实际 ${shape.pills}`);
        });

        await t.step('建一个装备目标：三件', async () => {
            await ui.clickText('button', '新建目标');
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('新建弹窗开了', opened);

            /* 弹窗刚挂上时布局还在落位，立刻点会点空——第一版就是这么点成了「养成」，
             * 目标值 3 级一保存就全员达标，看上去像「建完就达成」的 bug。 */
            await sleep(350);
            await ui.clickText('button', '装备', { exact: true });
            await sleep(200);
            const isGear =
                await cdp.evaluate(`[...document.querySelectorAll('[role="dialog"] .bevel-pill')]
                .find((b) => b.textContent.trim() === '装备')?.getAttribute('aria-checked') === 'true'`);
            t.check('类型切到装备', isGear, '点了但没切过去');
            await ui.fill('目标值', '3');
            await ui.fill('目标标题', MARK);
            /* 回车提交走的是 `enterSubmit`：只在 INPUT 上生效（下拉里的回车归下拉自己）。 */
            await cdp.key('Enter');
            await sleep(600);

            const closed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`);
            t.check('回车就存下来了', closed);

            const card = await cdp.evaluate(`(() => {
                const one = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}));
                return one ? one.innerText.replace(/\\n/g, ' | ') : '';
            })()`);
            t.check('卡片上写着 0 / 3 件', card.includes('0 / 3 件'), card.slice(0, 80));
            t.check('还没达成：没有章', !card.includes('达成'), card.slice(0, 80));
        });

        await t.step('连点三次「买了一件」→ 买满即达成', async () => {
            for (let i = 0; i < 3; i += 1) {
                await ui.clickIn('[data-goal-id]', MARK, { text: '买了一件' });
                await sleep(420);
            }
            const after = await cdp.evaluate(`(() => {
                const one = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}));
                return one ? { text: one.innerText.replace(/\\n/g, ' | '), mark: !!one.querySelector('.mark') } : null;
            })()`);
            t.check(
                '三件都记上了',
                Boolean(after) && after.text.includes('3 / 3 件'),
                after?.text ?? '',
            );
            t.check('100% 且盖了章', Boolean(after) && after.mark, '没有 .mark');
            /* 达成那一刻把筛选切到「全部」，否则卡片会当场从「进行中」里消失。 */
            const shown = await cdp.evaluate(`!!document.querySelector('[data-goal-id] .mark')`);
            t.check('达成的卡还留在眼前', shown);
        });

        await t.step('流水里删掉一笔：进度退回 2 / 3，章消失', async () => {
            await ui.clickIn('[data-goal-id]', MARK, { text: '流水' });
            await sleep(400);
            /* 认 `.log-row` 而不是 `.log`：卡片上的「最近三笔」也叫 `.log`，
             * 两个加起来才是 6——第一版就是被这个数骗了一次。 */
            const logs = await cdp.evaluate(
                `document.querySelectorAll('[role="dialog"] .log-row').length`,
            );
            t.check('三笔流水都在', logs === 3, `实际 ${logs}`);

            await cdp.evaluate(
                `document.querySelector('[role="dialog"] .log-row .remove')?.click()`,
            );
            await sleep(300);
            const asked = await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`);
            t.check('删流水前问了那句', asked);
            await cdp.evaluate(`(() => {
                const b = [...document.querySelectorAll('[role="dialog"] button')]
                    .find((one) => (one.textContent || '').trim() === '删除');
                b?.click();
            })()`);
            await sleep(420);
            await cdp.key('Escape');
            await sleep(350);

            const card = await cdp.evaluate(`(() => {
                const one = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}));
                return one ? { text: one.innerText.replace(/\\n/g, ' | '), mark: !!one.querySelector('.mark') } : null;
            })()`);
            t.check(
                '退回 2 / 3 件',
                Boolean(card) && card.text.includes('2 / 3 件'),
                card?.text ?? '',
            );
            t.check('章也撤了', Boolean(card) && !card.mark, '仍有 .mark');
        });

        await t.step('删掉这个目标', async () => {
            const before = await goalCount();
            await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(MARK)}));
                card?.querySelector('[aria-label="删除目标"]')?.click();
            })()`);
            await sleep(320);
            const asked = await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`);
            t.check('删目标前问了那句', asked);
            await cdp.evaluate(`(() => {
                const b = [...document.querySelectorAll('[role="dialog"] button')]
                    .find((one) => (one.textContent || '').trim() === '删除');
                b?.click();
            })()`);
            await sleep(500);
            const after = await goalCount();
            t.check('卡片没了', after === before - 1, `${before} → ${after}`);
            /* 兜底：中途失败的残留也扫掉，别让后面的节继承一屏测试目标。 */
            await sweep();
        });

        /* 养成目标是唯一会**写角色档案**的一条路。它必须验：写错了不是「卡片不好看」，
         * 是把用户练到几级的记录改掉了。所以临时建一个角色，用它跑完整条链，再删干净。 */
        await t.step('养成目标：更新养成 → 卡片跟着变', async () => {
            const NAME = 'E2E目标角色';
            /* 带上 MARK 前缀：清理那一条 `sweep()` 按前缀找，失败中途留下的也能扫掉。 */
            const GROW = '⚠E2E目标养成';

            /* 建人。角色页的编辑器按钮叫「新建角色」，存下来在编辑器底部。 */
            await ui.goto('角色');
            await ui.clickLabel('新建角色');
            await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 });
            await sleep(250);
            await ui.fill('角色名', NAME);
            await ui.clickText('button', '保存', { exact: false });
            await sleep(700);
            const created = await cdp.evaluate(
                `[...document.querySelectorAll('.roster .char')].some((c) => (c.textContent || '').includes(${JSON.stringify(NAME)}))`,
            );
            t.check('临时角色建出来了', created);

            /* 建目标：默认就是「养成 · 修炼 · 攻击修炼」，目标 20 级。 */
            await ui.gotoReady('目标');
            await ui.clickText('button', '新建目标');
            await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, { timeout: 3000 });
            await sleep(350);
            await ui.fill('目标值', '20');
            await ui.fill('目标标题', GROW);
            await cdp.key('Enter');
            await sleep(700);

            const before = await cdp.evaluate(`(() => {
                const one = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(GROW)}));
                return one ? one.innerText.replace(/\\n/g, ' | ') : '';
            })()`);
            t.check('目标建好了，临时角色在名单里', before.includes(NAME), before.slice(0, 120));
            /* 新号的修炼是 0 级（不是「未记录」）：`emptyCharacter` 给的是空 0，
             * 只有「这个号的档案里没有这一项」才是未记录。这条钉的正是这个区别。 */
            t.check(
                '新号是 0 级、还差 20',
                before.includes(`${NAME} | 0 / 20 级`),
                before.slice(0, 200),
            );

            /* 更新养成：只改这一行，保存 */
            await ui.clickIn('[data-goal-id]', GROW, { text: '更新养成' });
            await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, { timeout: 3000 });
            await sleep(300);
            await ui.fill(NAME + ' 的当前值', '20');
            await cdp.key('Enter');
            await sleep(700);

            const after = await cdp.evaluate(`(() => {
                const one = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(GROW)}));
                return one ? one.innerText.replace(/\\n/g, ' | ') : '';
            })()`);
            t.check(
                '卡片上这个号到了 20 级',
                after.includes(`${NAME} | 20 / 20 级`),
                after.slice(0, 220),
            );
            t.check('那一行标了已达标', after.includes('已达标'), after.slice(0, 220));

            /* 收尾：删目标 → 删角色。顺序不能反——反了目标会先变成「已删除」再被删。 */
            await sweep();
            await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('[data-goal-id]')]
                    .find((c) => (c.textContent || '').includes(${JSON.stringify(GROW)}));
                card?.querySelector('[aria-label="删除目标"]')?.click();
            })()`);
            await sleep(320);
            await cdp.evaluate(`(() => {
                const b = [...document.querySelectorAll('[role="dialog"] button')]
                    .find((one) => (one.textContent || '').trim() === '删除');
                b?.click();
            })()`);
            await sleep(450);

            await ui.goto('角色');
            await ui.clickIn('.roster .char', NAME, { label: '删除这个角色' });
            await sleep(350);
            const asked = await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`);
            t.check('删角色前问了那句', asked);
            await ui.clickText('[role="dialog"] button', '删除', { exact: true });
            await sleep(700);
            const left = await cdp.evaluate(
                `[...document.querySelectorAll('.roster .char')].some((c) => (c.textContent || '').includes(${JSON.stringify(NAME)}))`,
            );
            t.check('临时角色已删掉', !left);
            await ui.gotoReady('目标');
        });
    }
}

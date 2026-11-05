/* ============================ 5. 账号 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('账号')) {
        t.section('5 账号 · 两本账 · 记一笔 → 全部记录里删掉');

        await t.step('两本账与十一个快捷入口都在', async () => {
            await ui.gotoReady('账号');
            const shape = await cdp.evaluate(`(() => ({
                books: document.querySelectorAll('.books .book').length,
                shortcuts: document.querySelectorAll('.shortcuts .shortcut').length,
                rowCols: document.querySelectorAll('.recent-table thead th').length,
            }))()`);

            /* 两本账是这一页的立论：合成一张「总收支」等于把元与万加起来。
             * 少一张就是回到了那个错。 */
            t.check('并排两本账', shape.books === 2, `实际 ${shape.books}`);
            t.check('快捷入口 11 个', shape.shortcuts === 11, `实际 ${shape.shortcuts}`);
            t.check(
                '表格六列（有记录时）',
                shape.rowCols === 0 || shape.rowCols === 6,
                `实际 ${shape.rowCols}`,
            );
        });

        /* 记一笔真账，走完整的写库路径，最后自己删干净。
         * 用 `⚠E2E` 开头的备注做标记：删的时候按它定位，不会误删用户的记录。 */
        const MARK = '⚠E2E账号';

        await t.step('记一笔人民币支出：弹窗 → 填数 → 入账', async () => {
            await ui.clickLabel('记一笔账号收支');
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('记一笔的弹窗开了', opened);

            await ui.fill('成交金额', '12.5');
            await ui.fill('备注', MARK);
            await sleep(150);
            await ui.clickText('button', '记入', { exact: true });
            await sleep(500);

            const closed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`);
            t.check('记完弹窗自己关了', closed);

            /* 默认币种人民币、默认方向支出，所以第一行应该是 `−¥12.5`。
             * 这条同时钉住「金额按币种格式化」：写成 `12.5 万` 就说明币种串了。 */
            const first = await cdp.evaluate(`(() => {
                const row = document.querySelector('.recent-table tbody tr');
                if (!row) return null;
                return [...row.querySelectorAll('td')].map((td) => td.textContent.trim());
            })()`);
            t.check('表格里出现这一条', Boolean(first), '一行都没有');
            t.check(
                '金额是 −¥12.5（人民币按元、支出带负号）',
                Boolean(first) && first[first.length - 1] === '−¥12.5',
                `实际「${first ? first[first.length - 1] : ''}」`,
            );
        });

        await t.step('人民币卡上的支出跟着变了', async () => {
            const out = await cdp.evaluate(`(() => {
                const book = [...document.querySelectorAll('.books .book')]
                    .find((one) => (one.textContent || '').includes('人民币'));
                if (!book) return null;
                return [...book.querySelectorAll('.metrics b')].map((b) => b.textContent.trim());
            })()`);
            /* 支出与差额都要包含这笔 12.5：支出是新增的，差额是它的相反数。
             * 只断言「有变化」是不够的——两个数同时错也能被称为「变了」。 */
            t.check(
                '人民币支出含这笔 12.5',
                Boolean(out) && out[1].includes('12.5'),
                `实际 ${out && out[1]}`,
            );
            t.check(
                '人民币差额含这笔 12.5',
                Boolean(out) && out[2].includes('12.5'),
                `实际 ${out && out[2]}`,
            );
        });

        await t.step('在全部记录里把它删掉', async () => {
            await ui.clickText('button', '全部记录', { exact: true });
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('全部记录弹窗开了', opened);

            await ui.fill('搜索记录', 'E2E');
            await sleep(250);
            const hits = await cdp.evaluate(
                `[...document.querySelectorAll('.rec-table tbody tr')]
                    .filter((row) => (row.textContent || '').includes('E2E')).length`,
            );
            t.check('搜到刚记的那一条', hits >= 1, `搜到 ${hits} 条`);

            /* **删到一条不剩**，不是「删一条」。
             * 上一次跑挂掉时留下的记录会一直累积，而「删一条之后还剩几条」取决于上一次跑得多干净——
             * 那会让这条断言在「第一次跑」和「第 N 次跑」上给出不同答案。 */
            let left = hits;
            let askedOnce = false;
            for (let round = 0; round < 6 && left > 0; round += 1) {
                await ui.clickIn('.rec-table tbody tr', 'E2E', { label: '删这一条' });
                await sleep(300);
                /* 删除要二次确认——这一步在账号页是必要的：一条记录挂了很久才发现记错，
                 * 而删掉之后没有任何地方能找回来。 */
                if (
                    !askedOnce &&
                    (await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`))
                ) {
                    askedOnce = true;
                    t.check('删除前问了那句', true);
                }
                await ui.clickText('button', '删除', { exact: true });
                await sleep(400);
                left = await cdp.evaluate(
                    `[...document.querySelectorAll('.rec-table tbody tr')]
                        .filter((row) => (row.textContent || '').includes('E2E')).length`,
                );
            }
            t.check('删干净了', left === 0, `还剩 ${left} 条`);

            await cdp.key('Escape');
            await sleep(300);
        });

        await t.step('回到账号页：记录已经不在', async () => {
            await ui.gotoReady('账号');
            const still = await cdp.evaluate(`(() => {
                const body = document.querySelector('.page-content')?.innerText ?? '';
                return body.includes('E2E');
            })()`);
            t.check('页面上不再有那一笔', still === false, '还能看到 E2E 那条');
        });
    }
}

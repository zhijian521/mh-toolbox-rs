/** 模拟休眠后的网页时钟，始终在 finally 还原；不改系统时间，也不写账本。 */
export default async function run({ cdp, ui, t, want }) {
    if (!want('收益日期')) return;
    t.section('8.1 日期 · 跨月恢复窗口');
    await t.step('账号页保持打开，恢复焦点后范围跨到下个月', async () => {
        await ui.goto('账号');
        const origin = await ui.text('.range-text');
        try {
            const future = await cdp.evaluate(`(() => {
                const RealDate = window.Date;
                const now = new RealDate();
                const next = new RealDate(now.getFullYear(), now.getMonth() + 1, 1, 8);
                window.__e2eDate = RealDate;
                window.Date = class extends RealDate {
                    constructor(...args) { super(...(args.length ? args : [next.getTime()])); }
                    static now() { return next.getTime(); }
                };
                window.dispatchEvent(new Event('focus'));
                return [next.getFullYear(), String(next.getMonth() + 1).padStart(2, '0'), '01'].join('-');
            })()`);
            await ui.waitFor(
                `document.querySelector('.range-text').textContent.includes('${future}')`,
            );
            t.check(
                '无需导航或重载，账号范围已跨月',
                (await ui.text('.range-text')).includes(future),
            );
            await ui.goto('收益');
            const clean = await cdp.evaluate(`(() => {
                const section = [...document.querySelectorAll('.ledger-section')].find((one) => one.querySelector('h2')?.textContent.includes('今日速记'));
                return !!section && section.querySelector('.hint')?.textContent.trim() === '0 条' && !!section.querySelector('.empty');
            })()`);
            t.check('次月今日清单重新计算为空态', clean);
        } finally {
            await cdp.evaluate(`(() => {
                if (window.__e2eDate) window.Date = window.__e2eDate;
                delete window.__e2eDate;
                window.dispatchEvent(new Event('focus'));
            })()`);
        }
        await ui.goto('账号');
        t.check('还原时钟后范围回到本月', (await ui.text('.range-text')) === origin);
    });
}

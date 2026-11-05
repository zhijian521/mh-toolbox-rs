/* ============================ 10. 收尾 ============================ */

export default async function run(ctx) {
    const { ui, t, want, baseline } = ctx;

    if (want('收尾') || want('角色') || want('物价')) {
        t.section('10 收尾 · 数量核对');

        if (baseline.chars !== null) {
            await t.step('角色名册回到测试前的数量', async () => {
                await ui.goto('角色');
                const now = await ui.count('.roster .char');
                t.check(
                    '角色数量一致',
                    now === baseline.chars,
                    `期望 ${baseline.chars}，实际 ${now}`,
                );
            });
        }

        if (baseline.prices !== null) {
            await t.step('物价列表回到测试前的数量', async () => {
                await ui.goto('物价');
                const now = await ui.count('article.price-card');
                t.check(
                    '物价数量一致',
                    now === baseline.prices,
                    `期望 ${baseline.prices}，实际 ${now}`,
                );
            });
        }

        await t.step('停在设置页，方便接着人工点测', async () => {
            await ui.goto('设置');
            t.pass('已回到设置页', await ui.hash());
        });
    }
}

import { setup, pets, cleanup } from './characters/crud.mjs';
import { ocr } from './characters/ocr.mjs';
import { quick } from './characters/quick.mjs';
import { equipment } from './characters/equipment.mjs';

export default async function run(ctx) {
    if (!ctx.want('角色')) return;
    await setup(ctx);
    await ocr(ctx);
    await pets(ctx);
    await quick(ctx);
    await equipment(ctx);
    await ctx.t.step('成长历史保留修改并可在重载后查看', async () => {
        await ctx.ui.reload();
        await ctx.ui.goto('角色');
        await ctx.ui.clickLabel('查看角色成长历史');
        await ctx.cdp.waitFor(`!!document.querySelector('.growth-filters')`);
        ctx.t.check(
            '角色修改生成持久化成长记录',
            await ctx.cdp.evaluate(
                `!!document.querySelector('.growth-entry') && !!document.querySelector('.growth-change')`,
            ),
        );
        await ctx.ui.clickLabel('关闭成长历史');
    });
    await cleanup(ctx);
}

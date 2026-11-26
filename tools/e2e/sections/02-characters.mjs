import { setup } from './characters/setup.mjs';
import { pets } from './characters/pets.mjs';
import { cleanup } from './characters/cleanup.mjs';
import { ocr } from './characters/ocr.mjs';
import { quick } from './characters/quick.mjs';
import { equipment } from './characters/equipment.mjs';
import { assets } from './characters/assets.mjs';

export default async function run(ctx) {
    if (!ctx.want('角色')) return;
    await setup(ctx);
    const steps = new Set(ctx.characterSteps);
    for (const [key, run] of Object.entries({ ocr, pets, assets, quick, equipment })) {
        if (steps.has(key)) await run(ctx);
    }
    if (steps.has('history')) {
        await ctx.t.step('成长历史用侧折纸卡展示每次修改，重载后可查看', async () => {
            await ctx.ui.reload();
            await ctx.ui.goto('角色');
            await ctx.ui.clickLabel('查看角色成长历史');
            await ctx.cdp.waitFor(`!!document.querySelector('.growth-filters')`);
            ctx.t.check(
                '角色修改生成持久化成长记录',
                await ctx.cdp.evaluate(
                    `!!document.querySelector('article.folded-card.growth-entry[data-spine="left"] .growth-change')`,
                ),
            );
            await ctx.ui.clickLabel('关闭弹窗');
        });
    }
    await cleanup(ctx, { hasPet: steps.has('pets') });
}

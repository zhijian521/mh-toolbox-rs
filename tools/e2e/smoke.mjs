/**
 * 真 Tauri 窗口烟测：真实交互、IPC、写入与重载持久化。
 * 运行前需启动 debug 窗口；自动快照，结束后关闭应用并按输出命令还原。
 * 页面与角色子流程选择、数据影响及前置见 docs/TESTING.md。
 */

import { attach, sleep, SetupError } from './cdp.mjs';
import { createSelection } from './selection.mjs';
import { createUi } from './ui.mjs';
import { createReporter } from './assert.mjs';
import accounts from './sections/05-accounts.mjs';
import characters from './sections/02-characters.mjs';
import dates from './sections/08-dates.mjs';
import data from './sections/09-data.mjs';
import finish from './sections/10-finish.mjs';
import goals from './sections/06-goals.mjs';
import income from './sections/04-income.mjs';
import nav from './sections/01-nav.mjs';
import preflight from './sections/00-preflight.mjs';
import prices from './sections/03-prices.mjs';
import settings from './sections/07-settings.mjs';
import tools from './sections/08-tools.mjs';

/* ------------------------------ 启动 ------------------------------ */

const only = (process.argv.find((one) => one.startsWith('--only='))?.split('=')[1] ?? '').trim();
const skip = (process.argv.find((one) => one.startsWith('--skip='))?.split('=')[1] ?? '').trim();
let selection;
try {
    selection = createSelection(only, skip);
} catch (error) {
    console.error(error.message);
    process.exit(2);
}
const { want, characterSteps, ocrScenarios, equipmentScenarios } = selection;

let cdp;
try {
    cdp = await attach();
} catch (error) {
    if (error instanceof SetupError) {
        console.error(`\n✗ ${error.message}`);
        if (error.hint) console.error(`\n${error.hint}\n`);
        process.exit(2);
    }
    throw error;
}

const ui = createUi(cdp);
const t = createReporter({ cdp });

await ui.dismiss();

/* 跨节的四样东西：
 *   · `baseline` 是「跑之前有几条」，第 2/3 节填、第 10 节拿来核对——必须是同一个对象；
 *   · `snap` 是开头的库快照，第 0 节填、结尾打印还原命令；
 *   · `info` 与 `charsInDb` 由第 0 节算出来，第 9 节与第 1 节各用一处。
 * 先给成 null 而不是省略：少了键的解构会静默拿到 undefined，那比报错更难查。 */
const ctx = {
    cdp,
    ui,
    t,
    want,
    characterSteps,
    ocrScenarios,
    equipmentScenarios,
    sleep,
    baseline: { chars: null, prices: null, quickPricedByTest: false },
    snap: null,
    info: null,
    charsInDb: -1,
};

/* 预检会在这三处退出（不是 debug、页面是错误页、页面与库对不上），所以它必须第一个跑。 */
const preflightResult = await preflight(ctx);
ctx.charsInDb = preflightResult.charsInDb;

await nav(ctx);
await characters(ctx);
await prices(ctx);
await income(ctx);
await accounts(ctx);
await goals(ctx);
await settings(ctx);
await tools(ctx);
await dates(ctx);
await data(ctx);
await finish(ctx);

await cdp.shot('.runtime/e2e-shots/final.png');

/* ------------------------------ 汇总 ------------------------------ */

const code = await t.summary();
if (ctx.snap) {
    console.log(`\n账本快照：${ctx.snap.dir}`);
    console.log(
        `跑完想清掉测试数据：node tools/e2e/db.mjs restore ${ctx.snap.id} --yes（先关窗口）`,
    );
}
cdp.close();
process.exitCode = code;

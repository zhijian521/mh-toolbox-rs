/**
 * 全量点击烟测（对真实 Tauri 窗口，走真实 IPC 与 SQLite）。
 *
 * 与 `tools/probe/cdp.mjs` 的分工：那个量「某一像素长什么样」，这里走
 * 「一个用户会走的完整路径」——点进去、填、保存、改、删、按 Esc、**重启/重载后还在**。
 *
 * ---- 怎么跑 ----
 *
 *   start.bat --force debug            # 必须 debug：只有 debug 构建读 MH_CDP_PORT
 *   node tools/e2e/smoke.mjs           # 端口默认 9222，可用 MH_E2E_PORT 改
 *   node tools/e2e/smoke.mjs --only=物价  # 只跑某一节（改一页时用，省时间）
 *
 * 它要的是**一个已经起来、开着调试端口的真窗口**，不自己编译、不自己起服务。
 * 退出码：0 全过 / 1 有断言红 / 2 环境不对（端口不通、连不上）。
 *
 * ---- 会写真实数据 ----
 *
 * 这不是只读测试：它真的往账本里建角色、记价、点速记。所以脚本**开头自动快照**
 * 一份库（`.runtime/e2e-db/`），结尾把还原命令打出来：
 *
 *   关掉窗口后：node tools/e2e/db.mjs restore <id> --yes
 *
 * 能自己收的都会收：带「E2E」前缀的角色与物价条目会删掉，测试里临时设的单价会清掉，
 * **字号与主题都会还原成跑之前那一档**（字号按 `--fs-scale` 反查档位，主题按
 * `localStorage.mh-theme` 反查，`null` 记作「跟随系统」——只看根元素的 `dark` 类分不出
 * 「跟随系统」和「浅色」，会把用户的跟随系统改成浅色）。收不了的是**速记流水的几笔**
 * ——账本里没有批量撤销，一条条删等于手动做收尾，所以交给快照还原。
 *
 * ---- 断言的口径 ----
 *
 * 每条都基于**页面自己渲染出来的**东西（innerText / DOM 数量 / aria-label），
 * 不看内部状态：状态对了但没画出来，对用户来说仍然是坏的。
 *
 * ---- 一节一个文件（2026-11-05 拆） ----
 *
 * 十一节原本同住这一个文件，1767 行。改一页要在一整条流程里找那一节，而这条流程
 * 从头到尾都在 `await`，跳读很贵。现在每一节是 `sections/` 下的一个模块，
 * 导出一个 `run(ctx)`；本文件只剩**装配**：连窗口、建 reporter、按顺序跑、汇总。
 *
 * `ctx` 里放的是跨节要用的几样东西（`cdp` / `ui` / `t` / `want` / `sleep` / `baseline`），
 * 外加两处**由前一节算出来**的数：`charsInDb`（预检对账的结果，导航那节要用它比
 * 「各号近况」的卡片数）和 `info`（预检拿到的 `app_info`，数据那节要靠它判断
 * 「是不是 debug 构建」）。这两样也走 `ctx`，不另开一个返回值协议。
 */

import { attach, sleep, SetupError } from './cdp.mjs';
import { createUi } from './ui.mjs';
import { createReporter } from './assert.mjs';
import accounts from './sections/05-accounts.mjs';
import characters from './sections/02-characters.mjs';
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
const want = (key) => !only || key.includes(only);

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

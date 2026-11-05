import { dataDir, snapshot } from '../db.mjs';

/* ============================ 0. 预检 ============================ */

/** 返回 `{ charsInDb }`：第 1 节拿它比「各号近况」的卡片数。 */
export default async function run(ctx) {
    const { cdp, ui, t } = ctx;

    t.section('0 预检 · 真窗口与数据目录');

    const info = await cdp.appInfo();
    /* 交给第 9 节：它要靠 `info.debug` 判断「测试钩子在不在」，不在就跳过而不是硬点
     * （发布版里没有钩子，点「导出」会弹出系统对话框等一个不会有人来点的人）。 */
    ctx.info = info;
    t.check(
        'Tauri IPC 可达（不是浏览器里的假窗口）',
        !!info && !info.error,
        info?.error ?? `${info?.productName} ${info?.version}`,
    );
    t.info('运行环境', `${info?.webview ?? '?'} · 数据目录 ${info?.dataDir ?? dataDir()}`);
    /* 调试端口只存在于 debug 构建，能连上来基本就说明是 debug；这条断言是把「基本」变成判据：
     * 后面「数据」那一节要往数据目录写测试钩子，发布版里没有那段代码——真在发布版上跑，
     * 点「导出」会弹出系统对话框等一个不会有人来点的人。 */
    t.check('这是 debug 构建（测试钩子可用）', info?.debug === true, `debug=${info?.debug}`);

    const href = await cdp.evaluate('location.href');
    t.check('页面不是错误页', !href.startsWith('chrome-error'), href);

    try {
        const snap = snapshot(dataDir());
        ctx.snap = snap;
        t.info(
            '账本已快照',
            `${snap.dir}（${snap.files.map((f) => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB`).join(' · ')}）`,
        );
    } catch (error) {
        t.info('账本快照失败', `${error.message}（跑完可能要手动收拾测试数据）`);
    }

    /*
     * 对账：页面上的条数必须等于库里的行数。
     *
     * 对不上说明这一版界面**没读到数据**——热更新把 store 模块重算了一遍（模块级单例
     * 回到空数组，而 `loadRoster` 只在启动时跑）、读库失败、或者库刚被别的进程改过。
     * 这时任何一次保存都是「拿空表覆盖库」。2026-11-04 真栽过一次：一次
     * `characters_save([新角色])` 把 4 个角色顶掉了。
     *
     * 所以写第一个字之前先对账；对不上就停，连测试数据都不写。
     *
     * `key`：命令返回信封而不是数组时，指定行数组在哪一格（收益页那两个是一起读回来的
     * `{ entries, prices }`）。读失败一律 -1，与「空表 0」分开——对账时 0 是合法状态。
     */
    const dbCount = (command, key = '') =>
        cdp.evaluate(
            `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)})
                .then((v) => {
                    const rows = ${key ? `v?.[${JSON.stringify(key)}]` : 'v'};
                    return Array.isArray(rows) ? rows.length : -1;
                }, () => -1)`,
        );

    ctx.dbCount = dbCount;

    await ui.goto('角色');
    const charsOnPage = await ui.count('.roster .char');
    const charsInDb = await dbCount('characters_load');
    t.check(
        '对账：名册页面条数 = 库里行数',
        charsOnPage === charsInDb,
        `页面 ${charsOnPage} / 库 ${charsInDb}`,
    );

    await ui.goto('物价');
    const pricesOnPage = await ui.count('article.price-card');
    const pricesInDb = await dbCount('prices_load');
    t.check(
        '对账：物价页面条数 = 库里行数',
        pricesOnPage === pricesInDb,
        `页面 ${pricesOnPage} / 库 ${pricesInDb}`,
    );

    if (charsOnPage !== charsInDb || pricesOnPage !== pricesInDb) {
        t.info('已中止', '页面和库对不上：先在窗口里 Ctrl+R 重载一次再跑，别拿空表去覆盖库');
        await t.summary();
        cdp.close();
        process.exit(5);
    }

    return { charsInDb };
}

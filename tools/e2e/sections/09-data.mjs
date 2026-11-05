import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir } from '../db.mjs';

/* ============================ 9. 数据（集成） ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, info, dbCount } = ctx;

    /**
     * 导出 → 导入整条路的**真往返**：真文件、真信封、真整份替换、真重载。
     *
     * 这一节以前只到「三枚按钮在、按 Esc 能取消」——中间那段恰好是「用户的账到底有没有安全
     * 落盘」的那一段，从来没被走过。挡住它的是系统文件对话框：不在 WebView 里、CDP 点不到，
     * 真弹出来还会把模态窗挂在窗口前面等人。
     *
     * `backup.rs` 为此留了一个**只在 debug 构建里存在**的钩子：数据目录下的
     * `e2e-dialog.json`（`{"save": …}` / `{"open": …}`），读到就删、只生效一次。
     * 发布版里这段代码根本不编译进去。
     *
     * 三个前提都写在断言里，缺一个就跳过而不是硬点：
     * ① 是 debug 构建（`app_info` 的 `debug`，发布版连调试端口都没有，到不了这里）；
     * ② 数据目录可写（钩子文件要落在那里）；
     * ③ 账本本身读得出来（条数不为 -1）。
     */
    if (want('数据') && !info?.debug) {
        t.section('9 数据 · 已跳过');
        t.info('跳过原因', '不是 debug 构建：测试钩子与调试端口都只在 debug 里有');
    } else if (want('数据')) {
        t.section('9 数据 · 导出 → 导入往返（真文件、真替换）');

        const dir = dataDir();
        const hookFile = join(dir, 'e2e-dialog.json');
        const exportDir = resolve('.runtime/e2e-export');
        const exportFile = join(exportDir, `ledger-${Date.now()}.json`);
        const writeHook = (payload) => writeFileSync(hookFile, JSON.stringify(payload), 'utf8');

        const counts = async () => ({
            chars: await dbCount('characters_load'),
            prices: await dbCount('prices_load'),
            entries: await dbCount('income_load', 'entries'),
        });

        let before = null;

        await t.step('记录导出前的条数', async () => {
            before = await counts();
            t.info(
                '导出前',
                `${before.chars} 角色 / ${before.prices} 物价 / ${before.entries} 笔流水`,
            );
            if (before.chars < 0 || before.prices < 0 || before.entries < 0) {
                throw new Error('账本读不出来，这一节没有意义');
            }
        });

        await t.step('导出：真写一份 JSON 到磁盘', async () => {
            await ui.goto('设置');
            mkdirSync(exportDir, { recursive: true });
            /* 每轮都留一份新的，但只留最近 5 份：一轮全量约 56KB，不清会攒到几百个文件，
             * 而翻旧账只需要「昨天那份」。 */
            if (existsSync(exportDir)) {
                const old = readdirSync(exportDir)
                    .map((name) => ({ name, mtime: statSync(join(exportDir, name)).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime)
                    .slice(5);
                for (const one of old) rmSync(join(exportDir, one.name));
            }
            writeHook({ save: exportFile });
            await ui.clickLabel('导出账本到文件');
            const done = await ui.waitText('已导出到', { timeout: 8000 });
            if (!done) throw new Error(`没等到导出回执：${(await ui.text()).slice(0, 120)}`);
            t.pass('界面回了「已导出到 …」');
            t.check('文件落在磁盘上', existsSync(exportFile), exportFile);
        });

        await t.step('导出的是一份完整信封', async () => {
            const file = JSON.parse(readFileSync(exportFile, 'utf8'));
            t.check(
                '信封格式与应用标识对',
                file.format === 1 && file.app === 'mh-toolbox-rs',
                `format=${file.format} app=${file.app}`,
            );
            t.check(
                '角色条数与库一致',
                file.characters?.length === before.chars,
                `文件 ${file.characters?.length} / 库 ${before.chars}`,
            );
            t.check(
                '物价条数与库一致',
                file.prices?.length === before.prices,
                `文件 ${file.prices?.length} / 库 ${before.prices}`,
            );
            t.check(
                '流水条数与库一致',
                file.income?.length === before.entries,
                `文件 ${file.income?.length} / 库 ${before.entries}`,
            );
            t.info('导出体积', `${(statSync(exportFile).size / 1024).toFixed(1)} KB`);
        });

        await t.step('导入：确认 → 整份替换 → 页面自己重载', async () => {
            writeHook({ open: exportFile });
            await ui.clickLabel('从备份文件导入账本');
            const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 4000,
            });
            if (!asked) throw new Error('导入没有二次确认');
            /* 必须在点之前取：点下去之后 `location.reload()` 随时可能把文档换掉。 */
            const beforeReload = await cdp.timeOrigin();
            await ui.clickText('button', '替换', { exact: true });
            await cdp.waitForReload(beforeReload);
            t.pass('导入后页面自己重载了');
            const noted = await ui.waitText('已导入', { timeout: 8000 });
            t.check(
                '重载后仍显示导入回执（经 sessionStorage 过河）',
                noted,
                noted ? '' : `页面开头：${(await ui.text()).slice(0, 60).replace(/\s+/g, ' ')}`,
            );
        });

        await t.step('导入后条数与导出前一致（整份替换没丢东西）', async () => {
            const after = await counts();
            t.check(
                '角色数回到导出前',
                after.chars === before.chars,
                `期望 ${before.chars}，实际 ${after.chars}`,
            );
            t.check(
                '物价数回到导出前',
                after.prices === before.prices,
                `期望 ${before.prices}，实际 ${after.prices}`,
            );
            t.check(
                '流水数回到导出前',
                after.entries === before.entries,
                `期望 ${before.entries}，实际 ${after.entries}`,
            );

            await ui.goto('角色');
            t.check(
                '名册页面也画出来了（不是只有库对）',
                (await ui.count('.roster .char')) === before.chars,
                `页面 ${await ui.count('.roster .char')} 个`,
            );
        });

        await t.step('替换前自动备份了一份', async () => {
            const backupDir = join(dir, 'backups');
            const fresh = existsSync(backupDir)
                ? readdirSync(backupDir)
                      .filter((name) => name.startsWith('账本-before-import-'))
                      .map((name) => statSync(join(backupDir, name)).mtimeMs)
                      .filter((ms) => Date.now() - ms < 5 * 60 * 1000)
                : [];
            t.check('backups/ 里有刚生成的 before-import', fresh.length > 0, `${fresh.length} 份`);
        });

        /* 钩子文件正常已被消费掉；失败路径上会留一份，留着它会让**下一次**导出自动跳到
         * 测试目录——用户点导出时什么都不发生，还以为按钮坏了。 */
        await t.step('收尾：不留钩子文件', async () => {
            if (existsSync(hookFile)) rmSync(hookFile);
            t.check('数据目录里没有残留 e2e-dialog.json', !existsSync(hookFile));
        });
    }
}

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
            accounts: await dbCount('account_load'),
            goals: await dbCount('goals_load'),
            quickPrices: await dbCount('income_load', 'prices'),
        });

        let before = null;
        let original;
        await t.step('准备非空账号、目标流水、收益与单价夹具', async () => {
            original = await cdp.evaluate(`(async () => {
                const { commands } = await import('/src/services/bindings.ts');
                const income = await commands.incomeLoad();
                const accounts = await commands.accountLoad();
                const goals = await commands.goalsLoad();
                const today = (await import('/src/services/format.ts')).todayText();
                const entry = { id: 'e2e-backup-income', date: today, characterId: '', kind: 'income', amount: 12345, item: 'E2E备份收益', note: '', createdAt: Date.now() };
                await commands.incomeSave({ entries: [...income.entries, entry], prices: [{ itemId: 9, price: 46000 }, ...income.prices.filter((one) => one.itemId !== 9)] });
                await commands.accountSave([...accounts, { id: 'e2e-backup-account', date: today, characterId: '', kind: 'expense', currency: 'rmb', category: '点卡充值', channel: '官方充值', amount: 30, note: 'E2E备份账号', createdAt: Date.now() }]);
                await commands.goalsSave([...goals, { id: 'e2e-backup-goal', kind: 'money', title: 'E2E备份目标', members: [{ id: 'e2e-member', name: 'E2E成员' }], target: 10, unit: '万', tracking: null, deadline: '', note: '备份往返', logs: [{ id: 'e2e-backup-log', date: today, delta: 2, note: 'E2E目标流水', createdAt: Date.now() }], createdAt: Date.now() }]);
                return { income, accounts, goals };
            })()`);
            await ui.reload();
            t.pass('非空夹具已通过真实 IPC 写库并重载');
        });

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
            t.check(
                '账号与目标为非空且条数一致',
                file.accounts.length === before.accounts &&
                    file.accounts.length > 0 &&
                    file.goals.length === before.goals &&
                    file.goals.length > 0,
            );
            t.check(
                '目标流水内容随信封导出',
                file.goals.find((one) => one.id === 'e2e-backup-goal')?.logs[0]?.note ===
                    'E2E目标流水',
            );
            t.info('导出体积', `${(statSync(exportFile).size / 1024).toFixed(1)} KB`);
        });

        await t.step('重复账号 id 的备份被拒绝，原账本保持不变', async () => {
            const badFile = join(exportDir, 'invalid-duplicate.json');
            const bad = JSON.parse(readFileSync(exportFile, 'utf8'));
            bad.accounts.push(bad.accounts[0]);
            writeFileSync(badFile, JSON.stringify(bad), 'utf8');
            writeHook({ open: badFile });
            await ui.clickLabel('从备份文件导入账本');
            await ui.clickText('button', '替换', { exact: true });
            t.check('错误说清账号记录 id 重复', await ui.waitText('账号记录的 id'));
            t.check(
                '拒绝后所有条数原样保留',
                JSON.stringify(await counts()) === JSON.stringify(before),
            );
        });

        await t.step('清除确认说明全部范围，清除后所有账本集合均为空', async () => {
            await ui.clickLabel('清空全部账本数据');
            const note = await ui.text('[role="dialog"]');
            t.check(
                '清除问句覆盖六类数据',
                ['角色', '物价', '收益流水', '速记单价', '账号记录', '目标'].every((one) =>
                    note.includes(one),
                ),
            );
            const origin = await cdp.timeOrigin();
            await ui.clickText('[role="dialog"] button', '清除', { exact: true });
            await cdp.waitForReload(origin);
            t.check(
                '清除回执覆盖收益与账号',
                (await ui.waitText('已清空')) && (await ui.text()).includes('笔账号记录'),
            );
            t.check(
                '七张业务表均已清空',
                Object.values(await counts()).every((count) => count === 0),
            );
        });

        await t.step('导入：确认 → 整份替换 → 页面自己重载', async () => {
            writeHook({ open: exportFile });
            await ui.clickLabel('从备份文件导入账本');
            const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 4000,
            });
            if (!asked) throw new Error('导入没有二次确认');
            const scope = await ui.text('[role="dialog"]');
            t.check(
                '导入确认说明全部账本范围',
                ['角色', '物价', '收益流水', '速记单价', '账号记录', '目标'].every((one) =>
                    scope.includes(one),
                ),
            );
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

            t.check(
                '账号、目标与单价数量一致',
                after.accounts === before.accounts &&
                    after.goals === before.goals &&
                    after.quickPrices === before.quickPrices,
            );
            const content = await cdp.evaluate(`(async () => {
                const { commands } = await import('/src/services/bindings.ts');
                const account = (await commands.accountLoad()).find((one) => one.id === 'e2e-backup-account');
                const goal = (await commands.goalsLoad()).find((one) => one.id === 'e2e-backup-goal');
                return { account, goal };
            })()`);
            t.check(
                '重载后账号金额、币种、备注未丢',
                content.account?.amount === 30 &&
                    content.account.currency === 'rmb' &&
                    content.account.note === 'E2E备份账号',
            );
            t.check(
                '重载后目标及流水未丢',
                content.goal?.title === 'E2E备份目标' &&
                    content.goal.logs[0]?.delta === 2 &&
                    content.goal.logs[0]?.note === 'E2E目标流水',
            );
            await ui.goto('账号');
            t.check('导入后的账号记录出现在页面', (await ui.text()).includes('E2E备份账号'));
            await ui.goto('目标');
            t.check('导入后的目标出现在页面', (await ui.text()).includes('E2E备份目标'));
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

        await t.step('本地备份恢复：取消不改账本，确认后整份替换并重载', async () => {
            const name = `账本-daily-${Date.now()}.json`;
            const path = join(dir, 'backups', name);
            writeFileSync(path, readFileSync(exportFile));
            try {
                await cdp.evaluate(`(async () => {
                    const { commands } = await import('/src/services/bindings.ts');
                    await commands.accountSave((await commands.accountLoad()).filter((one) => one.id !== 'e2e-backup-account'));
                })()`);
                await ui.reload();
                await ui.goto('设置');
                const changed = await counts();
                t.check('恢复前账号夹具已移除', changed.accounts === before.accounts - 1);
                await ui.clickLabel('查看本地备份与恢复');
                await cdp.waitFor(`!!document.querySelector('.backup-list')`);
                await ui.clickLabel(`恢复备份 ${name}`);
                await ui.clickText('button', '取消', { exact: true });
                t.check(
                    '取消恢复后数据保持原样',
                    JSON.stringify(await counts()) === JSON.stringify(changed),
                );
                await ui.clickLabel(`恢复备份 ${name}`);
                const origin = await cdp.timeOrigin();
                await ui.clickLabel('确认恢复');
                await cdp.waitForReload(origin);
                t.check('恢复完成后显示回执', await ui.waitText('已恢复账本'));
                t.check(
                    '全部集合恢复到备份状态',
                    JSON.stringify(await counts()) === JSON.stringify(before),
                );
                const account = await cdp.evaluate(`(async () => {
                    const { commands } = await import('/src/services/bindings.ts');
                    return (await commands.accountLoad()).find((one) => one.id === 'e2e-backup-account');
                })()`);
                t.check(
                    '恢复后账号完整内容仍在',
                    account?.amount === 30 && account.note === 'E2E备份账号',
                );
            } finally {
                if (existsSync(path)) rmSync(path);
            }
        });

        await t.step('移除本节夹具，恢复原收益、账号与目标', async () => {
            if (!original) throw new Error('没有取得夹具前的数据');
            await cdp.evaluate(`(async () => {
                const { commands } = await import('/src/services/bindings.ts');
                const original = ${JSON.stringify(original)};
                await commands.incomeSave(original.income);
                await commands.accountSave(original.accounts);
                await commands.goalsSave(original.goals);
            })()`);
            await ui.reload();
            t.pass('本节夹具已移除');
        });

        /* 钩子文件正常已被消费掉；失败路径上会留一份，留着它会让**下一次**导出自动跳到
         * 测试目录——用户点导出时什么都不发生，还以为按钮坏了。 */
        await t.step('收尾：不留钩子文件', async () => {
            if (existsSync(hookFile)) rmSync(hookFile);
            t.check('数据目录里没有残留 e2e-dialog.json', !existsSync(hookFile));
        });
    }
}

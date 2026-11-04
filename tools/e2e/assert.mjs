/**
 * 断言与报告：让每一条检查都成为一行可读的输出，并在失败时留下现场。
 *
 * ---- 为什么单独一份 ----
 *
 * 老版把 `ok / bad / check` 三个函数和十几段 `try { … } catch { bad(…) }` 写进主流程，
 * 于是「新增一节测试」这件事要先抄一段样板。这里把三件重复的事收进来：
 *
 * 1. `step()`：一个动作一组断言，抛错就记一条红，**不再连坐**后面所有步骤；
 * 2. 失败自动截图：红字只说「被遮挡」，图能看出被什么挡住；
 * 3. 汇总落盘：`.runtime/e2e-report.json`，隔天回看「昨天红在哪一条」不用翻终端历史。
 *
 * ---- 口径 ----
 *
 * `info()` 是**提示不是断言**：清掉几条遗留、今天原来有几笔，这些数字写进报告
 * 方便对照，但它们不参与通过/失败——老版把这些写成 PASS，等于给假绿灯。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT = '.runtime/e2e-report.json';
const SHOTS = '.runtime/e2e-shots';

export function createReporter({ cdp = null } = {}) {
    const rows = [];
    const sections = [];
    let current = null;
    let failCount = 0;
    const shots = [];

    const stamp = () => `${Date.now()}`;

    /** 失败现场：抓一张图，文件名带序号与时间戳。抓不到就算了，不因此再红一条。 */
    const capture = (name) => {
        if (!cdp || failCount > 12) return;
        const file = `${SHOTS}/fail-${String(failCount).padStart(2, '0')}-${stamp()}.png`;
        shots.push(
            cdp
                .shot(file)
                .then((path) => {
                    const row = rows.find((r) => r.name === name && r.state === 'FAIL');
                    if (row) row.shot = path;
                })
                .catch(() => {}),
        );
    };

    const push = (state, name, detail = '') => {
        rows.push({ state, name, detail, section: current?.title ?? '（未分组）' });
        const mark = { PASS: '✅', FAIL: '❌', INFO: '··' }[state];
        console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
        if (state === 'FAIL') {
            failCount += 1;
            capture(name);
        }
    };

    return {
        /** 开一节：上一节在这里收口、记下结束时间；之后所有断言都归到新的一节。 */
        section(title) {
            if (current) current.endedAt = Date.now();
            current = { title, startedAt: Date.now(), endedAt: null, pass: 0, fail: 0 };
            sections.push(current);
            console.log(`\n【${title}】`);
        },

        pass: (name, detail) => {
            if (current) current.pass += 1;
            push('PASS', name, detail);
        },

        fail(name, detail) {
            if (current) current.fail += 1;
            push('FAIL', name, detail);
        },

        info: (name, detail) => push('INFO', name, detail),

        check(name, condition, detail = '') {
            if (condition) this.pass(name, detail);
            else this.fail(name, detail);
            return !!condition;
        },

        /**
         * 跑一个动作并吞掉它抛的错。返回值的 `ok` 用来决定后续步骤要不要继续；
         * 抛错时现场截图**已经**在 `fail` 里排上了。
         */
        async step(name, action) {
            try {
                const value = await action();
                return { ok: true, value };
            } catch (error) {
                this.fail(name, error.message);
                return { ok: false, error };
            }
        },

        /** 收尾：等截图落地、打印汇总、写报告，返回进程退出码。 */
        async summary() {
            await Promise.all(shots);
            const pass = rows.filter((r) => r.state === 'PASS').length;
            const info = rows.filter((r) => r.state === 'INFO').length;
            const fails = rows.filter((r) => r.state === 'FAIL');
            /* 节耗时按「上一节收口时算」，最后一节算到汇总为止。各节相加就是总时长。 */
            const costOf = (s) => ((s.endedAt ?? Date.now()) - s.startedAt) / 1000;
            const seconds = sections.reduce((sum, s) => sum + costOf(s), 0).toFixed(1);

            const pageErrors = cdp?.errors ?? [];
            console.log(`\n${'='.repeat(60)}`);
            console.log(
                `结果：${pass} 通过 / ${fails.length} 失败 / ${info} 提示 · 用时 ${seconds}s`,
            );
            if (pageErrors.length) {
                console.log(`\n页面控制台报错 ${pageErrors.length} 条：`);
                for (const one of [...new Set(pageErrors)].slice(0, 15)) console.log(`  ! ${one}`);
            } else {
                console.log('页面控制台：零报错');
            }
            if (fails.length) {
                console.log('\n失败明细：');
                for (const one of fails)
                    console.log(`  × ${one.section} / ${one.name} — ${one.detail}`);
            }
            if (shots.length) console.log(`\n失败截图：${SHOTS}/`);

            try {
                mkdirSync(resolve('.runtime'), { recursive: true });
                writeFileSync(
                    resolve(REPORT),
                    `${JSON.stringify(
                        {
                            ranAt: new Date().toISOString(),
                            seconds: Number(seconds),
                            pass,
                            fail: fails.length,
                            info,
                            sections: sections.map((s) => ({
                                title: s.title,
                                pass: s.pass,
                                fail: s.fail,
                                seconds: costOf(s).toFixed(1),
                            })),
                            failures: fails.map((f) => ({
                                section: f.section,
                                name: f.name,
                                detail: f.detail,
                                shot: f.shot ?? null,
                            })),
                            pageErrors: [...new Set(pageErrors)],
                        },
                        null,
                        2,
                    )}\n`,
                );
                console.log(`报告：${REPORT}`);
            } catch {
                /* 报告写不下去不该改变测试结论。 */
            }

            return fails.length ? 1 : 0;
        },
    };
}

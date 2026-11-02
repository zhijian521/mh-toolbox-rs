import { describe, expect, it } from 'vitest';
import mapsFile from '../../../public/maps/maps.json';
import type { GhostMap } from '../../services/ghost-maps';
import { planFor } from '../../services/ghost-model';
import { linesFromText, parseGhostTasks } from '../../services/ghost-parse';
import { GHOST_TEST_SAMPLES } from './ghost-samples';

/**
 * 测试样例的回归。
 *
 * 这些样例是「开不了游戏时唯一能看到的画面」的输入。它们坏掉时的表现最难查：
 * 界面上只是点了没反应，而人会先去怀疑解析正则、再怀疑底图，最后才想到
 * 「样例本身是不是写错了」。
 *
 * 所以这里不测「能解析」，而是测**解析成哪个坐标**——只断言「有结果」，
 * 正则退化成乱配也能过。
 *
 * 底图清单读真实 `public/maps/maps.json`：地名匹配与值域切分（`119107` → `119,107`）
 * 都依赖它，手搓假 map 会让最该被守住的那条规则测成空转。
 */
const maps: GhostMap[] = mapsFile.maps;

function parse(sampleText: string) {
    return parseGhostTasks(linesFromText(sampleText), maps);
}

/** 按 label 取样例，改名即报错——这比下标可靠。 */
function sample(label: string): string {
    const found = GHOST_TEST_SAMPLES.find((item) => item.label === label);
    if (!found) throw new Error(`样例清单里没有「${label}」`);
    return found.text;
}

describe('测试样例', () => {
    it('每一条都能解析出至少一条任务', () => {
        // 面板上点一下什么都不出现，是最容易被当成「功能没做」的失败。
        for (const item of GHOST_TEST_SAMPLES) {
            const report = parse(item.text);
            expect(report.tasks.length, `样例「${item.label}」没解析出任务`).toBeGreaterThan(0);
        }
    });

    it('小鬼 · 未开眼：江南野外 38,46，两个轴都 ≤50 时收得出高概率区', () => {
        const report = parse(sample('小鬼 · 未开眼'));
        const [task] = report.tasks;
        expect(task?.kind).toBe('small');
        expect(task?.map?.name).toBe('江南野外');
        expect([task?.x, task?.y]).toEqual([38, 46]);
        expect(task?.reveal).toBe('nearby');

        const plan = planFor(task!, true);
        expect(plan.mode).toBe('range');
        // 两层框必须真的不同，否则界面上看不出「高概率区域」这个开关做了什么。
        if (plan.mode === 'range') expect(plan.range.likely).not.toBeNull();
    });

    it('小鬼 · 已开眼：句尾为空也判精确点，不是「未知」', () => {
        const report = parse(sample('小鬼 · 已开眼'));
        const [task] = report.tasks;
        expect([task?.x, task?.y]).toEqual([82, 60]);
        // 游戏开天眼是把「附近」删掉，句尾留空。判成 unknown 就永远停在 ±50 上。
        expect(task?.reveal).toBe('silent');
        expect(planFor(task!, true).mode).toBe('exact');
    });

    it('大鬼 · 全角逗号：带「的」且逗号全角，走的不是小鬼那条正则', () => {
        const report = parse(sample('大鬼 · 全角逗号'));
        const [task] = report.tasks;
        expect(task?.kind).toBe('big');
        expect(task?.map?.name).toBe('北俱芦洲');
        expect([task?.x, task?.y]).toEqual([93, 29]);
    });

    it('大小鬼同屏：两条任务各自成图，大鬼 172 走「只往大」', () => {
        const report = parse(sample('大小鬼同屏'));
        expect(report.tasks.map((task) => task.kind).sort()).toEqual(['big', 'small']);

        const big = report.tasks.find((task) => task.kind === 'big')!;
        expect([big.x, big.y]).toEqual([172, 29]);
        const plan = planFor(big, true);
        expect(plan.mode).toBe('range');
        // ≥150 只往大：收窄后的下界应当等于假坐标本身。
        if (plan.mode === 'range') expect(plan.range.x.side).toBe('high');
    });

    it('折行 + 误读：跨行拼接后 5q9/4o 纠成 599,40，并留下纠错记录', () => {
        const report = parse(sample('折行 + 误读'));
        const [task] = report.tasks;
        expect(task?.map?.name).toBe('大唐境外');
        expect([task?.x, task?.y]).toEqual([599, 40]);
        // 纠错记录是要显示在「识别原文」上的：没有它，人就以为 OCR 一次读对。
        const froms = report.corrections.map((item) => item.from);
        expect(froms).toContain('q');
        expect(froms).toContain('o');
    });

    it('缺逗号残帧：按麒麟山值域切成 119,107，并报出「缺分隔符」', () => {
        const report = parse(sample('缺逗号残帧'));
        const [task] = report.tasks;
        expect(task?.map?.name).toBe('麒麟山');
        // 值域 191×142 下 119107 只有 3+3 一种切法可行——这一条守的是切分规则本身。
        expect([task?.x, task?.y]).toEqual([119, 107]);
        expect(report.issues.some((issue) => issue.includes('缺分隔符'))).toBe(true);
    });
});

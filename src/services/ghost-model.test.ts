import { describe, expect, it } from 'vitest';
import mapsFile from '../../public/maps/maps.json';
import type { GhostMap } from './ghost-maps';
import { computeRange, planFor } from './ghost-model';
import type { ParsedTask } from './ghost-parse';

/**
 * 范围计算的回归测试。
 *
 * 这一层是纯算术，改一个阈值就会悄悄改动 20 张图的画法，而界面上「看起来还是两块红」，
 * 肉眼分不出对错。所以钉住四件事：
 *
 * - 收窄只砍**贴边那一侧**，不动的轴保持官方范围；
 * - `≤50 / ≥150` 是**绝对阈值**，中间带 51~149 一条线索都不给（社区原话「没有规律」）；
 * - 关掉「高概率区域」时只留官方 ±50，外框不变；
 * - `0,0` 只有登记为无坐标域的场景才算「整层」，否则判识别失败。
 *
 * 口径的外部出处与论证见 `docs/GHOST-HUNT.md` §6。
 */
const maps: GhostMap[] = mapsFile.maps;

function map(name: string): GhostMap {
    const found = maps.find((item) => item.name === name);
    if (!found) throw new Error(`测试用的底图不存在：${name}`);
    return found;
}

function task(over: Partial<ParsedTask> & { map: GhostMap | null }): ParsedTask {
    return {
        kind: 'small',
        index: 1,
        mapText: '某地',
        x: 1,
        y: 1,
        reveal: 'nearby',
        raw: '',
        ...over,
    };
}

describe('computeRange', () => {
    it('假坐标 ≥150 只砍反向那一半，官方范围不变', () => {
        // 大唐境外 640×120。x=200 命中「≥150 往大走」；y=60 在中间带，不砍。
        const range = computeRange(map('大唐境外'), 200, 60, true);
        expect(range.x.side).toBe('high');
        expect(range.y.side).toBe('none');
        expect(range.official).toEqual({ x0: 150, x1: 250, y0: 10, y1: 110 });
        // 深红从 200 起，右边与官方范围重合——「鬼只可能在比它更靠边的地方」。
        expect(range.likely).toEqual({ x0: 200, x1: 250, y0: 10, y1: 110 });
    });

    it('假坐标 ≤50 只砍另一侧', () => {
        const range = computeRange(map('宝象国'), 30, 60, true);
        expect(range.x.side).toBe('low');
        expect(range.official).toEqual({ x0: 0, x1: 80, y0: 10, y1: 110 });
        expect(range.likely).toEqual({ x0: 0, x1: 30, y0: 10, y1: 110 });
    });

    it('两轴都贴边时只剩四分之一（社区口径原话）', () => {
        const range = computeRange(map('五庄观'), 40, 30, true);
        expect(range.x.side).toBe('low');
        expect(range.y.side).toBe('low');
        expect(range.official).toEqual({ x0: 0, x1: 90, y0: 0, y1: 75 });
        expect(range.likely).toEqual({ x0: 0, x1: 40, y0: 0, y1: 30 });
    });

    it('51~149 的中间带不画深红——哪怕是「看着很贴边」的值', () => {
        // 江南野外 160 宽，134 占 84%，肉眼明显靠右；但绝对阈值只认 ≥150，
        // 社区原话是「51-149 没有规律只能硬找」。给它一个方向就是编规则。
        const range = computeRange(map('江南野外'), 134, 54, true);
        expect(range.x.side).toBe('none');
        expect(range.y.side).toBe('none');
        expect(range.likely).toBeNull();
    });

    it('值域不到 150 的轴上「≥150」不可达，只剩 ≤50 那一侧', () => {
        // 宝象国 maxY=120，y=120 已经是最大坐标。按比例口径这是 100%（贴边），
        // 绝对口径下它仍在中间带——换口径后行为改变就在这里。
        const range = computeRange(map('宝象国'), 100, 120, true);
        expect(range.y.side).toBe('none');
        expect(range.likely).toBeNull();
    });

    it('关掉高概率区域时只留官方 ±50，外框一格不动', () => {
        const on = computeRange(map('大唐境外'), 200, 60, true);
        const off = computeRange(map('大唐境外'), 200, 60, false);
        expect(off.likely).toBeNull();
        expect(off.x.side).toBe('none');
        // 开关只管经验层：它不是把范围放大或缩小，官方 ±50 与它无关。
        expect(off.official).toEqual(on.official);
    });

    it('范围夹在地图值域内，不会画出负坐标', () => {
        const range = computeRange(map('江南野外'), 5, 118, true);
        expect(range.official.x0).toBe(0);
        expect(range.official.y1).toBe(120);
    });

    it('越界的假坐标按贴边算框，不产生倒框、也不窄那一条边', () => {
        // 用户实测：普陀山 96×72 读到 100,66。判边用原值（100 > 96 → 不窄），
        // 算框用夹回来的 96，于是 [46,96]；若拿原值算会得到 100..96 的倒框。
        const range = computeRange(map('普陀山'), 100, 66, true);
        expect(range.x.value).toBe(100);
        expect(range.x.side).toBe('none');
        expect(range.official).toEqual({ x0: 46, x1: 96, y0: 16, y1: 72 });
        // y=66 落在中间带，也不窄，于是没有第二层。
        expect(range.y.side).toBe('none');
        expect(range.likely).toBeNull();
    });

    it('越界几十格也只夹不判错：挤到边上，宽度仍是 ±50', () => {
        const range = computeRange(map('碗子山'), 600, 45, true);
        expect(range.official.x0).toBeLessThanOrEqual(range.official.x1);
        expect(range.official.x1).toBe(95);
        expect(range.official.x0).toBe(45);
        // 越界轴不窄，另一轴 45 ≤50 照常贴小边。
        expect(range.likely).toEqual({ x0: 45, x1: 95, y0: 0, y1: 45 });
    });
});

describe('planFor', () => {
    it('「处」= 开天眼，画精确点而不是范围', () => {
        const plan = planFor(task({ map: map('江南野外'), x: 134, y: 54, reveal: 'exact' }), true);
        expect(plan.mode).toBe('exact');
    });

    it('「附近」两个字被删掉（另一种天眼写法）同样是精确点', () => {
        // 游戏开天眼是把「附近」直接删掉、不给替代字：`去江南野外134,54抓…`。
        // 这时句尾是**空**的（`silent`），与读到「处」的语义完全一样。
        const plan = planFor(task({ map: map('江南野外'), x: 134, y: 54, reveal: 'silent' }), true);
        expect(plan.mode).toBe('exact');
        if (plan.mode === 'exact') {
            expect(plan.x).toBe(134);
            expect(plan.y).toBe(54);
        }
    });

    it('已登记的无坐标域读到 0,0 → 整层', () => {
        const plan = planFor(task({ map: map('海底迷宫一层'), x: 0, y: 0 }), true);
        expect(plan.mode).toBe('whole');
    });

    it('别的场景读到 0,0 → 判识别失败，而不是静默降级成整层', () => {
        // 静默降级最伤：界面完全正常，画的却是一片没有信息的底色。
        const plan = planFor(task({ map: map('江南野外'), x: 0, y: 0 }), true);
        expect(plan.mode).toBe('invalid');
        expect(plan.map).not.toBeNull();
    });

    it('地名没匹配上底图 → invalid 且没有图', () => {
        const plan = planFor(task({ map: null }), true);
        expect(plan.mode).toBe('invalid');
        expect(plan.map).toBeNull();
    });

    it('常规坐标 → 双层范围', () => {
        const plan = planFor(task({ map: map('大唐境外'), x: 200, y: 60 }), true);
        expect(plan.mode).toBe('range');
    });

    it('关掉高概率区域仍然是 range，只是没有内层', () => {
        const plan = planFor(task({ map: map('大唐境外'), x: 200, y: 60 }), false);
        expect(plan.mode).toBe('range');
        if (plan.mode === 'range') expect(plan.range.likely).toBeNull();
    });

    it('越界坐标仍然是 range——「图中没有这个点」不等于「这条任务读错了」', () => {
        const plan = planFor(task({ map: map('普陀山'), x: 100, y: 66 }), true);
        expect(plan.mode).toBe('range');
    });
});

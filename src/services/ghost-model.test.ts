import { describe, expect, it } from 'vitest';
import mapsFile from '../../public/maps/maps.json';
import type { GhostMap } from './ghost-maps';
import { computeRange, planFor } from './ghost-model';
import type { ParsedTask } from './ghost-parse';

/**
 * 范围计算的回归测试。
 *
 * 这一层是纯算术，改一个阈值就会悄悄改动 20 张图的画法，而界面上「看起来还是个框」，
 * 肉眼分不出对错。所以至少要钉住三件事：
 *
 * - 收窄只砍**贴边那一侧**，不动的轴保持官方范围；
 * - `relative` 与 `absolute` 在什么输入下给出不同结论（这是两档存在的全部理由）；
 * - `0,0` 只有登记为无坐标域的场景才算「整层」，否则判识别失败。
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
    it('贴右边时只砍左侧，官方范围不变', () => {
        // 江南野外 160×120，134 占 84%，判为贴右边；y=54 居中，不砍。
        const range = computeRange(map('江南野外'), 134, 54, 'relative');
        expect(range.x.side).toBe('high');
        expect(range.y.side).toBe('none');
        expect(range.official).toEqual({ x0: 84, x1: 160, y0: 4, y1: 104 });
        // 内框从 134 起，右边与官方范围重合——「鬼只可能在比它更靠边的地方」。
        expect(range.likely).toEqual({ x0: 134, x1: 160, y0: 4, y1: 104 });
        expect(range.likelyCells).toBeLessThan(range.officialCells);
    });

    it('两轴都居中时不画内框（与外框重合的框只会误导）', () => {
        const range = computeRange(map('江南野外'), 80, 60, 'relative');
        expect(range.likely).toBeNull();
        expect(range.likelyCells).toBe(range.officialCells);
    });

    it('同一坐标在「按比例」与「按数值」下结论不同——这正是两档并存的理由', () => {
        // 大唐境外 640×120，x=120 占 19%：按比例是贴左边，按绝对阈值落进 51~149 的中间带。
        const relative = computeRange(map('大唐境外'), 120, 60, 'relative');
        const absolute = computeRange(map('大唐境外'), 120, 60, 'absolute');
        expect(relative.x.side).toBe('low');
        expect(absolute.x.side).toBe('none');
        expect(absolute.likely).toBeNull();
    });

    it('「不收窄」只给官方 ±50', () => {
        const range = computeRange(map('江南野外'), 134, 54, 'off');
        expect(range.likely).toBeNull();
        expect(range.officialCells).toBe(range.likelyCells);
    });

    it('范围夹在地图值域内，不会画出负坐标', () => {
        const range = computeRange(map('江南野外'), 5, 118, 'relative');
        expect(range.official.x0).toBe(0);
        expect(range.official.y1).toBe(120);
    });
});

describe('planFor', () => {
    it('「处」= 开天眼，画精确点而不是范围', () => {
        const plan = planFor(
            task({ map: map('江南野外'), x: 134, y: 54, reveal: 'exact' }),
            'relative',
        );
        expect(plan.mode).toBe('exact');
    });

    it('已登记的无坐标域读到 0,0 → 整层', () => {
        const plan = planFor(task({ map: map('海底迷宫一层'), x: 0, y: 0 }), 'relative');
        expect(plan.mode).toBe('whole');
    });

    it('别的场景读到 0,0 → 判识别失败，而不是静默降级成整层', () => {
        // 静默降级最伤：界面完全正常，画的却是一片没有信息的底色。
        const plan = planFor(task({ map: map('江南野外'), x: 0, y: 0 }), 'relative');
        expect(plan.mode).toBe('invalid');
        expect(plan.map).not.toBeNull();
    });

    it('地名没匹配上底图 → invalid 且没有图', () => {
        const plan = planFor(task({ map: null }), 'relative');
        expect(plan.mode).toBe('invalid');
        expect(plan.map).toBeNull();
    });

    it('常规坐标 → 双层范围', () => {
        const plan = planFor(task({ map: map('江南野外'), x: 134, y: 54 }), 'relative');
        expect(plan.mode).toBe('range');
    });
});

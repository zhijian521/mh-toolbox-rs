import type { GhostMap } from './ghost-maps';
import type { ParsedTask } from './ghost-parse';

/**
 * 从「假坐标」推到「该在哪找」。
 *
 * 这里只有算术，没有 DOM、没有 Tauri。所有几何都在**坐标空间**里算完，
 * 最后一步才乘 kx / ky 换成像素——顺序反了热力形状就会歪：
 * `kx` 与 `ky` 一般不严格相等（实测差 1% 量级），坐标里的正方形画到图上是矩形。
 * 见 `docs/GHOST-HUNT.md` §2。
 */

/** 官方口径的容差。攻略原文：任务栏提示坐标 ±50 范围内。 */
const TOLERANCE = 50;

/** 单边规则的判定口径。 */
export type EdgeRule =
    /** 按「离边界多远」判，与地图大小无关，20 张图一套规则。 */
    | 'relative'
    /** 照搬社区经验「≤50 往小、≥150 往大」，符合老玩家直觉，但在小图上失效。 */
    | 'absolute'
    /** 只给官方范围，不做收窄。 */
    | 'off';

/** 某轴假坐标偏向哪一侧。`none` = 居中，两个方向都可能。 */
export type Side = 'low' | 'high' | 'none';

export interface AxisInfo {
    /**
     * 任务栏给的原始假坐标。**可能超出 `max`**——游戏按真实位置 ±50 随机，
     * 不按地图边界裁剪，所以真身贴着右边时提示值本身就会越过 maxX。
     */
    value: number;
    max: number;
    side: Side;
}

/** 一个矩形范围，单位是游戏坐标。 */
export interface Box {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

export interface SearchRange {
    /** 官方 ±50，已按地图边界裁剪。 */
    official: Box;
    /** 单边规则收窄后的范围。与外框完全重合时为 `null`——此时不画第二层。 */
    likely: Box | null;
    x: AxisInfo;
    y: AxisInfo;
    /** 面积，单位「格」。按含两端的整数点数计：`(x1-x0+1) × (y1-y0+1)`。 */
    officialCells: number;
    likelyCells: number;
}

/**
 * 这一条任务该怎么画。
 *
 * 三种模式由任务文本自动决定，不需要用户切：
 *
 * | 文本 | 模式 |
 * | --- | --- |
 * | `去X处`（开了天眼） | `exact` 精确点 |
 * | `去X，Y附近`，坐标有效 | `range` 双层范围 |
 * | `去X附近`，坐标为 `0,0` 且场景登记为无坐标域 | `whole` 全层 |
 */
export type GhostPlan =
    | { mode: 'exact'; map: GhostMap; x: number; y: number; task: ParsedTask }
    | { mode: 'range'; map: GhostMap; range: SearchRange; task: ParsedTask }
    | { mode: 'whole'; map: GhostMap; reason: string; task: ParsedTask }
    /** 画不出来。`map` 有值时仍然把底图显示出来——能看到地形总比一片空白有用。 */
    | { mode: 'invalid'; map: GhostMap | null; reason: string; task: ParsedTask };

/**
 * `0,0` 的合法性判定。
 *
 * 这个值只在**已登记为无坐标域**的场景里才算真（当前只有海底迷宫一层，
 * 玩家已确认游戏内就显示 `0,0`）。白名单外的场景读到它，最大可能是 OCR
 * 把真实坐标读没了——这时如果照常降级成「全层铺底」，界面看起来完全正常，
 * 但画的是一片没有信息的底色。这种「静默降级」是最难发现的错。
 */
function isNoCoordinate(map: GhostMap, x: number, y: number): boolean {
    return x === 0 && y === 0 && map.noCoord === true;
}

/**
 * 判断某轴往哪边收。
 *
 * `relative` 用 25% / 75% 两条线：地图坐标系原点在左下、值域就是全体可走范围，
 * 所以「贴近 1/4 以内」在语义上等于「贴着这条边」。
 * 用它而不是绝对阈值，是因为实测地图值域跨度极大（五庄观 100×75，大唐境外 640×120），
 * 固定阈值 50/150 在小图上永远触发不了——江南野外 maxX=160，假坐标 134 占 84%（明显贴右边），
 * 按绝对阈值却判成「51~149 无规律」，把最容易收敛的一类白白丢掉。
 */
function sideOf(value: number, max: number, rule: EdgeRule): Side {
    if (rule === 'off' || max <= 0) return 'none';
    // 越界的不窄。范围本来就已经顶到那条边了，`value ± 50` 再被裁一次只会剩
    // 一根 0 宽的线；而「鬼在比 100 更靠右的地方」对一张 96 格宽的图没有意义。
    if (value < 0 || value > max) return 'none';
    if (rule === 'absolute') {
        if (value <= 50) return 'low';
        if (value >= 150) return 'high';
        return 'none';
    }
    const ratio = value / max;
    if (ratio <= 0.25) return 'low';
    if (ratio >= 0.75) return 'high';
    return 'none';
}

/** 夹回值域。越界的假坐标要靠它才算得出框，不然 `value ± 50` 会给出 x0 > x1 的倒框。 */
function clamp(value: number, max: number): number {
    return Math.min(Math.max(value, 0), max);
}

/** 单轴的范围，含边界裁剪。`value` 必须已夹进 `[0, max]`。 */
function axisBox(value: number, max: number, side: Side): { lo: number; hi: number } {
    const lo = Math.max(0, value - TOLERANCE);
    const hi = Math.min(max, value + TOLERANCE);
    if (side === 'low') return { lo, hi: Math.min(hi, value) };
    if (side === 'high') return { lo: Math.max(lo, value), hi };
    return { lo, hi };
}

function cells(box: Box): number {
    return Math.max(0, box.x1 - box.x0 + 1) * Math.max(0, box.y1 - box.y0 + 1);
}

export function computeRange(map: GhostMap, x: number, y: number, rule: EdgeRule): SearchRange {
    // 判边用原值（越界判 `none`），算框用**夹回值域**的值。这两步不能合成一步：
    // 用原值算 600-50=550 与 min(95, 650)=95 会得到 x0 > x1 的倒框，画出来是
    // 一条反向的线；用夹回值判边，134→160 这种贴右在夹完仍是 134，不受影响。
    const xSide = sideOf(x, map.maxX, rule);
    const ySide = sideOf(y, map.maxY, rule);
    const cx = clamp(x, map.maxX);
    const cy = clamp(y, map.maxY);

    const officialX = axisBox(cx, map.maxX, 'none');
    const officialY = axisBox(cy, map.maxY, 'none');
    const official: Box = {
        x0: officialX.lo,
        x1: officialX.hi,
        y0: officialY.lo,
        y1: officialY.hi,
    };

    const likelyX = axisBox(cx, map.maxX, xSide);
    const likelyY = axisBox(cy, map.maxY, ySide);
    const candidate: Box = {
        x0: likelyX.lo,
        x1: likelyX.hi,
        y0: likelyY.lo,
        y1: likelyY.hi,
    };

    // 与外框完全重合 = 这个轴没给任何线索。画一个与外框重叠的内框只会让人
    // 以为「内框就是这个范围」，比不画更糟。
    const same =
        candidate.x0 === official.x0 &&
        candidate.x1 === official.x1 &&
        candidate.y0 === official.y0 &&
        candidate.y1 === official.y1;
    const likely = same ? null : candidate;

    return {
        official,
        likely,
        x: { value: x, max: map.maxX, side: xSide },
        y: { value: y, max: map.maxY, side: ySide },
        officialCells: cells(official),
        likelyCells: likely ? cells(likely) : cells(official),
    };
}

/** 把一条解析好的任务变成绘图指令。 */
export function planFor(task: ParsedTask, rule: EdgeRule): GhostPlan {
    const { map } = task;
    if (!map) {
        return { mode: 'invalid', map: null, reason: `没有「${task.mapText}」的底图`, task };
    }

    if (task.reveal === 'exact') {
        return { mode: 'exact', map, x: task.x, y: task.y, task };
    }

    if (isNoCoordinate(map, task.x, task.y)) {
        return {
            mode: 'whole',
            map,
            reason: '该场景任务栏坐标恒为 0,0，没有坐标域',
            task,
        };
    }

    if (task.x === 0 && task.y === 0) {
        return {
            mode: 'invalid',
            map,
            reason: '读到 0,0，但该场景不是无坐标域——判为识别失败',
            task,
        };
    }

    return { mode: 'range', map, range: computeRange(map, task.x, task.y, rule), task };
}

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

/**
 * 社区经验的两条线：假坐标 ≤50 时真坐标一定更小，≥150 时一定更大。
 *
 * 这是**绝对阈值，不按地图归一化**。曾经有过一档「按比例 25%/75%」，它其实是把
 * 这两条线除以「假设坐标域宽 200」的结果——坐标域不是 200 时两者就开始分歧。
 * 实测 20 张图里只有 3 张接近 200 宽，而攻略原文给的是绝对值，所以只留绝对口径。
 * 代价是 51~149 的中间带一条线索都不给，但那正是社区原话：「没有规律只能硬找」。
 * 论证与外部出处见 `docs/GHOST-HUNT.md` §6。
 */
const EDGE_LOW = 50;
const EDGE_HIGH = 150;

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
    /**
     * 经验收窄后的范围，即「高概率区域」。三种情况为 `null`：
     * 开关关掉、某轴落在 51~149 的中间带、收窄结果与外框完全重合。
     * 为 `null` 时不画第二层——画一个与外框重叠的框只会让人以为那就是范围。
     */
    likely: Box | null;
    x: AxisInfo;
    y: AxisInfo;
}

/**
 * 这一条任务该怎么画。
 *
 * 三种模式由任务文本自动决定，不需要用户切：
 *
 * | 文本 | 模式 |
 * | --- | --- |
 * | `去X，Y`（开天眼后「附近」被删掉，句尾为空） | `exact` 精确点 |
 * | `去X处`（另一种天眼写法） | `exact` 精确点 |
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
 * 只有两条线，中间带一律 `none`。社区口径的原话是「51-149 没有规律只能硬找」，
 * 所以中间带**不给任何方向**——给它一个方向就是编出一条社区明确否认的规则。
 *
 * 注意这两条线隐含「坐标域大致 0~200」。实测 `maxY < 150` 有 15/20 张、
 * `maxX < 150` 有 7/20 张，这些图上「往大走」数学上不可达，属规则的适用范围
 * 而不是判错，详见 `docs/GHOST-HUNT.md` §6。
 */
function sideOf(value: number, max: number): Side {
    if (max <= 0) return 'none';
    // 越界的不窄。范围本来就已经顶到那条边了，`value ± 50` 再被裁一次只会剩
    // 一根 0 宽的线；而「鬼在比 100 更靠右的地方」对一张 96 格宽的图没有意义。
    if (value < 0 || value > max) return 'none';
    if (value <= EDGE_LOW) return 'low';
    if (value >= EDGE_HIGH) return 'high';
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

/**
 * @param hot 是否计算「高概率区域」。关掉时只给官方 ±50，`likely` 恒为 `null`。
 */
export function computeRange(map: GhostMap, x: number, y: number, hot: boolean): SearchRange {
    // 判边用原值（越界判 `none`），算框用**夹回值域**的值。这两步不能合成一步：
    // 用原值算 600-50=550 与 min(95, 650)=95 会得到 x0 > x1 的倒框，画出来是
    // 一条反向的线；用夹回值判边，134→160 这种贴右在夹完仍是 134，不受影响。
    const xSide = hot ? sideOf(x, map.maxX) : 'none';
    const ySide = hot ? sideOf(y, map.maxY) : 'none';
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
    };
}

/** 把一条解析好的任务变成绘图指令。 */
export function planFor(task: ParsedTask, hot: boolean): GhostPlan {
    const { map } = task;
    if (!map) {
        return { mode: 'invalid', map: null, reason: `没有「${task.mapText}」的底图`, task };
    }

    // 开天眼后游戏把「附近」两个字直接删掉，句子只剩 `去江南野外134,54抓…`，
    // 于是句尾是**空**的（`silent`），不是某个替代字。这两种都得画点。
    if (task.reveal === 'exact' || task.reveal === 'silent') {
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

    return { mode: 'range', map, range: computeRange(map, task.x, task.y, hot), task };
}

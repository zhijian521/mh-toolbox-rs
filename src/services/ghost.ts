import { invoke } from '@tauri-apps/api/core';

/**
 * 捉鬼任务栏的读取通道。
 *
 * 只做「拿数据」，不做任何语义解析——解析在 `ghost-parse.ts`（纯函数，可以喂假数据测），
 * 范围计算在 `ghost-model.ts`。这一层拆开是因为前两者改一行就能重跑，
 * 而这里每改一次都要开着游戏真截一屏。
 *
 * Rust 侧 `ghost.rs` 的结构体都是 `serde(rename_all = "camelCase")`，
 * 所以字段名与这里逐个对应，不需要手写转换。
 */

/** OCR 出来的一行。坐标是 ROI 内的像素偏移（已除回放大倍数）。 */
export interface OcrLine {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * 识别置信度 0~1。
     *
     * PaddleOCR 给真实分数，Windows 自带引擎**永远给 0**（它不返回这个值）。
     * 界面只在「识别原文」里显示：一次读错和一次没框到，看分数就能分开。
     */
    score: number;
}

/** 一个可见的顶层窗口，供用户选择要监听哪个客户端。 */
export interface GhostWindow {
    hwnd: number;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 关注区域。**按客户区像素**，不是归一化比例。
 *
 * 梦幻的 UI 是固定像素：窗口从 640×480 拉到 1025×768，任务面板还是 205px 宽、
 * 左缘还是距右边缘 210px。换成比例就成了 0.742 / 0.79 / 0.838 —— 同一组比例截三种窗口，
 * 必然有两种把「法宝合成」的「法」字切掉，而地名正是最先被切掉的东西。
 *
 * 距离从**右缘**量起：面板贴着右边，窗口再怎么拉宽它都跟着右边走。
 */
export interface Roi {
    /** ROI 右边界距客户区右缘的像素。 */
    rightPx: number;
    /** ROI 宽度。面板实测 205px，多留 10px 防切左边的字。 */
    widthPx: number;
    /** ROI 上边界距客户区顶部的像素。面板标题栏实测距顶 200px。 */
    topPx: number;
    /** ROI 高度。两条捉鬼任务约 250px，400 是留了余量的。 */
    heightPx: number;
    scale: number;
}

export interface ProbeResult {
    hwnd: number;
    title: string;
    windowWidth: number;
    windowHeight: number;
    roiX: number;
    roiY: number;
    roiWidth: number;
    roiHeight: number;
    lines: OcrLine[];
    /** 这一帧是哪个引擎认的：`paddle`（PaddleOCR）或 `windows`（系统自带）。 */
    engine: string;
    /** 目标窗口所在显示器的有效 DPI：96 = 100%，144 = 150%。ROI 按它换算。 */
    dpi: number;
    grabMs: number;
    ocrMs: number;
}

/**
 * 默认 ROI，与 `src-tauri/src/ghost.rs` 的 `Roi::default` 同值。
 *
 * 两处各写一份是有意的：Rust 那份是「前端没传时的兜底」，这份是「界面上的初值」。
 * 真源在 Rust 那份，改动时必须同步——跨语言共享常量只能靠生成脚本，
 * 为四个数引一套工具链不划算。
 *
 * 实测来源（2026-11-01，1295×1038 客户区、125% 缩放）：面板左缘 x=1088（距右缘 207）、
 * 正文首行 y=210、两条任务正文到 y≈460。三张 640/800/1025 的截图交叉验证过，
 * 面板宽度与左缘距右缘在所有尺寸下都一样。
 *
 * `scale` 取 2：换成 PaddleOCR 后实测 2 倍就全对且最快。它与旧引擎的结论（3 倍）
 * 不同——PP-OCRv4 自带检测分支，放大只为「够检测框住一行字」，不靠放大提清晰度；
 * 倍数再往上只是变慢，还会在标题栏上方框出杂字。
 *
 * **这五个数都是 125% 缩放下的标定值，不是任何缩放都能直接用。** 面板的物理像素
 * 跟着系统缩放走：125% 下宽 205，150% 下 246。Rust 侧每帧按显示器 DPI 换算并回传
 * `dpi`，所以这里不要自己做换算，也不要在前端缓存换算结果。
 */
export const DEFAULT_ROI: Roi = {
    rightPx: 6,
    widthPx: 215,
    topPx: 200,
    heightPx: 400,
    scale: 2,
};

/** 列出可见窗口。没起 Tauri（浏览器预览）时返回空数组，让界面走「不可用」分支。 */
export async function listGhostWindows(): Promise<GhostWindow[]> {
    try {
        return await invoke<GhostWindow[]>('ghost_windows');
    } catch {
        return [];
    }
}

/**
 * 读一次任务栏。
 *
 * `hwnd` 传 `null` 表示让 Rust 侧自动挑一个标题像梦幻的窗口。
 * 失败时抛出——界面要显示「读不到」而不是画一张空地图，
 * 空地图在不熟悉的人看来就是「这地方没有鬼」。
 */
export async function probeGhostTask(
    hwnd: number | null,
    roi: Roi = DEFAULT_ROI,
): Promise<ProbeResult> {
    return invoke<ProbeResult>('ghost_probe', { hwnd, roi });
}

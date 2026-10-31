import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 渲染层唯一允许直接碰系统的地方。
 *
 * 旧版把这条边界写成一条测试（`renderer-boundary.test.mjs`）：组件里不许出现
 * `window.mhV2` / `invoke` / `node:`。这里先立住同样的形状——页面只经本文件拿能力，
 * 换实现时只改这一处。
 *
 * 这条不只是注释：`eslint.config.js` 的 `no-restricted-imports` 拦 `@tauri-apps/*`
 * 出现在 `components/`、`views/`、`composables/` 里。原先只拦了
 * `@tauri-apps/api/core`，`TitleBar.vue` 便直接引了 `@tauri-apps/api/window` 管窗口按钮
 * ——规矩写着「只有 services 能碰系统」，检查却只管一个入口。窗口那一族现在也在本文件。
 */

/** 有没有 Tauri 宿主。浏览器里跑（`npm run dev` 但没有窗口）时为 false。 */
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function hasDesktop(): boolean {
    return hasTauri;
}

export interface AppInfo {
    productName: string;
    version: string;
    identifier: string;
    dataDir: string;
    webview: string;
}

/** 浏览器里跑（`npm run dev` 但没起 Tauri）时 invoke 会抛错，降级成 null 而不是炸掉页面。 */
export async function appInfo(): Promise<AppInfo | null> {
    try {
        return await invoke<AppInfo>('app_info');
    } catch {
        return null;
    }
}

/**
 * 用系统默认浏览器打开外部链接。
 *
 * 为什么不用 `<a target="_blank">`：WebView2 里那会走 Tauri 的新窗口请求，
 * 默认被拦下来，点了没反应。所以外链统一交给这条通道。
 * 浏览器里跑（没有 Tauri）时退回 `window.open`，至少预览时能点开。
 */
export async function openExternal(url: string): Promise<boolean> {
    try {
        await invoke('open_external', { url });
        return true;
    } catch {
        if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        return false;
    }
}

/* ---------- 窗口 ----------
 * 自绘标题栏要的三件事：读最大化状态、跟着窗口变化同步、三个按钮。
 * 全部返回**无操作**而不是抛错：浏览器预览里没有窗口，标题栏仍要画得出来。
 *
 * `getCurrentWindow()` 必须写在函数体里而不是模块顶层——它在没有 Tauri 的页面上
 * 一调用就抛，而模块顶层会连预览按钮一起炸掉。
 */
export function windowMaximized(): Promise<boolean> {
    return hasTauri ? getCurrentWindow().isMaximized() : Promise.resolve(false);
}

/** 窗口尺寸变化时回调（最大化/还原）。返回取消订阅的函数，组件卸载时调它。 */
export async function onWindowResized(handler: () => void): Promise<() => void> {
    if (!hasTauri) return () => undefined;
    return getCurrentWindow().onResized(() => handler());
}

export function minimizeWindow(): void {
    if (hasTauri) void getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): void {
    if (hasTauri) void getCurrentWindow().toggleMaximize();
}

export function closeWindow(): void {
    if (hasTauri) void getCurrentWindow().close();
}

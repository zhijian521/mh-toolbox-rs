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

/* ---------- 本地数据（SQLite） ----------
 * 数据存在 Rust 侧（`src-tauri/src/store.rs`），这里只做搬运。
 *
 * **为什么用泛型而不是引 `views/prices` 的 `PriceItem`**：`services/` 是系统边界，
 * 反过来依赖某个页面的数据结构，那个页面一改字段这里就得跟着改，边界就白划了。
 * 类型由调用方在那一侧断言——真正把关的是 `normalizePriceItem`。
 *
 * **浏览器里一律返回 null / false**，不是抛错：探针（`tools/probe/cdp.mjs`）和
 * `npm run dev` 都没有 Tauri 宿主，调用方据此退回 `localStorage`。
 * 两条路径的数据是**各自独立**的，这正合适——探针塞的种子数据不该污染真档案。
 */
export async function pricesLoad<T>(): Promise<T[] | null> {
    if (!hasTauri) return null;
    try {
        return await invoke<T[]>('prices_load');
    } catch (error) {
        console.error('读取物价表失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——调用方要能看见，不能静默吞掉。 */
export async function pricesSave<T>(items: T[]): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        await invoke('prices_save', { items });
        return true;
    } catch (error) {
        console.error('写入物价表失败', error);
        return false;
    }
}

/** 老数据（`localStorage` 那一版）搬过来没有。 */
export async function pricesLegacyImported(): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        return await invoke<boolean>('prices_legacy_imported');
    } catch {
        return false;
    }
}

/** 打上「已搬完」的标记。失败不致命：下次启动会再搬一遍，而搬的是同一份数据。 */
export async function pricesMarkLegacyImported(): Promise<void> {
    if (!hasTauri) return;
    try {
        await invoke('prices_mark_legacy_imported');
    } catch (error) {
        console.error('写迁移标记失败', error);
    }
}

/* ---------- 角色名册（同一套数据层，JSON 列存整条） ----------
 * 四个函数与物价那组一一对应，理由见上面那一段。返回 `null` / `false` 一律是
 * 「没有 Tauri 宿主」或「调用失败」，调用方据此退回 localStorage，不在这里抛错。
 */
export async function charactersLoad<T>(): Promise<T[] | null> {
    if (!hasTauri) return null;
    try {
        return await invoke<T[]>('characters_load');
    } catch (error) {
        console.error('读取角色名册失败', error);
        return null;
    }
}

export async function charactersSave<T>(items: T[]): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        await invoke('characters_save', { items });
        return true;
    } catch (error) {
        console.error('写入角色名册失败', error);
        return false;
    }
}

export async function charactersLegacyImported(): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        return await invoke<boolean>('characters_legacy_imported');
    } catch {
        return false;
    }
}

export async function charactersMarkLegacyImported(): Promise<void> {
    if (!hasTauri) return;
    try {
        await invoke('characters_mark_legacy_imported');
    } catch (error) {
        console.error('写名册迁移标记失败', error);
    }
}

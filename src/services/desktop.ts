import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands, type AppInfo } from './bindings';

/**
 * 应用外壳能力：版本、外链与窗口。存储、数据文件与 OCR 分别在相邻服务中。
 *
 * 旧版把这条边界写成一条测试（`renderer-boundary.test.mjs`）：组件里不许出现
 * `window.mhV2` / `invoke` / `node:`。这里先立住同样的形状——页面只经 services 拿能力，
 * 换实现时只改这一处。
 *
 * 这条不只是注释：`eslint.config.js` 的 `no-restricted-imports` 拦 `@tauri-apps/*`
 * 出现在 `components/`、`views/`、`composables/` 里。原先只拦了
 * `@tauri-apps/api/core`，`TitleBar.vue` 便直接引了 `@tauri-apps/api/window` 管窗口按钮
 * ——规矩写着「只有 services 能碰系统」，检查却只管一个入口。窗口那一族现在也在本文件。
 *
 * ---- 命令名与参数类型从哪来 ----
 *
 * `bindings.ts` 是 `tauri-specta` 从 Rust 命令签名**生成**的，本文件只调不管。
 * 第 121 批之前这里逐个手写 `invoke<T>('prices_load')`，名字对不上只有运行时才炸；
 * 现在改名会让 `npm run typecheck` 直接红，而生成物每次 debug 启动都会重写一遍。
 * **不要手改 `bindings.ts`**——它头顶那行就是这句。
 */

/** 有没有 Tauri 宿主。浏览器里跑（`npm run dev` 但没有窗口）时为 false。 */
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function hasDesktop(): boolean {
    return hasTauri;
}

/* `AppInfo` 的定义在生成物里（字段与 `lib.rs` 的 struct 一一对应），这里转出去，
 * 免得调用方两个地方各引一次。 */
export type { AppInfo };

/** 浏览器里跑（`npm run dev` 但没起 Tauri）时 invoke 会抛错，降级成 null 而不是炸掉页面。 */
export async function appInfo(): Promise<AppInfo | null> {
    try {
        return await commands.appInfo();
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
        await commands.openExternal(url);
        return true;
    } catch {
        if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        return false;
    }
}

/* ---------- 系统通知 ----------
 *
 * 闹钟是唯一的使用者，但它不是「闹钟的能力」而是「应用能否对系统说一句话」，
 * 所以住在这一份里，与窗口那几个同级。
 *
 * 与窗口那几条同一个口径：浏览器预览里没有宿主，**静默返回 false**，不抛错、不降级成
 * `new Notification()`。后者在 WebView2 里既没有权限入口、也没有托盘归属，试出来的效果
 * 是一条来自 `msedge` 的通知，比没有更让人困惑。
 */
export async function notifySystem(title: string, body: string): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        await commands.notifyAlarm(title, body);
        return true;
    } catch {
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

/** 拦截标题栏与系统关窗，确认写队列完成后才放行第二次 close。 */
export async function guardWindowClose(beforeClose: () => Promise<boolean>): Promise<() => void> {
    if (!hasTauri) return () => undefined;
    const window = getCurrentWindow();
    let approved = false;
    let checking = false;
    return window.onCloseRequested(async (event) => {
        if (approved) return;
        event.preventDefault();
        if (checking) return;
        checking = true;
        try {
            if (await beforeClose()) {
                approved = true;
                await window.close();
            }
        } finally {
            checking = false;
        }
    });
}

export function closeWindow(): void {
    if (hasTauri) void getCurrentWindow().close();
}

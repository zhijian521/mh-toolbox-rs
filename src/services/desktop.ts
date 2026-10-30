import { invoke } from '@tauri-apps/api/core';

/**
 * 渲染层唯一允许直接碰系统的地方。
 *
 * 旧版把这条边界写成一条测试（`renderer-boundary.test.mjs`）：组件里不许出现
 * `window.mhV2` / `invoke` / `node:`。这里先立住同样的形状——页面只经本文件拿能力，
 * 换实现时只改这一处。
 */
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

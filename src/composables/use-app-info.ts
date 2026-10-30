import { ref, type Ref } from 'vue';
import { appInfo, type AppInfo } from '../services/desktop';
import { version as pkgVersion } from '../../package.json';

/**
 * 应用信息（产品名 / 版本 / 标识 / 数据目录 / WebView 版本）。
 *
 * 三处要用同一份：标题栏、左栏底部、设置的「关于」。做成模块级单例的理由和 `use-theme` 一样——
 * IPC 是异步的，各组件自己调用就是三次跨进程序列化，三份 ref 还各自后到先到。
 * 这里只发一次，谁先挂载谁触发，后来者读同一份。
 *
 * 浏览器里跑（没有 Tauri）时 `appInfo()` 返回 null，`version` 退回 `package.json` 的值——
 * 预览时的版本号不会因为手写而漂。真正的一致性由 `scripts/check-version.mjs` 守：
 * `package.json` / `tauri.conf.json` / `Cargo.toml` 三处必须相同。
 */
const info = ref<AppInfo | null>(null);
const version = ref<string>(pkgVersion);
let started = false;

export function useAppInfo(): { info: Ref<AppInfo | null>; version: Ref<string> } {
    if (!started) {
        started = true;
        void appInfo().then((value) => {
            info.value = value;
            if (value) version.value = value.version;
        });
    }
    return { info, version };
}

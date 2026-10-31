import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json';

/*
 * Tauri 起的是「已启动的 dev server」，所以端口必须固定：5173 被别人占走时
 * Vite 会自动换端口，而 tauri.conf.json 里写死的 devUrl 不会跟着变，窗口会白屏。
 */
export default defineConfig({
    plugins: [vue()],
    clearScreen: false,
    /* 版本号在这里注入成常量，客户端不再 `import '../../package.json'`——
     * 那等于让 `src/` 反向依赖仓库根的清单文件。真源仍是 `package.json`，
     * 与 `tauri.conf.json` / `Cargo.toml` 的一致性由 `scripts/check-version.mjs` 守。 */
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        // Tauri 用系统 WebView2，不需要为老浏览器降级。
        target: 'chrome110',
        sourcemap: false,
    },
});

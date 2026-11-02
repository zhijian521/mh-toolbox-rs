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
        /* 必须显式钉 IPv4。不写 host 时 Vite 用 `localhost`，而 Node 17+ 按系统
         * getaddrinfo 的顺序解析，本机返回 `::1` 优先 → 实际只监听 `[::1]:5173`
         * （`netstat` 可见），`127.0.0.1:5173` 没人应答。
         * WebView2 走 IPv4，于是窗口里是 `net::ERR_CONNECTION_REFUSED` + 白屏，
         * 而用浏览器打开却是好的——两边解析顺序不同，这类问题只能靠钉地址消掉。
         * `devUrl` 同步写成 `http://127.0.0.1:5173`，不再依赖任何解析结果。 */
        host: '127.0.0.1',
        /* 监视器必须只盯「源码」，否则会去 watch 构建产物。
         *
         * 2026-11-02 实际崩过一次：`.runtime/target-lab` 是 OCR 实验用的独立 cargo
         * target 目录（1.4GB、含 .o 中间产物），Vite 默认只忽略 node_modules 与 .git，
         * 于是它去 watch 一个正被 rustc 锁住的 `.o`，抛 EBUSY 直接把 dev server 弄死，
         * 外壳只报一句 `The "beforeDevCommand" terminated with a non-zero status code`。
         *
         * 注意这是**整体覆盖**默认忽略列表，不是追加——`node_modules` 与 `.git` 必须
         * 自己写回来，否则会把依赖也一起 watch。
         */
        watch: {
            ignored: [
                '**/.git/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/.runtime/**',
                '**/src-tauri/target/**',
                '**/src-tauri/gen/**',
                '**/.workbuddy/**',
                '**/map/**',
            ],
        },
    },
    build: {
        // Tauri 用系统 WebView2，不需要为老浏览器降级。
        target: 'chrome110',
        sourcemap: false,
    },
});

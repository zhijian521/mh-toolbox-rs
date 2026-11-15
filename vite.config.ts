import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json';

// Tauri 的 devUrl 固定，端口被占时必须失败，不能自动换端口。
export default defineConfig({
    plugins: [vue()],
    clearScreen: false,
    // 版本真源为 package.json；客户端只读取编译常量。
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
        port: 5173,
        strictPort: true,
        // 与 devUrl 同用 IPv4，避免 localhost 解析到 ::1 导致 WebView2 白屏。
        host: '127.0.0.1',
        // 排除被编译器和编辑器锁定的产物；列表覆盖默认值，需保留 .git 与 node_modules。
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
                // 编辑器临时文件不进入监视器，避免 EBUSY 中断开发服务。
                '**/.*.tmpdir/**',
                '**/*.tmpdir/**',
            ],
        },
    },
    build: {
        // Tauri 用系统 WebView2，不需要为老浏览器降级。
        target: 'chrome110',
        sourcemap: false,
    },
});

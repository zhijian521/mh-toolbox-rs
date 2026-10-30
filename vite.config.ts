import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/*
 * Tauri 起的是「已启动的 dev server」，所以端口必须固定：5173 被别人占走时
 * Vite 会自动换端口，而 tauri.conf.json 里写死的 devUrl 不会跟着变，窗口会白屏。
 */
export default defineConfig({
    plugins: [vue()],
    clearScreen: false,
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

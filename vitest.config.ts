import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/** 复用构建插件与版本注入；排除本机草稿，保证干净检出与本机测试范围一致。 */
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            setupFiles: ['src/services/game-data.fixture.ts'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/.runtime/**'],
        },
    }),
);

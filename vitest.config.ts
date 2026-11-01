import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * 测试配置：在 `vite.config.ts` 之上只加一件事——**把 `.runtime/` 排除掉**。
 *
 * 为什么需要它：vitest 默认把整个项目当测试目录，而 `.runtime/` 是草稿区
 * （被 `.gitignore` 与 eslint 双双忽略）。那里留着一份早期草稿
 * `draft/character-model.test.ts`（12 条），于是**本机跑 73 条、干净检出跑 61 条**。
 * 两边数字不一致，红了也不知道该不该当真——多出来的那 12 条根本不在仓库里。
 *
 * 用 `mergeConfig` 而不是在这里重写一份：`vite.config.ts` 里的 vue 插件、
 * `__APP_VERSION__` 注入都是测试要复用的，抄第二份必然漂。
 *
 * 注意这一条**特意不写进 `vite.config.ts`**：那是构建配置，不该为了测试去 import
 * `vitest/config`。
 */
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            exclude: ['**/node_modules/**', '**/dist/**', '**/.runtime/**'],
        },
    }),
);

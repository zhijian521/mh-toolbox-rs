/**
 * 构建期常量。
 *
 * 版本号由 `vite.config.ts` 的 `define` 注入，值来自根 `package.json` 的 `version`。
 *
 * 为什么不在 `src/` 里直接 `import '../../package.json'`：那是让 `src/` 反向依赖
 * 仓库根的清单文件——打包器今天会把整份 `package.json` 折进产物（实测 Vite 会
 * tree-shake 干净，但那是在赌插件的折叠行为，不是在赌自己的代码）。
 * 常量由构建配置写死，来源只有一个地方可查。
 *
 * 真要改版本号：改 `package.json`，三处清单的一致性由 `scripts/check-version.mjs` 守。
 */
declare const __APP_VERSION__: string;

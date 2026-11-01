import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * 静态检查只拦「会出事」的问题，不拦风格——风格一律交给 Prettier。
 * 两套都管格式化会互相打架，最后总要关掉一边。
 *
 * 分组按运行环境切，不按「哪个插件推荐」切：
 * - src：浏览器 + ESM。Vue 组件与 TS 混在一起，共用一份规则。
 * - 根配置文件（vite.config.ts 等）：Node 环境，能读 process。
 * - scripts：Node 的 .mjs，允许控制台输出（它们是命令行工具，输出就是产物）。
 */
export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'src-tauri/**',
            // 生成物与设计产物：不是手写代码，检查它们只会产生噪音。
            'design/**',
            'src-tauri/icons/**',
            '.runtime/**',
            '.workbuddy/**',
        ],
    },

    js.configs.recommended,

    // ---------- 源码：TS + Vue ----------
    ...tseslint.configs.recommended,
    // 只用 `essential`，不用 `recommended`。后者带一整套**格式化**规则
    // （html-indent 期望 2 空格、max-attributes-per-line、singleline-content-newline…），
    // 与本仓的 4 空格 + Prettier 直接冲突，实测一次报 619 条。
    // `essential` 只保留「会真的出错」的那一层：解析错误、重复 key、无效指令、v-for 缺 key。
    ...pluginVue.configs['flat/essential'],
    {
        files: ['src/**/*.{ts,vue}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser },
            parserOptions: {
                // .vue 里 `<script lang="ts">` 由 vue-eslint-parser 交给 TS 解析器。
                parser: tseslint.parser,
                extraFileExtensions: ['.vue'],
            },
        },
        rules: {
            // 未使用变量：下划线前缀表示「签名占位，故意不用」。
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // 模板里禁用 v-html：这套界面全部由模板渲染，一旦允许拼 HTML，
            // 就回到「字符串拼界面」的老路，也让 XSS 有了入口。
            'vue/no-v-html': 'error',
            /**
             * 模板里用了但没 import 的组件，必须报错。
             *
             * 这条是被一次真实事故逼出来的：改 `SlotButton` 时顺手删了 `AppRail` 的
             * `AppIcon` import，Vue 把 `<AppIcon>` 静默渲染成未知标签 `<appicon>`，
             * 侧栏八个导航图标整片消失——不报错、不警告，`check` 全绿，只有看截图才发现。
             *
             * 开启 `strictTemplates` 后 vue-tsc 也能报同一条（TS2339），这条规则的价值
             * 在于更快、且不依赖类型上下文，编辑器里敲下标签那一刻就红。
             * 注意两条检查都需要真的把 import 删掉才会触发——用脚本改 CRLF 文件时
             * 按 `\n` 匹配会静默删不掉，别被「删了却没报错」骗过去。
             *
             * `RouterView` / `RouterLink` 由 `app.use(router)` 全局注册，本地没有 import，
             * 属于合法用法，列进豁免。
             */
            'vue/no-undef-components': ['error', { ignorePatterns: ['RouterView', 'RouterLink'] }],
            // 组件必须显式声明 emits，否则父级监听的事件在类型上是 `any`。
            'vue/require-explicit-emits': 'error',
            // 模板块里组件名统一 PascalCase，与 import 名一致，便于全局搜索。
            'vue/component-name-in-template-casing': ['error', 'PascalCase'],
            // 属性顺序：语义（is/v-for/v-if）→ 绑定 → 事件 → 其余。
            'vue/attributes-order': 'warn',
            // 宏（defineProps / defineEmits / defineOptions）按固定顺序，读起来一致。
            'vue/define-macros-order': [
                'warn',
                { order: ['defineOptions', 'defineProps', 'defineEmits'] },
            ],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },

    // 渲染层不许直接拿系统能力：只有 src/services/ 能 invoke。
    // 这条是 `services/desktop.ts` 头注释里那句约定的可执行版本——
    // 光写在注释里，第一次赶进度就会有人绕过去。
    //
    // 用 `patterns` 而不是 `paths`：`paths` 只匹配**一模一样**的模块名，原先只列了
    // `@tauri-apps/api/core`，于是 `TitleBar.vue` 直接 `import ... from
    // '@tauri-apps/api/window'` 照样全绿——规矩写着「只有 services 能碰系统」，
    // 检查却只管一个入口。现在整族都拦：`@tauri-apps/api`、它的任意子路径、以及以后的
    // `@tauri-apps/plugin-*`。新增系统能力时先把封装加进 `services/desktop.ts`。
    {
        files: [
            'src/components/**/*.{ts,vue}',
            'src/views/**/*.{ts,vue}',
            'src/composables/**/*.ts',
        ],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@tauri-apps/api', '@tauri-apps/api/*', '@tauri-apps/*'],
                            message: '系统能力统一走 src/services/，不要在组件里直接调 Tauri。',
                        },
                    ],
                },
            ],
        },
    },

    // ---------- 根配置与脚本：Node 环境 ----------
    {
        files: ['*.config.{ts,js,mjs}', 'scripts/**/*.{js,mjs}', 'tools/**/*.{js,mjs}'],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            // 命令行工具的输出就是它的产物。
            'no-console': 'off',
        },
    },

    // ---------- 探针夹具：跑在**浏览器**里 ----------
    // `tools/probe/fixtures/*` 不是命令行脚本，它们由 CDP 的
    // `Page.addScriptToEvaluateOnNewDocument` 注入到页面中执行，
    // 用的是 `window` / `location` / `document` 这套浏览器全局。
    // 上一块给整个 `tools/**` 装了 Node 全局，在这里是错的：`window` 会被报 no-undef。
    // 按运行环境分组（而不是按目录），这条覆盖必须放在 Node 那块**之后**才会生效。
    {
        files: ['tools/probe/fixtures/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser },
        },
    },
);

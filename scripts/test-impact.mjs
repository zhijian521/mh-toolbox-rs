import { TEST_SCOPES } from './test-scopes.mjs';

/** 推荐直接受影响领域与已知联动；未知路径单独列出，不静默回退全量。 */
const RULES = [
    {
        prefix: 'src/views/warehouse/',
        scopes: ['accounts', 'ocr', 'core'],
        smoke: ['账号', '数据'],
    },
    {
        prefix: 'src/views/characters/',
        except: ['src/views/characters/ocr/'],
        scopes: ['characters'],
        smoke: ['角色'],
    },
    {
        prefix: 'src/views/characters/ocr/',
        scopes: ['characters', 'ocr'],
        smoke: ['角色/截图', '角色/装备', '角色/召唤兽'],
    },
    { prefix: 'src/views/CharactersView.vue', scopes: ['characters'], smoke: ['角色'] },
    { prefix: 'src/views/income/', scopes: ['income', 'accounts', 'overview'], smoke: ['收益'] },
    {
        prefix: 'src/views/accounts/',
        scopes: ['accounts', 'income', 'overview'],
        smoke: ['账号', '收益'],
    },
    { prefix: 'src/views/prices/', scopes: ['prices'], smoke: ['物价'] },
    {
        prefix: 'src/views/goals/',
        scopes: ['goals', 'characters', 'overview'],
        smoke: ['目标', '角色/成长历史'],
    },
    { prefix: 'src/views/overview/', scopes: ['overview'], smoke: ['导航'] },
    { prefix: 'src/views/SettingsView.vue', scopes: ['settings'], smoke: ['设置'] },
    { prefix: 'src/views/settings/', scopes: ['settings'], smoke: ['设置'] },
    { prefix: 'src/views/ToolsView.vue', scopes: ['tools'], smoke: ['工具'] },
    { prefix: 'src/views/tools/', scopes: ['tools'], smoke: ['工具'] },
    { prefix: 'src/views/dev/', scopes: ['core', 'ui'] },
    { prefix: 'src/components/', scopes: ['ui'], smoke: ['导航'] },
    { prefix: 'src/components/ghost/', scopes: ['tools'], smoke: ['工具'] },
    { prefix: 'src/composables/', scopes: ['ui'] },
    {
        prefix: 'src/styles/',
        scopes: ['ui'],
        smoke: ['导航'],
        note: '公共样式需按实际使用页面补充视觉验收。',
    },
    { prefix: 'src/import/', scopes: ['settings', 'core'], smoke: ['设置', '数据'] },
    { prefix: 'src/services/', scopes: ['core'] },
    {
        prefix: 'src/services/format',
        scopes: ['income', 'accounts', 'overview', 'ui'],
        smoke: ['收益', '账号', '导航'],
    },
    { prefix: 'src/services/clock', scopes: ['income', 'tools'], smoke: ['收益', '工具'] },
    { prefix: 'src/services/home-shortcuts', scopes: ['overview'], smoke: ['导航'] },
    { prefix: 'src/services/ghost-', scopes: ['tools'], smoke: ['工具'] },
    { prefix: 'src/services/game-', scopes: ['assets', 'characters', 'ocr', 'tools'] },
    { prefix: 'src/services/pet-assets', scopes: ['assets', 'characters', 'ocr'] },
    {
        prefix: 'src/services/load-data',
        scopes: ['core', 'characters', 'income', 'accounts', 'prices', 'goals'],
        smoke: ['数据'],
    },
    { prefix: 'src/services/persist', scopes: ['core'], smoke: ['数据'] },
    { prefix: 'src/services/storage-sync', scopes: ['core'], smoke: ['数据'] },
    { prefix: 'src/services/local-data', scopes: ['core', 'settings'], smoke: ['数据'] },
    {
        prefix: 'src/services/bindings.ts',
        scopes: ['core'],
        note: 'IPC 变更需同步两张 Rust 命令表与生成绑定，并补对应后端测试。',
    },
    { prefix: 'src/services/updates', scopes: ['release', 'settings'], smoke: ['设置'] },
    { prefix: 'src/composables/use-theme', scopes: ['settings'], smoke: ['设置', '导航'] },
    { prefix: 'src/composables/use-font-', scopes: ['settings'], smoke: ['设置', '导航'] },
    {
        prefix: 'src/composables/shared-clock',
        scopes: ['income', 'accounts', 'goals', 'overview', 'tools'],
    },
    {
        prefix: 'src/composables/use-today',
        scopes: ['income', 'accounts', 'goals', 'overview', 'tools'],
    },
    {
        prefix: 'src/composables/use-minute-now',
        scopes: ['income', 'accounts', 'overview', 'tools'],
    },
    { prefix: 'src/composables/use-ghost-', scopes: ['tools'], smoke: ['工具'] },
    { prefix: 'src/main', scopes: ['core'], smoke: ['导航'] },
    { prefix: 'src/startup', scopes: ['core', 'settings'], smoke: ['导航', '数据'] },
    { prefix: 'src/App.vue', scopes: ['core', 'ui'], smoke: ['导航'] },
    { prefix: 'src/navigation.ts', scopes: ['core', 'overview'], smoke: ['导航'] },
    { prefix: 'src/router.ts', scopes: ['core', 'overview'], smoke: ['导航'] },
    { prefix: 'src/route-actions', scopes: ['core', 'overview'], smoke: ['导航'] },
    { prefix: 'src/tools.ts', scopes: ['tools', 'overview'], smoke: ['工具', '导航'] },
    { prefix: 'public/game/', scopes: ['assets', 'characters', 'ocr', 'tools'] },
    {
        prefix: 'assets/fonts/',
        scopes: ['ui', 'assets'],
        note: '字体资源需补充实际加载与字号溢出验收。',
    },
    { prefix: 'tools/game-icons/', scopes: ['assets'] },
    { prefix: 'tools/e2e/sections/income/', scopes: ['tooling'], smoke: ['收益'] },
    { prefix: 'tools/e2e/sections/04-income.mjs', scopes: ['tooling'], smoke: ['收益'] },
    {
        prefix: 'tools/e2e/',
        scopes: ['tooling'],
        note: '烟测脚本或夹具有改动，按所改场景选择 --only，运行前遵守快照与恢复要求。',
    },
    { prefix: 'tools/probe/', scopes: ['ui'], note: '探针改动需按目标页面选择视觉验收。' },
    { prefix: 'scripts/', scopes: ['tooling'] },
    { prefix: 'scripts/windows-runtime', scopes: ['release'] },
    {
        prefix: 'scripts/bundle-windows',
        scopes: ['release'],
        note: '打包改动需另做产物与安装依赖验收。',
    },
];

const CONFIG_FILES = new Set([
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'eslint.config.js',
    'start.bat',
]);
const DOCUMENT = /^(?:docs\/|\.github\/.*\.md$)|\.md$/i;

/** Git -z 状态的重命名记录含两个路径；旧、新位置都参与影响分析。 */
export function statusPaths(output) {
    const records = output.split('\0');
    const paths = [];
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        if (!record) continue;
        paths.push(record.slice(3));
        if (/[RC]/.test(record.slice(0, 2))) paths.push(records[++index]);
    }
    return [...new Set(paths)];
}

export function recommendTests(paths) {
    const scopes = new Set();
    const smoke = new Set();
    const rust = new Set();
    const notes = new Set();
    const unknown = [];
    const files = [...new Set(paths.map((path) => path.replaceAll('\\', '/')))];
    for (const file of files) {
        if (DOCUMENT.test(file)) continue;
        if (file.startsWith('src-tauri/')) {
            const module = file.match(/^src-tauri\/src\/([^/.]+)(?:\.rs|\/)/)?.[1];
            rust.add(module && !['lib', 'main'].includes(module) ? `${module}::` : '');
            scopes.add('core');
            if (/Cargo\.(?:toml|lock)$|tauri\.conf|capabilities\//.test(file)) {
                scopes.add('release');
                notes.add('后端配置或依赖改动需另做对应系统能力与打包验收。');
            }
            continue;
        }
        if (CONFIG_FILES.has(file)) {
            notes.add('工程配置或依赖影响无法仅按路径确定，请按实际变更追加类型、构建或相关测试。');
            continue;
        }
        const matches = RULES.filter(
            (rule) =>
                file.startsWith(rule.prefix) &&
                !rule.except?.some((prefix) => file.startsWith(prefix)),
        );
        if (!matches.length) unknown.push(file);
        for (const rule of matches) {
            rule.scopes?.forEach((scope) => scopes.add(scope));
            rule.smoke?.forEach((page) => smoke.add(page));
            if (rule.note) notes.add(rule.note);
        }
    }
    // 父分区已包含所有子流程，不重复推荐同一轮烟测。
    const pages = [...smoke].filter(
        (page) => ![...smoke].some((parent) => page.startsWith(parent + '/')),
    );
    return {
        files,
        scopes: Object.keys(TEST_SCOPES).filter((scope) => scopes.has(scope)),
        smoke: pages,
        rust: rust.has('') ? [''] : [...rust].sort(),
        notes: [...notes],
        unknown,
    };
}

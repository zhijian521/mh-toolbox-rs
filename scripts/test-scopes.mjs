import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 测试留在业务模块旁；这里只维护选择范围及直接联动，不复制测试内容。 */
const STORE_CONTRACT_TESTS = ['src/services/load-data.test.', 'src/services/store-readonly.test.'];

export const TEST_SCOPES = {
    characters: [
        ...STORE_CONTRACT_TESTS,
        'src/views/characters/',
        'src/views/warehouse/',
        'src/services/character-assets-local.test.',
        'src/views/goals/',
        'src/views/overview/',
    ],
    ocr: [
        'src/services/ocr-preference.test.',
        'src/views/characters/ocr/',
        'src/views/warehouse/warehouse.test.',
        'src/views/characters/gear.test.',
        'src/views/characters/gear-properties.test.',
        'src/views/characters/pets.test.',
        'src/views/characters/skills.test.',
        'src/views/characters/schools.test.',
        'src/services/game-rules.test.',
    ],
    income: [
        ...STORE_CONTRACT_TESTS,
        'src/views/income/',
        'src/views/prices/prices-store.test.',
        'src/views/accounts/daily-sync.test.',
        'src/views/accounts/accounts-auto.test.',
        'src/views/overview/',
        'src/services/format.test.',
    ],
    accounts: [
        ...STORE_CONTRACT_TESTS,
        'src/views/accounts/',
        'src/views/warehouse/',
        'src/views/income/income.test.',
        'src/services/character-assets-local.test.',
        'src/views/income/online.test.',
        'src/views/income/online-time.test.',
        'src/views/overview/',
        'src/services/format.test.',
    ],
    prices: [
        ...STORE_CONTRACT_TESTS,
        'src/views/prices/',
        'src/views/income/price-import.test.',
        'src/views/income/income-store.test.',
    ],
    goals: [
        ...STORE_CONTRACT_TESTS,
        'src/views/goals/',
        'src/views/characters/roster.test.',
        'src/views/characters/growth-history.test.',
        'src/views/overview/overview.test.',
    ],
    overview: ['src/views/overview/', 'src/services/home-shortcuts.test.'],
    tools: [
        'src/views/tools/',
        'src/services/level-costs.test.',
        'src/services/fengyao.test.',
        'src/services/ghost-',
        'src/components/ghost/',
        'src/composables/use-ghost-watch.test.',
    ],
    ui: ['src/components/', 'src/composables/'],
    settings: [
        'src/services/ocr-preference.test.',
        'src/views/settings/',
        'src/composables/preference-write.test.',
        'src/composables/use-theme.test.',
        'src/composables/use-font-',
        'src/services/local-data.test.',
        'src/services/storage-sync.test.',
        'src/services/updates.test.',
        'src/services/legacy-startup.test.',
        'src/import/',
    ],
    core: [
        'src/services/',
        'src/import/',
        'src/main.test.',
        'src/liquid-main.test.',
        'src/startup.test.',
        'src/views/dev/',
    ],
    assets: [
        'src/services/game-',
        'src/services/pet-assets',
        'src/views/characters/gear-icons.test.',
        'tools/game-icons/',
    ],
    release: ['scripts/windows-runtime.test.', 'src/services/updates.test.'],
    tooling: [
        'scripts/test-scopes.test.',
        'scripts/test-impact.test.',
        'tools/e2e/selection.test.',
    ],
};

export function collectTests(root) {
    const files = [];
    function visit(directory) {
        for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
            const file = `${directory}/${entry.name}`;
            if (entry.isDirectory()) visit(file);
            else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(file);
        }
    }
    for (const directory of ['src', 'scripts', 'tools']) visit(directory);
    return files.sort();
}

export function selectTests(scopes, files) {
    if (!scopes.length) throw new Error('请指定测试分区，使用 --list 查看。');
    for (const scope of scopes) {
        if (!Object.hasOwn(TEST_SCOPES, scope)) throw new Error(`未知测试分区：${scope}`);
    }
    const selected = new Set();
    for (const scope of scopes) {
        const matches = files.filter((file) =>
            TEST_SCOPES[scope].some((prefix) => file.startsWith(prefix)),
        );
        if (!matches.length) throw new Error(`测试分区没有匹配文件：${scope}`);
        for (const file of matches) selected.add(file);
    }
    return [...selected].sort();
}

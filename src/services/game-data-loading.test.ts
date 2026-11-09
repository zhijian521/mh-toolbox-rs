import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_DATA_FILES } from './game-data.fixture';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const files: Record<string, unknown> = {
    'schools.json': GAME_DATA_FILES.schools,
    'skills.json': GAME_DATA_FILES.skills,
    'school-icons.json': GAME_DATA_FILES.schoolIcons,
    'quick-items.json': GAME_DATA_FILES.quickItems,
    'character-rules.json': GAME_DATA_FILES.characterRules,
    'activities.json': GAME_DATA_FILES.activities,
    'gameplay.json': GAME_DATA_FILES.gameplay,
};
const response = (url: string) =>
    Promise.resolve(new Response(JSON.stringify(files[url.split('/').at(-1)!])));

describe('游戏数据装配边界', () => {
    it('并发加载共享一次请求，角色规则在加载完成时已可同步读取', async () => {
        vi.resetModules();
        const { loadGameData } = await import('./game-data');
        const fetcher = vi.fn(response);
        vi.stubGlobal('fetch', fetcher);
        const first = loadGameData();
        expect(loadGameData()).toBe(first);
        await first;
        expect(fetcher).toHaveBeenCalledTimes(Object.keys(files).length);
        const { emptyCharacter } = await import('../views/characters/roster');
        const character = emptyCharacter();
        expect(character.gear).toHaveLength(12);
        expect(character.attrGroups).toHaveLength(GAME_DATA_FILES.characterRules.attributes.length);
    });

    it('任何一份资源校验失败都不安装半套数据', async () => {
        vi.resetModules();
        const { installGameData, gameData } = await import('./game-data');
        const rules = await import('./game-rules');
        installGameData(GAME_DATA_FILES);
        const before = gameData();
        const attributes = rules.ATTR_GROUPS;
        const changed = structuredClone(GAME_DATA_FILES);
        changed.characterRules.attributes[0].title = '新模板';
        expect(() => installGameData({ ...changed, activities: [null] })).toThrow(/activities/);
        expect(gameData()).toBe(before);
        expect(rules.ATTR_GROUPS).toBe(attributes);
        expect(() => installGameData({ ...changed, gameplay: null })).toThrow(/gameplay/);
        expect(rules.ATTR_GROUPS).toBe(attributes);
    });

    it('首次失败降级，随后可重试；失败重试仍保留上一份有效缓存', async () => {
        vi.resetModules();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { loadGameData, installGameData } = await import('./game-data');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        expect((await loadGameData()).schools.schools).toEqual([]);
        const { normalizePriceItem } = await import('../views/prices/prices');
        const item = normalizePriceItem({
            id: 'kept',
            name: '物品',
            category: '兽决内丹',
            sub: '高级兽决',
            points: [],
        });
        expect(item?.category).toBe('兽决内丹');
        expect(item?.sub).toBe('高级兽决');
        const before = installGameData(GAME_DATA_FILES);
        expect(await loadGameData()).toBe(before);
        vi.stubGlobal('fetch', vi.fn(response));
        expect((await loadGameData()).schools.schools.length).toBeGreaterThan(0);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAssets, filterAssets, type AssetSources } from './game-assets';

/** 一份最小可用的原材料，各用例只改自己关心的那几项。 */
function make(patch: Partial<AssetSources> = {}): AssetSources {
    return {
        equipment: [
            {
                name: '水晶帽',
                group: 'toukui',
                family: 'gear',
                img: 'gear-toukui-01.webp',
                level: 60,
            },
            {
                name: '游龙剑',
                group: '剑',
                family: 'weapon',
                img: 'weapon-jian-060.webp',
                level: 60,
            },
            {
                name: '枫华戒',
                group: 'jiezhi',
                family: 'lingshi',
                img: 'ling-jiezhi-060.webp',
                level: 60,
            },
        ],
        iconGroups: {
            skill: [{ id: 'skill-01', name: '强身术' }],
            story: [{ id: 'story-01', name: '调息' }],
            active: [{ id: 'active-01', name: '气疗术' }],
        },
        petSkills: {
            categories: [
                { id: 'basic', name: '低级技能', iconDir: 'pet-basic' },
                { id: 'super', name: '超级技能', iconDir: 'pet-super' },
            ],
            icons: [
                { id: '301', name: '夜战', img: 'pet-basic-301.png', categoryId: 'basic' },
                /* 官网 404 的那两条：清单里 `img` 是 null，不该摆成一个空格子。 */
                { id: '999', name: '触类旁通', img: null, categoryId: 'super' },
            ],
        },
        petPortraits: {
            icons: [
                {
                    id: 'pet-2001',
                    name: '兔子怪',
                    species: '兔子怪',
                    img: 'pet-2001.webp',
                    aliases: ['pet-2501'],
                },
            ],
        },
        schools: {
            cap: 180,
            schools: [
                { id: 'datang', name: '大唐官府', skills: [] },
                { id: 'longgong', name: '龙宫', skills: [] },
            ],
        },
        schoolIcons: [
            { id: 'school-skill-datang-1', name: '十方无敌', school: 'datang' },
            { id: 'school-skill-longgong-2', name: '龙腾', school: 'longgong' },
        ],
        quickItems: {
            fixed: [{ id: 1, name: '60武器', file: 'item-1.png' }],
            variable: [{ id: 99, name: '金币', file: 'item-99.png' }],
        },
        ...patch,
    };
}

const sectionOf = (list: ReturnType<typeof buildAssets>, kind: string) =>
    list.find((one) => one.kind === kind);

describe('资源索引', () => {
    it('类别顺序固定，空类别仍保留可区分的就绪状态', () => {
        const list = buildAssets(make({ equipment: [] }));
        expect(list.map((one) => one.kind)).toEqual([
            'gear',
            'weapon',
            'lingshi',
            'yupo',
            'school',
            'life',
            'story',
            'active',
            'pet',
            'portrait',
            'item',
        ]);
        expect(sectionOf(list, 'gear')?.items).toEqual([]);
        expect(sectionOf(list, 'gear')?.status).toBe('ready');
    });

    it('装备部位翻成中文，武器本来就是中文', () => {
        const list = buildAssets(make());
        expect(sectionOf(list, 'gear')?.items[0].subgroup).toBe('头盔');
        expect(sectionOf(list, 'weapon')?.items[0].subgroup).toBe('剑');
        expect(sectionOf(list, 'lingshi')?.items[0].subgroup).toBe('戒指');
    });

    it('装备带等级，路径按家族分目录', () => {
        const item = buildAssets(make()).find((one) => one.kind === 'gear')?.items[0];
        expect(item?.note).toBe('60 级');
        expect(item?.img).toContain('game/icons/gear/gear-toukui-01.webp');
    });

    it('门派技能的子组是门派名，查不到门派时留空串', () => {
        const named = sectionOf(buildAssets(make()), 'school')?.items ?? [];
        expect(named[1].subgroup).toBe('龙宫');
        expect(named[0].img).toContain('game/icons/school/school-skill-datang-1.webp');

        const bare = buildAssets(make({ schools: { cap: 180, schools: [] } }));
        expect(sectionOf(bare, 'school')?.items[0].subgroup).toBe('');
    });

    it('召唤兽技能按类别的目录拼路径，没图的那条跳过', () => {
        const pets = sectionOf(buildAssets(make()), 'pet')?.items ?? [];
        expect(pets).toHaveLength(1);
        expect(pets[0].img).toContain('game/icons/pet-basic/pet-basic-301.png');
        expect(pets[0].subgroup).toBe('低级技能');
    });

    it('速记物品分成固定价与浮动价', () => {
        const items = sectionOf(buildAssets(make()), 'item')?.items ?? [];
        expect(items.map((one) => one.subgroup)).toEqual(['固定价', '浮动价']);
        expect(items[0].img).toContain('game/icons/item/item-1.png');
    });

    it('同名技能保留物法、强化版本及来源，原名仍可搜索', () => {
        const list = buildAssets(
            make({
                petSkills: {
                    categories: [{ id: 'special', name: '特殊技能', iconDir: 'pet-special' }],
                    icons: [
                        {
                            id: '488',
                            name: '泡泡相伴',
                            displayName: '泡泡相伴（物）',
                            categoryId: 'special',
                            subgroup: '神兽专属',
                            img: 'pet-special-488.png',
                        },
                        {
                            id: '489',
                            name: '泡泡相伴',
                            displayName: '泡泡相伴（法）',
                            categoryId: 'special',
                            subgroup: '神兽专属',
                            img: 'pet-special-489.png',
                        },
                        {
                            id: '56181',
                            name: '巨力踩踏',
                            displayName: '巨力踩踏（强化）',
                            categoryId: 'special',
                            subgroup: '神兽升星·强化',
                            img: 'pet-special-56181.png',
                        },
                    ],
                },
            }),
        );
        const pets = sectionOf(list, 'pet')?.items ?? [];
        expect(pets.map((one) => one.name)).toEqual([
            '泡泡相伴（物）',
            '泡泡相伴（法）',
            '巨力踩踏（强化）',
        ]);
        expect(pets[2].note).toBe('神兽升星·强化');
        expect(filterAssets(list, { kind: 'pet', keyword: '泡泡相伴' })[0].items).toHaveLength(2);
        expect(filterAssets(list, { kind: 'all', keyword: '神兽 强化' })[0].items).toEqual([
            pets[2],
        ]);
    });

    it('头像使用清单文件名，旧编号别名命中同一个头像，坏条目不阻断其他头像', () => {
        const list = buildAssets(
            make({
                petPortraits: {
                    icons: [
                        {
                            id: 'rabbit',
                            name: '兔子怪',
                            species: '兔子怪',
                            img: 'rabbit.webp',
                            aliases: ['PET-2501'],
                        },
                        { id: 'bad', name: '坏头像', img: '../bad.webp' },
                        { id: 'missing', name: '缺图', img: null },
                        null,
                    ],
                },
            }),
        );
        const portraits = sectionOf(list, 'portrait')?.items ?? [];
        expect(portraits).toHaveLength(1);
        expect(portraits[0].img).toContain('game/icons/pet-portrait/rabbit.webp');
        expect(filterAssets(list, { kind: 'all', keyword: '  pet-2501  ' })[0].items).toEqual(
            portraits,
        );
    });

    it('全分类搜索匹配分类与门派，局部搜索不穿透分类', () => {
        const list = buildAssets(make());
        expect(filterAssets(list, { kind: 'all', keyword: '技能 龙宫' })[0].items[0].name).toBe(
            '龙腾',
        );
        expect(filterAssets(list, { kind: 'weapon', keyword: '龙宫' })).toEqual([]);
        expect(filterAssets(list, { kind: 'all', keyword: '不存在的资源' })).toEqual([]);
        expect(filterAssets(list, { kind: 'gear', subgroup: '鞋子' })).toEqual([]);
    });

    it('部位和等级精确筛选，60 级不混入 160 级，筛选不修改原索引', () => {
        const source = make();
        source.equipment.push({ ...source.equipment[1], name: '擒龙', level: 160 });
        const list = buildAssets(source);
        const result = filterAssets(list, { kind: 'weapon', subgroup: '剑', level: 60 });
        expect(result[0].items.map((one) => one.name)).toEqual(['游龙剑']);
        expect(sectionOf(list, 'weapon')?.items).toHaveLength(2);
    });

    it('生活 / 剧情 / 特技各走自己的目录', () => {
        const list = buildAssets(make());
        expect(sectionOf(list, 'life')?.items[0].img).toContain('game/icons/skill/skill-01.webp');
        expect(sectionOf(list, 'story')?.items[0].img).toContain('game/icons/story/story-01.webp');
        expect(sectionOf(list, 'active')?.items[0].img).toContain(
            'game/icons/active/active-01.webp',
        );
    });

    it('清单缺失时只是那一类为空，不抛错', () => {
        const list = buildAssets(make({ iconGroups: null, petSkills: null }));
        expect(sectionOf(list, 'life')?.items).toEqual([]);
        expect(sectionOf(list, 'pet')?.items).toEqual([]);
        expect(list).toHaveLength(11);
    });
});

describe('资源清单缓存与补读', () => {
    afterEach(() => {
        vi.doUnmock('./game-data');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each(['icons.json', 'pet-skills.json', 'pet-portraits.json', 'equipment'])(
        '%s 首次失败后只补读失败部分',
        async (failed) => {
            vi.resetModules();
            const sources = make();
            const equipment = vi.fn().mockResolvedValue(sources.equipment);
            if (failed === 'equipment') equipment.mockRejectedValueOnce(new Error('unavailable'));
            vi.doMock('./game-data', () => ({
                gameDataReady: { value: true },
                loadGameData: vi.fn().mockResolvedValue(undefined),
                loadEquipmentNames: equipment,
                gameData: () => sources,
            }));
            vi.spyOn(console, 'error').mockImplementation(() => {});
            let failedOnce = false;
            const fetcher = vi.fn(async (url: string) => {
                const file = url.split('/').pop();
                if (file === failed && !failedOnce) {
                    failedOnce = true;
                    throw new Error('unavailable');
                }
                const files: Record<string, unknown> = {
                    'icons.json': { groups: sources.iconGroups },
                    'pet-skills.json': sources.petSkills,
                    'pet-portraits.json': sources.petPortraits,
                };
                return Response.json(files[file ?? '']);
            });
            vi.stubGlobal('fetch', fetcher);
            const { loadAssetSections } = await import('./game-assets');
            const first = loadAssetSections();
            expect(loadAssetSections()).toBe(first);
            const partial = await first;
            const kind =
                failed === 'icons.json'
                    ? 'life'
                    : failed === 'pet-skills.json'
                      ? 'pet'
                      : failed === 'pet-portraits.json'
                        ? 'portrait'
                        : 'gear';
            expect(sectionOf(partial, kind)?.items).toHaveLength(0);
            expect(sectionOf(partial, kind)?.status).toBe('failed');
            const complete = await loadAssetSections();
            expect(sectionOf(complete, kind)?.items.length).toBeGreaterThan(0);
            expect(complete.every((one) => one.status === 'ready')).toBe(true);
            expect(await loadAssetSections()).toBe(complete);
            for (const file of ['icons.json', 'pet-skills.json', 'pet-portraits.json']) {
                expect(fetcher.mock.calls.filter(([url]) => url.endsWith(file))).toHaveLength(
                    file === failed ? 2 : 1,
                );
            }
            expect(equipment).toHaveBeenCalledTimes(2);
        },
    );

    it.each(['icons.json', 'pet-skills.json', 'pet-portraits.json'])(
        '%s 结构损坏时标记失败，重试后可恢复且不重读成功文件',
        async (broken) => {
            vi.resetModules();
            const sources = make();
            vi.doMock('./game-data', () => ({
                gameDataReady: { value: true },
                loadGameData: vi.fn().mockResolvedValue(undefined),
                loadEquipmentNames: vi.fn().mockResolvedValue(sources.equipment),
                gameData: () => sources,
            }));
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const files: Record<string, unknown> = {
                'icons.json': { groups: sources.iconGroups },
                'pet-skills.json': sources.petSkills,
                'pet-portraits.json': sources.petPortraits,
            };
            let first = true;
            const fetcher = vi.fn(async (url: string) => {
                const file = url.split('/').pop() ?? '';
                if (file === broken && first) {
                    first = false;
                    return Response.json({});
                }
                return Response.json(files[file]);
            });
            vi.stubGlobal('fetch', fetcher);
            const { loadAssetSections } = await import('./game-assets');
            const partial = await loadAssetSections();
            expect(partial.some((one) => one.status === 'failed')).toBe(true);
            const complete = await loadAssetSections();
            expect(complete.every((one) => one.status === 'ready')).toBe(true);
            for (const file of Object.keys(files)) {
                expect(fetcher.mock.calls.filter(([url]) => url.endsWith(file))).toHaveLength(
                    file === broken ? 2 : 1,
                );
            }
        },
    );

    it('全部来源失败时保留明确失败状态，不伪装成空清单，并允许再次加载', async () => {
        vi.resetModules();
        const sources = make({
            equipment: [],
            schoolIcons: [],
            quickItems: { fixed: [], variable: [] },
        });
        vi.doMock('./game-data', () => ({
            gameDataReady: { value: false },
            loadGameData: vi.fn().mockResolvedValue(undefined),
            loadEquipmentNames: vi.fn().mockRejectedValue(new Error('unavailable')),
            gameData: () => sources,
        }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn().mockRejectedValue(new Error('unavailable'));
        vi.stubGlobal('fetch', fetcher);
        const { loadAssetSections } = await import('./game-assets');
        const first = await loadAssetSections();
        expect(first.every((one) => one.status === 'failed')).toBe(true);
        expect(await loadAssetSections()).not.toBe(first);
        expect(fetcher).toHaveBeenCalledTimes(6);
    });
});

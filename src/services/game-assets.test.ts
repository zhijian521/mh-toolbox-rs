import { describe, expect, it } from 'vitest';
import { buildAssets, type AssetSources } from './game-assets';

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
    it('十个类别，顺序固定，空类别也留着', () => {
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
            'item',
        ]);
        expect(sectionOf(list, 'gear')?.items).toEqual([]);
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
        expect(list).toHaveLength(10);
    });
});

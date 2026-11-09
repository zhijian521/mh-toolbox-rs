/**
 * 游戏资源的**索引**：把散在 `public/game/data/*.json` 的几份清单收成一份「能摆出来看」
 * 的扁平条目，供工具页的「游戏资源」那一页搜索与浏览。
 *
 * ---- 为什么新建一份，不塞进 `game-data.ts` ----
 *
 * 那几份表是**业务事实**：门派有几项技能、某个技能配哪张图，角色卡与编辑器在渲染时要用。
 * 这里要的是另一个东西——「把图摆一面墙」，它还会把 `icons.json`、`pet-skills.json`
 * 这两份**只有这一页需要**的清单也拉进来。放进 `game-data.ts` 就等于让启动路径多读两个
 * 文件，而那两页一年也未必打开一次。
 *
 * 因此：**懒加载**（第一次进资源页才取），复用 `loadEquipmentNames()` 与 `gameData()`
 * 已经缓存好的那几份，不重复请求。
 *
 * ---- 归一在纯函数里 ----
 *
 * `buildAssets()` 只吃数组、不碰网络，坏数据一律跳过而不是抛错——一份 `img` 写成 `null`
 * 的清单不该让整面墙空白。取数那半截（`loadAssetSections`）才碰 `fetch`。
 */

import {
    gameData,
    loadEquipmentNames,
    loadGameData,
    type EquipmentEntry,
    type QuickItemTable,
    type SchoolIconEntry,
    type SchoolTable,
} from './game-data';
import { GEAR_GROUP_KINDS, GEAR_RULES } from './game-rules';

const DATA_DIR = `${import.meta.env.BASE_URL}game/data/`;
const ICON_ROOT = `${import.meta.env.BASE_URL}game/icons/`;

export type AssetKind =
    | 'gear'
    | 'weapon'
    | 'lingshi'
    | 'yupo'
    | 'school'
    | 'life'
    | 'story'
    | 'active'
    | 'pet'
    | 'item';

/** 一项资源。`subgroup` 与 `note` 都可能为空串。 */
export interface AssetItem {
    /** 全局唯一，只给 `v-for` 用。 */
    key: string;
    name: string;
    /** 图片的完整地址（含 `BASE_URL`）。 */
    img: string;
    /** 小节内的分组：部位 / 门派 / 技能类别。 */
    subgroup: string;
    /** 名字下方那行小字：`60 级`、技能来源。没有就不显示。 */
    note: string;
    kind: AssetKind;
}

/** 一个类别（页面上一张卡）。 */
export interface AssetSection {
    kind: AssetKind;
    title: string;
    items: AssetItem[];
}

/** 取数用的那几份原材料。拆出来是为了让 `buildAssets` 能被单测直接喂。 */
export interface AssetSources {
    equipment: EquipmentEntry[];
    /** `icons.json` 的 `groups`，认不出就传 `null`。 */
    iconGroups: Record<string, unknown> | null;
    /** `pet-skills.json` 全文，认不出就传 `null`。 */
    petSkills: unknown;
    schools: SchoolTable;
    schoolIcons: SchoolIconEntry[];
    quickItems: QuickItemTable;
}

/** 类别的顺序与标题。数组顺序就是页面上的顺序。 */
const SECTION_TITLES: { kind: AssetKind; title: string }[] = [
    { kind: 'gear', title: '装备' },
    { kind: 'weapon', title: '武器' },
    { kind: 'lingshi', title: '灵饰' },
    { kind: 'yupo', title: '玉魄' },
    { kind: 'school', title: '门派技能' },
    { kind: 'life', title: '生活技能' },
    { kind: 'story', title: '剧情技能' },
    { kind: 'active', title: '装备特技' },
    { kind: 'pet', title: '召唤兽技能' },
    { kind: 'item', title: '速记物品' },
];

/** 把一个 `icons.json` 的组（`[{ id, name }]`）收成条目。文件名就是 `id`。 */
function iconItems(raw: unknown, kind: AssetKind, dir: string): AssetItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((one) => {
        const entry = (one ?? {}) as { id?: unknown; name?: unknown };
        if (typeof entry.id !== 'string' || typeof entry.name !== 'string') return [];
        return [
            {
                key: `${kind}:${entry.id}`,
                name: entry.name,
                img: `${ICON_ROOT}${dir}/${entry.id}.webp`,
                subgroup: '',
                note: '',
                kind,
            },
        ];
    });
}

/** 召唤兽技能：`icons` 每条带 `categoryId` 与文件名，目录名在 `categories` 里。 */
function petItems(raw: unknown): AssetItem[] {
    const table = (raw ?? {}) as {
        categories?: { id?: unknown; name?: unknown; iconDir?: unknown }[];
        icons?: { id?: unknown; name?: unknown; img?: unknown; categoryId?: unknown }[];
    };
    if (!Array.isArray(table.categories) || !Array.isArray(table.icons)) return [];

    const dirs = new Map<string, string>();
    const names = new Map<string, string>();
    for (const one of table.categories) {
        if (typeof one?.id !== 'string' || typeof one.iconDir !== 'string') continue;
        dirs.set(one.id, one.iconDir);
        names.set(one.id, typeof one.name === 'string' ? one.name : one.id);
    }

    return table.icons.flatMap((one) => {
        const id = typeof one?.id === 'string' ? one.id : '';
        const name = typeof one?.name === 'string' ? one.name : '';
        const file = typeof one?.img === 'string' ? one.img : '';
        const categoryId = typeof one?.categoryId === 'string' ? one.categoryId : '';
        /* `missing` 里那两条没有图（官网 404），清单里 `img` 是 null —— 跳过，
         * 摆一格「没有图」的方块只会让人以为图挂了。 */
        const dir = dirs.get(categoryId);
        if (!id || !name || !file || !dir) return [];
        return [
            {
                key: `pet:${id}`,
                name,
                img: `${ICON_ROOT}${dir}/${file}`,
                subgroup: names.get(categoryId) ?? '',
                note: '',
                kind: 'pet' as const,
            },
        ];
    });
}

/** 速记物品：文件名在清单里（`item-1.png`），目录固定 `item/`。 */
function itemItems(table: QuickItemTable): AssetItem[] {
    const flatten = (list: QuickItemTable['fixed'], subgroup: string) =>
        list.flatMap((one) => {
            if (typeof one?.file !== 'string' || typeof one?.name !== 'string') return [];
            return [
                {
                    key: `item:${one.id}`,
                    name: one.name,
                    img: `${ICON_ROOT}item/${one.file}`,
                    subgroup,
                    note: '',
                    kind: 'item' as const,
                },
            ];
        });
    return [...flatten(table.fixed, '固定价'), ...flatten(table.variable, '浮动价')];
}

/**
 * 把几份清单归一成十个类别。
 *
 * 纯函数：不读文件、不抛错。任何一份缺了，对应的类别就是空数组，页面那边自然不画那张卡。
 */
export function buildAssets(sources: AssetSources): AssetSection[] {
    const schoolNamesById = new Map(
        (sources.schools?.schools ?? []).map((one) => [one.id, one.name] as const),
    );

    const byFamily = (family: EquipmentEntry['family']) =>
        sources.equipment.filter((one) => one.family === family);

    const slotOf = (one: EquipmentEntry): string => {
        if (one.family !== 'weapon')
            return GEAR_GROUP_KINDS[one.group]?.replace(/^灵饰\s*·\s*/, '') ?? one.group;
        return one.group;
    };

    const equipmentItems = (family: EquipmentEntry['family']): AssetItem[] =>
        byFamily(family).map((one, index) => ({
            /* 同一部位里可能重名（60 级的那件和 70 级的那件不是一回事），
             * 所以键带上家族、部位与序号：名字不能当键。 */
            key: `${family}:${one.group}:${index}`,
            name: one.name,
            img: `${ICON_ROOT}${family}/${one.img}`,
            subgroup: slotOf(one),
            note: `${one.level} 级`,
            kind: family,
        }));

    const iconGroups = sources.iconGroups ?? {};

    const sections: Record<AssetKind, AssetItem[]> = {
        gear: equipmentItems('gear'),
        weapon: equipmentItems('weapon'),
        lingshi: equipmentItems('lingshi'),
        yupo: Object.values(GEAR_RULES)
            .filter((one) => one.category === 'jade')
            .map((one) => ({
                key: `yupo:${one.icon}`,
                name: one.name,
                img: `${ICON_ROOT}${one.icon}`,
                subgroup: '',
                note: '',
                kind: 'yupo' as const,
            })),
        school: (sources.schoolIcons ?? []).map((one) => ({
            key: `school:${one.id}`,
            name: one.name,
            img: `${ICON_ROOT}school/${one.id}.webp`,
            subgroup: schoolNamesById.get(one.school) ?? '',
            note: '',
            kind: 'school' as const,
        })),
        life: iconItems(iconGroups.skill, 'life', 'skill'),
        story: iconItems(iconGroups.story, 'story', 'story'),
        active: iconItems(iconGroups.active, 'active', 'active'),
        pet: petItems(sources.petSkills),
        item: itemItems(sources.quickItems ?? { fixed: [], variable: [] }),
    };

    return SECTION_TITLES.map(({ kind, title }) => ({ kind, title, items: sections[kind] }));
}

async function fetchJson(name: string): Promise<unknown> {
    const response = await fetch(`${DATA_DIR}${name}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${name} 加载失败（${response.status}）`);
    return response.json();
}

/** 取数的两层兜底：单份失败只是少一类，不让整页空白。 */
async function optional(name: string): Promise<unknown> {
    try {
        return await fetchJson(name);
    } catch (error) {
        console.error(`资源清单 ${name} 读取失败`, error);
        return null;
    }
}

let pending: Promise<AssetSection[]> | null = null;

/**
 * 加载一次，之后走缓存。
 *
 * 与 `loadGameData` 同一条：失败清掉 promise，下次进来会重试——dev server 抖一下不该把
 * 「没有资源」钉死一整晚。
 */
export function loadAssetSections(): Promise<AssetSection[]> {
    pending ??= (async () => {
        await loadGameData();
        const [equipment, iconGroups, petSkills] = await Promise.all([
            loadEquipmentNames().catch((error: unknown) => {
                console.error('装备名录读取失败', error);
                return [] as EquipmentEntry[];
            }),
            optional('icons.json'),
            optional('pet-skills.json'),
        ]);

        const data = gameData();
        const groups = (iconGroups as { groups?: Record<string, unknown> } | null)?.groups ?? null;
        return buildAssets({
            equipment,
            iconGroups: groups,
            petSkills,
            schools: data.schools,
            schoolIcons: data.schoolIcons,
            quickItems: data.quickItems,
        });
    })().catch((error: unknown) => {
        pending = null;
        throw error;
    });
    return pending;
}

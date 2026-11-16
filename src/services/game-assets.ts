/**
 * 图鉴按需归一 public/game 下的清单，复用装备与游戏规则缓存，不增加启动请求。
 * 条目缺图时跳过；清单读取失败单独标记，不能把加载失败解释成搜索无结果。
 * 展示名称可以区分技能版本，业务存档中的技能名与稳定 ID 保持原契约。
 */

import {
    gameData,
    gameDataReady,
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
    | 'portrait'
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
    /** 保留原名、物种与清单别名供搜索，不改变业务名录。 */
    aliases?: string[];
    level?: number;
    kind: AssetKind;
}

/** 一个类别（页面上一张卡）。 */
export interface AssetSection {
    kind: AssetKind;
    title: string;
    items: AssetItem[];
    status: 'ready' | 'failed';
}

/** 取数用的那几份原材料。拆出来是为了让 `buildAssets` 能被单测直接喂。 */
export interface AssetSources {
    equipment: EquipmentEntry[];
    /** `icons.json` 的 `groups`，认不出就传 `null`。 */
    iconGroups: Record<string, unknown> | null;
    /** `pet-skills.json` 全文，认不出就传 `null`。 */
    petSkills: unknown;
    petPortraits: unknown;
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
    { kind: 'portrait', title: '召唤兽头像' },
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
        icons?: {
            id?: unknown;
            name?: unknown;
            displayName?: unknown;
            subgroup?: unknown;
            img?: unknown;
            categoryId?: unknown;
        }[];
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
                name:
                    typeof one.displayName === 'string' && one.displayName.trim()
                        ? one.displayName
                        : name,
                img: `${ICON_ROOT}${dir}/${file}`,
                subgroup: names.get(categoryId) ?? '',
                note: typeof one.subgroup === 'string' ? one.subgroup : '',
                aliases: [name],
                kind: 'pet' as const,
            },
        ];
    });
}

/** 头像清单每个物种一张；旧编号别名只参与搜索，不重复展示头像。 */
function portraitItems(raw: unknown): AssetItem[] {
    const table = (raw ?? {}) as { icons?: unknown[] };
    if (!Array.isArray(table.icons)) return [];
    return table.icons.flatMap((entry) => {
        const one = (entry ?? {}) as Record<string, unknown>;
        if (
            typeof one.id !== 'string' ||
            typeof one.name !== 'string' ||
            !one.name.trim() ||
            typeof one.img !== 'string' ||
            !/^[\w-]+\.(png|webp)$/i.test(one.img)
        ) return [];
        return [
            {
                key: `portrait:${one.id}`,
                name: one.name,
                img: `${ICON_ROOT}pet-portrait/${one.img}`,
                subgroup: '',
                note: '',
                aliases: [one.species, ...(Array.isArray(one.aliases) ? one.aliases : [])].filter(
                    (value): value is string => typeof value === 'string',
                ),
                kind: 'portrait' as const,
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
 * 把几份清单归一成固定类别。
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
            level: one.level,
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
        portrait: portraitItems(sources.petPortraits),
        item: itemItems(sources.quickItems ?? { fixed: [], variable: [] }),
    };

    return SECTION_TITLES.map(({ kind, title }) => ({
        kind,
        title,
        items: sections[kind],
        status: 'ready',
    }));
}

/** 先筛全部索引再分页，等级精确匹配，避免搜 60 时混入 160 级。 */
export function filterAssets(
    sections: AssetSection[],
    filter: { kind: string; keyword?: string; subgroup?: string; level?: number },
): AssetSection[] {
    const words = filter.keyword?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    return sections
        .filter((section) => filter.kind === 'all' || section.kind === filter.kind)
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                if (filter.subgroup && item.subgroup !== filter.subgroup) return false;
                if (filter.level !== undefined && item.level !== filter.level) return false;
                const text = [
                    section.title,
                    item.name,
                    item.subgroup,
                    item.note,
                    ...(item.aliases ?? []),
                ].join(' ').toLowerCase();
                return words.every((word) => text.includes(word));
            }),
        }))
        .filter((section) => section.items.length > 0);
}

async function fetchJson(name: string): Promise<unknown> {
    const response = await fetch(`${DATA_DIR}${name}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${name} 加载失败（${response.status}）`);
    return response.json();
}

const optionalFiles = new Map<string, Promise<unknown>>();

/** 取数的两层兜底：单份失败只是少一类，不让整页空白。 */
async function optional(name: string, valid: (raw: unknown) => boolean): Promise<unknown> {
    try {
        let request = optionalFiles.get(name);
        if (!request) {
            request = fetchJson(name).then((raw) => {
                if (!valid(raw)) throw new TypeError(`${name}：清单结构无效`);
                return raw;
            });
            optionalFiles.set(name, request);
        }
        return await request;
    } catch (error) {
        optionalFiles.delete(name);
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
        const failed = new Set<AssetKind>();
        if (!gameDataReady.value) {
            for (const kind of ['school', 'item', 'yupo'] as const) failed.add(kind);
        }
        const [equipment, iconGroups, petSkills, petPortraits] = await Promise.all([
            loadEquipmentNames().catch((error: unknown) => {
                for (const kind of ['gear', 'weapon', 'lingshi'] as const) failed.add(kind);
                console.error('装备名录读取失败', error);
                return [] as EquipmentEntry[];
            }),
            optional('icons.json', (raw) => {
                const groups = (raw as { groups?: Record<string, unknown> } | null)?.groups;
                return (
                    !!groups &&
                    ['skill', 'story', 'active'].every((key) => Array.isArray(groups[key]))
                );
            }),
            optional('pet-skills.json', (raw) => {
                const table = raw as { categories?: unknown; icons?: unknown } | null;
                return Array.isArray(table?.categories) && Array.isArray(table?.icons);
            }),
            optional('pet-portraits.json', (raw) =>
                Array.isArray((raw as { icons?: unknown } | null)?.icons),
            ),
        ]);

        if (iconGroups === null) {
            for (const kind of ['life', 'story', 'active'] as const) failed.add(kind);
        }
        if (petSkills === null) failed.add('pet');
        if (petPortraits === null) failed.add('portrait');
        // 缺项结果只供本次展示；下次进入补读失败清单，成功文件继续复用。
        if (failed.size) pending = null;
        const data = gameData();
        const groups = (iconGroups as { groups?: Record<string, unknown> } | null)?.groups ?? null;
        const sections = buildAssets({
            equipment,
            iconGroups: groups,
            petSkills,
            petPortraits,
            schools: data.schools,
            schoolIcons: data.schoolIcons,
            quickItems: data.quickItems,
        });
        for (const section of sections) {
            if (failed.has(section.kind)) section.status = 'failed';
        }
        return sections;
    })().catch((error: unknown) => {
        pending = null;
        throw error;
    });
    return pending;
}

import { shallowRef } from 'vue';

export interface PetIconEntry {
    id: string;
    name: string;
    url: string;
    species?: string;
    fingerprint?: string;
}
export interface PetPanelRules {
    attributes: string[];
    points: string[];
    resources: string[];
    qualityTail: string[];
    elements: string[];
    labels: Record<string, string>;
    aliases: Record<string, string>;
}
export interface PetAssets {
    portraits: PetIconEntry[];
    skills: PetIconEntry[];
    panel: PetPanelRules;
}

const BASE = `${import.meta.env.BASE_URL}game/`;
export const petAssets = shallowRef<PetAssets | null>(null);
let pending: Promise<PetAssets> | null = null;

function strings(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((one) => typeof one === 'string' && one.trim());
}

export function parsePetPanel(raw: unknown): PetPanelRules {
    const value = raw as Partial<PetPanelRules>;
    if (
        !value ||
        !strings(value.attributes) ||
        !strings(value.points) ||
        !strings(value.resources) ||
        !strings(value.qualityTail) ||
        !strings(value.elements)
    ) {
        throw new TypeError('pet-panel.json：属性、加点或资质规则字段无效');
    }
    for (const field of ['labels', 'aliases'] as const) {
        if (
            !value[field] ||
            typeof value[field] !== 'object' ||
            Array.isArray(value[field]) ||
            Object.values(value[field]).some((one) => typeof one !== 'string' || !one.trim())
        ) {
            throw new TypeError(`pet-panel.json：${field} 无效`);
        }
    }
    for (const key of [
        'attributeTitle',
        'qualityTitle',
        'joinLevel',
        'life',
        'growth',
        'element',
        'level',
        'rename',
    ]) {
        if (!value.labels?.[key]) throw new TypeError(`pet-panel.json：缺少 ${key}`);
    }
    if (value.qualityTail.some((key) => !value.labels?.[key]))
        throw new TypeError('pet-panel.json：资质后续行缺少标签');
    return value as PetPanelRules;
}

export function parsePetIcons(raw: unknown, portrait: boolean): PetIconEntry[] {
    const file = raw as { icons?: unknown };
    if (!Array.isArray(file?.icons)) throw new TypeError('召唤兽图标清单缺少 icons');
    const ids = new Set<string>();
    return file.icons.map((one: unknown) => {
        const entry = one as {
            id?: unknown;
            name?: unknown;
            img?: unknown;
            species?: unknown;
            categoryId?: unknown;
            resourceMd5?: unknown;
        };
        if (
            typeof entry?.id !== 'string' ||
            !/^[\w-]+$/.test(entry.id) ||
            ids.has(entry.id) ||
            typeof entry.name !== 'string' ||
            !entry.name.trim() ||
            typeof entry.img !== 'string' ||
            !/^[\w-]+\.png$/.test(entry.img)
        ) {
            throw new TypeError('召唤兽图标清单存在无效或重复条目');
        }
        if (
            !portrait &&
            !['basic', 'advanced', 'super', 'special'].includes(String(entry.categoryId))
        ) {
            throw new TypeError('召唤兽技能分类无效');
        }
        ids.add(entry.id);
        return {
            id: entry.id,
            name: entry.name,
            species: typeof entry.species === 'string' ? entry.species : undefined,
            fingerprint: typeof entry.resourceMd5 === 'string' ? entry.resourceMd5 : undefined,
            url: `${BASE}icons/${portrait ? 'pet-portrait' : `pet-${String(entry.categoryId)}`}/${entry.img}`,
        };
    });
}

/** 召唤兽页按需读表，失败可重试；像素模板只在截图识别时加载。 */
export function loadPetAssets(): Promise<PetAssets> {
    if (petAssets.value) return Promise.resolve(petAssets.value);
    pending ??= Promise.all(
        ['pet-portraits.json', 'pet-skills.json', 'pet-panel.json'].map(async (file) => {
            const response = await fetch(`${BASE}data/${file}`);
            if (!response.ok) throw new Error(`${file} ${response.status}`);
            return response.json() as Promise<unknown>;
        }),
    )
        .then(([portraits, skills, panel]) => {
            const next = {
                portraits: parsePetIcons(portraits, true),
                skills: parsePetIcons(skills, false),
                panel: parsePetPanel(panel),
            };
            petAssets.value = next;
            return next;
        })
        .catch((error: unknown) => {
            pending = null;
            throw error;
        });
    return pending;
}

import { isObject } from './shape';

/** 稳定的存档键；游戏名称、选项、坐标与系数来自 public/game/data。 */
export type GearSlotName =
    | '头'
    | '项链'
    | '武器'
    | '衣服'
    | '腰带'
    | '鞋子'
    | '戒指'
    | '耳饰'
    | '配饰'
    | '手镯'
    | '玉魄·阴'
    | '玉魄·阳';

export interface AttrTemplate {
    title: string;
    labels: string[];
    wide?: boolean;
}
export interface TrainingTemplate {
    title: string;
    rows: { name: string; cap: number }[];
}
export interface GearRule {
    name: GearSlotName;
    col: number;
    row: number;
    icon: string;
    category: 'equipment' | 'spirit' | 'jade';
    groups: { id: string; kind: string }[];
    base: string[];
    extra: string[];
    gem: string[];
    conditions: string[];
    effects: string[];
}
export type PetQualityKey = 'attack' | 'defense' | 'hp' | 'mp' | 'speed' | 'dodge';
export interface CharacterRules {
    attributes: AttrTemplate[];
    trainings: TrainingTemplate[];
    gear: {
        slots: GearRule[];
        specials: string[];
        traits: string[];
        jadeEffects: string[];
        actives: string[];
        statLabels: string[];
        suitAliases: Record<string, string>;
        starGains: Record<string, number>;
        jadeGainFactor: number;
    };
    pets: {
        skillSlots: number;
        pillSlots: number;
        qualityFields: { key: PetQualityKey; label: string }[];
    };
    attributePanel: {
        labels: { text: string; key: string | null }[];
        resources: string[];
        order: string[];
    };
}

// 活绑定在启动装配后同步可读；模块求值时不派生快照，失败时保留上一份有效表。
export let ATTR_GROUPS: AttrTemplate[] = [];
export let TRAINING_GROUPS: TrainingTemplate[] = [];
export let GEAR_SLOTS: GearSlotName[] = [];
export let GEAR_RULES: Partial<Record<GearSlotName, GearRule>> = {};
export let GEAR_LAYOUT: Partial<Record<GearSlotName, { col: number; row: number }>> = {};
export let GEAR_SLOT_ICON: Partial<Record<GearSlotName, string>> = {};
export let GEAR_GROUP_SLOTS: Record<string, GearSlotName> = {};
export let GEAR_GROUP_KINDS: Record<string, string> = {};
export let GEAR_SPECIALS: string[] = [];
export let GEAR_TRAITS: string[] = [];
export let GEAR_JADE_EFFECTS: string[] = [];
export let GEAR_ACTIVES: string[] = [];
export let GEAR_STAT_LABELS: string[] = [];
export let GEAR_SUIT_ALIASES: Record<string, string> = {};
export let STAR_GAINS: Record<string, number> = {};
export let JADE_GAIN_FACTOR = 0;
export let PET_SKILL_SLOTS = 0;
export let PET_PILL_SLOTS = 0;
export let PET_QUALITY_FIELDS: { key: PetQualityKey; label: string }[] = [];
export let ATTR_LABELS: { text: string; key: string | null }[] = [];
export let RESOURCE_KEYS: string[] = [];
export let ATTR_ORDER: string[] = [];

function object(raw: unknown, where: string): Record<string, unknown> {
    if (!isObject(raw)) throw new TypeError(`character-rules.json：${where} 应为对象`);
    return raw;
}
function list(raw: unknown, where: string): unknown[] {
    if (!Array.isArray(raw)) throw new TypeError(`character-rules.json：${where} 应为数组`);
    return raw;
}
function text(raw: unknown, where: string): string {
    if (typeof raw !== 'string' || !raw.trim() || raw !== raw.trim()) {
        throw new TypeError(`character-rules.json：${where} 应为无首尾空白的非空字符串`);
    }
    return raw;
}
function strings(raw: unknown, where: string): string[] {
    const result = list(raw, where).map((value) => text(value, where));
    if (new Set(result).size !== result.length) {
        throw new TypeError(`character-rules.json：${where} 有重复项`);
    }
    return result;
}
function positive(raw: unknown, where: string): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw new TypeError(`character-rules.json：${where} 应为正数`);
    }
    return raw;
}
function integer(raw: unknown, where: string): number {
    const value = positive(raw, where);
    if (!Number.isInteger(value)) throw new TypeError(`character-rules.json：${where} 应为正整数`);
    return value;
}

/** 先整份校验再安装，坏资源不会造成一半新表、一半旧表。 */
export function parseCharacterRules(raw: unknown): CharacterRules {
    const file = object(raw, 'root');
    const gear = object(file.gear, 'gear');
    const pets = object(file.pets, 'pets');
    const panel = object(file.attributePanel, 'attributePanel');
    const slots = list(gear.slots, 'gear.slots').map((raw) => {
        const row = object(raw, 'slot');
        const category = row.category;
        if (!['equipment', 'spirit', 'jade'].includes(String(category))) {
            throw new TypeError('character-rules.json：无效装备类别');
        }
        const icon = text(row.icon, 'icon');
        if (!/^[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(icon)) {
            throw new TypeError('character-rules.json：无效装备图标路径');
        }
        return {
            name: text(row.name, 'slot.name') as GearSlotName,
            col: integer(row.col, 'col'),
            row: integer(row.row, 'row'),
            icon,
            category: category as GearRule['category'],
            groups: list(row.groups, 'groups').map((raw) => {
                const group = object(raw, 'group');
                return { id: text(group.id, 'group.id'), kind: text(group.kind, 'group.kind') };
            }),
            base: strings(row.base, 'base'),
            extra: strings(row.extra, 'extra'),
            gem: strings(row.gem, 'gem'),
            conditions: strings(row.conditions, 'conditions'),
            effects: strings(row.effects, 'effects'),
        };
    });
    if (new Set(slots.map((row) => row.name)).size !== slots.length) {
        throw new TypeError('character-rules.json：装备部位重复');
    }
    const groups = slots.flatMap((row) => row.groups.map((group) => group.id));
    if (new Set(groups).size !== groups.length) {
        throw new TypeError('character-rules.json：装备图标分组重复');
    }
    if (new Set(slots.map(({ col, row }) => `${col}:${row}`)).size !== slots.length) {
        throw new TypeError('character-rules.json：装备坐标重复');
    }
    return {
        attributes: list(file.attributes, 'attributes').map((raw) => {
            const group = object(raw, 'attribute group');
            return {
                title: text(group.title, 'title'),
                labels: strings(group.labels, 'labels'),
                ...(group.wide === true ? { wide: true } : {}),
            };
        }),
        trainings: list(file.trainings, 'trainings').map((raw) => {
            const group = object(raw, 'training group');
            return {
                title: text(group.title, 'title'),
                rows: list(group.rows, 'rows').map((raw) => {
                    const row = object(raw, 'training');
                    return { name: text(row.name, 'name'), cap: integer(row.cap, 'cap') };
                }),
            };
        }),
        gear: {
            slots,
            specials: strings(gear.specials, 'specials'),
            traits: strings(gear.traits, 'traits'),
            jadeEffects: strings(gear.jadeEffects, 'jadeEffects'),
            actives: strings(gear.actives, 'actives'),
            statLabels: strings(gear.statLabels, 'statLabels').sort((a, b) => b.length - a.length),
            suitAliases: Object.fromEntries(
                Object.entries(object(gear.suitAliases, 'suitAliases')).map(([key, value]) => [
                    text(key, 'suit alias'),
                    text(value, 'suit name'),
                ]),
            ),
            starGains: Object.fromEntries(
                Object.entries(object(gear.starGains, 'starGains')).map(([key, value]) => [
                    text(key, 'stat'),
                    positive(value, key),
                ]),
            ),
            jadeGainFactor: positive(gear.jadeGainFactor, 'jadeGainFactor'),
        },
        pets: {
            skillSlots: integer(pets.skillSlots, 'skillSlots'),
            pillSlots: integer(pets.pillSlots, 'pillSlots'),
            qualityFields: list(pets.qualityFields, 'qualityFields').map((raw) => {
                const row = object(raw, 'quality');
                const key = text(row.key, 'quality.key');
                if (!['attack', 'defense', 'hp', 'mp', 'speed', 'dodge'].includes(key)) {
                    throw new TypeError('character-rules.json：无效资质字段');
                }
                return { key: key as PetQualityKey, label: text(row.label, 'quality.label') };
            }),
        },
        attributePanel: {
            labels: list(panel.labels, 'labels')
                .map((raw) => {
                    const row = object(raw, 'label');
                    return {
                        text: text(row.text, 'label.text'),
                        key: row.key === null ? null : text(row.key, 'label.key'),
                    };
                })
                .sort((a, b) => b.text.length - a.text.length),
            resources: strings(panel.resources, 'resources'),
            order: strings(panel.order, 'order'),
        },
    };
}

/** 仅安装已通过 parseCharacterRules 校验的规则，由 game-data 统一提交。 */
export function installCharacterRules(rules: CharacterRules): void {
    ATTR_GROUPS = rules.attributes;
    TRAINING_GROUPS = rules.trainings;
    GEAR_SLOTS = rules.gear.slots.map((row) => row.name);
    GEAR_RULES = Object.fromEntries(rules.gear.slots.map((row) => [row.name, row]));
    GEAR_LAYOUT = Object.fromEntries(
        rules.gear.slots.map(({ name, col, row }) => [name, { col, row }]),
    );
    GEAR_SLOT_ICON = Object.fromEntries(rules.gear.slots.map(({ name, icon }) => [name, icon]));
    GEAR_GROUP_SLOTS = Object.fromEntries(
        rules.gear.slots.flatMap((row) => row.groups.map((group) => [group.id, row.name])),
    );
    GEAR_GROUP_KINDS = Object.fromEntries(
        rules.gear.slots.flatMap((row) => row.groups.map((group) => [group.id, group.kind])),
    );
    GEAR_SPECIALS = rules.gear.specials;
    GEAR_TRAITS = rules.gear.traits;
    GEAR_JADE_EFFECTS = rules.gear.jadeEffects;
    GEAR_ACTIVES = rules.gear.actives;
    GEAR_STAT_LABELS = rules.gear.statLabels;
    GEAR_SUIT_ALIASES = rules.gear.suitAliases;
    STAR_GAINS = rules.gear.starGains;
    JADE_GAIN_FACTOR = rules.gear.jadeGainFactor;
    PET_SKILL_SLOTS = rules.pets.skillSlots;
    PET_PILL_SLOTS = rules.pets.pillSlots;
    PET_QUALITY_FIELDS = rules.pets.qualityFields;
    ATTR_LABELS = rules.attributePanel.labels;
    RESOURCE_KEYS = rules.attributePanel.resources;
    ATTR_ORDER = rules.attributePanel.order;
}

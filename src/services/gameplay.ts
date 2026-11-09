import { isObject } from './shape';

export interface PriceGroup {
    name: string;
    subs: string[];
}
interface LegacyNameRule {
    contains: string[];
    prefixes: string[];
    category: string;
    sub: string;
}
export interface Gameplay {
    prices: {
        groups: PriceGroup[];
        legacyGroups: Record<string, string>;
        legacyNames: LegacyNameRule[];
    };
    ghost: { tolerance: number; edgeLow: number; edgeHigh: number };
}

/** 稳定的存档兜底分类。规则未加载时不改写已有分类。 */
export const DEFAULT_CATEGORY = '其他';
export let PRICE_GROUPS: PriceGroup[] = [];
export let PRICE_CATEGORIES: string[] = [];
export let LEGACY_PRICE_GROUPS: Record<string, string> = {};
export let LEGACY_PRICE_NAMES: LegacyNameRule[] = [];
export let GHOST_RULES: Gameplay['ghost'] | null = null;

export function parseGameplay(raw: unknown): Gameplay {
    const fail = (): never => {
        throw new TypeError('gameplay.json：规则字段无效');
    };
    const object = (value: unknown): Record<string, unknown> => (isObject(value) ? value : fail());
    const text = (value: unknown): string =>
        typeof value === 'string' && value.trim() === value && value.length > 0 ? value : fail();
    const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : fail());
    const strings = (value: unknown): string[] => {
        const list = array(value).map(text);
        return new Set(list).size === list.length ? list : fail();
    };
    const file = object(raw);
    const prices = object(file.prices);
    const groups = array(prices.groups).map((value) => {
        const row = object(value);
        return { name: text(row.name), subs: strings(row.subs) };
    });
    const names = groups.map((group) => group.name);
    if (!names.includes(DEFAULT_CATEGORY) || new Set(names).size !== names.length) fail();
    const legacyGroups = Object.fromEntries(
        Object.entries(object(prices.legacyGroups)).map(([key, value]) => {
            const category = text(value);
            if (!names.includes(category)) fail();
            return [text(key), category];
        }),
    );
    const legacyNames = array(prices.legacyNames).map((value) => {
        const row = object(value);
        const category = text(row.category);
        const sub = text(row.sub);
        const contains = strings(row.contains);
        const prefixes = strings(row.prefixes);
        if (
            !groups.find((group) => group.name === category)?.subs.includes(sub) ||
            (!contains.length && !prefixes.length)
        )
            fail();
        return { category, sub, contains, prefixes };
    });
    const ghost = object(file.ghost);
    const number = (value: unknown): number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail();
    const tolerance = number(ghost.tolerance);
    const edgeLow = number(ghost.edgeLow);
    const edgeHigh = number(ghost.edgeHigh);
    if (tolerance <= 0 || edgeHigh <= edgeLow) fail();
    return {
        prices: { groups, legacyGroups, legacyNames },
        ghost: { tolerance, edgeLow, edgeHigh },
    };
}

/** 所有资源校验成功后，由 game-data 一次安装。 */
export function installGameplay(rules: Gameplay): void {
    PRICE_GROUPS = rules.prices.groups;
    PRICE_CATEGORIES = PRICE_GROUPS.map((group) => group.name);
    LEGACY_PRICE_GROUPS = rules.prices.legacyGroups;
    LEGACY_PRICE_NAMES = rules.prices.legacyNames;
    GHOST_RULES = rules.ghost;
}

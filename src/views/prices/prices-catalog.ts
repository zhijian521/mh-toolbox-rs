/** 分类目录与旧数据推断。游戏品类、名称线索见 public/game/data/gameplay.json。 */
import {
    DEFAULT_CATEGORY,
    PRICE_CATEGORIES,
    PRICE_GROUPS,
    LEGACY_PRICE_GROUPS,
    LEGACY_PRICE_NAMES,
} from '../../services/gameplay';
export { DEFAULT_CATEGORY, PRICE_CATEGORIES, PRICE_GROUPS } from '../../services/gameplay';
export type { PriceGroup } from '../../services/gameplay';

export function isPriceCategory(value: string): boolean {
    // 资源缺失时保留用户原分类，不能把整份账改成兜底类别。
    return PRICE_CATEGORIES.length ? PRICE_CATEGORIES.includes(value) : Boolean(value.trim());
}

/** 二级只是提示，允许用户填写新玩法产出的品类。 */
export function subsOf(category: string): string[] {
    return PRICE_GROUPS.find((group) => group.name === category)?.subs ?? [];
}

/** 只在旧记录缺少合法二级时推断一次，线索按数据表顺序匹配。 */
export function legacyPriceSlot(name: string, category: string): { category: string; sub: string } {
    const legacy = category.trim();
    if (!PRICE_CATEGORIES.length) return { category: legacy || DEFAULT_CATEGORY, sub: '' };
    const title = name.trim();
    for (const rule of LEGACY_PRICE_NAMES) {
        if (
            rule.contains.some((word) => title.includes(word)) ||
            rule.prefixes.some((word) => title.startsWith(word))
        ) {
            return { category: rule.category, sub: rule.sub };
        }
    }
    if (!legacy) return { category: DEFAULT_CATEGORY, sub: '' };
    if (Object.hasOwn(LEGACY_PRICE_GROUPS, legacy))
        return { category: LEGACY_PRICE_GROUPS[legacy], sub: '' };
    if (isPriceCategory(legacy)) return { category: legacy, sub: '' };
    return { category: DEFAULT_CATEGORY, sub: legacy };
}

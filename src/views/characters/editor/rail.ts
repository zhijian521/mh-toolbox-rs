/**
 * 左栏目录的一行。
 *
 * 单独一个文件而不是写在 `EditorRail.vue` 的 `<script setup>` 里：`script setup`
 * 不能有 `export`，而两个调用方都要这个类型来构造 `items`。塞进 `character.ts`
 * 也不合适——那是角色字段的契约，这里是**控件**的入参。
 */
export interface RailItem {
    /** 稳定的行标识。装备用部位名，召唤兽用下标字符串（数组可能整份被替换）。 */
    key: string;
    /** 可见的名字。调用方负责兜底（「未命名」），空串会读作「这里坏了」。 */
    name: string;
    /** `aria-label`。两页的说法不同：装备是「编辑武器的装备」，召唤兽是「编辑第 2 只…」。 */
    label: string;
    /** 行尾那个点：实心＝填过，空心＝还是空壳。 */
    filled: boolean;
    /** 有图就走 `IconTile`（装备的部位图）；没有就落到 `mark`。 */
    icon?: string;
    /** 没有图时格子里那个字（装备的首字 / 召唤兽的五行字）。 */
    mark?: string;
    /**
     * 没有图时用哪种底盘：
     * - `true`  → `PressTile`（一块 22 的小压印，装备页）；
     * - `false` → 直接一枚 `.rail-mark`（召唤兽的五行章，底色更淡）。
     * 两边本来就不是同一种东西——装备那格是「这里该有一张图但没有」，
     * 召唤兽那枚是「这只兽的五行」，所以不合并成一种画法。
     */
    tile?: boolean;
}

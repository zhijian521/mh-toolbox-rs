<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 槽按钮：内容落在凹槽里；悬停时朱印落进槽中。
 *
 * 结构分两层，这是它和普通按钮最大的差别：
 *   - **按钮本体 = 槽**。`--well` 底 + 一道 `--rule-2` 金边 + 上沿内阴影，
 *     常态与悬停**都不变**。
 *   - **朱印 = `::before`**，`inset: 1px`。悬停时淡入并 `scale 0.94 → 1`，
 *     四周仍露出槽底与金边。
 *
 * 为什么不能直接给按钮刷朱红：底色一改，金边和槽就整片被盖掉，读起来是
 * 「换了块色板」，不是「一枚印落进槽里」。两态的差异必须落在子层。
 *
 * 三种形态由 props 的组合决定，不另开组件：
 *   - 只有 `text`      → 纯文字
 *   - `icon` + `text`  → 图标在左、文字在右
 *   - 只有 `icon`      → 纯图标，**正方形**（宽取高）
 *
 * 判定写在模板的类名上而不是另设 `variant` prop：多一个 prop 就多一处「声明与内容
 * 不一致」的可能（`variant="icon"` 却塞了文字），而「有没有 text」是现成的、不会骗人。
 *
 * 尺寸不写死：父级给 `--slot-h` / `--slot-w`（侧栏展开与收起都用 26px，两者同一值
 * 即正方形；普通场景不传就是一枚 26px 高的自然宽按钮）。`label` 出 `title` 与
 * `aria-label`，其余属性（含 `aria-expanded`）由 attrs 透传到 button——
 * **不要**为 ARIA 属性单独声明 prop：一旦声明，Vue 就不再自动透传，而组件内部
 * 又拿不到带连字符的 key（`$props['aria-x']` 在 `<script setup>` 里恒为 undefined，
 * 重命名解构也一样），属性会静默消失。类型检查由 `src/types/vue-augment.d.ts` 放开。
 */
withDefaults(
    defineProps<{
        label: string;
        /** 可见文字。不传就是纯图标。 */
        text?: string;
        /** 图标。不传就是纯文字。 */
        icon?: IconName;
        disabled?: boolean;
    }>(),
    { text: '', disabled: false },
);
</script>

<template>
    <button
        type="button"
        class="slot-btn"
        :class="{ 'icon-only': icon && !text }"
        :title="label"
        :aria-label="label"
        :disabled="disabled"
    >
        <AppIcon v-if="icon" :name="icon" />
        <span v-if="text" class="slot-text">{{ text }}</span>
    </button>
</template>

<style scoped>
.slot-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: var(--slot-w, auto);
    height: var(--slot-h, 26px);
    padding: 0 9px;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 80%, transparent);
    border-radius: var(--r-2);
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    color: var(--ink-2);
    font-family: var(--font-ui);
    transition:
        color var(--t-quick) var(--ease-soft),
        width 220ms var(--ease-soft),
        height 220ms var(--ease-soft);
}

/* 纯图标要正方形：宽度默认取高度，父级显式给了 `--slot-w` 才听父级的。
 * 父级若要正方形，把 `--slot-w` 传成与 `--slot-h` 同一个值即可（侧栏就是这么用的）。 */
.slot-btn.icon-only {
    width: var(--slot-w, var(--slot-h, 26px));
    padding: 0;
}

/* 朱印：内缩 1px 落进槽里，只留一道槽底 + 一道金边，印面才占得住这块地。
 * 印面渐变压得很淡（30% 白 / 32% 就透明）：真印泥是均匀一片朱色，
 * 立体感交给那 1px 顶边高光和外投影。渐变一重，读起来就是塑料按键不是印。 */
.slot-btn::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: calc(var(--r-2) - 1px);
    background-color: var(--cinnabar);
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bevel-hi) 30%, transparent),
        transparent 32%,
        var(--bevel-lo)
    );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 2px 5px color-mix(in srgb, var(--cinnabar) 30%, transparent);
    opacity: 0;
    transform: scale(0.94);
    transition:
        opacity var(--t-quick) var(--ease-soft),
        transform 200ms var(--ease-snap),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}

.slot-btn:hover:not(:disabled)::before {
    opacity: 1;
    transform: scale(1);
}
.slot-btn:hover:not(:disabled) {
    color: var(--on-cinnabar);
}
.slot-btn:hover:not(:disabled) :deep(.app-icon) {
    color: var(--on-cinnabar);
}

/* 按下：印被压进槽底的凹痕。 */
.slot-btn:active:not(:disabled)::before {
    background-color: color-mix(in srgb, var(--cinnabar) 82%, var(--ink));
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 58%);
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}

/* 图标要压在伪元素上面：绝对定位的 ::before 会盖住非定位内容。
 * 16px 是这个控件的规格——14px 在 24px 的印面上只占四成，四周一圈留白，
 * 看着就是「里面小小的」；16px 撑到三分之二才饱满。 */
.slot-btn :deep(.app-icon) {
    position: relative;
    z-index: 1;
    width: calc(16px * var(--fs-scale));
    height: calc(16px * var(--fs-scale));
}

/* 文字同图标一样要抬到印面之上。行高压到 1：26px 的槽里 12px 字号再带默认行高，
 * 视觉重心会往上飘半格。 */
.slot-text {
    position: relative;
    z-index: 1;
    font-size: var(--fs-sm);
    line-height: 1;
    white-space: nowrap;
}

/* 聚焦环不能用朱红：悬停时底就是朱红，红环会消失。 */
.slot-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--ink) 45%, transparent);
    outline-offset: 1px;
}

.slot-btn:disabled {
    opacity: 0.45;
    cursor: default;
}
</style>

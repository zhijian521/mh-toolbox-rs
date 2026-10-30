<script setup lang="ts">
/**
 * 槽按钮：一枚图标落在凹槽里；悬停时朱印落进槽中。
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
 * 尺寸不写死：父级给 `--slot-h` / `--slot-w`（侧栏展开 26px 等分、收起 30px 正方形，
 * 普通场景不传就是一枚 26px 高的自然宽按钮）。`label` 出 `title` 与 `aria-label`，
 * 其余 `aria-*` 与事件由 attrs 落到根元素。
 */
withDefaults(defineProps<{ label: string; disabled?: boolean }>(), { disabled: false });
</script>

<template>
    <button type="button" class="slot-btn" :title="label" :aria-label="label" :disabled="disabled">
        <slot />
    </button>
</template>

<style scoped>
.slot-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
        height 220ms var(--ease-soft);
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

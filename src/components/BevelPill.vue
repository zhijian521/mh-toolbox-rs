<script setup lang="ts">
/**
 * 凹槽胶囊：纸面上按出来的槽，选中是压在槽里的一枚朱印。
 *
 * 质感全部来自 `base.css` 的 `.bevel-pill`（--well 底 + 上暗下亮 + 上沿内阴影 + 下沿高光），
 * 这里只负责状态与结构。选中不是「描边」也不是「变亮」，是**灌满朱红**。
 *
 * `title` 显式声明（要用 `|| undefined` 把空串压掉，否则会渲染出空的 title=""）。
 * `aria-current` 之类**不**声明，交给属性透传：ARIA 有几十个，逐个写成 prop 既啰嗦，
 * 又会让「声明了所以不再自动透传」这条规则反过来咬人。类型层面由
 * `src/types/vue-augment.d.ts` 放开（`ComponentCustomProps` 并入 `HTMLAttributes`）。
 */
withDefaults(
    defineProps<{
        on?: boolean;
        disabled?: boolean;
        radius?: 'pill' | 'sm';
        /** 悬停提示。 */
        title?: string;
    }>(),
    { on: false, disabled: false, radius: 'pill', title: '' },
);
</script>

<template>
    <button
        type="button"
        class="bevel-pill"
        :class="{ on, 'radius-sm': radius === 'sm' }"
        :disabled="disabled"
        :title="title || undefined"
        :aria-pressed="on"
    >
        <slot />
    </button>
</template>

<script setup lang="ts">
/**
 * 凹槽胶囊：纸面上按出来的槽，选中是压在槽里的一枚朱印。
 *
 * 质感全部来自 `base.css` 的 `.bevel-pill`（--well 底 + 上暗下亮 + 上沿内阴影 + 下沿高光），
 * 这里只负责状态与结构。选中不是「描边」也不是「变亮」，是**灌满朱红**。
 */
withDefaults(defineProps<{ on?: boolean; disabled?: boolean; radius?: 'pill' | 'sm' }>(), {
    on: false,
    disabled: false,
    radius: 'pill',
});
</script>

<template>
    <button
        type="button"
        class="bevel-pill"
        :class="{ on, 'radius-sm': radius === 'sm' }"
        :disabled="disabled"
        :aria-pressed="on"
    >
        <slot />
    </button>
</template>

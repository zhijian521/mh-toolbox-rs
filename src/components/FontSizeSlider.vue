<script setup lang="ts">
import SteppedSlider from './SteppedSlider.vue';
import type { FontScale } from '../composables/use-font-scale';

/**
 * 字号三档滑块：`SteppedSlider` 的「字号」预设。
 *
 * 只定义档位与读屏名称，几何（槽、印、等分、回弹）全在 `SteppedSlider` 里——
 * 别在这里再写一份宽度算法：百分比基准那个坑（见那边的注释）就是分头写才漏出来的。
 *
 * 留这层壳而不是让调用方直接摆 `SteppedSlider` 的原因：设置页与演示页都要
 * 「较小 / 默认 / 较大」这一组和 `aria-label="字号"`，两处各写一遍迟早只改一处。
 */
const props = defineProps<{ modelValue: FontScale; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: FontScale] }>();

const OPTIONS: { value: FontScale; label: string }[] = [
    { value: 'small', label: '较小' },
    { value: 'default', label: '默认' },
    { value: 'large', label: '较大' },
];
</script>

<template>
    <SteppedSlider
        :model-value="props.modelValue"
        :options="OPTIONS"
        label="字号"
        :disabled="props.disabled"
        @update:model-value="emit('update:modelValue', $event)"
    />
</template>

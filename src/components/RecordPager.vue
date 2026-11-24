<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { pagerItems, type PagerItem } from '../composables/use-pagination';
import PressButton from './PressButton.vue';

const props = withDefaults(
    defineProps<{
        modelValue: number;
        pages: number;
        label?: string;
        previousLabel?: string;
        nextLabel?: string;
    }>(),
    { label: '记录分页', previousLabel: '上一页', nextLabel: '下一页' },
);
const emit = defineEmits<{ 'update:modelValue': [page: number] }>();
const pager = ref<HTMLElement | null>(null);
const items = computed(() => pagerItems(props.modelValue, props.pages));

function itemLabel(item: PagerItem): string {
    if (!item.gap) return `${props.label}：第 ${item.page} 页`;
    return `${props.label}：向${item.gap === 'previous' ? '前' : '后'}跳至第 ${item.page} 页`;
}

async function pick(page: number, focusCurrent = false) {
    const next = Math.max(1, Math.min(props.pages, page));
    if (next === props.modelValue) return;
    emit('update:modelValue', next);
    if (!focusCurrent) return;
    // 跳页后省略号可能卸载，将键盘焦点交给新的当前页。
    await nextTick();
    pager.value
        ?.querySelector<HTMLButtonElement>('[aria-current="page"]')
        ?.focus({ preventScroll: true });
}
</script>

<template>
    <nav v-if="pages > 1" ref="pager" class="record-pager" :aria-label="label">
        <div class="record-page-buttons">
            <PressButton
                icon="chevron-left"
                :label="previousLabel"
                :disabled="modelValue <= 1"
                @click="pick(modelValue - 1)"
            />
            <PressButton
                v-for="item in items"
                :key="item.gap ?? item.page"
                class="record-page"
                :icon="item.gap ? 'dots' : undefined"
                :text="item.gap ? '' : String(item.page)"
                :label="itemLabel(item)"
                :seal="!item.gap && item.page === modelValue"
                :aria-current="!item.gap && item.page === modelValue ? 'page' : undefined"
                :data-page="item.gap ? undefined : item.page"
                :data-page-gap="item.gap"
                @click="pick(item.page, Boolean(item.gap))"
            />
            <PressButton
                icon="chevron-right"
                :label="nextLabel"
                :disabled="modelValue >= pages"
                @click="pick(modelValue + 1)"
            />
        </div>
        <span
            class="record-page-status"
            :class="{ 'status-hidden': !$slots.default }"
            aria-live="polite"
            aria-atomic="true"
            ><slot>第 {{ modelValue }} 页，共 {{ pages }} 页</slot></span
        >
    </nav>
</template>

<style scoped>
.record-pager {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    margin-inline: auto;
    text-align: center;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.record-page-buttons {
    display: flex;
    justify-content: center;
    max-width: 100%;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
}
.record-page :deep(.press-btn-tile) {
    min-width: var(--tile-h);
    padding: 0 calc(6px * var(--fs-scale));
}
.status-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
</style>

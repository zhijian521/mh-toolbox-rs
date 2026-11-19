<script setup lang="ts">
/** 每项各持有一个 sortable 实例，注册和清理由 Vue 适配器跟随组件生命周期处理。 */
import { ref } from 'vue';
import { useSortable } from '@dnd-kit/vue/sortable';
import AppIcon from '../../components/AppIcon.vue';
import ShortcutFace from './ShortcutFace.vue';
import type { HomeShortcut } from './shortcuts';

const props = defineProps<{ one: HomeShortcut; index: number; sorting: boolean }>();
const emit = defineEmits<{ remove: [] }>();
const element = ref<HTMLElement | null>(null);
useSortable({
    id: () => props.one.id,
    index: () => props.index,
    group: 'home-shortcuts',
    type: 'home-shortcut',
    accept: 'home-shortcut',
    element,
});
</script>

<template>
    <li
        ref="element"
        class="selected-tile"
        :data-shortcut-id="one.id"
        :aria-label="one.text + '，第 ' + (index + 1) + ' 项'"
        tabindex="0"
    >
        <ShortcutFace :one="one">
            <template #suffix>
                <button
                    type="button"
                    class="remove-action"
                    :aria-label="'移除：' + one.text"
                    :title="'移除：' + one.text"
                    :disabled="sorting"
                    @click="emit('remove')"
                >
                    <AppIcon name="close" />
                </button>
            </template>
        </ShortcutFace>
    </li>
</template>

<style scoped>
.selected-tile {
    --shortcut-min-h: calc(63px * var(--fs-scale));
    --shortcut-pad: 12px 9px 12px 15px;
    --shortcut-gap: 11px;
    --shortcut-icon-box: calc(22px * var(--fs-scale));
    --shortcut-icon-size: calc(22px * var(--fs-scale));
    --shortcut-font-size: var(--fs-sm);
    min-width: 0;
    list-style: none;
    border-radius: var(--r-ticket);
    cursor: grab;
    touch-action: none;
    user-select: none;
}
.remove-action {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(27px * var(--fs-scale));
    height: calc(29px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--muted);
}
.remove-action:not(:disabled):hover {
    background: var(--well);
    color: var(--danger);
}
.selected-tile[data-dnd-dragging],
.selected-tile[data-dnd-dropping] {
    cursor: grabbing;
}
.selected-tile:is([data-dnd-dragging], [data-dnd-dropping]) :deep(.press-tile) {
    --press-shadow: 0 2px 0 var(--rule-2), 0 12px 26px -7px var(--shadow-lg);
    --press-side-tab-edge: var(--shortcut-tone);
}
.selected-tile[data-dnd-placeholder] {
    opacity: 0.3;
}
</style>

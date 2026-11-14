<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import { DEFAULT_SHORTCUT_IDS, HOME_SHORTCUTS, moveShortcut, shortcutsByIds } from './shortcuts';

const props = defineProps<{ ids: readonly string[]; error: string }>();
const emit = defineEmits<{ close: []; save: [ids: string[]] }>();
const selected = ref([...props.ids]);
const keyword = ref('');
const dragging = ref('');
const dropTarget = ref('');
const selectedItems = computed(() => shortcutsByIds(selected.value));
const groups = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase();
    return [...new Set(HOME_SHORTCUTS.map((one) => one.group))]
        .map((label) => ({
            label,
            items: HOME_SHORTCUTS.filter(
                (one) =>
                    one.group === label &&
                    (!query ||
                        (one.text + one.description + one.group)
                            .toLocaleLowerCase()
                            .includes(query)),
            ),
        }))
        .filter((group) => group.items.length);
});
function add(id: string) {
    if (!selected.value.includes(id)) selected.value = [...selected.value, id];
}
function move(id: string, to: number) {
    selected.value = moveShortcut(selected.value, id, to);
}
function dragStart(event: PointerEvent, id: string) {
    if (event.button !== 0) return;
    dragging.value = id;
    dropTarget.value = id;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function endDrag() {
    dragging.value = '';
    dropTarget.value = '';
}
function dragOver(event: PointerEvent) {
    if (!dragging.value) return;
    const row = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('li[data-shortcut-id]');
    dropTarget.value =
        row && (event.currentTarget as HTMLElement).contains(row)
            ? (row.dataset.shortcutId ?? '')
            : '';
}
function drop() {
    if (dragging.value && dropTarget.value)
        move(dragging.value, selected.value.indexOf(dropTarget.value));
    endDrag();
}
</script>

<template>
    <ModalShell title="自定义常用功能" :width="760" :height="580" fill @close="emit('close')">
        <p v-if="error" class="note error" role="status">{{ error }}</p>
        <div class="shortcut-editor">
            <section class="selected-pane">
                <header class="pane-heading">
                    <h3>已添加</h3>
                    <span>{{ selected.length }} 项</span>
                </header>
                <ol
                    class="selected-list"
                    aria-label="常用功能顺序"
                    tabindex="0"
                    @pointermove="dragOver"
                    @pointerup="drop"
                    @pointercancel="endDrag"
                    @lostpointercapture="endDrag"
                >
                    <li
                        v-for="(one, index) in selectedItems"
                        :key="one.id"
                        :data-shortcut-id="one.id"
                        :class="{
                            dragging: dragging === one.id,
                            'drop-target': dropTarget === one.id,
                        }"
                    >
                        <button
                            type="button"
                            class="drag-handle"
                            :aria-label="'拖动排序：' + one.text"
                            :title="'拖动排序：' + one.text"
                            @pointerdown="dragStart($event, one.id)"
                        >
                            <AppIcon name="grid" /></button
                        ><span class="order-index num">{{ index + 1 }}</span
                        ><AppIcon :name="one.icon" /><span class="selected-name">{{
                            one.text
                        }}</span>
                        <div class="order-actions">
                            <PressButton
                                icon="chevron-down"
                                class="move-up"
                                :label="'上移：' + one.text"
                                size="sm"
                                :disabled="index === 0"
                                @click="move(one.id, index - 1)"
                            />
                            <PressButton
                                icon="chevron-down"
                                :label="'下移：' + one.text"
                                size="sm"
                                :disabled="index === selected.length - 1"
                                @click="move(one.id, index + 1)"
                            />
                            <PressButton
                                icon="trash"
                                :label="'移除：' + one.text"
                                size="sm"
                                danger
                                @click="selected = selected.filter((id) => id !== one.id)"
                            />
                        </div>
                    </li>
                </ol>
                <p v-if="!selected.length" class="empty-selection">从右侧添加功能</p>
            </section>
            <section class="catalog-pane">
                <header class="pane-heading">
                    <h3>全部功能</h3>
                    <input
                        v-model="keyword"
                        class="field catalog-search"
                        type="search"
                        placeholder="搜索功能"
                        aria-label="搜索常用功能"
                    />
                </header>
                <div class="catalog-list" tabindex="0" aria-label="全部可添加功能">
                    <section v-for="group in groups" :key="group.label" class="catalog-group">
                        <h4>{{ group.label }}</h4>
                        <button
                            v-for="one in group.items"
                            :key="one.id"
                            type="button"
                            class="catalog-item"
                            :disabled="selected.includes(one.id)"
                            :aria-label="'添加：' + one.text"
                            @click="add(one.id)"
                        >
                            <AppIcon :name="one.icon" /><span
                                ><span>{{ one.text }}</span
                                ><small>{{ one.description }}</small></span
                            ><AppIcon :name="selected.includes(one.id) ? 'check' : 'add'" />
                        </button>
                    </section>
                    <p v-if="!groups.length" class="empty-selection">没有匹配的功能</p>
                </div>
            </section>
        </div>
        <template #footer>
            <PressButton
                class="restore-defaults"
                icon="refresh"
                text="恢复默认"
                label="恢复默认常用功能"
                @click="selected = [...DEFAULT_SHORTCUT_IDS]"
            />
            <PressButton text="取消" label="取消自定义常用功能" @click="emit('close')" />
            <PressButton
                icon="check"
                text="保存"
                label="保存常用功能"
                seal
                @click="emit('save', [...selected])"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.shortcut-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
    flex: 1;
    min-height: 0;
}
.selected-pane,
.catalog-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}
.selected-pane {
    padding-right: 18px;
    border-right: var(--w-hair) solid var(--rule);
}
.pane-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    min-height: 30px;
}
.pane-heading h3 {
    color: var(--accent);
    font-size: var(--fs-md);
}
.pane-heading > span {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.selected-list,
.catalog-list {
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    margin: 0;
    padding: 2px 5px 5px 0;
}
.selected-list {
    list-style: none;
}
.selected-list li {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 6px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.drag-handle {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 26px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: grab;
    touch-action: none;
    user-select: none;
}
.drag-handle:active {
    cursor: grabbing;
}
.selected-list li.dragging {
    opacity: 0.45;
}
.selected-list li.drop-target {
    background: color-mix(in srgb, var(--accent) 8%, var(--paper));
    box-shadow: inset 0 2px 0 var(--accent);
}
.order-index {
    width: 1.4em;
    color: var(--muted);
    font-size: var(--fs-mini);
    flex: none;
    text-align: center;
}
.selected-list li > .app-icon {
    color: var(--accent);
}
.selected-name {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
    font-size: var(--fs-sm);
}
.order-actions {
    display: flex;
    flex: none;
    gap: 3px;
}
.move-up :deep(.app-icon) {
    transform: rotate(180deg);
}
.catalog-search {
    min-width: 0;
    width: 130px;
    max-width: 100%;
    margin-left: auto;
}
.catalog-group + .catalog-group {
    margin-top: 16px;
}
.catalog-group h4 {
    margin-bottom: 6px;
    color: var(--indigo-ink);
    font-size: var(--fs-xs);
}
.catalog-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 9px 6px;
    border: 0;
    border-radius: var(--r-2);
    background: transparent;
    text-align: left;
}
.catalog-item:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 6%, var(--paper));
}
.catalog-item > .app-icon {
    color: var(--accent);
}
.catalog-item > span {
    flex: 1;
    display: grid;
    gap: 3px;
    min-width: 0;
    font-size: var(--fs-sm);
}
.catalog-item small {
    color: var(--muted);
    font-size: var(--fs-mini);
    overflow-wrap: anywhere;
}
.empty-selection {
    color: var(--muted);
    font-size: var(--fs-sm);
    padding: 15px 0;
}
.restore-defaults {
    margin-right: auto;
}
@media (max-width: 600px) {
    .shortcut-editor {
        gap: 10px;
    }
    .selected-pane {
        padding-right: 8px;
    }
    .selected-list li {
        flex-wrap: wrap;
    }
    .order-actions {
        margin-left: auto;
    }
    .catalog-search {
        width: 100%;
        margin-left: 0;
    }
}
</style>

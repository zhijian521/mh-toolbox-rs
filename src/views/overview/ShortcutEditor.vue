<script setup lang="ts">
/** 常用入口在独立草稿里编排；只有保存才交给首页写入本机偏好。 */
import { computed, nextTick, onUnmounted, ref, useId } from 'vue';
import {
    DragDropManager,
    Feedback,
    PointerActivationConstraints,
    type DragDropManagerInput,
} from '@dnd-kit/dom';
import {
    DragDropProvider,
    KeyboardSensor,
    PointerSensor,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/vue';
import { isSortable } from '@dnd-kit/vue/sortable';
import AppIcon from '../../components/AppIcon.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import ShortcutSortTile from './ShortcutSortTile.vue';
import { DEFAULT_SHORTCUT_IDS, HOME_SHORTCUTS, moveShortcut, shortcutsByIds } from './shortcuts';

const props = defineProps<{ ids: readonly string[]; error: string }>();
const emit = defineEmits<{ close: []; save: [ids: string[]] }>();
const selected = ref([...props.ids]);
const keyword = ref('');
const category = ref('');
const catalogOpen = ref(true);
const sorting = ref(false);
const editorRoot = ref<HTMLElement | null>(null);
const selectedList = ref<HTMLOListElement | null>(null);
const status = ref('');
const sortHintId = `shortcut-sort-${useId()}`;
const catalogId = `shortcut-catalog-${useId()}`;
const selectedItems = computed(() => shortcutsByIds(selected.value));
const selectedIds = computed(() => new Set(selected.value));
const groupNames = [...new Set(HOME_SHORTCUTS.map((one) => one.group))];
const categoryOptions = [
    { value: '', label: '全部' },
    ...groupNames.map((name) => ({ value: name, label: name })),
];
const groups = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase();
    return groupNames
        .filter((label) => !category.value || category.value === label)
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
const sensors = [
    PointerSensor.configure({
        activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
        preventActivation: (event) =>
            event.target instanceof Element && !!event.target.closest('button, input, a'),
    }),
    KeyboardSensor.configure({
        preventActivation: (event) =>
            event.target instanceof Element && !!event.target.closest('button, input, a'),
    }),
];
const plugins: DragDropManagerInput['plugins'] = (defaults) => [
    ...defaults.filter((plugin) => plugin !== Feedback),
    Feedback.configure({
        feedback: 'clone',
        // 浮起项留在弹窗内，保留主题继承及焦点边界；自动滚动和降动效由库处理。
        rootElement: () => editorRoot.value ?? document.body,
        dropAnimation: { duration: 200, easing: 'ease-out' },
    }),
];
// 显式持有唯一实例，关闭弹窗时释放传感器与插件。
const dragManager = new DragDropManager({ plugins, sensors });
onUnmounted(() => dragManager.destroy());
let activeManager: DragDropManager | undefined;

async function add(id: string) {
    if (sorting.value || selectedIds.value.has(id)) return;
    selected.value = [...selected.value, id];
    await nextTick();
    selectedList.value?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    status.value = `已添加，共 ${selected.value.length} 项`;
}
async function remove(id: string) {
    if (sorting.value) return;
    const index = selected.value.indexOf(id);
    selected.value = selected.value.filter((one) => one !== id);
    await nextTick();
    const tiles = selectedList.value?.querySelectorAll<HTMLElement>('[data-shortcut-id]');
    (tiles?.[Math.min(index, tiles.length - 1)] ?? selectedList.value)?.focus();
    status.value = `已移除，共 ${selected.value.length} 项`;
}
function restoreDefaults() {
    if (sorting.value) return;
    selected.value = [...DEFAULT_SHORTCUT_IDS];
    status.value = '已恢复默认，保存后生效';
}
function startDrag(_event: DragStartEvent, manager: DragDropManager) {
    activeManager = manager;
    sorting.value = true;
}
function endDrag(event: DragEndEvent) {
    const { source, target } = event.operation;
    // 无落点也标成取消，让乐观排序插件同时还原 DOM 与内部位置。
    if (!target) event.canceled = true;
    if (!event.canceled && isSortable(source)) {
        const id = String(source.id);
        selected.value = moveShortcut(selected.value, id, source.sortable.index);
        const name = selectedItems.value.find((one) => one.id === id)?.text ?? '';
        status.value = `${name}已移至第 ${selected.value.indexOf(id) + 1} 项`;
    } else {
        status.value = '已取消排序';
    }
    activeManager = undefined;
    sorting.value = false;
}
function cancelDrag(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !activeManager) return;
    // 先消费 Esc，避免同一次按键又触发 useModal 的关闭动作。
    event.preventDefault();
    event.stopPropagation();
    activeManager.actions.stop({ event, canceled: true });
}
</script>

<template>
    <ModalShell title="自定义常用功能" :width="1020" :height="660" fill @close="emit('close')">
        <p v-if="error" class="note error" role="status">{{ error }}</p>
        <DragDropProvider
            :manager="dragManager"
            :plugins="plugins"
            :sensors="sensors"
            @drag-start="startDrag"
            @drag-end="endDrag"
        >
            <div
                ref="editorRoot"
                class="shortcut-editor"
                :class="{ 'catalog-closed': !catalogOpen, 'is-sorting': sorting }"
                @keydown.capture="cancelDrag"
            >
                <section class="selected-pane" aria-label="已添加的功能">
                    <header class="pane-heading">
                        <h3>常用功能</h3>
                        <span class="pane-count num">{{ selected.length }} 项</span>
                        <button
                            type="button"
                            class="catalog-toggle"
                            :aria-expanded="catalogOpen"
                            :aria-controls="catalogId"
                            :disabled="sorting"
                            @click="catalogOpen = !catalogOpen"
                        >
                            <AppIcon :name="catalogOpen ? 'close' : 'add'" />
                            {{ catalogOpen ? '收起功能库' : '添加功能' }}
                        </button>
                    </header>
                    <p :id="sortHintId" class="pane-caption">
                        拖动调整顺序，点 × 移除。键盘可用空格拿起、方向键移动。
                    </p>
                    <ol
                        ref="selectedList"
                        class="selected-list"
                        :class="{ 'is-empty': !selected.length }"
                        aria-label="常用功能顺序"
                        :aria-describedby="sortHintId"
                        tabindex="0"
                    >
                        <ShortcutSortTile
                            v-for="(one, index) in selectedItems"
                            :key="one.id"
                            :one="one"
                            :index="index"
                            :sorting="sorting"
                            @remove="remove(one.id)"
                        />
                    </ol>
                    <div v-if="!selected.length" class="empty-selection">
                        <AppIcon name="grid" />
                        <p>还没有常用功能</p>
                        <span>从功能库选择，添加后可在这里排序</span>
                        <button v-if="!catalogOpen" type="button" @click="catalogOpen = true">
                            打开功能库
                        </button>
                    </div>
                </section>
                <section v-show="catalogOpen" :id="catalogId" class="catalog-pane">
                    <header class="pane-heading"><h3>功能库</h3></header>
                    <div class="catalog-search-wrap">
                        <AppIcon name="search" />
                        <input
                            v-model="keyword"
                            class="field catalog-search"
                            type="search"
                            placeholder="搜索功能"
                            aria-label="搜索常用功能"
                        />
                    </div>
                    <SegmentedPills
                        v-model="category"
                        :options="categoryOptions"
                        label="功能分类"
                        radius="sm"
                        wrap
                        class="catalog-categories"
                    />
                    <div class="catalog-list" tabindex="0" aria-label="全部可添加功能">
                        <section v-for="group in groups" :key="group.label" class="catalog-group">
                            <h4>
                                {{ group.label }}<span class="num">{{ group.items.length }}</span>
                            </h4>
                            <div class="catalog-items">
                                <button
                                    v-for="one in group.items"
                                    :key="one.id"
                                    type="button"
                                    class="catalog-item"
                                    :class="{ 'is-added': selectedIds.has(one.id) }"
                                    :data-tone="one.tone"
                                    :disabled="sorting || selectedIds.has(one.id)"
                                    :aria-label="'添加：' + one.text"
                                    @click="add(one.id)"
                                >
                                    <AppIcon :name="one.icon" class="catalog-icon" />
                                    <span class="catalog-copy">
                                        <span>{{ one.text }}</span>
                                        <small>{{ one.description }}</small>
                                    </span>
                                    <span class="catalog-state">
                                        <AppIcon
                                            :name="selectedIds.has(one.id) ? 'check' : 'add'"
                                        />
                                        <small v-if="selectedIds.has(one.id)">已添加</small>
                                    </span>
                                </button>
                            </div>
                        </section>
                        <p v-if="!groups.length" class="catalog-empty">没有匹配的功能</p>
                    </div>
                </section>
            </div>
        </DragDropProvider>
        <p class="reorder-status" role="status" aria-live="polite">{{ status }}</p>
        <template #footer>
            <PressButton
                class="restore-defaults"
                icon="refresh"
                text="恢复默认"
                label="恢复默认常用功能"
                :disabled="sorting"
                @click="restoreDefaults"
            />
            <PressButton text="取消" label="取消自定义常用功能" @click="emit('close')" />
            <PressButton
                icon="check"
                text="保存"
                label="保存常用功能"
                :disabled="sorting"
                seal
                @click="emit('save', [...selected])"
            />
        </template>
    </ModalShell>
</template>

<style scoped src="./shortcut-editor.css"></style>

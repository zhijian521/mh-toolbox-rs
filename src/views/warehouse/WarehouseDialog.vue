<script setup lang="ts">
/** 自包含仓库入口：调用方只控制开关，筛选、编辑与持久化均留在模块内。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import SelectField from '../../components/SelectField.vue';
import RecordPager from '../../components/RecordPager.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import PressTile from '../../components/PressTile.vue';
import IconTile from '../characters/IconTile.vue';
import PetImage from '../characters/PetImage.vue';
import GearTip from '../characters/GearTip.vue';
import PetTip from '../characters/PetTip.vue';
import { useGearIcon } from '../characters/use-gear-icon';
import { GEAR_SLOTS } from '../characters/gear';
import { EDITOR_H, EDITOR_W } from '../characters/editor-metrics';
import { loadGameData } from '../../services/game-data';
import {
    filterWarehouse,
    newWarehouseItem,
    warehouseName,
    type ReadonlyWarehouseItem,
    type WarehouseKind,
} from './warehouse';
import { loadWarehouse, useWarehouse } from './warehouse-store';
import WarehouseEditor from './WarehouseEditor.vue';

const emit = defineEmits<{ close: [] }>();
const store = useWarehouse();
const { items, loaded, loadError, writeError, pending } = store;
const kind = ref<WarehouseKind>('gear');
const keyword = ref('');
const slot = ref('');
const page = ref(1);
const scrollTop = ref(0);
const content = ref<HTMLElement | null>(null);
const stages = ref<HTMLElement | null>(null);
const editor = ref<InstanceType<typeof WarehouseEditor> | null>(null);
const direction = ref('warehouse-forward');
let returnItemId: string | null = null;
const hovered = ref<ReadonlyWarehouseItem | null>(null);
const anchor = ref<DOMRect | null>(null);
const tipId = useId();
let hideTimer: ReturnType<typeof setTimeout> | undefined;
function keepTip() {
    clearTimeout(hideTimer);
}
function hideTip() {
    keepTip();
    hovered.value = null;
    anchor.value = null;
}
function scheduleHide() {
    keepTip();
    // 留出从图标跨过浮层间隙的时间，长详情可以在浮层内滚动。
    hideTimer = setTimeout(hideTip, 160);
}
function showTip(item: ReadonlyWarehouseItem, event: Event) {
    keepTip();
    anchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
    hovered.value = item;
}
function dismissTip(event: KeyboardEvent) {
    if (!hovered.value) return;
    event.stopPropagation();
    hideTip();
}
function scroll() {
    scrollTop.value = content.value?.scrollTop ?? 0;
    hideTip();
}
watch(content, (element) => {
    if (element) element.scrollTop = scrollTop.value;
});
const editing = ref<{ item: ReadonlyWarehouseItem; existing: boolean } | null>(null);
const title = computed(() =>
    !editing.value
        ? '仓库'
        : editing.value.existing
          ? '修改仓库物品'
          : editing.value.item.kind === 'gear'
            ? '装备入仓'
            : '召唤兽入仓',
);
function close() {
    if (editing.value) void editor.value?.requestClose();
    else emit('close');
}
function back() {
    direction.value = 'warehouse-back';
    editing.value = null;
}
function leavePage(element: Element) {
    hideTip();
    // 离场内容仍要画完动画，但不能继续接收键盘或被读屏重复读到。
    (element as HTMLElement).inert = true;
    element.setAttribute('aria-hidden', 'true');
}
function focusPage(element: Element) {
    if (!element.isConnected || element.hasAttribute('aria-hidden')) return;
    if (editing.value) {
        if (element.classList.contains('warehouse-editor-page')) {
            element.querySelector<HTMLInputElement>('.gear-name-input, [aria-label="召唤兽名称"]')
                ?.focus({ preventScroll: true });
        }
        return;
    }
    const item = Array.from(element.querySelectorAll<HTMLElement>('.warehouse-item')).find(
        (one) => one.dataset.assetId === returnItemId,
    );
    const fallback = returnItemId !== null
        ? element.querySelector<HTMLElement>('[data-warehouse-add]')
        : element.querySelector<HTMLElement>('.warehouse-search');
    (item ?? fallback)?.focus({ preventScroll: true });
}
const options = computed(() => [
    { value: 'gear' as const, label: `装备 ${items.value.filter((item) => item.kind === 'gear').length}` },
    { value: 'pet' as const, label: `召唤兽 ${items.value.filter((item) => item.kind === 'pet').length}` },
]);
const slots = computed(() => [
    { value: '', label: '全部部位' },
    ...GEAR_SLOTS.map((value) => ({ value, label: value })),
]);
const filtered = computed(() =>
    filterWarehouse(items.value, kind.value, keyword.value, kind.value === 'gear' ? slot.value : ''),
);
const PAGE_SIZE = 48;
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const visible = computed(() =>
    filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
watch([kind, keyword, slot, page, editing, items], hideTip);
watch([kind, keyword, slot], () => {
    page.value = 1;
    scrollTop.value = 0;
    if (content.value) content.value.scrollTop = 0;
});
watch(page, () => {
    scrollTop.value = 0;
    if (content.value) content.value.scrollTop = 0;
});
watch(pages, (value) => {
    page.value = Math.min(page.value, value);
});
const { icon } = useGearIcon();
const blocked = computed(
    () => !loaded.value || !!loadError.value || !!writeError.value || pending.value > 0,
);
async function load() {
    try {
        await loadGameData();
        await loadWarehouse();
    } catch {
        loadError.value = '游戏规则读取失败，请重新读取仓库';
    }
}
onMounted(() => {
    if (!loaded.value && !loadError.value) void load();
    window.addEventListener('resize', hideTip);
    void nextTick(() => {
        const firstPage = stages.value?.firstElementChild;
        if (firstPage) focusPage(firstPage);
    });
});
onBeforeUnmount(() => {
    keepTip();
    window.removeEventListener('resize', hideTip);
});
function add() {
    if (blocked.value) return;
    returnItemId = '';
    direction.value = 'warehouse-forward';
    editing.value = { item: newWarehouseItem(kind.value), existing: false };
}
function open(item: ReadonlyWarehouseItem) {
    if (blocked.value) return;
    returnItemId = item.id;
    direction.value = 'warehouse-forward';
    editing.value = { item, existing: true };
}
</script>

<template>
    <ModalShell
        class="character-theme"
        :title="title"
        :width="EDITOR_W"
        :height="EDITOR_H"
        initial-focus="none"
        fill
        flush
        @close="close"
    >
        <div ref="stages" class="warehouse-pages">
            <Transition :name="direction" @before-leave="leavePage" @after-enter="focusPage">
                <WarehouseEditor
                    v-if="editing"
                    :key="editing.item.id"
                    ref="editor"
                    :item="editing.item"
                    :existing="editing.existing"
                    @close="back"
                    @saved="back"
                    @removed="back"
                />
                <div v-else key="list" class="warehouse-page">
                    <div class="warehouse-page-body">
                        <div class="warehouse-toolbar">
                            <SteppedSlider
                                v-model="kind"
                                :options="options"
                                as="tab"
                                prefix="warehouse"
                                label="仓库分类"
                            />
                            <PressButton
                                data-warehouse-add
                                icon="add"
                                :text="kind === 'gear' ? '装备入仓' : '召唤兽入仓'"
                                :label="kind === 'gear' ? '新增或截图录入装备' : '新增或截图录入召唤兽'"
                                :disabled="blocked"
                                seal
                                @click="add"
                            />
                        </div>
                        <div class="warehouse-filters">
                            <input
                                v-model="keyword"
                                class="field warehouse-search"
                                aria-label="搜索仓库物品"
                                :placeholder="kind === 'gear' ? '搜索名称、特效、备注' : '搜索名称、技能'"
                            />
                            <SelectField
                                v-if="kind === 'gear'"
                                v-model="slot"
                                :options="slots"
                                label="筛选装备部位"
                                class="warehouse-slot-filter"
                            />
                            <span class="muted warehouse-count">
                                {{ filtered.length }} {{ kind === 'gear' ? '件装备' : '只召唤兽' }}
                            </span>
                        </div>
                        <LoadNotice :error="loadError" :load="load" :blocked="pending > 0 || !!writeError" />
                        <SaveNotice :error="writeError" :pending="pending" @retry="store.retry" />
                        <section
                            :id="`warehouse-pane-${kind}`"
                            ref="content"
                            :aria-labelledby="`warehouse-tab-${kind}`"
                            role="tabpanel"
                            class="warehouse-content"
                            @scroll="scroll"
                        >
                            <p v-if="loadError" class="empty-note">暂时无法读取仓库，请重试。</p>
                            <p v-else-if="!loaded" class="empty-note" role="status">正在读取仓库…</p>
                            <div v-else-if="!filtered.length" class="warehouse-empty">
                                <p>{{ keyword || (kind === 'gear' && slot) ? '没有符合条件的物品' : kind === 'gear' ? '还没有入仓装备' : '还没有入仓召唤兽' }}</p>
                                <span class="muted">{{ keyword || (kind === 'gear' && slot) ? '换个关键词或筛选条件试试' : '点击右上角入仓，支持截图识别和手动填写' }}</span>
                            </div>
                            <div v-else class="warehouse-grid">
                                <button
                                    v-for="item in visible"
                                    :key="item.id"
                                    :data-asset-id="item.id"
                                    type="button"
                                    class="character-choice warehouse-item"
                                    :aria-label="`查看并修改 ${warehouseName(item)}`"
                                    :aria-describedby="hovered?.id === item.id ? `${tipId}-${item.kind}` : undefined"
                                    :disabled="blocked"
                                    @mouseenter="showTip(item, $event)"
                                    @mouseleave="scheduleHide"
                                    @focus="showTip(item, $event)"
                                    @blur="hideTip"
                                    @keydown.esc="dismissTip"
                                    @click="open(item)"
                                >
                                    <template v-if="item.kind === 'gear'">
                                        <IconTile
                                            v-if="icon(item.gear)"
                                            class="warehouse-gear-icon"
                                            :src="icon(item.gear)"
                                            aria-hidden="true"
                                        />
                                        <PressTile v-else still class="warehouse-gear-icon" aria-hidden="true">
                                            <span class="warehouse-icon-fallback">{{ item.gear.slot.slice(0, 1) }}</span>
                                        </PressTile>
                                    </template>
                                    <PressTile
                                        v-else
                                        still
                                        class="warehouse-pet-icon"
                                        aria-hidden="true"
                                    >
                                        <PetImage :name="item.pet.portrait || ''" kind="portrait" :title="null" />
                                    </PressTile>
                                </button>
                            </div>
                        </section>
                    </div>
                    <footer class="modal-actions">
                        <RecordPager v-model="page" :pages="pages" />
                        <PressButton
                            data-modal-cancel
                            text="关闭"
                            label="关闭仓库"
                            @click="emit('close')"
                        />
                    </footer>
                </div>
            </Transition>
        </div>
    </ModalShell>
    <GearTip
        :tooltip-id="`${tipId}-gear`"
        :anchor="anchor"
        :detail="hovered?.kind === 'gear' ? hovered.gear.detail : null"
        :slot-name="hovered?.kind === 'gear' ? hovered.gear.slot : undefined"
        :layer="90"
        interactive
        @mouseenter="keepTip"
        @mouseleave="scheduleHide"
    >
        <template v-if="hovered?.kind === 'gear'">
            <div v-if="hovered.soul?.length" class="warehouse-soul">
                <span class="meta">命魂之玉</span>
                <div v-for="(row, i) in hovered.soul" :key="i" class="meta">
                    {{ row.label }} {{ row.value }}
                </div>
            </div>
            <div v-if="hovered.server" class="meta warehouse-tip-server">{{ hovered.server }}</div>
        </template>
    </GearTip>
    <PetTip
        :tooltip-id="`${tipId}-pet`"
        :anchor="anchor"
        :pet="hovered?.kind === 'pet' ? hovered.pet : null"
        :layer="90"
        interactive
        @mouseenter="keepTip"
        @mouseleave="scheduleHide"
    >
        <div v-if="hovered?.server" class="meta warehouse-tip-server">{{ hovered.server }}</div>
    </PetTip>
</template>

<style scoped src="./warehouse.css"></style>

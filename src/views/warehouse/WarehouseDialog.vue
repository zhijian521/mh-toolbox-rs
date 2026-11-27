<script setup lang="ts">
/** 自包含仓库入口：调用方只控制开关，筛选、编辑与持久化均留在模块内。 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import GroupHead from '../../components/GroupHead.vue';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useCharacterFields } from '../characters/use-character-fields';
import RecordPager from '../../components/RecordPager.vue';
import { usePagination } from '../../composables/use-pagination';
import LoadNotice from '../../components/LoadNotice.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import WarehouseItems from './WarehouseItems.vue';
import { GEAR_SLOTS } from '../characters/gear';
import { EDITOR_H, EDITOR_W } from '../characters/editor-metrics';
import { loadGameData } from '../../services/game-data';
import {
    filterWarehouse,
    newWarehouseItem,
    warehouseItemsByState,
    type ReadonlyWarehouseItem,
    type WarehouseKind,
    type WarehouseItem,
    type WarehouseState,
} from './warehouse';
import { loadWarehouse, useWarehouse } from './warehouse-store';
import { loadAccounts, useAccounts } from '../accounts/accounts-store';
import { soldWarehouseItems } from '../accounts/account-assets';
import type { AccountKind } from '../accounts/accounts';
import WarehouseEditor from './WarehouseEditor.vue';

const props = withDefaults(
    defineProps<{
        mode?: 'manage' | 'pick' | 'draft' | 'equip';
        gearSlot?: string;
        single?: boolean;
        excludedIds?: readonly string[];
        assetKind?: WarehouseKind;
        draftItems?: readonly ReadonlyWarehouseItem[];
        selectedItems?: readonly ReadonlyWarehouseItem[];
        tradeDirection?: AccountKind;
    }>(),
    { mode: 'manage', assetKind: 'gear' },
);
const emit = defineEmits<{
    close: [];
    pick: [items: readonly ReadonlyWarehouseItem[]];
    draft: [items: WarehouseItem[]];
}>();
const { glass, SelectField, selectProps } = useCharacterFields();
const store = useWarehouse();
const { items, owners, loaded, loadError, writeError, pending, tradePending, characterPending } =
    store;
const choosing = computed(() => props.mode === 'pick' || props.mode === 'equip');
const choosingTrade = computed(() => props.mode === 'pick');
const accounts = useAccounts();
const stockState = ref<WarehouseState>('all');
const stockOptions = [
    { value: 'all' as const, label: '全部' },
    { value: 'equipped' as const, label: '已穿戴' },
    { value: 'stock' as const, label: '未穿戴' },
    { value: 'sold' as const, label: '已售出' },
];
const soldView = computed(() => props.mode === 'manage' && stockState.value === 'sold');
const showsSales = computed(
    () => props.mode === 'manage' && (stockState.value === 'all' || stockState.value === 'sold'),
);
const sales = computed(() =>
    props.mode === 'manage' ? soldWarehouseItems(accounts.entries.value, items.value) : [],
);
const soldIds = computed(() => new Set(sales.value.map((item) => item.id)));
const sourceItems = computed(() => {
    if (choosing.value)
        return items.value.filter(
            (item) =>
                (choosingTrade.value || !owners.value.has(item.id)) &&
                !props.excludedIds?.includes(item.id),
        );
    return warehouseItemsByState(items.value, sales.value, owners.value, stockState.value);
});
const viewError = computed(
    () => loadError.value || (showsSales.value ? accounts.loadError.value : ''),
);
const viewLoaded = computed(() => loaded.value && (!showsSales.value || accounts.loaded.value));
const kind = ref<WarehouseKind>(props.assetKind);
const slot = ref(props.gearSlot ?? '');
const anyFilter = computed(
    () =>
        Boolean(kind.value === 'gear' && !props.gearSlot && slot.value) ||
        (props.mode === 'manage' && stockState.value !== 'all'),
);
const page = ref(1);
const scrollTop = ref(0);
const content = ref<HTMLElement | null>(null);
const stages = ref<HTMLElement | null>(null);
const editor = ref<InstanceType<typeof WarehouseEditor> | null>(null);
const grid = ref<InstanceType<typeof WarehouseItems> | null>(null);
const selectedIds = ref(new Set((props.selectedItems ?? []).map((item) => item.id)));
const selected = computed(() =>
    sourceItems.value.filter((item) => item.kind === kind.value && selectedIds.value.has(item.id)),
);
const direction = ref('warehouse-forward');
let returnItemId: string | null = null;
function hideTip() {
    grid.value?.hideTip();
}
function scroll() {
    scrollTop.value = content.value?.scrollTop ?? 0;
    hideTip();
}
watch(content, (element) => {
    if (element) element.scrollTop = scrollTop.value;
});
const editing = ref<{ item: ReadonlyWarehouseItem; existing: boolean } | null>(
    props.mode === 'draft'
        ? { item: props.draftItems?.[0] ?? newWarehouseItem(props.assetKind), existing: false }
        : null,
);
const tradeLabel = computed(() =>
    props.tradeDirection === 'income' || (!props.tradeDirection && props.mode === 'pick')
        ? '卖出'
        : '买入',
);
const title = computed(() =>
    props.mode === 'equip'
        ? `从仓库选择${kind.value === 'gear' ? '装备' : '召唤兽'}`
        : props.mode === 'pick'
          ? `选择${tradeLabel.value}的${kind.value === 'gear' ? '装备' : '召唤兽'}`
          : props.mode === 'draft'
            ? `录入${tradeLabel.value}的${kind.value === 'gear' ? '装备' : '召唤兽'}`
            : !editing.value
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
    if (props.mode === 'draft') {
        emit('close');
        return;
    }
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
            element
                .querySelector<HTMLInputElement>(
                    'input.gear-name-input, .gear-name-input input, input[aria-label="召唤兽名称"]',
                )
                ?.focus({ preventScroll: true });
        }
        return;
    }
    const item = Array.from(element.querySelectorAll<HTMLElement>('.warehouse-item')).find(
        (one) => one.dataset.assetId === returnItemId,
    );
    const fallback =
        element.querySelector<HTMLElement>(
            '[data-warehouse-add], .warehouse-item:not(:disabled)',
        ) ?? element.closest('.modal-panel')?.querySelector<HTMLElement>('[data-modal-close]');
    (item ?? fallback)?.focus({ preventScroll: true });
}
const options = computed(() => [
    {
        value: 'gear' as const,
        label: `装备 ${sourceItems.value.filter((item) => item.kind === 'gear').length}`,
    },
    {
        value: 'pet' as const,
        label: `召唤兽 ${sourceItems.value.filter((item) => item.kind === 'pet').length}`,
    },
]);
const slots = computed(() => [
    { value: '', label: '全部部位' },
    ...GEAR_SLOTS.map((value) => ({ value, label: value })),
]);
const filtered = computed(() =>
    filterWarehouse(sourceItems.value, kind.value, kind.value === 'gear' ? slot.value : ''),
);
const PAGE_SIZE = 48;
const { pages, visible } = usePagination(filtered, PAGE_SIZE, page);
watch([kind, slot, page, editing, sourceItems], hideTip);
watch([kind, slot, stockState], () => {
    page.value = 1;
});
watch([page, kind, slot, stockState], () => {
    scrollTop.value = 0;
    if (content.value) content.value.scrollTop = 0;
});
const blocked = computed(
    () =>
        !viewLoaded.value ||
        !!viewError.value ||
        !!writeError.value ||
        pending.value > 0 ||
        tradePending.value ||
        characterPending.value ||
        (showsSales.value && (!!accounts.writeError.value || accounts.pending.value > 0)),
);
async function load() {
    try {
        await loadGameData();
        await loadWarehouse();
    } catch {
        loadError.value = '游戏规则读取失败，请重新读取仓库';
    }
}
async function loadSales() {
    try {
        await loadGameData();
        await loadAccounts();
    } catch {
        accounts.loadError.value = '游戏规则读取失败，请重新读取卖出记录';
    }
}
onMounted(() => {
    if (!loaded.value && !loadError.value) void load();
    if (props.mode === 'manage' && !accounts.loaded.value && !accounts.loadError.value)
        void loadSales();
    void nextTick(() => {
        const firstPage = stages.value?.firstElementChild;
        if (firstPage) focusPage(firstPage);
    });
});
function add() {
    if (blocked.value) return;
    returnItemId = '';
    direction.value = 'warehouse-forward';
    editing.value = { item: newWarehouseItem(kind.value), existing: false };
}
function open(item: ReadonlyWarehouseItem) {
    if (
        blocked.value ||
        soldIds.value.has(item.id) ||
        (owners.value.has(item.id) && !choosingTrade.value)
    )
        return;
    if (choosing.value) {
        if (props.mode === 'equip' && (kind.value === 'gear' || props.single)) {
            selectedIds.value = new Set([item.id]);
            return;
        }
        if (selectedIds.value.has(item.id)) selectedIds.value.delete(item.id);
        else selectedIds.value.add(item.id);
        return;
    }
    returnItemId = item.id;
    direction.value = 'warehouse-forward';
    editing.value = { item, existing: true };
}
function confirmSelection() {
    if (blocked.value) return;
    emit('pick', selected.value);
    emit('close');
}
</script>

<template>
    <ModalShell
        class="warehouse-dialog character-theme"
        :title="title"
        :width="glass ? 'var(--role-editor-width)' : EDITOR_W"
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
                    :draft-only="mode === 'draft'"
                    :initial-drafts="mode === 'draft' ? draftItems : undefined"
                    @close="back"
                    @saved="back"
                    @removed="back"
                    @confirm="
                        emit('draft', $event);
                        emit('close');
                    "
                />
                <div v-else key="list" class="warehouse-page">
                    <div class="warehouse-page-body warehouse-list-body">
                        <div class="warehouse-toolbar record-filters">
                            <div v-if="mode === 'manage'" class="warehouse-tabs">
                                <GlassSegmented
                                    v-if="glass"
                                    v-model:value="kind"
                                    class="lg-status-tabs"
                                    aria-label="仓库分类"
                                    data-size="compact"
                                >
                                    <GlassSegment
                                        v-for="option in options"
                                        :id="'warehouse-tab-' + option.value"
                                        :key="option.value"
                                        :value="option.value"
                                        :aria-controls="'warehouse-pane-' + option.value"
                                        >{{ option.label }}</GlassSegment
                                    >
                                </GlassSegmented>
                                <SteppedSlider
                                    v-else
                                    v-model="kind"
                                    :options="options"
                                    as="tab"
                                    prefix="warehouse"
                                    label="仓库分类"
                                />
                            </div>
                            <GroupHead v-else class="warehouse-pick-heading">
                                <span>{{ kind === 'gear' ? '仓库装备' : '仓库召唤兽' }}</span>
                            </GroupHead>
                            <PressButton
                                v-if="mode === 'manage' && !soldView"
                                data-warehouse-add
                                icon="add"
                                :text="kind === 'gear' ? '装备入仓' : '召唤兽入仓'"
                                :label="
                                    kind === 'gear' ? '新增或截图录入装备' : '新增或截图录入召唤兽'
                                "
                                :disabled="blocked"
                                @click="add"
                            />
                        </div>
                        <div
                            v-if="mode === 'manage' || kind === 'gear'"
                            class="warehouse-filters record-filters"
                            role="group"
                            aria-label="仓库筛选"
                        >
                            <GlassSegmented
                                v-if="mode === 'manage' && glass"
                                v-model:value="stockState"
                                class="lg-status-tabs warehouse-stock-filter"
                                aria-label="仓库状态"
                                data-size="compact"
                            >
                                <GlassSegment
                                    v-for="option in stockOptions"
                                    :key="option.value"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </GlassSegment>
                            </GlassSegmented>
                            <SegmentedPills
                                v-else-if="mode === 'manage'"
                                v-model="stockState"
                                :options="stockOptions"
                                label="仓库状态"
                                class="warehouse-stock-filter"
                            />
                            <SelectField
                                v-if="kind === 'gear'"
                                v-bind="selectProps"
                                v-model="slot"
                                :options="slots"
                                label="筛选装备部位"
                                :disabled="Boolean(gearSlot)"
                                class="warehouse-slot-filter"
                            />
                        </div>
                        <LoadNotice
                            :error="loadError"
                            :load="load"
                            :blocked="pending > 0 || !!writeError"
                        />
                        <SaveNotice :error="writeError" :pending="pending" @retry="store.retry" />
                        <template v-if="showsSales">
                            <LoadNotice
                                :error="accounts.loadError.value"
                                :load="loadSales"
                                :blocked="accounts.pending.value > 0 || !!accounts.writeError.value"
                            />
                            <SaveNotice
                                :error="accounts.writeError.value"
                                :pending="accounts.pending.value"
                                @retry="accounts.retry"
                            />
                        </template>
                        <p v-if="tradePending" class="note">
                            关联交易尚未保存，请返回账号页完成保存。
                        </p>
                        <div class="record-content-frame">
                            <section
                                :id="`warehouse-pane-${kind}`"
                                ref="content"
                                :aria-labelledby="
                                    mode === 'manage' ? `warehouse-tab-${kind}` : undefined
                                "
                                :aria-label="
                                    choosing
                                        ? mode === 'equip'
                                            ? '选择角色物品'
                                            : '选择交易物品，可多选'
                                        : undefined
                                "
                                :role="mode === 'manage' ? 'tabpanel' : 'region'"
                                class="warehouse-content"
                                @scroll="scroll"
                            >
                                <p v-if="viewError" class="record-empty">
                                    暂时无法读取{{ soldView ? '卖出物品' : '仓库' }}，请重试。
                                </p>
                                <p v-else-if="!viewLoaded" class="record-empty" role="status">
                                    正在读取{{ soldView ? '卖出物品' : '仓库' }}…
                                </p>
                                <div v-else-if="!filtered.length" class="warehouse-empty">
                                    <component :is="glass ? GlassEmptyState : 'p'">
                                        {{
                                            anyFilter
                                                ? '没有符合条件的物品'
                                                : soldView
                                                  ? `还没有售出的${kind === 'gear' ? '装备' : '召唤兽'}`
                                                  : kind === 'gear'
                                                    ? '还没有入仓装备'
                                                    : '还没有入仓召唤兽'
                                        }}
                                    </component>
                                    <span v-if="!soldView" class="muted">{{
                                        anyFilter
                                            ? '换个筛选条件试试'
                                            : choosing
                                              ? '暂无可选择的仓库物品'
                                              : '点击右上角入仓，支持截图识别和手动填写'
                                    }}</span>
                                </div>
                                <WarehouseItems
                                    v-else
                                    ref="grid"
                                    :items="visible"
                                    :owners="owners"
                                    :status="soldView ? 'sold' : 'stock'"
                                    :sold-ids="soldIds"
                                    :selectable="choosing"
                                    :allow-worn-selection="choosingTrade"
                                    :selected-ids="selectedIds"
                                    :label-prefix="
                                        choosing
                                            ? mode === 'equip'
                                                ? '选择穿戴'
                                                : tradeDirection === 'expense'
                                                  ? '选择买入'
                                                  : '选择卖出'
                                            : soldView
                                              ? '查看已售出'
                                              : '查看并修改'
                                    "
                                    :inspect-only="soldView"
                                    :disabled="blocked"
                                    @itemclick="open"
                                />
                            </section>
                        </div>
                    </div>
                    <footer
                        v-if="choosing || (viewLoaded && !viewError && filtered.length)"
                        class="modal-actions warehouse-list-actions record-footer-grid"
                    >
                        <span v-if="viewLoaded && !viewError" class="record-footer-count">
                            {{ filtered.length }} 件{{
                                choosing && selected.length
                                    ? ' · 已选 ' + selected.length + ' 件'
                                    : ''
                            }}
                        </span>
                        <RecordPager
                            v-if="viewLoaded && !viewError"
                            v-model="page"
                            :pages="pages"
                            label="仓库分页"
                        />
                        <PressButton
                            v-if="choosing"
                            class="record-footer-action"
                            text="确定选择"
                            :label="mode === 'equip' ? '确认选择角色物品' : '确认选择交易物品'"
                            :disabled="blocked || (mode === 'equip' && !selected.length)"
                            @click="confirmSelection"
                        />
                    </footer>
                </div>
            </Transition>
        </div>
    </ModalShell>
</template>

<style scoped src="./warehouse.css"></style>

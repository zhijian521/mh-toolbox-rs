<script setup lang="ts">
/** 自包含仓库入口：调用方只控制开关，筛选、编辑与持久化均留在模块内。 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import RecordPager from '../../components/RecordPager.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import WarehouseItems from './WarehouseItems.vue';
import { GEAR_SLOTS } from '../characters/gear';
import { EDITOR_H, EDITOR_W } from '../characters/editor-metrics';
import { loadGameData } from '../../services/game-data';
import {
    filterWarehouse,
    newWarehouseItem,
    type ReadonlyWarehouseItem,
    type WarehouseKind,
    type WarehouseItem,
} from './warehouse';
import { loadWarehouse, useWarehouse } from './warehouse-store';
import { loadAccounts, useAccounts } from '../accounts/accounts-store';
import { soldWarehouseItems } from '../accounts/account-assets';
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
    }>(),
    { mode: 'manage', assetKind: 'gear' },
);
const emit = defineEmits<{
    close: [];
    pick: [items: readonly ReadonlyWarehouseItem[]];
    draft: [items: WarehouseItem[]];
}>();
const store = useWarehouse();
const { items, owners, loaded, loadError, writeError, pending, tradePending, characterPending } =
    store;
const choosing = computed(() => props.mode === 'pick' || props.mode === 'equip');
const accounts = useAccounts();
const stockState = ref<'all' | 'equipped' | 'stock' | 'sold'>('all');
const stockOptions = [
    { value: 'all' as const, label: '全部' },
    { value: 'equipped' as const, label: '已穿戴' },
    { value: 'stock' as const, label: '未穿戴' },
    { value: 'sold' as const, label: '已卖出' },
];
const soldView = computed(() => props.mode === 'manage' && stockState.value === 'sold');
const sourceItems = computed(() => {
    if (soldView.value) return soldWarehouseItems(accounts.entries.value, items.value);
    return items.value.filter((item) => {
        const equipped = owners.value.has(item.id);
        if (choosing.value) return !equipped && !props.excludedIds?.includes(item.id);
        return (
            stockState.value === 'all' || (stockState.value === 'equipped' ? equipped : !equipped)
        );
    });
});
const viewError = computed(
    () => loadError.value || (soldView.value ? accounts.loadError.value : ''),
);
const viewLoaded = computed(() => loaded.value && (!soldView.value || accounts.loaded.value));
const kind = ref<WarehouseKind>(props.assetKind);
const keyword = ref('');
const slot = ref(props.gearSlot ?? '');
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
const title = computed(() =>
    props.mode === 'equip'
        ? `从仓库选择${kind.value === 'gear' ? '装备' : '召唤兽'}`
        : props.mode === 'pick'
          ? `选择卖出的${kind.value === 'gear' ? '装备' : '召唤兽'}`
          : props.mode === 'draft'
            ? `录入买入的${kind.value === 'gear' ? '装备' : '召唤兽'}`
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
                .querySelector<HTMLInputElement>('.gear-name-input, [aria-label="召唤兽名称"]')
                ?.focus({ preventScroll: true });
        }
        return;
    }
    const item = Array.from(element.querySelectorAll<HTMLElement>('.warehouse-item')).find(
        (one) => one.dataset.assetId === returnItemId,
    );
    const fallback =
        returnItemId !== null
            ? element.querySelector<HTMLElement>('[data-warehouse-add]')
            : element.querySelector<HTMLElement>('.warehouse-search');
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
    filterWarehouse(
        sourceItems.value,
        kind.value,
        keyword.value,
        kind.value === 'gear' ? slot.value : '',
    ),
);
const PAGE_SIZE = 48;
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const visible = computed(() =>
    filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);
watch([kind, keyword, slot, page, editing, sourceItems], hideTip);
watch([kind, keyword, slot, stockState], () => {
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
const blocked = computed(
    () =>
        !viewLoaded.value ||
        !!viewError.value ||
        !!writeError.value ||
        pending.value > 0 ||
        tradePending.value ||
        characterPending.value ||
        (soldView.value && (!!accounts.writeError.value || accounts.pending.value > 0)),
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
    if (blocked.value || soldView.value || owners.value.has(item.id)) return;
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
                    <div class="warehouse-page-body">
                        <div class="warehouse-toolbar">
                            <div v-if="mode === 'manage'" class="warehouse-tabs">
                                <SteppedSlider
                                    v-model="kind"
                                    :options="options"
                                    as="tab"
                                    prefix="warehouse"
                                    label="仓库分类"
                                />
                                <SegmentedPills
                                    v-model="stockState"
                                    :options="stockOptions"
                                    label="仓库状态"
                                />
                            </div>
                            <div v-else class="group-head warehouse-pick-heading">
                                <span class="section-mark" aria-hidden="true" />
                                <span>{{ kind === 'gear' ? '仓库装备' : '仓库召唤兽' }}</span>
                            </div>
                            <PressButton
                                v-if="mode === 'manage' && !soldView"
                                data-warehouse-add
                                icon="add"
                                :text="kind === 'gear' ? '装备入仓' : '召唤兽入仓'"
                                :label="
                                    kind === 'gear' ? '新增或截图录入装备' : '新增或截图录入召唤兽'
                                "
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
                                :placeholder="
                                    kind === 'gear' ? '搜索名称、特效、备注' : '搜索名称、技能'
                                "
                            />
                            <SelectField
                                v-if="kind === 'gear'"
                                v-model="slot"
                                :options="slots"
                                label="筛选装备部位"
                                :disabled="Boolean(gearSlot)"
                                class="warehouse-slot-filter"
                            />
                            <span class="muted warehouse-count">
                                {{ filtered.length }} {{ kind === 'gear' ? '件装备' : '只召唤兽' }}
                            </span>
                        </div>
                        <LoadNotice
                            :error="loadError"
                            :load="load"
                            :blocked="pending > 0 || !!writeError"
                        />
                        <SaveNotice :error="writeError" :pending="pending" @retry="store.retry" />
                        <template v-if="soldView">
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
                            <p v-if="viewError" class="empty-note">
                                暂时无法读取{{ soldView ? '卖出物品' : '仓库' }}，请重试。
                            </p>
                            <p v-else-if="!viewLoaded" class="empty-note" role="status">
                                正在读取{{ soldView ? '卖出物品' : '仓库' }}…
                            </p>
                            <div v-else-if="!filtered.length" class="warehouse-empty">
                                <p>
                                    {{
                                        keyword || (kind === 'gear' && slot)
                                            ? '没有符合条件的物品'
                                            : soldView
                                              ? `还没有卖出的${kind === 'gear' ? '装备' : '召唤兽'}`
                                              : kind === 'gear'
                                                ? '还没有入仓装备'
                                                : '还没有入仓召唤兽'
                                    }}
                                </p>
                                <span v-if="!soldView" class="muted">{{
                                    keyword || (kind === 'gear' && slot)
                                        ? '换个关键词或筛选条件试试'
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
                                :selectable="choosing"
                                :selected-ids="selectedIds"
                                :label-prefix="
                                    choosing
                                        ? mode === 'equip'
                                            ? '选择穿戴'
                                            : '选择卖出'
                                        : soldView
                                          ? '查看已卖出'
                                          : '查看并修改'
                                "
                                :inspect-only="soldView"
                                :disabled="blocked"
                                @itemclick="open"
                            />
                        </section>
                    </div>
                    <footer class="modal-actions">
                        <span
                            v-if="choosing"
                            class="warehouse-selected-count muted"
                            aria-live="polite"
                        >
                            已选 {{ selected.length }} {{ kind === 'gear' ? '件装备' : '只召唤兽' }}
                        </span>
                        <RecordPager v-model="page" :pages="pages" />
                        <PressButton
                            data-modal-cancel
                            :text="choosing ? '取消' : '关闭'"
                            label="关闭仓库"
                            @click="emit('close')"
                        />
                        <PressButton
                            v-if="choosing"
                            text="确定选择"
                            :label="mode === 'equip' ? '确认选择角色物品' : '确认选择交易物品'"
                            seal
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

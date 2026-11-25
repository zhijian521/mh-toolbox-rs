<script lang="ts">
import { gameDataReady, loadGameData, quickItems } from '../../services/game-data';
import { ensureGlassPricesLoaded, usePrices } from './prices-store';

let catalogRequest: Promise<void> | undefined;

function loadCatalog() {
    catalogRequest ??= loadGameData()
        .then(async () => {
            if (!gameDataReady.value) throw new Error('游戏分类数据加载失败');
            await ensureGlassPricesLoaded();
        })
        .finally(() => {
            catalogRequest = undefined;
        });
    return catalogRequest;
}
</script>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import { GlassButton, GlassCard, GlassSearch } from '../../components/liquid-glass';
import GlassDialog from '../../components/liquid-glass/GlassDialog.vue';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import { lazyDialog } from '../../components/lazy-dialog';
import { confirmDiscardDrafts, useDraftGuard } from '../../composables/use-draft-guard';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { moneyText } from '../../services/format';
import PriceActionsMenu from './PriceActionsMenu.vue';
import LiquidPriceCard from './LiquidPriceCard.vue';
import { usePriceViewState } from './price-view-state';
import { priceCategoryGroups } from './prices-catalog';
import { filterItems, type PriceItemDraft, type PricePoint, type PricePointDraft, type ReadonlyPriceItem } from './prices';
import type { PriceWrite } from './prices-store';

type PriceDialog =
    | { kind: 'history'; itemId: string }
    | { kind: 'new-item' }
    | { kind: 'edit-item'; itemId: string }
    | { kind: 'remove'; itemId: string; name: string; count: number; point?: PricePoint }
    | { kind: 'price'; itemId: string; point?: PricePoint; fromHistory: boolean };

function dialogStatus(failed: boolean, retry: () => void) {
    return h('div', { class: 'price-history-status' }, [
        h('p', { role: 'status' }, failed ? '加载失败。' : '正在加载…'),
        failed ? h(GlassButton, { size: 'small', onClick: retry }, () => '重试') : null,
        h(GlassButton, { size: 'small', variant: 'plain', onClick: closeEditor }, () => '取消'),
    ]);
}

const PriceHistory = lazyDialog(() => import('./LiquidPriceHistory.vue'), dialogStatus);
const PriceEditor = lazyDialog(() => import('./LiquidPriceEditor.vue'), dialogStatus);
const {
    items,
    loaded,
    loadError,
    writeError,
    pending,
    addItem,
    saveItem,
    removeItem,
    removePoint,
    addPoint,
    savePoint,
    flush,
    retry,
} = usePrices();
const submit = usePersistedSubmit(flush, retry);
const preparing = ref(false);
const saving = computed(() => preparing.value || submit.saving.value);
const canEdit = computed(
    () => loaded.value && !loadError.value && !writeError.value && !pending.value,
);
const editorError = ref('');
const editorVersion = ref(0);
let editorTrigger: HTMLElement | undefined;
const loading = ref(false);
const catalogError = ref('');
const { keyword, category, sub, scroll } = usePriceViewState();
const page = ref<HTMLElement | null>(null);
const hasFilters = computed(() => Boolean(keyword.value || category.value || sub.value));
const search = ref<{ el: HTMLElement | null } | null>(null);
const addButton = ref<{ el: HTMLElement | null } | null>(null);
const cancelRemoval = ref<{ el: HTMLElement | null } | null>(null);
const sheetOpen = ref(false);
const editorDirty = ref(false);
const hasUnsavedDraft = computed(
    () => sheetOpen.value && editorDirty.value && !submit.action.value,
);
const dialog = ref<PriceDialog>();
const historyPage = ref(1);
const historyChild = computed(() => {
    const active = dialog.value;
    return (
        (active?.kind === 'remove' && !!active.point) ||
        (active?.kind === 'price' && active.fromHistory)
    );
});
const historySheet = computed(() => dialog.value?.kind === 'history' || historyChild.value);
const dialogLabel = computed(() => {
    switch (dialog.value?.kind) {
        case 'history':
            return '物价历史';
        case 'new-item':
            return '新增物品';
        case 'edit-item':
            return '编辑物品';
        case 'remove':
            return dialog.value.point ? '删除价格记录' : '删除物品';
        default:
            return dialog.value?.point ? '编辑价格记录' : '更新价格';
    }
});
const historyHeading = ref<HTMLHeadingElement | null>(null);
const error = computed(() => catalogError.value || loadError.value);
const categories = computed(() => priceCategoryGroups(items.value));
const subcategories = computed(
    () => categories.value.find((option) => option.value === category.value)?.children ?? [],
);
const selectedItem = computed(() => {
    const active = dialog.value;
    return active && 'itemId' in active
        ? items.value.find((item) => item.id === active.itemId)
        : undefined;
});
const matchingItems = computed(() =>
    filterItems(items.value, { keyword: keyword.value, category: category.value, sub: sub.value }),
);
// 当前路由拥有独立的 main；待列表完成布局后恢复，避免在加载卡片上被截为 0。
const scrollHost = computed(() =>
    loaded.value && !loading.value && !error.value ? page.value?.parentElement : null,
);
watch(scrollHost, (host) => {
    if (host) host.scrollTop = scroll.value.top;
}, { flush: 'post' });
watch([keyword, category, sub], () => {
    scroll.value.top = 0;
    if (scrollHost.value) scrollHost.value.scrollTop = 0;
});
watch(subcategories, (options) => {
    if (sub.value && !options.some((option) => option.value === sub.value)) sub.value = '';
});

async function refresh() {
    if (loading.value) return;
    loading.value = true;
    catalogError.value = '';
    try {
        await loadCatalog();
    } catch {
        catalogError.value = '游戏分类数据加载失败。';
    } finally {
        loading.value = false;
    }
}

function clearFilters() {
    keyword.value = '';
    category.value = '';
    sub.value = '';
}

function resetFilters(event: MouseEvent) {
    clearFilters();
    if (event.detail === 0) search.value?.el?.focus({ preventScroll: true });
}

function openHistory(itemId: string, page = 1) {
    historyPage.value = page;
    dialog.value = { kind: 'history', itemId };
    sheetOpen.value = true;
}

function openEditor(next: Exclude<PriceDialog, { kind: 'history' }>) {
    if (!canEdit.value || saving.value) return;
    editorError.value = '';
    editorDirty.value = false;
    submit.reset();
    const trigger = document.activeElement;
    editorTrigger = trigger instanceof HTMLElement ? trigger : undefined;
    editorVersion.value += 1;
    dialog.value = next;
    sheetOpen.value = true;
}

function closeEditor() {
    editorDirty.value = false;
    const active = dialog.value;
    if (active && 'itemId' in active && historyChild.value && selectedItem.value) {
        openHistory(active.itemId, historyPage.value);
        void nextTick(() => historyHeading.value?.focus({ preventScroll: true }));
    } else {
        sheetOpen.value = false;
        const trigger = editorTrigger;
        void nextTick(() =>
            (trigger?.isConnected ? trigger : addButton.value?.el)?.focus({ preventScroll: true }),
        );
    }
}

// 系统关窗也要看到准备联动收益账的阶段，此时还没有写队列可等待。
const { requestClose } = useDraftGuard(
    () => hasUnsavedDraft.value,
    () => saving.value,
    closeEditor,
);

async function onDialogOpenChange(open: boolean) {
    if (sheetOpen.value === open) return;
    if (!open && hasUnsavedDraft.value) {
        await requestClose();
        return;
    }
    sheetOpen.value = open;
    if (open || !historyChild.value || !selectedItem.value) return;
    // 遮罩和下拉手势已收起底层 sheet。先同步关闭状态，再在同一帧返回原历史页。
    await nextTick();
    closeEditor();
}

function onDialogEscape(event: KeyboardEvent) {
    if (event.isComposing || (!historyChild.value && dialog.value?.kind !== 'remove')) return;
    const inPopup = event.composedPath().some(
        (el) => el instanceof Element && el.matches('glass-menu[open], [data-calendar-open]'),
    );
    if (inPopup) return;
    event.preventDefault();
    event.stopPropagation();
    void requestClose();
}

function openHistoryPrice(point?: PricePoint) {
    const active = dialog.value;
    if (active?.kind === 'history') {
        openEditor({ kind: 'price', itemId: active.itemId, point, fromHistory: true });
    }
}

function askRemoval(item: ReadonlyPriceItem, point?: PricePoint) {
    if (!canEdit.value || saving.value) return;
    openEditor({
        kind: 'remove',
        itemId: item.id,
        name: item.name,
        count: item.points.length,
        point,
    });
    void nextTick(() => cancelRemoval.value?.el?.focus({ preventScroll: true }));
}

function askHistoryPointRemoval(point: PricePoint) {
    const item = selectedItem.value;
    if (item) askRemoval(item, point);
}

function confirmRemoval() {
    const active = dialog.value;
    if (active?.kind !== 'remove') return;
    void saveChange([active.name], () =>
        active.point ? removePoint(active.itemId, active.point.id) : removeItem(active.itemId),
    );
}

async function prepareLinkedPrice(names: string[]) {
    const affected = names.map((name) => name.trim());
    if (!quickItems().fixed.some((item) => affected.includes(item.name))) return true;
    const { ensureGlassIncomeLoaded, useIncome } = await import('../income/income-store');
    const income = useIncome();
    await ensureGlassIncomeLoaded();
    if (income.loaded.value && !income.loadError.value) return true;
    editorError.value = '收益账读取失败，暂时无法保存与固定单价关联的物品。';
    return false;
}

async function saveChange(names: string[], apply: () => PriceWrite) {
    if (saving.value || (!submit.action.value && !canEdit.value)) return;
    editorError.value = '';
    preparing.value = true;
    try {
        if (!submit.action.value && !(await prepareLinkedPrice(names))) return;
        const ok = await submit.run('price', () => {
            const result = apply();
            editorError.value = result.ok ? '' : result.error;
            return result.ok;
        });
        if (!ok) return;
        const active = dialog.value;
        if (active?.kind === 'new-item') clearFilters();
        closeEditor();
    } catch (cause) {
        console.error('保存物价失败', cause);
        editorError.value = '保存失败，请重试。';
    } finally {
        preparing.value = false;
    }
}

function onAddItem(draft: PriceItemDraft, initialPrice: number) {
    void saveChange([draft.name], () => addItem(draft, initialPrice));
}

function onUpdateItem(draft: PriceItemDraft) {
    const item = selectedItem.value;
    if (dialog.value?.kind !== 'edit-item' || !item) return;
    void saveChange([item.name, draft.name], () => saveItem(item.id, draft));
}

function onSavePoint(draft: PricePointDraft) {
    const active = dialog.value;
    if (active?.kind !== 'price' || !selectedItem.value) return;
    void saveChange([selectedItem.value.name], () =>
        active.point
            ? savePoint(active.itemId, active.point.id, draft)
            : addPoint(active.itemId, draft),
    );
}

async function retryWrites() {
    if (saving.value) return;
    preparing.value = true;
    try {
        await retry();
    } finally {
        preparing.value = false;
    }
}

onBeforeRouteLeave(async () => {
    if (!(await confirmDiscardDrafts())) return false;
    if (scrollHost.value) scroll.value.top = scrollHost.value.scrollTop;
    return true;
});

onMounted(() => {
    if (!loaded.value || loadError.value) void refresh();
});
</script>

<template>
    <section ref="page" class="liquid-prices" aria-labelledby="liquid-prices-title">
        <header class="price-page-header">
            <h1 id="liquid-prices-title">物价</h1>
            <GlassButton
                ref="addButton"
                class="price-add"
                size="small"
                variant="prominent"
                aria-label="新增物品"
                aria-haspopup="dialog"
                title="新增物品"
                :disabled="!canEdit || saving"
                @click="openEditor({ kind: 'new-item' })"
            >
                <AppIcon name="add" />新增物品
            </GlassButton>
        </header>

        <GlassCard v-if="loading || error || !loaded" class="price-state" :radius="18">
            <p v-if="loading || !error" role="status">正在读取物价…</p>
            <template v-else>
                <p role="alert">{{ error }}</p>
                <GlassButton size="small" @click="refresh">重试</GlassButton>
            </template>
        </GlassCard>

        <template v-else>
            <GlassCard v-if="writeError" class="price-state price-write-error" :radius="15">
                <p role="alert">{{ writeError }}</p>
                <GlassButton size="small" :disabled="saving" @click="retryWrites">
                    重试保存
                </GlassButton>
            </GlassCard>
            <div
                v-if="items.length"
                class="price-filters lg-form-fields"
                role="group"
                aria-label="筛选物价"
            >
                <GlassSearch
                    ref="search"
                    v-model:value="keyword"
                    class="lg-price-search"
                    aria-label="搜索物品"
                    placeholder="搜索物品、分类或备注"
                />
                <div class="price-filter-actions">
                    <GlassSelect
                        v-model="category"
                        class="lg-category-filter"
                        label="一级分类"
                        hide-label
                        :options="[{ value: '', label: '全部分类' }, ...categories]"
                        @update:model-value="sub = ''"
                    />
                    <GlassSelect
                        v-if="subcategories.length"
                        v-model="sub"
                        class="lg-category-filter"
                        label="二级分类"
                        hide-label
                        :options="[{ value: '', label: '全部子分类' }, ...subcategories]"
                    />
                    <GlassButton
                        v-if="hasFilters"
                        class="price-reset"
                        size="small"
                        shape="circle"
                        aria-label="重置筛选"
                        title="重置筛选"
                        @click="resetFilters"
                    >
                        <AppIcon name="close" />
                    </GlassButton>
                </div>
            </div>

            <div v-if="matchingItems.length" class="price-grid">
                <LiquidPriceCard
                    v-for="item in matchingItems"
                    :key="item.id"
                    :item="item"
                    :edit-disabled="!canEdit || saving"
                    @history="openHistory(item.id)"
                    @record="openEditor({ kind: 'price', itemId: item.id, fromHistory: false })"
                >
                    <template #actions>
                        <PriceActionsMenu
                            :label="`${item.name}的物品操作`"
                            :disabled="!canEdit || saving"
                            @edit="openEditor({ kind: 'edit-item', itemId: item.id })"
                            @remove="askRemoval(item)"
                        />
                    </template>
                </LiquidPriceCard>
            </div>
            <GlassEmptyState v-else class="price-empty">
                {{ items.length ? '没有符合条件的物品' : '还没有物品，点击右上角新增' }}
            </GlassEmptyState>
        </template>

        <GlassDialog
            :open="sheetOpen"
            @update:open="onDialogOpenChange"
            class="price-history-sheet"
            :bottom="historySheet"
            :detents="dialog?.kind === 'remove' ? '208' : historySheet ? '536' : '65% large'"
            :no-dismiss="saving || dialog?.kind === 'remove'"
            :guard-dismiss="hasUnsavedDraft"
            @keydown.esc.capture="onDialogEscape"
            :class="{ 'is-history': dialog?.kind === 'history' }"
            :label="dialogLabel"
        >
            <template v-if="dialog?.kind === 'history'">
                <header class="price-history-header">
                    <h2 ref="historyHeading" tabindex="-1">
                        {{ selectedItem?.name || '物价历史' }}
                    </h2>
                    <div class="history-tools" @pointerdown.stop>
                        <GlassButton size="small" variant="plain" @click="sheetOpen = false"
                            >关闭</GlassButton
                        >
                    </div>
                </header>
                <template v-if="selectedItem">
                    <p v-if="selectedItem.note" class="price-item-note lg-caption">
                        {{ selectedItem.note }}
                    </p>
                    <PriceHistory
                        :key="selectedItem.id"
                        v-model:page="historyPage"
                        :item="selectedItem"
                        :edit-disabled="!canEdit || saving"
                        @edit="openHistoryPrice"
                        @remove="askHistoryPointRemoval"
                    />
                </template>
                <p v-else class="lg-caption">这件物品已不存在。</p>
            </template>
            <section v-else-if="dialog?.kind === 'remove'" class="price-remove" @pointerdown.stop>
                <h2>{{ dialogLabel }}</h2>
                <p v-if="dialog.point">
                    确定删除「{{ dialog.name }}」在 {{ dialog.point.date }} 的这笔
                    {{ moneyText(dialog.point.price) }} 记录吗？
                </p>
                <p v-else>
                    确定删除「{{ dialog.name }}」{{
                        dialog.count ? '及全部 ' + dialog.count + ' 条价格记录' : ''
                    }}吗？
                </p>
                <p v-if="editorError || writeError" role="alert">{{ editorError || writeError }}</p>
                <footer>
                    <GlassButton
                        ref="cancelRemoval"
                        size="small"
                        variant="plain"
                        :disabled="saving"
                        @click="requestClose"
                        >{{ submit.action.value ? '关闭' : '取消' }}</GlassButton
                    >
                    <GlassButton
                        class="confirm-removal"
                        size="small"
                        :disabled="saving"
                        @click="confirmRemoval"
                        >{{
                            saving ? '正在保存…' : submit.action.value ? '重试保存' : '确认删除'
                        }}</GlassButton
                    >
                </footer>
            </section>
            <PriceEditor
                v-else-if="
                    dialog?.kind === 'new-item' ||
                    ((dialog?.kind === 'price' || dialog?.kind === 'edit-item') && selectedItem)
                "
                :key="editorVersion"
                :item="selectedItem"
                :edit-item="dialog.kind === 'edit-item'"
                :prefill-current="dialog.kind === 'price' && !dialog.point"
                :point="dialog.kind === 'price' ? dialog.point : undefined"
                :categories="categories"
                :active="sheetOpen"
                :saving="saving"
                :locked="saving || submit.locked.value"
                :retrying="!!submit.action.value"
                :error="editorError || writeError"
                @add="onAddItem"
                @update="onUpdateItem"
                @save="onSavePoint"
                @cancel="requestClose"
                @update:dirty="editorDirty = $event"
            />
            <template v-else-if="dialog?.kind === 'price' || dialog?.kind === 'edit-item'">
                <p class="lg-caption">这件物品已不存在。</p>
                <GlassButton size="small" @click="closeEditor">关闭</GlassButton>
            </template>
        </GlassDialog>
    </section>
</template>

<style scoped src="./liquid-prices.css"></style>

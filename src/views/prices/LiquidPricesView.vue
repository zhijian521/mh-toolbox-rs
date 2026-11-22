<script lang="ts">
import { gameDataReady, loadGameData, quickItems } from '../../services/game-data';
import { loadPrices, usePrices } from './prices-store';

let catalogRequest: Promise<void> | undefined;

function loadCatalog() {
    catalogRequest ??= loadGameData()
        .then(async () => {
            if (!gameDataReady.value) throw new Error('游戏分类数据加载失败');
            await loadPrices();
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
import { useDraftGuard } from '../../composables/use-draft-guard';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import LiquidPriceCard from './LiquidPriceCard.vue';
import { usePriceViewState } from './price-view-state';
import { priceCategoryGroups } from './prices-catalog';
import { filterItems, type PriceItemDraft, type PricePoint, type PricePointDraft } from './prices';
import type { PriceWrite } from './prices-store';

type PriceDialog =
    | { kind: 'history'; itemId: string }
    | { kind: 'new-item' }
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
const { keyword, category, sub } = usePriceViewState();
const hasFilters = computed(() => Boolean(keyword.value || category.value || sub.value));
const search = ref<{ el: HTMLElement | null } | null>(null);
const sheetOpen = ref(false);
const dialog = ref<PriceDialog>();
const historyPage = ref(1);
const historySheet = computed(() => {
    const active = dialog.value;
    return active?.kind === 'history' || (active?.kind === 'price' && active.fromHistory);
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

function openEditor(next: Extract<PriceDialog, { kind: 'new-item' | 'price' }>) {
    if (!canEdit.value || saving.value) return;
    editorError.value = '';
    submit.reset();
    const trigger = document.activeElement;
    editorTrigger = trigger instanceof HTMLElement ? trigger : undefined;
    editorVersion.value += 1;
    dialog.value = next;
    sheetOpen.value = true;
}

function closeEditor() {
    const active = dialog.value;
    if (active?.kind === 'price' && active.fromHistory) {
        openHistory(active.itemId, historyPage.value);
        void nextTick(() => historyHeading.value?.focus({ preventScroll: true }));
    } else {
        sheetOpen.value = false;
        const trigger = editorTrigger;
        void nextTick(() => trigger?.focus({ preventScroll: true }));
    }
}

// 系统关窗也要看到准备联动收益账的阶段，此时还没有写队列可等待。
const { requestClose } = useDraftGuard(
    () => false,
    () => saving.value,
    closeEditor,
);

function onHistoryEscape(event: KeyboardEvent) {
    const active = dialog.value;
    if (active?.kind !== 'price' || !active.fromHistory || event.isComposing) return;
    if (event.composedPath().some((el) => el instanceof Element && el.matches('glass-menu[open]')))
        return;
    event.preventDefault();
    event.stopPropagation();
    void requestClose();
}

function editHistoryPoint(point: PricePoint) {
    const active = dialog.value;
    if (active?.kind === 'history') {
        openEditor({ kind: 'price', itemId: active.itemId, point, fromHistory: true });
    }
}

async function prepareLinkedPrice(name: string) {
    if (!quickItems().fixed.some((item) => item.name === name.trim())) return true;
    const { loadIncome, useIncome } = await import('../income/income-store');
    const income = useIncome();
    if (!income.loaded.value || income.loadError.value) {
        await loadIncome({ reconcilePrices: false });
    }
    if (income.loaded.value && !income.loadError.value) return true;
    editorError.value = '收益账读取失败，暂时无法保存与固定单价关联的物品。';
    return false;
}

async function saveChange(name: string, apply: () => PriceWrite) {
    if (saving.value || (!submit.action.value && !canEdit.value)) return;
    editorError.value = '';
    preparing.value = true;
    try {
        if (!submit.action.value && !(await prepareLinkedPrice(name))) return;
        const ok = await submit.run('price', () => {
            const result = apply();
            editorError.value = result.ok ? '' : result.error;
            return result.ok;
        });
        if (!ok) return;
        if (dialog.value?.kind === 'new-item') clearFilters();
        closeEditor();
    } catch (cause) {
        console.error('保存物价失败', cause);
        editorError.value = '保存失败，请重试。';
    } finally {
        preparing.value = false;
    }
}

function onAddItem(draft: PriceItemDraft, initialPrice: number) {
    void saveChange(draft.name, () => addItem(draft, initialPrice));
}

function onSavePoint(draft: PricePointDraft) {
    const active = dialog.value;
    if (active?.kind !== 'price' || !selectedItem.value) return;
    void saveChange(selectedItem.value.name, () =>
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

onBeforeRouteLeave(() => !saving.value);

onMounted(() => {
    if (!loaded.value || loadError.value) void refresh();
});
</script>

<template>
    <section class="liquid-prices" aria-labelledby="liquid-prices-title">
        <header class="price-page-header">
            <h1 id="liquid-prices-title">物价</h1>
            <GlassButton
                class="price-add"
                size="small"
                shape="circle"
                aria-label="新增物品"
                aria-haspopup="dialog"
                title="新增物品"
                :disabled="!canEdit || saving"
                @click="openEditor({ kind: 'new-item' })"
            >
                <AppIcon name="add" />
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
            <div v-if="items.length" class="price-filters" role="group" aria-label="筛选物价">
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
                        :options="[{ value: '', label: '全部分类' }, ...categories]"
                        @update:model-value="sub = ''"
                    />
                    <GlassSelect
                        v-if="subcategories.length"
                        v-model="sub"
                        class="lg-category-filter"
                        label="二级分类"
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
                />
            </div>
            <GlassEmptyState v-else class="price-empty" />
        </template>

        <GlassDialog
            v-model:open="sheetOpen"
            class="price-history-sheet"
            :bottom="historySheet"
            :detents="historySheet ? '536' : '65% large'"
            :no-dismiss="saving"
            @keydown.esc.capture="onHistoryEscape"
            :class="{ 'is-history': dialog?.kind === 'history' }"
            :label="
                dialog?.kind === 'history'
                    ? '物价历史'
                    : dialog?.kind === 'new-item'
                      ? '新增物品'
                      : '编辑物价'
            "
        >
            <template v-if="dialog?.kind === 'history'">
                <header class="price-history-header">
                    <h2 ref="historyHeading" tabindex="-1">
                        {{ selectedItem?.name || '物价历史' }}
                    </h2>
                    <GlassButton size="small" @click="sheetOpen = false">关闭</GlassButton>
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
                        @edit="editHistoryPoint"
                    />
                </template>
                <p v-else class="lg-caption">这件物品已不存在。</p>
            </template>
            <PriceEditor
                v-else-if="
                    dialog?.kind === 'new-item' || (dialog?.kind === 'price' && selectedItem)
                "
                :key="editorVersion"
                :item="selectedItem"
                :point="dialog.kind === 'price' ? dialog.point : undefined"
                :categories="categories"
                :active="sheetOpen"
                :saving="saving"
                :locked="saving || submit.locked.value"
                :retrying="!!submit.action.value"
                :error="editorError || writeError"
                @add="onAddItem"
                @save="onSavePoint"
                @cancel="requestClose"
            />
            <template v-else-if="dialog?.kind === 'price'">
                <p class="lg-caption">这件物品已不存在。</p>
                <GlassButton size="small" @click="closeEditor">关闭</GlassButton>
            </template>
        </GlassDialog>
    </section>
</template>

<style scoped src="./liquid-prices.css"></style>

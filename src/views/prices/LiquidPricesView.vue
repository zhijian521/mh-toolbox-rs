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
import { GlassButton, GlassCard, GlassSearch, GlassSheet } from '../../components/liquid-glass';
import { lazyDialog } from '../../components/lazy-dialog';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { moneyText } from '../../services/format';
import { usePriceViewState } from './price-view-state';
import { priceCategoryGroups } from './prices-catalog';
import {
    currentPoint,
    filterItems,
    priceBadge,
    sortedPoints,
    updateSummary,
    type PriceItemDraft,
    type PricePoint,
    type PricePointDraft,
} from './prices';
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
const { items, loaded, loadError, writeError, pending, addItem, addPoint, savePoint, flush, retry } =
    usePrices();
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
const sheetOpen = ref(false);
const dialog = ref<PriceDialog>();
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
const cards = computed(() =>
    matchingItems.value.map((item) => {
        const points = sortedPoints(item);
        const current = currentPoint(item, points);
        return {
            item,
            current,
            amount: current ? moneyText(current.price) : '未记价',
            change: priceBadge(item, points),
            summary: current ? updateSummary(item, points) : '暂无记录',
        };
    }),
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

function openHistory(itemId: string) {
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
        openHistory(active.itemId);
        void nextTick(() => historyHeading.value?.focus({ preventScroll: true }));
    } else {
        sheetOpen.value = false;
        const trigger = editorTrigger;
        void nextTick(() => trigger?.focus({ preventScroll: true }));
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
            <div class="price-filters" role="group" aria-label="筛选物价">
                <GlassSearch
                    v-model:value="keyword"
                    class="price-search"
                    aria-label="搜索物品"
                    placeholder="搜索物品、分类或备注"
                />
                <label class="price-filter">
                    <span>一级分类</span>
                    <select v-model="category" @change="sub = ''">
                        <option value="">全部分类</option>
                        <option v-for="option in categories" :key="option.value" :value="option.value">
                            {{ option.label }}
                        </option>
                    </select>
                </label>
                <label class="price-filter">
                    <span>二级分类</span>
                    <select v-model="sub" :disabled="!subcategories.length">
                        <option value="">全部子分类</option>
                        <option
                            v-for="option in subcategories"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                </label>
            </div>

            <div v-if="cards.length" class="price-grid">
                <GlassCard
                    v-for="card in cards"
                    :key="card.item.id"
                    class="price-card"
                    :data-category="card.item.category"
                    :radius="15"
                >
                    <header class="price-card-header">
                        <h2>{{ card.item.name }}</h2>
                        <p class="price-muted">
                            <span class="price-category">{{ card.item.category }}</span>
                            <template v-if="card.item.sub">
                                / <span class="price-subcategory">{{ card.item.sub }}</span>
                            </template>
                        </p>
                    </header>
                    <div class="price-quote">
                        <span v-if="card.current" class="price-value">{{ card.amount }}</span>
                        <span v-else class="price-unpriced">{{ card.amount }}</span>
                        <span
                            v-if="card.change"
                            class="price-change"
                            :data-tone="card.change.tone"
                            :title="card.change.title"
                        >
                            {{ card.change.text }}
                        </span>
                    </div>
                    <p v-if="card.item.note" class="price-note price-muted" :title="card.item.note">
                        {{ card.item.note }}
                    </p>
                    <footer class="price-card-footer">
                        <span class="price-muted" :title="card.current?.date">{{ card.summary }}</span>
                        <div class="price-card-actions">
                            <GlassButton
                                size="small"
                                variant="plain"
                                class="price-history-trigger"
                                aria-haspopup="dialog"
                                :aria-label="`查看${card.item.name}的价格历史`"
                                @click="openHistory(card.item.id)"
                            >
                                历史
                            </GlassButton>
                            <GlassButton
                                size="small"
                                class="price-update-trigger"
                                aria-haspopup="dialog"
                                :aria-label="`更新${card.item.name}的价格`"
                                :disabled="!canEdit || saving"
                                @click="
                                    openEditor({
                                        kind: 'price',
                                        itemId: card.item.id,
                                        fromHistory: false,
                                    })
                                "
                            >
                                记价
                            </GlassButton>
                        </div>
                    </footer>
                </GlassCard>
            </div>
            <GlassCard v-else class="price-state" :radius="18">
                <p v-if="!items.length">当前账本还没有物品。</p>
                <template v-else>
                    <p>没有符合筛选条件的物品。</p>
                    <GlassButton size="small" @click="clearFilters">清除筛选</GlassButton>
                </template>
            </GlassCard>
        </template>

        <GlassSheet
            v-model:open="sheetOpen"
            class="price-history-sheet"
            :detents="dialog?.kind === 'history' ? '82% large' : '65% large'"
            :no-dismiss="saving"
            aria-label="物价"
            modal
        >
            <template v-if="dialog?.kind === 'history'">
                <header class="price-history-header">
                    <h2 ref="historyHeading" tabindex="-1">{{ selectedItem?.name || '物价历史' }}</h2>
                    <GlassButton size="small" @click="sheetOpen = false">关闭</GlassButton>
                </header>
                <template v-if="selectedItem">
                    <p v-if="selectedItem.note" class="price-item-note price-muted">
                        {{ selectedItem.note }}
                    </p>
                    <PriceHistory
                        :key="selectedItem.id"
                        :item="selectedItem"
                        :edit-disabled="!canEdit || saving"
                        @edit="
                            openEditor({
                                kind: 'price',
                                itemId: selectedItem.id,
                                point: $event,
                                fromHistory: true,
                            })
                        "
                    />
                </template>
                <p v-else class="price-muted">这件物品已不存在。</p>
            </template>
            <PriceEditor
                v-else-if="dialog?.kind === 'new-item' || (dialog?.kind === 'price' && selectedItem)"
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
                @cancel="closeEditor"
            />
            <template v-else-if="dialog?.kind === 'price'">
                <p class="price-muted">这件物品已不存在。</p>
                <GlassButton size="small" @click="closeEditor">关闭</GlassButton>
            </template>
        </GlassSheet>
    </section>
</template>

<style scoped src="./liquid-prices.css"></style>

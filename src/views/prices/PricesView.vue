<script setup lang="ts">
import SaveNotice from '../../components/SaveNotice.vue';
import { useRouteAction } from '../../composables/use-route-action';
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import SlotButton from '../../components/SlotButton.vue';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { notify } from '../../composables/use-notify';
import PriceCard from './PriceCard.vue';
import PriceHistoryDialog from './PriceHistoryDialog.vue';
import PriceItemDialog from './PriceItemDialog.vue';
import PricePointDialog from './PricePointDialog.vue';
import { PRICE_CATEGORIES, subsOf } from './prices-catalog';
import { shortDate } from '../../services/format';
import {
    filterItems,
    type PriceFilter,
    type PriceItem,
    type PriceItemDraft,
    type PricePoint,
    type PricePointDraft,
    type PriceSort,
} from './prices';
import { usePrices } from './prices-store';

/**
 * 物价页：记下每件东西的行情，看它涨还是跌。
 *
 * 三段，没有第四段：`页头` / `一条筛选栏` / `卡片网格`。
 * **不套 `LedgerSection`**——用户明确要求「不要最外层的卡片，下面直接就是一个个的 3D 卡片」。
 * 角色页、工具页、捉鬼页也都是 `PageShell` 下面直接铺内容，这一页没有理由特殊。
 *
 * ---- 写操作全部走弹窗 ----
 * 新建 / 编辑 / 记价 / 删物品 / 删一条记录 / 看历史，六件事四个弹窗
 * （物品表单新建与编辑共用一个，两个删除共用全站那一枚确认窗 `askConfirm()`）。
 * 原先的行内表单已经删掉：卡片铺满之后，行内表单会插在网格中间把一排卡顶下去，
 * 每次都导致整页重排。
 *
 * ---- 这个页面自己只留界面状态 ----
 * 业务数据在 `usePrices()`（模块级单例），读写规则在 `prices.ts`。这里只有：
 * 四个筛选项、四层弹窗各自开着谁、以及两条「刚才为什么没写进去」。
 */
const {
    items,
    loadError,
    writeError,
    pending,
    flush,
    retry,
    addItem,
    saveItem,
    removeItem,
    addPoint,
    savePoint,
    removePoint,
} = usePrices();

/* ---------- 筛选 ----------
 * 一级、二级是两个独立下拉（用户定的）。二级的选项 = 目录里该一级的常见子类
 * ∪ 数据里实际出现过的子类——只用目录的话，用户自造的二级（「三药·秘方」）
 * 在筛选里根本选不到，而它是能存进数据的。 */
const keyword = ref('');
const category = ref('');
const sub = ref('');
const sort = ref<PriceSort>('updated');

const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'updated', label: '最近更新' },
    { value: 'price-desc', label: '价格从高到低' },
    { value: 'price-asc', label: '价格从低到高' },
    { value: 'delta', label: '涨幅优先' },
    { value: 'name', label: '按名称' },
];

/* 第一项是「不筛」：`SelectField` 没有清空按钮，不给一颗「全部分类」的选项，
 * 用户一旦筛过就回不去了。 */
const CATEGORY_OPTIONS = [
    { value: '', label: '全部分类' },
    ...PRICE_CATEGORIES.map((name) => ({ value: name, label: name })),
];

const SUB_OPTIONS = computed(() => {
    if (!category.value) return [{ value: '', label: '先选一级' }];
    const fromData = items.value
        .filter((item) => item.category === category.value && item.sub)
        .map((item) => item.sub);
    const merged = Array.from(new Set([...subsOf(category.value), ...fromData]));
    return [{ value: '', label: '全部' }, ...merged.map((name) => ({ value: name, label: name }))];
});

const filter = computed<PriceFilter>(() => ({
    keyword: keyword.value,
    category: category.value,
    sub: sub.value,
    sort: sort.value,
}));

const visible = computed(() => filterItems(items.value, filter.value));

/** 换一级：二级必须回到「全部」，否则会拿上一块行情的子类去筛新的一块，结果恒为空。 */
function pickCategory(value: string) {
    category.value = value;
    sub.value = '';
}

/* `SelectField` 只吐 `string`，这里收窄回 `PriceSort`：不硬转，值不在表里就退回默认排序，
 * 而不是让一个不认识的字符串一路流进 comparator。 */
function pickSort(value: string) {
    sort.value = SORT_OPTIONS.some((option) => option.value === value)
        ? (value as PriceSort)
        : 'updated';
}

const filterDirty = computed(
    () => !!keyword.value.trim() || !!category.value || !!sub.value || sort.value !== 'updated',
);

function resetFilters() {
    keyword.value = '';
    category.value = '';
    sub.value = '';
    sort.value = 'updated';
}

/* ---------- 四层弹窗 ---------- */
const historyId = ref('');
/** 正在编辑的物品；`null` = 新建。 */
const editingItem = ref<PriceItem | null>(null);
const itemDialogOpen = ref(false);
const itemSubmit = usePersistedSubmit(flush, retry);
const pointSubmit = usePersistedSubmit(flush, retry);
const { saving: itemSaving, locked: itemLocked, action: itemAction } = itemSubmit;
const { saving: pointSaving, locked: pointLocked, action: pointAction } = pointSubmit;
const removal = useConfirmedRemoval(
    () =>
        pending.value > 0 ||
        itemLocked.value ||
        pointLocked.value ||
        !!loadError.value ||
        !!writeError.value,
    flush,
);
const { removing } = removal;
const busy = computed(
    () =>
        itemLocked.value ||
        pointLocked.value ||
        removing.value ||
        pending.value > 0 ||
        !!writeError.value,
);
/** 记价针对哪一件物品。 */
const pointItemId = ref('');
const editingPoint = ref<PricePoint | null>(null);
const pointDialogOpen = ref(false);
/** 记完一笔要重置草稿（日期回今天、价格清空），靠这个自增号掺进 `:key`。 */
const pointVersion = ref(0);

/* 单笔写入失败（`itemError` / `pointError`）留在各自的弹窗里：窗没关，用户改一下就能重试，
 * 关掉再报就只剩「刚才那句红字不见了」。
 *
 * `loadError` / `writeError` 是**数据层**的两条状态，与上面两条不同：它们说的是
 * 「整个物价表此刻读不出来 / 写不进去」，不是某一笔的内容问题，所以显示在页面顶部
 * （见模板里那条横幅），而不是塞进某个弹窗。读失败时底层会拒绝一切写入，
 * 用户必须看到那一行，否则会以为「记上了」而其实一笔都没存。 */
const itemError = ref('');
const pointError = ref('');

const historyItem = computed<PriceItem | null>(
    () => items.value.find((item) => item.id === historyId.value) ?? null,
);
const pointItem = computed<PriceItem | null>(
    () => items.value.find((item) => item.id === pointItemId.value) ?? null,
);

/* ---------- 物品 ---------- */
function startNew() {
    if (busy.value) return;
    itemSubmit.reset();
    itemError.value = '';
    editingItem.value = null;
    itemDialogOpen.value = true;
}

function startEdit(item: PriceItem) {
    if (busy.value) return;
    itemSubmit.reset();
    itemError.value = '';
    editingItem.value = item;
    itemDialogOpen.value = true;
    historyId.value = '';
}

function closeItemDialog() {
    if (itemSaving.value) return;
    itemSubmit.reset();
    itemDialogOpen.value = false;
    editingItem.value = null;
    itemError.value = '';
}

async function onSaveItem(draft: PriceItemDraft, initialPrice: number) {
    if (removing.value || (!itemAction.value && busy.value)) return;
    const ok = await itemSubmit.run('item', () => {
        const result = editingItem.value
            ? saveItem(editingItem.value.id, draft)
            : addItem(draft, initialPrice);
        itemError.value = result.ok ? '' : result.error;
        return result.ok;
    });
    if (!ok) return;
    closeItemDialog();
    notify.success('已保存');
}

/* ---------- 记价 ----------
 * 从卡片点「记」和从历史里点「记价」都会到这里：先记住是哪一件，再开窗。
 *
 * **记完只关窗，不自动开历史。** 早先这里会顺手把历史窗切到这件物品，
 * 用户的反馈很直接：他连着记几笔的时候，每记一笔就被一张走势图拦一次，
 * 得先关掉才能记下一笔。历史窗有它自己的入口（点价格那一片），不该由写入动作强行拉出来。 */
function startLog(item: PriceItem) {
    if (busy.value) return;
    pointSubmit.reset();
    pointError.value = '';
    editingPoint.value = null;
    pointItemId.value = item.id;
    pointVersion.value += 1;
    pointDialogOpen.value = true;
}

/**
 * 历史里点某一行的「改」：同一个窗，带着那一条的记录进去。
 *
 * **必须同时把 `pointItemId` 指到这件物品**。这个窗的渲染条件是
 * `pointDialogOpen && pointItem`、标题取 `pointItem.name`、保存走 `pointItem.value`——
 * 只换 `editingPoint` 的话：冷启动后直接从这里进来，`pointItem` 还是 null，
 * 窗压根不渲染，点了没反应也没有报错；若之前在别的卡片上记过价，窗会顶着**旧物品的名字**
 * 打开，保存时拿旧 id 去改本件的记录，得到一句「这条记录已经不在了」。
 * 这里唯一调用方是历史窗，`historyId` 必定有值。
 */
function startEditPoint(point: PricePoint) {
    if (busy.value) return;
    pointSubmit.reset();
    pointError.value = '';
    pointItemId.value = historyId.value;
    editingPoint.value = point;
    pointVersion.value += 1;
    pointDialogOpen.value = true;
}

function closePointDialog() {
    if (pointSaving.value) return;
    pointSubmit.reset();
    pointDialogOpen.value = false;
    editingPoint.value = null;
    pointError.value = '';
}

async function onSavePoint(draft: PricePointDraft) {
    const item = pointItem.value;
    if (!item || removing.value || (!pointAction.value && busy.value)) return;
    const ok = await pointSubmit.run('point', () => {
        const result = editingPoint.value
            ? savePoint(item.id, editingPoint.value.id, draft)
            : addPoint(item.id, draft);
        pointError.value = result.ok ? '' : result.error;
        return result.ok;
    });
    if (!ok) return;
    closePointDialog();
    notify.success('已保存');
}

async function askRemoveItem(item: PriceItem) {
    const ok = await removal.run(
        {
            danger: true,
            title: `删除「${item.name}」？`,
            note: item.points.length
                ? `同时删除 ${item.points.length} 条价格记录。`
                : '删除后无法撤回。',
            confirmText: '删除',
        },
        () => {
            const result = removeItem(item.id);
            if (!result.ok) notify.error(result.error);
            return result.ok;
        },
    );
    if (!ok) return;
    historyId.value = '';
    if (pointItemId.value === item.id) pointItemId.value = '';
    notify.success('已删除');
}

async function askRemovePoint(point: PricePoint) {
    const item = historyItem.value;
    if (!item) return;
    const ok = await removal.run(
        {
            danger: true,
            title: `删除 ${shortDate(point.date)} 的价格记录？`,
            note: '只删除这一条，无法撤回。',
            confirmText: '删除',
        },
        () => {
            const result = removePoint(item.id, point.id);
            if (!result.ok) notify.error(result.error);
            return result.ok;
        },
    );
    if (ok) notify.success('已删除');
}

function openHistory(item: PriceItem) {
    historyId.value = item.id;
}
useRouteAction('/prices', { new: startNew });
</script>

<template>
    <PageShell title="物价" desc="物品行情 · 价格记录 · 仅存本机">
        <template #actions>
            <!-- 读失败时底层拒绝一切写入，让这枚按钮可点等于让用户白填一遍。 -->
            <PressButton
                icon="add"
                text="新增"
                label="新建一件物品"
                seal
                :disabled="!!loadError"
                @click="startNew"
            />
        </template>

        <!-- 数据层的那一行红字：读不出 / 写不进，都是「整张表有问题」而不是「这一笔填错了」，
             所以它在筛选栏之上、卡片区之外。`writeError` 从前只在 `prices-store.ts` 里被赋值
             和返回，没有任何界面读它——注释里说的「界面拿它显示一行红字」是这次才接上的。 -->
        <p v-if="loadError" class="note error price-error" role="alert">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />

        <div class="price-toolbar page-filters">
            <input
                v-model="keyword"
                class="field toolbar-key filter-search"
                type="text"
                aria-label="搜索物品名、子类或备注"
                placeholder="搜物品名、子类或备注"
            />
            <div class="toolbar-cell">
                <SelectField
                    :model-value="category"
                    :options="CATEGORY_OPTIONS"
                    label="按一级分类筛选"
                    placeholder="全部分类"
                    @update:model-value="pickCategory"
                />
            </div>
            <div class="toolbar-cell">
                <SelectField
                    :model-value="sub"
                    :options="SUB_OPTIONS"
                    label="按二级分类筛选"
                    placeholder="二级分类"
                    :disabled="!category"
                    @update:model-value="sub = $event"
                />
            </div>
            <div class="toolbar-cell toolbar-sort">
                <SelectField
                    :model-value="sort"
                    :options="SORT_OPTIONS"
                    label="排序方式"
                    @update:model-value="pickSort"
                />
            </div>
            <SlotButton v-if="filterDirty" icon="close" label="清除筛选" @click="resetFilters" />
        </div>

        <div v-if="visible.length" class="price-grid">
            <PriceCard
                v-for="item in visible"
                :key="item.id"
                :item="item"
                @open="openHistory(item)"
                @log="startLog(item)"
                @edit="startEdit(item)"
                @remove="askRemoveItem(item)"
            />
        </div>

        <div v-else-if="!items.length" class="price-void page-empty">
            <AppIcon name="prices" class="void-icon page-empty-icon" />
            <h3>记下第一个价</h3>
            <PressButton
                icon="add"
                text="新增"
                label="新建第一件物品"
                seal
                :disabled="!!loadError"
                @click="startNew"
            />
        </div>

        <!-- 筛选空态不放新增入口，避免重复建卡。 -->
        <p v-else class="note price-blank">没有符合条件的物品</p>

        <PriceItemDialog
            v-if="itemDialogOpen"
            :key="editingItem?.id ?? 'new'"
            :item="editingItem"
            :error="itemError || writeError"
            :saving="itemSaving"
            :locked="itemLocked"
            :retrying="itemAction !== null"
            @save="onSaveItem"
            @close="closeItemDialog"
        />

        <PricePointDialog
            v-if="pointDialogOpen && pointItem"
            :key="`${pointItem.id}-${editingPoint?.id ?? 'new'}-${pointVersion}`"
            :item-name="pointItem.name"
            :point="editingPoint"
            :error="pointError || writeError"
            :saving="pointSaving"
            :locked="pointLocked"
            :retrying="pointAction !== null"
            @save="onSavePoint"
            @close="closePointDialog"
        />

        <PriceHistoryDialog
            v-if="historyItem"
            :item="historyItem"
            @close="historyId = ''"
            @log="startLog(historyItem)"
            @edit-item="startEdit(historyItem)"
            @remove-item="askRemoveItem(historyItem)"
            @edit-point="startEditPoint"
            @remove-point="askRemovePoint"
        />
    </PageShell>
</template>

<style scoped src="./prices.css"></style>

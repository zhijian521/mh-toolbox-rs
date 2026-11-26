<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import LedgerSection from '../../components/LedgerSection.vue';
import TextButton from '../../components/TextButton.vue';
import PressTile from '../../components/PressTile.vue';
import NumTag from '../../components/NumTag.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { askConfirm } from '../../composables/use-confirm';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { priceFileExport, priceFileImport } from '../../services/data-files';
import { gameDataReady, quickItems, type QuickItemEntry } from '../../services/game-data';
import { quickItemIcon } from '../../services/game-icons';
import { compactAmount, recordSummary } from './income';
import { useIncome } from './income-store';
import { planPriceImport } from './price-import';
import { useRoster } from '../characters/roster';

const emit = defineEmits<{
    /** 需要填单价：`thenAdd` 为真表示填完就记一条。 */
    'need-price': [item: QuickItemEntry, mode: 'fixed' | 'variable', thenAdd: boolean];
}>();

const { prices, target, recordEntry, setTarget, mergePrices, flush } = useIncome();
const { roster } = useRoster();
const glass = inject(glassLedger, null);

// 玻璃版允许游戏资源读取失败后在原页重试。
const groups = computed(() => (gameDataReady.value ? quickItems() : { fixed: [], variable: [] }));

const targetOptions = computed(() => [
    { value: '', label: '不指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

function onTarget(id: string) {
    setTarget(id ? [id] : []);
}

function validateTarget() {
    const alive = target.value.filter((id) => roster.value.some((one) => one.id === id));
    if (alive.length !== target.value.length) setTarget(alive);
}
validateTarget();
watch(roster, validateTarget);

/** 刚记过的那一格（物品 id）。0 表示没有，避免用 null 判两次。 */
const hit = ref(0);
let hitTimer = 0;

function flash(itemId: number) {
    hit.value = itemId;
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => {
        hit.value = 0;
    }, 1600);
}

/* 组件走掉时把回执的定时器一起收掉：它回调里只写自己那个 ref，不会报错，
 * 但留着就是一个「已卸载的组件还在排队改状态」的尾巴。 */
onBeforeUnmount(() => window.clearTimeout(hitTimer));

async function pick(item: QuickItemEntry, mode: 'fixed' | 'variable') {
    if (mode === 'variable') {
        emit('need-price', item, 'variable', true);
        return;
    }
    const price = prices.value[item.id] ?? 0;
    if (!price) {
        /* 第一次遇到这件物品：先让它定个价，定完直接记（`thenAdd`）。 */
        emit('need-price', item, 'fixed', true);
        return;
    }

    const result = recordEntry({ item: item.name, amount: price });
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    flash(item.id);
    if (await saved(flush)) notify.success(recordSummary(item.name, result.entries));
}

/** 右键：只改价，不记账。 */
function editPrice(item: QuickItemEntry) {
    emit('need-price', item, 'fixed', false);
}

function priceLabelOf(item: QuickItemEntry): string {
    const price = prices.value[item.id] ?? 0;
    /* 「4.6 万」→「4.6万」：窄签里那个空格白占半个字，见 `compactAmount` 的注释。 */
    return price > 0 ? compactAmount(price) : '未设价';
}

/* 标题栏管理单价文件；导入合并同名物品，文件中缺失的旧价保留。 */
const busy = ref(false);

/** 有没有设过价。没有时导出按钮是禁用的——点了也只会得到一句「没有可导出的东西」。 */
const hasPrices = computed(() => Object.keys(prices.value).length > 0);

/** 内存里的价目 → 文件里的一行。`itemId` 是 `quick-items.json` 的稳定编号。 */
function rowsOfPrices(): { itemId: number; price: number }[] {
    return Object.entries(prices.value).map(([id, price]) => ({ itemId: Number(id), price }));
}

async function exportPrices() {
    if (busy.value) return;
    const rows = rowsOfPrices();
    if (!rows.length) {
        notify.error('还没有设过单价，没有可导出的东西');
        return;
    }
    busy.value = true;
    try {
        const outcome = await priceFileExport(rows);
        if (outcome.status === 'ok') notify.success(`已导出 ${rows.length} 件物品的单价`);
        else if (outcome.status === 'failed') notify.error(outcome.error);
        /* 取消：什么都不说。用户自己关掉了「另存为」，不该被提示一次。 */
    } finally {
        /* `finally`：`invoke` 之外的异常（IPC 断了）也要让按钮能再按下去。 */
        busy.value = false;
    }
}

async function importPrices() {
    if (busy.value) return;
    busy.value = true;
    try {
        const outcome = await priceFileImport();
        if (outcome.status === 'canceled') return;
        if (outcome.status === 'failed') {
            notify.error(outcome.error);
            return;
        }
        const plan = planPriceImport(prices.value, outcome.prices);
        if (plan.added + plan.updated === 0) {
            notify.info(plan.unchanged ? '单价一致，无需导入' : '这份文件里没有能用的单价');
            return;
        }
        const ok = await askConfirm({
            danger: plan.updated > 0,
            title: '导入物品单价？',
            note:
                '新增 ' +
                plan.added +
                ' 件，覆盖 ' +
                plan.updated +
                ' 件，保持 ' +
                plan.unchanged +
                ' 件不变。',
            confirmText: '导入',
        });
        if (!ok) return;
        const merged = mergePrices(outcome.prices);
        if (!merged.ok) {
            notify.error(merged.error);
            return;
        }
        if (await saved(flush)) {
            notify.success('单价已导入 · 新增 ' + merged.added + ' · 覆盖 ' + merged.updated);
        }
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <LedgerSection title="物品速记" class="quick-panel" plain>
        <template #actions>
            <div class="prices-io" role="group" aria-label="物品单价管理">
                <TextButton
                    text="导出"
                    label="把物品单价导出成文件"
                    :disabled="busy || !hasPrices"
                    @click="exportPrices"
                />
                <TextButton
                    text="导入"
                    label="从文件导入物品单价"
                    :disabled="busy"
                    @click="importPrices"
                />
            </div>
        </template>

        <div class="targets">
            <GlassSegmented
                v-if="glass"
                :value="target[0] ?? ''"
                class="lg-status-tabs"
                data-size="compact"
                aria-label="指定人"
                @update:value="onTarget"
            >
                <GlassSegment
                    v-for="option in targetOptions"
                    :key="option.value"
                    :value="option.value"
                    :title="option.label"
                >
                    {{ option.label }}
                </GlassSegment>
            </GlassSegmented>
            <SegmentedPills
                v-else
                :model-value="target[0] ?? ''"
                :options="targetOptions"
                label="指定人"
                wrap
                @update:model-value="onTarget"
            />
        </div>

        <div class="group-label">
            <h3>固定价格</h3>
            <span>右键改价</span>
        </div>
        <div class="grid">
            <button
                v-for="item in groups.fixed"
                :key="item.id"
                type="button"
                class="item"
                :class="{ hit: hit === item.id }"
                :title="`${item.name} · ${priceLabelOf(item)}`"
                :aria-label="`${item.name}，${prices[item.id] ? `单价 ${priceLabelOf(item)}` : '未设价'}，点一下记一条`"
                @click="pick(item, 'fixed')"
                @contextmenu.prevent="editPrice(item)"
            >
                <PressTile class="item-tile">
                    <img :src="quickItemIcon(item.file)" alt="" loading="lazy" />
                </PressTile>

                <NumTag v-if="prices[item.id]" class="p">
                    <span class="v">{{ priceLabelOf(item) }}</span>
                </NumTag>
            </button>
        </div>

        <div class="group-label"><h3>浮动价格</h3></div>
        <div class="grid">
            <button
                v-for="item in groups.variable"
                :key="item.id"
                type="button"
                class="item"
                :title="`${item.name} · 每次填单价`"
                :aria-label="`${item.name}，点一下填${item.name === '金币' ? '金额' : '单价'}`"
                @click="pick(item, 'variable')"
            >
                <PressTile class="item-tile">
                    <img :src="quickItemIcon(item.file)" alt="" loading="lazy" />
                </PressTile>
            </button>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 低频操作归标题栏，角色选择常驻；物品使用紧凑图标块与价格签。 */
.prices-io {
    display: flex;
    align-items: center;
    gap: 8px;
}
.targets {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.targets :deep(.pill-group) {
    min-width: 0;
}
.group-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    margin: 16px 0 10px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.targets + .group-label {
    margin-top: 0;
}
.group-label h3 {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    font-weight: 400;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
    gap: 6px 4px;
}
.item {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 3px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    cursor: pointer;
    user-select: none;
}
.item-tile {
    --tile-w: 44px;
    --tile-h: 44px;
    --tile-r: var(--r-2);
    --tile-drop: 0.55;
    --tile-face: var(--paper);
    --tile-face-hover: var(--paper-2);
    /* 回执定位到图标块，避免价格换行带着角标偏移。 */
    position: relative;
}
.item img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    filter: var(--item-icon-filter);
    opacity: var(--item-icon-opacity);
}
.item .p {
    --tag-h: calc(15px * var(--fs-scale));
    min-width: 44px;
    font-size: var(--fs-mini);
    line-height: 1;
}
.item .p .v {
    color: var(--num);
}
.item:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 未定价不印空签，物品仍能点击；名称和改价入口由原按钮提示提供。 */
.item.hit .item-tile::before {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--rule-2));
    border-radius: calc(var(--r-2) + 1px);
    pointer-events: none;
}
.item.hit .item-tile::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
    pointer-events: none;
}
</style>

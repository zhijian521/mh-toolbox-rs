<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import AppIcon from '../../components/AppIcon.vue';
import PressTile from '../../components/PressTile.vue';
import TogglePills from '../../components/TogglePills.vue';
import { askConfirm } from '../../composables/use-confirm';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { priceFileExport, priceFileImport } from '../../services/data-files';
import { quickItems, type QuickItemEntry } from '../../services/game-data';
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

/* 清单在启动时已装好（`main.ts` 等 `loadGameData()` 完成才挂载），这里取一次就够。
 * 模板里每次渲染都调 `quickItems()` 也能跑，但那是 59 项的表，没必要每帧找一遍。 */
const groups = quickItems();

const targetOptions = computed(() => [
    { value: '', label: '不指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

/**
 * 「不指定」在数据里是**空数组**（一条都不选），而在胶囊组里它需要是一枚能按的格子。
 * 所以两边做一次转译：选中「不指定」= 清空选择，反过来空数组就让「不指定」亮着。
 * 不这么做的话，「一个都没选」与「选了不指定」就成了两种状态，而它们意思完全一样。
 */
const NOTHING = '';
const pillsValue = computed(() => (target.value.length ? target.value : [NOTHING]));

function onPills(next: string[]) {
    const hadNothing = pillsValue.value.includes(NOTHING);
    const hasNothing = next.includes(NOTHING);
    if (hasNothing && !hadNothing) {
        setTarget([]);
        return;
    }
    setTarget(next.filter((one) => one !== NOTHING));
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
    <LedgerSection title="物品速记">
        <template #actions>
            <div class="prices-io" role="group" aria-label="物品单价管理">
                <button
                    type="button"
                    class="price-file"
                    title="把物品单价导出成文件"
                    aria-label="把物品单价导出成文件"
                    :disabled="busy || !hasPrices"
                    @click="exportPrices"
                >
                    <AppIcon name="download" />
                </button>
                <button
                    type="button"
                    class="price-file"
                    title="从文件导入物品单价"
                    aria-label="从文件导入物品单价"
                    :disabled="busy"
                    @click="importPrices"
                >
                    <AppIcon name="upload" />
                </button>
            </div>
        </template>

        <div class="targets">
            <TogglePills
                :model-value="pillsValue"
                :options="targetOptions"
                label="这笔账记给谁，可以多选"
                @update:model-value="onPills"
            />
        </div>

        <div class="group-label"><b>固定价格</b>· 右键改价</div>
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

        <div class="group-label"><b>浮动价格</b></div>
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
/* 低频文件操作归标题栏；记账对象独立一行，始终可见。 */
.prices-io {
    display: flex;
    align-items: center;
    gap: 2px;
}
.price-file {
    --icon-size: calc(12px * var(--fs-scale));

    display: grid;
    place-items: center;
    width: calc(24px * var(--fs-scale));
    height: calc(24px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--muted);
    transition:
        color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
.price-file:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--well) 38%, transparent);
    color: var(--ink-2);
}
.price-file:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.targets {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    padding: 8px 10px;
    margin-bottom: 12px;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--well) 24%, transparent);
}
.targets :deep(.pill-group) {
    flex-wrap: wrap;
    min-width: 0;
}
:deep(.section-head h2) {
    flex: none;
}

/* 分类只承载名称与改价提示；第一组紧接记账对象行。 */
.group-label {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 9px 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}
.targets + .group-label {
    margin-top: 0;
}
.group-label b {
    margin-right: 4px;
    font-weight: 400;
    color: var(--ink-2);
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
    /* 行距仍 6、列距收到 4：用户说的是**左右**间距。行距不能跟着收——块下面还有一枚
     * 价格签，上一排的签与下一排的块之间只剩 6，再压就贴着上一排的落影了。 */
    gap: 6px 4px;
}

.item {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 3px;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    cursor: pointer;
    user-select: none;
}
.item-tile {
    /* **44 见方，只包图标**。宽高都写死而不是 `100%`：块是一块「印」，尺寸不该跟着
     * 列宽伸缩——列宽会随窗口变，块不会。 */
    --tile-w: 44px;
    --tile-h: 44px;
    --tile-r: var(--r-2);
    /* 落影 0.55：44 的块比原先 76 的小一半，0.7 的 2.1px 硬影压在这么小的块上会
     * 读成「掉了块垫子」。19 列密排时还要再轻一点，块与块之间才留得住纸面。 */
    --tile-drop: 0.55;
    /* 块面与卡面同色（`--paper-2`）：2026-11-05 卡面下沉到这一档之后，块面**不再靠深浅差**
     * 与卡面区分——比纸更亮没有余量（纸上没有比纸更亮的纸），比纸更暗又会读成凹槽。
     * 59 格并排时靠的是**上亮下暗的棱 + 落地影**，与角色卡的装备块、物价卡同一个做法。
     * 悬停才回到 `--paper`（比卡面亮一档），那是「这一块被压实了」的提亮语义，
     * 也是 `PressTile` 的默认值。 */
    --tile-face: var(--paper-2);
    --tile-face-hover: var(--paper);
    /* 朱点要相对**块**定位，不是相对整条（含价格那一段）。 */
    position: relative;
}
/* 32：块里只有图标，它就是这一格的全部身份（口令牌、兽决这类图本身很像，再小认不出）。
 * 44 的块配 32 的图，四周各留 6——「包住」，不是「框住」。 */
.item img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    /* 图进纸面前先「纸化」一档：原图是游戏里的高饱和贴图，直接贴像一张贴纸。
     * 只降到「认得出是什么」，不是做成单色。 */
    filter: var(--item-icon-filter);
    opacity: var(--item-icon-opacity);
}

.item .p {
    --tag-h: calc(15px * var(--fs-scale));
    min-width: 44px;
    font-size: var(--fs-mini);
    line-height: 1;
}
/* 字色写在里面的 span 上，不写签的根：`NumTag` 作为通用器件把根色定成墨（那是它
 * 在角色卡上的用法），这里要的是「读数赭」。写在内层就压得过，也不必抬高特异性去抢。 */
.item .p .v {
    color: var(--num);
}
.item:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 没价格的那一格**什么都不印**，也不整格变灰：它本来就存在，只是还没定价；
 * 退格色会把「还没定价」读成「这件不存在」。悬停时 `title` 会说「未设价」。 */

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
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import PriceChart from './PriceChart.vue';
import {
    changeSentence,
    changeText,
    chartPrices,
    currentPoint,
    pointDelta,
    priceChange,
    priceLabel,
    shortDate,
    sortedPoints,
    type PriceItem,
    type PricePoint,
} from './prices';

/**
 * 一件物品的走势与流水。
 *
 * 点卡片的抬头打开它。原先走势挂在页面右侧常驻，卡片网格铺满之后没有位置了——
 * 而「看走势」是这一页的核心动作，不能砍。老系统的做法也是点卡片开历史弹窗。
 *
 * 两段：上面是折线（`PriceChart`，180 高），下面是流水。流水里每一行都有改与删，
 * 所以要能点到具体那一条——两个动作都往外抛，由页面统一开下一层弹窗，
 * 这个组件不自己管确认状态：它只负责「显示」与「派发」，确认那一步属于页面。
 */
const props = defineProps<{ item: PriceItem }>();

const emit = defineEmits<{
    close: [];
    log: [];
    editItem: [];
    removeItem: [];
    editPoint: [point: PricePoint];
    removePoint: [point: PricePoint];
}>();

const current = computed(() => currentPoint(props.item));
const label = computed(() => priceLabel(current.value?.price ?? null));
const change = computed(() => priceChange(props.item));

/** 涨跌那一句：跟谁比、差多少。与卡片徽章同一套口径，不重算。 */
/** 与卡片徽章的 `title` **同一句话**（`changeSentence`）：口径不能各拼一遍。 */
const changeLine = computed(() => (change.value ? changeSentence(change.value) : ''));

/**
 * 流水行。`delta` 与 `tone` 单独算给每一行：它与抬头的徽章**不是同一个问题**
 * （行内是「这一笔比上一笔」，抬头是「相对上一个不同日期」），理由在 `prices.ts`
 * 的 `pointDelta` 注释里。文案的 `title` 要把基准说出来，否则同屏两个数字看着像算错。
 */
const rows = computed(() => {
    const sorted = sortedPoints(props.item);
    return sorted.map((point, index) => {
        const delta = pointDelta(sorted, index);
        const previous = sorted[index + 1];
        /* 换算只做一次：`priceLabel` 内部有分支与 `toFixed`，一行里调两遍是白算一遍。 */
        const label = priceLabel(point.price);
        return {
            point,
            latest: index === 0,
            value: label.value,
            unit: label.unit,
            delta: delta === null ? '起点' : changeText(delta),
            tone: delta === null || delta === 0 ? '' : delta > 0 ? 'up' : 'down',
            deltaTitle:
                previous === undefined
                    ? '这是最早的一条记录'
                    : previous.date === point.date
                      ? '与同日的上一条比'
                      : `与 ${previous.date} 那一笔比`,
        };
    });
});

const chart = computed(() => chartPrices(props.item));
</script>

<template>
    <ModalShell :title="item.name" :width="620" @close="emit('close')">
        <div class="hist-head">
            <p class="hist-price">
                <b>{{ label.value }}</b>
                <small v-if="label.unit">{{ label.unit }}</small>
            </p>
            <p v-if="changeLine" class="hist-change" :class="change?.tone">{{ changeLine }}</p>
            <p class="meta hist-count">
                {{ item.category }}<template v-if="item.sub"> · {{ item.sub }}</template> ·
                {{ item.points.length }} 条记录
            </p>
        </div>

        <PriceChart :points="chart" :total="item.points.length" />

        <ol class="log-list">
            <li
                v-for="row in rows"
                :key="row.point.id"
                class="log-row"
                :class="{ latest: row.latest }"
            >
                <span class="log-date num">{{ shortDate(row.point.date) }}</span>
                <span class="log-price num">
                    {{ row.value }}<small v-if="row.unit">{{ row.unit }}</small>
                </span>
                <span class="log-delta" :class="row.tone" :title="row.deltaTitle">
                    {{ row.delta }}
                </span>
                <span class="log-note hint" :title="row.point.note">{{
                    row.point.note || '—'
                }}</span>
                <span class="log-acts">
                    <PressButton
                        icon="edit"
                        label="改这一条价格"
                        size="md"
                        @click="emit('editPoint', row.point)"
                    />
                    <PressButton
                        icon="trash"
                        label="删除这条价格"
                        size="md"
                        @click="emit('removePoint', row.point)"
                    />
                </span>
            </li>
        </ol>
        <p v-if="!rows.length" class="note hist-blank">这件物品还没有价格记录，在下面记第一笔。</p>

        <template #footer>
            <PressButton text="改物品" label="编辑这件物品的名称与分类" @click="emit('editItem')" />
            <PressButton text="删除物品" label="删除这件物品" @click="emit('removeItem')" />
            <span class="foot-gap" />
            <PressButton text="关闭" label="关闭历史" @click="emit('close')" />
            <PressButton icon="add" text="记价" label="记一笔价格" seal @click="emit('log')" />
        </template>
    </ModalShell>
</template>

<style scoped>
.hist-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-bottom: 10px;
}
.hist-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin: 0;
}
/* 价格走 `--num`（赭），与卡片同一档视觉：同一个数在两处长得不一样，
 * 会让人怀疑它们是不是同一个数。 */
.hist-price b {
    color: var(--num);
    /* 与卡片的 `.card-value` **同一个算式**：同一个读数在两张屏上不该长得不一样。
     * 原先这里写的是 `var(--fs-xl) * 0.95`（20.9），卡上是 `var(--fs-base) * 1.4`（18.9）。 */
    font-size: calc(var(--fs-base) * 1.4);
    font-weight: 400;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
}
.hist-price small {
    color: var(--num);
    font-size: var(--fs-sm);
}
/* 涨红跌绿（国内读法）。这一行是整页唯一需要当场判断方向的句子，给足一档字号。 */
.hist-change {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.hist-change.up {
    color: var(--cinnabar);
}
.hist-change.down {
    color: var(--moss);
}
.hist-count {
    margin: 0;
}

/* 流水一行：日期 / 价格 / 涨跌 / 备注 / 两枚图标。
 * flex + 固定列宽而不是 grid 四轨：备注要能缩到 0 并打出省略号，
 * flex 里一个 `min-width: 0` 就够。 */
.log-list {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
}
.log-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-bottom: var(--w-hair) solid var(--rule);
    font-size: var(--fs-sm);
}
.log-row:last-child {
    border-bottom: 0;
}
.log-date {
    flex: none;
    width: 42px;
    color: var(--muted);
}
.log-row.latest .log-date {
    color: var(--ink);
}
.log-price {
    flex: none;
    width: 86px;
    text-align: right;
    color: var(--num);
    font-size: var(--fs-base);
}
.log-price small {
    margin-left: 2px;
    color: var(--num);
    font-size: var(--fs-mini);
}
.log-delta {
    flex: none;
    width: 76px;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.log-delta.up {
    color: var(--cinnabar);
}
.log-delta.down {
    color: var(--moss);
}
/* 备注只负责「挤得下、截得断」，字档走基座的 `.hint`。 */
.log-note {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.log-acts {
    display: flex;
    flex: none;
    gap: 4px;
}
.hist-blank {
    margin: 12px 0 0;
    text-align: center;
}
/* 把「关闭 / 记价」那两枚推到右边：左边两枚是「改 / 删」，右边是「收尾与主操作」。
 * 中间这一根弹性空档比 `margin-left: auto` 更好读——它明确说了「这里隔开」。 */
.foot-gap {
    flex: 1 1 auto;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import PriceChart from './PriceChart.vue';
import { changeText, priceLabel, shortDate } from '../../services/format';
import {
    changeSentence,
    chartPrices,
    currentPoint,
    pointDelta,
    priceChange,
    sortedPoints,
    type ReadonlyPriceItem,
    type PricePoint,
} from './prices';

/* 记价、编辑和删除交给物价页，这里只展示历史与走势。 */
const props = defineProps<{ item: ReadonlyPriceItem }>();

const emit = defineEmits<{
    close: [];
    log: [];
    editItem: [];
    removeItem: [];
    editPoint: [point: PricePoint];
    removePoint: [point: PricePoint];
}>();

const points = computed(() => sortedPoints(props.item));
const current = computed(() => currentPoint(props.item, points.value));
const label = computed(() => priceLabel(current.value?.price ?? null));
const change = computed(() => priceChange(props.item, points.value));

/** 与卡片徽章的 `title` **同一句话**（`changeSentence`）：口径不能各拼一遍。 */
const changeLine = computed(() => (change.value ? changeSentence(change.value) : ''));

/**
 * 流水行。`delta` 与 `tone` 单独算给每一行：它与抬头的徽章**不是同一个问题**
 * （行内是「这一笔比上一笔」，抬头是「相对上一个不同日期」），理由在 `prices.ts`
 * 的 `pointDelta` 注释里。文案的 `title` 要把基准说出来，否则同屏两个数字看着像算错。
 */
const rows = computed(() => {
    const sorted = points.value;
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

const chart = computed(() => chartPrices(props.item, undefined, points.value));
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

        <table v-if="rows.length" class="income-table price-history-table" aria-label="价格记录">
            <thead>
                <tr>
                    <th scope="col" class="log-date">日期</th>
                    <th scope="col" class="log-price">价格</th>
                    <th scope="col" class="log-delta">涨跌</th>
                    <th scope="col">备注</th>
                    <th scope="col" class="log-actions">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.point.id" :class="{ latest: row.latest }">
                    <td class="log-date num" :title="row.point.date">
                        {{ shortDate(row.point.date) }}
                    </td>
                    <td class="log-price num">
                        {{ row.value }}<small v-if="row.unit">{{ row.unit }}</small>
                    </td>
                    <td class="log-delta num" :class="row.tone" :title="row.deltaTitle">
                        {{ row.delta }}
                    </td>
                    <td class="log-note" :title="row.point.note">{{ row.point.note || '—' }}</td>
                    <td class="log-actions">
                        <span class="income-ops">
                            <PressButton
                                icon="edit"
                                label="改这一条价格"
                                @click="emit('editPoint', row.point)"
                            />
                            <PressButton
                                danger
                                icon="trash"
                                label="删除这条价格"
                                @click="emit('removePoint', row.point)"
                            />
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
        <p v-else class="note hist-blank">还没有价格记录</p>

        <PriceChart v-if="rows.length" class="hist-chart" :points="chart" :total="item.points.length" />

        <template #footer>
            <PressButton text="改物品" label="编辑这件物品的名称与分类" @click="emit('editItem')" />
            <PressButton danger text="删除物品" label="删除这件物品" @click="emit('removeItem')" />
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
    /* 与卡片的 `.card-value` 同一个令牌：同一个读数在两张屏上不该长得不一样。 */
    font-size: var(--fs-amount);
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

.price-history-table {
    margin-top: 12px;
}
.log-date,
.log-price,
.log-delta,
.log-actions {
    width: 1%;
    white-space: nowrap;
}
.log-date,
.log-delta {
    color: var(--muted);
}
.latest .log-date {
    color: var(--ink);
}
.price-history-table :is(.log-price, .log-delta, .log-actions) {
    text-align: right;
}
td.log-price {
    color: var(--num);
    font-size: var(--fs-base);
}
.log-price small {
    margin-inline-start: 2px;
    font-size: var(--fs-mini);
}
.log-delta.up {
    color: var(--cinnabar);
}
.log-delta.down {
    color: var(--moss);
}
.log-note {
    color: var(--ink-2);
    overflow-wrap: anywhere;
}
.hist-chart {
    margin-top: 16px;
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

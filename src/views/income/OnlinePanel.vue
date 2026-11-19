<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useToday } from '../../composables/use-today';
import { daysAgo, parseDay } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import { useIncome } from '../income/income-store';
import { minutesByDay, ownersOf } from './online';
import { useOnline } from './online-store';
import TrendChart from '../../components/TrendChart.vue';
import { netByDay, trendSeriesOf } from './trend-chart';

const { sessions, loaded: onlineLoaded, loadError: onlineError } = useOnline();
const { entries, loaded: incomeLoaded, loadError: incomeError } = useIncome();
const { roster } = useRoster();
const onlineReadable = computed(() => onlineLoaded.value && !onlineError.value);
const incomeReadable = computed(() => incomeLoaded.value && !incomeError.value);
const today = useToday();
const now = useMinuteNow();

/* ---------- 两张走势图 ---------- */

type Span = 'week' | 'month';
const SPANS: { value: Span; label: string }[] = [
    { value: 'week', label: '近一周' },
    { value: 'month', label: '近一月' },
];
const span = ref<Span>('week');
const DAYS: Record<Span, number> = { week: 7, month: 30 };

const labels = computed(() => {
    const size = DAYS[span.value];
    const day = parseDay(today.value);
    return Array.from({ length: size }, (_, index) => daysAgo(size - 1 - index, day));
});

const dates = computed(() => new Set(labels.value));
const minutes = computed(() => minutesByDay(sessions.value, now.value, dates.value));

const net = computed(() => netByDay(entries.value, dates.value));

const actors = computed(() => {
    const ids = new Set<string>();
    if (onlineReadable.value)
        for (const one of sessions.value) for (const id of ownersOf(one)) ids.add(id);
    if (incomeReadable.value) for (const one of entries.value) ids.add(one.characterId);
    for (const one of roster.value) ids.add(one.id);

    const order = new Map(roster.value.map((one, index) => [one.id, index]));
    return [...ids].sort((left, right) => {
        if (left === right) return 0;
        if (!left) return 1;
        if (!right) return -1;
        return (order.get(left) ?? 999) - (order.get(right) ?? 999) || left.localeCompare(right);
    });
});

function seriesOf(source: Map<string, number>) {
    return trendSeriesOf(
        labels.value,
        source,
        actors.value.map((id) => ({ id, name: characterName(roster.value, id) })),
    );
}

const minuteSeries = computed(() => seriesOf(minutes.value));

const netSeries = computed(() => seriesOf(net.value));
</script>

<template>
    <LedgerSection title="每日走势" class="chart-section" plain>
        <template #actions>
            <SteppedSlider v-model="span" :options="SPANS" label="走势范围" class="span-slider" />
        </template>

        <div class="charts">
            <section class="chart-block">
                <header class="chart-head">
                    <h3>每日时长</h3>
                    <span class="cap">按号分线 · {{ DAYS[span] }} 天</span>
                </header>
                <TrendChart
                    v-if="onlineReadable"
                    class="chart-in-card"
                    :labels="labels"
                    :series="minuteSeries"
                    kind="minutes"
                    label="每日时长"
                    :height="180"
                />
                <p v-else class="chart-unavailable empty-note" role="status">
                    {{ onlineError ? '上线记录未读取，请在页面上方重新读取。' : '正在读取上线记录…' }}
                </p>
            </section>

            <section class="chart-block">
                <header class="chart-head">
                    <h3>每日收益</h3>
                    <span class="cap">速记净额 · 不扣点卡</span>
                </header>
                <TrendChart
                    v-if="incomeReadable"
                    class="chart-in-card"
                    :labels="labels"
                    :series="netSeries"
                    kind="money"
                    label="每日收益"
                    :height="180"
                />
                <p v-else class="chart-unavailable empty-note" role="status">
                    {{ incomeError ? '收益未读取，请在页面上方重新读取。' : '正在读取收益…' }}
                </p>
            </section>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 走势标题栏只保留范围；上线操作归状态条。 */
.span-slider {
    width: calc(148px * var(--fs-scale));
    max-width: 100%;
    --step-pad-y: 1px;
    --step-pad-x: 6px;
}

/* ---------- 两张走势图 ----------
 * 上下排：在线时长与收益是两个问题，并排会让人以为左图的峰对应右图的峰。 */
.charts {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.chart-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.chart-block + .chart-block {
    padding-top: 18px;
    border-top: var(--w-hair) solid var(--rule);
}
.chart-unavailable {
    display: grid;
    place-content: center;
    min-height: 180px;
    margin: 0;
}

.chart-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
}

/* 图下的小标题比区块标题小一档：它属于卡内的一层，不另开一块纸。 */
.chart-head h3 {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    font-weight: 400;
    letter-spacing: 0.02em;
}

.chart-head .cap {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>

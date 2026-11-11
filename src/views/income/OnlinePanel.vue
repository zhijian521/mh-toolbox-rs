<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { useToday } from '../../composables/use-today';
import { daysAgo, parseDay } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import { useIncome } from '../income/income-store';
import { minutesByDay, ownersOf } from './online';
import { useOnline } from './online-store';
import TrendChart from './TrendChart.vue';
import { netByDay, type TrendSeries } from './trend-chart';

/**
 * 每日走势卡：这张纸只回答一个问题——**这几天是怎么走的**。
 *
 * ---- 名字从「在线计时」改过来（2026-11-11） ----
 * 上一版这张卡里只有计时读数，叫「在线计时」名实相符；现在它画的是「每天在线多久」与
 * 「每天赚了多少」两条线，计时只占其中一半。沿用旧名会让人以为这张卡只统计点卡，
 * 而收益那条线（速记净额）与计时毫无关系。
 *
 * 没有叫「走势」两个字：那太虚，看不出横轴是一天一格；「每日」是与两张图各自的小标题
 * （每日在线时长 / 每日收益）咬合的那一半。
 *
 * ---- 为什么它不是一张统计签 ----
 * 统计条那四格是「速记的四张面孔」（收入 / 支出 / 净额 / 笔数），全部由 `income.ts` 算；
 * 这一块是另一种东西：它有可翻的区间、有两条不同来源的走势，是一张**可读的纸**。
 * 混进统计条会把那一行读成五格，而第五格能翻区间、前四格不能。
 *
 * ---- 「此刻」的那几件全都搬走了（2026-11-11） ----
 * 点卡记不记、谁在线、怎么停、今日在线多少、今日点卡多少、单价多少，一律移到统计条与
 * 速记之间的 `OnlineBar`。分界线是**时态**：那条说「现在」，这条说「这几天」。
 * 第一版只搬了开关与在线签，读数还留在这里；2026-11-11 用户指出「今日在线 / 今日点卡 /
 * 点卡单价也放到上面去」——他说得对，三格读数与开关本来就是同一句话的三个部分，
 * 拆在两处就得上下滚着对读。
 *
 * ---- 为什么下半截是两张图而不是「今天这几段」的列表 ----
 * 2026-11-11 用户的判断：列表把「今天几点到几点」说得很细，而他要看的是**节奏**
 * ——这几天哪个号挂得多、哪天赚得回来。逐段的明细仍然在「记录」窗里（那里全文可搜、
 * 可改可删），卡片这一层只回答「走势如何」。
 *
 * 两张图分别答两个问题：**在线多久**与**赚了多少**。它们不同源（前者是计时，后者是速记），
 * 所以也不该合成一张双轴图——双轴最大的问题是「哪根线归哪根轴」看着像谜语。
 */
/* 只往外报「要开哪扇窗」。改某一条在下面那张卡里已经没有入口了——
 * 逐段明细搬进了「记录」窗，那一窗自己带编辑按钮（`OnlineRecords` 的 `edit`）。 */
const emit = defineEmits<{
    /** 要开「全部记录」窗（页面挂 `OnlineRecords`）。 */
    records: [];
    /** 要开「补记」窗。 */
    backfill: [];
}>();

const { sessions, loadError } = useOnline();
const { entries } = useIncome();
const { roster } = useRoster();
const today = useToday();

/* ---------- 两张走势图 ---------- */

/**
 * 图看几天：一周与一月，只有这两档——多出来的档位是让人选。
 *
 * 第二档原先是「近半月」，2026-11-11 用户改成「近一个月」：账是按月对的，
 * 半个月的窗口截在 15 号，翻回去看月末那几天时前后各缺一半。
 */
type Span = 'week' | 'month';
const SPANS: { value: Span; label: string }[] = [
    { value: 'week', label: '近一周' },
    { value: 'month', label: '近一个月' },
];
const span = ref<Span>('week');
const DAYS: Record<Span, number> = { week: 7, month: 30 };

/**
 * 横轴那几天（旧的在前、今天在最后）。
 *
 * 走 `daysAgo` 而不是自己减毫秒：跨月、跨年、夏令时都由它担。取「今天」用
 * `todayText()` 的口径（本地日）也不够——这里要的是一个 Date 好做减法，所以从
 * `parseDay` 起算，和 `OnlineBar` 里那格「今日」用的是同一个「今天」。
 */
const labels = computed(() => {
    const size = DAYS[span.value];
    const now = parseDay(today.value);
    return Array.from({ length: size }, (_, index) => daysAgo(size - 1 - index, now));
});

const minutes = computed(() => minutesByDay(sessions.value));

const net = computed(() => netByDay(entries.value));

/**
 * 窗口内出现过的号（按名册顺序，未指定排最后）。
 *
 * 三条来源合并：名册、计时记录、速记。只看名册的话，删掉的角色会从图上消失，
 * 而它那几天的账还在——图与账号两处对不上时，用户会先怀疑账错了。
 */
const actors = computed(() => {
    const ids = new Set<string>();
    for (const one of sessions.value) for (const id of ownersOf(one)) ids.add(id);
    for (const one of entries.value) ids.add(one.characterId);
    for (const one of roster.value) ids.add(one.id);

    const order = new Map(roster.value.map((one, index) => [one.id, index]));
    return [...ids]
        .sort((left, right) => {
            if (!left) return 1;
            if (!right) return -1;
            return (order.get(left) ?? 999) - (order.get(right) ?? 999);
        })
        .slice(0, 6);
});

function seriesOf(source: Map<string, number>): TrendSeries[] {
    const out: TrendSeries[] = [];
    for (const id of actors.value) {
        const values = labels.value.map((date) => source.get(date + '|' + id) ?? 0);
        /* 整条都是 0 的号不画：它会在图例里占一个色位，却把六种颜色中的一种
         * 分给一条看不见的线——颜色是有上限的资源。 */
        if (values.every((value) => value === 0)) continue;
        out.push({ id, name: characterName(roster.value, id), values });
    }
    return out;
}

const minuteSeries = computed(() => seriesOf(minutes.value));

const netSeries = computed(() => seriesOf(net.value));
</script>

<template>
    <LedgerSection title="每日走势">
        <template #actions>
            <!-- 卡头三件：图看几天、补记、全部记录。范围放最左——它管的是下面那两张图。
                 点卡开关、在线的号与三格读数都在上面那条 `OnlineBar`（2026-11-11）。 -->
            <SteppedSlider v-model="span" :options="SPANS" label="走势范围" class="span-slider" />
            <PressButton
                icon="flask"
                text="补记"
                label="补记一段已经过去的在线时长"
                size="sm"
                @click="emit('backfill')"
            />
            <PressButton
                icon="history"
                text="记录"
                label="查看全部上线记录"
                size="sm"
                @click="emit('records')"
            />
        </template>

        <p v-if="loadError" class="note error">{{ loadError }}</p>

        <div class="charts">
            <section class="chart-block">
                <header class="chart-head">
                    <h3>每日在线时长</h3>
                    <span class="cap">按号分线 · {{ DAYS[span] }} 天</span>
                </header>
                <TrendChart
                    :labels="labels"
                    :series="minuteSeries"
                    kind="minutes"
                    label="每日在线时长"
                />
            </section>

            <section class="chart-block">
                <header class="chart-head">
                    <h3>每日收益</h3>
                    <span class="cap">速记净额 · 不扣点卡</span>
                </header>
                <TrendChart :labels="labels" :series="netSeries" kind="money" label="每日收益" />
            </section>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 两档滑块自己只画到内容宽，宽度由调用方给（SteppedSlider 的约定）。
 * 两格各 82：最长的「近一个月」在 13.5px 下约 54 宽，两侧各留 8 的余量。
 * 高度往回收一档：卡头那一行旁边是 20 高的注脚按钮，29 的默认轨道会把这一行顶高。 */
.span-slider {
    width: 168px;
    --step-pad-y: 1px;
    --step-pad-x: 6px;
}

/* ---------- 两张走势图 ----------
 * 上下排：在线时长与收益是两个问题，并排会让人以为左图的峰对应右图的峰。 */
.charts {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.chart-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.chart-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
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
    letter-spacing: 0.04em;
}
</style>

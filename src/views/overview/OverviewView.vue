<script setup lang="ts">
import { computed } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import MeterBar from '../../components/MeterBar.vue';
import PageShell from '../../components/PageShell.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { daysAgo, todayText } from '../../services/format';
import { useRoster } from '../characters/roster';
import { amountText, entriesOn, factsOf, statRowsOf, totalsOf } from '../income/income';
import { useIncome } from '../income/income-store';
import { charBrief, trainingPercent, weekSeries } from './overview';

/**
 * 总览：**今天 / 近七天 / 各号近况**三块。
 *
 * 这三块是用户 2026-11-05 从四个候选里挑的（第四块「值得看一眼」的异动提示留到以后，
 * 理由是它需要几条硬判据，否则会堆成一串没人看的提醒）。
 *
 * ---- 为什么这一页存在 ----
 * 此前默认落地页是**设置页**——一个记账工具打开先落在「主题与字号」，很别扭。
 * 但更根本的是：收益、物价、角色三页各说一件事，没人回答「这几天怎么样」。
 * 这一页不产生新数据，只把已有的三份账拼成一眼。
 *
 * ---- 三块各自的口径 ----
 *
 * - **今天**：与收益页选「今天」时**同一组数**（`entriesOn` + `totalsOf`），连组件都是
 *   同一个（`StatStrip`）。两页给出的数必须一样，否则用户不知道该信哪个。
 * - **近七天**：`weekSeries` 按天聚合，**空的那些天也占一格**——跳掉它们，7 根柱子会变成
 *   5 根，横轴就对不上日期了。柱子在零线上下分向：净利向上、亏损向下，中线是那条虚线。
 * - **各号近况**：等级 / 经验进度 / 修炼完成度。修炼读的是**每行自己的上限**，
 *   不是常量表（上限跟号走，见 `charBrief`）。
 *
 * ---- 这一层只做编排 ----
 * 聚合、百分比、空值的含义全在 `overview.ts` 与 `income.ts`。这里不写判断，
 * 只决定「摆哪几块、每块写什么标题」。
 */
const { entries } = useIncome();
const { roster } = useRoster();

const today = computed(() => todayText());
const todayEntries = computed(() => entriesOn(entries.value, today.value));
const todayTotals = computed(() => totalsOf(todayEntries.value));

/**
 * 昨天，只用来给统计条算「较昨日」。
 *
 * 从 `today` 推而不是直接取 `daysAgo(1)`：这个 computed 在跨午夜时会跟着 `today` 一起变，
 * 而两次各取一次「现在」，可能出现「今天的数配昨天的前一天」。
 */
const yesterdayTotals = computed(() =>
    totalsOf(entriesOn(entries.value, daysAgo(1, new Date(`${today.value}T00:00:00`)))),
);

/**
 * 与收益页**同一份拼装**（`statRowsOf`）：同一组数在两页上长得不一样，会让人怀疑
 * 有一页算错了。副文与「较昨日」也一并搬过去，两页只有范围不同（这一页恒为今天）。
 */
const statItems = computed<StatItem[]>(() =>
    statRowsOf(todayTotals.value, yesterdayTotals.value, factsOf(todayEntries.value)),
);

/**
 * 近七天的柱子。
 *
 * `zero` 是零线距**底部**的高度（%），等于「亏损那部分占的高度」：
 * 全是收入时它贴底（0%），柱子从底往上长；全是亏损时它顶到 100%，柱子从顶往下长；
 * 有赚有亏时按比例分开。第一天写反了（用 `maxPos / span`），全正时零线跑到顶上，
 * 唯一那根柱子整根长到统计条上面去——`bottom: 100%` 加 `height: 100%` 正好高出一个格子。
 */
const week = computed(() => {
    const days = weekSeries(entries.value, today.value);
    const values = days.map((one) => one.net);
    const maxPos = Math.max(0, ...values);
    const maxNeg = Math.max(0, ...values.map((value) => -value));
    const span = maxPos + maxNeg;

    return {
        zero: span > 0 ? (maxNeg / span) * 100 : 0,
        days: days.map((one) => ({
            ...one,
            /* 空的那天高度 0：画一根 1px 的灰条会读成「那天有一点点」，而实际是没记。 */
            height: span > 0 ? (Math.abs(one.net) / span) * 100 : 0,
            /* 只显示「日」：七格的宽度放不下「11-05」，而这一行本来就是最近七天。 */
            day: Number(one.date.slice(8)),
        })),
        total: days.reduce((sum, one) => sum + one.net, 0),
        count: days.reduce((sum, one) => sum + one.count, 0),
    };
});

/** 近七天的标签：倒数第一格是今天。 */
function dayTag(index: number): string {
    return index === week.value.days.length - 1 ? '今' : `${week.value.days[index]?.day ?? ''}`;
}

const briefs = computed(() => roster.value.map(charBrief));

/** 修炼条的读数：`62/80`，有项练满时补一句。 */
function trainingText(one: { trainingLevel: number; trainingCap: number }): string {
    return `${one.trainingLevel}/${one.trainingCap}`;
}
</script>

<template>
    <PageShell title="总览" desc="今天 · 近七天 · 各号近况">
        <div class="overview">
            <!-- 与收益页同一块组件、同一组口径：同一个数在两页上长得不一样，
                 会让人怀疑有一页算错了。 -->
            <StatStrip :items="statItems" />

            <LedgerSection title="近七天" :hint="`共 ${week.count} 笔`">
                <div class="chart" :style="{ '--zero': `${week.zero}%` }">
                    <div class="plot">
                        <!-- 零线画在柱子下面一层：柱子压着它，才读得出「从这条线往上/往下」。 -->
                        <span class="zero" aria-hidden="true" />
                        <div class="bars">
                            <div
                                v-for="(one, index) in week.days"
                                :key="one.date"
                                class="slot"
                                :title="`${one.date} · ${one.count} 笔 · ${one.net < 0 ? '−' : ''}${amountText(Math.abs(one.net))}`"
                            >
                                <span
                                    v-if="one.net !== 0"
                                    class="bar"
                                    :class="{ neg: one.net < 0 }"
                                    :style="
                                        one.net < 0
                                            ? {
                                                  top: 'calc(100% - var(--zero))',
                                                  height: `${one.height}%`,
                                              }
                                            : {
                                                  bottom: 'var(--zero)',
                                                  height: `${one.height}%`,
                                              }
                                    "
                                />
                                <span class="tag" :class="{ now: index === week.days.length - 1 }">
                                    {{ dayTag(index) }}
                                </span>
                            </div>
                        </div>
                    </div>
                    <p class="week-sum">
                        七天净额
                        <b :class="{ loss: week.total < 0 }">{{
                            week.total < 0 ? `−${amountText(-week.total)}` : amountText(week.total)
                        }}</b>
                    </p>
                </div>
            </LedgerSection>

            <LedgerSection title="各号近况" :hint="`${briefs.length} 个号`">
                <p v-if="!briefs.length" class="note blank">
                    名册里还没有角色。去「角色」加一个，这里就有内容了。
                </p>

                <div v-else class="chars">
                    <article v-for="one in briefs" :key="one.id" class="char">
                        <header class="char-head">
                            <b class="char-name">{{ one.name || '未取名' }}</b>
                            <span class="char-level">{{ one.level }} 级</span>
                        </header>
                        <p class="char-school">{{ one.school || '未填门派' }}</p>

                        <!-- 两条读数各有分母：经验的分母是「升级所需」，修炼的分母是
                             每个号自己的上限合计。两者都可能不知道，那时条子留空。 -->
                        <MeterBar
                            :percent="one.exp"
                            label="经验"
                            :text="one.exp === null ? '—' : `${Math.round(one.exp)}%`"
                        />
                        <MeterBar
                            :percent="trainingPercent(one)"
                            label="修炼"
                            :text="trainingText(one)"
                        />

                        <p class="char-meta">修炼 {{ one.maxedRows }}/{{ one.totalRows }} 项满</p>
                    </article>
                </div>
            </LedgerSection>
        </div>
    </PageShell>
</template>

<style scoped>
/* 三块之间 12px，与收益页同一条：间距由外层一根 `gap` 保证，不靠每块自己写下边距。 */
.overview {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* ---------- 近七天 ---------- */
.chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.plot {
    position: relative;
    /* 96 是「七根柱子看得出高低、又不至于把这一块撑成一张大图」的折中。 */
    height: 96px;
}
/* 账格线：每 24px 一条淡线（96 高正好四条）。
 *
 * 只有一两天有账时，图上就一根柱子，其余全是空白——那一片空白读作「图没画出来」。
 * 加一层淡格线之后，留白变成「账纸的格子」，一根柱子也站得住。
 * 不画纵线：七格已经有缝，再加竖线就成了表格。 */
.plot::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to top, var(--rule) 0 1px, transparent 1px 24px);
    opacity: 0.45;
    pointer-events: none;
}
/* 零线：一条虚线账线，不画坐标轴。全是收入时它贴在底部（= 柱子的起点）。 */
.zero {
    position: absolute;
    right: 0;
    bottom: var(--zero, 0%);
    left: 0;
    border-top: var(--w-hair) dashed var(--rule-2);
}
.bars {
    position: relative;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 10px;
    height: 100%;
}
.slot {
    position: relative;
    height: 100%;
}
/* 柱子只占格子宽度的六成：铺满 152 时它读作一块色板，不像一根柱子。
 * 上下两头都留白，七根并排才看得出「这是七天的量」而不是「七块颜色」。 */
.bar {
    position: absolute;
    right: 20%;
    left: 20%;
    min-height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--num);
    opacity: 0.82;
}
/* 亏损：向零线下方长，圆角翻到下面，色转朱。 */
.bar.neg {
    border-radius: 0 0 2px 2px;
    background: var(--cinnabar);
}
/* 日期标签压在柱子下方，`now` 那格加一枚朱点——与 `DateField` 里「今天」同一个说法。 */
.tag {
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: center;
    transform: translateY(100%);
    font-variant-numeric: tabular-nums;
}
.tag.now {
    color: var(--ink-2);
}
.week-sum {
    margin: 14px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.week-sum b {
    margin-left: 6px;
    color: var(--num);
    font-size: var(--fs-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.week-sum b.loss {
    color: var(--cinnabar);
}

/* ---------- 各号近况 ---------- */
/* 240 起一列：一张卡里要同时放下两个读数条与角色名，再窄就换行了。 */
.chars {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
}
.char {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 12px;
    /* 与装备块、速记格同一做法：纸面暗一档 + 一圈淡线，读作「纸上的一小块」。 */
    border: var(--w-hair) solid var(--rule);
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--paper-2) 55%, transparent);
}
.char-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.char-name {
    min-width: 0;
    overflow: hidden;
    color: var(--ink);
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.char-level {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.char-school {
    margin: 0 0 2px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
/* 两条读数条嵌在卡里时压矮一档：默认 10px 在一张 240 宽的卡上比正文字还重，
 * 读起来像两条色带。`--meter-h` 是尺寸的唯一入口（§2.3-15）。 */
.char :deep(.meter) {
    --meter-h: 7px;
}
.char-meta {
    margin: 1px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}

.blank {
    margin: 18px 0;
    text-align: center;
}
</style>

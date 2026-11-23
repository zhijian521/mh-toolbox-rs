<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import TrendChart from '../../components/TrendChart.vue';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useToday } from '../../composables/use-today';
import { accountValueText } from '../accounts/account-analysis';
import { rangeOf } from '../accounts/accounts';
import { deadlineText, kindMeta } from '../goals/goals';
import { clockText, onlineTotalsOf, ownersOf } from '../income/online';
import LiquidTeamCard from './LiquidTeamCard.vue';
import { useLiquidOverviewData } from './liquid-overview-data';
import { activeGoals, weekSeries, workbenchSummary } from './overview';
import { teamActivity } from './team-activity';

const { roster, income, accounts, online, goals, loading, errors, loadOverview } =
    useLiquidOverviewData();
const today = useToday();
const now = useMinuteNow();
const goalsUnavailable = computed(() => Boolean(goals.loadError.value || roster.loadError.value));
const ongoing = computed(() =>
    goalsUnavailable.value ? [] : activeGoals(goals.goals.value, roster.roster.value),
);
const team = computed(() =>
    teamActivity(
        roster.roster.value,
        income.entries.value,
        online.sessions.value,
        accounts.entries.value,
    ),
);
const weekRange = computed(() => rangeOf('week', today.value));
const week = computed(() => weekSeries(income.entries.value, today.value));
const weekTotal = computed(() => week.value.reduce((sum, day) => sum + day.net, 0));
const moneyDirections = ['income', 'expense'] as const;
const trendNote = computed(() => {
    if (income.loadError.value) return '收益未读取';
    if (week.value.some(({ net }) => net !== 0)) return '';
    return week.value.some(({ count }) => count > 0) ? '近七天每日净额均为零' : '近七天暂无速记记录';
});
const onlineCount = computed(() => {
    const onlineIds = new Set(
        online.sessions.value.filter(({ endAt }) => endAt === null).flatMap(ownersOf),
    );
    return roster.roster.value.filter(({ id }) => onlineIds.has(id)).length;
});
const trend = computed(() => [
    { id: 'net', name: '净额', values: week.value.map(({ net }) => net) },
]);
const weekOnline = computed(() =>
    onlineTotalsOf(online.sessions.value, weekRange.value.from, weekRange.value.to, now.value),
);
const workbench = computed(() => workbenchSummary(accounts.entries.value, today.value));
const goalEmptyText = computed(() => {
    if (goalsUnavailable.value) return '目标未读取';
    return goals.goals.value.length ? '目标已全部达成' : '暂无目标';
});

onMounted(loadOverview);
</script>

<template>
    <section class="liquid-overview" aria-labelledby="liquid-overview-title">
        <h1 id="liquid-overview-title">总览</h1>
        <GlassCard v-if="loading" class="overview-state" :radius="18">
            <p role="status">正在读取总览…</p>
        </GlassCard>
        <template v-else>
            <GlassCard v-if="errors.length" class="overview-state" :radius="18">
                <p role="alert">{{ errors.map(({ label }) => label).join('、') }}未读取</p>
                <GlassButton size="small" @click="loadOverview">重试</GlassButton>
            </GlassCard>

            <section aria-labelledby="overview-workbench-title">
                <GlassCard class="overview-card workbench" :radius="20">
                    <div class="workbench-intro">
                        <h2 id="overview-workbench-title">工作台</h2>
                        <div v-if="!roster.loadError.value" class="workbench-status">
                            <span>{{ roster.roster.value.length }} 个角色</span>
                            <span
                                v-if="!online.loadError.value"
                                class="online-count"
                                :class="{ 'is-active': onlineCount > 0 }"
                            >
                                {{ onlineCount }} 个在线
                            </span>
                        </div>
                    </div>
                    <div class="overview-periods">
                        <section class="workbench-period" aria-labelledby="overview-week-title">
                            <h3 id="overview-week-title">
                                <span class="period-icon"><AppIcon name="calendar" /></span>
                                近一周
                            </h3>
                            <dl class="workbench-metrics">
                                <div class="week-net">
                                    <dt>速记净额</dt>
                                    <dd>
                                        {{
                                            income.loadError.value
                                                ? '未读取'
                                                : accountValueText(weekTotal, 'cash')
                                        }}
                                    </dd>
                                </div>
                                <div>
                                    <dt>在线时长</dt>
                                    <dd>
                                        {{
                                            online.loadError.value
                                                ? '未读取'
                                                : clockText(weekOnline.minutes)
                                        }}
                                    </dd>
                                </div>
                                <div>
                                    <dt>点卡消耗</dt>
                                    <dd>
                                        {{
                                            online.loadError.value
                                                ? '未读取'
                                                : accountValueText(weekOnline.cost, 'cash')
                                        }}
                                    </dd>
                                </div>
                                <div>
                                    <dt>进行中目标</dt>
                                    <dd>{{ goalsUnavailable ? '未读取' : `${ongoing.length} 项` }}</dd>
                                </div>
                            </dl>
                        </section>
                        <section class="workbench-period" aria-labelledby="overview-month-title">
                            <h3 id="overview-month-title">
                                <span class="period-icon"><AppIcon name="accounts" /></span>
                                近一个月
                            </h3>
                            <table class="month-ledger" aria-labelledby="overview-month-title">
                                <thead>
                                    <tr>
                                        <th scope="col">币种</th>
                                        <th scope="col">收入</th>
                                        <th scope="col">支出</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="book in workbench.books" :key="book.currency">
                                        <th scope="row">{{ book.label }}</th>
                                        <td
                                            v-for="kind in moneyDirections"
                                            :key="kind"
                                            :data-kind="
                                                !accounts.loadError.value && book.stats[kind] > 0
                                                    ? kind
                                                    : undefined
                                            "
                                        >
                                            {{
                                                accounts.loadError.value
                                                    ? '未读取'
                                                    : accountValueText(book.stats[kind], book.currency)
                                            }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>
                    </div>
                </GlassCard>
            </section>

            <div class="overview-focus">
                <section aria-labelledby="overview-trend-title">
                    <GlassCard class="overview-card overview-trend" :radius="18">
                        <h2 id="overview-trend-title">收益趋势</h2>
                        <p v-if="trendNote" class="overview-note">{{ trendNote }}</p>
                        <TrendChart
                            v-else
                            class="chart-in-card"
                            :labels="week.map(({ date }) => date)"
                            :series="trend"
                            kind="money"
                            label="最近七天速记净额"
                            :height="170"
                        />
                    </GlassCard>
                </section>
                <section aria-labelledby="overview-goals-title">
                    <GlassCard class="overview-card overview-goal-card" :radius="18">
                        <h2 id="overview-goals-title">进行中的目标</h2>
                        <p v-if="goalsUnavailable || !ongoing.length" class="overview-note">
                            {{ goalEmptyText }}
                        </p>
                        <ul v-else class="overview-goals">
                            <li v-for="{ goal, summary } in ongoing.slice(0, 3)" :key="goal.id">
                                <div class="goal-copy">
                                    <h3>{{ goal.title }}</h3>
                                    <p class="goal-detail">
                                        <span class="goal-kind">{{ kindMeta(goal.kind).label }}</span>
                                        <span v-if="goal.tracking">
                                            {{ summary.achieved }} / {{ summary.totalMembers }} 个角色达标
                                        </span>
                                        <span v-else-if="goal.kind === 'combo'">
                                            {{ summary.achieved }} / {{ summary.total }} 项达标
                                        </span>
                                        <span v-if="goal.deadline">
                                            {{ deadlineText(goal.deadline, today, summary.done) }}
                                        </span>
                                    </p>
                                </div>
                                <div
                                    class="goal-progress"
                                    role="progressbar"
                                    :aria-label="`${goal.title}进度`"
                                    :aria-valuenow="summary.pct"
                                    :style="{ '--goal-progress': `${summary.pct}%` }"
                                >
                                    <span aria-hidden="true">{{ summary.pct }}%</span>
                                </div>
                            </li>
                        </ul>
                    </GlassCard>
                </section>
            </div>

            <section aria-labelledby="overview-team-title">
                <h2 id="overview-team-title">我的队伍</h2>
                <GlassCard
                    v-if="roster.loadError.value || !team.length"
                    class="overview-state"
                    :radius="18"
                >
                    <p class="overview-note">
                        {{ roster.loadError.value ? '角色未读取' : '暂无角色' }}
                    </p>
                </GlassCard>
                <div
                    v-else
                    class="overview-team lg-scroll-hidden"
                    role="region"
                    aria-label="队伍角色"
                    tabindex="0"
                >
                    <LiquidTeamCard
                        v-for="activity in team"
                        :key="activity.character.id"
                        :activity="activity"
                        :now="now"
                        :online-unavailable="!!online.loadError.value"
                        :income-unavailable="!!income.loadError.value"
                        :accounts-unavailable="!!accounts.loadError.value"
                    />
                </div>
            </section>

        </template>
    </section>
</template>

<style scoped src="./liquid-overview.css"></style>

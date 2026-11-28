<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import type { IconName } from '../../components/icons';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import TrendChart from '../../components/TrendChart.vue';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { useMinuteNow } from '../../composables/use-minute-now';
import { notify } from '../../composables/use-notify';
import { useToday } from '../../composables/use-today';
import { ledgerDirectionTone, ledgerMoneyTone } from '../../services/format';
import { hasDesktop } from '../../services/desktop';
import { startSavedFengyao, stopFengyao } from '../../services/fengyao';
import { accountValueText } from '../accounts/account-analysis';
import { rangeOf } from '../accounts/accounts';
import GoalProgress from '../goals/GoalProgress.vue';
import { clockText, onlineTotalsOf } from '../income/online';
import { useFengyaoWatch } from '../tools/use-fengyao-watch';
import LiquidTeamCard from './LiquidTeamCard.vue';
import { useLiquidOverviewData } from './liquid-overview-data';
import { activeGoals, weekSeries, workbenchSummary } from './overview';
import { teamActivity } from './team-activity';

const { roster, income, accounts, online, goals, loading, retrying, retrySource, loadOverview } =
    useLiquidOverviewData();
const router = useRouter();
const desktop = hasDesktop();
const { running, known, statusError, refreshing, busy, refreshStatus, runAction } =
    useFengyaoWatch(false);
const reminderAction = computed<{ label: string; text: string; icon: IconName }>(() => {
    if (statusError.value) {
        return { label: '重试读取监听状态', text: '重试提醒状态', icon: 'refresh' };
    }
    if (!known.value) {
        return { label: '正在读取监听状态', text: '读取提醒状态', icon: 'notice' };
    }
    return running.value
        ? { label: '停止公告监听', text: '停止提醒', icon: 'stop' }
        : { label: '按上次设置开启提醒助手', text: '开启提醒', icon: 'notice' };
});
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
const moneyDirections = [
    { kind: 'income', label: '收入' },
    { kind: 'expense', label: '支出' },
] as const;
const trendNote = computed(() => {
    if (income.loadError.value) return '收益未读取';
    if (week.value.some(({ net }) => net !== 0)) return '';
    return week.value.some(({ count }) => count > 0)
        ? '近七天每日净额均为零'
        : '近七天暂无速记记录';
});
const trendColors = ['var(--lg-progress-color)'];
const trend = computed(() => [
    { id: 'net', name: '净额', values: week.value.map(({ net }) => net) },
]);
const weekOnline = computed(() =>
    onlineTotalsOf(online.sessions.value, weekRange.value.from, weekRange.value.to, now.value),
);
const weekStats = computed<StatItem[]>(() => [
    metric(
        '速记净额',
        accountValueText(weekTotal.value, 'cash'),
        !!income.loadError.value || !!retrying.value.income,
        ledgerMoneyTone(weekTotal.value),
    ),
    metric(
        '在线时长',
        clockText(weekOnline.value.minutes),
        !!online.loadError.value || !!retrying.value.online,
    ),
    metric(
        '点卡消耗',
        accountValueText(weekOnline.value.cost, 'cash'),
        !!online.loadError.value || !!retrying.value.online,
        ledgerMoneyTone(weekOnline.value.cost, 'expense'),
    ),
    metric('进行中目标', ongoing.value.length + ' 项', goalsUnavailable.value),
]);
function metric(
    cap: string,
    value: string,
    unavailable: boolean,
    tone: StatItem['tone'] = 'num',
): StatItem {
    return { cap, value: unavailable ? '未读取' : value, unavailable, tone };
}
const workbench = computed(() => workbenchSummary(accounts.entries.value, today.value));
const monthBooks = computed(() =>
    workbench.value.books.map((book) => ({
        ...book,
        readings: moneyDirections.map(({ kind, label }) =>
            metric(
                label,
                accountValueText(book.stats[kind], book.currency),
                !!accounts.loadError.value || !!retrying.value.accounts,
                ledgerDirectionTone(kind),
            ),
        ),
    })),
);
const goalEmptyText = computed(() => {
    if (goalsUnavailable.value) return '目标未读取';
    return goals.goals.value.length ? '目标已全部达成' : '暂无目标';
});

async function toggleFengyaoFromOverview() {
    if (!known.value) {
        await refreshStatus();
        return;
    }
    const stopping = running.value;
    const route = router.currentRoute.value;
    try {
        await runAction(async () => {
            if (stopping) {
                const next = await stopFengyao();
                if (!next.running) notify.success('公告监听已停止');
                return next;
            }
            const result = await startSavedFengyao();
            if (result.status.running) {
                notify.success(result.started ? '提醒助手已按上次设置开启' : '提醒助手正在监听');
            }
            return result.status;
        });
    } catch (cause) {
        notify.error(cause instanceof Error ? cause.message : String(cause));
        if (!stopping && router.currentRoute.value === route) {
            void router.push({ name: 'tool-fengyao' });
        }
    }
}

onMounted(() => {
    void loadOverview();
});
</script>

<template>
    <section class="liquid-overview" aria-labelledby="liquid-overview-title">
        <h1 id="liquid-overview-title">总览</h1>
        <GlassCard v-if="loading" class="overview-state" :radius="18">
            <p role="status">正在读取总览…</p>
        </GlassCard>
        <template v-else>
            <section class="overview-periods" aria-label="周月统计与快捷操作">
                <GlassCard
                    class="overview-card workbench-period"
                    :radius="18"
                    aria-labelledby="overview-week-title"
                >
                    <h3 id="overview-week-title">
                        <span class="period-icon"><AppIcon name="calendar" /></span>
                        近一周
                    </h3>
                    <StatStrip
                        class="workbench-summary workbench-metrics"
                        surface="bare"
                        :items="weekStats"
                        centered
                    />
                    <div
                        v-if="
                            income.loadError.value ||
                            online.loadError.value ||
                            retrying.income ||
                            retrying.online
                        "
                        class="overview-retries"
                    >
                        <GlassButton
                            v-if="income.loadError.value || retrying.income"
                            size="small"
                            :disabled="retrying.income"
                            @click="retrySource('income')"
                        >
                            {{ retrying.income ? '正在读取收益…' : '重试收益' }}
                        </GlassButton>
                        <GlassButton
                            v-if="online.loadError.value || retrying.online"
                            size="small"
                            :disabled="retrying.online"
                            @click="retrySource('online')"
                        >
                            {{ retrying.online ? '正在读取上线…' : '重试上线' }}
                        </GlassButton>
                    </div>
                </GlassCard>
                <GlassCard
                    class="overview-card workbench-period"
                    :radius="18"
                    aria-labelledby="overview-month-title"
                >
                    <h3 id="overview-month-title">
                        <span class="period-icon"><AppIcon name="accounts" /></span>
                        近一个月
                    </h3>
                    <div class="workbench-summary month-books">
                        <div
                            v-for="book in monthBooks"
                            :key="book.currency"
                            class="month-book"
                            role="group"
                            :aria-label="book.label"
                        >
                            <span class="month-book-label">{{ book.label }}</span>
                            <StatStrip surface="bare" :items="book.readings" centered />
                        </div>
                    </div>
                    <div
                        v-if="accounts.loadError.value || retrying.accounts"
                        class="overview-retries"
                    >
                        <GlassButton
                            size="small"
                            :disabled="retrying.accounts"
                            @click="retrySource('accounts')"
                        >
                            {{ retrying.accounts ? '正在读取账号…' : '重试账号' }}
                        </GlassButton>
                    </div>
                </GlassCard>
                <GlassCard
                    class="overview-card workbench-period workbench-shortcuts"
                    :radius="18"
                    aria-labelledby="overview-shortcuts-title"
                >
                    <h3 id="overview-shortcuts-title">快捷操作</h3>
                    <div class="workbench-actions">
                        <GlassButton
                            size="small"
                            class="overview-workbench-action"
                            aria-label="选择角色上线"
                            @click="router.push({ name: 'income', query: { action: 'start' } })"
                        >
                            <AppIcon name="play" />上线
                        </GlassButton>

                        <GlassButton
                            size="small"
                            class="overview-workbench-action"
                            aria-label="记一笔账号收支"
                            @click="router.push({ name: 'accounts', query: { action: 'new' } })"
                        >
                            <AppIcon name="edit" />记一笔
                        </GlassButton>

                        <GlassButton
                            size="small"
                            class="overview-workbench-action"
                            aria-label="打开装备和召唤兽仓库"
                            @click="
                                router.push({
                                    name: 'accounts',
                                    query: { action: 'warehouse' },
                                })
                            "
                        >
                            <AppIcon name="archive" />仓库
                        </GlassButton>

                        <GlassButton
                            v-if="desktop"
                            size="small"
                            class="overview-workbench-action"
                            :aria-label="reminderAction.label"
                            :disabled="busy || (!known && (!statusError || refreshing))"
                            @click="toggleFengyaoFromOverview"
                        >
                            <AppIcon :name="reminderAction.icon" />
                            {{ reminderAction.text }}
                        </GlassButton>
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
                            :colors="trendColors"
                            kind="money"
                            label="最近七天速记净额"
                            :height="170"
                        />
                    </GlassCard>
                </section>
                <section aria-labelledby="overview-goals-title">
                    <GlassCard class="overview-card overview-goal-card" :radius="18">
                        <header class="overview-section-head">
                            <h2 id="overview-goals-title">目标</h2>
                            <GlassButton size="small" @click="router.push({ name: 'goals' })">
                                查看全部
                            </GlassButton>
                        </header>
                        <div v-if="goalsUnavailable || !ongoing.length" class="overview-goal-empty">
                            <p class="overview-note">{{ goalEmptyText }}</p>
                            <GlassButton
                                v-if="goals.loadError.value || retrying.goals"
                                size="small"
                                :disabled="retrying.goals"
                                @click="retrySource('goals')"
                            >
                                {{ retrying.goals ? '正在读取目标…' : '重试目标' }}
                            </GlassButton>
                            <GlassButton
                                v-if="!goalsUnavailable"
                                size="small"
                                aria-label="新建目标"
                                @click="router.push({ name: 'goals', query: { action: 'new' } })"
                            >
                                <AppIcon name="add" />
                                新增
                            </GlassButton>
                        </div>
                        <ul v-else class="overview-goals">
                            <li v-for="{ goal, summary } in ongoing.slice(0, 6)" :key="goal.id">
                                <RouterLink
                                    class="overview-goal-link"
                                    :to="{
                                        name: 'goals',
                                        query: { action: 'update', goal: goal.id },
                                    }"
                                    :aria-label="`更新目标：${goal.title}`"
                                >
                                    <h3>{{ goal.title }}</h3>
                                    <GoalProgress
                                        shape="ring"
                                        glass
                                        compact
                                        :percent="summary.pct"
                                        :label="`${goal.title}进度`"
                                    />
                                </RouterLink>
                            </li>
                        </ul>
                    </GlassCard>
                </section>
            </div>

            <section aria-label="我的队伍">
                <GlassCard
                    v-if="roster.loadError.value || !team.length"
                    class="overview-state"
                    :radius="18"
                >
                    <p class="overview-note">
                        {{ roster.loadError.value ? '角色未读取' : '暂无角色' }}
                    </p>
                    <GlassButton
                        v-if="roster.loadError.value || retrying.roster"
                        size="small"
                        :disabled="retrying.roster"
                        @click="retrySource('roster')"
                    >
                        {{ retrying.roster ? '正在读取角色…' : '重试角色' }}
                    </GlassButton>
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

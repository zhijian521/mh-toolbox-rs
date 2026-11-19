<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import LedgerSection from '../../components/LedgerSection.vue';
import PageShell from '../../components/PageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useToday } from '../../composables/use-today';
import { ledgerMoneyText } from '../../services/format';
import { accountValueText } from '../accounts/account-analysis';
import { rangeOf } from '../accounts/accounts';
import { useAccounts } from '../accounts/accounts-store';
import { useDailySync } from '../accounts/daily-sync';
import { useRoster } from '../characters/roster';
import { useGoals } from '../goals/goals-store';
import { useIncome } from '../income/income-store';
import { clockText, onlineTotalsOf, ownersOf } from '../income/online';
import { useOnline } from '../income/online-store';
import TrendChart from '../../components/TrendChart.vue';
import { activeGoals, weekSeries, workbenchSummary } from './overview';
import TeamCard from './TeamCard.vue';
import OverviewShortcuts from './OverviewShortcuts.vue';
import OverviewGoals from './OverviewGoals.vue';
import { teamActivity } from './team-activity';

const router = useRouter();
const today = useToday();
const now = useMinuteNow();
const { roster, loadError: rosterError } = useRoster();
const { entries, loadError: incomeError } = useIncome();
const { entries: accounts, loadError: accountError } = useAccounts();
const { goals, loadError: goalError } = useGoals();
const {
    sessions,
    loadError: onlineError,
    writeError: onlineWriteError,
    pending: onlinePending,
    retry: retryOnline,
} = useOnline();
const { error: syncError } = useDailySync();
const sourceErrors = computed(() =>
    [
        { label: '角色', error: rosterError.value },
        { label: '收益', error: incomeError.value },
        { label: '账号', error: accountError.value },
        { label: '目标', error: goalError.value },
        { label: '上线', error: onlineError.value },
        { label: '自动记账', error: syncError.value },
    ].filter((one) => one.error),
);
const onlineIds = computed(
    () => new Set(sessions.value.filter((one) => one.endAt === null).flatMap(ownersOf)),
);
const onlineCount = computed(
    () => roster.value.filter((one) => onlineIds.value.has(one.id)).length,
);
const weekRange = computed(() => rangeOf('week', today.value));
const weekOnline = computed(() =>
    onlineTotalsOf(sessions.value, weekRange.value.from, weekRange.value.to, now.value),
);
const team = computed(() =>
    teamActivity(roster.value, entries.value, sessions.value, accounts.value),
);
const timerDisabled = computed(
    () =>
        !!rosterError.value ||
        !!onlineError.value ||
        !!onlineWriteError.value ||
        onlinePending.value > 0,
);
const ongoing = computed(() => activeGoals(goals.value, roster.value));
const week = computed(() => weekSeries(entries.value, today.value));
const weekTotal = computed(() => week.value.reduce((sum, day) => sum + day.net, 0));
const trend = computed(() => [
    { id: 'net', name: '净额', values: week.value.map((day) => day.net) },
]);
const workbench = computed(() => workbenchSummary(accounts.value, today.value));
const booksUnavailable = computed(
    () => !!(accountError.value || incomeError.value || onlineError.value || syncError.value),
);
const netText = (amount: number) => ledgerMoneyText(amount, 'cash', { sign: 'auto' });
const tone = (amount: number): StatItem['tone'] =>
    amount > 0 ? 'gain' : amount < 0 ? 'loss' : 'num';
const weekStats = computed<StatItem[]>(() => [
    {
        id: 'net',
        cap: '速记净额',
        value: incomeError.value ? '未读取' : netText(weekTotal.value),
        tone: tone(weekTotal.value),
        unavailable: !!incomeError.value,
    },
    {
        id: 'online',
        cap: '在线时长',
        value: onlineError.value ? '未读取' : clockText(weekOnline.value.minutes),
        unavailable: !!onlineError.value,
    },
    {
        id: 'card-cost',
        cap: '点卡消耗',
        value: onlineError.value ? '未读取' : ledgerMoneyText(weekOnline.value.cost, 'cash'),
        unavailable: !!onlineError.value,
    },
    {
        id: 'goals',
        cap: '进行中目标',
        hint: '当前仍在进行的目标数量',
        value: goalError.value || rosterError.value ? '未读取' : String(ongoing.value.length),
        unit: goalError.value || rosterError.value ? '' : '项',
        unavailable: !!(goalError.value || rosterError.value),
    },
]);
const monthStats = computed<StatItem[]>(() =>
    workbench.value.books.flatMap((book) =>
        (['income', 'expense'] as const).map<StatItem>((kind) => ({
            id: `${book.currency}-${kind}`,
            cap: book.label + (kind === 'income' ? '收入' : '支出'),
            value: booksUnavailable.value
                ? '未读取'
                : accountValueText(book.stats[kind], book.currency),
            tone: kind === 'income' ? 'gain' : 'loss',
            unavailable: booksUnavailable.value,
        })),
    ),
);
</script>

<template>
    <PageShell title="总览" desc="工作台 · 常用功能">
        <div class="overview day-workbench">
            <div v-if="sourceErrors.length" class="source-errors" role="status">
                <p v-for="one in sourceErrors" :key="one.label" class="note error">
                    {{ one.label }}：{{ one.error }}
                </p>
            </div>
            <SaveNotice :error="onlineWriteError" :pending="onlinePending" @retry="retryOnline" />
            <PaperCard class="day-hero" plain>
                <div class="day-intro">
                    <span class="eyebrow">日常 · 养成 · 收获</span>
                    <h2>工作台</h2>
                    <p v-if="rosterError || onlineError || goalError" class="empty-note inline">
                        部分数据未读取
                    </p>
                    <p v-else>
                        {{ roster.length }} 个角色，{{ onlineCount }} 个在线，{{ ongoing.length }}
                        项目标进行中。
                    </p>
                    <div class="hero-actions">
                        <PressButton
                            icon="play"
                            text="上线"
                            label="选择角色开始计时"
                            seal
                            :disabled="timerDisabled || !roster.length"
                            @click="router.push({ path: '/income', query: { action: 'start' } })"
                        />
                        <PressButton
                            icon="edit"
                            text="补记"
                            label="补记在线：补录过去时段"
                            @click="router.push({ path: '/income', query: { action: 'backfill' } })"
                        />
                        <PressButton
                            icon="scan"
                            text="截图更新"
                            label="选择角色截图更新"
                            @click="router.push('/characters')"
                        />
                    </div>
                </div>
                <div class="workbench-readouts">
                    <StatStrip
                        class="workbench-today"
                        surface="embedded"
                        heading="近一周"
                        icon="calendar"
                        :hint="weekRange.from + ' 至 ' + weekRange.to"
                        :items="weekStats"
                        aria-label="近一周概览"
                    />
                    <StatStrip
                        class="workbench-accounts"
                        surface="embedded"
                        heading="近一个月"
                        icon="accounts"
                        :hint="workbench.range.from + ' 至 ' + workbench.range.to"
                        :items="monthStats"
                        aria-label="收支概览"
                        aria-live="polite"
                        aria-atomic="true"
                    />
                </div>
            </PaperCard>
            <div class="day-grid">
                <OverviewShortcuts />
                <OverviewGoals
                    :goals="ongoing"
                    :has-goals="goals.length > 0"
                    :error="!!(goalError || rosterError)"
                    :today="today"
                />
            </div>
            <LedgerSection title="收益趋势" class="trend-section" plain>
                <p v-if="incomeError" class="empty-note">收益未读取</p>
                <TrendChart
                    v-else
                    class="chart-in-card"
                    :labels="week.map((day) => day.date)"
                    :series="trend"
                    kind="money"
                    label="最近七天收益"
                    :height="180"
                />
            </LedgerSection>
            <LedgerSection title="我的队伍" class="team-section" plain>
                <template #actions
                    ><PressButton
                        icon="add"
                        text="新增"
                        label="新建角色"
                        size="sm"
                        :disabled="!!rosterError"
                        @click="
                            router.push({ path: '/characters', query: { action: 'new' } })
                        " /><PressButton
                        icon="characters"
                        text="管理"
                        label="管理全部角色"
                        size="sm"
                        @click="router.push('/characters')"
                /></template>
                <p v-if="rosterError" class="empty-note">角色未读取</p>
                <p v-else-if="!team.length" class="section-empty empty-note">暂无角色</p>
                <div v-else class="team-strip" tabindex="0" aria-label="队伍角色，左右滚动查看">
                    <TeamCard
                        v-for="one in team"
                        :key="one.character.id"
                        :activity="one"
                        :now="now"
                        :online-error="onlineError"
                        :income-error="incomeError"
                        :account-error="accountError"
                    />
                </div>
            </LedgerSection>
        </div>
    </PageShell>
</template>

<style scoped src="./overview.css"></style>

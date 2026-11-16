<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import LedgerSection from '../../components/LedgerSection.vue';
import PageShell from '../../components/PageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useToday } from '../../composables/use-today';
import { ledgerMoneyText } from '../../services/format';
import { accountValueText, filterAccounts } from '../accounts/account-analysis';
import { accountStatsByCurrency, rangeOf, type Currency } from '../accounts/accounts';
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
const weekCount = computed(() => week.value.reduce((sum, day) => sum + day.count, 0));
const trend = computed(() => [
    { id: 'net', name: '净额', values: week.value.map((day) => day.net) },
]);
const workbench = computed(() => workbenchSummary(accounts.value, today.value));
const booksUnavailable = computed(
    () => !!(accountError.value || incomeError.value || onlineError.value || syncError.value),
);
const books = computed(() => {
    const month = filterAccounts(accounts.value, rangeOf('month', today.value));
    const stats = accountStatsByCurrency(month);
    return (['rmb', 'cash'] as Currency[]).map((currency) => ({
        currency,
        label: currency === 'rmb' ? '人民币' : '梦幻币',
        stats: stats[currency],
    }));
});
const netText = (amount: number) => ledgerMoneyText(amount, 'cash', { sign: 'auto' });
const tone = (amount: number) => (amount > 0 ? 'gain' : amount < 0 ? 'loss' : '');
</script>

<template>
    <PageShell title="总览" desc="工作台 · 常用功能">
        <template #actions
            ><PressButton
                icon="history"
                text="历史"
                label="查看收益历史"
                @click="router.push({ path: '/income', query: { action: 'history' } })"
        /></template>
        <div class="overview day-workbench">
            <div v-if="sourceErrors.length" class="source-errors" role="status">
                <p v-for="one in sourceErrors" :key="one.label" class="note error">
                    {{ one.label }}：{{ one.error }}
                </p>
            </div>
            <SaveNotice :error="onlineWriteError" :pending="onlinePending" @retry="retryOnline" />
            <PaperCard class="day-hero">
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
                    <section class="workbench-today" aria-label="近一周概览">
                        <header
                            class="readouts-head"
                            :title="weekRange.from + ' 至 ' + weekRange.to"
                        >
                            <h3>近一周</h3>
                        </header>
                        <div class="day-stats">
                            <div>
                                <span>速记净额</span
                                ><b class="num" :class="incomeError ? '' : tone(weekTotal)">{{
                                    incomeError ? '未读取' : netText(weekTotal)
                                }}</b>
                            </div>
                            <div>
                                <span>在线时长</span
                                ><b class="num">{{
                                    onlineError ? '未读取' : clockText(weekOnline.minutes)
                                }}</b>
                            </div>
                            <div>
                                <span>点卡消耗</span
                                ><b class="num">{{
                                    onlineError
                                        ? '未读取'
                                        : ledgerMoneyText(weekOnline.cost, 'cash')
                                }}</b>
                            </div>
                            <div>
                                <span title="当前仍在进行的目标数量">进行中目标</span
                                ><b class="num"
                                    >{{ goalError || rosterError ? '未读取' : ongoing.length
                                    }}<small v-if="!goalError && !rosterError">项</small></b
                                >
                            </div>
                        </div>
                    </section>
                    <section class="workbench-accounts" aria-label="收支概览">
                        <header
                            class="readouts-head"
                            :title="workbench.range.from + ' 至 ' + workbench.range.to"
                        >
                            <h3>近一个月</h3>
                        </header>
                        <div class="day-stats" aria-live="polite" aria-atomic="true">
                            <template v-for="book in workbench.books" :key="book.currency">
                                <div
                                    v-for="kind in ['income', 'expense'] as const"
                                    :key="kind"
                                    :data-currency="book.currency"
                                    :data-kind="kind"
                                >
                                    <span
                                        >{{ book.label
                                        }}{{ kind === 'income' ? '收入' : '支出' }}</span
                                    >
                                    <b
                                        class="num"
                                        :class="
                                            booksUnavailable
                                                ? ''
                                                : kind === 'income'
                                                  ? 'gain'
                                                  : 'loss'
                                        "
                                        >{{
                                            booksUnavailable
                                                ? '未读取'
                                                : accountValueText(book.stats[kind], book.currency)
                                        }}</b
                                    >
                                </div>
                            </template>
                        </div>
                    </section>
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
            <LedgerSection
                title="我的队伍"
                :hint="rosterError ? '' : roster.length + ' 个角色'"
                class="team-section"
            >
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
            <div class="day-lower">
                <LedgerSection
                    title="最近收益"
                    :hint="incomeError ? '' : weekCount + ' 笔'"
                    class="week-section"
                >
                    <template #actions
                        ><PressButton
                            text="明细"
                            label="查看收益明细"
                            size="sm"
                            @click="router.push({ path: '/income', query: { action: 'history' } })"
                    /></template>
                    <p v-if="incomeError" class="empty-note">收益未读取</p>
                    <template v-else>
                        <div class="week-summary">
                            <b class="num" :class="tone(weekTotal)">{{ netText(weekTotal) }}</b
                            ><span>最近 7 天 · 速记净额</span>
                        </div>
                        <TrendChart
                            :labels="week.map((day) => day.date)"
                            :series="trend"
                            kind="money"
                            label="最近七天收益"
                            :height="150"
                        />
                    </template>
                </LedgerSection>
                <LedgerSection title="本月收支" class="accounts-section">
                    <template #actions
                        ><PressButton
                            text="账号"
                            label="查看账号收支"
                            size="sm"
                            @click="router.push('/accounts')"
                    /></template>
                    <p v-if="accountError" class="empty-note">账号收支未读取</p>
                    <template v-else>
                        <div class="books">
                            <section
                                v-for="book in books"
                                :key="book.currency"
                                class="book"
                                :data-currency="book.currency"
                            >
                                <header>
                                    <h3>{{ book.label }}</h3>
                                    <span>{{ book.stats.count }} 笔</span>
                                </header>
                                <div
                                    class="book-values"
                                    role="list"
                                    :aria-label="book.label + '本月收支'"
                                >
                                    <PressTile class="book-cell" still role="listitem"
                                        ><span class="book-cell-cap">收入</span
                                        ><b class="num gain">{{
                                            accountValueText(book.stats.income, book.currency)
                                        }}</b></PressTile
                                    >
                                    <PressTile class="book-cell" still role="listitem"
                                        ><span class="book-cell-cap">支出</span
                                        ><b class="num loss">{{
                                            accountValueText(book.stats.expense, book.currency)
                                        }}</b></PressTile
                                    >
                                    <PressTile class="book-cell" still role="listitem"
                                        ><span class="book-cell-cap">净额</span
                                        ><b class="num" :class="tone(book.stats.net)">{{
                                            accountValueText(book.stats.net, book.currency)
                                        }}</b></PressTile
                                    >
                                </div>
                            </section>
                        </div>
                    </template>
                </LedgerSection>
            </div>
        </div>
    </PageShell>
</template>

<style scoped src="./overview.css"></style>

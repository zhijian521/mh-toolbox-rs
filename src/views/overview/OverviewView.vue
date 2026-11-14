<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import ModalShell from '../../components/ModalShell.vue';
import PageShell from '../../components/PageShell.vue';
import PaperCard from '../../components/PaperCard.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { notify } from '../../composables/use-notify';
import { useToday } from '../../composables/use-today';
import { ledgerMoneyText } from '../../services/format';
import { openExternal } from '../../services/desktop';
import { readHomeShortcuts, saveHomeShortcuts } from '../../services/home-shortcuts';
import ShortcutEditor from './ShortcutEditor.vue';
import { normalizeShortcutIds, shortcutsByIds, type HomeShortcut } from './shortcuts';
import { accountValueText, filterAccounts } from '../accounts/account-analysis';
import { accountStats, rangeOf, type Currency } from '../accounts/accounts';
import { useAccounts } from '../accounts/accounts-store';
import { useDailySync } from '../accounts/daily-sync';
import { useRoster } from '../characters/roster';
import GoalProgress from '../goals/GoalProgress.vue';
import { deadlineText, kindMeta } from '../goals/goals';
import { useGoals } from '../goals/goals-store';
import { totalsOf } from '../income/income';
import { useIncome } from '../income/income-store';
import { clockText, onlineTotalsOf, ownersOf } from '../income/online';
import { useOnline } from '../income/online-store';
import TrendChart from '../income/TrendChart.vue';
import { activeGoals, weekSeries } from './overview';
import TeamCard from './TeamCard.vue';
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
const onlineIds = computed(
    () => new Set(sessions.value.filter((one) => one.endAt === null).flatMap(ownersOf)),
);
const onlineCount = computed(
    () => roster.value.filter((one) => onlineIds.value.has(one.id)).length,
);
const todayNet = computed(
    () => totalsOf(entries.value.filter((one) => one.date === today.value)).net,
);
const todayOnline = computed(() =>
    onlineTotalsOf(sessions.value, today.value, today.value, now.value),
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
const shortcutIds = ref(normalizeShortcutIds(readHomeShortcuts()));
const shortcuts = computed(() => shortcutsByIds(shortcutIds.value));
const customizingShortcuts = ref(false);
const shortcutSaveError = ref('');
const characterShortcut = ref<HomeShortcut | null>(null);
function customizeShortcuts() {
    shortcutSaveError.value = '';
    customizingShortcuts.value = true;
}
function saveShortcuts(ids: string[]) {
    const next = normalizeShortcutIds(ids);
    if (!saveHomeShortcuts(next)) {
        shortcutSaveError.value = '常用功能未保存，请重试';
        return;
    }
    shortcutIds.value = next;
    customizingShortcuts.value = false;
}
function openCharacterShortcut(one: HomeShortcut, id: string) {
    characterShortcut.value = null;
    void router.push({
        path: one.path,
        query: { action: one.action, pane: one.pane, character: id },
    });
}
async function openShortcut(one: HomeShortcut) {
    if (one.href) {
        if (!(await openExternal(one.href))) notify.error('没能打开浏览器');
        return;
    }
    if (one.pane) {
        if (rosterError.value) {
            notify.error(rosterError.value);
            return;
        }
        if (roster.value.length === 1) {
            openCharacterShortcut(one, roster.value[0].id);
            return;
        }
        characterShortcut.value = one;
        return;
    }
    void router.push({ path: one.path, query: { action: one.action } });
}
const ongoing = computed(() => activeGoals(goals.value, roster.value));
const visibleGoals = computed(() => ongoing.value.slice(0, 3));
const week = computed(() => weekSeries(entries.value, today.value));
const weekTotal = computed(() => week.value.reduce((sum, day) => sum + day.net, 0));
const weekCount = computed(() => week.value.reduce((sum, day) => sum + day.count, 0));
const trend = computed(() => [
    { id: 'net', name: '净额', values: week.value.map((day) => day.net) },
]);
const books = computed(() => {
    const month = filterAccounts(accounts.value, rangeOf('month', today.value));
    return (['rmb', 'cash'] as Currency[]).map((currency) => ({
        currency,
        label: currency === 'rmb' ? '人民币' : '梦幻币',
        stats: accountStats(month, currency),
    }));
});
const netText = (amount: number) => ledgerMoneyText(amount, 'cash', { sign: 'auto' });
const tone = (amount: number) => (amount > 0 ? 'gain' : amount < 0 ? 'loss' : '');
</script>

<template>
    <PageShell title="总览" :desc="today">
        <template #actions
            ><PressButton
                icon="history"
                text="历史"
                label="查看收益历史"
                @click="router.push({ path: '/income', query: { action: 'history' } })"
        /></template>
        <div class="overview day-workbench">
            <SaveNotice :error="onlineWriteError" :pending="onlinePending" @retry="retryOnline" />
            <PaperCard class="day-hero">
                <div class="day-intro">
                    <span class="eyebrow">日常 · 养成 · 收获</span>
                    <h2>今日工作台</h2>
                    <p
                        v-if="rosterError || onlineError || goalError"
                        class="note error"
                        role="status"
                    >
                        {{ rosterError || onlineError || goalError }}
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
                <div class="day-stats" aria-label="今日概览">
                    <div>
                        <span>今日速记净额</span
                        ><b class="num" :class="incomeError ? '' : tone(todayNet)">{{
                            incomeError ? '未读取' : netText(todayNet)
                        }}</b>
                    </div>
                    <div>
                        <span>今日在线</span
                        ><b class="num">{{
                            onlineError ? '未读取' : clockText(todayOnline.minutes)
                        }}</b>
                    </div>
                    <div>
                        <span>点卡消耗</span
                        ><b class="num">{{
                            onlineError ? '未读取' : ledgerMoneyText(todayOnline.cost, 'cash')
                        }}</b>
                    </div>
                    <div>
                        <span>进行中目标</span
                        ><b class="num"
                            >{{ goalError || rosterError ? '未读取' : ongoing.length
                            }}<small v-if="!goalError && !rosterError">项</small></b
                        >
                    </div>
                </div>
            </PaperCard>
            <div class="day-grid">
                <LedgerSection title="常用功能" class="shortcuts-section">
                    <template #actions
                        ><PressButton
                            icon="settings"
                            text="自定义"
                            label="自定义常用功能"
                            size="sm"
                            @click="customizeShortcuts"
                    /></template>
                    <div v-if="shortcuts.length" class="shortcut-grid">
                        <button
                            v-for="one in shortcuts"
                            :key="one.id"
                            type="button"
                            class="workbench-shortcut"
                            :data-shortcut-id="one.id"
                            :data-tone="one.tone"
                            :aria-label="
                                one.text +
                                '：' +
                                one.description +
                                (one.href ? '，在浏览器中打开' : '')
                            "
                            :title="one.description"
                            @click="openShortcut(one)"
                        >
                            <PressTile class="shortcut-face">
                                <span class="shortcut-icon"><AppIcon :name="one.icon" /></span>
                                <span class="shortcut-copy">
                                    <span class="shortcut-name">{{ one.text }}</span>
                                    <small>{{ one.description }}</small>
                                </span>
                            </PressTile>
                        </button>
                    </div>
                    <div v-else class="empty">
                        <PressButton
                            icon="add"
                            text="添加功能"
                            label="添加常用功能"
                            @click="customizeShortcuts"
                        />
                    </div>
                </LedgerSection>
                <LedgerSection title="目标" class="goals-section">
                    <template #actions
                        ><PressButton
                            text="全部"
                            label="查看全部目标"
                            size="sm"
                            @click="router.push('/goals')"
                    /></template>
                    <p v-if="goalError || rosterError" class="note error" role="status">
                        {{ goalError || rosterError }}
                    </p>
                    <div v-else-if="!ongoing.length" class="empty">
                        <p>{{ goals.length ? '目标已全部达成' : '暂无养成计划' }}</p>
                        <PressButton
                            icon="add"
                            text="新增"
                            label="新建养成目标"
                            size="sm"
                            @click="router.push({ path: '/goals', query: { action: 'new' } })"
                        />
                    </div>
                    <div v-else class="goal-list">
                        <RouterLink
                            v-for="(one, index) in visibleGoals"
                            :key="one.goal.id"
                            class="goal-row"
                            :to="{ path: '/goals', query: { action: 'update', goal: one.goal.id } }"
                            :aria-label="'更新目标：' + one.goal.title"
                        >
                            <span class="focus-number num">{{
                                String(index + 1).padStart(2, '0')
                            }}</span>
                            <div class="focus-copy">
                                <div class="goal-line">
                                    <h3>{{ one.goal.title }}</h3>
                                    <b class="num">{{ one.summary.pct }}%</b>
                                </div>
                                <p class="goal-meta">
                                    <span>{{ kindMeta(one.goal.kind).label }}</span
                                    ><span v-if="one.goal.tracking"
                                        >{{ one.summary.achieved }} /
                                        {{ one.summary.totalMembers }} 个角色达标</span
                                    ><span v-else-if="one.goal.members.length"
                                        >{{ one.goal.members.length }} 个角色</span
                                    ><span v-if="one.goal.deadline">{{
                                        deadlineText(one.goal.deadline, today, one.summary.done)
                                    }}</span>
                                </p>
                                <GoalProgress
                                    :percent="one.summary.pct"
                                    :label="one.goal.title + '进度'"
                                />
                            </div>
                            <AppIcon name="chevron-right" class="goal-arrow" />
                        </RouterLink>
                    </div>
                </LedgerSection>
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
                <p v-if="rosterError" class="note error" role="status">{{ rosterError }}</p>
                <p v-else-if="!team.length" class="empty">暂无角色</p>
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
                <p
                    v-if="onlineError || incomeError || accountError"
                    class="note error"
                    role="status"
                >
                    {{ onlineError || incomeError || accountError }}
                </p>
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
                    <p v-if="incomeError" class="note error" role="status">{{ incomeError }}</p>
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
                    <p v-if="accountError" class="note error" role="status">{{ accountError }}</p>
                    <template v-else>
                        <p v-if="syncError" class="note error" role="status">{{ syncError }}</p>
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
        <ShortcutEditor
            v-if="customizingShortcuts"
            :ids="shortcutIds"
            :error="shortcutSaveError"
            @save="saveShortcuts"
            @close="customizingShortcuts = false"
        />
        <ModalShell
            v-if="characterShortcut"
            :title="'选择角色 · ' + characterShortcut.text"
            :width="420"
            @close="characterShortcut = null"
        >
            <div v-if="roster.length" class="shortcut-character-list">
                <PressButton
                    v-for="character in roster"
                    :key="character.id"
                    :text="character.name || '未命名'"
                    :label="'打开' + characterShortcut.text + '：' + character.name"
                    @click="openCharacterShortcut(characterShortcut, character.id)"
                />
            </div>
            <div v-else class="empty">
                <p>暂无角色</p>
                <PressButton
                    icon="add"
                    text="新增"
                    label="新建角色后使用此功能"
                    @click="router.push({ path: '/characters', query: { action: 'new' } })"
                />
            </div>
        </ModalShell>
    </PageShell>
</template>

<style scoped>
.overview {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
}
.overview > * {
    min-width: 0;
}
.overview :deep(.board) {
    background-image: var(--income-board-texture);
}
.day-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 28px;
    padding: 24px 26px;
}
.eyebrow {
    font-size: var(--fs-mini);
    color: var(--muted);
    letter-spacing: 0.12em;
}
.day-intro h2 {
    margin: 8px 0 10px;
    font-size: calc(var(--fs-xl) * 1.25);
    color: var(--accent);
}
.day-intro > p {
    color: var(--muted);
    font-size: var(--fs-sm);
}
.day-intro > .error {
    color: var(--negative);
}
.hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
}
.day-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 24px;
    padding-left: 28px;
    border-left: var(--w-hair) solid var(--rule);
}
.day-stats > div {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 7px;
}
.day-stats span {
    font-size: var(--fs-xs);
    color: var(--muted);
}
.day-stats b {
    color: var(--accent);
    font-size: var(--fs-amount);
    font-weight: 400;
    overflow-wrap: anywhere;
}
.day-stats small {
    margin-left: 5px;
    font-size: var(--fs-xs);
    color: var(--muted);
}
.day-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: 16px;
    align-items: stretch;
}
.day-grid > *,
.day-lower > * {
    min-width: 0;
}
.shortcuts-section {
    align-self: start;
    display: flex;
    flex-direction: column;
}
.shortcuts-section :deep(.section-body) {
    flex: 1;
    display: flex;
}
.shortcut-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, max(calc(126px * var(--fs-scale)), calc((100% - 30px) / 4))), 1fr)
    );
    gap: 10px;
    align-content: start;
    padding: 2px 0 5px;
}
.workbench-shortcut {
    --shortcut-ink: var(--accent);
    --tile-face: color-mix(in srgb, var(--shortcut-ink) 5%, var(--paper));
    --tile-face-hover: color-mix(in srgb, var(--shortcut-ink) 9%, var(--paper));
    --tile-face-active: color-mix(in srgb, var(--shortcut-ink) 6%, var(--well));
    display: flex;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
}
.workbench-shortcut[data-tone='indigo'] {
    --shortcut-ink: var(--indigo-ink);
}
.workbench-shortcut[data-tone='moss'] {
    --shortcut-ink: var(--moss);
}
.workbench-shortcut[data-tone='ochre'] {
    --shortcut-ink: var(--ochre);
}
.shortcut-face {
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-2);
    --tile-drop: 1.4;
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: calc(76px * var(--fs-scale));
    padding: 9px 10px;
}
.shortcut-face :deep(.press-content) {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-width: 0;
}
.shortcut-face::after {
    content: '';
    position: absolute;
    top: 7px;
    right: 7px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--shortcut-ink) 30%, transparent);
    box-shadow:
        inset 0 1px 1px var(--shadow),
        0 1px 0 var(--bevel-hi);
}
.workbench-shortcut:hover .shortcut-face {
    transform: translateY(-2px);
}
.workbench-shortcut:active .shortcut-face {
    transform: translateY(3px);
}
.shortcut-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(20px * var(--fs-scale));
    height: calc(20px * var(--fs-scale));
    color: var(--shortcut-ink);
}
.shortcut-icon :deep(.app-icon) {
    --icon-size: calc(19px * var(--fs-scale));
}
.shortcut-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
}
.shortcut-name {
    font-size: var(--fs-sm);
    color: var(--shortcut-ink);
}
.shortcut-copy small {
    font-size: var(--fs-mini);
    color: var(--muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.shortcut-character-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 6px 0;
}
.goals-section {
    --progress-color: var(--ochre);
}
.goal-list {
    display: grid;
}
.goal-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 0;
}
.goal-row + .goal-row {
    border-top: var(--w-hair) solid var(--rule);
}
.focus-number {
    align-self: flex-start;
    padding-top: 2px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.focus-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 9px;
}
.goal-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.goal-line h3 {
    font-size: var(--fs-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
}
.goal-line b {
    flex: none;
    color: var(--accent);
    font-weight: 400;
    font-size: var(--fs-xs);
}
.goal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 9px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.goal-meta > span:first-child {
    color: var(--indigo-ink);
}
.goal-arrow {
    color: var(--muted);
    flex: none;
}
.team-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: min(100%, calc(300px * var(--fs-scale)));
    justify-content: start;
    min-width: 0;
    overflow-x: auto;
    padding-bottom: 8px;
    gap: 10px;
    align-items: start;
}
.day-lower {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: stretch;
}
.week-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
}
.week-summary b {
    font-size: var(--fs-amount);
    font-weight: 400;
}
.week-summary span {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.books {
    display: grid;
    gap: 12px;
}
.book header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}
.book h3 {
    color: var(--indigo-ink);
    font-size: var(--fs-xs);
}
.book header > span,
.book-cell-cap {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.book-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    padding: 8px 8px 11px;
    border-radius: var(--r-2);
    background: var(--well);
}
.book-cell {
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-2);
    --tile-face: var(--paper);
    min-width: 0;
    padding: 8px 3px;
    text-align: center;
}
.book-cell :deep(.press-content) {
    gap: 6px;
    width: 100%;
    min-width: 0;
}
.book-cell b {
    font-weight: 400;
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
    max-width: 100%;
}
.gain,
.day-stats .gain {
    color: var(--positive);
}
.loss,
.day-stats .loss {
    color: var(--negative);
}
.empty {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 12px;
    padding: 24px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
@media (max-width: 900px) {
    .day-hero {
        gap: 20px;
        padding: 20px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .day-stats {
        padding-left: 20px;
        gap: 16px;
    }
    .day-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
@media (max-width: 650px) {
    .day-hero,
    .day-lower {
        grid-template-columns: minmax(0, 1fr);
    }
    .day-stats {
        padding: 18px 0 0;
        border-left: 0;
        border-top: var(--w-hair) solid var(--rule);
    }
}
</style>

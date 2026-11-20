<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import FoldedCard from '../../components/FoldedCard.vue';
import { timeText } from '../../services/clock';
import { dateText, ledgerMoneyText } from '../../services/format';
import { clockText, sessionMinutes } from '../income/online';
import type { TeamActivity } from './team-activity';

const props = defineProps<{
    activity: TeamActivity;
    now: number;
    onlineError: string;
    incomeError: string;
    accountError: string;
}>();

const dayLabel = (date: string) =>
    date.startsWith(String(new Date(props.now).getFullYear())) ? date.slice(5) : date;
const timestamp = (at: number) => dayLabel(dateText(at)) + ' ' + timeText(at);
const fullTimestamp = (at: number) => dateText(at) + ' ' + timeText(at);
function sessionLabel() {
    const session = props.activity.session;
    if (!session) return '';
    if (session.endAt === null) return timestamp(session.startAt) + ' · 进行中';
    const end =
        dateText(session.startAt) === dateText(session.endAt)
            ? timeText(session.endAt)
            : timestamp(session.endAt);
    return timestamp(session.startAt) + '–' + end;
}
function sessionTitle() {
    const session = props.activity.session;
    return session
        ? fullTimestamp(session.startAt) +
              ' 至 ' +
              (session.endAt === null ? '进行中' : fullTimestamp(session.endAt))
        : '';
}
</script>

<template>
    <FoldedCard as="article" spine="left" class="team-person">
        <div class="team-slip-print" aria-hidden="true">
            <span>最近记录</span><span class="team-slip-number num" />
        </div>
        <header class="team-identity ticket-rule">
            <div class="team-name-row">
                <RouterLink
                    class="team-name"
                    :to="{ path: '/characters', query: { character: activity.character.id } }"
                    :aria-label="'查看角色档案：' + (activity.character.name || '未命名')"
                    :title="activity.character.name || '未命名'"
                    >{{ activity.character.name || '未命名' }}</RouterLink
                >
                <span class="team-level num">{{ activity.character.level }} 级</span>
                <span
                    class="team-school-name"
                    :title="activity.character.school || '未选门派'"
                    >{{ activity.character.school || '未选门派' }}</span
                >
            </div>
            <AppIcon name="chevron-right" aria-hidden="true" />
        </header>
        <div
            class="team-records"
            tabindex="0"
            :aria-label="(activity.character.name || '未命名') + '最近记录，上下滚动查看'"
        >
            <section class="team-record online-record">
                <h3><AppIcon name="history" />最近上线</h3>
                <p v-if="onlineError" class="team-empty">未读取</p>
                <div v-else-if="activity.session" class="record-line">
                    <span class="record-label online-label num" :title="sessionTitle()">{{
                        sessionLabel()
                    }}</span>
                    <b
                        class="record-value num"
                        :aria-label="'在线时长 ' + clockText(sessionMinutes(activity.session, now))"
                        >{{ clockText(sessionMinutes(activity.session, now)) }}</b
                    >
                </div>
                <p v-else class="team-empty">暂无上线记录</p>
            </section>
            <section class="team-record income-record">
                <h3><AppIcon name="income" />最近收益</h3>
                <p v-if="incomeError" class="team-empty">未读取</p>
                <div v-else-if="activity.income" class="record-line">
                    <div class="record-copy">
                        <span
                            class="record-label"
                            :title="
                                activity.income.item ||
                                (activity.income.kind === 'income' ? '收入' : '支出')
                            "
                            >{{
                                activity.income.item ||
                                (activity.income.kind === 'income' ? '收入' : '支出')
                            }}</span
                        >
                    </div>
                    <small class="record-date num" :title="activity.income.date">{{
                        dayLabel(activity.income.date)
                    }}</small>
                    <b
                        class="record-value num"
                        :class="activity.income.kind === 'expense' ? 'loss' : 'gain'"
                        >{{
                            ledgerMoneyText(
                                activity.income.kind === 'expense'
                                    ? -activity.income.amount
                                    : activity.income.amount,
                                'cash',
                                { sign: 'always' },
                            )
                        }}</b
                    >
                </div>
                <p v-else class="team-empty">暂无收益记录</p>
            </section>
            <section class="team-record account-record">
                <h3><AppIcon name="accounts" />账号收支</h3>
                <p v-if="accountError" class="team-empty">未读取</p>
                <template v-else>
                    <div
                        v-for="(record, index) in [activity.accountIncome, activity.accountExpense]"
                        :key="index"
                        class="record-line account-line"
                    >
                        <template v-if="record">
                            <div class="record-copy">
                                <span class="record-label" :title="record.category"
                                    ><span
                                        class="account-direction"
                                        :class="{ out: record.kind === 'expense' }"
                                        >{{ record.kind === 'expense' ? '出' : '入' }}</span
                                    >{{ record.category }}</span
                                >
                            </div>
                            <small class="record-date num" :title="record.date">{{
                                dayLabel(record.date)
                            }}</small>
                            <b
                                class="record-value num"
                                :class="record.kind === 'expense' ? 'loss' : 'gain'"
                                >{{
                                    ledgerMoneyText(
                                        record.kind === 'expense' ? -record.amount : record.amount,
                                        record.currency,
                                        { sign: 'always' },
                                    )
                                }}</b
                            >
                        </template>
                        <p v-else class="team-empty">
                            {{ index === 0 ? '暂无收入' : '暂无支出' }}
                        </p>
                    </div>
                </template>
            </section>
        </div>
        <footer class="team-slip-footer ticket-rule ticket-rule-top">
            <span
                class="team-slip-state"
                :class="{ online: !onlineError && activity.session?.endAt === null }"
                >{{
                    onlineError
                        ? '未读取'
                        : activity.session?.endAt === null
                          ? '在线中'
                          : '最近记录'
                }}</span
            ><span aria-hidden="true">梦幻助手</span>
        </footer>
    </FoldedCard>
</template>

<style scoped>
.team-person {
    --folded-pad-block: 20px 17px;

    display: flex;
    flex-direction: column;
    height: calc(374px * var(--fs-scale));
    counter-increment: team-slip;
}
.team-slip-print {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.5;
    letter-spacing: 0.1em;
}
.team-slip-number::before {
    content: 'No. ' counter(team-slip, decimal-leading-zero);
}
.team-identity {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: var(--w-hair) dashed transparent;
}
.team-identity > div {
    flex: 1;
    min-width: 0;
}
.team-identity > .app-icon {
    color: var(--rule-2);
}
.team-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
}
.team-name {
    display: block;
    flex: 0 1 auto;
    min-width: 0;
    font-size: var(--fs-md);
    line-height: 1.45;
    color: var(--ink);
    overflow-wrap: anywhere;
    white-space: normal;
}
.team-name:hover {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 4px;
}
.team-level {
    flex: none;
    font-size: var(--fs-xs);
    line-height: 1.6;
    white-space: nowrap;
    color: var(--ochre);
}
.team-school-name {
    flex: none;
    max-width: 40%;
    font-size: var(--fs-xs);
    line-height: 1.6;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.team-records {
    display: grid;
    align-content: start;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    padding: 6px 3px 2px;
}
.team-record {
    min-width: 0;
    padding: 9px 0;
}
.team-record + .team-record {
    border-top: var(--w-hair) dotted var(--rule);
}
.team-record h3 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.4;
}
.team-record h3 .app-icon {
    --icon-size: calc(12px * var(--fs-scale));
}
.record-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 7px;
    min-width: 0;
    line-height: 1.6;
}
.record-copy {
    flex: 1;
    min-width: 0;
}
.record-label {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--fs-sm);
    color: var(--ink-2);
}
.online-label {
    min-width: 0;
    flex: 1;
}
.record-date {
    flex: none;
    font-size: var(--fs-mini);
    color: var(--muted);
    white-space: nowrap;
}
.record-value {
    flex: none;
    color: var(--indigo-ink);
    font-weight: 400;
    font-size: var(--fs-base);
    white-space: nowrap;
}
.account-line + .account-line {
    margin-top: 6px;
}
.account-direction {
    margin-right: 4px;
    color: var(--positive);
    font-size: var(--fs-mini);
}
.account-direction.out {
    color: var(--negative);
}
.team-empty {
    padding: 0;
    font-size: var(--fs-sm);
    line-height: 1.6;
    color: var(--muted);
}
.team-slip-footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
    padding-top: 10px;
    border-top: var(--w-hair) dashed transparent;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.4;
}
.team-slip-footer > :last-child {
    letter-spacing: 0.09em;
}
.team-slip-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.team-slip-state.online {
    color: var(--positive);
}
.team-slip-state.online::before {
    content: '';
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
}
.gain {
    color: var(--positive);
}
.loss {
    color: var(--negative);
}
</style>

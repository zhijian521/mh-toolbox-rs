<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
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
    <article class="team-person">
        <header class="team-identity">
            <div>
                <RouterLink
                    class="team-name"
                    :to="{ path: '/characters', query: { character: activity.character.id } }"
                    :aria-label="'查看角色档案：' + activity.character.name"
                    :title="activity.character.name || '未命名'"
                    >{{ activity.character.name || '未命名' }}</RouterLink
                >
                <p class="team-school">
                    <span
                        class="team-school-name"
                        :title="activity.character.school || '未选门派'"
                        >{{ activity.character.school || '未选门派' }}</span
                    ><span class="team-level num">{{ activity.character.level }} 级</span>
                </p>
            </div>
            <AppIcon name="chevron-right" aria-hidden="true" />
        </header>
        <div
            class="team-records"
            tabindex="0"
            :aria-label="activity.character.name + '最近记录，上下滚动查看'"
        >
            <section class="team-record online-record">
                <h3><AppIcon name="history" />最近上线</h3>
                <p v-if="onlineError" class="team-empty empty-note inline">未读取</p>
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
                <p v-else class="team-empty empty-note inline">暂无上线记录</p>
            </section>
            <section class="team-record income-record">
                <h3><AppIcon name="income" />最近收益</h3>
                <p v-if="incomeError" class="team-empty empty-note inline">未读取</p>
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
                <p v-else class="team-empty empty-note inline">暂无收益记录</p>
            </section>
            <section class="team-record account-record">
                <h3><AppIcon name="accounts" />账号收支</h3>
                <p v-if="accountError" class="team-empty empty-note inline">未读取</p>
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
                        <p v-else class="team-empty empty-note inline">
                            {{ index === 0 ? '暂无收入' : '暂无支出' }}
                        </p>
                    </div>
                </template>
            </section>
        </div>
    </article>
</template>

<style scoped>
.team-person {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: calc(300px * var(--fs-scale));
    overflow: hidden;
    padding: 12px 10px 10px;
    border: var(--w-hair) solid var(--rule);
    border-radius: var(--r-2);
    background: var(--paper);
}
.team-identity {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 3px 11px;
}
.team-identity > div {
    flex: 1;
    min-width: 0;
}
.team-identity > .app-icon {
    color: var(--rule-2);
}
.team-name {
    display: block;
    font-size: var(--fs-md);
    color: var(--accent);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.team-school {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 5px;
    font-size: var(--fs-mini);
    color: var(--muted);
}
.team-level {
    flex: none;
    padding: 1px 5px;
    border: var(--w-hair) solid color-mix(in srgb, var(--indigo-ink) 17%, var(--rule));
    border-radius: var(--r-1);
    color: var(--indigo-ink);
    background: color-mix(in srgb, var(--indigo-ink) 5%, var(--paper));
}
.team-school-name {
    min-width: 0;
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
    padding: 1px 3px 2px 1px;
    gap: 7px;
}
.team-record {
    --record-ink: var(--indigo-ink);
    min-width: 0;
    padding: 9px 10px;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--record-ink) 4%, var(--paper));
    box-shadow:
        inset 0 1px 2px var(--shadow),
        0 1px 0 var(--bevel-hi);
}
.income-record {
    --record-ink: var(--moss);
}
.account-record {
    --record-ink: var(--ochre);
}
.team-record h3 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px;
    color: var(--record-ink);
    font-size: var(--fs-mini);
}
.team-record h3 .app-icon {
    --icon-size: calc(12px * var(--fs-scale));
}
.record-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-width: 0;
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
    font-size: var(--fs-xs);
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
    color: var(--record-ink);
    font-weight: 400;
    font-size: var(--fs-sm);
    white-space: nowrap;
}
.account-line + .account-line {
    padding-top: 7px;
    margin-top: 7px;
    border-top: var(--w-hair) solid var(--rule);
}
.account-direction {
    display: inline-flex;
    padding: 1px 4px;
    margin-right: 5px;
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--positive) 8%, var(--paper));
    color: var(--positive);
    font-size: var(--fs-mini);
}
.account-direction.out {
    color: var(--negative);
    background: color-mix(in srgb, var(--negative) 8%, var(--paper));
}
.team-empty {
    font-size: var(--fs-xs);
    color: var(--muted);
}
.gain {
    color: var(--positive);
}
.loss {
    color: var(--negative);
}
</style>

<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
import { GlassCard } from '../../components/liquid-glass';
import { timeText } from '../../services/clock';
import { dateText, ledgerMoneyText, shortDate } from '../../services/format';
import { clockText, sessionMinutes } from '../income/online';
import type { TeamActivity } from './team-activity';

defineProps<{
    activity: TeamActivity;
    now: number;
    onlineUnavailable: boolean;
    incomeUnavailable: boolean;
    accountsUnavailable: boolean;
}>();

function recordAmount(record: NonNullable<TeamActivity['income' | 'accountIncome']>) {
    return ledgerMoneyText(
        record.kind === 'expense' ? -record.amount : record.amount,
        'currency' in record ? record.currency : 'cash',
        { sign: 'always' },
    );
}
</script>

<template>
    <GlassCard class="liquid-team-card" :radius="18">
        <article>
            <header class="team-heading">
                <h3>{{ activity.character.name || '未命名' }}</h3>
                <span>{{ activity.character.level }} 级</span>
                <span v-if="activity.character.school">{{ activity.character.school }}</span>
            </header>
            <dl class="team-records">
                <div class="team-record">
                    <dt><AppIcon name="history" />最近上线</dt>
                    <dd v-if="onlineUnavailable" class="team-detail">未读取</dd>
                    <dd v-else-if="activity.session" class="team-record-line">
                        <span class="team-detail">
                            <template v-if="activity.session.endAt === null">在线中</template>
                            <time v-else :datetime="dateText(activity.session.startAt)">
                                {{ shortDate(dateText(activity.session.startAt)) }}
                                {{ timeText(activity.session.startAt) }}
                            </time>
                        </span>
                        <span class="team-value">
                            {{ clockText(sessionMinutes(activity.session, now)) }}
                        </span>
                    </dd>
                    <dd v-else class="team-detail">暂无记录</dd>
                </div>
                <div class="team-record">
                    <dt><AppIcon name="income" />最近收益</dt>
                    <dd v-if="incomeUnavailable" class="team-detail">未读取</dd>
                    <dd v-else-if="activity.income" class="team-record-line">
                        <span class="team-detail">
                            {{
                                activity.income.item ||
                                (activity.income.kind === 'income' ? '收入' : '支出')
                            }}
                        </span>
                        <time class="team-date" :datetime="activity.income.date">
                            {{ shortDate(activity.income.date) }}
                        </time>
                        <span class="team-value" :data-kind="activity.income.kind">
                            {{ recordAmount(activity.income) }}
                        </span>
                    </dd>
                    <dd v-else class="team-detail">暂无记录</dd>
                </div>
                <div class="team-record">
                    <dt><AppIcon name="accounts" />最近收支</dt>
                    <dd v-if="accountsUnavailable" class="team-detail">未读取</dd>
                    <template v-else>
                        <dd
                            v-for="(record, index) in [
                                activity.accountIncome,
                                activity.accountExpense,
                            ]"
                            :key="index"
                            class="team-record-line"
                        >
                            <span class="team-detail">
                                {{ record?.category || (index === 0 ? '暂无收入' : '暂无支出') }}
                            </span>
                            <time v-if="record" class="team-date" :datetime="record.date">
                                {{ shortDate(record.date) }}
                            </time>
                            <span v-if="record" class="team-value" :data-kind="record.kind">
                                {{ recordAmount(record) }}
                            </span>
                        </dd>
                    </template>
                </div>
            </dl>
        </article>
    </GlassCard>
</template>

<style scoped>
.liquid-team-card {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: block;
    width: 100%;
    min-width: 0;
    padding: 14px 16px;
}

.team-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 3px 8px;
    font-size: var(--fs-sm);
    color: var(--liquid-muted);
}

.team-heading h3 {
    margin: 0;
    color: var(--liquid-ink);
    font-size: var(--fs-md);
    overflow-wrap: anywhere;
}

.team-records {
    margin: 10px 0 0;
}

.team-record {
    padding: 6px 0;
    border-top: 1px solid var(--liquid-outline);
}

.team-record:last-child {
    padding-bottom: 0;
}

.team-record dt {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 3px;
    font-size: var(--fs-sm);
}

.team-record dt svg {
    width: 14px;
    height: 14px;
    color: var(--liquid-muted);
}

.team-record dd {
    margin: 0;
}

.team-record-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}

.team-record-line + .team-record-line {
    margin-top: 2px;
}

.team-detail {
    color: var(--liquid-muted);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}

.team-date {
    margin-inline-start: auto;
    color: var(--liquid-muted);
    font-size: var(--fs-mini);
    white-space: nowrap;
}

.team-value {
    flex-shrink: 0;
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    text-align: end;
    max-width: 56%;
}

.team-value[data-kind='income'] {
    color: var(--liquid-up);
}

.team-value[data-kind='expense'] {
    color: var(--liquid-down);
}
</style>

<script setup lang="ts">
import { ALL_OPTIONS as ANY } from '../../components/select-options';
import { computed, inject, toRefs, watch } from 'vue';
import { useRecordScroll, type RecordFilters } from '../../composables/use-record-filters';
import { useMinuteNow } from '../../composables/use-minute-now';
import { usePagination } from '../../composables/use-pagination';
import RecordPager from '../../components/RecordPager.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import TextButton from '../../components/TextButton.vue';
import IncomeRoleFilter from './IncomeRoleFilter.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassTable from '../../components/liquid-glass/GlassTable.vue';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import DateRangeField from '../../components/DateRangeField.vue';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { notify } from '../../composables/use-notify';
import { timeText } from '../../services/clock';
import { dateText, ledgerMoneyText, shortDate } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import {
    clockText,
    factsOfSession,
    minutesText,
    onlineRecordFacts,
    ownersOf,
    sessionsIn,
    type ReadonlyOnlineSession,
} from './online';
import { loadOnline, useOnline } from './online-store';
import { characterOptions } from '../characters/character-options';

const emit = defineEmits<{ close: []; edit: [session: ReadonlyOnlineSession] }>();
const glass = inject(glassLedger, null);
const filters = defineModel<RecordFilters & { keyword: string }>({ required: true });
const { from, to, who, keyword, page: selectedPage } = toRefs(filters.value);
const { scroll, rememberScroll } = useRecordScroll(filters);

const { sessions, removeOnline, flush, retry, pending, loadError, writeError } = useOnline();
const { roster } = useRoster();
const removal = useConfirmedRemoval(
    () => pending.value > 0 || Boolean(loadError.value || writeError.value),
    flush,
);
const { removing } = removal;
const mutationBlocked = computed(
    () => removing.value || pending.value > 0 || Boolean(loadError.value || writeError.value),
);

const now = useMinuteNow();

const rangeRows = computed(() => sessionsIn(sessions.value, from.value, to.value, now.value));

const whoOptions = computed(() =>
    characterOptions(roster.value, sessions.value.flatMap(ownersOf), { all: true }).map(
        (option) => ({
            ...option,
            label: option.value === ANY ? '总计' : option.label,
        }),
    ),
);

const searched = computed(() => {
    const word = glass ? '' : keyword.value.trim().toLocaleLowerCase();
    if (!word) return rangeRows.value;
    return rangeRows.value.filter((one) => {
        return [one.note, one.date, ...ownersOf(one).map((id) => characterName(roster.value, id))]
            .join(' ')
            .toLocaleLowerCase()
            .includes(word);
    });
});

// 角色小计基于日期与搜索全集，切换角色只过滤明细，不缩减其他角色的小计。
const recordFacts = computed(() =>
    onlineRecordFacts(searched.value, from.value, to.value, now.value),
);
const whoTotals = computed(
    () =>
        new Map(
            whoOptions.value.map(({ value }) => [
                value,
                value === ANY ? recordFacts.value.total.cost : recordFacts.value.owner(value).cost,
            ]),
        ),
);
/**
 * 按角色筛时看的是名单，不是主体角色。
 *
 * 双开那一段记在一个人名下、名单里有两个人——用户找「某个号上了多久」时，
 * 双开的这一段确实有他一半，按主体角色筛会漏掉（ownersOf 是同一套口径）。
 */
const filtered = computed(() =>
    searched.value.filter((one) => who.value === ANY || ownersOf(one).includes(who.value)),
);
const { page, pages, visible } = usePagination(filtered, 20, selectedPage);

const totals = computed(() =>
    who.value === ANY ? recordFacts.value.total : recordFacts.value.owner(who.value),
);
const visibleRows = computed(() =>
    visible.value.map((one) => ({
        one,
        facts: recordFacts.value.session(one, who.value === ANY ? '' : who.value),
    })),
);
const anyFilter = computed(() => {
    const today = dateText(now.value);
    return (
        from.value !== today ||
        to.value !== today ||
        who.value !== ANY ||
        (!glass && Boolean(keyword.value.trim()))
    );
});

/* 筛选一变就回第一页：留在第 5 页而结果只剩两条时屏幕是空的，用户会以为没记录。 */
watch(glass ? [from, to, who] : [from, to, who, keyword], () => {
    page.value = 1;
    if (scroll.value) scroll.value.scrollTop = 0;
    filters.value.scrollTop = 0;
});

function reset() {
    from.value = dateText(now.value);
    to.value = from.value;
    who.value = ANY;
    keyword.value = '';
}

function whoText(one: ReadonlyOnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}

async function remove(one: ReadonlyOnlineSession) {
    const ok = await removal.run(
        {
            danger: true,
            title: '删除 ' + shortDate(one.date) + ' ' + timeText(one.startAt) + ' 这一段？',
            note:
                whoText(one) +
                ' · ' +
                minutesText(factsOfSession(one, now.value).minutes) +
                '。删除整段记录后，对应日期的点卡也会跟着减，不能撤回。',
            confirmText: '删除',
        },
        () => removeOnline(one.id),
    );
    if (ok) notify.success('已删除');
}
</script>
<template>
    <ModalShell
        class="online-records record-history"
        title="上线记录"
        :width="900"
        min-height="min(600px, calc(100vh - 48px))"
        fill
        :no-dismiss="removing"
        @close="emit('close')"
    >
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <LoadNotice
            :error="loadError"
            :load="loadOnline"
            :blocked="pending > 0 || !!writeError || removing"
        />
        <div class="record-filters" :class="{ 'lg-form-fields': glass }">
            <DateRangeField
                v-model:from="from"
                v-model:to="to"
                :glass="!!glass"
                :from-label="glass ? '开始日期' : '从哪一天'"
                :to-label="glass ? '结束日期' : '到哪一天'"
            />
            <input
                v-if="!glass"
                v-model="keyword"
                class="field filter-search"
                type="search"
                placeholder="搜备注 / 日期"
                aria-label="搜索上线记录"
                autocomplete="off"
            />
            <TextButton v-if="anyFilter" text="重置" label="清空筛选" @click="reset" />
        </div>

        <div v-if="!loadError" class="record-roles">
            <IncomeRoleFilter
                v-model="who"
                :options="whoOptions"
                label="按角色筛选上线记录"
                class="record-role-slider"
            >
                <template #option="{ option }">
                    <span class="record-role-name" :title="option.label">{{ option.label }}</span>
                    <span class="record-role-value">{{
                        ledgerMoneyText(whoTotals.get(option.value) ?? 0, 'cash', { zero: 'dash' })
                    }}</span>
                </template>
            </IncomeRoleFilter>
        </div>

        <p v-if="!loadError" class="record-summary">
            <span class="sum-item">区间合计 {{ minutesText(totals.minutes) }}</span>
            <span class="sum-item" :class="{ cost: totals.cost > 0 }">
                点卡 {{ totals.cost > 0 ? ledgerMoneyText(totals.cost) : '—' }}
            </span>
            <span v-if="totals.running" class="sum-item live">
                计时中 {{ totals.running }} 段
            </span>
        </p>

        <div
            class="online-table-frame record-table-frame"
            :class="{ 'is-empty': !!loadError || !filtered.length }"
        >
            <div ref="scroll" class="income-log-scroll" @scroll="rememberScroll">
                <GlassEmptyState v-if="glass && !loadError && !filtered.length">
                    {{ sessions.length ? '当前筛选下暂无记录' : '暂无上线记录' }}
                </GlassEmptyState>
                <p v-else-if="loadError || !filtered.length" class="record-empty">
                    {{
                        loadError
                            ? '暂时无法读取上线记录，请重新读取。'
                            : sessions.length
                              ? '这个筛选下没有记录。'
                              : '还没有上线记录。'
                    }}
                </p>
                <component
                    :is="glass ? GlassTable : 'table'"
                    v-else
                    class="rec-table"
                    :class="{ 'income-table': !glass }"
                    :sticky-header="glass ? true : undefined"
                >
                    <thead>
                        <tr>
                            <th class="c-date">日期</th>
                            <th class="c-time">时段</th>
                            <th>角色</th>
                            <th class="c-dur" title="所选日期范围内的在线时长">时长</th>
                            <th class="c-num" data-align="end" title="所选日期范围内的点卡花费">
                                点卡
                            </th>
                            <th class="c-note">备注</th>
                            <th class="c-ops">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="{ one, facts } in visibleRows" :key="one.id">
                            <td class="c-date">{{ shortDate(one.date) }}</td>
                            <td class="c-time" :class="{ live: one.endAt === null }">
                                {{ timeText(one.startAt) }}–{{
                                    one.endAt === null ? '现在' : timeText(one.endAt)
                                }}
                            </td>
                            <td class="c-who" :title="whoText(one)">{{ whoText(one) }}</td>
                            <td class="c-dur">{{ clockText(facts.minutes) }}</td>
                            <td class="c-num" data-align="end">
                                {{ facts.cost > 0 ? ledgerMoneyText(facts.cost) : '—' }}
                            </td>
                            <td class="c-note" :title="one.note">{{ one.note }}</td>
                            <td class="c-ops">
                                <!-- flex 包在 td 里的 span 上：td 一旦不是 table-cell，整张表的列宽会乱。 -->
                                <span class="income-ops">
                                    <PressButton
                                        icon="edit"
                                        label="改这一段"
                                        size="md"
                                        :disabled="mutationBlocked"
                                        @click="emit('edit', one)"
                                    />
                                    <PressButton
                                        danger
                                        icon="trash"
                                        label="删这一段"
                                        :disabled="mutationBlocked"
                                        size="md"
                                        @click="remove(one)"
                                    />
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </component>
            </div>
        </div>

        <template v-if="!glass || (!loadError && pages > 1)" #footer>
            <span v-if="!glass" class="record-foot-note">{{
                loadError ? '读取失败' : filtered.length + ' 段'
            }}</span>
            <RecordPager v-if="!loadError" v-model="page" :pages="pages" />
            <PressButton
                v-if="!glass"
                data-modal-cancel
                text="关闭"
                label="关闭上线记录"
                :disabled="removing"
                @click="emit('close')"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.sum-item {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
.sum-item.live {
    color: var(--accent);
}
.sum-item.cost {
    color: var(--negative);
}

.c-date {
    width: 58px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-time {
    width: 108px;
    color: var(--num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
/* 还在计时的那一段：只有时段一列上朱，整行变色会跟别的意思撞上。 */
.c-time.live {
    color: var(--accent);
}
.c-who {
    width: 132px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.c-dur {
    width: 74px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-num {
    width: 96px;
    color: var(--negative);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.c-note {
    overflow: hidden;
    max-width: 0;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.c-ops {
    width: 74px;
}
</style>

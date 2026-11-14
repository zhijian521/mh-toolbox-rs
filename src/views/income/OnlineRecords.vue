<script setup lang="ts">
import { ALL_OPTIONS as ANY } from '../../components/select-options';
import { computed, ref, watch } from 'vue';
import { useMinuteNow } from '../../composables/use-minute-now';
import { usePagination } from '../../composables/use-pagination';
import RecordPager from '../../components/RecordPager.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { notify } from '../../composables/use-notify';
import { timeText } from '../../services/clock';
import { ledgerMoneyText, shortDate } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import {
    clockText,
    factsOfSession,
    minutesText,
    onlineTotalsOf,
    ownersOf,
    cardCostOf,
    sessionCost,
    type OnlineSession,
} from './online';
import { useOnline } from './online-store';
import { characterOptions } from '../characters/character-options';

const emit = defineEmits<{ close: []; edit: [session: OnlineSession] }>();

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

/** 「不限」的哨兵：SelectField 把空串当「没有值」，选中它会退回 placeholder。 */

const who = ref(ANY);
const keyword = ref('');

const whoOptions = computed(() =>
    characterOptions(roster.value, sessions.value.flatMap(ownersOf), { all: true }),
);

/**
 * 按角色筛时看的是名单，不是主体角色。
 *
 * 双开那一段记在一个人名下、名单里有两个人——用户找「某个号上了多久」时，
 * 双开的这一段确实有他一半，按主体角色筛会漏掉（ownersOf 是同一套口径）。
 */
const filtered = computed(() => {
    const word = keyword.value.trim().toLocaleLowerCase();
    return sessions.value.filter((one) => {
        if (who.value !== ANY && !ownersOf(one).includes(who.value)) return false;
        if (!word) return true;
        return [one.note, one.date, ...ownersOf(one).map((id) => characterName(roster.value, id))]
            .join(' ')
            .toLocaleLowerCase()
            .includes(word);
    });
});

const { page, pages, visible } = usePagination(filtered);

const totals = computed(() =>
    onlineTotalsOf(
        filtered.value,
        '0000-01-01',
        '9999-12-31',
        now.value,
        who.value === ANY ? '' : who.value,
    ),
);

function costOf(one: OnlineSession) {
    return who.value === ANY
        ? sessionCost(one, now.value)
        : cardCostOf([one], '0000-01-01', '9999-12-31', who.value, now.value);
}

const anyFilter = computed(() => who.value !== ANY || Boolean(keyword.value.trim()));

/* 筛选一变就回第一页：留在第 5 页而结果只剩两条时屏幕是空的，用户会以为没记录。 */
watch([who, keyword], () => {
    page.value = 1;
});

function reset() {
    who.value = ANY;
    keyword.value = '';
}

function whoText(one: OnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}

async function remove(one: OnlineSession) {
    const ok = await removal.run(
        {
            danger: true,
            title: '删除 ' + shortDate(one.date) + ' ' + timeText(one.startAt) + ' 这一段？',
            note:
                whoText(one) +
                ' · ' +
                minutesText(factsOfSession(one, now.value).minutes) +
                '。删了不能撤回，当天的点卡也会跟着减。',
            confirmText: '删除',
        },
        () => removeOnline(one.id),
    );
    if (ok) notify.success('已删除');
}
</script>
<template>
    <!-- minHeight + fill：窗不低于 520，筛选条与小计钉在顶上，只有表格滚。 -->
    <ModalShell
        title="上线记录"
        :width="760"
        min-height="min(520px, calc(100vh - 48px))"
        fill
        @close="!removing && emit('close')"
    >
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
        <div class="record-filters">
            <SelectField v-model="who" :options="whoOptions" label="角色筛选" class="f-narrow" />
            <input
                v-model="keyword"
                class="field filter-search"
                type="search"
                placeholder="搜备注 / 日期"
                aria-label="搜索上线记录"
                autocomplete="off"
            />
            <PressButton v-if="anyFilter" text="重置" size="sm" label="清空筛选" @click="reset" />
        </div>

        <p class="record-summary">
            <span class="sum-item">合计 {{ minutesText(totals.minutes) }}</span>
            <span class="sum-item" :class="{ cost: totals.cost > 0 }">
                点卡 {{ totals.cost > 0 ? ledgerMoneyText(totals.cost) : '—' }}
            </span>
            <span v-if="totals.running" class="sum-item live">
                计时中 {{ totals.running }} 段
            </span>
        </p>

        <div class="income-log-scroll">
            <p v-if="!filtered.length" class="record-empty">
                {{ sessions.length ? '这个筛选下没有记录。' : '还没有上线记录。' }}
            </p>

            <table v-else class="rec-table income-table">
                <thead>
                    <tr>
                        <th class="c-date">日期</th>
                        <th class="c-time">时段</th>
                        <th>角色</th>
                        <th class="c-dur">时长</th>
                        <th class="c-num">点卡</th>
                        <th class="c-note">备注</th>
                        <th class="c-ops">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="one in visible" :key="one.id">
                        <td class="c-date">{{ shortDate(one.date) }}</td>
                        <td class="c-time" :class="{ live: one.endAt === null }">
                            {{ timeText(one.startAt) }}–{{
                                one.endAt === null ? '现在' : timeText(one.endAt)
                            }}
                        </td>
                        <td class="c-who" :title="whoText(one)">{{ whoText(one) }}</td>
                        <td class="c-dur">{{ clockText(factsOfSession(one, now).minutes) }}</td>
                        <td class="c-num">
                            {{ costOf(one) > 0 ? ledgerMoneyText(costOf(one)) : '—' }}
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
            </table>
        </div>

        <template #footer>
            <span class="record-foot-note">{{ filtered.length }} 段</span>
            <RecordPager v-model="page" :pages="pages" />
            <PressButton
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
.f-narrow {
    flex: none;
    width: calc(118px * var(--fs-scale));
}

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

<script setup lang="ts">
import { ALL_OPTIONS as ANY } from '../../components/select-options';
import { computed, inject, ref, toRefs, watch } from 'vue';
import { useRecordScroll, type RecordFilters } from '../../composables/use-record-filters';
import LoadNotice from '../../components/LoadNotice.vue';
import { usePagination } from '../../composables/use-pagination';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import RecordPager from '../../components/RecordPager.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import DateRangeField from '../../components/DateRangeField.vue';
import IncomeRoleFilter from './IncomeRoleFilter.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassTable from '../../components/liquid-glass/GlassTable.vue';
import { notify } from '../../composables/use-notify';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { characterName, useRoster } from '../characters/roster';
import { timeText } from '../../services/clock';
import { ledgerMoneyText, ledgerMoneyTone, shortDate } from '../../services/format';
import { amountText, entriesIn, type IncomeEntry } from './income';
import { loadIncome, useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import EntryEditDialog from './EntryEditDialog.vue';
import { UNASSIGNED_CHARACTER as NOTHING } from '../characters/character-options';
import { historyGroupsOf } from './history-summary';

const emit = defineEmits<{ close: [] }>();
const glass = inject(glassLedger, null);
const filters = defineModel<RecordFilters>({ required: true });
const { from, to, who, page: selectedPage } = toRefs(filters.value);
const { scroll, rememberScroll } = useRecordScroll(filters);

const { entries, removeEntry, updateEntry, pending, flush, retry, loadError, writeError } =
    useIncome();
const { roster } = useRoster();
const removal = useConfirmedRemoval(
    () => pending.value > 0 || Boolean(loadError.value || writeError.value),
    flush,
);
const { removing } = removal;
const mutationBlocked = computed(
    () => removing.value || pending.value > 0 || Boolean(loadError.value || writeError.value),
);

const rangeRows = computed(() => entriesIn(entries.value, { from: from.value, to: to.value }));
const whoGroups = computed(() => historyGroupsOf(rangeRows.value, roster.value, who.value));
const whoTotals = computed(() => new Map(whoGroups.value.map((group) => [group.value, group.net])));

/** 区间跨没跨天。跨天时时间列要带上日期，否则「14:32」看不出是哪一天的。 */
const multiDay = computed(() => from.value !== to.value);

/** 正在改的那一条。`null` = 没开编辑窗。 */
const editing = ref<IncomeEntry | null>(null);

const rows = computed(() =>
    rangeRows.value
        .filter(
            (one) =>
                who.value === ANY || one.characterId === (who.value === NOTHING ? '' : who.value),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
);

const { page, pages, visible } = usePagination(rows, 20, selectedPage);
watch([from, to, who], () => {
    page.value = 1;
    if (scroll.value) scroll.value.scrollTop = 0;
    filters.value.scrollTop = 0;
});
const editSubmit = usePersistedSubmit(flush, retry);
const { saving, action, locked } = editSubmit;
let editMessage = '';

function closeEdit() {
    if (saving.value) return;
    editing.value = null;
    editSubmit.reset();
}

/** 净额与支出都要带 `−`：只靠颜色的话，色弱或打印时一笔亏损会读成收入。 */
function signedOf(value: number): string {
    return ledgerMoneyText(value, 'cash', { sign: 'auto', zero: 'dash' });
}

/** 改：不进确认，改错了还能再改。 */
async function save(patch: { amount: number; item: string; characterId: string }) {
    const target = editing.value;
    if (!target || pending.value > 0) return;
    const ok = await editSubmit.run('save', () => {
        const result = updateEntry(target.id, patch);
        if (!result.ok) {
            notify.error(result.error);
            return false;
        }
        editMessage = '已改好 · ' + signedOf(patch.amount);
        return true;
    });
    if (!ok) return;
    notify.success(editMessage);
    closeEdit();
}

/** 删：先问一句。账本里没有回收站，这一步不可逆。 */
async function remove(one: IncomeEntry) {
    const ok = await removal.run(
        {
            danger: true,
            title: `删除「${one.item || '未记物品'}」这一条？`,
            note: `${amountText(one.amount)}。删了不能撤回。`,
            confirmText: '删除',
        },
        () => removeEntry(one.id),
    );
    if (ok) notify.success('已删除');
}
</script>

<template>
    <ModalShell
        class="income-history record-history"
        title="历史收益"
        :width="900"
        min-height="min(600px, calc(100vh - 48px))"
        fill
        :no-dismiss="removing"
        @close="emit('close')"
    >
        <!-- 筛选在上：选哪段看哪段，不用滚动找。三个控件各管一件事——起、止、谁。
             「回到今天」长在纸片自己的页脚里（`DateField` 的能力，不只服务这一页），
             这里不再挂第二枚。 -->
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <LoadNotice
            :error="loadError"
            :load="loadIncome"
            :blocked="pending > 0 || !!writeError || removing || !!editing"
        />
        <div class="record-filters" :class="{ 'lg-form-fields': glass }">
            <DateRangeField
                v-model:from="from"
                v-model:to="to"
                :glass="!!glass"
                :from-label="glass ? '开始日期' : '从哪一天'"
                :to-label="glass ? '结束日期' : '到哪一天'"
            />
        </div>

        <div v-if="!loadError" class="history-roles record-roles">
            <IncomeRoleFilter
                v-model="who"
                :options="whoGroups"
                label="按角色筛选"
                class="history-role-slider record-role-slider"
            >
                <template #option="{ option }">
                    <span class="history-role-name record-role-name" :title="option.label">{{
                        option.label
                    }}</span>
                    <span
                        class="history-role-net record-role-value"
                        :data-stat-tone="ledgerMoneyTone(whoTotals.get(option.value) ?? 0)"
                        >{{ signedOf(whoTotals.get(option.value) ?? 0) }}</span
                    >
                </template>
            </IncomeRoleFilter>
        </div>

        <!-- 外框不参与滚动，表头在内层 sticky；仍是同一张原生表，列宽始终一致。 -->
        <div
            class="history-table-frame record-table-frame"
            :class="{ 'is-empty': !!loadError || !entries.length }"
        >
            <div ref="scroll" class="income-log-scroll" @scroll="rememberScroll">
                <p v-if="loadError || !rows.length" class="record-empty">
                    {{
                        loadError
                            ? '暂时无法读取记录'
                            : multiDay
                              ? '这段时间还没有记录。'
                              : '这一天还没有记录。'
                    }}
                </p>
                <component
                    :is="glass ? GlassTable : 'table'"
                    v-else
                    class="log"
                    :class="{ 'income-table': !glass }"
                    :sticky-header="glass ? true : undefined"
                >
                    <thead>
                        <tr>
                            <th class="c-time" :class="{ wide: multiDay }">时间</th>
                            <th>物品</th>
                            <th class="c-who">角色</th>
                            <th class="c-num" data-align="end">金额</th>
                            <th class="c-ops">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="one in visible" :key="one.id">
                            <td class="c-time" :class="{ wide: multiDay }">
                                <!-- 跨天时把日期补在时间上面：区间一跨天，「14:32」单独看
                                     分不出是哪天的 14:32，而这一列正是给人对时间的。 -->
                                <span class="time-cell">
                                    <span v-if="multiDay" class="c-date">{{
                                        shortDate(one.date)
                                    }}</span>
                                    <span class="c-clock">{{ timeText(one.createdAt) }}</span>
                                </span>
                            </td>
                            <td>
                                <!-- flex 包在 td 里的 span 上，不挂在 td 上：td 一旦不是
                                     table-cell，整张表的列宽计算会跟着乱。 -->
                                <span class="item-cell">
                                    <img
                                        v-if="itemIconOf(one.item)"
                                        :src="itemIconOf(one.item)"
                                        alt=""
                                        loading="lazy"
                                    />
                                    <span class="item-name">{{ one.item || '未记物品' }}</span>
                                </span>
                            </td>
                            <td class="c-who" :class="{ idle: !one.characterId }">
                                {{ characterName(roster, one.characterId) }}
                            </td>
                            <td
                                class="c-num"
                                data-align="end"
                                :data-stat-tone="ledgerMoneyTone(one.amount, one.kind)"
                            >
                                {{
                                    ledgerMoneyText(
                                        one.kind === 'expense' ? -one.amount : one.amount,
                                        'cash',
                                        { sign: 'always' },
                                    )
                                }}
                            </td>
                            <td class="c-ops">
                                <span class="income-ops">
                                    <PressButton
                                        icon="edit"
                                        label="改这一条"
                                        size="md"
                                        :disabled="mutationBlocked"
                                        @click="editing = one"
                                    />
                                    <PressButton
                                        danger
                                        icon="trash"
                                        label="删这一条"
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
                loadError ? '读取失败' : rows.length + ' 笔'
            }}</span>
            <RecordPager v-if="!loadError" v-model="page" :pages="pages" />
            <PressButton
                v-if="!glass"
                text="关闭"
                label="关闭历史收益"
                :disabled="removing"
                @click="emit('close')"
            />
        </template>

        <!-- 叠在这张窗上面的一层（`ModalShell` 自带弹窗栈，Esc 只关最上面那层）。 -->
        <EntryEditDialog
            v-if="editing"
            :entry="editing"
            :saving="saving"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="save"
            @close="closeEdit"
        />
    </ModalShell>
</template>

<style scoped>
/* ---------- 流水表 ---------- */

.c-time {
    width: 56px;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
/* 跨天时这一列要装「11-11」+「14:32」两行，56 装不下（第二行会被折成两个字一行）。 */
.c-time.wide {
    width: 68px;
}
.time-cell {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
}
.time-cell .c-date {
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
}
.time-cell .c-clock {
    font-variant-numeric: tabular-nums;
}
.c-who {
    width: 110px;
    color: var(--ink-2);
}
.c-who.idle {
    color: var(--muted);
}
/* 数字列右对齐 + `tabular-nums`：这一页要能竖着比大小。 */
.c-num {
    width: 104px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.c-ops {
    width: 72px;
}

.item-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.item-cell img {
    flex: none;
    /* 20 而不是 16（2026-11-11 用户「列表里的物品图标增大一点」）：16 在 34 高的行里
     * 只占一半，图标认不出是哪件东西；20 仍留得住四周的纸面，行高不用跟着长。 */
    width: 20px;
    height: 20px;
    object-fit: contain;
    /* 与速记格同一道「纸化」：别处调过、这里不调，同一件物品在两张屏上是两种饱和度。 */
    filter: var(--item-icon-filter);
    opacity: var(--item-icon-opacity);
}
.item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>

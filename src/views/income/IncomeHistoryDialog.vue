<script setup lang="ts">
import { ALL_OPTIONS as ANY } from '../../components/select-options';
import { computed, ref, watch } from 'vue';
import { usePagination } from '../../composables/use-pagination';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import RecordPager from '../../components/RecordPager.vue';
import SaveNotice from '../../components/SaveNotice.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import DateField from '../../components/DateField.vue';
import SelectField from '../../components/SelectField.vue';
import { notify } from '../../composables/use-notify';
import { useConfirmedRemoval } from '../../composables/use-confirmed-removal';
import { characterName, useRoster } from '../characters/roster';
import { timeText } from '../../services/clock';
import { ledgerMoneyText, shortDate, todayText } from '../../services/format';
import { amountText, entriesIn, totalsOf, type IncomeEntry } from './income';
import { useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import EntryEditDialog from './EntryEditDialog.vue';
import { characterOptions, UNASSIGNED_CHARACTER as NOTHING } from '../characters/character-options';

const emit = defineEmits<{ close: [] }>();

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

/**
 * 「不限角色」的哨兵：`SelectField` 把空串当「没有值」，选中它会退回 placeholder。
 * 与账号页 / 目标页同一个写法。
 */

/**
 * 正在看的区间两端。默认两端都落在今天——打开历史的人十次有九次是想核对今天，
 * 而「一天」正是这个区间的退化情形（起 == 止），不必为单日另留一套界面。
 */
const from = ref(todayText());
const to = ref(todayText());

/** 只看哪个号。`ANY` = 全部；空串 = 未指定角色（真实目标，见文件头）。 */
const who = ref(ANY);

const whoOptions = computed(() =>
    characterOptions(
        roster.value,
        entries.value.map((one) => one.characterId),
        { all: true, unassigned: '未指定' },
    ),
);

function pickFrom(value: string) {
    from.value = value;
    if (to.value < value) to.value = value;
}

function pickTo(value: string) {
    to.value = value;
    if (from.value > value) from.value = value;
}

/** 区间跨没跨天。跨天时时间列要带上日期，否则「14:32」看不出是哪一天的。 */
const multiDay = computed(() => from.value !== to.value);

/** 正在改的那一条。`null` = 没开编辑窗。 */
const editing = ref<IncomeEntry | null>(null);

const rows = computed(() =>
    entriesIn(entries.value, { from: from.value, to: to.value })
        .filter(
            (one) =>
                who.value === ANY || one.characterId === (who.value === NOTHING ? '' : who.value),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
);

const { page, pages, visible } = usePagination(rows);
watch([from, to, who], () => {
    page.value = 1;
});
const editSubmit = usePersistedSubmit(flush, retry);
const { saving, action, locked } = editSubmit;
let editMessage = '';

function closeEdit() {
    if (saving.value) return;
    editing.value = null;
    editSubmit.reset();
}

const rangeTotals = computed(() => totalsOf(rows.value));

interface WhoSum {
    id: string;
    name: string;
    count: number;
    net: number;
}

/** 区间内按角色小计，按净额降序。只服务顶部那一行，不进表格。 */
const whoSums = computed<WhoSum[]>(() => {
    const map = new Map<string, WhoSum>();
    for (const one of rows.value) {
        const id = one.characterId || '';
        const hit = map.get(id) ?? { id, name: characterName(roster.value, id), count: 0, net: 0 };
        hit.count += 1;
        hit.net += one.kind === 'expense' ? -one.amount : one.amount;
        map.set(id, hit);
    }
    return [...map.values()].sort((a, b) => b.net - a.net || b.count - a.count);
});

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
            title: `删掉「${one.item || '未记物品'}」这一条？`,
            note: `${amountText(one.amount)}。删了不能撤回。`,
            confirmText: '删除',
        },
        () => removeEntry(one.id),
    );
    if (ok) notify.success('已删掉一条');
}
</script>

<template>
    <ModalShell
        title="历史收益"
        :width="900"
        min-height="min(600px, calc(100vh - 48px))"
        fill
        @close="!removing && emit('close')"
    >
        <!-- 筛选在上：选哪段看哪段，不用滚动找。三个控件各管一件事——起、止、谁。
             「回到今天」长在纸片自己的页脚里（`DateField` 的能力，不只服务这一页），
             这里不再挂第二枚。 -->
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />
        <p v-if="loadError" class="note error" role="alert">{{ loadError }}</p>
        <div class="record-filters">
            <DateField
                :model-value="from"
                label="从哪一天"
                class="date-pick"
                :max="to"
                @update:model-value="pickFrom"
            />
            <span class="range-dash" aria-hidden="true">至</span>
            <DateField
                :model-value="to"
                label="到哪一天"
                class="date-pick"
                :min="from"
                @update:model-value="pickTo"
            />
            <SelectField v-model="who" :options="whoOptions" label="按角色筛选" class="who-pick" />
        </div>

        <p v-if="rows.length" class="record-summary">
            <span
                class="sum-tag total"
                :class="{ gain: rangeTotals.net > 0, loss: rangeTotals.net < 0 }"
            >
                <span class="tag-name">总计</span>
                <b>{{ signedOf(rangeTotals.net) }}</b>
            </span>
            <span
                v-for="row in whoSums"
                :key="row.id"
                class="sum-tag"
                :class="{ idle: !row.id, gain: row.net > 0, loss: row.net < 0 }"
            >
                <span class="tag-name">{{ row.name }}</span>
                <b>{{ signedOf(row.net) }}</b>
            </span>
        </p>

        <p v-if="!rows.length" class="record-empty">
            {{
                loadError
                    ? '暂时无法读取记录'
                    : multiDay
                      ? '这段时间还没有记录。'
                      : '这一天还没有记录。'
            }}
        </p>

        <!-- 只有表格滚（`fill` 让正文成为纵向 flex 容器，这里吃掉剩下的全部高度）。
             表头 `sticky` 钉在容器顶上：往下翻十几行之后仍知道哪列是哪列。 -->
        <div v-else class="income-log-scroll">
            <table class="log income-table">
                <thead>
                    <tr>
                        <th class="c-time" :class="{ wide: multiDay }">时间</th>
                        <th>物品</th>
                        <th class="c-who">角色</th>
                        <th class="c-num">金额</th>
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
                        <td class="c-num" :class="{ out: one.kind === 'expense' }">
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
            </table>
        </div>

        <template #footer>
            <span class="record-foot-note">{{ rows.length }} 笔</span>
            <RecordPager v-model="page" :pages="pages" />
            <PressButton
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
.date-pick {
    flex: none;
    width: calc(168px * var(--fs-scale));
}
/* 两条日期之间那个「至」：一个小字，不由控件念出来（读屏靠两条各自的 label）。
 * `--fs-mini` + 淡墨，它是分隔符不是内容。 */
.range-dash {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-mini);
}
/* 角色下拉：`SelectField` 根上写着 `flex: 1`（给「下拉与输入格并排」那种布局），
 * 这里是筛选行，让它吃掉剩余宽度会把右边那行汇总顶到边上去。 */
.who-pick {
    flex: none;
    width: calc(150px * var(--fs-scale));
}

/* ---------- 总计 + 各号小计：一排 tag ---------- */

.sum-tag {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 10px;
    border: var(--w-hair) solid var(--rule);
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--well) 24%, transparent);
    color: var(--ink-2);
    font-size: var(--fs-mini);
    line-height: 1.5;
    white-space: nowrap;
}
.sum-tag b {
    color: var(--num);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
/* 总计：一枚标签也是这一排的标题。底色掺的是「数的颜色」（--num，赭）而不是灰槽——
 * 它不是又一个角色，是这些角色的和。 */
.sum-tag.total {
    border-color: color-mix(in srgb, var(--num) 34%, transparent);
    background: color-mix(in srgb, var(--num) 13%, transparent);
    color: var(--ink);
}
.sum-tag.total b {
    font-weight: 700;
}
/* 未指定角色的那一枚淡一档：它记的是「没记给人」的账，不是某个人。 */
.sum-tag.idle {
    color: var(--muted);
}
.sum-tag.gain b {
    color: var(--positive);
}
.sum-tag.loss b {
    color: var(--negative);
}

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
    color: var(--positive);
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.c-num.out {
    color: var(--negative);
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

/* 空态：定高之后这一句要在整块正文里居中。`margin: auto` 在纵向 flex 容器里就是
 * 「上下都吃掉剩余空间」——写 `margin: 26px 0` 会贴在顶部，下面一大片空白看着像没加载完。 */
</style>

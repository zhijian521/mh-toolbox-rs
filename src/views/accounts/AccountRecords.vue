<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { askConfirm } from '../../composables/use-confirm';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { shortDate } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import {
    ACCOUNT_CATEGORIES,
    CHANNELS,
    CURRENCY_META,
    accountStats,
    amountText,
    newestFirst,
    type AccountEntry,
    type Currency,
} from './accounts';
import { useAccounts } from './accounts-store';

/**
 * 全部账号记录：筛选 + 分页 + 改 / 删。
 *
 * ---- 为什么这个弹窗必须存在 ----
 * 页面上那八条是「最近」，而账号页真正的用法是**对账**：翻到三个月前找一笔藏宝阁的
 * 卖出，或者确认某个号这半年到底充了多少钱。没有全量列表，这两种事做不了。
 *
 * ---- 汇总跟着筛选走 ----
 * 顶上那行「人民币 收入 / 支出 / 差额」算的是**筛出来的这些**，不是全库。
 * 这也是用户切完筛选一眼能看见的第一件事：这一批记录合起来是多少。
 *
 * ---- 删除要问一句，改不用 ----
 * 改可以再改回来，删不能撤回。两者的风险不对等，交互也不该一样。
 */
const emit = defineEmits<{ close: []; edit: [entry: AccountEntry] }>();

const { entries, removeEntry, flush } = useAccounts();
const { roster } = useRoster();

const PER_PAGE = 20;

/** 「不限」的哨兵：`SelectField` 把空串当「没有值」，选中它会退回 placeholder。 */
const ANY = '__any__';

const currency = ref(ANY);
const kind = ref(ANY);
const category = ref(ANY);
const channel = ref(ANY);
const who = ref(ANY);
const keyword = ref('');
const page = ref(1);

const categoryOptions = computed(() => [
    { value: ANY, label: '全部分类' },
    ...ACCOUNT_CATEGORIES.map((one) => ({ value: one as string, label: one })),
]);
const channelOptions = [
    { value: ANY, label: '全部渠道' },
    ...CHANNELS.map((one) => ({ value: one as string, label: one })),
];
const currencyOptions = [
    { value: ANY, label: '全部币种' },
    { value: 'rmb', label: '人民币' },
    { value: 'cash', label: '梦幻币' },
];
const kindOptions = [
    { value: ANY, label: '全部方向' },
    { value: 'income', label: '收入 / 卖出' },
    { value: 'expense', label: '支出 / 买入' },
];
const whoOptions = computed(() => [
    { value: ANY, label: '全部角色' },
    /* 「未指定」是一个**真实的筛选目标**，不是「不限」：点卡这类账本来就没挂角色，
     * 而用户常常正是要找「哪些账没记给具体的人」。 */
    { value: '', label: '未指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

const filtered = computed(() => {
    const word = keyword.value.trim().toLocaleLowerCase();
    return newestFirst(entries.value).filter((one) => {
        if (currency.value !== ANY && one.currency !== currency.value) return false;
        if (kind.value !== ANY && one.kind !== kind.value) return false;
        if (category.value !== ANY && one.category !== category.value) return false;
        if (channel.value !== ANY && one.channel !== channel.value) return false;
        /* 空串是「未指定」这个目标，不是「不限」——所以与 `ANY` 分开判。 */
        if (who.value !== ANY && one.characterId !== who.value) return false;
        if (!word) return true;
        return [one.category, one.note, one.channel, characterName(roster.value, one.characterId)]
            .join(' ')
            .toLocaleLowerCase()
            .includes(word);
    });
});

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)));
const visible = computed(() =>
    filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE),
);

/** 两本账的合计，跟着筛选走。 */
const sums = computed(() =>
    (['rmb', 'cash'] as Currency[]).map((one) => ({
        currency: one,
        meta: CURRENCY_META[one],
        stats: accountStats(filtered.value, one),
    })),
);

const anyFilter = computed(
    () =>
        currency.value !== ANY ||
        kind.value !== ANY ||
        category.value !== ANY ||
        channel.value !== ANY ||
        who.value !== ANY ||
        Boolean(keyword.value.trim()),
);

/* 筛选一变就回到第一页：留在第 5 页而结果只剩两条时，屏幕上是空的，
 * 而用户以为「筛出来没有记录」。 */
watch([currency, kind, category, channel, who, keyword], () => {
    page.value = 1;
});

/* 当前页被删空之后，`page` 会超出总页数——退到最后一页，不停在一个不存在的页上。 */
watch(pages, (value) => {
    if (page.value > value) page.value = value;
});

function reset() {
    currency.value = ANY;
    kind.value = ANY;
    category.value = ANY;
    channel.value = ANY;
    who.value = ANY;
    keyword.value = '';
}

async function remove(one: AccountEntry) {
    const ok = await askConfirm({
        title: `删掉「${one.category}」这一条？`,
        note: `${one.date} · ${amountText(one.amount, one.currency)}。删了不能撤回。`,
        confirmText: '删除',
    });
    if (!ok) return;
    removeEntry(one.id);
    if (await saved(flush)) notify.success('已删掉一条');
}
</script>

<template>
    <!-- `minHeight` + `fill`：窗不低于 560（窗口矮时跟着缩），筛选条与小计钉在顶上，
         只有下面的表格滚。不给下限时两条记录会把窗缩成一小块；
         不 fill 时整块一起滚，翻到底想换个筛选还得先滚回顶部。 -->
    <ModalShell
        title="全部记录"
        :width="800"
        min-height="min(560px, calc(100vh - 48px))"
        fill
        @close="emit('close')"
    >
        <div class="filters">
            <SelectField
                v-model="currency"
                :options="currencyOptions"
                label="币种筛选"
                class="f-narrow"
            />
            <SelectField v-model="kind" :options="kindOptions" label="方向筛选" class="f-narrow" />
            <SelectField
                v-model="category"
                :options="categoryOptions"
                label="分类筛选"
                class="f-wide"
            />
            <SelectField
                v-model="channel"
                :options="channelOptions"
                label="渠道筛选"
                class="f-narrow"
            />
            <SelectField v-model="who" :options="whoOptions" label="角色筛选" class="f-narrow" />
            <input
                v-model="keyword"
                class="field f-search"
                type="search"
                placeholder="搜备注 / 分类"
                aria-label="搜索记录"
                autocomplete="off"
            />
            <PressButton v-if="anyFilter" text="重置" label="清空筛选" @click="reset" />
        </div>

        <p class="sums">
            <span v-for="one in sums" :key="one.currency" class="sum">
                <span class="sum-cap">{{ one.meta.label }}</span>
                <span class="sum-item">收 {{ amountText(one.stats.income, one.currency) }}</span>
                <span class="sum-item">支 {{ amountText(one.stats.expense, one.currency) }}</span>
                <span class="sum-item" :class="{ loss: one.stats.net < 0 }">
                    差
                    {{
                        one.stats.net < 0
                            ? `−${amountText(-one.stats.net, one.currency)}`
                            : amountText(one.stats.net, one.currency)
                    }}
                </span>
                <span class="sum-count">{{ one.stats.count }} 笔</span>
            </span>
        </p>

        <div class="log-scroll">
            <p v-if="!filtered.length" class="blank">
                {{ entries.length ? '这个筛选下没有记录。' : '还没有账号记录。' }}
            </p>

            <table v-else class="rec-table">
                <thead>
                    <tr>
                        <th class="c-date">日期</th>
                        <th class="c-cat">分类</th>
                        <th>说明</th>
                        <th class="c-who">角色</th>
                        <th class="c-channel">渠道</th>
                        <th class="c-num">金额</th>
                        <th class="c-ops">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="one in visible" :key="one.id">
                        <td class="c-date">{{ shortDate(one.date) }}</td>
                        <td class="c-cat">{{ one.category }}</td>
                        <td class="c-note" :title="one.note">{{ one.note }}</td>
                        <td class="c-who" :class="{ idle: !one.characterId }">
                            {{ characterName(roster, one.characterId) }}
                        </td>
                        <td class="c-channel">{{ one.channel }}</td>
                        <td
                            class="c-num"
                            :class="{ out: one.kind === 'expense' }"
                            :title="CURRENCY_META[one.currency].label"
                        >
                            {{ one.kind === 'income' ? '+' : '−'
                            }}{{ amountText(one.amount, one.currency) }}
                        </td>
                        <td class="c-ops">
                            <!-- flex 包在 td 里的 span 上，不挂在 td 上：td 一旦不是
                                 table-cell，整张表的列宽计算会跟着乱。 -->
                            <span class="ops">
                                <PressButton
                                    icon="edit"
                                    label="改这一条"
                                    size="md"
                                    @click="emit('edit', one)"
                                />
                                <PressButton
                                    icon="trash"
                                    label="删这一条"
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
            <span class="note foot-note">
                {{ filtered.length }} 笔{{ anyFilter ? '（已筛选）' : '' }}
            </span>
            <span v-if="pages > 1" class="pager">
                <PressButton
                    text="上一页"
                    label="上一页"
                    :disabled="page <= 1"
                    @click="page -= 1"
                />
                <span class="pager-text">{{ page }} / {{ pages }}</span>
                <PressButton
                    text="下一页"
                    label="下一页"
                    :disabled="page >= pages"
                    @click="page += 1"
                />
            </span>
            <PressButton
                data-modal-cancel
                text="关闭"
                label="关闭全部记录"
                @click="emit('close')"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
/* 宽度按真实用法给：币种 / 方向 / 角色只有两三个字，分类最长到「召唤兽交易」。 */
.f-narrow {
    flex: none;
    width: calc(104px * var(--fs-scale));
}
.f-wide {
    flex: none;
    width: calc(124px * var(--fs-scale));
}
.f-search {
    flex: 1 1 120px;
    min-width: 100px;
}

/* 两本账的小计在一行里，中间用一道竖线分开——不画两张卡：
 * 这里是「筛出来的这一批是多少」，不是两本账的正式汇总。 */
.sums {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 0;
    margin: 0 0 8px;
    font-size: var(--fs-mini);
}
.sum {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-right: 12px;
}
.sum + .sum {
    padding-left: 12px;
    border-left: var(--w-hair) solid var(--rule);
}
.sum-cap {
    color: var(--ink-2);
}
.sum-item,
.sum-count {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
.sum-count {
    color: var(--muted);
}
.sum-item.loss {
    color: var(--cinnabar);
}

/* 只有这一块滚。`min-height: 0` 是必须的：flex 子项默认 `min-height: auto`
 * 会被内容顶开，写多少高度都拦不住它把弹窗撑长。 */
.log-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
}

.rec-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
}
.rec-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 5px 6px;
    /* 表头那条线用 `box-shadow` 画，不用 `border-bottom`：sticky 元素的边框会跟着
     * 内容一起滚，读到第 20 行时那条线会悬在两行中间。 */
    box-shadow: inset 0 -1px 0 var(--rule-2);
    background: var(--paper);
    color: var(--muted);
    font-size: var(--fs-mini);
    font-weight: 400;
    letter-spacing: 0.08em;
    text-align: left;
    white-space: nowrap;
}
.rec-table tbody td {
    padding: 6px;
    border-bottom: var(--w-hair) solid var(--rule);
    vertical-align: middle;
}
.rec-table tbody tr:last-child td {
    border-bottom: 0;
}
.c-date {
    width: 58px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-cat {
    width: 96px;
    white-space: nowrap;
}
.c-note {
    overflow: hidden;
    max-width: 0;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.c-who {
    width: 92px;
    white-space: nowrap;
}
.c-who.idle {
    color: var(--muted);
}
.c-channel {
    width: 80px;
    color: var(--muted);
    white-space: nowrap;
}
.c-num {
    width: 110px;
    color: var(--num);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.c-num.out {
    color: var(--cinnabar);
}
.c-ops {
    width: 74px;
}
.ops {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
}
.blank {
    margin: 30px 0;
    color: var(--muted);
    text-align: center;
}

.foot-note {
    margin-right: auto;
}
.pager {
    display: flex;
    align-items: center;
    gap: 8px;
}
.pager-text {
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
</style>

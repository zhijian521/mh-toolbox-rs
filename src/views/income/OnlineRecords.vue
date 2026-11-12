<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { askConfirm } from '../../composables/use-confirm';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { timeText } from '../../services/clock';
import { moneyText, shortDate } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import {
    clockText,
    factsOfSession,
    minutesText,
    onlineTotalsOf,
    ownersOf,
    sessionCost,
    type OnlineSession,
} from './online';
import { useOnline } from './online-store';

/**
 * 全部上线记录：筛选 + 分页 + 改 / 删。
 *
 * ---- 为什么收益页也要一个「全部记录」窗 ----
 * 卡片上只铺今天那几段，而这件事的用法是回看：上个月哪几天没上、哪个号烧得最多、
 * 补记的时候有没有把日期写错。这些都要跨天翻，卡片给不了。
 *
 * ---- 合计跟着筛选走 ----
 * 顶上那行「N 段 · 合计时长 · 合计点卡」算的是筛出来的这些。切完角色先想知道的就是
 * 「这个号这半年一共烧了多少」，与账号记录窗同一个道理。
 */
const emit = defineEmits<{ close: []; edit: [session: OnlineSession] }>();

const { sessions, removeOnline, flush } = useOnline();
const { roster } = useRoster();

const PER_PAGE = 20;

/** 「不限」的哨兵：SelectField 把空串当「没有值」，选中它会退回 placeholder。 */
const ANY = '__any__';

const who = ref(ANY);
const keyword = ref('');
const page = ref(1);

const whoOptions = computed(() => [
    { value: ANY, label: '全部角色' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

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

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)));
const visible = computed(() =>
    filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE),
);

/** 合计：给一个宽到装下全部的区间——这里要的是「筛出来这些的和」。 */
const totals = computed(() => onlineTotalsOf(filtered.value, '0000-01-01', '9999-12-31'));

const anyFilter = computed(() => who.value !== ANY || Boolean(keyword.value.trim()));

/* 筛选一变就回第一页：留在第 5 页而结果只剩两条时屏幕是空的，用户会以为没记录。 */
watch([who, keyword], () => {
    page.value = 1;
});

/* 当前页被删空后 page 会超出总页数——退到最后一页。 */
watch(pages, (value) => {
    if (page.value > value) page.value = value;
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
    const ok = await askConfirm({
        title: '删掉 ' + shortDate(one.date) + ' ' + timeText(one.startAt) + ' 这一段？',
        note:
            whoText(one) +
            ' · ' +
            minutesText(factsOfSession(one).minutes) +
            '。删了不能撤回，当天的点卡也会跟着减。',
        confirmText: '删除',
    });
    if (!ok) return;
    removeOnline(one.id);
    if (await saved(flush)) notify.success('已删掉一段');
}
</script>
<template>
    <!-- minHeight + fill：窗不低于 520，筛选条与小计钉在顶上，只有表格滚。 -->
    <ModalShell
        title="上线记录"
        :width="760"
        min-height="min(520px, calc(100vh - 48px))"
        fill
        @close="emit('close')"
    >
        <div class="filters">
            <SelectField v-model="who" :options="whoOptions" label="角色筛选" class="f-narrow" />
            <input
                v-model="keyword"
                class="field f-search"
                type="search"
                placeholder="搜备注 / 日期"
                aria-label="搜索上线记录"
                autocomplete="off"
            />
            <PressButton v-if="anyFilter" text="重置" label="清空筛选" @click="reset" />
        </div>

        <p class="sums">
            <span class="sum-item">{{ filtered.length }} 段</span>
            <span class="sum-item">合计 {{ minutesText(totals.minutes) }}</span>
            <span class="sum-item">点卡 {{ totals.cost > 0 ? moneyText(totals.cost) : '—' }}</span>
            <span v-if="totals.running" class="sum-item live">
                其中有 {{ totals.running }} 段还在计时
            </span>
        </p>

        <div class="log-scroll">
            <p v-if="!filtered.length" class="blank">
                {{ sessions.length ? '这个筛选下没有记录。' : '还没有上线记录。' }}
            </p>

            <table v-else class="rec-table">
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
                        <td class="c-dur">{{ clockText(factsOfSession(one).minutes) }}</td>
                        <td class="c-num">
                            {{ sessionCost(one) > 0 ? moneyText(sessionCost(one)) : '—' }}
                        </td>
                        <td class="c-note" :title="one.note">{{ one.note }}</td>
                        <td class="c-ops">
                            <!-- flex 包在 td 里的 span 上：td 一旦不是 table-cell，整张表的列宽会乱。 -->
                            <span class="ops">
                                <PressButton
                                    icon="edit"
                                    label="改这一段"
                                    size="md"
                                    @click="emit('edit', one)"
                                />
                                <PressButton
                                    icon="trash"
                                    label="删这一段"
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
                {{ filtered.length }} 段{{ anyFilter ? '（已筛选）' : '' }}
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
                label="关闭上线记录"
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
.f-narrow {
    flex: none;
    width: calc(118px * var(--fs-scale));
}
.f-search {
    flex: 1 1 140px;
    min-width: 110px;
}

.sums {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 14px;
    margin: 0 0 8px;
    font-size: var(--fs-mini);
}
.sum-item {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
.sum-item.live {
    color: var(--cinnabar);
}

/* 只有这一块滚。min-height: 0 不能省：flex 子项默认 min-height: auto，
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
    /* 表头那条线用 box-shadow 画，不用 border-bottom：
     * sticky 元素的边框会跟着内容一起滚，读到第 20 行时那条线会悬在两行中间。 */
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
.c-time {
    width: 108px;
    color: var(--num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
/* 还在计时的那一段：只有时段一列上朱，整行变色会跟别的意思撞上。 */
.c-time.live {
    color: var(--cinnabar);
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
    color: var(--num);
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

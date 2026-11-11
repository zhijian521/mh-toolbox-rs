<script setup lang="ts">
import { computed, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import DateField from '../../components/DateField.vue';
import SelectField from '../../components/SelectField.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { askConfirm } from '../../composables/use-confirm';
import { characterName, useRoster } from '../characters/roster';
import { shortDate, todayText } from '../../services/format';
import { amountText, entriesIn, totalsOf, type IncomeEntry } from './income';
import { useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import EntryEditDialog from './EntryEditDialog.vue';

/**
 * 历史收益：**上面选日期，下面是一张可改可删的表格**。
 *
 * ---- 三版试错换来的形态 ----
 *
 * 第一版「一天一行 + 点开逐条」：被否，角色看不清。
 * 第二版「按角色合计表 + 逐条全展开」：被否，前几天的数据被压到屏外。
 * 第三版「一天一行、行内挂角色」：还是不够——用户要的不只是**看**，而是「记错了能改回来」。
 *
 * 现在这一版把两件事分开：
 *   - **筛选在上**：**区间两端**两个日期选择器（月历纸片）+ 一个角色下拉。选哪天看哪天，
 *     不靠滚动找；
 *   - **表格在下**：区间里的每一条占一行，时间 / 物品 / 角色 / 金额 / 两枚操作。
 *
 * ---- 为什么从「一天」扩成「一段」----
 *
 * 2026-11-11 用户要「支持日期范围」：核对一笔账很少只看一天——「这个月摆摊到底收了多少」
 * 「上周那三件东西记进去没有」都是跨天的问法，单日选择器把这些问题挡在门外，只能一天一天
 * 翻着加。两端都给了之后，「一天」是这个区间的退化情形（起 == 止），不需要另一套界面。
 *
 * 角色筛选同一天加上：这一页的行本来就带角色列，但「只看某个号的账」原先只能靠眼睛在
 * 整屏里挑。它用**「全部角色 / 未指定 / 各角色」三段**（与账号页同一条口径）：
 * 「未指定」是一个真实的筛选目标，不是「不限」——合并之后「哪些账没记给人」就问不出来了。
 *
 * ---- 日期为什么从「下拉」换成「月历」----
 *
 * 上一版是一枚下拉，只列**有账的日子**，理由是「账本关心的是哪几天有账」。2026-11-05
 * 用户要「日期选择器」——那正好补上了旧写法丢掉的一半：想核对「某天是不是漏记了」时，
 * 没有记录的那天根本选不到，而「选不到」与「真的没有」在界面上长得一样。
 * 现在任意一天都能选进来，空的那天显示「这一天还没有记录」。
 *
 * ---- 为什么换回「流水」而不是「一天一行」 ----
 *
 * 「一天一行」是**汇总视图**，回答「哪天赚了多少」；用户这次要的是**流水视图**，
 * 回答「哪一笔记错了」。汇总压掉了单条的身份（id），没有身份就改不了、删不掉。
 * 所以顶层改成「按区间筛选 + 区间流水」，汇总退到顶部一行（笔数 / 净额 / 各角色小计）。
 *
 * ---- 删除要问一句，改不用 ----
 *
 * 改可以再改回来，删不行（账本里没有回收站）。两件事的风险不对等，交互也不该一样。
 */
const emit = defineEmits<{ close: [] }>();

const { entries, removeEntry, updateEntry, pending, flush } = useIncome();
const { roster } = useRoster();

/**
 * 「不限角色」的哨兵：`SelectField` 把空串当「没有值」，选中它会退回 placeholder。
 * 与账号页 / 目标页同一个写法。
 */
const ANY = '__any__';

/**
 * 正在看的区间两端。默认两端都落在今天——打开历史的人十次有九次是想核对今天，
 * 而「一天」正是这个区间的退化情形（起 == 止），不必为单日另留一套界面。
 */
const from = ref(todayText());
const to = ref(todayText());

/** 只看哪个号。`ANY` = 全部；空串 = 未指定角色（真实目标，见文件头）。 */
const who = ref(ANY);

const whoOptions = computed(() => [
    { value: ANY, label: '全部角色' },
    { value: '', label: '未指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

/**
 * 区间两端互相约束：起点不能晚于终点。
 *
 * 不让它互相约束的后果不是报错，而是**空白**——用户把起点拖到终点后面，表格什么都不显示，
 * 而界面上两个日期都长得正常。所以改一端时把另一端顺过去（DateField 的 `min` / `max`
 * 也会把越界的那几天画成不可选，两处一起兜）。
 */
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

/**
 * 区间里的流水，新的在上（`createdAt` 倒序）。
 *
 * 区间那一段走 `income.ts` 的 `entriesIn`：统计条的「今天 / 近七天 / 本月」用的是同一个
 * 函数、同一套「起止都含」的口径。这里再写一遍 `date >= from && date <= to` 也能跑，
 * 但两处一旦有一处改成开区间，同一个词在两个地方就指两段不同的日子。
 *
 * 角色筛选接在日期之后：两个条件都是「不满足就丢」，顺序只影响读起来的先后。
 */
const rows = computed(() =>
    entriesIn(entries.value, { from: from.value, to: to.value })
        .filter((one) => who.value === ANY || one.characterId === who.value)
        .sort((a, b) => b.createdAt - a.createdAt),
);

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

/** `HH:mm`。账本里的时间是「哪一笔」的定位符，不需要秒。 */
function timeOf(at: number): string {
    const one = new Date(at);
    return `${`${one.getHours()}`.padStart(2, '0')}:${`${one.getMinutes()}`.padStart(2, '0')}`;
}

/** 净额与支出都要带 `−`：只靠颜色的话，色弱或打印时一笔亏损会读成收入。 */
function signedOf(value: number): string {
    return value < 0 ? `−${amountText(-value)}` : amountText(value);
}

/** 改：不进确认，改错了还能再改。 */
async function save(patch: { amount: number; item: string; characterId: string }) {
    const target = editing.value;
    if (!target || pending.value > 0) return;

    const result = updateEntry(target.id, patch);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (!(await saved(flush))) return;
    if (editing.value === target) editing.value = null;
    notify.success(`已改好 · ${signedOf(patch.amount)}`);
}

/** 删：先问一句。账本里没有回收站，这一步不可逆。 */
async function remove(one: IncomeEntry) {
    const ok = await askConfirm({
        title: `删掉「${one.item || '未记物品'}」这一条？`,
        note: `${amountText(one.amount)}。删了不能撤回。`,
        confirmText: '删除',
    });
    if (!ok) return;

    removeEntry(one.id);
    if (await saved(flush)) notify.success('已删掉一条');
}
</script>

<template>
    <!-- `min-height` + `fill`：给一个下限（600，窗口矮时跟着缩），筛选条与汇总钉在顶上，
         只有下面的表格滚。
         **下限而不是定高**：两条记录时不该缩成一小块（用户原话「高度太低不好看」），
         但也不该反过来留出半屏空白——定高 620 就是这样，比矮更难看。记录多了它自己长，
         长到 `max-height` 之后表格内部再滚。
         720 → 900 是 2026-11-11 用户「弹窗可以增大一点」：筛选条从「一个日期」变成
         「两个日期 + 一个角色」之后，720 装不下还让「物品」那一列挤成一条缝。 -->
    <ModalShell
        title="历史收益"
        :width="900"
        min-height="min(600px, calc(100vh - 48px))"
        fill
        @close="emit('close')"
    >
        <!-- 筛选在上：选哪段看哪段，不用滚动找。三个控件各管一件事——起、止、谁。
             「回到今天」长在纸片自己的页脚里（`DateField` 的能力，不只服务这一页），
             这里不再挂第二枚。 -->
        <div class="filters">
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
            <span class="sum">
                <span class="dim">{{ rangeTotals.count }} 笔</span>
            </span>
        </div>

        <!-- 表格顶上这一排**总计 + 各号小计**（2026-11-11 用户：「总共金额也放到表格顶部左上，
             和角色收益一排展示，做成 tag 标签类型，一个角色一个，总计也一个」）。
             总计排第一、样式重一档：它是这一排的标题，后面每一枚都是它的拆解。
             它跟着上面的角色筛选走——只看某个号时，总计与那一枚说的是同一件事。 -->
        <p v-if="rows.length" class="sum-bar">
            <span class="sum-tag total" :class="{ loss: rangeTotals.net < 0 }">
                <span class="tag-name">总计</span>
                <b>{{ signedOf(rangeTotals.net) }}</b>
            </span>
            <span
                v-for="row in whoSums"
                :key="row.id"
                class="sum-tag"
                :class="{ idle: !row.id, loss: row.net < 0 }"
            >
                <span class="tag-name">{{ row.name }}</span>
                <b>{{ signedOf(row.net) }}</b>
            </span>
        </p>

        <p v-if="!rows.length" class="note blank">
            {{ multiDay ? '这段时间还没有记录。' : '这一天还没有记录。' }}
        </p>

        <!-- 只有表格滚（`fill` 让正文成为纵向 flex 容器，这里吃掉剩下的全部高度）。
             表头 `sticky` 钉在容器顶上：往下翻十几行之后仍知道哪列是哪列。 -->
        <div v-else class="log-scroll">
            <table class="log">
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
                    <tr v-for="one in rows" :key="one.id">
                        <td class="c-time" :class="{ wide: multiDay }">
                            <!-- 跨天时把日期补在时间上面：区间一跨天，「14:32」单独看
                                 分不出是哪天的 14:32，而这一列正是给人对时间的。 -->
                            <span class="time-cell">
                                <span v-if="multiDay" class="c-date">{{
                                    shortDate(one.date)
                                }}</span>
                                <span class="c-clock">{{ timeOf(one.createdAt) }}</span>
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
                                one.kind === 'expense'
                                    ? `−${amountText(one.amount)}`
                                    : amountText(one.amount)
                            }}
                        </td>
                        <td class="c-ops">
                            <span class="ops">
                                <PressButton
                                    icon="edit"
                                    label="改这一条"
                                    size="md"
                                    @click="editing = one"
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
            <!-- 净额已经在表格顶上那排 tag 里了，这里只留条数：同一行里写第二遍净额，
                 读的人会先看一眼页脚再回头看表头，多绕一步。 -->
            <span class="foot-sum">{{ rangeTotals.count }} 笔</span>
            <PressButton text="关闭" label="关闭历史收益" @click="emit('close')" />
        </template>

        <!-- 叠在这张窗上面的一层（`ModalShell` 自带弹窗栈，Esc 只关最上面那层）。 -->
        <EntryEditDialog v-if="editing" :entry="editing" @save="save" @close="editing = null" />
    </ModalShell>
</template>

<style scoped>
.filters {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    /* 与下面那排 tag / 表格之间留出一道气（2026-11-11 用户「顶部搜索和下面表格中间加点间距」）。
     * 8 的时候筛选行的下沿几乎贴着表格上框，读起来像表头的一部分。 */
    margin-bottom: 12px;
}
/* 日期条定宽 168：换月、换日时触发条上的字长度会变（「2026年11月5日」与
 * 「2026年12月15日」差一个字），不定宽的话右边那行汇总会跟着左右晃。
 * 两端各一条之后比单日时窄一点——两条加起来仍比一整个筛选行短得多，而中间那个「至」
 * 占掉的宽度是这一行唯一可以让出来的地方。
 *
 * **必须乘 `--fs-scale`**：字号档从 0.92 到 1.1，「2026年12月15日」在 1.1 档下比 168 宽，
 * 不乘就会截成「2026年12月1…」。开发页那条 `.demo-date` 也是同一个值（同一个尺度），
 * 两处一起改才不会一边松一边紧。 */
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
/* 笔数留在筛选行右端：它回答的是「这次筛出多少条」，和起止、角色是同一件事。
 * 净额不在这里——它挪到表格顶上那一排 tag 里（见下），那是「钱」的位置。 */
.sum {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-left: auto;
}
.sum .dim {
    color: var(--muted);
    font-size: var(--fs-mini);
}

/* ---------- 总计 + 各号小计：一排 tag ---------- */
/* 2026-11-11 用户：「总共金额也放到表格顶部左上，和角色收益一排展示，做成 tag 标签类型，
 * 一个角色一个，总计也一个」。
 *
 * 顺序是「总计 → 各号」而不是「各号 → 总计」：总计是这一排的标题，后面每一枚都是它的拆解，
 * 从左往右读过去正好是「一共多少、分别是谁的」。总计因此也重一档（赭底 + 赭框 + 粗读数），
 * 其余各枚只给淡槽底——它们并列，谁也不比谁重要。
 *
 * `flex: none`：这一排钉在表格上面，不许被下面的表格挤扁（`flex-shrink` 默认 1）。 */
.sum-bar {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 0 10px;
}
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
.sum-tag.loss b {
    color: var(--cinnabar);
}

/* ---------- 流水表 ---------- */
/* 只有这一块滚：`flex: 1` 吃掉正文剩下的全部高度，`min-height: 0` 是它**必须**的——
 * flex 子项的默认 `min-height: auto` 会被内容顶开，写多少高度都拦不住它把弹窗撑长。
 *
 * `scrollbar-gutter: stable`：轨道常驻。记录从 1 条变到 20 条时表格不会横向跳一下，
 * 而且它与 `.modal-body-fill` 让出的那 10px 正好相抵——表格右缘与页脚对齐。
 * 不留负外边距：那会把轨道一起推出内衬，反而错开。 */
.log-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
}

/* 表框：整张表**自己是一张纸**（2026-11-11 用户「表格最外边加边框」）。
 *
 * 为什么边框画在这里而不是 `.log-scroll` 上：滚动容器带边框时，里面的内容会在边框
 * 下面滚过去，上沿那道线看着像悬在表头上面；把圆角与边框交给 `table` 自己，
 * 表头 `sticky` 钉住时正好贴在这道内沿上。
 *
 * `border-collapse: separate` + `border-spacing: 0`：`collapse` 下 `border-radius`
 * 不生效（四角会被相邻单元格的边框顶成直角），而这张纸需要圆角与纸语言一致。 */
.log {
    /* 表格自己的圆角**裁不掉单元格**：单元格是方盒子，纸色一路铺到角上，于是上面
     * 两个角的边框弧线被压在纸色底下，读作「圆角被切了」（2026-11-11 用户「表格上面
     * 的两个角上的边框好像因为圆角被切割了」）。表头必须是不透明纸色（`sticky` 时下面
     * 的行不能透出来），所以只能让**四角那四格自己跟着圆**。
     *
     * 内圆角 = 外圆角 − 边框宽：`--r-3` 是表格外沿的弧，单元格从边框内侧开始，直接
     * 抄同一个值会比外沿多鼓出 1px。 */
    --log-inner-r: calc(var(--r-3) - var(--w-hair));
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-3);
    background: var(--paper);
    font-size: var(--fs-sm);
}
/* 四个角上只有各自那一格跟着圆走，其余格子照旧方（它们本来就在直边上）。 */
.log thead th:first-child {
    border-top-left-radius: var(--log-inner-r);
}
.log thead th:last-child {
    border-top-right-radius: var(--log-inner-r);
}
.log tbody tr:last-child td:first-child {
    border-bottom-left-radius: var(--log-inner-r);
}
.log tbody tr:last-child td:last-child {
    border-bottom-right-radius: var(--log-inner-r);
}
/* 表头钉在容器顶上：往下翻十几行之后仍知道哪列是哪列。
 *
 * 底边那道线用 `box-shadow` 画而不是 `border-bottom`——`sticky` 元素滚动时边框会跟着
 * 内容一起走，读起来像一条悬在两行之间的线。
 *
 * 背景必须是**不透明的纸色**：半透明时下面的行会从表头里透出来。 */
.log thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    /* 表头与数据行**同高**（2026-11-11 用户「表头高度和列表保持一致」）。
     *
     * 行高不是文字撑出来的：每一行右侧是两枚 26 高的操作按钮，所以数据行实际高度是
     * `26 + 7×2 = 40`。表头原先只有 `5 + 小字`（约 27），一条细带压在表身上，
     * 读起来像「表还没画完」。把内容盒钉成和按钮一样高（`line-height` 26）再把
     * 上下内距对齐到行的 7，两处就同高了——两处都跟着 `--fs-scale` 走，放大字号时
     * 不会一边长一边不长。 */
    padding: 7px 6px;
    background: var(--paper);
    box-shadow: inset 0 -1px 0 var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    font-weight: 400;
    letter-spacing: 0.08em;
    line-height: calc(26px * var(--fs-scale));
    text-align: left;
    white-space: nowrap;
}
/* 行高 7：**这一步是被用户点出来的**（2026-11-05「高度太低不好看」）。
 * 4 的时候两枚 26 高的操作按钮把行撑得比字高出一截，四边留白又不匀，整张表读作
 * 「一条条挤在一起」；7 之后行高约 34，与票面行 sm 档的呼吸一致，一屏仍放得下 12 行。 */
.log tbody td {
    padding: 7px 6px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.log tbody tr:last-child td {
    border-bottom: 0;
}
/* 斑马纹（2026-11-11 用户「表格样式优化为斑马纹」）。
 *
 * 用 `nth-child(even)` 的**底色**而不是隔行加线：账本里一行行都是同一种纸，加线会让
 * 一张 20 行的表读成「20 个格子」；淡到 12% 的 `--well` 只够让眼睛在横向追踪时有个
 * 落脚点，不抢读数。
 *
 * 悬停要**压过**斑马纹：只写 `tbody tr:hover td` 的话它与斑马纹同为 0-1-1，谁后注入
 * 谁赢——悬停会被偶数行的斑马纹吃掉，读起来像「悬停有时灵有时不灵」。 */
.log tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--well) 12%, transparent);
}
.log tbody tr:hover td {
    background: color-mix(in srgb, var(--well) 26%, transparent);
}

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
    color: var(--num);
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.c-num.out {
    color: var(--cinnabar);
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
    filter: sepia(0.22) saturate(0.86) contrast(0.98);
    opacity: 0.94;
}
:global(html.dark) .item-cell img {
    filter: sepia(0.18) saturate(0.8) brightness(0.86);
}
.item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 两枚操作并排、靠右：`td` 上不能直接 `display: flex`（会破坏表格列宽），
 * 所以中间夹一层 `span`。 */
.ops {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
}

/* 空态：定高之后这一句要在整块正文里居中。`margin: auto` 在纵向 flex 容器里就是
 * 「上下都吃掉剩余空间」——写 `margin: 26px 0` 会贴在顶部，下面一大片空白看着像没加载完。 */
.blank {
    margin: auto;
    text-align: center;
}
.foot-sum {
    margin-right: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>

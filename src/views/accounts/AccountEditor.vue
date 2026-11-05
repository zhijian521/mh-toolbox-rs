<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { todayText } from '../../services/format';
import { useRoster } from '../characters/roster';
import {
    ACCOUNT_CATEGORIES,
    CHANNELS,
    CURRENCY_META,
    amountText,
    type AccountEntry,
    type AccountKind,
    type Currency,
} from './accounts';
import type { EntryInput } from './accounts-store';

/**
 * 记一笔账号收支 / 改一条已有的。
 *
 * ---- 币种决定「金额那一格说的是什么单位」 ----
 * 人民币按元、梦幻币按万。切换币种时**保留数字**（用户改的是「这个数是元还是万」），
 * 但金额下面会把换算后的实际值写出来——否则「30 万」与「30 元」在格子里长得一模一样，
 * 而它们的差别是一万倍。
 *
 * ---- 只收字段，不写库 ----
 * 与 `EntryEditDialog` 同一条分工：这个组件 `emit` 一个 `EntryInput`，
 * 校验与写入归 `accounts-store`。于是同一个窗既能从「记一笔」开，也能从「改一条」开。
 *
 * ---- 角色可以不指定 ----
 * 点卡是全号共用的，硬塞给某一个角色会让那个号的账虚高。空串是合法值，
 * 界面上显示「不指定」——它在 `SelectField` 里需要一个哨兵值，见下面 `NOTHING`。
 */
const props = defineProps<{ entry?: AccountEntry; seed?: Partial<EntryInput> }>();

const emit = defineEmits<{ save: [input: EntryInput]; close: [] }>();

const { roster } = useRoster();

/** 与 `EntryEditDialog` 同一个哨兵：`SelectField` 把空串当「没有值」。 */
const NOTHING = '__none__';

const noteId = useId();

const seed = props.seed ?? {};
const initialCurrency: Currency = props.entry?.currency ?? seed.currency ?? 'rmb';

const currency = ref<Currency>(initialCurrency);
const kind = ref<AccountKind>(props.entry?.kind ?? seed.kind ?? 'expense');
const date = ref(props.entry?.date ?? seed.date ?? todayText());
const category = ref(props.entry?.category ?? seed.category ?? '其他收支');
const channel = ref(props.entry?.channel ?? seed.channel ?? '其他');
const characterId = ref((props.entry?.characterId ?? seed.characterId ?? '') || NOTHING);
const note = ref(props.entry?.note ?? seed.note ?? '');

/** 金额在输入框里的值：人民币是元，梦幻币是万。 */
function inputOf(entry: AccountEntry | undefined): number {
    if (!entry) return 0;
    return entry.currency === 'cash' ? entry.amount / 10000 : entry.amount;
}

const amount = ref<number>(inputOf(props.entry));

const unit = computed(() => CURRENCY_META[currency.value].unit);

/**
 * 换算后的实际值。只在梦幻币下显示：人民币的「元」就是落库单位，再写一遍是废话；
 * 而「4.6 万」落库是 46000，用户看不见这个数就不知道那一格存了什么。
 */
const converted = computed(() => {
    if (currency.value !== 'cash' || amount.value <= 0) return '';
    return `= ${amountText(Math.round(amount.value * 10000), 'cash')}`;
});

const currencyOptions: { value: Currency; label: string }[] = [
    { value: 'rmb', label: '人民币 · 元' },
    { value: 'cash', label: '梦幻币 · 万' },
];

const kindOptions: { value: AccountKind; label: string }[] = [
    { value: 'expense', label: '支出 / 买入' },
    { value: 'income', label: '收入 / 卖出' },
];

const categoryOptions = ACCOUNT_CATEGORIES.map((one) => ({ value: one as string, label: one }));
const channelOptions = CHANNELS.map((one) => ({ value: one as string, label: one }));

const whoOptions = computed(() => [
    { value: NOTHING, label: '不指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

const canSave = computed(() => amount.value > 0 && Boolean(category.value) && Boolean(date.value));

function submit() {
    if (!canSave.value) return;
    emit('save', {
        date: date.value,
        characterId: characterId.value === NOTHING ? '' : characterId.value,
        kind: kind.value,
        currency: currency.value,
        category: category.value,
        channel: channel.value,
        amount: amount.value,
        note: note.value,
    });
}
</script>

<template>
    <ModalShell
        :title="entry ? '改这一条' : '记一笔'"
        :width="452"
        :scroll="false"
        @close="emit('close')"
    >
        <form class="form" @submit.prevent="submit">
            <!-- 币种单独一行、排在最前：它决定下面「金额」那一格说的是元还是万，
                 放到后面等于让人先填一个数、再回头发现单位错了。 -->
            <div class="form-row">
                <span class="field-label">币种</span>
                <SegmentedPills v-model="currency" :options="currencyOptions" label="记账币种" />
            </div>

            <div class="form-row">
                <label class="field-label">金额（{{ unit }}）</label>
                <!-- 精度跟着币种：人民币两位（有分），梦幻币零位（币没有小数）。
                     不给的话 `NumberField` 默认取整，12.5 元会被存成 13。 -->
                <NumberField
                    v-model="amount"
                    label="成交金额"
                    zero-as-empty
                    :precision="currency === 'rmb' ? 2 : 0"
                />
                <span v-if="converted" class="form-note">{{ converted }}</span>
            </div>

            <div class="pair">
                <div class="form-row">
                    <span class="field-label">方向</span>
                    <SegmentedPills v-model="kind" :options="kindOptions" label="收支方向" />
                </div>
                <div class="form-row">
                    <span class="field-label">日期</span>
                    <DateField v-model="date" label="记账日期" />
                </div>
            </div>

            <div class="pair">
                <div class="form-row">
                    <span class="field-label">分类</span>
                    <SelectField v-model="category" :options="categoryOptions" label="收支分类" />
                </div>
                <div class="form-row">
                    <span class="field-label">渠道</span>
                    <SelectField v-model="channel" :options="channelOptions" label="交易渠道" />
                </div>
            </div>

            <div class="form-row">
                <span class="field-label">记给谁</span>
                <SelectField
                    v-model="characterId"
                    :options="whoOptions"
                    label="这笔账记给哪个角色"
                />
            </div>

            <div class="form-row">
                <label class="field-label" :for="noteId">备注</label>
                <input
                    :id="noteId"
                    v-model="note"
                    class="field"
                    type="text"
                    placeholder="如：藏宝阁购入简易武器 / 充了 30 元点卡"
                    aria-label="备注"
                    autocomplete="off"
                />
            </div>
        </form>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不记了" @click="emit('close')" />
            <PressButton
                icon="check"
                :text="entry ? '保存' : '记入'"
                :label="entry ? '保存这一条' : '记入账本'"
                :disabled="!canSave"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.form {
    display: grid;
    gap: 10px;
}
/* 标签在上、控件在下：`.field` 是通栏宽度，标签放左侧会把它挤窄；
 * 而 `SegmentedPills` 一组的宽度是按内容走的，两者同一个节奏。 */
.form-row {
    display: grid;
    gap: 4px;
}
/* 两列配对：方向与日期、分类与渠道。这两对的宽度需求相近，并排能少两行；
 * `minmax(0, 1fr)` 让长分类名（「召唤兽交易」）自己截断而不是把整格撑宽。 */
.pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}
.form-note {
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
</style>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useRouter } from 'vue-router';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { todayText } from '../../services/format';
import { characterOptions } from '../income/character-options';
import { accountValueText } from './account-analysis';
import { characterName, useRoster } from '../characters/roster';
import {
    ACCOUNT_CATEGORIES,
    CHANNELS,
    CURRENCY_META,
    type AccountEntry,
    type AccountKind,
    type Currency,
} from './accounts';
import type { EntryInput } from './accounts-store';

const props = withDefaults(
    defineProps<{
        entry?: AccountEntry;
        seed?: Partial<EntryInput>;
        saving?: boolean;
        locked?: boolean;
        retrying?: boolean;
    }>(),
    { saving: false, locked: false, retrying: false },
);
const emit = defineEmits<{ save: [input: EntryInput]; close: [] }>();
const router = useRouter();
const automatic = computed(() => props.entry?.source === 'auto');

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
    const value = entry.currency === 'cash' ? entry.amount / 10000 : entry.amount;
    return Math.round(value * 100) / 100;
}

const amount = ref<number>(inputOf(props.entry));

const unit = computed(() => CURRENCY_META[currency.value].unit);

const currencyOptions: { value: Currency; label: string }[] = [
    { value: 'rmb', label: '人民币 · 元' },
    { value: 'cash', label: '梦幻币 · 万' },
];

const kindOptions: { value: AccountKind; label: string }[] = [
    { value: 'expense', label: '支出 / 买入' },
    { value: 'income', label: '收入 / 卖出' },
];

const categoryOptions = computed(() =>
    [...new Set([...ACCOUNT_CATEGORIES, category.value])]
        .filter(Boolean)
        .map((one) => ({ value: one, label: one })),
);
const channelOptions = computed(() =>
    [...new Set([...CHANNELS, channel.value])]
        .filter(Boolean)
        .map((one) => ({ value: one, label: one })),
);

const whoOptions = computed(() => [
    { value: NOTHING, label: '不指定' },
    ...characterOptions(roster.value, [props.entry?.characterId ?? '']),
]);

const canSave = computed(() => {
    return (
        Number.isFinite(amount.value) &&
        Math.round(amount.value * 100) > 0 &&
        Boolean(category.value) &&
        Boolean(date.value)
    );
});

function submit() {
    if (automatic.value || props.saving || (!props.retrying && !canSave.value)) return;
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
        :title="automatic ? '账目详情' : entry ? '修改记录' : '记一笔'"
        :width="452"
        @close="emit('close')"
    >
        <dl v-if="automatic && entry" class="entry-detail">
            <div class="detail-amount" :class="entry.kind">
                <dt>{{ entry.kind === 'income' ? '收入' : '支出' }}</dt>
                <dd>{{ accountValueText(entry.amount, entry.currency) }}</dd>
            </div>
            <div>
                <dt>日期</dt>
                <dd>{{ entry.date }}</dd>
            </div>
            <div>
                <dt>分类</dt>
                <dd>{{ entry.category }}</dd>
            </div>
            <div>
                <dt>角色</dt>
                <dd>{{ characterName(roster, entry.characterId) }}</dd>
            </div>
            <div>
                <dt>渠道</dt>
                <dd>{{ entry.channel }}</dd>
            </div>
            <div>
                <dt>来源</dt>
                <dd>收益页自动同步</dd>
            </div>
            <div v-if="entry.note">
                <dt>备注</dt>
                <dd>{{ entry.note }}</dd>
            </div>
        </dl>
        <form v-else @submit.prevent="submit">
            <fieldset class="income-form" :disabled="locked">
                <!-- 币种单独一行、排在最前：它决定下面「金额」那一格说的是元还是万，
                 放到后面等于让人先填一个数、再回头发现单位错了。 -->
                <div class="form-row">
                    <span class="field-label">币种</span>
                    <SegmentedPills
                        v-model="currency"
                        :options="currencyOptions"
                        label="记账币种"
                    />
                </div>

                <div class="form-row">
                    <span class="field-label">金额（{{ unit }}）</span>
                    <!-- 元、万两种输入都最多保留两位小数。 -->
                    <NumberField
                        v-model="amount"
                        label="成交金额"
                        zero-as-empty
                        :precision="2"
                        class="amount-field"
                    />
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
                        <SelectField
                            v-model="category"
                            :options="categoryOptions"
                            label="收支分类"
                        />
                    </div>
                    <div class="form-row">
                        <span class="field-label">渠道</span>
                        <SelectField v-model="channel" :options="channelOptions" label="交易渠道" />
                    </div>
                </div>

                <div class="form-row">
                    <span class="field-label">角色</span>
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
                        aria-label="备注"
                        autocomplete="off"
                    />
                </div>
            </fieldset>
        </form>

        <template #footer>
            <PressButton
                data-modal-cancel
                :text="automatic ? '关闭' : '取消'"
                label="关闭账目编辑"
                :disabled="saving"
                @click="emit('close')"
            />
            <PressButton
                v-if="automatic"
                text="去收益页"
                label="前往收益页修改原始记录"
                @click="router.push('/income')"
            />
            <PressButton
                v-else
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : entry ? '保存' : '记入'"
                :label="entry ? '保存这一条' : '记入账本'"
                :disabled="saving || (!retrying && !canSave)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.amount-field {
    width: 100%;
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
.entry-detail {
    display: grid;
    gap: 0;
    margin: 0;
}
.entry-detail > div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-bottom: var(--w-hair) solid var(--rule);
}
.entry-detail > div:last-child {
    border-bottom: 0;
}
.entry-detail dt {
    color: var(--muted);
    font-size: var(--fs-sm);
}
.entry-detail dd {
    margin: 0;
    overflow-wrap: anywhere;
}
.detail-amount dd {
    font-size: var(--fs-amount);
    font-variant-numeric: tabular-nums;
}
.income {
    color: var(--positive);
}
.expense {
    color: var(--negative);
}
</style>

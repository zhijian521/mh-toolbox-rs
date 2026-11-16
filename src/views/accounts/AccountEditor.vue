<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useRouter } from 'vue-router';
import CostSwitch from '../../components/CostSwitch.vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { withCurrentOption } from '../../components/select-options';
import { todayText } from '../../services/format';
import { characterOptions, UNASSIGNED_CHARACTER as NOTHING } from '../characters/character-options';
import { accountValueText } from './account-analysis';
import { cbgSaleRule, isCbgSale, quoteCbgFee } from './account-fees';
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
        saveError?: string;
    }>(),
    { saving: false, locked: false, retrying: false },
);
const emit = defineEmits<{ save: [input: EntryInput]; close: [] }>();
const router = useRouter();
const automatic = computed(() => props.entry?.source === 'auto');

const { roster } = useRoster();

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
const amountEdited = ref(false);
// 存档金额已经是实得；编辑时默认再扣一次会让旧账越改越少。
const deductCbgFee = ref(seed.deductCbgFee ?? !props.entry);
const sale = computed(() => ({
    kind: kind.value,
    currency: currency.value,
    category: category.value,
    channel: channel.value,
}));
const cbgSale = computed(() => isCbgSale(sale.value));
const feeRule = computed(() => cbgSaleRule(sale.value));
const deductFee = computed(() => cbgSale.value && deductCbgFee.value);
const feeQuote = computed(() => (feeRule.value ? quoteCbgFee(amount.value, feeRule.value) : null));
watch(
    currency,
    () => {
        amountEdited.value = true;
    },
    { flush: 'sync' },
);
const preserveAmount = computed(() =>
    Boolean(props.entry && !amountEdited.value && !deductFee.value),
);

const unit = computed(() => CURRENCY_META[currency.value].unit);
const amountLabel = computed(() => {
    const label = cbgSale.value ? (deductFee.value ? '成交总价' : '实得金额') : '金额';
    return `${label}（${unit.value}）`;
});

const currencyOptions: { value: Currency; label: string }[] = [
    { value: 'rmb', label: '人民币 · 元' },
    { value: 'cash', label: '梦幻币 · 万' },
];

const kindOptions: { value: AccountKind; label: string }[] = [
    { value: 'expense', label: '支出 / 买入' },
    { value: 'income', label: '收入 / 卖出' },
];

const categoryOptions = computed(() =>
    withCurrentOption(
        ACCOUNT_CATEGORIES.map((one) => ({ value: one, label: one })),
        category.value,
    ),
);
const channelOptions = computed(() =>
    withCurrentOption(
        CHANNELS.map((one) => ({ value: one, label: one })),
        channel.value,
    ),
);

const whoOptions = computed(() =>
    characterOptions(roster.value, [props.entry?.characterId ?? seed.characterId ?? ''], {
        unassigned: '不指定',
    }),
);

const canSave = computed(() => {
    return (
        Number.isFinite(amount.value) &&
        (preserveAmount.value
            ? (props.entry?.amount ?? 0) > 0
            : Math.round(amount.value * 100) > 0) &&
        Boolean(category.value) &&
        Boolean(date.value) &&
        (!deductFee.value || (feeQuote.value !== null && feeQuote.value.net > 0))
    );
});

function submit() {
    if (automatic.value || props.saving || (!props.retrying && (props.locked || !canSave.value)))
        return;
    emit('save', {
        date: date.value,
        characterId: characterId.value === NOTHING ? '' : characterId.value,
        kind: kind.value,
        currency: currency.value,
        category: category.value,
        channel: channel.value,
        amount: amount.value,
        preserveAmount: preserveAmount.value,
        deductCbgFee: deductFee.value,
        note: note.value,
    });
}
</script>

<template>
    <ModalShell
        :title="automatic ? '账目详情' : entry ? '修改记录' : '记一笔'"
        :width="480"
        @close="!saving && emit('close')"
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
        <form v-else class="modal-form" @submit.prevent="submit">
            <fieldset class="income-form" :disabled="locked" :inert="locked">
                <!-- 币种单独一行、排在最前：它决定下面「金额」那一格说的是元还是万，
                 放到后面等于让人先填一个数、再回头发现单位错了。 -->
                <div class="account-field">
                    <span class="field-label">币种</span>
                    <SegmentedPills
                        v-model="currency"
                        :options="currencyOptions"
                        label="记账币种"
                        :disabled="locked"
                    />
                </div>

                <div class="account-field amount-row">
                    <span class="field-label">{{ amountLabel }}</span>
                    <!-- 元、万两种输入都最多保留两位小数。 -->
                    <NumberField
                        v-model="amount"
                        update-on-input
                        :label="cbgSale && !deductFee ? '实得金额' : '成交金额'"
                        zero-as-empty
                        :precision="2"
                        class="amount-field value-emphasis"
                        @input="amountEdited = true"
                    />
                    <div v-if="cbgSale" class="fee-switch">
                        <span class="field-label">是否扣除手续费</span>
                        <CostSwitch
                            v-model="deductCbgFee"
                            off-label="否"
                            on-label="是"
                            label="是否扣除手续费"
                            :disabled="locked"
                        />
                    </div>
                    <div
                        v-if="deductFee && (feeQuote || !feeRule)"
                        class="fee-preview"
                        aria-live="polite"
                    >
                        <p v-if="feeQuote" class="fee-amounts">
                            <span>手续费 {{ accountValueText(feeQuote.fee, 'rmb') }}</span>
                            <span
                                >实得 <b>{{ accountValueText(feeQuote.net, 'rmb') }}</b></span
                            >
                        </p>
                        <p v-else class="note error">规则未加载，请选择不扣费并填写实得。</p>
                    </div>
                </div>

                <div class="account-field">
                    <span class="field-label">角色</span>
                    <SegmentedPills
                        v-model="characterId"
                        class="character-pick"
                        :options="whoOptions"
                        label="这笔账记给哪个角色"
                        :disabled="locked"
                        wrap
                    />
                </div>

                <div class="pair form-pair">
                    <div class="account-field">
                        <span class="field-label">方向</span>
                        <SegmentedPills
                            v-model="kind"
                            :options="kindOptions"
                            label="收支方向"
                            :disabled="locked"
                        />
                    </div>
                    <div class="account-field">
                        <span class="field-label">日期</span>
                        <DateField v-model="date" label="记账日期" :disabled="locked" />
                    </div>
                </div>

                <div class="pair form-pair">
                    <div class="account-field">
                        <span class="field-label">分类</span>
                        <SelectField
                            v-model="category"
                            :options="categoryOptions"
                            label="收支分类"
                            :disabled="locked"
                        />
                    </div>
                    <div class="account-field">
                        <span class="field-label">渠道</span>
                        <SelectField
                            v-model="channel"
                            :options="channelOptions"
                            label="交易渠道"
                            :disabled="locked"
                        />
                    </div>
                </div>

                <div class="account-field">
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
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
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
.amount-row {
    justify-items: center;
    padding: 8px 0;
}
.fee-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 4px;
}
.character-pick :deep(.bevel-pill) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}
.fee-preview {
    width: 100%;
    text-align: center;
}
.fee-amounts {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    color: var(--muted);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.fee-amounts b {
    color: var(--positive);
    font-weight: inherit;
}
/* 标签在上、控件在下：`.field` 是通栏宽度，标签放左侧会把它挤窄；
 * 而 `SegmentedPills` 一组的宽度是按内容走的，两者同一个节奏。 */
.account-field {
    display: grid;
    align-items: center;
    gap: 4px;
}
/* 两列配对：方向与日期、分类与渠道。这两对的宽度需求相近，并排能少两行；
 * `minmax(0, 1fr)` 让长分类名（「召唤兽交易」）自己截断而不是把整格撑宽。 */
.pair {
    --form-pair-gap: 10px;
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

<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePositiveAmount } from '../../composables/use-positive-amount';
import ModalShell from '../../components/ModalShell.vue';
import PriceField from '../../components/PriceField.vue';
import PressButton from '../../components/PressButton.vue';
import type { QuickItemEntry } from '../../services/game-data';

const props = defineProps<{
    saving?: boolean;
    saveError?: string;
    locked?: boolean;
    retryAction?: string | null;
    item: QuickItemEntry;
    mode: 'fixed' | 'variable';
    /** 保存后是否接着记一条。`false` = 只改价（右键进来的）。 */
    thenAdd: boolean;
    /** 这件物品现在的单价（原值）。`0` = 还没设过价，此时没有「清除」可言。 */
    current?: number;
}>();

const emit = defineEmits<{ save: [amount: number]; clear: []; close: [] }>();

const amount = ref(
    props.mode === 'fixed' && !props.thenAdd && (props.current ?? 0) > 0 ? (props.current ?? 0) : 0,
);

const isMoney = computed(() => props.item.name === '金币');
const title = computed(() => {
    if (props.mode === 'variable') return `记一条「${props.item.name}」`;
    return props.thenAdd ? `给「${props.item.name}」定价` : `改「${props.item.name}」的单价`;
});

const { typed, submitted, canSave, error, showError } = usePositiveAmount(amount, () =>
    isMoney.value ? '金额' : '单价',
);

const canClear = computed(
    () => props.mode === 'fixed' && !props.thenAdd && (props.current ?? 0) > 0,
);

function submit() {
    submitted.value = true;
    if (props.saving || (props.retryAction !== 'save' && (!canSave.value || props.locked))) return;
    emit('save', Math.round(amount.value));
}

function onEnter(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell :title="title" :width="360" :scroll="false" @close="!saving && emit('close')">
        <form class="income-form modal-form" @submit.prevent="submit" @keydown.enter="onEnter">
            <fieldset class="income-form" :disabled="locked" :inert="locked">
                <PriceField
                    v-model="amount"
                    :precision="2"
                    :label="isMoney ? '这笔多少钱' : '单价'"
                    stepper
                    :error="showError ? error : ''"
                    @update:model-value="typed = true"
                />
            </fieldset>
        </form>

        <template #footer>
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
            <!-- 清除放最左、与两个动作隔开：它既不是「取消」也不是「保存」，
                 把三枚并成一排会让人以为「清除」是另一种确定。 -->
            <PressButton
                v-if="canClear || retryAction === 'clear'"
                danger
                class="foot-left"
                icon="trash"
                :text="retryAction === 'clear' ? '重试清除' : '清除'"
                :disabled="saving || retryAction === 'save'"
                label="清除这件物品的单价"
                @click="emit('clear')"
            />
            <PressButton
                data-modal-cancel
                :disabled="saving"
                text="取消"
                label="不改了"
                @click="!saving && emit('close')"
            />
            <PressButton
                icon="check"
                :text="retryAction === 'save' ? '重试保存' : thenAdd ? '记下' : '保存'"
                :label="thenAdd ? '记下这一条' : '保存单价'"
                :disabled="saving || retryAction === 'clear' || (!canSave && !retryAction)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 弹窗底栏是 `justify-content: flex-end`（两个动作贴右），所以「清除」靠
 * `margin-right: auto` 自己站到左端，不用再塞一个占位元素。 */
.foot-left {
    margin-right: auto;
}
</style>

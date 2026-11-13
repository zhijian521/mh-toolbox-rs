<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePositiveAmount } from '../../composables/use-positive-amount';
import ModalShell from '../../components/ModalShell.vue';
import PriceField from '../../components/PriceField.vue';
import PressButton from '../../components/PressButton.vue';
import { ledgerMoneyText } from '../../services/format';
import { POINTS_PER_HOUR } from './online';

const props = defineProps<{
    saving?: boolean;
    locked?: boolean;
    retrying?: boolean;
    /** 现在的单价（游戏币**原值**，与库里同一个口径）。 */
    current: number;
    /** 点卡算不算进账号收支。只在这窗里说明一句，开关本身在状态条上。 */
    cardCost: boolean;
}>();

const emit = defineEmits<{ save: [amount: number]; close: [] }>();

/* `PriceField` 的 v-model 进出的都是原值，内部换成「万」显示。
 *
 * 预填现值：进来是「改」不是「填」，让人对着空白格重打一遍 1.5 万既多一步、又容易打错，
 * 而错的是单价，之后每一笔成本都跟着错。 */
const amount = ref<number | null>(props.current > 0 ? props.current : null);

const { typed, submitted, canSave, error, showError } = usePositiveAmount(amount, () => '单价');

/** 每小时每号大约多少钱：改价的人真正在权衡的那个数。 */
const hourly = computed(() => Math.round((amount.value ?? 0) * POINTS_PER_HOUR));

function submit() {
    submitted.value = true;
    if (props.saving || (!props.retrying && (!canSave.value || props.locked))) return;
    emit('save', Math.round(amount.value ?? 0));
}
</script>

<template>
    <ModalShell title="点卡单价" :width="360" :scroll="false" @close="!saving && emit('close')">
        <form class="income-form modal-form" @submit.prevent="submit">
            <fieldset class="income-form" :disabled="locked">
                <PriceField
                    v-model="amount"
                    :precision="2"
                    label="每点多少钱"
                    stepper
                    :error="showError ? error : ''"
                    @update:model-value="typed = true"
                />
                <p v-if="hourly > 0" class="meta">
                    一个号每小时 {{ POINTS_PER_HOUR }} 点，约 {{ ledgerMoneyText(hourly) }}；{{
                        cardCost ? '之后上线计入账号收支' : '之后上线不计入账号收支'
                    }}。
                </p>
            </fieldset>
        </form>

        <template #footer>
            <PressButton
                data-modal-cancel
                :disabled="saving"
                text="取消"
                label="不改了"
                @click="!saving && emit('close')"
            />
            <PressButton
                icon="check"
                :text="retrying ? '重试保存' : '保存'"
                label="保存点卡单价"
                :disabled="saving || (!canSave && !retrying)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

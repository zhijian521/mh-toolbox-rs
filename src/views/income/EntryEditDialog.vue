<script setup lang="ts">
import { computed, inject, ref, useId } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassPriceField from '../../components/liquid-glass/GlassPriceField.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import { useDraftGuard } from '../../composables/use-draft-guard';
import ModalShell from '../../components/ModalShell.vue';
import FormActions from '../../components/FormActions.vue';
import PriceField from '../../components/PriceField.vue';
import SelectField from '../../components/SelectField.vue';
import { useRoster } from '../characters/roster';
import type { IncomeEntry } from './income';
import { characterOptions, UNASSIGNED_CHARACTER as NOTHING } from '../characters/character-options';

const props = defineProps<{
    entry: IncomeEntry;
    saving?: boolean;
    locked?: boolean;
    retrying?: boolean;
    saveError?: string;
}>();

const emit = defineEmits<{
    save: [patch: { amount: number; item: string; characterId: string }];
    close: [];
}>();

const { roster } = useRoster();
const glass = inject(glassLedger, null);

const itemId = useId();
const amount = ref<number | null>(props.entry.amount);
const item = ref(props.entry.item);
const who = ref(props.entry.characterId || NOTHING);

const whoOptions = computed(() =>
    characterOptions(roster.value, [props.entry.characterId], { unassigned: '不指定' }),
);

const canSave = computed(() => (amount.value ?? 0) > 0);

const { requestClose } = useDraftGuard(
    () =>
        !props.retrying &&
        (amount.value !== props.entry.amount ||
            item.value !== props.entry.item ||
            who.value !== (props.entry.characterId || NOTHING)),
    () => !!props.saving,
    () => emit('close'),
);

function submit() {
    if (props.saving || (!props.retrying && (!canSave.value || props.locked))) return;
    emit('save', {
        amount: Math.round(amount.value ?? 0),
        item: item.value,
        characterId: who.value === NOTHING ? '' : who.value,
    });
}
</script>

<template>
    <ModalShell
        title="修改记录"
        :width="380"
        :scroll="false"
        :no-dismiss="saving"
        @close="requestClose"
    >
        <form
            class="income-form modal-form"
            :class="{ 'lg-form-fields': glass }"
            @submit.prevent="submit"
        >
            <fieldset class="income-form" :disabled="locked" :inert="locked">
                <component
                    :is="glass ? GlassPriceField : PriceField"
                    v-model="amount"
                    :precision="2"
                    :disabled="locked"
                    label="金额"
                />
                <div class="form-field">
                    <label class="field-label" :for="itemId">物品</label>
                    <GlassInput
                        v-if="glass"
                        :id="itemId"
                        v-model="item"
                        :disabled="locked"
                        type="text"
                        placeholder="未记物品"
                        autocomplete="off"
                    />
                    <input
                        v-else
                        :id="itemId"
                        v-model="item"
                        class="field"
                        type="text"
                        placeholder="未记物品"
                        autocomplete="off"
                    />
                </div>
                <div class="form-field">
                    <span class="field-label">记给谁</span>
                    <component
                        :is="glass ? GlassSelect : SelectField"
                        v-model="who"
                        :options="whoOptions"
                        label="这笔账记给谁"
                        :hide-label="glass ? true : undefined"
                        :disabled="locked"
                    />
                </div>
            </fieldset>
        </form>

        <template #footer>
            <FormActions
                :error="saveError"
                :cancel-disabled="saving"
                cancel-label="不改了"
                :submit-text="retrying ? '重试保存' : '保存'"
                submit-label="保存这一条"
                :submit-disabled="saving || (!canSave && !retrying)"
                @cancel="requestClose"
                @submit="submit"
            />
        </template>
    </ModalShell>
</template>

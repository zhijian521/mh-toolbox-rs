<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
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

const itemId = useId();
const amount = ref<number | null>(props.entry.amount);
const item = ref(props.entry.item);
const who = ref(props.entry.characterId || NOTHING);

const whoOptions = computed(() =>
    characterOptions(roster.value, [props.entry.characterId], { unassigned: '不指定' }),
);

const canSave = computed(() => (amount.value ?? 0) > 0);

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
    <ModalShell title="改这一条" :width="380" :scroll="false" @close="!saving && emit('close')">
        <form class="income-form" @submit.prevent="submit">
            <fieldset class="income-form" :disabled="locked">
                <PriceField v-model="amount" :precision="2" label="金额" />
                <div class="form-row">
                    <label class="field-label" :for="itemId">物品</label>
                    <input
                        :id="itemId"
                        v-model="item"
                        class="field"
                        type="text"
                        placeholder="未记物品"
                        autocomplete="off"
                    />
                </div>
                <div class="form-row">
                    <span class="field-label">记给谁</span>
                    <SelectField v-model="who" :options="whoOptions" label="这笔账记给谁" />
                </div>
            </fieldset>
        </form>

        <template #footer>
            <p v-if="saveError" class="note error save-error" role="status">{{ saveError }}</p>
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
                label="保存这一条"
                :disabled="saving || (!canSave && !retrying)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 标签在上、控件在下：`.field` 是通栏宽度，标签放在左侧会把它挤窄，
 * 而金额那一格（`PriceField`）本来就是「标签在上」的排法，两者要同一个节奏。 */
.form-row {
    display: grid;
    gap: 6px;
}
</style>

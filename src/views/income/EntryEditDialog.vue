<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import PriceField from '../../components/PriceField.vue';
import SelectField from '../../components/SelectField.vue';
import { useRoster } from '../characters/roster';
import type { IncomeEntry } from './income';

/**
 * 改一条已经记下的账。
 *
 * 存在的理由只有一个：**速记是一下一下点出来的，点错是常态**。没有这一层，记错一笔
 * 只能删掉重记，而重记要先想起来当时是按什么价、记给谁——那是把纠错的成本推回给用户。
 *
 * ---- 只开放三样 ----
 *
 * 金额、物品名、记给谁。**日期与收/支方向不给改**：改日期等于「把这一笔搬到另一天」，
 * 那是删了重记；方向改错会把整页收支同时翻过来，而这个字段在界面上没有任何提示。
 * 这两样真要改，走「删掉重记」——用户会看见那两步，而不是在一次保存里悄悄发生。
 *
 * ---- 不直接写库 ----
 *
 * 与 `ItemPriceDialog` 同一条分工：这个组件只收字段、把结果 `emit` 出去，
 * 写库与「写不进去怎么提示」归页面（`IncomeHistoryDialog`）。这样同一个编辑窗将来
 * 也能给别的入口用，而不必把 store 再 import 一遍。
 */
const props = defineProps<{ entry: IncomeEntry }>();

const emit = defineEmits<{
    save: [patch: { amount: number; item: string; characterId: string }];
    close: [];
}>();

const { roster } = useRoster();

/**
 * 「不指定」在 `SelectField` 里不能是空串：那个组件把空串当「没有值」，
 * 选中它之后触发条会退回显示 placeholder「未选」，与事实不符。
 * 所以用一个只在这一层存在的哨兵值，提交时再换回空串。
 */
const NOTHING = '__none__';

const itemId = useId();
const amount = ref<number | null>(props.entry.amount);
const item = ref(props.entry.item);
const who = ref(props.entry.characterId || NOTHING);

const whoOptions = computed(() => [
    { value: NOTHING, label: '不指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

const canSave = computed(() => (amount.value ?? 0) > 0);

function submit() {
    if (!canSave.value) return;
    emit('save', {
        amount: Math.round(amount.value ?? 0),
        item: item.value,
        characterId: who.value === NOTHING ? '' : who.value,
    });
}
</script>

<template>
    <ModalShell title="改这一条" :width="380" :scroll="false" @close="emit('close')">
        <form class="form" @submit.prevent="submit">
            <PriceField v-model="amount" label="金额" />
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
        </form>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不改了" @click="emit('close')" />
            <PressButton
                icon="check"
                text="保存"
                label="保存这一条"
                :disabled="!canSave"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 三个字段竖排、间距 10：这一窗只有一件事，不必分行排版。 */
.form {
    display: grid;
    gap: 10px;
}
/* 标签在上、控件在下：`.field` 是通栏宽度，标签放在左侧会把它挤窄，
 * 而金额那一格（`PriceField`）本来就是「标签在上」的排法，两者要同一个节奏。 */
.form-row {
    display: grid;
    gap: 4px;
}
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import {
    pointDraftErrors,
    toPointDraft,
    todayText,
    type PricePoint,
    type PricePointDraft,
} from './prices';

/**
 * 记一笔价 / 改一条旧价。
 *
 * 三个格子：日期 / 价格 / 备注。日期是文本格 + 正则校验，不是 `<input type="date">`——
 * 原生日期控件在 WebView2 上是系统画的一套（月历弹层），与这里「纸与槽」的语言不兼容，
 * 和「不用原生 select」是同一条理由。
 *
 * 价格填游戏币**原值**（3200000），不是「320 万」：换算只在显示时做（`priceLabel`），
 * 存储与输入保持原值，否则四舍五入会一层层吃掉精度。
 */
const props = defineProps<{
    /** 物品名，只用于标题。 */
    itemName: string;
    /** 要改的那一条；`null` = 记新的一笔。 */
    point: PricePoint | null;
    /** 父级写盘失败时的原因（撞到 200 条上限等）。留在窗内显示，不关窗。 */
    error?: string;
}>();

const emit = defineEmits<{ save: [draft: PricePointDraft]; close: [] }>();

const draft = reactive<PricePointDraft>(
    props.point ? toPointDraft(props.point) : { date: todayText(), price: 0, note: '' },
);

const errors = computed(() => pointDraftErrors(draft));
const canSave = computed(() => !errors.value.date && !errors.value.price);

/* 「未填」不是「填错」：打开就挂「价格要大于 0」是在用户还没动手时先告状，
 * 而填完、失焦之前它又不消失（价格格的 `@change` 才写回）。 */
const submitted = ref(false);
const touched = reactive({ date: false, price: false });
const showDateError = computed(() => (submitted.value || touched.date) && !!errors.value.date);
const showPriceError = computed(() => (submitted.value || touched.price) && !!errors.value.price);

function submit() {
    submitted.value = true;
    if (!canSave.value) return;
    emit('save', { ...draft });
}

/* 三格文字输入、无 `type="submit"` 按钮 → 隐式提交什么都不做，回车要自己接。
 * 只认 `input` 上的回车，免得焦点在按钮上时重复提交一次。 */
function onEnter(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell
        :title="point ? `改「${itemName}」的一条价` : `给「${itemName}」记一笔价`"
        :width="380"
        :scroll="false"
        @close="emit('close')"
    >
        <form class="dialog-form" @submit.prevent="submit" @keydown.enter="onEnter">
            <label class="cell">
                <span class="field-label">日期</span>
                <input
                    v-model="draft.date"
                    class="field"
                    aria-label="记录日期，格式 2026-11-05"
                    placeholder="2026-11-05"
                    @blur="touched.date = true"
                />
                <span v-if="showDateError" class="note error">{{ errors.date }}</span>
            </label>

            <label class="cell">
                <span class="field-label">价格</span>
                <NumberField
                    :model-value="draft.price"
                    label="价格，游戏币原值"
                    placeholder="3200000"
                    zero-as-empty
                    @update:model-value="draft.price = $event"
                />
                <span v-if="showPriceError" class="note error">{{ errors.price }}</span>
            </label>

            <label class="cell">
                <span class="field-label">备注（可空）</span>
                <input
                    v-model="draft.note"
                    class="field"
                    aria-label="备注"
                    placeholder="摊上看到的价"
                />
            </label>

            <p class="meta price-hint">填游戏币原值，显示时会自动折算成万 / 亿。</p>
            <p v-if="error" class="note error dialog-error">{{ error }}</p>
        </form>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不改了" @click="emit('close')" />
            <PressButton
                icon="check"
                :text="point ? '保存' : '记下'"
                :label="point ? '保存这一条价格' : '记下这一笔价'"
                :disabled="!canSave"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.dialog-form {
    display: flex;
    flex-direction: column;
    gap: 11px;
}
.cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.cell input {
    width: 100%;
    min-width: 0;
}
/* `NumberField` 自带 72px 宽，这里要它跟着格子走（父级 scoped 能命中子组件根）。 */
.cell :deep(.number-field) {
    width: 100%;
}
/* 提示行只调位置，字档走 `.meta`。 */
/* 提示行只调位置，字档走 `.meta`。 */
.price-hint {
    margin: 0;
}
/* 写盘失败那一句。与提示行分两个类：同一行 `.price-hint` 一开两用，
 * 改颜色或改间距时谁也说不清影响的是哪一句。 */
.dialog-error {
    margin: 0;
}
</style>

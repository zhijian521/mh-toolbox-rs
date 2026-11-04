<script setup lang="ts">
import { computed, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PriceField from '../../components/PriceField.vue';
import PressButton from '../../components/PressButton.vue';
import type { QuickItemEntry } from '../../services/game-data';
import { amountText } from './income';

/**
 * 填一次单价。三种用法共用这一个窗：
 *
 * 1. **固定价但还没定过价** —— 定完直接记一条（`thenAdd`）；
 * 2. **右键改价** —— 只改单价表，不记账；
 * 3. **浮动价（或金币）** —— 每条现填一次，**不写回单价表**（兽决每天一个价，
 *    写回去等于让下一条默认用昨天的价，那比空着更容易记错）。
 *
 * 三者的区别只有文案与「保存后是否回写」，所以不拆三个组件——拆开之后三处各有
 * 一句自己的提示，改口径要改三遍。
 */
const props = defineProps<{
    item: QuickItemEntry;
    mode: 'fixed' | 'variable';
    /** 保存后是否接着记一条。`false` = 只改价（右键进来的）。 */
    thenAdd: boolean;
    /** 这件物品现在的单价（原值）。`0` = 还没设过价，此时没有「清除」可言。 */
    current?: number;
}>();

const emit = defineEmits<{ save: [amount: number]; clear: []; close: [] }>();

/**
 * `PriceField` 的 v-model 是**原值**（它内部 ×10000），与库里、与 `recordEntry` 同一个口径。
 *
 * **改价时预填现值**：右键进来是「改」不是「填」，让用户对着空白格重打一遍 1.2 万，
 * 既多一步、又容易打错（而错的是单价，之后每一条都跟着错）。预填之后「只改一位数字」
 * 才成立。浮动价与金币不预填——它们每条都是新的价，预填上一个价就是在诱导沿用。
 */
const amount = ref(
    props.mode === 'fixed' && !props.thenAdd && (props.current ?? 0) > 0 ? (props.current ?? 0) : 0,
);
const submitted = ref(false);
const touched = ref(false);

const isMoney = computed(() => props.item.name === '金币');
const title = computed(() => {
    if (props.mode === 'variable') return `记一条「${props.item.name}」`;
    return props.thenAdd ? `给「${props.item.name}」定价` : `改「${props.item.name}」的单价`;
});

const error = computed(() => {
    if (amount.value > 0) return '';
    return isMoney.value ? '金额要大于 0' : '单价要大于 0';
});
const canSave = computed(() => amount.value > 0);
const showError = computed(() => (submitted.value || touched.value) && !!error.value);

/**
 * 「清除」只在**单纯改价**时有意义：
 *
 * - 浮动价与金币本来就不写单价表，没有可清的东西；
 * - 「第一次定价」进来时表里本来就没有；
 * - 只有右键改价、且这件物品现在确实有价，才谈得上清掉。
 */
const canClear = computed(
    () => props.mode === 'fixed' && !props.thenAdd && (props.current ?? 0) > 0,
);

/** 「将记为」只在这一窗**真的会记一条**时才有意义（浮动价、第一次定价）。
 *  单纯改价时它是句废话：改完只写单价表，账面上不会多出任何一条。 */
const willAdd = computed(() => props.thenAdd || props.mode === 'variable');

function submit() {
    submitted.value = true;
    if (!canSave.value) return;
    emit('save', Math.round(amount.value));
}

function onEnter(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell :title="title" :width="360" :scroll="false" @close="emit('close')">
        <form class="dialog-form" @submit.prevent="submit" @keydown.enter="onEnter">
            <PriceField
                v-model="amount"
                :label="isMoney ? '这笔多少钱' : '单价'"
                stepper
                :error="showError ? error : ''"
                @blur="touched = true"
            />
            <p class="note">
                {{ isMoney ? '填「万」：320 就是 320 万。' : '填「万」：4.6 就是 4.6 万。' }}
            </p>
            <p class="note">
                <template v-if="mode === 'variable'">
                    只用于这一条，<b>不写回单价表</b>——这类物品每天一个价。
                </template>
                <template v-else-if="thenAdd">
                    这个价会存进单价表，下次点「{{ item.name }}」直接按它记账。
                </template>
                <template v-else> 只改单价表，不会记一条账。 </template>
            </p>
            <p v-if="willAdd && amount > 0" class="meta">将记为 {{ amountText(amount) }}</p>
        </form>

        <template #footer>
            <!-- 清除放最左、与两个动作隔开：它既不是「取消」也不是「保存」，
                 把三枚并成一排会让人以为「清除」是另一种确定。 -->
            <PressButton
                v-if="canClear"
                class="foot-left"
                icon="trash"
                text="清除"
                label="清除这件物品的单价"
                @click="emit('clear')"
            />
            <PressButton data-modal-cancel text="取消" label="不改了" @click="emit('close')" />
            <PressButton
                icon="check"
                :text="thenAdd ? '记下' : '保存'"
                :label="thenAdd ? '记下这一条' : '保存单价'"
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
    gap: 9px;
}
.dialog-form .note {
    margin: 0;
}
.dialog-form b {
    font-weight: 400;
    color: var(--ink-2);
}
/* 弹窗底栏是 `justify-content: flex-end`（两个动作贴右），所以「清除」靠
 * `margin-right: auto` 自己站到左端，不用再塞一个占位元素。 */
.foot-left {
    margin-right: auto;
}
</style>

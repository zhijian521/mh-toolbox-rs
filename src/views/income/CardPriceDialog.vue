<script setup lang="ts">
import { computed, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PriceField from '../../components/PriceField.vue';
import PressButton from '../../components/PressButton.vue';
import { moneyText } from '../../services/format';
import { POINTS_PER_HOUR } from './online';

/**
 * 改点卡单价。
 *
 * ---- 为什么是一个窗，而不是状态条上那一格输入槽 ----
 * 2026-11-11 用户：「点卡价格也使用类似于 tag 的样式放到计入不计入的前面，然后点击价格
 * 弹出小窗修改价格，类似于我们的物品快速记录的」。
 *
 * 状态条是**读**的地方：扫一眼今天挂了多少、烧了多少、谁还挂着。单价是一设定就几天不动的东西，
 * 却占着那一行里最长的一格（一个带「万」后缀的输入框 + 两侧留白），把三个读数挤到左边。
 * 收成一枚签之后，这行只剩「三个数 + 一个开关」，单价点开再改——与物品速记里的
 * 「右键改价」是同一个做法（`ItemPriceDialog`）。
 *
 * ---- 口径写在这一窗里 ----
 * 「每小时每号 6 点、折多少币、算不算进账号收支」这三句原来挤在状态条尾注上，独占一行只为
 * 说口径。它们其实是这一窗的**上下文**：改价的人正在决定「按多少算」，把「按多少算 × 每小时
 * 烧多少 = 每小时多少钱」摆在他眼前才有用；平时不看不占地方。
 */
const props = defineProps<{
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
const typed = ref(false);

const submitted = ref(false);
const canSave = computed(() => (amount.value ?? 0) > 0);
const error = computed(() => ((amount.value ?? 0) > 0 ? '' : '单价要大于 0'));

/*
 * 「动过没有」由 `update:modelValue` 点亮，而不是 `@blur`：鼠标按下「取消」的那一刻
 * 输入格正好失焦，提示行插进来会把页脚顶下去，抬起时指针已经不在按钮上——点一下关不掉。
 * 这条坑在 `ItemPriceDialog` 里记过（用户 2026-11-11 实报），这里照抄。
 */
const showError = computed(() => (typed.value || submitted.value) && !!error.value);

/** 每小时每号大约多少钱：改价的人真正在权衡的那个数。 */
const hourly = computed(() => Math.round((amount.value ?? 0) * POINTS_PER_HOUR));

function submit() {
    submitted.value = true;
    if (!canSave.value) return;
    emit('save', Math.round(amount.value ?? 0));
}
</script>

<template>
    <ModalShell title="点卡单价" :width="360" :scroll="false" @close="emit('close')">
        <form class="dialog-form" @submit.prevent="submit">
            <PriceField
                v-model="amount"
                label="每点多少钱"
                stepper
                :error="showError ? error : ''"
                @update:model-value="typed = true"
            />
            <p v-if="hourly > 0" class="meta">
                一个号每小时 {{ POINTS_PER_HOUR }} 点，约 {{ moneyText(hourly) }}；{{
                    cardCost ? '计入账号收支' : '不计入账号收支'
                }}。
            </p>
        </form>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不改了" @click="emit('close')" />
            <PressButton
                icon="check"
                text="保存"
                label="保存点卡单价"
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
</style>

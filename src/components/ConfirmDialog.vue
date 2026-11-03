<script setup lang="ts">
import ModalShell from './ModalShell.vue';
import PressButton from './PressButton.vue';

/**
 * 删除确认：一句问句 + 一句后果 + 两枚按钮。
 *
 * 不渲染标题栏（`ModalShell` 的 `title` 留空）：确认窗只有一件事要说，
 * 再顶一行「删除确认」等于把同一句话说两遍，还白占 40px。
 *
 * ---- 为什么初始焦点落在「取消」 ----
 * 「确认」紧挨着「取消」，而两枚都是按钮。焦点默认落在第一个可聚焦元素上时，
 * 一次误触回车就等于执行删除。所以这里固定 `initialFocus="cancel"`，
 * 并给取消按钮挂 `data-modal-cancel`——`ModalShell` 靠这个标记找它。
 *
 * ---- 为什么文案要从 props 来而不是自己在里面拼 ----
 * 「删掉「高级魔兽要诀」这张卡？」与「删掉 11-03 这条价格记录？」是同一个动作，
 * 但宾语不同。让调用方把整句交进来，比在这里判断「删的是物品还是记录」再拼字符串更稳——
 * 而且后果那一句往往带数字（「下面的 8 条记录会一并删掉」），只有调用方算得出来。
 */
withDefaults(
    defineProps<{
        /** 问句本身，带书名号或引号。例：「删掉「高级魔兽要诀」这张卡？」 */
        title: string;
        /** 后果。写清会连带删掉什么、能不能撤回。可以没有。 */
        note?: string;
        /** 确认按钮上的字。删除物品与删除单条记录都可以叫「删除」。 */
        confirmText?: string;
        width?: number;
    }>(),
    { note: '', confirmText: '删除', width: 420 },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

/**
 * 问句的 id，交给 `ModalShell` 的 `labelledby`。
 *
 * 这个窗不画标题栏（一句话的确认顶一行「删除确认」是把同句话说两遍），
 * 于是 `ModalShell` 没有可引用的标题。但读屏必须听到「删掉「高级内丹」这张卡？」
 * 而不是一个叫「确认」的空对话框——名字与标题栏是两件事，分开给。
 */
const titleId = `confirm-title-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
    <ModalShell :width="width" :labelledby="titleId" initial-focus="cancel" @close="emit('cancel')">
        <p :id="titleId" class="confirm-title">{{ title }}</p>
        <p v-if="note" class="confirm-note meta">{{ note }}</p>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="取消这次删除"
                @click="emit('cancel')"
            />
            <PressButton text="删除" label="确认删除" seal @click="emit('confirm')" />
        </template>
    </ModalShell>
</template>

<style scoped>
.confirm-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-base);
    line-height: 1.6;
}
/* 后果那一句用 `.meta` 的字档（字号 / 次级墨 / 行高都来自基座），
 * 这里只管它与问句之间的那 5px。
 * 早先这里还写了一遍 `line-height: 1.6`——那正是 `.meta` 的值，两处各写一份，
 * 改基座时这里不会跟着动。 */
.confirm-note {
    margin: 5px 0 0;
}
</style>

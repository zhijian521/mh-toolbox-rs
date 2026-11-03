<script setup lang="ts">
import ModalShell from './ModalShell.vue';
import PressButton from './PressButton.vue';

/**
 * 确认窗的形态：一句问句 + 一句后果 + 两枚按钮。
 *
 * **不直接被页面用**——页面只说 `await askConfirm({...})`（`composables/use-confirm.ts`），
 * 这个组件由 `ConfirmHost` 渲染，全站只有一个。留在这里的只有「长什么样」，
 * 「什么时候开、开哪一句、答完往哪走」都在那个函数背后。
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
        /** 确认按钮上的字。删除物品与删除单条记录都可以叫「删除」；
         *  设置页那两个动作用「替换」与「清除」——同一个窗，动词不同。 */
        confirmText?: string;
    }>(),
    { note: '', confirmText: '删除' },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

/**
 * 窗宽，唯一一处。
 *
 * 原先 420，用户看图后说「宽度有点大了，缩小五分之二」，于是 420 × 3/5 = 252。
 * 不再做成 prop：全站确认窗共用一个宽度是这次收拢的目的之一，
 * 留一个旋钮就等于留一个「这处窄一点」的入口。
 *
 * 252 减去左右各 16 的内边距，正文可用 220px，13px 正文一行约 16 个字——
 * 「清空所有角色与物价？」这类问句刚好一行，长一点的后果句折两到三行。
 */
const WIDTH = 252;

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
    <ModalShell :width="WIDTH" :labelledby="titleId" initial-focus="cancel" @close="emit('cancel')">
        <p :id="titleId" class="confirm-title">{{ title }}</p>
        <p v-if="note" class="confirm-note meta">{{ note }}</p>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="取消这次删除"
                @click="emit('cancel')"
            />
            <!-- 按钮上的字跟着 `confirmText` 走。这里曾写死「删除」二字，于是
                 `confirmText` 是个谁也没读的 prop——物价页刚好三个动作都叫删除，
                 这个洞一直没露出来；设置页的「替换 / 清除」一加就露了。 -->
            <PressButton
                :text="confirmText"
                :label="`确认${confirmText}`"
                seal
                @click="emit('confirm')"
            />
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

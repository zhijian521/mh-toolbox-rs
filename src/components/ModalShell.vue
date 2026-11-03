<script setup lang="ts">
import { ref } from 'vue';
import { useModal } from '../composables/use-modal';

/**
 * 弹窗外壳：遮罩 + 纸面浮层 + 标题栏 + 页脚插槽。
 *
 * 仓库里原先没有通用弹窗——角色编辑器的 `.editor-mask` 是页内私有的，只为那一个表单存在。
 * 物价页要开四个窗（物品、记价、历史、删除确认），再照抄四份遮罩就等于把「Esc 怎么关、
 * 焦点落在哪、关掉还给谁」抄四遍，而这三件事恰恰是最容易抄错的部分。收益 / 账号 / 目标
 * 三页迟早也要弹窗，所以这里立一份。
 *
 * ---- 三条行为是实测出来的，不是设计偏好 ----
 *
 * ① **Esc 必须用捕获阶段拦，并 `stopPropagation`。**
 *    `SelectField` 关自己的列表时也听 Esc；角色编辑器整层也听。事件在 document 上的
 *    冒泡阶段被谁先接住取决于注册顺序，那一层顺序由页面挂载次序决定——不可控。
 *    在捕获阶段先接（`addEventListener(..., true)`）再中止传播，才是「这个窗最先知道」。
 *
 * ② **焦点必须锁在窗内，且关闭后还给触发它的那个元素。**
 *    遮罩下面的页面仍然可聚焦，不锁的话 Tab 会把焦点送到看不见的按钮上。而关闭后不还，
 *    焦点会掉回 `body`——键盘用户得从文档开头重新 Tab 一遍才能回到原来的位置。
 *
 * ③ **初始焦点默认给第一个可聚焦元素，删除确认必须给「取消」。**
 *    `initialFocus: 'cancel'` 找的是带 `data-modal-cancel` 的那个按钮。删除类确认里
 *    「确认」紧挨着「取消」，焦点默认落在第一个就等于让一次回车完成删除。
 *
 * ---- 为什么锁的是 `.page-content` 而不是 body ----
 * 这个应用里滚动的不是 body，是 `.page-content`（`.app` 是固定高度的一屏）。锁 body 不会
 * 让背景停下，滚轮照样把下面的卡片推走。找不到 `.page-content` 时（比如将来的浮层页面）
 * 才退回 body。
 */
const props = withDefaults(
    defineProps<{
        /** 标题栏文字。留空则不渲染标题栏——删除确认那种一句话弹窗不需要标题栏。 */
        title?: string;
        /** 面板宽度。按内容给：物品表单 520、记价 380、删除确认 420、历史 620。 */
        width?: number;
        /** 初始焦点：`first` 第一个可聚焦元素，`cancel` 带 `data-modal-cancel` 的那个。 */
        initialFocus?: 'first' | 'cancel';
        /**
         * 正文是否自己滚动。**内容矮的窗必须传 `false`**。
         *
         * `overflow-y: auto` 会让这一层成为下拉纸片的裁剪边界——`SelectField` 的
         * `clipBox()` 找的正是「最近的裁剪祖先」，它会把列表限制在这块框里。物品弹窗的
         * 正文只有一百多像素，八行半的纸片塞不进去，只能向上翻，翻上去就被上边界切掉一半
         * （用户实报「分类下拉框会被弹出顶部遮挡一部分」）。
         *
         * 传 `false` 后这层不再裁剪，`clipBox` 继续往上找到视口，纸片就能正常往下展开。
         * 代价是内容超过 `max-height` 时没法滚——所以只给「字段固定、撑不满」的窗用。
         */
        scroll?: boolean;
        /**
         * 外部给的「这个名字念什么」（元素 id）。
         *
         * `title` 同时管两件事：**画不画标题栏**、**读屏念什么**。删除确认两件都不想要标题栏
         * （一句话的窗顶一行「删除确认」是把同句话说两遍），但它必须能被念出来——
         * 否则读屏只听到一个叫「确认」的对话框，听不到要删的是哪一件、会连带几条记录。
         * 所以拆开：`title` 管画不画，这个 prop 管念什么。
         */
        labelledby?: string;
    }>(),
    { title: '', width: 460, initialFocus: 'first', scroll: true, labelledby: '' },
);

const emit = defineEmits<{ close: [] }>();

/**
 * 打开的弹窗栈（模块级，所有实例共用）。
 *
 * 弹窗会叠：历史窗里点「删除」会再开一层确认窗。两层都挂在 document 上听 Esc 的话，
 * 一次按键会把两层一起关掉——因为它们注册在同一个阶段，谁先注册谁先执行。
 * 只有栈顶那一个该响应，所以每个实例登记一个 token，`onKeydown` 里先问「我是不是栈顶」。
 *
 * z-index 不用跟着算：`Teleport` 到 body 是追加挂载，后开的自然在后面、压在上面。
 * ---- 待拆：行为与样子在一个文件里 ----
 * 它同时管「状态」（Esc、焦点陷阱、锁滚动、还焦点）与「样子」（遮罩、纸面、页眉头脚），
 * 正撞 `CONVENTIONS.md` §2.3-3「一个组件要么管状态，要么管样子」。2026-11 的 Review
 * 记了这一笔：该抽 `composables/use-modal.ts`，组件只留模板与样式。
 * 本轮没做——它刚稳定，而它和 `SelectField` 的 Esc 关系刚在这上面调过；
 * 等再有第二个页面复用它时一起拆，那时才知道该抽哪几个参数。
 */

/** 每个实例一个 id：同一页可能同时存在两个窗（历史里再开删除确认）。 */
const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

const panel = ref<HTMLElement | null>(null);

/* 行为全部交给 `use-modal`：Esc、焦点陷阱、锁滚动、关闭还焦点、叠层栈。
 * 这个组件从此只管「它长什么样」——`CONVENTIONS.md` §2.3-3。 */
const { isTop } = useModal({
    panel,
    initialFocus: props.initialFocus,
    onClose: () => emit('close'),
});

/** 点遮罩关闭 = 取消。点面板内部不关（面板是遮罩的子元素，靠 `currentTarget` 区分）。 */
function onMaskClick(event: MouseEvent) {
    if (event.target === event.currentTarget) emit('close');
}
</script>

<template>
    <Teleport to="body">
        <!-- 点遮罩关闭。只听 `click` 一处：`mousedown` 与 `click` 同时挂，
             一次点击会 `emit('close')` 两次——虽然父级的 close 都幂等，
             但读代码的人会以为有两条关闭路径。 -->
        <div class="modal-mask" @click.self="onMaskClick">
            <!-- 只有栈顶那层是 `aria-modal` 且可聚焦。被盖住的那层还留在 DOM 里
                 （历史窗 + 删除确认就是这个状态）：不给它 `inert`，Tab 能走到遮罩下面
                 那张窗的按钮上，而它在视觉上已经被盖住了。`undefined` 会移除属性。 -->
            <div
                ref="panel"
                class="modal-panel"
                role="dialog"
                :aria-modal="isTop ? 'true' : undefined"
                :aria-hidden="isTop ? undefined : 'true'"
                :inert="isTop ? undefined : true"
                :aria-labelledby="labelledby || (title ? titleId : undefined)"
                :aria-label="title || labelledby ? undefined : '确认'"
                tabindex="-1"
                :style="{ '--modal-w': `${width}px` }"
            >
                <header v-if="title" class="modal-head">
                    <h2 :id="titleId">{{ title }}</h2>
                </header>

                <div class="modal-body" :class="{ 'modal-body-static': !scroll }">
                    <slot />
                </div>

                <footer v-if="$slots.footer" class="modal-foot">
                    <slot name="footer" />
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* 遮罩压暗：只压墨色、不加 blur。整站没有一处模糊，模糊会让纸面读成「玻璃」。
 * `place-items: center` 而不是 flex + margin auto：面板高度可变（历史窗会撑高），
 * 居中由网格负责，窗太高时靠 `max-height` 自己滚。 */
.modal-mask {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--ink) 42%, transparent);
    animation: mask-in var(--t-mid) var(--ease-soft);
}

.modal-panel {
    display: flex;
    flex-direction: column;
    width: var(--modal-w);
    max-width: 100%;
    max-height: calc(100vh - 48px);
    background: var(--paper);
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-3);
    /* 浮层的影子用 `--shadow-lift`，与悬停浮片同一条：弹窗是「临时抬起来的一张纸」，
     * 不是嵌在页面里的卡，所以比卡片的影子深一档。 */
    box-shadow: var(--shadow-lift);
    outline: none;
    animation: panel-in var(--t-mid) var(--ease-soft);
}

.modal-head {
    flex: none;
    padding: 11px 16px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
/* 标题与全站同级标题同一个字重与色：`base.css` 的 `h2` 是 400，
 * 这里不覆写——弹窗靠浮层与阴影表态，不靠把标题加粗。 */
.modal-head h2 {
    margin: 0;
    color: var(--ink);
}

/* 正文可滚、页眉页脚固定：历史窗里流水很长，滚的只能是中间那一段，
 * 否则「取消 / 保存」会跟着滚出视野。
 * 右内边距扣掉一条滚动条轨道（CONVENTIONS §2.4-35）：不扣的话，窗内滚起来的一瞬间
 * 正文右缘会比页脚短一截，滚动条消失时又对齐——正文看起来在左右跳。 */
.modal-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 14px max(0px, calc(16px - var(--scrollbar-w))) 14px 16px;
    overflow-y: auto;
}

/* 不滚的正文（物品、记价这类字段固定的窗）。
 *
 * 关键是 `overflow-y: visible`：一旦这里是 `auto`，它就成了 `SelectField` 的
 * `clipBox()` 能找到的最近裁剪祖先，下拉纸片被死死限制在这一百多像素里——
 * 向下放不下，向上翻又被上边界切掉，于是「下拉被弹窗顶部遮住一半」。
 *
 * 右内边距也随之回到 16：不滚就没有滚动条，不必再让出那一条轨道。 */
.modal-body-static {
    padding-right: 16px;
    overflow-y: visible;
}

.modal-foot {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: var(--w-hair) solid var(--rule-2);
}

/* 两个关键帧：遮罩淡入、面板从「略低略小」落到位。
 * 只动 `opacity` 与 `transform`，不动 `height`——后者会让内容在动画中重排一次。
 * `prefers-reduced-motion` 由 `base.css` 的全局通配降级兜住，这里不重复写媒体查询。 */
@keyframes mask-in {
    from {
        opacity: 0;
    }
}
@keyframes panel-in {
    from {
        opacity: 0;
        transform: translateY(6px) scale(0.99);
    }
}
</style>

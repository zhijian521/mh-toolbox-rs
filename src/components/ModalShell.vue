<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModal } from '../composables/use-modal';

defineOptions({ inheritAttrs: false });

/**
 * 弹窗外壳：遮罩 + 纸面浮层 + 标题栏 + 页脚插槽。
 *
 * 仓库里原先没有通用弹窗——角色编辑器的 `.editor-mask` 是页内私有的，只为那一个表单存在。
 * 物价页要开四个窗（物品、记价、历史、删除确认），再照抄四份遮罩就等于把「Esc 怎么关、
 * 焦点落在哪、关掉还给谁」抄四遍，而这三件事恰恰是最容易抄错的部分。收益 / 账号 / 目标
 * 三页迟早也要弹窗，所以这里立一份。
 *
 * ---- 行为不在这里 ----
 * Esc、焦点陷阱、锁滚动、关闭还焦点、叠层栈全在 `composables/use-modal.ts`，
 * 那个文件里写着四条实测出来的理由——**尤其「Esc 必须走冒泡、不能走捕获」那一条**：
 * 捕获会抢在目标元素之前，`SelectField` 就再也收不到 Esc，展开下拉按 Esc 会关掉整窗。
 * 这段注释曾经写的是相反的做法，照它改回去就会把那处坑恢复。
 *
 * 这里只回答「它长什么样」——`CONVENTIONS.md` §2.3-3。
 *
 * ---- 为什么锁的是 `.page-content`，兜底才是 `.app`，而不是 body ----
 * 这个应用里滚动的不是 body，是 `.page-content`（`.app` 是固定高度的一屏，`body` 不滚）。
 * 锁 body 不会让背景停下，滚轮照样把下面的卡片推走。
 * 找不到 `.page-content` 时（比如将来的浮层页面，或者弹窗开在页面内容之外）退回它的
 * 祖先 `.app`：那是**这一屏**的容器，也是这套布局里唯一保证存在、且高度锁死的那一块；
 * 退到 body 没有意义——body 本来就不滚，锁它等于什么都没做，而 `.app` 至少把
 * `overflow` 也关住，滚轮不会从它内部再传出去。
 */
const props = withDefaults(
    defineProps<{
        /** 标题栏文字。留空则不渲染标题栏——删除确认那种一句话弹窗不需要标题栏。 */
        title?: string;
        /**
         * 面板宽度。按内容给：物品表单 520、记价 380、确认窗 252、历史 620。
         *
         * 数字按 px 处理；要跟着字号缩放就传整段 CSS 值（确认窗传的是
         * `calc(252px * var(--fs-scale))`），不要在这里乘一次——这里不知道
         * 调用方那个数是不是本来就该跟着字走。
         */
        width?: number | string;
        /** 固定高度，用于切换内容时保持尺寸的窗；数字按 px，字符串按 CSS 值处理。 */
        height?: number | string;
        /**
         * 初始焦点：`first` 第一个可聚焦元素，`cancel` 带 `data-modal-cancel` 的那个，
         * `none` 由调用方自己定位。
         *
         * `none` 是给「第一个可聚焦元素不是该动手的地方」的窗：记价、快速修改这类
         * 窗里，第一个 Tab 位置往往是输入框两侧那枚减号——默认落在它上面，屏幕上
         * 会先亮起一圈焦点环，读起来像「减号被选中了」。那种窗自己聚焦输入框。
         */
        initialFocus?: 'first' | 'cancel' | 'none';
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
         * 面板**最小**高度。不传则「跟着内容长」（上限仍是 `100vh − 48px`）。
         *
         * 给表格类窗用：**记录只有两条时它不该缩成一小块**——一张 400 高的窗摆在屏幕
         * 中间，读起来像「这里只有这么多东西」，而实际是「今天只有两笔」。
         *
         * 是下限而不是定高：记录多的时候它跟着长，到 `max-height` 之后正文内部再滚。
         * 定高会反着来——两条记录也留出半屏空白，那比原来的「矮」更难看。
         *
         * 数字按 px 处理；要跟着视口走就传整段 CSS 值（历史窗传的是
         * `min(520px, calc(100vh - 48px))`）。
         */
        minHeight?: number | string;
        /**
         * 正文**自己填满、自己滚**，而不是整块一起滚。
         *
         * 表格类窗要这个：筛选条和汇总行固定在顶上，只有表格滚——一天三十笔时，翻到
         * 底想换个日期，不必先滚回顶部。传 `true` 时正文变成纵向 flex 容器
         * （`overflow: hidden`），调用方用 `flex: 1` + `min-height: 0` 给滚动区。
         */
        fill?: boolean;
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
    { title: '', width: 460, initialFocus: 'first', scroll: true, labelledby: '', fill: false },
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

/**
 * 宽高落到对应 CSS 变量。数字补 `px`，字符串原样交出去——
 * 确认窗给的是 `calc(252px * var(--fs-scale))`、历史窗给的是
 * `min(520px, calc(100vh - 48px))`，所以不能在这里无条件加 `px`。
 */
const panelStyle = computed(() => {
    const style: Record<string, string> = {
        '--modal-w': typeof props.width === 'number' ? `${props.width}px` : props.width,
    };
    if (props.height !== undefined) {
        style['--modal-h'] = typeof props.height === 'number' ? `${props.height}px` : props.height;
    }
    if (props.minHeight !== undefined) {
        style['--modal-min-h'] =
            typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight;
    }
    return style;
});
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
                v-bind="$attrs"
                class="modal-panel"
                role="dialog"
                :aria-modal="isTop ? 'true' : undefined"
                :aria-hidden="isTop ? undefined : 'true'"
                :inert="isTop ? undefined : true"
                :aria-labelledby="labelledby || (title ? titleId : undefined)"
                :aria-label="title || labelledby ? undefined : '确认'"
                tabindex="-1"
                :style="panelStyle"
            >
                <header v-if="title" class="modal-head">
                    <h2 :id="titleId">{{ title }}</h2>
                </header>

                <div
                    class="modal-body"
                    :class="{ 'modal-body-static': !scroll, 'modal-body-fill': fill }"
                >
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
/* 遮罩只负责压暗；水晶的面板模糊由 tokens.css 按风格提供。
 * `place-items: center` 而不是 flex + margin auto：面板高度可变（历史窗会撑高），
 * 居中由网格负责，窗太高时靠 `max-height` 自己滚。 */
.modal-mask {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--modal-mask);
    animation: mask-in var(--t-mid) var(--ease-soft);
}

.modal-panel {
    display: flex;
    flex-direction: column;
    width: var(--modal-w);
    max-width: 100%;
    height: var(--modal-h, auto);
    /* 传了 `minHeight` 就有个下限（表格类窗），没传就纯跟着内容长。 */
    min-height: var(--modal-min-h, auto);
    max-height: calc(100vh - 48px);
    background: var(--modal-bg);
    border: var(--w-hair) solid var(--modal-edge);
    border-radius: var(--r-3);
    /* 浮层的影子用 `--shadow-lift`，与悬停浮片同一条：弹窗是「临时抬起来的一张纸」，
     * 不是嵌在页面里的卡，所以比卡片的影子深一档。 */
    box-shadow: var(--modal-shadow);
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
 * 正文右缘会比页脚短一截。可滚正文固定预留轨道，避免显隐时内容宽度变化。 */
.modal-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 14px max(0px, calc(16px - var(--scrollbar-w))) 14px 16px;
    overflow-y: auto;
}
.modal-body:not(.modal-body-static):not(.modal-body-fill) {
    scrollbar-gutter: stable;
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

/* 正文自己填满、自己滚（表格类窗）。
 *
 * `overflow: hidden` 把滚动的责任交给调用方内部那个容器：筛选条与汇总行要钉在顶上，
 * 一天三十笔时翻到底想换个日期，不必先滚回顶部。
 *
 * 右内边距仍扣掉一条轨道：滚动条此刻长在内部容器上，但那条轨道占了什么位置，读者
 * 看到的是「这张表比页脚短一截」。调用方那边配 `scrollbar-gutter: stable` 让轨道常驻，
 * 于是这里让出的 10px 正好被它吃掉，表格右缘与页脚对齐。 */
.modal-body-fill {
    display: flex;
    flex-direction: column;
    padding-right: max(0px, calc(16px - var(--scrollbar-w)));
    overflow: hidden;
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

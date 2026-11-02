<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import SlotButton from '../../components/SlotButton.vue';
import { GHOST_TEST_SAMPLES, type GhostTestSample } from './ghost-samples';

/**
 * 测试文字面板：不开游戏也能把整条解析链跑起来。
 *
 * 它不是这一页的功能，是「临时替身」——真机能测的时候整块删掉，捉鬼页一行不用改。
 * 所以它是**独立组件**而不是页面里的一段模板：页面答「把状态画出来并接上按钮」，
 * 它答「没有游戏时怎么喂一段文字」。两者的寿命本来就不一样长。
 *
 * 三个状态全部自己持有：
 *   - `draft`   正在编辑的文本。草稿每次按键都变，判定只在点「套用」时变——
 *               放进 composable 会让「什么时候算生效」变含糊。
 *   - `open`    折叠与否。默认展开：没有游戏的这段时间，它是这一页唯一能让图动起来的入口。
 *   - 样例的点击 = 填进去**并立刻套用**。要两下才看到结果的话，人会以为样例坏了。
 *
 * 面板只发两个事件（`apply` / `exit`），不碰 composable：它不知道轮询间隔、
 * 不知道解析规则，只负责把一段文字交出去。
 */
const props = defineProps<{
    /** 是否处于测试模式（决定标签与「退出」可用性）。 */
    testing: boolean;
    /** 当前画出了几条任务（测试态下用它报「已套用 N 条」）。 */
    count: number;
}>();

const emit = defineEmits<{ apply: [text: string]; exit: [] }>();

const draft = ref('');
const open = ref(true);

function useSample(sample: GhostTestSample) {
    draft.value = sample.text;
    emit('apply', sample.text);
}

function run() {
    emit('apply', draft.value);
}
</script>

<template>
    <section class="test-panel frame" aria-label="测试文字">
        <header class="test-head">
            <AppIcon name="flask" class="test-icon" />
            <span class="test-title">测试文字</span>
            <span class="test-tag" :class="{ on: props.testing }">
                {{ props.testing ? `已套用 ${props.count} 条` : '未使用' }}
            </span>
            <SlotButton
                :icon="open ? 'chevron-down' : 'chevron-right'"
                :label="open ? '收起测试输入' : '展开测试输入'"
                @click="open = !open"
            />
        </header>

        <template v-if="open">
            <!-- 保留折行：真机的「括号被切开」「地名被截断」正是靠折行复现的。
                 4 行而不是 3 行：一条大鬼句在 288px 里正好折成两行，两条任务
                 就是四行——3 行会把第二句拦腰切掉，粘完看不见自己粘了什么。 -->
            <textarea
                v-model="draft"
                class="test-input well"
                rows="4"
                spellcheck="false"
                aria-label="任务栏原文"
                placeholder="把任务栏原文粘进来，一行一句；折行照原样保留。"
            />
            <div class="test-actions">
                <SlotButton
                    icon="check"
                    text="套用"
                    label="套用这段文字"
                    seal
                    :disabled="!draft.trim()"
                    @click="run"
                />
                <SlotButton
                    icon="close"
                    text="退出"
                    label="退出测试模式"
                    :disabled="!props.testing"
                    @click="emit('exit')"
                />
            </div>
            <div class="test-samples">
                <button
                    v-for="sample in GHOST_TEST_SAMPLES"
                    :key="sample.label"
                    type="button"
                    class="test-sample"
                    :title="sample.note"
                    @click="useSample(sample)"
                >
                    {{ sample.label }}
                </button>
            </div>
        </template>
    </section>
</template>

<style scoped>
/* ---------- 面板 ----------
 * 浮在右下角：`position: fixed` 相对视口，内容区滚到哪它都在同一处。
 * 宽度跟着字号缩放（与左栏同一条规矩）：字大一档而盒子不变，chip 会多折一行、
 * 文本域每行少几个字，看起来像「这个面板没跟上设置」。
 */
.test-panel {
    position: fixed;
    /* 与页面留白同一枚：它浮在内容之上，但落位要跟纸张边框一致，
     * 否则右下角那块比卡片更贴边，读起来是「掉在纸外面」。 */
    right: var(--page-pad);
    bottom: var(--page-pad);
    z-index: 4;
    width: calc(288px * var(--fs-scale));
    /* 视口再矮也不许长出去：它是浮层，顶到窗口外就等于把「套用」按钮藏了。
     * 内部自己滚，面板位置不动。 */
    max-height: calc(100vh - 2 * var(--page-pad));
    overflow: auto;
    padding: 9px 11px 11px;
    /* 它是盖在内容上的一层：没有投影会读成「右下角又多了一个区块」，而不是浮着的一块。 */
    box-shadow: 0 8px 22px color-mix(in srgb, var(--ink) 14%, transparent);
}
.test-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
}
.test-icon {
    color: var(--muted);
}
.test-title {
    font-size: var(--fs-xs);
    letter-spacing: 0.1em;
}
/* 状态标签吃掉中间的弹性空间：标题在左、开关在右，中间那段留白归它。 */
.test-tag {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
}
/* 已套用才染赭色：它提醒「现在看的是假数据」，未使用时不该也亮着。 */
.test-tag.on {
    color: var(--ochre);
}
.test-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin-top: 8px;
    padding: 6px 7px;
    border-radius: var(--r-2);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    line-height: 1.7;
    /* 只允许竖着拉：横向拉会把面板撑出屏幕，而长行本来就该自己折。 */
    resize: vertical;
}
.test-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}
.test-samples {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 9px;
    padding-top: 8px;
    border-top: var(--w-hair) solid var(--rule);
}
/* 样例是一枚「小签」，不是按钮：有边框、无底色、无内影。
 * 点它只是换一份输入，不执行动作——做成按钮会与上面两枚槽按钮抢层级。 */
.test-sample {
    padding: 2px 6px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    background: none;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    line-height: 1.6;
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}
.test-sample:hover {
    border-color: color-mix(in srgb, var(--seal-edge) 55%, var(--rule-2));
    background-color: color-mix(in srgb, var(--seal) 8%, transparent);
    color: var(--ink);
}
.test-sample:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--seal) 45%, transparent);
    outline-offset: 1px;
}
</style>

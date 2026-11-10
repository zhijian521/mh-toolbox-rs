<script setup lang="ts">
import { computed, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import IconTile from '../IconTile.vue';
import GearDetailForm from './GearDetailForm.vue';
import GearScreenshot from '../ocr/GearScreenshot.vue';
import { hasGearDetail, type GearSlot } from '../gear';
import { mergeGearPanel, type GearPanelResult } from '../ocr/gear-panel';
import { useGearIcon } from '../use-gear-icon';

/** 部位图标常驻，原图与详情并排；识别按实际部位更新草稿并选中该件。 */
const emit = defineEmits<{ busy: [value: boolean] }>();
const gear = defineModel<GearSlot[]>({ required: true });
const screenshot = ref<InstanceType<typeof GearScreenshot> | null>(null);
const reading = ref(false);
const selected = ref<string>(gear.value.find(filled)?.slot ?? gear.value[0]?.slot ?? '');
const active = computed(() => gear.value.find((slot) => slot.slot === selected.value) ?? null);
const filledCount = computed(() => gear.value.filter(filled).length);
/* 清空按钮的形状不跟着「有没有内容」变，只有可见性变——见模板里那段注释。 */
const clearable = computed(() => Boolean(active.value && filled(active.value)));
function filled(slot: GearSlot): boolean {
    return Boolean(slot.caption?.trim()) || hasGearDetail(slot.detail);
}
function ensureDetail(slot: GearSlot) {
    slot.detail ??= { name: slot.caption ?? '', kind: '', stats: [] };
}
function selectByKey(key: string) {
    const slot = gear.value.find((one) => one.slot === key);
    if (!slot) return;
    const previous = active.value;
    if (previous?.detail && !filled(previous)) delete previous.detail;
    selected.value = key;
    ensureDetail(slot);
}
function clearByKey(key: string) {
    const slot = gear.value.find((one) => one.slot === key);
    if (!slot) return;
    slot.caption = '';
    delete slot.detail;
    screenshot.value?.clearShot(slot.slot);
    if (slot.slot === selected.value) ensureDetail(slot);
}
function recognize(result: GearPanelResult) {
    const index = gear.value.findIndex((slot) => slot.slot === result.slot);
    if (index < 0) return;
    gear.value[index] = mergeGearPanel(gear.value[index], result);
    selectByKey(gear.value[index].slot);
}
if (active.value) ensureDetail(active.value);
const { icon: slotIcon } = useGearIcon();
</script>

<template>
    <div class="gear-editor">
        <GearScreenshot
            ref="screenshot"
            class="gear-editor-upload"
            :active-slot="active?.slot"
            multiple
            @recognize="recognize"
            @busy="
                reading = $event;
                emit('busy', $event);
            "
        >
            <template #navigation="{ shots }">
                <slot name="tabs" />
                <div class="gear-parts-head">
                    <span
                        >装备
                        <span class="gear-count">{{ filledCount }} / {{ gear.length }}</span></span
                    >
                    <!-- 常驻、只在有内容时显形：这一行右侧若按 `v-if` 增删，20 高的按钮会把行
                         高顶起来，十二格与预览图跟着上下挪（用户 2026-11-10 报「显示隐藏的时候
                         页面高度会变」）。留着位置，显隐只走可见性。 -->
                    <PressButton
                        class="gear-clear"
                        :class="{ 'is-on': clearable }"
                        icon="trash"
                        text="清空"
                        size="sm"
                        :label="active ? '清空' + active.slot + '这一件' : '清空这一件'"
                        :disabled="reading || !clearable"
                        @click="active && clearByKey(active.slot)"
                    />
                </div>
                <nav class="gear-parts" aria-label="装备部位">
                    <button
                        v-for="slot in gear"
                        :key="slot.slot"
                        class="gear-slot"
                        :class="{ filled: filled(slot), 'has-shot': Boolean(shots[slot.slot]) }"
                        type="button"
                        :aria-label="'编辑' + slot.slot + '的装备'"
                        :aria-pressed="selected === slot.slot"
                        :disabled="reading"
                        :title="slot.caption || slot.detail?.name || slot.slot"
                        @click="selectByKey(slot.slot)"
                    >
                        <IconTile v-if="slotIcon(slot)" class="slot-icon" :src="slotIcon(slot)" />
                        <span v-else class="slot-mark" aria-hidden="true">{{ slot.slot[0] }}</span>
                    </button>
                </nav>
            </template>
            <GearDetailForm
                v-if="active?.detail"
                :key="active.slot"
                v-model="active.detail"
                v-model:caption="active.caption"
                :slot-name="active.slot"
            />
        </GearScreenshot>
    </div>
</template>

<style scoped>
.gear-editor {
    display: flex;
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
}
.gear-parts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* 高度钉死在 `PressButton` 的 `sm` 那一档（20 × 字号系数），不按内容取：这一行右侧
     * 是常驻的清空按钮，行高若由内容决定，按钮一显一隐就带着整栏高度变，下面十二格与预览
     * 图跟着跳（2026-11-10 用户报的就是这个）。 */
    height: calc(20px * var(--fs-scale));
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
/* 清空按钮：没内容时仍占位，只是看不见也点不动。用 `visibility` 而不是 `display`——
 * 后者一样把位置收走，等于换个地方重新跳一次。`opacity` 不用：它只让按钮变淡，
 * 仍会接住指针，十二格那一带就多了一个看不见的点击区。 */
.gear-clear {
    visibility: hidden;
}
.gear-clear.is-on {
    visibility: visible;
}
.gear-count {
    margin-left: 6px;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.gear-parts {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    padding-bottom: 10px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.gear-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: 0;
    /* 底下那 9px 是给「落格印」留的位置：它只在选中时出现，但位置一旦按选中态撑开，
     * 切部位时整排图标会跟着上下跳 2px。留白固定，印在一处出现或消失。 */
    padding: 6px 2px 9px;
    border: var(--w-hair) solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
}
/* 部位格只有一排图，块给到 48 / 图 42（2026-11-10 第二轮：用户「还可以放大一点」）。
 * 左半列 400 宽、六列 gap 4，每格约 63.3——48 的块两侧各留 7.6，整排还连着气口；
 * 2026-11-10 截图区从 446 收到 400 后又量过，48 仍放得下（再收就只剩 3 的气口）。 */
.gear-slot .slot-icon {
    --tile-w: 48px;
    --tile-h: 48px;
    --shot: 42px;
}
/* 空着的部位（没填装备名、也没有详情）：图标收色、退淡一档。十二格全亮着时分不出哪几件
 * 已经填过；压灰之后空格自己退到后排，填过的那几格站前面（用户 2026-11-10：「没有装备的
 * 话，装备图标格子可以稍微灰色一点」）。 */
.gear-slot:not(.filled) .slot-icon {
    filter: grayscale(0.45);
    opacity: 0.6;
}
/* 悬停：只把格子提成一张纸。**不给朱**——朱在这套语言里是「当前这一件」，
 * 悬停与选中各自一个色，指针扫过去时才不会误读成「已经切过去了」。
 * 空格悬停把颜色还回来：灰是「这里还空着」的状态，不是这一格的固定长相。 */
.gear-slot:hover {
    border-color: var(--rule-2);
    background: var(--paper-2);
    color: var(--ink);
}
.gear-slot:hover .slot-icon {
    filter: none;
    opacity: 1;
}
/* 选中：**只在图下面留一道朱印**（2026-11-10 第二轮：用户「选中时候外面的红色边框和背景
 * 不要了，可以保留图标按钮下面的红色下划线」）。原先那圈朱线 + 8% 朱底撤掉——一栏十二枚
 * 图标本来就密，框和底把格子切成一堆小方块；一道短印贴着图脚，既不切格子，也仍然只说
 * 一件事：当前是这一件。padding-bottom 那 9px 常年留着给这道印，印出现时整排不跳。 */
.gear-slot[aria-pressed='true']::before {
    position: absolute;
    bottom: 3px;
    left: 50%;
    width: 22px;
    height: 2px;
    border-radius: 1px;
    background: var(--cinnabar);
    transform: translateX(-50%);
    content: '';
}
.gear-slot:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 「这张图这次认过」= 右上角一粒靛点。原先旁边还有一粒苔绿的「这一件有内容」，
 * 2026-11-10 按用户要求撤掉——填没填已由空格的灰淡说清了，不必再点一次。 */
.gear-slot.has-shot::after {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--indigo-ink);
    content: '';
}
/* 没有图标时的首字压印：淡墨，标记「这类图还没切」——它与 `IconTile` 二选一，
 * 尺寸跟着块走（48），不跟字走。 */
.slot-mark {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    color: var(--muted);
    font-size: var(--fs-md);
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import { loadPetAssets, petAssets } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';

/**
 * 头像选择：**收起时只是一个头像框**，点开才出一张纸片挑图。
 *
 * 上一版是「头像 + 一行『选择召唤兽头像』文字 + 常展开的 4 列头像墙」，整块占掉
 * 表单最上面一整行（2026-11-10 用户：「选择召唤兽头像 占据了很大一行，只占据个头像
 * 就行」）。现在 summary 里只有一个头像（几何 64，与右侧名称/等级那一列并排），
 * 面板改成**绝对定位的浮层**（见下方 .portrait-panel）：展开时不撑高表单，
 * 名称那几行一个字都不会跳。
 *
 * 仍然用 <details> 而不是自己写开合：它自带展开状态与键盘可达，不用再造一份
 * aria-expanded。面板**绝对定位**在这枚头像的下面（包含块就是 `details` 本身），
 * 因此不撑高那一行——展开 / 收起时右侧的名称、等级一动不动。宽度写死而不是撑满
 * 父级：包含块只有 64 宽，撑满会变一条竖缝。
 *
 * **点别处收起**（2026-11-10 用户：「召唤兽头像选择 点击其他地方 关闭选择框」）：
 * `<details>` 只认自己那枚 summary，浏览器不会因为点了外面就合上，所以这里补一个
 * document 上的 `pointerdown`——用 `pointerdown` 而不是 `click`，理由与
 * `SelectField` 同一条：点在别的输入格上时焦点在 `click` 之前就移走了，等 `click`
 * 到来说明纸片已经盖住别人。`Esc` 也要收，而且要吞掉——这张弹窗自己在 document 上
 * 听 `Esc` 关整张纸，不拦就成了「想关面板，连表单一起关」。
 */
const selected = defineModel<string>({ default: '' });
const picker = ref<HTMLDetailsElement | null>(null);
const summary = ref<HTMLElement | null>(null);
const query = ref('');
const limit = ref(48);
const error = ref('');
const filtered = computed(() =>
    (petAssets.value?.portraits ?? []).filter((one) => one.name.includes(query.value.trim())),
);
async function load() {
    error.value = '';
    try {
        await loadPetAssets();
    } catch {
        error.value = '头像资源未加载，请重试';
    }
}
onMounted(load);

/* 面板开着时点外面就合上并**把焦点还给那枚头像**：面板带着搜索框，焦点若留在里面
 * 就会跟着面板一起消失（Vue 一整个拔掉 DOM，焦点掉回 body，Tab 从页面开头重来）。
 * 已经合上时不动焦点——点别处本来就该把焦点交给被点的那个控件。 */
function closePanel(returnFocus = false) {
    const el = picker.value;
    if (!el?.open) return;
    el.open = false;
    if (returnFocus) void nextTick(() => summary.value?.focus());
}

function onPointerDown(event: PointerEvent) {
    if (picker.value?.contains(event.target as Node)) return;
    closePanel();
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
    <details ref="picker" class="portrait-picker" @keydown.esc.stop.prevent="closePanel(true)">
        <summary ref="summary" aria-label="选择召唤兽头像">
            <PetImage :name="selected" kind="portrait" />
        </summary>
        <div class="portrait-panel">
            <div class="portrait-tools">
                <input
                    v-model="query"
                    class="field"
                    type="search"
                    placeholder="搜索召唤兽"
                    aria-label="搜索召唤兽头像"
                    @input="limit = 48"
                />
                <PressButton
                    v-if="selected"
                    text="清除"
                    label="清除召唤兽头像"
                    size="sm"
                    @click="selected = ''"
                />
            </div>
            <p v-if="error" class="note" role="alert">
                {{ error }}
                <PressButton text="重试" label="重试加载召唤兽资源" size="sm" @click="load" />
            </p>
            <div class="portrait-grid">
                <button
                    v-for="one in filtered.slice(0, limit)"
                    :key="one.id"
                    type="button"
                    :aria-pressed="selected === one.id"
                    :aria-label="`选择头像：${one.name}`"
                    @click="selected = one.id"
                >
                    <PetImage :name="one.id" kind="portrait" /><span>{{ one.name }}</span>
                </button>
            </div>
            <p v-if="!filtered.length && !error" class="note">未找到头像</p>
            <PressButton
                v-if="filtered.length > limit"
                class="portrait-more"
                text="显示更多"
                label="显示更多召唤兽头像"
                size="sm"
                @click="limit += 48"
            />
        </div>
    </details>
</template>

<style scoped>
/* 这 64 是「一个头像」的尺寸（与 `.portrait` 默认 48 不同的那一档）：右侧名称那一列
 * 是 30 的输入格 + 4 行距 + 28 的读数行 = 62，两边同高，第一行才读得成一条。 */
.portrait-picker {
    position: relative;
    flex: none;
    --pick-size: 64px;
}
summary {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--pick-size);
    height: var(--pick-size);
    list-style: none;
    border-radius: var(--r-2);
    cursor: pointer;
    transition: box-shadow var(--t-quick) var(--ease-soft);
}
/* 去掉 <summary> 自带的三角。两个写法都要：Chromium 认前者，旧引擎认后者。 */
summary::-webkit-details-marker {
    display: none;
}
summary::marker {
    content: '';
}
/* 同 `pet-pane.css`：`PetImage` 的 `.portrait` 是 0-2-0，这里多带一个类抬到 0-3-0。 */
summary :deep(.pet-image.portrait) {
    --pet-icon-size: var(--pick-size);
}
/* 悬停只把这一格**托起来**（一圈--rule-2 的细影），不发朱：朱在这套语言里专指
 * 「当前这一件 / 这一次」。 */
summary:hover {
    box-shadow: 0 0 0 1px var(--rule-2);
}
/* 展开时在头像下面压一道朱印，与装备部位格、卡内页签同一个记号：
 * 「这块正在被我动」。 */
details[open] summary::after {
    content: '';
    position: absolute;
    bottom: -7px;
    left: 50%;
    width: 22px;
    height: 2px;
    border-radius: 1px;
    background: var(--cinnabar);
    transform: translateX(-50%);
}
summary:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 面板是**浮层**：绝对定位到 `.portrait-picker`（它自己写着 `position: relative`），
 * 所以它不参与这一行的排版——展开 / 收起时右侧名称、等级那一列纹丝不动，
 * 这正是上一版「整块占一行、一展开又把表单推下去」要解决的问题。
 *
 * 材质与 `SelectField` 的列表同一条：纸面 + 1px 账线 + `--shadow-lift`。
 * `width` 不走 `max-width: 100%`：包含块是 64 宽，100% 会把它压成一条竖缝。 */
.portrait-panel {
    position: absolute;
    z-index: 12;
    top: calc(100% + 10px);
    left: 0;
    /* 372 是六列 × 58 + 五道 6 的缝 + 两侧 10 的内衬。写死而不是 `left: 0; right: 0`：
     * 包含块（那枚 64 的头像）撑不开一张纸片。 */
    width: 372px;
    display: grid;
    gap: 8px;
    padding: 10px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--paper);
    box-shadow: var(--shadow-lift);
}
.portrait-tools {
    display: flex;
    align-items: center;
    gap: 8px;
}
/* 面板是栅格，格子默认 `justify-items: stretch`——不写这一条，「显示更多」会被拉成
 * 整张纸片的宽度（用户 2026-11-10：「宽度撑满了 太宽了，自适应宽度就够」）。
 * 只收这一枚，上面那种「输入框吃满一行」与下面的头像墙都不动。 */
.portrait-more {
    justify-self: start;
}
.portrait-tools input {
    min-width: 0;
    width: 100%;
}
/* 六列：纸片长满整行（约 414），每格 62 上下，头像 48 还留得住一格气口。
 * 上一版是四列，因为那时候它只有左半栏的一半宽。 */
.portrait-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    max-height: 264px;
    overflow-y: auto;
}
.portrait-grid button {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 4px 2px;
    border: 1px solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-mini);
    cursor: pointer;
}
.portrait-grid button[aria-pressed='true'] {
    border-color: var(--ochre);
    background: var(--well);
}
.portrait-grid button:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>

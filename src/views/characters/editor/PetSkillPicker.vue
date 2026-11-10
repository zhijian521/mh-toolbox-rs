<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import { loadPetAssets, petAssets } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';

/**
 * 一格技能 = 一枚图标 + 一张点开才出的纸片。
 *
 * 上一版是「十二格 + 一个 textarea」，技能名靠顿号分隔的裸文本改（2026-11-10 用户：
 * 「技能添加不使用输入框，可以在技能最后一个后面通过 + 号图标添加，点击图标添加默认
 * 技能，然后点击技能图标可以下拉切换，类似于召唤兽头像选择」）。现在两件事分开：
 * 加一格由外面的「+」做（见 `PetDetailForm`），改这一招由这枚图标做——点开是一张
 * 带搜索的纸片，选完即落定。裸文本一去，「顿号」「半角逗号」这类书写规则也跟着消失。
 *
 * 纸片**绝对定位**在这枚图标下面：不撑高技能那一段，展开 / 收起时下面几行一个字
 * 都不跳（与 `PetPortraitPicker` 同一个理由）。横向位置在点开时量一次并**夹进
 * `.pet-content` 的可用宽度**：六列里靠右的格子不能只顾「改贴右缘」——那样纸片
 * 会伸出左边的裁剪线，搜索框落在纸外面，看得见却点不到。
 *
 * 外点收起用 `pointerdown`（与 `SelectField` 同一条）：点在别的输入格上时焦点在
 * `click` 之前就移走了，等 `click` 到来说明纸片已经盖住别人。`Esc` 要吞掉——
 * 这张弹窗自己也在 document 上听 `Esc` 关整张纸，不拦就成了「想关下拉，连表单一起关」。
 */
const props = defineProps<{ index: number }>();
const emit = defineEmits<{ remove: [] }>();
const selected = defineModel<string>({ default: '' });

const root = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);
const open = ref(false);
/* 纸片相对这枚图标的横向偏移：让它整张留在 `.pet-content` 里。 */
const shift = ref(0);
/* 翻到格子上方：技能段在整张表单的末尾，靠下那几格的下方没有 344 的高度可用。 */
const flipUp = ref(false);
const query = ref('');
const limit = ref(48);
const error = ref('');

const filtered = computed(() => {
    const needle = query.value.trim();
    const all = petAssets.value?.skills ?? [];
    return needle ? all.filter((one) => one.name.includes(needle)) : all;
});

async function load() {
    error.value = '';
    try {
        await loadPetAssets();
    } catch {
        error.value = '技能资源未加载，请重试';
    }
}
onMounted(load);

/* 360 与 `PetPortraitPicker` 那张头像纸片同宽（六列 × 54 + 五道 6 的缝 + 两侧 10）。
 * 只有翻向那一下要读它，所以留成常量而不是量出来。 */
const PANEL_W = 360;

function openPanel() {
    query.value = '';
    limit.value = 48;
    open.value = true;
    void nextTick(() => {
        const box = root.value?.getBoundingClientRect();
        const sheet = panel.value?.getBoundingClientRect();
        /* 夹的是**滚动容器**的可用宽度，不是这枚图标所在的那张栅格：栅格右缘对齐
         * 了，纸片照样能越过 `.pet-content` 的左裁剪线（第二列起就会）。 */
        const frame = root.value?.closest('.pet-content');
        if (!box || !frame) return;
        const frameBox = frame.getBoundingClientRect();
        /* 可用区按 clientWidth 算：稳定占位的滚动条不算可用宽度，纸片压在它上面
         * 会把最后十几像素藏掉。 */
        const left = frameBox.left + frame.clientLeft;
        const right = left + frame.clientWidth;
        const low = left + 8 - box.left;
        const high = right - 8 - PANEL_W - box.left;
        shift.value = high < low ? low : Math.min(Math.max(0, low), high);
        /* 竖向翻向要量「滚动容器还剩多少」而不是视口：纸片是 `.pet-content` 里的绝对定位，
         * 超出它的裁剪线就被切掉，而技能段正在这张表单的最下面。量一次纸片的高（此刻按
         * 向下展开算出来的），下方放不下就翻到格子上方——两个方向都放不下时留在下方，
         * 那说明这一格本来就在容器正中，往上还是往下都会被裁。 */
        if (!sheet) return;
        const below = frameBox.bottom - box.bottom - 8;
        const above = box.top - frameBox.top - 8;
        flipUp.value = sheet.height > below && above > below;
        /* 开纸片就是为了挑一招：焦点直接落进搜索框，键盘用户不用再 Tab 一次。 */
        search.value?.focus();
    });
}

function closePanel() {
    open.value = false;
}

function toggle() {
    if (open.value) closePanel();
    else openPanel();
}

function choose(name: string) {
    selected.value = name;
    closePanel();
}

/* 这一格清掉：由表单把整项从名单里删掉（留一个空名会变成一个看不出内容的格子）。 */
function clear() {
    emit('remove');
    closePanel();
}

function onPointerDown(event: PointerEvent) {
    if (!open.value) return;
    if (root.value?.contains(event.target as Node)) return;
    closePanel();
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
    <div ref="root" class="slot skill-picker">
        <button
            type="button"
            class="skill-trigger"
            :aria-label="`第 ${props.index + 1} 个技能：${selected || '未选择'}`"
            :aria-expanded="open"
            @click="toggle"
            @keydown.esc.stop.prevent="closePanel"
        >
            <PetImage v-if="selected" :name="selected" />
            <small :class="{ empty: !selected }">{{ selected || '选择技能' }}</small>
        </button>
        <div
            v-if="open"
            ref="panel"
            class="skill-panel"
            :class="{ up: flipUp }"
            :style="shift ? { left: `${shift}px` } : undefined"
            role="group"
            :aria-label="`选择第 ${props.index + 1} 个技能`"
            @keydown.esc.stop.prevent="closePanel"
        >
            <div class="skill-tools">
                <input
                    ref="search"
                    v-model="query"
                    class="field"
                    type="search"
                    placeholder="搜索技能"
                    aria-label="搜索召唤兽技能"
                    @input="limit = 48"
                />
                <PressButton
                    v-if="selected"
                    text="清除"
                    :label="`清除第 ${props.index + 1} 个技能`"
                    size="sm"
                    @click="clear"
                />
            </div>
            <p v-if="error" class="note" role="alert">
                {{ error }}
                <PressButton text="重试" label="重试加载召唤兽技能" size="sm" @click="load" />
            </p>
            <div class="skill-grid">
                <button
                    v-for="one in filtered.slice(0, limit)"
                    :key="one.id"
                    type="button"
                    :aria-pressed="selected === one.name"
                    :aria-label="`选择技能：${one.name}`"
                    @click="choose(one.name)"
                >
                    <PetImage :name="one.name" /><span>{{ one.name }}</span>
                </button>
            </div>
            <p v-if="!filtered.length && !error" class="note">未找到技能</p>
            <PressButton
                v-if="filtered.length > limit"
                class="skill-more"
                text="显示更多"
                label="显示更多召唤兽技能"
                size="sm"
                @click="limit += 48"
            />
        </div>
    </div>
</template>

<style scoped>
/* 根节点同时是栅格里的那一格：`.slot` 的排布（居中、gap 5、min-width 0）由
 * `pet-detail-form.css` 给，这里只加「纸片以它为包含块」。 */
.skill-picker {
    position: relative;
}
.skill-trigger {
    display: grid;
    justify-items: center;
    gap: 5px;
    width: 100%;
    padding: 4px 2px;
    border: 1px solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background var(--t-quick) var(--ease-soft);
}
/* 悬停与「纸片正开着」用同一种提法：一道细账线 + 一提纸色。不发朱——朱专指
 * 「当前这一件」，而技能格是十二格里的任意一格。 */
.skill-trigger:hover,
.skill-trigger[aria-expanded='true'] {
    border-color: var(--rule-2);
    background: var(--paper-2);
}
.skill-trigger:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.skill-trigger small {
    color: var(--ink-2);
    font-size: var(--fs-mini);
    text-align: center;
    overflow-wrap: anywhere;
}
/* 空名只在资源没加载出来时出现（正常路径「+」会落进第一招还没学的）。给它一段提示字，
 * 否则那一格就是个点得动却什么都不写的空白。 */
.skill-trigger small.empty {
    color: var(--muted);
}
/* 纸片：材质与 `SelectField` 的列表、头像纸片同一条（纸面 + 1px 账线 + --shadow-lift）。 */
.skill-panel {
    position: absolute;
    z-index: 12;
    top: calc(100% + 6px);
    left: 0;
    width: 360px;
    display: grid;
    gap: 8px;
    padding: 10px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--paper);
    box-shadow: var(--shadow-lift);
}
/* 翻到格子上方：技能段在表单末尾，下面放不下整张纸片时改贴格子上沿长。 */
.skill-panel.up {
    top: auto;
    bottom: calc(100% + 6px);
}
.skill-tools {
    display: flex;
    align-items: center;
    gap: 8px;
}
.skill-tools input {
    min-width: 0;
    width: 100%;
}
/* 面板是栅格，默认 `justify-items: stretch`——「显示更多」不收回内容宽就会拉满整张纸片
 * （同一件事在头像纸片那边踩过一次）。 */
.skill-more {
    justify-self: start;
}
.skill-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    max-height: 264px;
    overflow-y: auto;
}
.skill-grid button {
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
.skill-grid button[aria-pressed='true'] {
    border-color: var(--ochre);
    background: var(--well);
}
.skill-grid button:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>

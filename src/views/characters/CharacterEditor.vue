<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import CharacterCard from './CharacterCard.vue';
import { PANES, type CharacterData, type PaneKey } from './character';
import { schoolSkillNames } from './schools';
import { parseAttrPanel, type OcrLine } from './ocr/attr-panel';
import { createAssistReader } from './ocr/assist-reader';
import { useOcrImage } from './ocr/use-ocr-image';
import { parseSkillPanel } from './ocr/skill-panel';
import { parseTrainingPanel } from './ocr/training-panel';
import { useOcrDraft, type PanelResult } from './ocr/use-ocr-draft';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import { normalizeCharacter } from './roster';

/** 新建、手工修改和截图识别共用独立草稿，保存后由名册统一落库。 */
const props = withDefaults(
    defineProps<{ character: CharacterData; pane?: PaneKey; isNew?: boolean; saving?: boolean }>(),
    { pane: 'attrs', isNew: false, saving: false },
);
const emit = defineEmits<{ save: [character: CharacterData]; cancel: [] }>();
const gearReading = ref(false);
const petReading = ref(false);
const {
    draft,
    changed,
    recognize,
    setValue,
    setSkill,
    setAssist,
    addAssist,
    removeAssist,
    setTraining,
} = useOcrDraft(props.character);

const pane = ref<PaneKey>(props.pane);
const content = ref<HTMLElement | null>(null);
const PANE_OPTIONS = PANES.map(({ key, label }) => ({ value: key, label }));
const wide = computed(() => pane.value === 'gear' || pane.value === 'pets');

const { result, shotUrl, rawLines, busy, error, takeFile, classify } =
    useOcrImage<PanelResult | null>(parse, undefined, () => pane.value !== 'assist');
const readAssist = createAssistReader();
watch(result, (current) => recognize(current, shotUrl.value), { flush: 'sync' });

const picker = ref<HTMLInputElement | null>(null);
const hitCount = computed(() => {
    const current = result.value;
    if (!current?.value) return 0;
    const rows = current.pane === 'attrs' ? current.value.fields : current.value.rows;
    return rows.filter((row) => row.state === 'ok' || row.state === 'guess').length;
});
const totalCount = computed(() => result.value?.value?.total ?? 0);

const preview = computed(() => ({ ...draft.value, id: `${draft.value.id}-preview` }));
const canSave = computed(
    () =>
        Boolean(draft.value.name.trim()) &&
        !busy.value &&
        !gearReading.value &&
        !petReading.value &&
        !props.saving &&
        (props.isNew || changed.value),
);

function onPaste(event: ClipboardEvent) {
    if (wide.value) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        void takeFile(file);
        return;
    }
}

function onDrop(event: DragEvent) {
    const file = [...(event.dataTransfer?.files ?? [])].find((one) =>
        one.type.startsWith('image/'),
    );
    if (file) void takeFile(file);
}

function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void takeFile(file);
    input.value = '';
}

async function parse(lines: OcrLine[], image: ImageData) {
    if (wide.value) {
        return { result: null };
    }
    if (pane.value === 'attrs') {
        const value = parseAttrPanel(lines);
        return {
            result: { pane: 'attrs' as const, value },
            error: value.hit ? '' : '没认出属性字段',
        };
    }
    if (pane.value === 'assist') {
        const value = await readAssist(image);
        return {
            result: { pane: 'assist' as const, value },
            error: value.hit ? '' : '没认出辅助技能',
        };
    }
    if (pane.value === 'training') {
        const value = parseTrainingPanel(lines);
        return {
            result: { pane: 'training' as const, value },
            error: value.hit ? '' : '没认出修炼等级',
        };
    }
    const names = schoolSkillNames(draft.value.school);
    if (!names?.length) {
        return {
            result: { pane: 'skills' as const, value: null },
            error: '请先为角色选择门派',
        };
    }
    const value = parseSkillPanel(lines, names);
    return {
        result: { pane: 'skills' as const, value },
        error: value.hit ? '' : '没认出师门技能',
    };
}

// 分区共用编辑草稿；同一原图只覆盖一次，切回时保留手工修改。
watch(
    pane,
    (value) => {
        if (value !== 'gear' && value !== 'pets') void classify();
    },
    { flush: 'sync' },
);

function save() {
    if (canSave.value) emit('save', normalizeCharacter(draft.value));
}

onMounted(async () => {
    document.addEventListener('paste', onPaste);
    await nextTick();
    content.value?.querySelector<HTMLInputElement>('input[aria-label="角色名"]')?.focus();
});
onBeforeUnmount(() => document.removeEventListener('paste', onPaste));
</script>

<template>
    <ModalShell
        class="editor character-theme"
        :data-school="draft.school || ''"
        :title="isNew ? '新角色' : `修改角色 · ${character.name || '未命名'}`"
        :width="860"
        :height="'min(740px, calc(100vh - 48px))'"
        fill
        :initial-focus="pane === 'attrs' ? 'none' : 'first'"
        @close="emit('cancel')"
    >
        <div ref="content" class="ocr" :class="{ 'ocr-wide': wide }">
            <GearEditor v-show="pane === 'gear'" v-model="draft.gear" @busy="gearReading = $event">
                <template #tabs>
                    <SteppedSlider
                        v-if="pane === 'gear'"
                        class="ocr-tabs"
                        :model-value="pane"
                        :options="PANE_OPTIONS"
                        label="修改分区"
                        @update:model-value="pane = $event"
                    />
                </template>
            </GearEditor>
            <PetEditor v-show="pane === 'pets'" v-model="draft.pets" @busy="petReading = $event">
                <template #tabs>
                    <SteppedSlider
                        v-if="pane === 'pets'"
                        class="ocr-tabs"
                        :model-value="pane"
                        :options="PANE_OPTIONS"
                        label="修改分区"
                        @update:model-value="pane = $event"
                    />
                </template>
            </PetEditor>
            <section v-show="!wide" class="ocr-left">
                <div class="ocr-bar">
                    <!-- 与卡上那六个页签**同一条控件**（凹槽 + 会落格的朱印），
                         不传 `as="tab"`：这里没有「对应的面板元素」可指，
                         `aria-controls` 会指向一个不存在的 id。视觉相同，语义留给单选组。 -->
                    <SteppedSlider
                        v-if="!wide"
                        v-model="pane"
                        class="ocr-tabs"
                        :options="PANE_OPTIONS"
                        label="修改分区"
                    />
                    <span v-if="totalCount" class="ocr-count">
                        认出 <b>{{ hitCount }}</b> / {{ totalCount }}
                    </span>
                </div>

                <!-- 粘贴区。空态与有图态是同一块地方：换图不需要先「清掉」，
                     再粘一张就是替换。左栏没有别的常驻内容之后，这块吃掉剩下的
                     全部高度——图能摊多大摊多大，对照时才看得清是哪个数认歪了。 -->
                <div
                    class="ocr-shot"
                    :class="{ empty: !shotUrl }"
                    @dragover.prevent
                    @drop.prevent="onDrop"
                >
                    <img v-if="shotUrl" :src="shotUrl" alt="待识别的截图" />
                    <template v-else>
                        <p class="shot-title">Ctrl + V 粘贴截图</p>
                        <p class="shot-sub">也可以把图片拖进来，或者</p>
                        <PressButton
                            icon="upload"
                            text="选一张图"
                            size="sm"
                            label="选择要识别的截图文件"
                            @click="picker?.click()"
                        />
                    </template>

                    <span v-if="busy" class="shot-busy">识别中…</span>
                </div>

                <input
                    ref="picker"
                    class="ocr-file"
                    type="file"
                    accept="image/*"
                    tabindex="-1"
                    aria-hidden="true"
                    @change="onPick"
                />

                <p v-if="error" class="note error">{{ error }}</p>

                <!-- 识别原文：折叠着。它回答的是「为什么这一项没认到」，
                     不是日常要看的东西；二十几行摊开会把原图挤掉一半。 -->
                <details v-if="rawLines.length" class="ocr-raw-box">
                    <summary>识别原文 · {{ rawLines.length }} 行</summary>
                    <!-- 分数低于 0.6 的整行标出来：它们正是「错得最离谱」的那几行。 -->
                    <ul class="ocr-raw">
                        <li
                            v-for="(line, index) in rawLines"
                            :key="index"
                            :class="{ low: (line.score ?? 0) < 0.6 }"
                        >
                            <span class="raw-text">{{ line.text }}</span>
                            <span class="raw-score">{{ (line.score ?? 0).toFixed(2) }}</span>
                        </li>
                    </ul>
                </details>
            </section>

            <!-- 卡片直接编辑草稿，漏识别或尚未上传时也可补录；切分区不重置修改。 -->
            <aside v-show="!wide" class="ocr-right">
                <div class="ocr-card">
                    <CharacterCard
                        :character="preview"
                        :pane="pane"
                        preview
                        :tabs="false"
                        editable
                        @edit-value="setValue"
                        @edit-level="setSkill"
                        @edit-assist="setAssist"
                        @add-assist="addAssist"
                        @remove-assist="removeAssist"
                        @edit-training="setTraining"
                    />
                </div>
            </aside>
        </div>

        <template #footer>
            <PressButton
                text="取消"
                label="放弃这次修改"
                data-modal-cancel
                @click="emit('cancel')"
            />
            <PressButton
                icon="check"
                text="保存"
                label="保存这个角色"
                seal
                :disabled="!canSave"
                @click="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 右栏沿用角色卡宽，左栏容纳原图；两侧共用弹窗的实际可用高度。
 *
 * 窗宽 860 是**从两栏反推的**（2026-11-10 用户定：右 420、左 400）：
 * 正文可用宽 = 860 − 2×1 描边 − 16 左内边距 − 6 右内边距（扣掉滚动条轨道）= 836，
 * 减去 gap 16 与右栏 420，左栏正好 400。改任何一头都要重算这一串，
 * 所以窗宽不写独立的「看起来差不多」的数。 */
.ocr {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
    overflow: hidden;
}
.ocr.ocr-wide {
    grid-template-columns: minmax(0, 1fr);
}
.ocr :deep(.num) {
    font-weight: 700;
}

.ocr-left {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
}

.ocr-bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
/* 六个分区共用卡内滑轨，识别计数不足一行时移到下一行。
 *
 * 宽度钉成内容宽（`max-content`）：窄页这枚控件是 `.ocr-bar` 里的 flex 项，本来就按内容
 * 收；装备 / 召唤兽两页把它塞进 `upload-navigation` 那个栅格，栅格默认 `justify-items:
 * stretch` 会把它拉到整列宽——同一条页签条在六个分区里两种宽度（用户 2026-11-10 实报）。
 * `max-width: 100%` 兜住「万一左栏比内容还窄」，否则它会顶出去而不是收。
 *
 * 为什么不在栅格那边写 `justify-items: start`：那会让页签下面那两行（`.gear-parts-head`
 * 与十二部位、`.pet-list-head` 与召唤兽列表）一起变成收缩宽度，每个子项都得再补一次
 * `width: 100%`——把一条几何约束拆成四五处，改一处忘一处就又错位。 */
.ocr-tabs {
    width: max-content;
    max-width: 100%;
    --step-pad-y: 6px;
    --step-pad-x: 10px;
}
/* 认出几项：贴右。它是这一屏唯一一个「进度」读数，字号与页签条同一档，
 * 靠 `margin-left: auto` 自己走到边上去——左栏没有别的右对齐内容去挤它。 */
.ocr-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.1em;
}
.ocr-count b {
    color: var(--num);
    font-size: var(--fs-sm);
    font-weight: 700;
}

/* ---------- 原图 ---------- */
/* 一块凹槽：图是「放进去看的东西」，与弹窗的纸面不是同一层。
 *
 * 高度是 `flex: 1` 吃满左栏剩下的那一截，不再写死 186——那时下面是二十四行输入格，
 * 图只能分到一小条；现在左栏只剩图与一行折叠，图就该大。`min-height: 0` 不能省：
 * 默认的 `min-height: auto` 会让它在窗口矮的时候顶住不缩，把下面的原文挤出去。 */
.ocr-shot {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 80%, transparent);
    border-radius: var(--r-2);
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
}
/* 空态退成虚线：这时它不是「一块放图的地方」，而是「还没放」。
 * 虚线只在这一态出现，与 `.char-blank` 同一个说法。 */
.ocr-shot.empty {
    flex-direction: column;
    gap: 4px;
    border-style: dashed;
    background: none;
    box-shadow: none;
}
.ocr-shot img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}
.shot-title {
    color: var(--ink-2);
    font-size: var(--fs-base);
    letter-spacing: 0.08em;
}
.shot-sub {
    margin-bottom: 4px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
/* 识别中：压在图上的一层薄雾 + 一句说明。不做进度条——一次 200~500ms，
 * 进度条还没走到一半就结束了，反而像卡了一下。 */
.shot-busy {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--paper) 62%, transparent);
    color: var(--ink);
    font-size: var(--fs-sm);
    letter-spacing: 0.16em;
}

/* 文件选择器只做「按钮背后的那个入口」，不上屏。 */
.ocr-file {
    display: none;
}

/* ---------- 识别原文 ---------- */
/* 折叠块。原生 `<details>` 的三角留着——它是浏览器给的「这里能点」，
 * 换成自绘的加减号就得自己管开合状态，而这里不需要那个状态。 */
.ocr-raw-box {
    flex: none;
    min-height: 0;
}
.ocr-raw-box summary {
    padding: 2px 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
    cursor: pointer;
}
.ocr-raw-box summary:hover {
    color: var(--ink);
}
/* 展开后最多 190：再高就把原图挤成一条了，而这一块是「出问题时才来看」的。
 * 行数多时自己滚。 */
.ocr-raw {
    max-height: 190px;
    margin: 4px 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    font-size: var(--fs-mini);
}
.ocr-raw li {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    border-bottom: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 30%, transparent);
}
.raw-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ink-2);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.raw-score {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.ocr-raw li.low .raw-score {
    color: var(--cinnabar);
}

/* ---------- 右侧的卡 ---------- */
/* 外层不滚动，卡片填满实际剩余空间，避免固定卡高和双层滚动产生多余滚动条。 */
.ocr-right {
    display: flex;
    flex-direction: column;
    width: var(--char-w);
    min-width: 0;
    min-height: 0;
}
/* 卡自己已有投影，这里不再加框：它就该像贴在台面上的一张纸。 */
.ocr-card {
    flex: 1;
    min-height: 0;
    --char-w: 100%;
    --char-h: 100%;
}
.ocr-card :deep(.char-body) {
    padding-right: var(--card-pad-x);
    scrollbar-gutter: auto;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import SteppedSlider from '../../../components/SteppedSlider.vue';
import CharacterCard from '../CharacterCard.vue';
import type { AssistKind, CharacterData, PaneKey } from '../character';
import { schoolSkillNames } from '../schools';
import { lifeSkills, storySkills } from '../../../services/game-data';
import { assistIcon } from '../../../services/game-icons';
import { applyAttrPanel, parseAttrPanel, type AttrPanelResult, type OcrLine } from './attr-panel';
import { applyAssistPanel, parseAssistPanel, type AssistPanelResult } from './assist-panel';
import { readAssistLevels } from './assist-image';
import { matchIcons } from './matcher';
import { useOcrImage } from './use-ocr-image';
import { applySkillPanel, parseSkillPanel, type SkillPanelResult } from './skill-panel';
import { applyTrainingPanel, parseTrainingPanel, type TrainingPanelResult } from './training-panel';

/** 识别只改草稿，确认应用后仍走名册的统一保存入口。 */
const props = withDefaults(defineProps<{ character: CharacterData; pane?: PaneKey }>(), {
    pane: 'attrs',
});
const emit = defineEmits<{ apply: [character: CharacterData]; close: [] }>();

type PaneMode = 'attrs' | 'skills' | 'assist' | 'training';
const pane = ref<PaneMode>(
    props.pane === 'skills' || props.pane === 'assist' || props.pane === 'training'
        ? props.pane
        : 'attrs',
);
const PANES: { value: PaneMode; label: string }[] = [
    { value: 'attrs', label: '属性' },
    { value: 'skills', label: '师门' },
    { value: 'assist', label: '辅助' },
    { value: 'training', label: '修炼' },
];

type PanelResult =
    | { pane: 'attrs'; value: AttrPanelResult }
    | { pane: 'skills'; value: SkillPanelResult | null }
    | { pane: 'assist'; value: AssistPanelResult }
    | { pane: 'training'; value: TrainingPanelResult };
const { result, shotUrl, rawLines, busy, error, takeFile, classify } =
    useOcrImage<PanelResult>(parse);
const attrResult = computed(() => (result.value?.pane === 'attrs' ? result.value.value : null));
const skillResult = computed(() => (result.value?.pane === 'skills' ? result.value.value : null));
const assistResult = computed(() => (result.value?.pane === 'assist' ? result.value.value : null));
const trainingResult = computed(() =>
    result.value?.pane === 'training' ? result.value.value : null,
);

const picker = ref<HTMLInputElement | null>(null);
const hitCount = computed(() => {
    const current = result.value;
    if (!current?.value) return 0;
    const rows = current.pane === 'attrs' ? current.value.fields : current.value.rows;
    return rows.filter((row) => row.state === 'ok' || row.state === 'guess').length;
});
const totalCount = computed(() => result.value?.value?.total ?? 0);

const merged = computed(() => {
    const current = result.value;
    if (!current?.value) return null;
    switch (current.pane) {
        case 'attrs':
            return applyAttrPanel(props.character, current.value.fields);
        case 'skills':
            return applySkillPanel(props.character, current.value.rows);
        case 'assist':
            return applyAssistPanel(props.character, current.value.rows);
        case 'training':
            return applyTrainingPanel(props.character, current.value.rows);
    }
    return null;
});
const editableNow = computed(() => Boolean(result.value?.value));
const preview = computed(() => {
    const base = merged.value ?? props.character;
    return { ...base, id: `${base.id}-preview` };
});
const canApply = computed(() => !busy.value && Boolean(merged.value) && hitCount.value > 0);

function onPaste(event: ClipboardEvent) {
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
    if (pane.value === 'attrs') {
        const value = parseAttrPanel(lines);
        return {
            result: { pane: 'attrs' as const, value },
            error: value.hit ? '' : '没认出属性字段',
        };
    }
    if (pane.value === 'assist') {
        // 两个页签始终同时出现在截图里，类别由实际匹配到的技能图标决定。
        const candidates = [
            ...lifeSkills().map((name) => ({ name, url: assistIcon(name, 'life') })),
            ...storySkills().map((name) => ({ name, url: assistIcon(name, 'story') })),
        ].filter((one): one is { name: string; url: string } => Boolean(one.url));
        const hits = await matchIcons(image, candidates);
        let value = parseAssistPanel(lines, hits);
        const missing = hits.filter((icon) =>
            value.rows.some((row) => row.name === icon.name && row.state === 'miss'),
        );
        if (missing.length) {
            const levels = await readAssistLevels(image, missing);
            value = parseAssistPanel([...lines, ...levels], hits);
        }
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
    const names = schoolSkillNames(props.character.school);
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

// 切分区重解析当前图；辅助缺等级时只补认等级格。
watch(pane, () => void classify(), { flush: 'sync' });

const OCR_KEY: Record<string, string> = {
    'experience.value': 'expValue',
    'experience.need': 'expNeed',
};

function onValue(key: string, value: string) {
    const field = attrResult.value?.fields.find((one) => one.key === (OCR_KEY[key] ?? key));
    if (!field) return;
    field.value = value;
    if (value && (field.state === 'miss' || field.state === 'bad')) field.state = 'ok';
}

function onLevel(name: string, level: number) {
    const row = skillResult.value?.rows.find((one) => one.name === name);
    if (!row) return;
    row.level = level;
    if (row.state === 'miss' || row.state === 'bad') row.state = 'ok';
}

function onAssistLevel(name: string, kind: AssistKind, level: number) {
    const current = assistResult.value;
    if (!current) return;
    const row = current.rows.find((one) => one.name === name && one.kind === kind);
    if (row) {
        row.level = level;
        row.state = 'ok';
    } else {
        current.rows.push({ name, kind, level, state: 'ok', score: 1 });
        current.total = current.rows.length;
    }
}

function onTrainingLevel(name: string, level: number) {
    const row = trainingResult.value?.rows.find((one) => one.name === name);
    if (!row) return;
    row.level = level;
    row.state = 'ok';
}

function apply() {
    if (canApply.value && merged.value) emit('apply', merged.value);
}

onMounted(() => document.addEventListener('paste', onPaste));
onBeforeUnmount(() => document.removeEventListener('paste', onPaste));
</script>

<template>
    <ModalShell
        :title="`截图识别 · ${character.name || '未命名'}`"
        :width="940"
        fill
        @close="emit('close')"
    >
        <div class="ocr">
            <section class="ocr-left">
                <div class="ocr-bar">
                    <!-- 与卡上那六个页签**同一条控件**（凹槽 + 会落格的朱印），
                         不传 `as="tab"`：这里没有「对应的面板元素」可指，
                         `aria-controls` 会指向一个不存在的 id。视觉相同，语义留给单选组。 -->
                    <SteppedSlider
                        v-model="pane"
                        class="ocr-tabs"
                        :options="PANES"
                        label="要识别的面板"
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

            <!-- 数字直接在卡上改：认错的那个数就摆在这里，改完立刻看见后果。
                 `editable` 等**这一类真的有结果**之后才开（见 `editableNow`）。
                 `pane` 跟着分区走：认的是师门面板就翻到师门页，认完不用自己点过去。
                 `tabs: false`：这张卡是预览，不长那条六页签的轨道——那张条是一句
                 「你可以去别的页」的邀请，而这里只显示刚认的那一页。 -->
            <aside class="ocr-right">
                <div class="ocr-card">
                    <CharacterCard
                        :character="preview"
                        :pane="pane"
                        preview
                        :tabs="false"
                        :editable="editableNow"
                        @edit-value="onValue"
                        @edit-level="onLevel"
                        @edit-assist="onAssistLevel"
                        @edit-training="onTrainingLevel"
                    />
                </div>
            </aside>
        </div>

        <!-- 页脚只有两枚按钮。原先这里压着一句「只写认出来的项…乾元丹 / 潜能果不参与」，
             2026-11-07 用户要求删掉：那三条要么已在别处说过（原文折叠块、卡上的「—」），
             要么不该由一句注脚承担（乾元丹 / 潜能果本来就不在这张面板上）。 -->
        <template #footer>
            <PressButton
                text="取消"
                label="取消截图识别"
                data-modal-cancel
                @click="emit('close')"
            />
            <PressButton
                text="应用到这张卡"
                label="把识别结果写到这张角色卡"
                seal
                :disabled="!canApply"
                @click="apply"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 左证据、右结论。右栏宽度就是卡宽（`--char-w`，令牌里那一份），左栏吃掉剩下的。
 *
 * 弹窗宽度 **940 是倒推出来的**：440（卡——450 减 `.ocr-right` 那条常驻滚动条占的 10）
 * + 16（gap）+ 34（正文左右内衬）= 490，剩下 450 给左栏。450 这个数是按**实际截图**
 * 定的：游戏面板截图多数在 400~600 宽，原先 1080 那一档给到 590，小图时两边各空八十多，
 * 只是显阔，还把右边的卡挤到窗口外。更宽的截图由 `object-fit: contain` 缩进来，不裁。 */
.ocr {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    min-height: 0;
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
}
/* 分区切换**与卡内那条页签条是同一个控件**（`SteppedSlider`：凹槽 + 一枚会落格的朱印），
 * 只把尺寸收到「两格一行」：`--step-pad-y` 仍取 6（与页签条同高 35，字一样大），
 * `--step-pad-x` 从卡上的 4 放回 14——卡上收到 4 是因为六格要塞进 450，这里只有两格。
 * 不写 `width: 100%`：`inline-grid` 收缩到内容宽，两格不该被拉成一整条。 */
.ocr-tabs {
    --step-pad-y: 6px;
    --step-pad-x: 14px;
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
/* 卡的**高度跟着可用高度走**，而不是死守 620。
 *
 * 算一遍就明白为什么：弹窗最多占满视口（`100vh − 48`），扣掉页头 44、页脚 54、
 * 正文内衬 28，这一列只剩 `100vh − 174`；默认窗口的内容区是 **780**（`inner_size`
 * 要的是 860，但实测 WebView 拿到 780），于是只剩 604——比卡的 620 少 16px，
 * 卡的下沿就被弹窗切掉了。窗口高到 860 时 `min()` 取回 620，与名册里那张一样大。
 *
 * 卡内的六个分区本来就带滚动（`char-body` 是 `overflow: auto`），所以矮一点不会溢出，
 * 只是那一页的滚动条会出现——这比「卡的下沿被切成一条直线」好。
 *
 * 原先这一列顶上还压着一行「识别之后」。删掉它是因为那 25px 正好是差的那一截，
 * 而它想说的话（右边是认完的样子）弹窗标题与下面那张卡已经说完了。 */
.ocr-right {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: var(--char-w);
    min-height: 0;
    /* 兜底：窗口矮到连 100vh − 176 都不够时（比如 1024 × 700 的屏），这一列自己滚。 */
    overflow-y: auto;
    scrollbar-gutter: stable;
}
/* 卡自己已有投影，这里不再加框：它就该像贴在台面上的一张纸。 */
.ocr-card {
    flex: none;
    --char-h: min(620px, calc(100vh - 176px));
}
</style>

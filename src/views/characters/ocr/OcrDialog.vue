<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import SteppedSlider from '../../../components/SteppedSlider.vue';
import CharacterCard from '../CharacterCard.vue';
import type { CharacterData } from '../character';
import { ocrFrame } from '../../../services/desktop';
import { applyAttrPanel, parseAttrPanel, type AttrPanelResult, type OcrLine } from './attr-panel';
import { frameOf } from './pixels';

/**
 * 截图识别：粘一张游戏面板的图，认出来，右边立刻显示这张卡认完的样子。
 *
 * ---- 为什么是「弹窗 + 右侧卡片」而不是「直接改编辑器里的表单」 ----
 * 识别一定会错几个字（尤其数字与生僻的帮派名）。错的后果要**当场看得见**：
 * 右侧那张卡就是用户平时看的那一张，认错「力量 721 → 72」在这里一眼就能发现，
 * 而在一张有二十四个输入格的表单里，漏看一个数字是常态。
 *
 * 所以这一层的形状是：**左边证据，右边结论**。左边是原图（认错了能对照），
 * 原文折叠在下面（为什么没认到）；右边是这张卡认完之后的样子。
 *
 * ---- 为什么左栏没有输入格（2026-11-07 用户要求）----
 * 一开始左栏排了二十四行「标签 + 值」，右边再画一张卡。同一批数在屏幕上出现两遍，
 * 改哪一边都得先想「另一边会不会覆盖我」——而且左栏那二十四个格子的排法、字号、
 * 材质与卡上那张表都不一样，改完还得抬头对一遍。
 *
 * 现在只有一份：**卡上那枚读数签自己变成输入格**（`AttrPane` 的 `editable`），
 * 改完立刻在卡上看见，条也在动。左栏于是只剩两件事——原图、原文。
 *
 * ---- 为什么识别完不直接写库 ----
 * 面板是「当前状态」，卡片是「我记下来的状态」。一次误识别把 `帮贡 334` 写成 `33`
 * 之后，用户不会想到是这张图的问题——他会以为自己的号少了三百帮贡。
 * 所以必须由人点一下「应用到这张卡」，而那一下是**可撤销以外的最后一道闸**。
 *
 * ---- 师门为什么只有一格灰的 ----
 * 用户的要求是「先做属性页面的」。留着那一格而不是不画：它说明了「这里将来会有」，
 * 比一个只有一项的开关诚实。选中不了，也就不存在「点了没反应」。
 */
const props = defineProps<{ character: CharacterData }>();
const emit = defineEmits<{ apply: [character: CharacterData]; close: [] }>();

/**
 * 分区。眼下只有属性真的是选项（见文件头最后一段）。
 *
 * 「师门」那格**禁用**而不是不画：它说明了「这里将来会有」，比一个只有一项的开关
 * 诚实。单格禁用的支持在 `SteppedSlider` 的 `options[].disabled`（与 `SegmentedPills`
 * 同一个口径），滑轨的等分与落格照旧——两格的位置不会因为一格灰了而错开。
 */
const pane = ref<'attrs' | 'skills'>('attrs');
const PANES: { value: 'attrs' | 'skills'; label: string; disabled?: boolean }[] = [
    { value: 'attrs', label: '属性' },
    { value: 'skills', label: '师门', disabled: true },
];

/* `shallowRef`：`ImageBitmap` 是个几十兆的句柄，它内部没有需要响应式的字段，
 * 深层代理一遍纯属浪费——而且 `close()` 之后代理还拽着它不放。 */
const bitmap = shallowRef<ImageBitmap | null>(null);
const shotUrl = ref('');

const result = ref<AttrPanelResult | null>(null);
const rawLines = ref<OcrLine[]>([]);
const busy = ref(false);
const error = ref('');

const picker = ref<HTMLInputElement | null>(null);
/* 原文那块 `<details>`。只在「一行都没框到」时由程序展开一次（见 `recognize`），
 * 其余时候归用户点——所以不用 `:open` 绑一个 ref，那会让用户手开的又被打回去。 */
const rawBox = ref<HTMLDetailsElement | null>(null);

/** 认出来的项数。**现算**而不是读 `result.hit`：用户在卡上改了一格之后那个数就旧了。 */
const hitCount = computed(
    () =>
        result.value?.fields.filter((field) => field.state === 'ok' || field.state === 'guess')
            .length ?? 0,
);

/** 落库之后的样子（还没有预览用的 id）。 */
const merged = computed(() =>
    result.value ? applyAttrPanel(props.character, result.value.fields) : null,
);

/**
 * 预览用的那张卡。
 *
 * **`id` 必须换掉**：页签条与六个分区的 `id` 都是从 `character.id` 推的
 * （`${id}-tab-attrs` 那一套），而名册里那张真卡此刻还在 DOM 里。
 * 两个同 id 的节点会让 `aria-labelledby` 指到错的那一个，烟测按 id 定位时也会拿错。
 */
const preview = computed(() => {
    const base = merged.value ?? props.character;
    return { ...base, id: `${base.id}-preview` };
});

const canApply = computed(() => Boolean(merged.value) && hitCount.value > 0);

/* ---------- 拿图 ---------- */

async function takeFile(file: File) {
    error.value = '';
    try {
        const decoded = await createImageBitmap(file);
        bitmap.value?.close();
        bitmap.value = decoded;
        if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
        shotUrl.value = URL.createObjectURL(file);
        await recognize();
    } catch (err) {
        error.value = `这张图读不出来：${err instanceof Error ? err.message : String(err)}`;
    }
}

/**
 * 只认「剪贴板里有图」的那一次粘贴。
 *
 * 剪贴板里是文字时**什么都不做**：卡上那些格子是可以粘文字的，
 * 抢过来当图片处理会让「把帮贡粘进格子里」这件事直接失效。
 */
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void takeFile(file);
    /* 清掉 value：同一个文件再选一次也要触发 `change`（用户第一次认错了图，想再跑一遍）。 */
    (event.target as HTMLInputElement).value = '';
}

/* ---------- 识别 ---------- */

async function recognize() {
    const image = bitmap.value;
    if (!image || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const frame = frameOf(image);
        const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
        if (outcome.status === 'failed') {
            result.value = null;
            rawLines.value = [];
            error.value = outcome.error;
            return;
        }
        rawLines.value = outcome.lines;
        result.value = parseAttrPanel(outcome.lines);
        if (!outcome.lines.length) {
            error.value = '这张图里一行字都没框到——多半太小，或者不是面板截图。';
            /* 一行都没有时要**直接把原文摊开**：那时候「为什么没认到」只能靠看
             * 到底框到了什么，而不是逐项去猜（多半是图太小、或者选错了面板）。
             * 得等这一帧渲染完，那块 `<details>` 才存在。 */
            await nextTick();
            if (rawBox.value) rawBox.value.open = true;
        } else if (result.value.hit === 0) {
            error.value = '没认出属性字段。图里是不是「师门」或者别的面板？';
        }
    } catch (err) {
        error.value = `识别失败：${err instanceof Error ? err.message : String(err)}`;
    } finally {
        busy.value = false;
    }
}

/* ---------- 改与交 ---------- */

/**
 * 卡上抛上来的键 → 识别结果里的键。
 *
 * 属性行两边同名（行名就是面板上的标签），只有经验那两个不是：卡上那两格说的是
 * 「这一页的哪个位置」（`experience.value` / `experience.need`），识别层说的是
 * 「面板上哪个标签」（`expValue` / `expNeed`）。翻译放在这一层，卡就不必认识
 * `expValue` 这种词。
 */
const OCR_KEY: Record<string, string> = {
    'experience.value': 'expValue',
    'experience.need': 'expNeed',
};

/**
 * 用户在卡上改了一格。
 *
 * 两件必须做的事：
 *   ① 写进 `field.value`——`merged` 是 `applyAttrPanel` 现算的，改这里卡才会跟着变；
 *   ② **`miss` / `bad` 要翻成 `ok`**——那两态的原值被 `applyAttrPanel` 整项跳过，
 *      不翻状态的话，用户亲手在卡上填的数一个也写不进去，看着像「改了没用」。
 *
 * 空串不翻状态，也不清原值以外的任何东西：`applyAttrPanel` 本来就跳过空值，
 * 这一格于是回到卡上原来的数（清空 = 这一项不动，不是「把它记成空」）。
 */
function onValue(key: string, value: string) {
    const field = result.value?.fields.find((one) => one.key === (OCR_KEY[key] ?? key));
    if (!field) return;
    field.value = value;
    if (!value) return;
    if (field.state === 'miss' || field.state === 'bad') field.state = 'ok';
}

function apply() {
    if (merged.value) emit('apply', merged.value);
}

onMounted(() => document.addEventListener('paste', onPaste));

onBeforeUnmount(() => {
    document.removeEventListener('paste', onPaste);
    bitmap.value?.close();
    if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
});
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
                    <span class="ocr-note">师门面板排在下一步</span>
                    <span v-if="result" class="ocr-count">
                        认出 <b>{{ hitCount }}</b> / {{ result.total }}
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
                <details v-if="rawLines.length" ref="rawBox" class="ocr-raw-box">
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
                 `editable` 等**有识别结果**之后才开：还没有结果时这些格子无处可写
                 （`onValue` 找不到那一项），画成能填却填不进去，是在胡说。
                 `tabs: false`：这张卡是预览，不长那条六页签的轨道——那张条是一句
                 「你可以去别的页」的邀请，而这里只有属性这一页。 -->
            <aside class="ocr-right">
                <div class="ocr-card">
                    <CharacterCard
                        :character="preview"
                        preview
                        :tabs="false"
                        :editable="Boolean(result)"
                        @edit-value="onValue"
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
/* 师门那格为什么灰：不写一句会读成「坏了」。 */
.ocr-note {
    color: var(--muted);
    font-size: var(--fs-mini);
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

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageShell from '../components/PageShell.vue';
import PressButton from '../components/PressButton.vue';
import { askConfirm } from '../composables/use-confirm';
import CharacterCard from './characters/CharacterCard.vue';
import CharacterEditor from './characters/CharacterEditor.vue';
import OcrDialog from './characters/ocr/OcrDialog.vue';
import QuickEdit from './characters/quick/QuickEdit.vue';
import type { QuickTarget } from './characters/quick/quick-target';
import type { CharacterData } from './characters/character';
import { emptyCharacter, useRoster } from './characters/roster';
import { goalsOfCharacter } from './goals/goals-store';

/**
 * 角色页 —— 名册。
 *
 * 数据来自 `roster.ts`（模块级单例 + `localStorage`），不再是写死的 `mock.ts`：
 * 增删改在这里发生，改完立即落到本机。首次启动没有存储时，那一层会拿 `mock.ts`
 * 里那两个角色做种子——先给一份能改的样例，比一张空页有用。
 *
 * 卡宽写死 450 而不是 `minmax(…, 1fr)`：一用伸缩列，卡片会随窗口各自拉宽到 600+，
 * 又回到「一条横贯屏幕的长卡」——游戏里的人物面板从来不是那个比例。
 * 450 是「最小窗口放得下两张」反推出来的（见 `tokens.css` 的 `--char-w`），
 * 1280 与 1024 下都是一行两张。
 *
 * 页头只剩一枚按钮（新角色），走 `PressButton` 的 `seal` 变体——块面灌朱、一屏一枚。
 * 原先那枚禁用的「识别游戏窗口」2026-11-07 删了：识别现在真的能用，
 * 入口在每张卡头上（截图识别），见 `ocr/OcrDialog.vue`。
 *
 * **这枚用默认档 `md`（26px），不写 `size="lg"`**（2026-11-03 改）。页头高度是
 * `--page-head-h` = 19 + 字号 × 1.15 + 1（1.1 档实测 47.8）；`lg` 是 31，加上下
 * padding 19 就到 50，页头被这枚按钮顶高一截，与本页内容区、左栏牌记、其余无按钮的
 * 页面全部对不上。`md` 三档字号下都低于页头自然高度（42.9 / 45 / 47.6 < 43.3 / 45.3 / 47.8），
 * 页头高度才重新由令牌说了算。
 */
const { roster, loadError, writeError, add, update, remove } = useRoster();

/* 正在编辑的草稿，`null` = 浮层关着。**不另存一个 `isNew` 布尔**：
 * 「这是新角色还是改旧的」由「名册里有没有这个 id」现算，两个状态分开维护，
 * 总有一次会不同步（保存完忘了清、取消时先清了一个）。 */
const editing = ref<CharacterData | null>(null);

/* 正在做截图识别的那张卡，`null` = 弹窗关着。
 * 与 `editing` 分开：两个弹窗装的是同一张卡，但一个是「改」，一个是「认」，
 * 合用一个变量会让「关掉识别」顺手把编辑器也关掉。 */
const scanning = ref<CharacterData | null>(null);

/**
 * 正在「快速修改」的那一项，`null` = 关着。
 *
 * 三份状态各开一个而不是揉成一个 `{ 角色, 模式 }`：三个弹窗装的是同一张卡的不同面，
 * 而它们的开合时机互不相干（识别开着的时候不该能点卡上的行——那张卡在弹窗里）。
 * 分开之后，「关掉这个顺手关掉那个」这类串台从结构上就不可能发生。
 *
 * 带上 `character` 而不是只带 id：快速修改要读现值来填那几格，`roster` 里那一份
 * 就是点开那一刻的，不另存快照——保存时算出来的新整份会按 id 整条替换。
 */
const quicking = ref<{ character: CharacterData; target: QuickTarget } | null>(null);

function openQuick(character: CharacterData, target: QuickTarget) {
    quicking.value = { character, target };
}

/* 快速修改的保存：与编辑器、截图识别共用 `update()`，写入路径只有这一条。
 * `applyQuick` 已经返回**完整的一份**（只替换那一项），所以这里不必再合并。 */
function onQuickSave(next: CharacterData) {
    update(next);
    quicking.value = null;
}

const isNew = computed(() => {
    const draft = editing.value;
    return draft !== null && !roster.value.some((item) => item.id === draft.id);
});

function startNew() {
    editing.value = emptyCharacter();
}

function onSave(character: CharacterData) {
    if (isNew.value) add(character);
    else update(character);
    editing.value = null;
}

/* 截图识别：认完、人点了「应用到这张卡」之后才走到这里。
 *
 * **与编辑弹窗共用 `update`，不另开一条写库路径**：那次写入要过 `persist()` 的
 * 全部闸门（读失败不写、排队写），走别的路等于把那些闸门绕过去。
 *
 * `update` 是整条替换（按 id 找到那一格），所以传进去的是**合并后的整份**角色卡
 * ——`applyAttrPanel` 保证除了认出来的那几项，其余一个字都没动。 */
function onScanApply(character: CharacterData) {
    update(character);
    scanning.value = null;
}

/* 删角色要问一次：名册删掉就没有回收站。问句与后果在这里，卡上只负责把这枚按钮画出来
 * ——二次确认全站只有一个入口（`askConfirm()`），卡上再自绘一套「按钮就地改名」，
 * 就会出现第二种问法、时限、文案、误触保护各写一遍。
 *
 * **有目标引用他时必须说出来**（用户 2026-11-05 定）：目标的成员是建目标那一刻的快照，
 * 人删了之后卡片上那一行会变成「已删除」并不再计入分母——不说的话，用户是在回到目标页
 * 时才发现「5 个角色达标」变成了「4 个角色达标」。 */
async function askRemove(character: CharacterData) {
    const name = character.name || '这个角色';
    const related = goalsOfCharacter(character.id);
    const titles = related
        .slice(0, 3)
        .map((goal) => `「${goal.title}」`)
        .join('、');
    const ok = await askConfirm({
        title: `删掉「${name}」？`,
        note: related.length
            ? `删了之后名册里就没有这个人了，没法撤回。他还在 ${related.length} 个目标里` +
              `（${titles}${related.length > 3 ? ' 等' : ''}）——删掉后那些目标不再计入他。`
            : '删了之后名册里就没有这个人了，没法撤回。',
        confirmText: '删除',
    });
    if (!ok) return;

    remove(character.id);
}

/* 页头的副标题读的是**名册自己**的状态：几个号、存在哪。
 * 原先写「演示数据 · 先定版式，功能随后」，那句话现在是假的。 */
const desc = computed(() =>
    roster.value.length
        ? `${roster.value.length} 个角色 · 存在本机`
        : '还没有角色 · 点下面那一格开始',
);
</script>

<template>
    <PageShell title="角色" :desc="desc">
        <template #actions>
            <!-- 原先这里还有一枚禁用的「识别游戏窗口」（占位，注释写着「OCR 是下一步」）。
                 2026-11-07 截图识别接上之后它被删掉：那个占位说的是「点我会识别」，
                 而它点不动——现在页面上真有一个能用的识别入口（每张卡头上那枚），
                 留着它只会让人以为「识别这个功能坏了」。直接抓游戏窗口那条路
                 要回来时，它该带着实现一起回来。 -->
            <!-- 读失败时底层拒绝一切写入（`persist()` 的闸），所以这枚按钮必须一起禁用：
                 让它可点等于让用户一路填完再被静默丢掉，那比不能点更伤人。 -->
            <PressButton
                icon="add"
                text="新角色"
                label="新建角色"
                seal
                :disabled="!!loadError"
                @click="startNew"
            />
        </template>

        <!-- 数据层的那一行红字：`loadError` 是「整份读不出」，`writeError` 是「刚那一笔没写进去」。
             两者都必须显示——读失败时名册本来就是空的，用户看到的是一张空页，不说清楚就会以为
             「角色都没了」然后重填一遍；而底层此刻拒绝写入，他重建的东西同样存不下去。
             样式只用现成的 `.note.error`（`base.css` 的朱色状态），不新造类。 -->
        <p v-if="loadError || writeError" class="note error">{{ loadError || writeError }}</p>

        <div class="roster">
            <!-- `quick`：点卡上的行 / 格就开「快速修改」。开关状态在**页面**这一层
                 （`quicking`），卡片只把「点了什么」抛上来——卡是循环渲染的，
                 每张卡各存一个弹窗状态就等于开了 N 个窗。 -->
            <CharacterCard
                v-for="character in roster"
                :key="character.id"
                :character="character"
                quick
                @edit="editing = character"
                @scan="scanning = character"
                @remove="askRemove(character)"
                @quick="(target) => openQuick(character, target)"
            />

            <!-- 空位卡与角色卡同高：名册的行高由最高那张决定，缺一角会让整行看着没排完。
                 它同时是「新角色」的第二个入口——名册空着的时候，页头那枚按钮之外
                 这里还有一整格可点，不至于对着一片空白找不到开始的地方。
                 **所以它也得跟页头那枚同进退**：读失败时名册被清成空，这一格恰好会露出来，
                 不禁用就成了「页头点不动、这里能点进去」，用户填完一整份再被 `persist()` 的闸丢掉。 -->
            <button
                class="char-blank"
                type="button"
                aria-label="新建角色"
                :disabled="!!loadError"
                @click="startNew"
            >
                <span class="plus">＋</span>
                <span class="blank-text">新角色</span>
            </button>
        </div>

        <CharacterEditor
            v-if="editing"
            :character="editing"
            :is-new="isNew"
            @save="onSave"
            @cancel="editing = null"
        />

        <OcrDialog
            v-if="scanning"
            :character="scanning"
            @apply="onScanApply"
            @close="scanning = null"
        />

        <QuickEdit
            v-if="quicking"
            :character="quicking.character"
            :target="quicking.target"
            @save="onQuickSave"
            @close="quicking = null"
        />
    </PageShell>
</template>

<style scoped>
/* 卡片的尺寸现在是**令牌**（`tokens.css` 的 `--char-w` / `--char-h`，450 × 620）：
 * 2026-11-07 截图识别的预览也要画同一张卡，两处各写一份就会「名册改了 460，预览
 * 还停在 450」——这两张卡从不并排出现，改完谁也看不出来。450 与 620 的反推过程
 * （最小窗口、三次抬高）也一并搬到了那边，这里只剩名册自己的排法。
 */
.roster {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    /* 14 与 `.stack` / `.hunt` 同一档：卡与卡之间的距离在全站只有一个数。
     * 原先是 16，与设置页、捉鬼页的 14 差 2px——单独看没感觉，切页时会觉得
     * 角色页的几张卡「更松一点」，却说不出为什么。 */
    gap: 16px;
    width: 100%;
}

.char-blank {
    display: grid;
    place-items: center;
    /* 两行居中：不写 `align-content` 会按 stretch 把两行各拉一半，
     * 看起来是上下两个孤零零的字。 */
    align-content: center;
    gap: 8px;
    flex: none;
    width: var(--char-w);
    height: var(--char-h);
    /* 圆角与 `.board`（`PaperCard`）同曲率：旁边那几张是真纸片，这一格是
     * 「还空着、可以再放一张」的位置。方角会读作「那一圈的纸没铺完」。 */
    border: var(--w-hair) dashed var(--rule-2);
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
/* 悬停规则必须带 `:not(:disabled)`：`.char-blank:hover` 与 `.char-blank:disabled`
 * 同为 (0,2,0)，写成相邻两条时靠先后取胜，改一次顺序就反弹成「禁用却还会泛朱」。
 * 显式排除比依赖顺序稳。 */
.char-blank:hover:not(:disabled) {
    border-color: var(--cinnabar);
    color: var(--cinnabar);
}
/* 禁用态不靠 opacity：虚线本就淡，压透明度会糊成一片灰。
 * 线退一档（`--rule-2` → `--rule`）+ 光标换成 not-allowed，说得清又不脏。 */
.char-blank:disabled {
    border-color: var(--rule);
    color: var(--muted);
    cursor: not-allowed;
}
.char-blank .plus {
    /* 那个「+」没有对应的字号档，但必须跟着 `--fs-scale` 走：
     * 写死 26px 时「较大」档下它会显得比旁边的说明字还小。
     * 1.5 倍是跟着卡一起长大的：450 × 540 的格子里，26px 的加号像一个落单的符号。 */
    font-size: calc(var(--fs-xl) * 1.5);
    line-height: 1;
}
.char-blank .blank-text {
    font-size: var(--fs-base);
    letter-spacing: 0.1em;
}
</style>

<script setup lang="ts">
import SaveNotice from '../components/SaveNotice.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRouteAction } from '../composables/use-route-action';
import PageShell from '../components/PageShell.vue';
import PressButton from '../components/PressButton.vue';
import { usePersistedSubmit } from '../composables/use-persisted-submit';
import { useConfirmedRemoval } from '../composables/use-confirmed-removal';
import CharacterCard from './characters/CharacterCard.vue';
import CharacterEditor from './characters/CharacterEditor.vue';
import QuickEdit from './characters/quick/QuickEdit.vue';
import type { QuickTarget } from './characters/quick/quick-target';
import { PANES, type CharacterData, type PaneKey } from './characters/character';
import { emptyCharacter, useRoster } from './characters/roster';
import { goalsOfCharacter } from './goals/goals-store';
import { gameDataError, gameDataLoading, gameDataReady, loadGameData } from '../services/game-data';

/**
 * 角色页 —— 名册。
 *
 * 数据来自 `roster.ts`：桌面版读写 SQLite，浏览器预览读写 localStorage。
 * 桌面空库保持空名册；游戏规则首次加载失败时保留查看，重试成功后开放修改。
 *
 * 卡宽写死 420 而不是 `minmax(…, 1fr)`：一用伸缩列，卡片会随窗口各自拉宽到 600+，
 * 又回到「一条横贯屏幕的长卡」——游戏里的人物面板从来不是那个比例。
 * 420 是观感定值（见 `tokens.css` 的 `--char-w`，450 → 420 → 400 → 420 的来回记在那边），
 * 1280 与 1024 下都是一行两张。
 *
 * 页头只剩一枚按钮（新角色），走 `PressButton` 的 `seal` 变体——块面灌朱、一屏一枚。
 * 卡头的修改入口与新建共用 `CharacterEditor`，手工录入与截图识别在同一份草稿里完成。
 *
 * **这枚用默认档 `md`（26px），不写 `size="lg"`**（2026-11-03 改）。页头高度是
 * `--page-head-h` = 19 + 字号 × 1.15 + 1（1.1 档实测 47.8）；`lg` 是 31，加上下
 * padding 19 就到 50，页头被这枚按钮顶高一截，与本页内容区、左栏牌记、其余无按钮的
 * 页面全部对不上。`md` 三档字号下都低于页头自然高度（42.9 / 45 / 47.6 < 43.3 / 45.3 / 47.8），
 * 页头高度才重新由令牌说了算。
 */
const { roster, loadError, writeError, pending, flush, retry, add, update, remove } = useRoster();
const route = useRoute();
watch(
    () => route.query.character,
    async (id) => {
        if (typeof id !== 'string') return;
        await nextTick();
        const card = document.getElementById('character-' + id);
        if (!card) return;
        card.scrollIntoView({ block: 'start', inline: 'nearest' });
        card.focus({ preventScroll: true });
    },
    { immediate: true, flush: 'post' },
);
const submission = usePersistedSubmit(flush, retry);
const { saving, locked, action } = submission;
const removal = useConfirmedRemoval(
    () => pending.value > 0 || Boolean(loadError.value || writeError.value) || !gameDataReady.value,
    flush,
);
const { removing } = removal;
const editingDisabled = computed(
    () => !!loadError.value || !gameDataReady.value || pending.value > 0 || removing.value,
);

function openEditor(character: CharacterData, pane: PaneKey) {
    if (editingDisabled.value) return;
    submission.reset();
    editing.value = { character, pane, isNew: false };
}

async function retryGameData() {
    await loadGameData();
}

/** 新建或修改由打开时固定，内存先新增而落盘失败时仍保持新建模式。 */
const editing = ref<{ character: CharacterData; pane: PaneKey; isNew: boolean } | null>(null);

/**
 * 正在「快速修改」的那一项，`null` = 关着。
 *
 * 与整份角色编辑分开保存状态，旧窗口的异步保存不能关闭后来打开的窗口。
 *
 * 带上 `character` 而不是只带 id：快速修改要读现值来填那几格，`roster` 里那一份
 * 就是点开那一刻的，不另存快照——保存时算出来的新整份会按 id 整条替换。
 */
const quicking = ref<{ character: CharacterData; target: QuickTarget } | null>(null);

function openQuick(character: CharacterData, target: QuickTarget) {
    if (editingDisabled.value) return;
    submission.reset();
    quicking.value = { character, target };
}

/* 快速修改的保存：与编辑器共用 `update()`，写入路径只有这一条。
 * `applyQuick` 已经返回**完整的一份**（只替换那一项），所以这里不必再合并。 */
async function onQuickSave(next: CharacterData) {
    if (pending.value > 0 || editingDisabled.value) return;
    const source = quicking.value;
    if (!source) return;
    const ok = await submission.run('save', () => {
        update(next);
        return true;
    });
    if (ok && quicking.value === source) closeQuick();
}

function closeEditor() {
    if (saving.value) return;
    editing.value = null;
    submission.reset();
}

function closeQuick() {
    if (saving.value) return;
    quicking.value = null;
    submission.reset();
}

function startNew() {
    if (editingDisabled.value) return;
    submission.reset();
    editing.value = { character: emptyCharacter(), pane: 'attrs', isNew: true };
}

async function onSave(character: CharacterData) {
    if (pending.value > 0 || editingDisabled.value) return;
    const source = editing.value;
    if (!source) return;
    const ok = await submission.run('save', () => {
        if (source.isNew) add(character);
        else update(character);
        return true;
    });
    if (ok && editing.value === source) closeEditor();
}

/* 删角色要问一次：名册删掉就没有回收站。问句与后果在这里，卡上只负责把这枚按钮画出来
 * ——二次确认全站只有一个入口（`askConfirm()`），卡上再自绘一套「按钮就地改名」，
 * 就会出现第二种问法、时限、文案、误触保护各写一遍。
 *
 * **有目标引用他时必须说出来**（用户 2026-11-05 定）：目标的成员是建目标那一刻的快照，
 * 人删了之后卡片上那一行会变成「已删除」并不再计入分母——不说的话，用户是在回到目标页
 * 时才发现「5 个角色达标」变成了「4 个角色达标」。 */
async function askRemove(character: CharacterData) {
    if (editingDisabled.value) return;
    const name = character.name || '这个角色';
    const related = goalsOfCharacter(character.id);
    const titles = related
        .slice(0, 3)
        .map((goal) => `「${goal.title}」`)
        .join('、');
    await removal.run(
        {
            danger: true,
            title: `删掉「${name}」？`,
            note: related.length
                ? `删了之后名册里就没有这个人了，没法撤回。他还在 ${related.length} 个目标里` +
                  `（${titles}${related.length > 3 ? ' 等' : ''}）——删掉后那些目标不再计入他。`
                : '删了之后名册里就没有这个人了，没法撤回。',
            confirmText: '删除',
        },
        () => remove(character.id),
    );
}

/* 页头的副标题读的是**名册自己**的状态：几个号、存在哪。
 * 原先写「演示数据 · 先定版式，功能随后」，那句话现在是假的。 */
const desc = computed(() =>
    roster.value.length
        ? `${roster.value.length} 个角色 · 存在本机`
        : '还没有角色 · 点下面那一格开始',
);
useRouteAction({
    new: startNew,
    edit(query) {
        const character = roster.value.find((one) => one.id === query.character);
        const pane = PANES.find((one) => one.key === query.pane)?.key ?? 'attrs';
        if (character) openEditor(character, pane);
    },
});
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
                :disabled="editingDisabled"
                @click="startNew"
            />
        </template>

        <!-- 数据层的那一行红字：`loadError` 是「整份读不出」，`writeError` 是「刚那一笔没写进去」。
             两者都必须显示——读失败时名册本来就是空的，用户看到的是一张空页，不说清楚就会以为
             「角色都没了」然后重填一遍；而底层此刻拒绝写入，他重建的东西同样存不下去。
             样式只用现成的 `.note.error`（`base.css` 的朱色状态），不新造类。 -->
        <p v-if="loadError" class="note error">{{ loadError }}</p>
        <p v-if="!gameDataReady" class="note error" role="alert">
            {{ gameDataError || '正在加载游戏数据，暂时无法修改角色' }}
            <PressButton
                text="重试"
                label="重试加载角色游戏数据"
                size="sm"
                :disabled="gameDataLoading"
                @click="retryGameData"
            />
        </p>
        <SaveNotice
            v-if="!editing && !quicking"
            :error="writeError"
            :pending="pending"
            @retry="retry"
        />

        <div class="roster">
            <!-- `quick`：点卡上的行 / 格就开「快速修改」。开关状态在**页面**这一层
                 （`quicking`），卡片只把「点了什么」抛上来——卡是循环渲染的，
                 每张卡各存一个弹窗状态就等于开了 N 个窗。 -->
            <CharacterCard
                v-for="character in roster"
                :key="character.id"
                :character="character"
                :class="{ 'is-linked': route.query.character === character.id }"
                :quick="!editingDisabled"
                :disabled="editingDisabled"
                @edit="(pane) => openEditor(character, pane)"
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
                :disabled="editingDisabled"
                @click="startNew"
            >
                <span class="plus">＋</span>
                <span class="blank-text">新角色</span>
            </button>
        </div>

        <CharacterEditor
            v-if="editing"
            :key="editing.character.id"
            :character="editing.character"
            :pane="editing.pane"
            :is-new="editing.isNew"
            :saving="saving || pending > 0"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="onSave"
            @cancel="closeEditor"
        />

        <QuickEdit
            v-if="quicking"
            :character="quicking.character"
            :target="quicking.target"
            :saving="saving || pending > 0"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="onQuickSave"
            @close="closeQuick"
        />
    </PageShell>
</template>

<style scoped>
/* 名册卡片与空位共用 tokens.css 的 --char-w / --char-h（420 × 620）。
 * 修改窗右栏另用 --char-editor-w 分配宽度，这里只维护名册排法。 */
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

.roster :deep(.char.is-linked) {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    scroll-margin: 12px;
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
    border-color: var(--accent);
    color: var(--accent);
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
     * 1.5 倍是跟着卡一起长大的：420 × 620 的格子里，26px 的加号像一个落单的符号。 */
    font-size: calc(var(--fs-xl) * 1.5);
    line-height: 1;
}
.char-blank .blank-text {
    font-size: var(--fs-base);
    letter-spacing: 0.1em;
}
</style>

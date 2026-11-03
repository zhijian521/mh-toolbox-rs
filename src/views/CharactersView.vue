<script setup lang="ts">
import { computed, ref } from 'vue';
import PageShell from '../components/PageShell.vue';
import PressButton from '../components/PressButton.vue';
import CharacterCard from './characters/CharacterCard.vue';
import CharacterEditor from './characters/CharacterEditor.vue';
import type { CharacterData } from './characters/character';
import { emptyCharacter, useRoster } from './characters/roster';

/**
 * 角色页 —— 名册。
 *
 * 数据来自 `roster.ts`（模块级单例 + `localStorage`），不再是写死的 `mock.ts`：
 * 增删改在这里发生，改完立即落到本机。首次启动没有存储时，那一层会拿 `mock.ts`
 * 里那两个角色做种子——先给一份能改的样例，比一张空页有用。
 *
 * 卡宽写死 450 而不是 `minmax(…, 1fr)`：一用伸缩列，卡片会随窗口各自拉宽到 600+，
 * 又回到「一条横贯屏幕的长卡」——游戏里的人物面板从来不是那个比例。
 * 450 是「最小窗口放得下两张」反推出来的（见下方 `.roster` 的注释），
 * 1280 与 1024 下都是一行两张。
 *
 * 页头两枚按钮走 `PressButton`（压印块）。主操作（新角色）用 `seal` 变体——块面灌朱，
 * 一屏一枚。「识别游戏窗口」还没接上（OCR 是下一步），所以仍然禁用：
 * 一枚点了没反应的按钮比没有更糟。
 *
 * **两枚都用默认档 `md`（26px），不写 `size="lg"`**（2026-11-03 改）。页头高度是
 * `--page-head-h` = 19 + 字号 × 1.15 + 1（1.1 档实测 47.8）；`lg` 是 31，加上下
 * padding 19 就到 50，页头被这两枚按钮顶高一截，与本页内容区、左栏牌记、其余无按钮的
 * 页面全部对不上。`md` 三档字号下都低于页头自然高度（42.9 / 45 / 47.6 < 43.3 / 45.3 / 47.8），
 * 页头高度才重新由令牌说了算。
 */
const { roster, add, update, remove } = useRoster();

/* 正在编辑的草稿，`null` = 浮层关着。**不另存一个 `isNew` 布尔**：
 * 「这是新角色还是改旧的」由「名册里有没有这个 id」现算，两个状态分开维护，
 * 总有一次会不同步（保存完忘了清、取消时先清了一个）。 */
const editing = ref<CharacterData | null>(null);

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
            <PressButton
                icon="search"
                text="识别游戏窗口"
                label="识别游戏窗口（还没接上）"
                disabled
            />
            <PressButton icon="add" text="新角色" label="新建角色" seal @click="startNew" />
        </template>

        <div class="roster">
            <CharacterCard
                v-for="character in roster"
                :key="character.id"
                :character="character"
                @edit="editing = character"
                @remove="remove(character.id)"
            />

            <!-- 空位卡与角色卡同高：名册的行高由最高那张决定，缺一角会让整行看着没排完。
                 它同时是「新角色」的第二个入口——名册空着的时候，页头那枚按钮之外
                 这里还有一整格可点，不至于对着一片空白找不到开始的地方。 -->
            <button class="char-blank" type="button" aria-label="新建角色" @click="startNew">
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
    </PageShell>
</template>

<style scoped>
/* 卡片的尺寸在这里定一次，真卡与空位卡都读它（`character-card.css` 读 `--char-w`）。
 * 写在这个父级上是因为「同一行的卡片必须一样大」是**名册**的事，不是单张卡的属性。
 *
 * ---- 这两个数是被「最小窗口 + 最大字号」定的 ----
 * 用户的要求是「窗口最小、字号最大时能完整展示两张卡」。实测那个条件是 1024 × 780、
 * `--fs-scale: 1.1`，名册可用宽度 **937**（窗口 1024 − 侧栏 − 页面留白 − 滚动条）。
 * 于是两张卡的宽度上限 = (937 − 14) / 2 = 461.5。取 **450** 而不是 460：
 * 460 只剩 3px 余量，滚动条一宽一窄、或设备像素取整一变，第二张就被挤到下一行
 * ——那正好是这条要求要防的事。450 留 23px。
 *
 * 高度 **580**，不是按宽度等比的 600。等比的前提是内容也跟着放大，而卡里的字号是全站
 * 的 `--fs-*`、不随卡片变——450 × 600 时属性页只用了上半屏，注脚被 `margin-top: auto`
 * 压到底，中间空出 96px 的洞（实测）。540 是当时的洞刚好收掉的高度；
 * **2026-11-02 属性页多了一组「潜能」（乾元丹 / 潜能果，通栏一行）**，1.1 字号档实测
 * 溢出 27px（经验条被裁掉半截），按内容抬到 580——该档留 13px 余量，1.0 档约 39。
 * 1024 × 780 下页头 110 + 580 = 690 < 780，两张仍完整。
 * 比例 450 / 580 ≈ 0.78，比原先的 0.83 更接近游戏面板（0.75），因为属性页现在真是
 * 20 行 + 经验条，不是 18 行。
 *
 * 1280 窗口（内容区约 1121）下仍是两张一行——**这是放大卡片换来的**：
 * 三张要 1378，放不下了。五开五个号会排三行，这是已知代价。
 */
.roster {
    --char-w: 450px;
    --char-h: 580px;

    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    /* 14 与 `.stack` / `.hunt` 同一档：卡与卡之间的距离在全站只有一个数。
     * 原先是 16，与设置页、捉鬼页的 14 差 2px——单独看没感觉，切页时会觉得
     * 角色页的几张卡「更松一点」，却说不出为什么。 */
    gap: 14px;
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
    border: var(--w-hair) dashed var(--rule-2);
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
.char-blank:hover {
    border-color: var(--cinnabar);
    color: var(--cinnabar);
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

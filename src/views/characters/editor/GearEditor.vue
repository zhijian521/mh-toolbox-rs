<script setup lang="ts">
import { computed, ref } from 'vue';
import PressTile from '../../../components/PressTile.vue';
import IconTile from '../IconTile.vue';
import EditorRail from './EditorRail.vue';
import GearDetailForm from './GearDetailForm.vue';
import type { RailItem } from './rail';
import { GEAR_SLOT_ICON, type GearDetail, type GearSlot, type GearSlotName } from '../character';
import { gearSlotIcon } from '../../../services/game-icons';

/**
 * 装备：**左栏常驻十二个部位，右侧只编选中的那一件**（2026-11-05 改，方案 E2）。
 *
 * 旧版是十二行折叠：一行一件，点箭头展开这一件的六段详情。
 * 换掉它的理由只有一个，但很硬——**换一件要看的东西会重新排一次版**。
 * 折叠列表里，展开第二件时第一件收起，下面所有内容整体上移几百像素，
 * 视线得重新找「类型在哪一行」；录入十二件就是重找十二次。
 *
 * 现在左栏十二行是**固定的**（高度不变、顺序不变），右侧只换内容。
 * 顺带解决了三件事：
 *   · 一行一个「已填/没穿」的点，加上顶端「9 / 12」，空着哪几件一眼数得出；
 *   · 每行一枚 22 的小白盘（与卡上同一枚的缩小版），部位不必读字就认得出；
 *   · 顶部把「部位 + 装备名」提成标题行——卡上显示的就是装备名，它该是主字段。
 *
 * **两栏各自滚**（2026-11-06 用户：「左右部分滚动不联动」）：右栏比左栏长得多，
 * 原来两栏跟着外层一起走，滚到底部时左栏早不知去哪了。现在整页铺满可视高度
 * （`CharacterEditor` 的 `.editor-fill`），右栏自己滚、左栏几乎不动。
 * 左栏的 `sticky` 因此在同一天删掉——它当初就是为了这件事。
 *
 * 行尾那枚 × 是「清空这一件」，只在填了的部位上出现（见 `clearByKey`）：
 * 十二个部位是游戏定的、卡上一格一个，所以这里没有「新增」，只有「清空重填」。
 */
const gear = defineModel<GearSlot[]>({ required: true });

/** 当前编辑的部位。默认落在**第一个填了的**部位上——打开就看见内容，而不是空表。 */
const selected = ref<string>(
    gear.value.find((slot) => filled(slot))?.slot ?? gear.value[0]?.slot ?? '',
);

const active = computed(() => gear.value.find((slot) => slot.slot === selected.value) ?? null);

/**
 * 「这件填了没有」——**不只看 `detail` 在不在**，看它有没有内容。
 *
 * 选中部位时会先建一个空壳（见 `select`），于是「点过一圈」会留下十二个空壳：
 * 壳在，但一个字都没填。若按「壳存在」判断，右上角会显示 12 / 12、十二个点全实心，
 * 而卡上一件都不会显示——同一个数据两种说法。
 *
 * **装备名要先单独看一眼**（2026-11-06 烟测抓到）：它 v-model 在 `slot.caption` 上，
 * 不在 `detail` 里；而保存时 `normalizeCharacter` 会把「只有简称、没有详情」的壳丢掉。
 * 原先这里头一句是 `if (!d) return false`，于是重载之后**只填了装备名的那一件**
 * 在卡上看得见、在左栏里却既不亮也不计数（`0 / 12`），连那枚 × 都拿不到——
 * 想清空都没地方点。
 */
function filled(slot: GearSlot): boolean {
    if (slot.caption?.trim()) return true;
    const d = slot.detail;
    if (!d) return false;
    return Boolean(
        d.name?.trim() ||
        d.kind?.trim() ||
        d.stats.length ||
        d.cond?.length ||
        d.lines?.length ||
        d.flavor?.trim() ||
        d.foot?.trim(),
    );
}

const filledCount = computed(() => gear.value.filter((slot) => filled(slot)).length);

/**
 * 换部位。离开之前把上一件的**空壳**删掉（`normalizeCharacter` 保存时本来也会丢，
 * 但编辑期间它会让点与计数失灵）。空壳的判据与 `filled` 同一条：
 * 有一个字就不算空壳，正在填的那件不会被误删。
 */
function select(slot: GearSlot) {
    if (selected.value === slot.slot) return;
    const previous = gear.value.find((row) => row.slot === selected.value);
    if (previous?.detail && !filled(previous)) delete previous.detail;
    selected.value = slot.slot;
    ensureDetail(slot);
}

/** 左栏抛上来的是 `key`（部位名），这里翻回那一行。找不到就什么都不做——
 *  十二行与 `GEAR_SLOTS` 同源，理论上不会缺，但静默比崩掉好。 */
function selectByKey(key: string) {
    const slot = gear.value.find((row) => row.slot === key);
    if (slot) select(slot);
}

/**
 * 清空一件：左栏行尾那枚 × 的动作（2026-11-06 用户：「都可以删除新增」，
 * 装备这一侧的答案是「在对应位置上清空重新输入」）。
 *
 * 「清空」= 回到「这个部位没穿」——装备名清掉、详情整份删掉。**不是删掉这一行**：
 * 十二个部位是游戏定的、卡上 4×4 一格一个，行不能少，只能空。
 *
 * 正在编辑的那一件要留一个**空壳**（`ensureDetail`）：右侧的装备名、类型、属性
 * 都绑在 `detail` 上，删干净之后表单就没了绑定对象，清空之后反而没法重新输入。
 * 不在这页的那几件直接删壳，少留一份垃圾（`normalizeCharacter` 保存时本来也会丢，
 * 但编辑期间它会让点与计数失灵——见 `select` 里同一条）。 */
function clearByKey(key: string) {
    const slot = gear.value.find((row) => row.slot === key);
    if (!slot) return;
    slot.caption = '';
    delete slot.detail;
    if (slot.slot === selected.value) ensureDetail(slot);
}

/* 壳是临时的：`name` 预填装备名（卡上那个简称），这样「全名」不必再敲一遍；
 * 没有就留空。`stats` 建空数组（下面要 `v-for`），`cond` / `lines` 保持缺席——
 * 一件装备可能没有状态也没有套装，先建两个空数组等于给每件都塞两个空键。 */
function ensureDetail(slot: GearSlot): GearDetail {
    slot.detail ??= {
        name: slot.caption ?? '',
        kind: '',
        stats: [],
    };
    return slot.detail;
}

// 初始选中那件也要有壳，否则右侧的类型、属性没有地方可绑。
if (active.value) ensureDetail(active.value);

/* 图标按**部位**取（表见 `character.ts` 的 `GEAR_SLOT_ICON`），与卡上同一枚。
 * 图库是品类样图，玩家那件装备多半不在里面，所以不按装备名查。 */
function slotIcon(slot: GearSlotName): string | undefined {
    const file = GEAR_SLOT_ICON[slot];
    return file ? gearSlotIcon(file) : undefined;
}

/* 没图的部位（武器、玉魄）画一枚**淡墨首字**，与卡上同构：装备名首字，
 * 没名就用部位首字。左栏这么小，认的是「这格有没有东西」，不是认字。 */
function slotInitial(slot: GearSlot): string {
    const name = slot.caption?.trim();
    return (name ? name[0] : slot.slot[0]) ?? '';
}

/**
 * 左栏的行数据。`EditorRail` 只管画，这里负责把「十二个部位 + 填没填」翻译过去。
 *
 * 两处细节都在这一层解决，控件那边不认部位这回事：
 *   · 有图的部位给 `icon`，没图的给 `mark` 且 `tile: true`（换成压印块上的首字）；
 *   · `label` 是给读屏的整句话——只念「武器」，听不出这一行是干什么的。
 */
const railItems = computed<RailItem[]>(() =>
    gear.value.map((slot) => {
        const icon = slotIcon(slot.slot);
        const has = filled(slot);
        return {
            key: slot.slot,
            name: slot.slot,
            label: `编辑${slot.slot}的装备`,
            filled: has,
            icon,
            mark: icon ? undefined : slotInitial(slot),
            tile: !icon,
            /* × 只在**填了的部位**上出现：空行没什么可清，点了只会白写一次库。
             * 装备部位是游戏固定的（卡上 4×4 一格一个、行不能少），所以这里没有
             * 「新增」，只有「在原来的位置上清空重填」——这也是用户那一轮
             * 「都可以删除新增」在装备这侧唯一说得通的落法（召唤兽那边才是真删）。 */
            kill: has ? `清空${slot.slot}这一件` : undefined,
        };
    }),
);
</script>

<template>
    <div class="gear-editor">
        <!-- 十二个部位**常驻**左栏。它是这张表单的目录：从上到下就是游戏面板的顺序，
             高度不变，所以「我在改哪一件」由位置回答，不用读标题。
             行高 34 由 `EditorRail` 的默认值给（2026-11-06 两页统一），十二行 = 476，
             一屏放得下；行尾那个 × 是「清空这一件」。 -->
        <EditorRail
            label="装备"
            :count="filledCount"
            :suffix="` / ${gear.length}`"
            :items="railItems"
            :selected="selected"
            @pick="selectByKey"
            @kill="clearByKey"
        />

        <div v-if="active" class="pane-detail well upright">
            <!-- 标题行：部位 + 装备名。卡上显示的就是这个简称，所以它是主字段；
                 全名、类型、条件退到下面一行——主次分开，不必在六个框里找「哪个是名字」。 -->
            <div class="det-top">
                <IconTile
                    v-if="slotIcon(active.slot)"
                    class="det-pic"
                    :src="slotIcon(active.slot)"
                />
                <PressTile v-else class="det-pic" still aria-hidden="true">
                    <span class="det-ini">{{ slotInitial(active) }}</span>
                </PressTile>
                <div class="det-head">
                    <div class="det-title">
                        <b>{{ active.slot }}</b>
                        <span>装备名 · 填了就会显示在卡上</span>
                    </div>
                    <input
                        v-model="active.caption"
                        class="field det-name"
                        :aria-label="`${active.slot} 的装备名`"
                        placeholder="装备名（留空 = 这个部位没穿）"
                    />
                </div>
            </div>

            <GearDetailForm v-if="active.detail" v-model="active.detail" />
        </div>
    </div>
</template>

<style scoped>
/* 左右两栏：左栏 152 是量出来的——最长的部位名「玉魄 · 阴」在 12px 下 56 宽，
 * 加一枚 22 的盘、8 的间距、右侧的点与两边留白，正好在这个数上收口。
 * 再窄，「玉魄 · 阴」就要换行；再宽，右侧四列属性行会被挤到放不下精炼上限。
 * 左栏本体在 `EditorRail.vue`（与召唤兽共用一套），这里只放两栏的栅格。
 *
 * **两栏各是一道竖槽**（2026-11-06 用户：「参考开发帮助原子组件左右结构布局样式……
 * 左右两边的背景样式保持一致」）。原先是「左栏裸着 + 右栏一条 `border-left`」，
 * 左边一片纸、右边一片纸，只在中间划一道线——读起来是「一张表单被划开了」；
 * 两边各自凹进去之后，才是**同一层架子上的两列**，与开发页那一对完全同构。
 *
 * 间距 14 → 12（与开发页同值）：两块槽之间只隔一道气口，宽了就成了三块东西。 */
.gear-editor {
    display: grid;
    /* 两栏等高（`stretch`，默认值）：槽是「一列」，不该一高一矮。右栏比目录长
     * （装备详情约 690），多出来的那截是**空槽**——那是这一栏的底，不是没排完。 */
    grid-template-columns: 152px minmax(0, 1fr);
    gap: 12px;
    /* 铺满内容区的可视高度，**两栏各自滚**（2026-11-06 用户：「左右部分滚动不联动」）。
     * 原来这里是 `align-items: start` + 外层 `.editor-body` 一起滚，右栏滚到底时
     * 左栏早不知滚到哪去了。高度 100% 由 `CharacterEditor` 的 `.editor-fill` 撑起来
     * （那一段 section 有确定高度，百分比才有意义）。 */
    height: 100%;
    min-height: 0;
}

/* 右侧详情：**与左栏同一道竖槽**（模板上的 `well upright`），只给内衬与圆角。
 * 深度（`--well` 底、左壁暗、顶口影、右沿与下沿的亮线、一圈褐边）由 `base.css`
 * 那一处说了算，这里一行都不抄。
 *
 * 那条 `border-left` 已删：两块槽之间的界线由槽自己的边交代，
 * 再画一道就成了「槽里还套着一条线」。
 *
 * 滚动条让位用 `scrollbar-gutter: stable`：装备详情一直比可视区高，轨道常驻，
 * 切到召唤兽（不需要滚）时内容宽度也不跳——否则两页来回切会看见整块抖一下。 */
.pane-detail {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px 8px;
    border-radius: var(--r-2);
    overflow: auto;
    scrollbar-gutter: stable;
}
.det-top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
/* 右侧那枚 38 的盘。选择器写成 `.det-top .det-pic` 而不是单个 `.det-pic`：
 * `IconTile` 内部 `.icon-tile` 也声明了这几个变量，两边同特异性时谁赢取决于
 * 样式注入顺序——多带一层父选择器才稳（左栏那枚 22 的盘同一条，写在
 * `EditorRail.vue` 的 `.rail-item .rail-pic` 里）。 */
.det-top .det-pic {
    --tile-w: 38px;
    --tile-h: 38px;
    --tile-r: var(--r-2);
    --shot: 30px;
    --tile-drop: 0.55;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
}
.det-ini {
    color: color-mix(in srgb, var(--ink-2) 78%, transparent);
    font-size: calc(18px * var(--fs-scale));
    line-height: 1;
}
.det-head {
    flex: 1;
    min-width: 0;
}
.det-title {
    display: flex;
    align-items: baseline;
    gap: 7px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.14em;
}
.det-title b {
    color: var(--ink);
    font-size: var(--fs-md);
    font-weight: 400;
    letter-spacing: 0.06em;
}
/* 装备名是主字段：比常规输入格高一档（30 对 26），字大一档。
 * 选择器同样多带一层 `.det-head`：`.field` 也声明 height / line-height，
 * 单类压不过「谁后注入」（`.field` 在 base.css，通常在前，但这条不该靠顺序）。 */
.det-head .det-name {
    width: 100%;
    height: calc(30px * var(--fs-scale));
    margin-top: 4px;
    font-size: var(--fs-base);
    line-height: calc(28px * var(--fs-scale));
}
</style>

<script setup lang="ts">
import PaperCard from '../../components/PaperCard.vue';
import { computed, ref } from 'vue';
import MeterBar from '../../components/MeterBar.vue';
import NumTag from '../../components/NumTag.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import AssistIcon from './AssistIcon.vue';
import GearTip from './GearTip.vue';
import IconTile from './IconTile.vue';
import PetDetail from './PetDetail.vue';
import SkillRow from './SkillRow.vue';
import {
    GEAR_LAYOUT,
    GEAR_SLOT_ICON,
    PANES,
    expPercent,
    isMaxed,
    joinShort,
    lifeLow,
    previewSkills,
    previewStats,
    type CharacterData,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
    type PaneKey,
    type Pet,
} from './character';
import { gearSlotIcon } from '../../services/game-icons';

/**
 * 一张角色卡：**一张纸上的六个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡宽只有 450，侧栏一挤就变成第三列；
 * 而且名册一行要放两张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 620（`--char-h`）：同一行的卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（召唤兽）底下会空一块——那里就只是留白，不再压一句页脚说明
 * （2026-11-03 用户要求删掉卡片上所有手抄的注脚）。
 *
 * 六个页签均分卡宽：`(450 − 28 − 4) / 6 ≈ 69.7` 一格，最长的「召唤兽」三个字
 * 在 1.1 字号档约 46px，余量 23。卡宽一改就要重算这个数，**仍是六格封顶**——
 * 再加第七个得改文案或改成两行。
 *
 * 页签里的「凹槽 + 选中灌朱」不在这里重写：它是 `SteppedSlider` 的 `as="tab"`——
 * 六格等分、印按格位移、方向键换页签全在那边，本组件只给它 `options` 与 `prefix`。
 * 早先这里是六个 `.bevel-pill`（各自一枚按钮，选中即灌朱），换掉的理由不是好看：
 * 六个胶囊在同一块板上读作「六个独立开关」，而它们实际是**一条轨道上的六个落点**。
 *
 * 装备**格子**不再是 `PressTile`（2026-11-04 随 4 × 4 重排改）：那块凸起的纸读作
 * 「已经拿出来摆着的一件东西」，而格子是「往里放」的槽，凹才对。现在用全局 `.well`
 * 的四件套，与页签那条轨道同一个光向。**格子里的图标仍是一块压印块**（`IconTile`，
 * 与师门、辅助同款）：凹说的是「这是个位置」，凸说的是「位置上放着一件」。
 */
const props = defineProps<{ character: CharacterData }>();
const emit = defineEmits<{ edit: []; remove: [] }>();

const active = ref<PaneKey>('attrs');

/* 页签的值与文案一次算好：滑块要的是 `{ value, label }[]`，而 `PANES` 是只读元组，
 * 直接在模板里 `map` 会每次渲染新建一个数组，`useRovingFocus` 的 `values()` 也随之变。 */
const PANE_OPTIONS = PANES.map((pane) => ({ value: pane.key, label: pane.label }));

function choose(key: PaneKey) {
    active.value = key;
    closeAll();
}

/* 删除不在这里问第二遍：卡只管画，问句与后果在 `CharactersView` 里走全站那枚 `askConfirm()`。
 * 卡上再自绘一套「按钮就地改名 → 4 秒退回」，就有两个入口、两套文案，
 * 而且「4 秒」这种时限只有这一个地方有，谁也说不清为什么是 4 秒。 */

/* ---------- 浮片：只剩装备一份 ----------
 * 悬停/聚焦 → 量锚点 → 由浮片自己算落位。锚点存 rect 而不是元素：滚动或重建之后
 * rect 就过期了，存元素会让浮片停在旧位置。
 *
 * 召唤兽的那一份（`PetTip`）2026-11-05 退役：它给的是「资质 + 八项属性 + 技能名 +
 * 内丹名」，与详情档案整块重合。同一份内容两个出口，改了一处另一处就静默过期
 * （`GearTip` 的注释里写着同一件事：两处各写一遍，抄到第二遍时就已经漂了）。
 * 现在兽是**点开看详情**，悬停不再停 90ms 才出东西——那一页本来就要点。
 */
const tip = ref<GearDetail | null>(null);
const tipAnchor = ref<DOMRect | null>(null);

function openTip(event: Event, detail: GearDetail) {
    tipAnchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tip.value = detail;
}

function closeAll() {
    tip.value = null;
    tipAnchor.value = null;
}

/* ---------- 召唤兽：概览牌的取数 ----------
 * 五格属性、前四个技能名、参战差额、寿命告警**一次算完**，模板只负责画。
 * 放在 computed 里而不是模板里调函数：模板里 `v-for` 里再调三次 `previewSkills`
 * 会每帧新建三个数组，而这个列表重渲染的频率（切页签、悬停）比想象的高。
 */
const detailPet = ref<Pet | null>(null);

const petViews = computed(() =>
    props.character.pets.map((pet) => ({
        pet,
        short: joinShort(pet, props.character.level),
        stats: previewStats(pet),
        skills: previewSkills(pet),
        lowLife: lifeLow(pet.life),
    })),
);

function openDetail(pet: Pet) {
    closeAll();
    detailPet.value = pet;
}

/* 经验条的两个值：百分比在 `character.ts` 里算（纯函数、有单测），这里只负责文案。
 * 两者都没填就不显示文字——一根空轨道配一个空字符串会把这一行压成一条灰线。 */
const expPercentValue = computed(() =>
    expPercent(props.character.experience.value, props.character.experience.need),
);

/* 门派技能的两件事：**到顶了没有**（组头数几项）、**离顶还有多远**（行底那条刻度）。
 * 两者都是 `character.ts` 里的纯函数，编辑弹窗画刻度时用的是同一份——
 * 同一个 120 在卡上与在弹窗里必须都是六格，各算一次迟早会出现「存完短了一截」。 */

/* 生活与剧情分两段，各自一张格子图。空的那一类不出现——
 * 一个只有生活技能的角色，不该看到一行「剧情技能」然后底下什么都没有。 */
const assistGroups = computed(() =>
    [
        { title: '生活技能', rows: props.character.assists.filter((row) => row.kind === 'life') },
        { title: '剧情技能', rows: props.character.assists.filter((row) => row.kind === 'story') },
    ].filter((group) => group.rows.length > 0),
);

const expText = computed(() => {
    const { value, need } = props.character.experience;
    if (value && need) return `${value} / ${need}`;
    return value || need;
});

/* ---------- 装备格 ----------
 * 位置不在模板里写第几行第几列：`GEAR_LAYOUT` 是那张「游戏面板长什么样」的表
 * （在 `character.ts` 里，与 `GEAR_SLOTS` 分开），这里只把坐标翻译成 CSS。
 * 翻译放在函数里而不是模板的 `:style` 字面量里，是为了让「两处都写一遍行列」这件事
 * 只发生在一个地方——十二行内联样式抄错一个数，界面上没有任何报错。
 */
function cellPos(slot: GearSlotName): { gridColumn: string; gridRow: string } {
    const { col, row } = GEAR_LAYOUT[slot];
    return { gridColumn: String(col), gridRow: String(row) };
}

/* 图标按**部位**取（表见 `character.ts` 的 `GEAR_SLOT_ICON`）：
 * 图库是品类样图，玩家那件装备多半不在里面，所以不按装备名查。 */
function slotIcon(slot: GearSlotName): string | undefined {
    const file = GEAR_SLOT_ICON[slot];
    return file ? gearSlotIcon(file) : undefined;
}

/* 没有图的那几格（武器、玉魄）画一枚**淡印 + 首字**：装备名首字，没名就用部位首字。
 * 不画破图、也不留一块与「空槽」分不开的空白。 */
function slotInitial(slot: GearSlot): string {
    const name = slot.caption?.trim();
    return (name ? name[0] : slot.slot[0]) ?? '';
}
</script>

<template>
    <!-- `data-school` 给浅染用（`character-card.css` 里二十一条映射）。
         空门派时属性为空串，不匹配任何一条 → 卡底回落纸色。 -->
    <PaperCard as="article" class="char dual-rule" :data-school="character.school || ''">
        <header class="char-head">
            <div class="who-block">
                <div class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <!-- 门派空着就不挂签：一个新角色还没填门派，画一个空胶囊
                         比不画更像「这里坏了」。 -->
                    <span v-if="character.school" class="chip school">{{ character.school }}</span>
                </div>
                <!-- 名字下面那行小字：区服 · 帮派。两项各自 `v-if`，
                     只填了一项时不是「A · 」，也不会留下一个空的点。 -->
                <p v-if="character.server || character.guild" class="meta char-sub">
                    <span v-if="character.server">{{ character.server }}</span>
                    <span v-if="character.server && character.guild" class="dot">·</span>
                    <span v-if="character.guild">{{ character.guild }}</span>
                </p>
            </div>
            <!-- 卡头右侧：改与删。两枚都是纯图标 26px，与左栏、工具页同一种压印块。
                 删除只把事件抛出去，确认窗由名册页开——卡上不出现第二种「确认」的问法。 -->
            <div class="head-actions">
                <PressButton icon="edit" label="编辑这个角色" @click="emit('edit')" />
                <PressButton icon="trash" label="删除这个角色" @click="emit('remove')" />
            </div>
        </header>

        <SteppedSlider
            class="tabs"
            :model-value="active"
            :options="PANE_OPTIONS"
            as="tab"
            :prefix="character.id"
            :label="`${character.name} 的分区`"
            @update:model-value="choose"
        />

        <div class="char-body" @scroll="closeAll">
            <!-- ---------- 属性：五组，前四组两行两列（行优先），末组通栏 ---------- -->
            <section
                v-show="active === 'attrs'"
                :id="`${character.id}-pane-attrs`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-attrs`"
            >
                <!-- 两行两列：上排资源 / 名望，下排战斗 / 加点。顺序来自数据
                     （`attrGroups`），这里只给网格——按列排会让下排两组被上一组的
                     长短拖着错位，按行排才能「上下两排各自顶对齐」。 -->
                <div class="attr-layout">
                    <div
                        v-for="group in character.attrGroups"
                        :key="group.title"
                        class="attr-group"
                        :class="{ wide: group.wide }"
                    >
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <!-- 一行一张**小一号**的票：名目在左、读数在右，28 高。
                             属性这一页要塞 20 项、排成 11 个视觉行（资源 4 / 名望 3 /
                             战斗 6 / 加点 5 / 潜能通栏 1），只有 28 装得进 493 的版心
                             ——42 的票会让这一页溢出 100 多（算式见 CONVENTIONS §2.4-43）。
                             不再画引导点线：票里名目吃满中间、签贴右缘，两端本来就对齐，
                             那串点只在这张 192 宽的列里剩十来颗。
                             空值画一个淡「—」：一行里只有一个空档时，「没填」读起来像
                             「值恰好很短」。 -->
                        <dl class="slip-rows sm">
                            <div
                                v-for="row in group.rows"
                                :key="row.label"
                                class="slip-row sm"
                                :class="{ blank: !row.value }"
                            >
                                <dt class="slip-name">{{ row.label }}</dt>
                                <dd class="attr-val">
                                    <NumTag class="slip-val">
                                        <span class="lv">{{ row.value || '—' }}</span>
                                    </NumTag>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                <!-- 经验单独一行：它是这一屏唯一有分母的数（离下一级还有多远），
                     混在资源那五行里只是第六个数字。 -->
                <div class="exp-row">
                    <span class="group-head"><span class="section-mark"></span>经验</span>
                    <MeterBar :percent="expPercentValue" label="经验进度" :text="expText" />
                </div>
            </section>

            <!-- ---------- 师门 ---------- -->
            <section
                v-show="active === 'skills'"
                :id="`${character.id}-pane-skills`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-skills`"
            >
                <!-- 七项门派技能，一项一张票（`.slip-row` 来自 `base.css`，四页同一件器件）。
                     行里只有三样东西：**图标 + 名称 + 等级签**。

                     ---- 为什么是刻度而不是一条连续的条 ----
                     这一页要回答的是「练到哪了」。连续条的答案是个长度差，得心算；
                     九格（180 ÷ 20）的答案是「数格子」——120 就是六格满，一眼就数完，
                     不用在 120 与 180 之间做减法。非整十的等级最后一格按比例填，
                     所以 115 也读得出来是「五格多一点」。

                     ---- 三道状态各管一件事，不互相抢 ----
                     一半：格子灌朱，空格留着槽的边界；满级：槽的描边也转朱、数字与「满」转朱、
                     字印翻成实心朱；0 级：字印与字一起退灰（`--muted`）——「还没开始」
                     不该和「练了一半」一样亮。三处同色同义，不另立记号。

                     上限缺席（老数据）时那一排刻度与分母一起不画：没有分母的百分比是编出来的。 -->
                <div v-if="character.skills.length" class="group-head school-head">
                    <span class="section-mark"></span>门派技能
                </div>
                <div v-if="character.skills.length" class="slip-rows slip-cols">
                    <!-- 一行是 `SkillRow`：字印 / 名称 + 九格刻度 / 等级签。
                         卡上只读、弹窗里可编辑，两处共用同一份解剖与同一组尺寸
                         （行内边距、印的大小、数字格的厚薄都在那个组件里量过一次）。 -->
                    <SkillRow v-for="row in character.skills" :key="row.name" :row="row" />
                </div>
                <p v-else class="empty-note">还没有记录门派技能</p>
            </section>

            <!-- ---------- 辅助 ---------- -->
            <section
                v-show="active === 'assist'"
                :id="`${character.id}-pane-assist`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-assist`"
            >
                <!-- 格子，照游戏「辅助技能」面板：一行五个（卡只有 450 宽，四列时每格
                     左右各空 24，读作散落的邮票），图标在上、等级在下。
                     生活技能与剧情技能合在同一张图里（游戏里就是同一个入口），
                     但等级下面那行小字把名字补上——图标是我们从截图切的，
                     用户认得图标，可这张表是拿来核对的，名字比图形可靠。 -->
                <div class="assist-groups">
                    <section v-for="group in assistGroups" :key="group.title" class="assist-group">
                        <!-- 两类必须各有小标题：生活技能练到 100+，剧情技能最高 5 级，
                             混在一张图里时「5」会被读成「才练了 5 级」。 -->
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <div class="slip-rows slip-cols">
                            <!-- 一项一张票：图标 ｜ 名字 ｜ 数值签，一行读完。
                                 票面在 `base.css` 的 `.slip-row`（四页共用一份），这一页
                                 只给两列网格；图标的块与蒙版在 `AssistIcon.vue`。 -->
                            <div
                                v-for="row in group.rows"
                                :key="`${row.kind}-${row.name}`"
                                class="slip-row"
                                :class="{ off: row.off, full: isMaxed(row) }"
                                :title="`${row.name} ${row.level}${row.cap ? `/${row.cap}` : ''}`"
                            >
                                <AssistIcon :name="row.name" :kind="row.kind" />
                                <span class="slip-name">{{ row.name }}</span>
                                <!-- 等级包进一枚数值签（`NumTag`）：名目在左、读数在右，
                                     与师门、修炼、属性三页同一个读法。 -->
                                <NumTag class="slip-val">
                                    <span class="lv">{{ row.level }}</span>
                                </NumTag>
                            </div>
                        </div>
                    </section>
                </div>
                <!-- 两项都没有时给一句话，与师门、召唤兽两页同一句式：
                     空白的纸页读作「没画完」，一句话才说明「这里本来就还没记」。 -->
                <p v-if="!assistGroups.length" class="empty-note">还没有记录辅助技能</p>
            </section>

            <!-- ---------- 修炼：两组，组是游戏自己划的 ---------- -->
            <section
                v-show="active === 'training'"
                :id="`${character.id}-pane-training`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-training`"
            >
                <div class="training-groups">
                    <div
                        v-for="group in character.trainings"
                        :key="group.title"
                        class="training-col"
                    >
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <!-- 一组一列、一项一张票：与编辑弹窗那一页同构（票面在全局
                             `.slip-row`）。没有图标——修炼十项本来就没有图可给，行首那
                             一格让给名目，名目从左内边距起排。 -->
                        <div class="training-list slip-rows">
                            <div
                                v-for="row in group.rows"
                                :key="row.name"
                                class="slip-row"
                                :class="{ full: isMaxed(row), idle: row.level === 0 }"
                            >
                                <span class="slip-name">{{ row.name }}</span>
                                <!-- 读数进数值签（四页同一枚）：上限写成 `/20` 的淡字，
                                     只有等级是读数。满级时签里的等级转朱。 -->
                                <NumTag class="slip-val">
                                    <span class="lv"
                                        >{{ row.level }}<i>/{{ row.cap }}</i></span
                                    >
                                </NumTag>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ---------- 装备：4 × 4 同位格，中央 2 × 2 留白 ----------
                 位置照游戏「人物装备」面板（`GEAR_LAYOUT`），**不是数组顺序**：
                 顶行四灵饰、左右两列各三件、底中两枚玉魄（阳在左）、中央空着。

                 格子是**凹槽**（自己给四层：孔上沿纸厚 / 顶壁投影 / 底壁受光 / 内衬暗环）：
                 装备是「往里放的东西」，凹才读作「空位 / 槽」。旧版这里是压印块
                 （凸起的一块纸），读作「已经拿出来摆着的一件」，与「穿戴」这个动作
                 方向相反——2026-11-04 用户对着游戏面板重排时一并改掉。
                 **槽里那件东西仍是凸的**（`IconTile`），凹槽套凸块在这套语言里是常规
                 （`.slip-row` 那张凹票里也是这么叠的）：凹说的是「这一格是个位置」，
                 凸说的是「位置上放着一件」。

                 三种状态：有装备有图（凹槽 + 压印块上的图 + 名）、有装备没图（凹槽 + 首字印）、
                 没装备（虚线挖空 + 部位名 + 未装备）。第三种**不用 opacity 压**：
                 虚线本来就淡，压了会糊成一片灰。 -->
            <section
                v-show="active === 'gear'"
                :id="`${character.id}-pane-gear`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-gear`"
            >
                <div class="gear-board">
                    <template v-for="slot in character.gear" :key="slot.slot">
                        <button
                            v-if="slot.detail"
                            type="button"
                            class="gear-cell"
                            :style="cellPos(slot.slot)"
                            @mouseenter="openTip($event, slot.detail)"
                            @mouseleave="closeAll"
                            @focus="openTip($event, slot.detail)"
                            @blur="closeAll"
                        >
                            <span class="gear-part">{{ slot.slot }}</span>
                            <!-- 有图走 `IconTile`（与师门、辅助同一枚压印块 + 纸化图）；
                                 没图的部位（武器、玉魄）走一块首字印，与 `SkillRow` 那个
                                 「查不到图标」的兜底同构。块面用 `--paper-2` 而不是师门那块的
                                 纸白：那边是「这枚是替身」（朱色，告警），这里是「这类图还没切」
                                 （淡墨，常态），同一个动作不必同一个记号。 -->
                            <IconTile
                                v-if="slotIcon(slot.slot)"
                                class="gear-pic"
                                :src="slotIcon(slot.slot)"
                            />
                            <PressTile v-else class="gear-ph" still aria-hidden="true">
                                <span class="gear-ph-text">{{ slotInitial(slot) }}</span>
                            </PressTile>
                            <span class="gear-name">{{ slot.caption }}</span>
                        </button>
                        <!-- 空位也是**挖掉的一格**，不是「没画的格」：虚线方框躺在纸上，
                             一眼数得出还差几件。部位名必须留着，否则十二格里少一块，
                             读作「这里坏了」而不是「这里没穿」。 -->
                        <div v-else class="gear-cell empty" :style="cellPos(slot.slot)">
                            <span class="gear-part">{{ slot.slot }}</span>
                            <span class="gear-empty">未装备</span>
                        </div>
                    </template>

                    <!-- 中央 2 × 2：人物位，暂时空白。四角四道括线，说明「这里是版心」
                         而不是「这里漏了一块」。 -->
                    <div class="gear-stage" aria-hidden="true">
                        <div class="corner c1"></div>
                        <div class="corner c2"></div>
                        <div class="corner c3"></div>
                        <div class="corner c4"></div>
                    </div>
                </div>
                <div class="meta gear-meta">
                    <span
                        ><span class="k">特技</span
                        ><span class="v seal">{{ character.gearMeta.special || '—' }}</span></span
                    >
                    <span
                        ><span class="k">套装</span
                        ><span class="v ochre">{{ character.gearMeta.suit || '—' }}</span></span
                    >
                </div>
            </section>

            <!-- ---------- 召唤兽：竖向列表，一张兽一张牌 ----------
                 不做网格：一只兽要回答的东西（五格战斗属性 + 技能名）比一件装备多，
                 塞进 100px 宽的格子里只写得下名字。一牌一屏能看四只，
                 正好对得上「携带 4 / 7」这个量级。

                 ---- 牌上放什么，是 2026-11-05 定的 ----
                 只放**现在什么成色**：五格战斗属性（气血 / 攻击 / 防御 / 速度 / 法伤）
                 加一行技能名。六项资质、八项战斗属性全量、技能格、内丹格都进详情
                 （`PetDetail.vue`）——资质是「练的时候」才对照的东西，摆在概览上
                 等于把两张表叠在一处。

                 ---- 为什么整块是按钮，而不是「行 + 一个箭头」 ----
                 这一块点开的动作是「看这一只」，与卡片上其它可点区域一样：整个面都是命中区，
                 不另画一个 16px 的箭头让人去瞄。等价键（Enter / Space）由原生 button 给。 -->
            <section
                v-show="active === 'pets'"
                :id="`${character.id}-pane-pets`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-pets`"
            >
                <div v-if="petViews.length" class="pet-list">
                    <button
                        v-for="view in petViews"
                        :key="view.pet.name"
                        type="button"
                        class="plate"
                        :aria-label="`查看 ${view.pet.name || '这只召唤兽'} 的详情`"
                        @click="openDetail(view.pet)"
                    >
                        <span class="beast-head">
                            <span class="elem">{{ view.pet.element || '—' }}</span>
                            <span class="beast-name">{{ view.pet.name || '未命名' }}</span>
                            <!-- 0 级退灰（`idle`）：与票行的 `.idle` 同一条，
                                 「还没开始」不该和「练到 136」一样亮。 -->
                            <span class="lv num" :class="{ idle: !view.pet.level }"
                                >{{ view.pet.level }} 级</span
                            >
                            <!-- 参战签：带得动是普通签，带不动转朱并报差额。
                                 旧版只摆「参战 65」，从不跟人物等级比。 -->
                            <span class="chip join" :class="{ short: view.short > 0 }">
                                参战 {{ view.pet.joinLevel
                                }}<b v-if="view.short > 0">差 {{ view.short }}</b>
                            </span>
                        </span>

                        <!-- 五格固定顺序，缺项画淡「—」而**不省略那一格**：
                             省一格会让后面四项各往前挪一位，「速度」那一栏里其实是法伤。 -->
                        <span class="stats">
                            <span v-for="row in view.stats" :key="row.label" class="s">
                                <span class="k">{{ row.label }}</span>
                                <span class="v" :class="{ blank: !row.value }">{{
                                    row.value || '—'
                                }}</span>
                            </span>
                        </span>

                        <span class="skill-line" :class="{ none: !view.pet.skills.length }">
                            <span class="k">技能</span>
                            <span class="names">{{
                                view.pet.skills.length ? view.skills.names.join(' · ') : '无'
                            }}</span>
                            <span v-if="view.skills.rest" class="more num">{{
                                view.skills.rest
                            }}</span>
                        </span>
                    </button>
                </div>
                <!-- 一只都没有时给一句话，与师门、辅助两页同一句式：
                     空白的纸页读作「没画完」，一句话才说明「这里本来就还没记」。 -->
                <p v-else class="empty-note">还没有记录召唤兽</p>
            </section>
        </div>

        <GearTip :anchor="tipAnchor" :detail="tip" />

        <!-- 详情档案 `Teleport` 到 body，所以挂在这里只是逻辑位置。 -->
        <PetDetail
            v-if="detailPet"
            :pet="detailPet"
            :char-level="character.level"
            @close="detailPet = null"
        />
    </PaperCard>
</template>

<style scoped src="./character-card.css"></style>

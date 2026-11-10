<script setup lang="ts">
import { computed } from 'vue';
import IconTile from '../IconTile.vue';
import NumTag from '../../../components/NumTag.vue';
import PressTile from '../../../components/PressTile.vue';
import {
    GEAR_LAYOUT,
    briefText,
    gearBrief,
    type BriefRow,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
} from '../gear';
import { useGearIcon } from '../use-gear-icon';
import type { QuickTarget } from '../quick/quick-target';

/** 卡内「装备」页。拆法与理由见 `AttrPane.vue` 顶部。 */
const props = withDefaults(
    defineProps<{
        gear: GearSlot[];
        meta: { special: string; suit: string };
        /**
         * 点一格就开「快速修改」。
         *
         * 与悬停浮片（`open-tip`）分工：悬停**看**这件装备的详情，点击**改**这一格。
         * 空位也可点——「还没装备」正是最想填的那一格，让它点不动等于把入口藏起来。
         */
        quick?: boolean;
    }>(),
    { quick: false },
);

/* 浮片自己**不画**：`GearTip` 是一层绝对定位的浮层，必须挂在滚动容器之外，
 * 所以状态留在卡片上，这里只把「锚点矩形 + 内容」抛出去。
 *
 * 抛 rect 而不是抛事件：`getBoundingClientRect()` 得在事件当时同一帧取，
 * 隔着一次 emit 之后再去读 `event.currentTarget` 有可能已经是空的。 */
const emit = defineEmits<{
    'open-tip': [{ anchor: DOMRect; detail: GearDetail; slotName: GearSlotName }];
    'close-tip': [];
    quick: [target: QuickTarget];
}>();

/** 点一格。浮片先收掉：它是悬停的临时层，弹窗一开就会被遮罩压住，留着只会
 * 在关窗之后「又冒出来」（鼠标还在格子上，不会再触发一次 mouseenter）。 */
function quickGear(slot: GearSlotName) {
    if (!props.quick) return;
    emit('close-tip');
    emit('quick', { kind: 'gear', slot });
}

/* 版心那几行摘要：**全部从 `gear` 现算**，一个字都不另存（规则见 `gear.ts` 的
 * `gearBrief`）。所以录入那边改了宝石段数，版心跟着变，不存在两份数据要同步。 */
const brief = computed(() => gearBrief(props.gear, props.meta));

/** 一行的悬停说明：格子太小，值被裁时得有个地方看全。 */
function rowTitle(row: BriefRow): string | undefined {
    return row.items.length ? briefText(row) : undefined;
}

/* 仅有短名的旧记录仍能显示；完全空白的详情由读档归一化丢掉。 */
function openTip(event: Event, slot: GearSlot) {
    if (!slot.detail) return;
    emit('open-tip', {
        anchor: (event.currentTarget as HTMLElement).getBoundingClientRect(),
        detail: slot.detail,
        slotName: slot.slot,
    });
}

/* ---------- 格子定位 ----------
 * 位置不在模板里写第几行第几列：`GEAR_LAYOUT` 是那张「游戏面板长什么样」的表
 * （在 `gear.ts` 里，与 `GEAR_SLOTS` 分开），这里只把坐标翻译成 CSS。
 * 翻译放在函数里而不是模板的 `:style` 字面量里，是为了让「两处都写一遍行列」这件事
 * 只发生在一个地方——十二行内联样式抄错一个数，界面上没有任何报错。
 */
function cellPos(slot: GearSlotName): { gridColumn: string; gridRow: string } {
    const { col, row } = GEAR_LAYOUT[slot] ?? { col: 1, row: 1 };
    return { gridColumn: String(col), gridRow: String(row) };
}

/* 图标一次取齐：模板里 `v-if` 与 `:src` 各查一次就是 24 次/卡，而且每次都遍历名录。
 * 这里在 `computed` 里跑一遍，模板只查表（`gear` 变了才重算）。 */
const { many } = useGearIcon();
const icons = computed(() => many(props.gear));

/** 缺图时回退到名称首字。 */
function slotInitial(slot: GearSlot): string {
    const name = slot.caption?.trim();
    return (name ? name[0] : slot.slot[0]) ?? '';
}

/** 可点时那一格念什么。有名字就「部位 · 装备名」，空位说「填写」，比只念部位清楚。 */
function quickLabel(slot: GearSlot): string {
    const name = slot.caption?.trim() || slot.detail?.name?.trim();
    return name ? `快速修改 ${slot.slot} · ${name}` : `填写 ${slot.slot}`;
}
</script>

<template>
    <section class="pane" role="tabpanel">
        <div class="gear-board">
            <template v-for="slot in gear" :key="slot.slot">
                <button
                    v-if="slot.detail || slot.caption?.trim()"
                    type="button"
                    class="gear-cell"
                    :class="{ quickable: quick }"
                    :style="cellPos(slot.slot)"
                    :aria-label="quick ? quickLabel(slot) : undefined"
                    @click="quickGear(slot.slot)"
                    @mouseenter="openTip($event, slot)"
                    @mouseleave="emit('close-tip')"
                    @focus="openTip($event, slot)"
                    @blur="emit('close-tip')"
                >
                    <span class="gear-part">{{ slot.slot }}</span>
                    <IconTile
                        v-if="icons.get(slot.slot)"
                        class="gear-pic"
                        :src="icons.get(slot.slot)"
                    />
                    <PressTile v-else class="gear-ph" still aria-hidden="true">
                        <span class="gear-ph-text">{{ slotInitial(slot) }}</span>
                    </PressTile>
                    <span class="gear-name">{{
                        slot.caption || slot.detail?.name || slot.slot
                    }}</span>
                </button>
                <!-- 空位是**同一个框、线退一档**，不是「没画的格」：一眼数得出还差几件。
                     部位名必须留着，否则十二格里少一块，读作「这里坏了」而不是「这里没穿」。
                     它同时是「快速修改」的入口：空位正是最想填的那一格，做成 `div`
                     就只能看不能点。不可点时 `disabled`——那样 Tab 也走不到它，
                     与「这里没有动作」是同一句话。 -->
                <button
                    v-else
                    type="button"
                    class="gear-cell empty"
                    :class="{ quickable: quick }"
                    :style="cellPos(slot.slot)"
                    :disabled="!quick"
                    :aria-label="quick ? quickLabel(slot) : undefined"
                    @click="quickGear(slot.slot)"
                >
                    <span class="gear-part">{{ slot.slot }}</span>
                    <span class="gear-empty">未装备</span>
                </button>
            </template>

            <!-- 中央 2 × 2：人物位。四角四道括线说明「这里是版心」，
                 而不是「这里漏了一块」。括线只是装饰（`aria-hidden`）；
                 括线里面是这一身装备的**摘要**——两组六行（特技 / 特效 / 套装 ·
                 宝石 / 灵饰 / 玉魄），见 `gear.ts` 的 `gearBrief`。
                 2026-11-06 之前它是卡底的一行（`.gear-meta`），后来提进版心、扩成
                 三组七行；2026-11-10 用户要「只展示特技、套装和装备强化数」，于是
                 删掉钟灵石与奇袭，段数改成一件一格（`头6 · 项5`），0 段也写 0；
                 同日又补了「特效」行。当天晚些时候按用户「整体还是不是很好看、样式
                 布局重构一下（展示内容不变）」重排了一遍几何：读数三行共用同一个签宽
                 （`--brief-tag-w`，不是各行均分）、效果块与读数块之间补一条账线、
                 六行行高统一由签定。内容与取数规则一个字没动。 -->
            <div class="gear-stage">
                <div class="stage-frame" aria-hidden="true">
                    <div class="corner c1"></div>
                    <div class="corner c2"></div>
                    <div class="corner c3"></div>
                    <div class="corner c4"></div>
                </div>

                <dl class="stage-brief">
                    <div v-for="group in brief" :key="group.key" class="brief-group">
                        <div v-for="row in group.rows" :key="row.key" class="brief-row">
                            <dt>{{ row.label }}</dt>
                            <dd
                                :class="[
                                    row.key,
                                    {
                                        blank: !row.items.length,
                                        cols: row.perRow,
                                    },
                                ]"
                                :style="row.perRow ? `--brief-cols:${row.perRow}` : undefined"
                                :title="rowTitle(row)"
                            >
                                <template v-if="row.items.length">
                                    <!-- 读数行（宝石 / 灵饰 / 玉魄）每一格包进一枚**数值签**
                                          （`NumTag`，纸带上挖出的一小格）：这些格是一处读数，
                                          与卡上师门 / 修炼那几行是同一种东西，材质该一样。
                                          名字行（特技 / 特效 / 套装）不包——它们是词不是数，
                                          套上凹格读起来像「这里能填」。

                                          给了 `perRow` 的行是等宽栅格，列宽由 CSS 的
                                          `--brief-tag-w` 定死（不是均分）：宝石 3 列两行、
                                          灵饰 4 列、玉魄 2 列，三行的列左缘落在同一条刻度上，
                                          竖着扫才是一栏。栅格里不画「·」，分隔靠列距。 -->
                                    <template v-if="row.tag">
                                        <NumTag
                                            v-for="(item, i) in row.items"
                                            :key="i"
                                            class="brief-item brief-tag"
                                            :class="{ dim: item.dim }"
                                        >
                                            <span class="item-name">{{ item.name }}</span>
                                            <b v-if="item.value">{{ item.value }}</b>
                                        </NumTag>
                                    </template>
                                    <!-- 名字行：一格两段。纯空白的文本节点不成 flex 项，
                                         所以两段紧挨着写，靠 `.brief-item` 的 flex 排。 -->
                                    <template v-else>
                                        <span
                                            v-for="(item, i) in row.items"
                                            :key="i"
                                            class="brief-item"
                                            :class="{ dim: item.dim }"
                                        >
                                            <span class="item-name">{{ item.name }}</span>
                                            <b v-if="item.value">{{ item.value }}</b>
                                        </span>
                                    </template>
                                </template>
                                <template v-else>—</template>
                            </dd>
                        </div>
                    </div>
                </dl>
            </div>
        </div>
    </section>
</template>

<style scoped src="./gear-pane.css"></style>

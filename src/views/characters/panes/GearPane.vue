<script setup lang="ts">
import IconTile from '../IconTile.vue';
import PressTile from '../../../components/PressTile.vue';
import {
    GEAR_LAYOUT,
    GEAR_SLOT_ICON,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
} from '../gear';
import { gearSlotIcon } from '../../../services/game-icons';

/** 卡内「装备」页。拆法与理由见 `AttrPane.vue` 顶部。 */
defineProps<{
    gear: GearSlot[];
    meta: { special: string; suit: string };
}>();

/* 浮片自己**不画**：`GearTip` 是一层绝对定位的浮层，必须挂在滚动容器之外，
 * 所以状态留在卡片上，这里只把「锚点矩形 + 内容」抛出去。
 *
 * 抛 rect 而不是抛事件：`getBoundingClientRect()` 得在事件当时同一帧取，
 * 隔着一次 emit 之后再去读 `event.currentTarget` 有可能已经是空的。 */
const emit = defineEmits<{
    'open-tip': [{ anchor: DOMRect; detail: GearDetail }];
    'close-tip': [];
}>();

/* `detail` 可以缺席：一格只填了「装备名」、什么都没展开时，卡上照样要显示这个名字
 * （名字就是用户填的全部信息），只是没有浮片可弹——`normalizeGearDetail` 会把
 * 「名称与类型都空」的壳丢掉，所以这种格子永远没有 detail。 */
function openTip(event: Event, detail?: GearDetail) {
    if (!detail) return;
    emit('open-tip', {
        anchor: (event.currentTarget as HTMLElement).getBoundingClientRect(),
        detail,
    });
}

/* ---------- 格子定位 ----------
 * 位置不在模板里写第几行第几列：`GEAR_LAYOUT` 是那张「游戏面板长什么样」的表
 * （在 `gear.ts` 里，与 `GEAR_SLOTS` 分开），这里只把坐标翻译成 CSS。
 * 翻译放在函数里而不是模板的 `:style` 字面量里，是为了让「两处都写一遍行列」这件事
 * 只发生在一个地方——十二行内联样式抄错一个数，界面上没有任何报错。
 */
function cellPos(slot: GearSlotName): { gridColumn: string; gridRow: string } {
    const { col, row } = GEAR_LAYOUT[slot];
    return { gridColumn: String(col), gridRow: String(row) };
}

/* 图标按**部位**取（表见 `gear.ts` 的 `GEAR_SLOT_ICON`）：
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
    <section class="pane" role="tabpanel">
        <div class="gear-board">
            <template v-for="slot in gear" :key="slot.slot">
                <button
                    v-if="slot.detail || slot.caption?.trim()"
                    type="button"
                    class="gear-cell"
                    :style="cellPos(slot.slot)"
                    @mouseenter="openTip($event, slot.detail)"
                    @mouseleave="emit('close-tip')"
                    @focus="openTip($event, slot.detail)"
                    @blur="emit('close-tip')"
                >
                    <span class="gear-part">{{ slot.slot }}</span>
                    <!-- 有图走 `IconTile`（与师门、辅助同一枚压印块 + 纸化图）；
                         没图的部位（武器、玉魄）走一块首字印，与 `SkillRow` 那个
                         「查不到图标」的兜底同构。首字用淡墨而不是师门那枚的朱：
                         那边是「这枚是替身」（数据缺了，告警），这里是「这类图还没切」
                         （常态），同一个动作不必同一个记号。 -->
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
                <!-- 空位是**同一个框、线退一档**，不是「没画的格」：一眼数得出还差几件。
                     部位名必须留着，否则十二格里少一块，读作「这里坏了」而不是「这里没穿」。 -->
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
                ><span class="v seal">{{ meta.special || '—' }}</span></span
            >
            <span
                ><span class="k">套装</span
                ><span class="v ochre">{{ meta.suit || '—' }}</span></span
            >
        </div>
    </section>
</template>

<style scoped src="./gear-pane.css"></style>

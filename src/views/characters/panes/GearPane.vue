<script setup lang="ts">
import { computed } from 'vue';
import IconTile from '../IconTile.vue';
import PressTile from '../../../components/PressTile.vue';
import { GEAR_LAYOUT, gearBrief, type GearDetail, type GearSlot, type GearSlotName } from '../gear';
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

/* 版心那七行摘要：**全部从 `gear` 现算**，一个字都不另存（规则见 `gear.ts` 的
 * `gearBrief`）。所以录入那边改了宝石段数，版心跟着变，不存在两份数据要同步。 */
const brief = computed(() => gearBrief(props.gear, props.meta));

/* 值里的数字要单独上色加粗（全站规矩：墨 / 赭 / 朱三层，数字是赭），
 * 所以先把一串文字切成「文字 / 数字」两种段——`5/5`、`4 / 3` 这种整段留住不拆。 */
function numParts(value: string): { text: string; num: boolean }[] {
    return value
        .split(/(\d+(?:\s*\/\s*\d+)?(?:\.\d+)?)/g)
        .filter((one) => one !== '')
        .map((text) => ({ text, num: /^\d/.test(text) }));
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

const slotIcon = useGearIcon();

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
                    <IconTile v-if="slotIcon(slot)" class="gear-pic" :src="slotIcon(slot)" />
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
                 括线里面是这一身装备的**摘要**——三组七行，见 `gear.ts` 的 `gearBrief`。
                 2026-11-06 之前它是卡底的一行（`.gear-meta`），后来提进版心、又扩成
                 三组：用户说「中间展示的信息太少了，各个装备、灵饰、段数之类的重要信息」。 -->
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
                                :class="[row.key, { blank: !row.value }]"
                                :title="row.value || undefined"
                            >
                                <template v-for="(part, i) in numParts(row.value || '—')" :key="i">
                                    <b v-if="part.num">{{ part.text }}</b>
                                    <template v-else>{{ part.text }}</template>
                                </template>
                            </dd>
                        </div>
                    </div>
                </dl>
            </div>
        </div>
    </section>
</template>

<style scoped src="./gear-pane.css"></style>

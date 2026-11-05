<script setup lang="ts">
import { computed } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import {
    PET_PILL_SLOTS,
    PET_QUALITY_FIELDS,
    PET_SKILL_SLOTS,
    joinShort,
    lifeLow,
    type Pet,
} from './character';

/**
 * 召唤兽详情档案。
 *
 * ---- 为什么是弹窗，而不是在卡里展开 ----
 * 卡内正文宽 398、高 523，一列排完六项资质 + 八项属性 + 12 格技能要滚三屏；
 * 而 600 宽能排两列，一屏说完。更要紧的是**点开就是「只看这一只」的时刻**——
 * 名册页并排两张卡是为了横向比，展开会把那块视野一起吃掉。
 * 壳子用现成的 `ModalShell`（Esc、焦点陷阱、锁滚动、还焦点都在 `use-modal` 里），
 * 与历史窗同宽一档（620 → 600，只差一列余量）。
 *
 * ---- 两层分工 ----
 * 概览牌只给五格战斗属性 + 技能名（回答「现在什么成色」）；
 * 这一页给全（回答「值不值得留」）：六项资质、八项战斗属性、技能 12 格、内丹 8 格。
 * 原先这些藏在悬停浮片里（`PetTip.vue`），随本次一并退役——同一份内容两个出口，
 * 迟早一处改了另一处没改。
 *
 * ---- 只读 ----
 * 页脚只有「关闭」，没有「编辑」：编辑器是整张角色卡的表单，从这一只兽点进去
 * 会落在「属性」那一页而不是「召唤兽」，等于给了一个到不了目的地的入口。
 * 真要就地改，等编辑器支持「直接开到第 N 只兽」再说。
 */
const props = defineProps<{ pet: Pet; charLevel: number }>();
const emit = defineEmits<{ close: [] }>();

/* 三个文字字段走这里取值：类型上它们是 `string`，但数据是从本机 JSON 读回来的
 * （`roster.ts` 只做一次 `JSON.parse`），早期存下来的那一份可能缺这几项。
 * 一处 `.trim()` 抛异常会让整张窗白掉，而它只是少一个字段。 */
function text(value: string | undefined): string {
    return (value ?? '').trim();
}

const title = computed(() => `召唤兽 · ${text(props.pet.name) || '未命名'}`);

/** 带不带的动：0 是常态，大于 0 才转朱并报差额。 */
const short = computed(() => joinShort(props.pet, props.charLevel));

/** 资质六行，顺序由 `PET_QUALITY_FIELDS` 定（与编辑器的六格同一份）。 */
const qualityRows = computed(() =>
    PET_QUALITY_FIELDS.map((field) => ({
        label: field.label,
        value: props.pet.quality[field.key],
    })),
);

/**
 * 十二格技能：前 N 格是学了的，其余留空。
 *
 * 超过 12 个时**只画前 12 格**，但抬头仍写真实的分子（`13 / 12`）——这种数据在游戏里
 * 不可能出现，出现了就该一眼看见不对劲，而不是被 `Math.min` 悄悄藏起来。
 */
const skillSlots = computed(() => {
    const filled = props.pet.skills.slice(0, PET_SKILL_SLOTS);
    return Array.from({ length: PET_SKILL_SLOTS }, (_, i) => filled[i] ?? '');
});

const pillSlots = computed(() => {
    const filled = props.pet.innerPills.slice(0, PET_PILL_SLOTS);
    return Array.from({ length: PET_PILL_SLOTS }, (_, i) => filled[i] ?? '');
});

const lifeWarn = computed(() => lifeLow(props.pet.life));
</script>

<template>
    <ModalShell :title="title" :width="600" @close="emit('close')">
        <!-- 抬头：身份 + 三件硬指标 + 参战。五行不在这里重复，左边那枚章就是它。 -->
        <div class="pet-id">
            <span class="elem">{{ text(pet.element) || '—' }}</span>
            <h3>
                {{ text(pet.name) || '未命名' }}
                <span class="lv num" :class="{ idle: !pet.level }">{{ pet.level }} 级</span>
            </h3>
            <div class="facts">
                <span
                    >成长 <i class="v">{{ text(pet.growth) || '—' }}</i></span
                >
                <span
                    >寿命
                    <i class="v num" :class="{ low: lifeWarn }">{{
                        pet.life > 0 ? pet.life : '—'
                    }}</i></span
                >
                <span v-if="pet.spirit !== undefined"
                    >灵性 <i class="v num">{{ pet.spirit }}</i></span
                >
            </div>
            <span class="chip join" :class="{ short: short > 0 }">
                参战 {{ pet.joinLevel }}<b v-if="short > 0">差 {{ short }}</b>
            </span>
        </div>

        <!-- 两列：左战斗属性（读数，一行一条账线）/ 右资质（逐项核对，一枚一枚的票）。
             2026-11-05 用户要求两边对调：先看的是「这只现在多能打」，资质是往回查的账。 -->
        <div class="pet-cols">
            <section>
                <div class="group-head"><span class="section-mark"></span>战斗属性</div>
                <div v-if="pet.attrs.length" class="a-rows">
                    <div v-for="(row, i) in pet.attrs" :key="`${row.label}-${i}`" class="a-row">
                        <span class="k">{{ row.label || '未命名' }}</span>
                        <span class="v num">{{ row.value || '—' }}</span>
                    </div>
                </div>
                <p v-else class="empty-note">还没有记录战斗属性</p>
            </section>

            <section>
                <div class="group-head"><span class="section-mark"></span>资质</div>
                <div class="q-rows">
                    <div v-for="row in qualityRows" :key="row.label" class="q-row">
                        <span class="k">{{ row.label }}资质</span>
                        <span class="v num">{{ row.value }}</span>
                    </div>
                </div>
            </section>
        </div>

        <!-- 技能 12 格、内丹 8 格：格数固定，空格用虚线——「还差几格」一眼数得出 -->
        <section class="slot-sec">
            <div class="group-head wide">
                <span class="section-mark"></span>技能
                <span class="count num">{{ pet.skills.length }} / {{ PET_SKILL_SLOTS }}</span>
            </div>
            <div class="slot-grid slots-12">
                <span
                    v-for="(name, i) in skillSlots"
                    :key="i"
                    class="slot"
                    :class="{ off: !name }"
                    >{{ name }}</span
                >
            </div>
        </section>

        <section class="slot-sec">
            <div class="group-head wide">
                <span class="section-mark"></span>内丹
                <span class="count num">{{ pet.innerPills.length }} / {{ PET_PILL_SLOTS }}</span>
            </div>
            <div class="slot-grid slots-8">
                <span
                    v-for="(name, i) in pillSlots"
                    :key="i"
                    class="slot pill"
                    :class="{ off: !name }"
                    >{{ name }}</span
                >
            </div>
        </section>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="关闭"
                label="关闭召唤兽详情"
                @click="emit('close')"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
/* ---------- 抬头 ---------- */
.pet-id {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 13px;
    border-bottom: var(--w-hair) solid var(--rule);
}
/* 五行章是一枚**压印块**（凸），与概览牌上那枚同构，只是放大到 34。
 * 详情窗的纸是纯 `--paper`，所以这里取 `well 34% + paper-2`——比纸面深一档，
 * 才读作「压上去的一块」；概览牌上票面本来就深，那一处反过来用纯 `--paper-2`。 */
.elem {
    display: grid;
    flex: none;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--well) 34%, var(--paper-2));
    box-shadow:
        inset 1px 1px 0 var(--bevel-hi),
        inset -1px -1px 0 var(--bevel-lo),
        0 1px 3px var(--shadow-lg);
    color: var(--num);
    font-size: calc(var(--fs-sm) + 6px);
    line-height: 1;
}
h3 {
    margin: 0;
    font-size: calc(var(--fs-md) + 3px);
    font-weight: 400;
    letter-spacing: 0.06em;
}
h3 .lv {
    margin-left: 3px;
    color: var(--num);
    font-size: var(--fs-base);
    font-weight: 700;
}
/* 0 级退灰：与概览牌、票行的 `idle` 同一条——「还没开始」不该和「练到 136」一样亮。 */
h3 .lv.idle {
    color: var(--muted);
}
/* 三件硬指标推到右侧：`margin-left: auto` 让它与参战签一起贴右缘，
 * 中间那段空白是留给名字的——名字最长「天狗（人形）」六个字，放得下。 */
.facts {
    display: flex;
    gap: 12px;
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}
.facts .v {
    color: var(--num);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
}
.facts .v.low {
    color: var(--cinnabar);
}
/* 抬头里的签不另起一列：facts 已经把右侧推开，签紧贴在它后面 */
.join {
    flex: none;
    margin-left: 0;
    padding: 2px 7px;
    font-size: var(--fs-xs);
}
.join.short {
    border-color: color-mix(in srgb, var(--cinnabar) 46%, var(--rule-2));
    background: color-mix(in srgb, var(--cinnabar) 7%, transparent);
    color: var(--cinnabar);
}
.join.short b {
    font-weight: 400;
    opacity: 0.78;
}
.join.short b::before {
    content: '·';
    margin: 0 3px 0 1px;
    opacity: 0.55;
}

/* ---------- 两列 ---------- */
.pet-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 26px;
    margin-top: 14px;
}
/* 分栏名走全局 `.group-head`（11px、字距 0.14em、朱色短竖条），这一处只把
 * 与下面内容的间距放到 5——票与行都比 `.group-head` 默认的 2 高一档。 */
.group-head {
    --gh-mb: 5px;
}
.group-head.wide {
    margin-bottom: 6px;
}

/* 资质用票：六项是「逐项核对」的东西，一枚一枚地读。
 * 高 34 而不是 28：与左列八行（30 × 8 = 240）配成同一段高度——六票 34 × 6 + 5 × 5 = 229，
 * 差 11（2026-11-05 两列对调后，短的那一列由左变右）。这一档差从第一版就在，
 * 量过眼睛，两列底边**不至于读成「还没填完」**；真要抹平得把票加到 35.4，不值当。 */
.q-rows {
    display: grid;
    gap: 5px;
}
.q-row {
    display: flex;
    align-items: center;
    height: 34px;
    padding: 0 9px;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--well) 34%, var(--paper-2));
    box-shadow:
        inset 1px 1px 0 var(--bevel-hi),
        inset -1px -1px 0 var(--bevel-lo),
        0 1px 2px var(--shadow);
}
.q-row .k {
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.q-row .v {
    margin-left: auto;
    color: var(--num);
    font-size: calc(var(--fs-sm) + 1px);
    font-weight: 700;
}

/* 战斗属性用行：八项是读数，不是八件东西，所以不套票面，只用账线分条。
 * 八行 × 30 = 240，比右列六票（34 × 6 + 5 × 5 = 229）高 11——两列不再完全齐平，
 * 但对调是按「先看能打多少」排的，左列长一点反而把这块推成主区。 */
.a-rows {
    display: grid;
}
.a-row {
    display: flex;
    align-items: center;
    height: 30px;
    border-bottom: var(--w-hair) solid var(--rule);
    font-size: var(--fs-sm);
}
.a-row:last-child {
    border-bottom: 0;
}
.a-row .k {
    color: var(--muted);
}
.a-row .v {
    margin-left: auto;
    color: var(--num);
    font-weight: 700;
}

/* 空态：这一块原本什么都没有时给一句话，不留一片空白，也不画一行空槽。
 * 与卡上 `.empty-note` 同一句式（那边是 scoped 的，够不到这里，所以各写一份）。 */
.empty-note {
    margin: 0;
    padding: 22px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
}

/* ---------- 两块格子 ---------- */
.slot-sec {
    margin-top: 16px;
}
.slot-sec + .slot-sec {
    margin-top: 14px;
}
.count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
}
.slot-grid {
    display: grid;
    gap: 6px;
}
.slots-12 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
}
.slots-8 {
    grid-template-columns: repeat(8, minmax(0, 1fr));
}
.slot {
    display: grid;
    place-items: center;
    height: 30px;
    padding: 0 4px;
    overflow: hidden;
    border-radius: var(--r-2);
    background: color-mix(in srgb, var(--well) 34%, var(--paper-2));
    box-shadow:
        inset 1px 1px 0 var(--bevel-hi),
        inset -1px -1px 0 var(--bevel-lo);
    color: var(--ink-2);
    font-size: var(--fs-sm);
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.slot.pill {
    height: 26px;
}
/* 空格：一道淡虚线。42% 是量出来的——再深一格，十二个空格会连成一张网格，
 * 把四个真技能压成「表格里的四个词」。 */
.slot.off {
    border: var(--w-hair) dashed color-mix(in srgb, var(--rule-2) 42%, transparent);
    background: none;
    box-shadow: none;
}
</style>

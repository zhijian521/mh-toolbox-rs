<script setup lang="ts">
import { computed, watch } from 'vue';
import SelectField from '../../../components/SelectField.vue';
import GearProperties from '../GearProperties.vue';
import {
    fixedGearBaseLabels,
    gearConditionOptions,
    gearEffectOptions,
    gearGroupOptions,
    gearStatGroup,
    gearStatHasExtra,
    gearStatOptions,
    withGearBaseStats,
} from '../gear-properties';
import PaperCard from '../../../components/PaperCard.vue';
import PressButton from '../../../components/PressButton.vue';
import IconTile from '../IconTile.vue';
import { useGearIcon } from '../use-gear-icon';
import {
    GEAR_ACTIVES,
    GEAR_SPECIALS,
    type GearDetail,
    type GearSlotName,
    type GearStat,
    type GearStatGroup,
} from '../gear';

/** 分类、名称和数值分格对齐，各入口只编辑自己的装备草稿。 */
const props = defineProps<{ slotName: GearSlotName }>();
const detail = defineModel<GearDetail>({ required: true });
const caption = defineModel<string | undefined>('caption');
const statShortcuts = computed(() =>
    gearGroupOptions(props.slotName).filter(
        (group) => group.value !== 'base' || !fixedGearBaseLabels(props.slotName).length,
    ),
);
const effectShortcuts = computed(() => gearEffectOptions(props.slotName));
function optionsWithCurrent(options: { value: string; label: string }[], current: string) {
    return current && !options.some((item) => item.value === current)
        ? [{ value: current, label: current }, ...options]
        : options;
}
function effectValues(label: string, current: string) {
    const names = label === '特技' ? GEAR_ACTIVES : label === '特效' ? GEAR_SPECIALS : [];
    return optionsWithCurrent(
        names.map((value) => ({ value, label: value })),
        current,
    );
}
function statOptions(stat: GearStat) {
    const options = gearStatOptions(props.slotName, gearStatGroup(stat, props.slotName));
    return stat.label && !options.some((item) => item.value === stat.label)
        ? [{ value: stat.label, label: stat.label }, ...options]
        : options;
}
function fixedBase(stat: GearStat) {
    return (
        gearStatGroup(stat, props.slotName) === 'base' &&
        fixedGearBaseLabels(props.slotName).includes(stat.label)
    );
}
function hasExtra(stat: GearStat) {
    return gearStatHasExtra(stat, props.slotName);
}
function addStat(group: GearStatGroup) {
    const label = gearStatOptions(props.slotName, group)[0]?.value;
    if (!label) return;
    detail.value.stats.push({
        label,
        value: '',
        group,
        gain: group === 'base' || group === 'trait' ? undefined : true,
    });
}
watch(
    () => detail.value,
    (value) => {
        const prepared = withGearBaseStats(value, props.slotName);
        if (prepared !== value) detail.value = prepared;
    },
    { immediate: true },
);
const gearIcon = useGearIcon();
const icon = computed(() =>
    gearIcon({ slot: props.slotName, caption: caption.value, detail: detail.value }),
);
function setName(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    detail.value.name = value;
    caption.value = value;
}
function setRequires(event: Event) {
    const parts = (event.target as HTMLInputElement).value
        .split(/[,，·]/)
        .map((part) => part.trim())
        .filter(Boolean);
    detail.value.requires = parts.length ? parts : undefined;
}
function addCond() {
    detail.value.cond ??= [];
    detail.value.cond.push({ label: '耐久度', value: '' });
}
function addLine(label: string) {
    detail.value.lines ??= [];
    detail.value.lines.push({ label, value: '', tone: label === '特技' ? 'seal' : 'ochre' });
}
</script>

<template>
    <PaperCard class="gear-form">
        <div class="gear-content">
            <div class="gear-identity">
                <IconTile v-if="icon" class="gear-form-icon" :src="icon" />
                <span v-else class="gear-form-mark" aria-hidden="true">{{ slotName[0] }}</span>
                <label class="gear-name">
                    <span class="field-label">{{ slotName }}</span>
                    <input
                        class="field inline-field name-field"
                        :value="detail.name || caption"
                        :aria-label="slotName + ' 的装备名'"
                        placeholder="装备名"
                        @input="setName"
                    />
                </label>
            </div>
            <div class="gear-kind">
                <input
                    v-model="detail.kind"
                    class="field inline-field"
                    aria-label="装备类型"
                    placeholder="类型"
                />
                <input
                    class="field inline-field"
                    aria-label="装备条件，逗号分隔"
                    placeholder="等级 / 条件"
                    :value="(detail.requires ?? []).join('，')"
                    @change="setRequires"
                />
            </div>

            <GearProperties :detail="detail" :slot-name="slotName" editable>
                <template #label="{ group }">
                    <SelectField
                        v-if="group.items[0].source === 'lines'"
                        v-model="group.items[0].row.label"
                        :options="
                            optionsWithCurrent(
                                gearEffectOptions(slotName),
                                group.items[0].row.label,
                            )
                        "
                        class="effect-label"
                        label="特殊行名"
                    />
                    <template v-else>{{ group.label }}</template>
                </template>
                <template #stats="{ item }">
                    <div class="detail-row stat-row" :class="{ 'fixed-base': fixedBase(item.row) }">
                        <span v-if="fixedBase(item.row)" class="stat-fixed row-name slip-row sm">{{
                            item.row.label
                        }}</span>
                        <SelectField
                            v-else
                            :model-value="item.row.label"
                            :options="statOptions(item.row)"
                            class="stat-select row-name slip-row sm"
                            label="属性名"
                            @update:model-value="item.row.label = $event"
                        />
                        <div class="stat-number">
                            <input
                                v-model="item.row.value"
                                class="field num-slot value-field"
                                :aria-label="item.row.label + '属性值'"
                            />
                            <span v-if="hasExtra(item.row)" class="stat-extra">
                                <input
                                    v-model="item.row.extra"
                                    class="field num-slot value-field"
                                    aria-label="括号值"
                                />
                            </span>
                        </div>
                        <PressButton
                            v-if="!fixedBase(item.row)"
                            class="row-delete"
                            icon="trash"
                            :label="'删除' + item.row.label + '属性'"
                            @click="detail.stats.splice(item.index, 1)"
                        />
                    </div>
                </template>
                <template #cond="{ item }">
                    <div class="detail-row condition-row">
                        <SelectField
                            v-model="item.row.label"
                            :options="
                                optionsWithCurrent(gearConditionOptions(slotName), item.row.label)
                            "
                            class="condition-select row-name slip-row sm"
                            label="状态名"
                        />
                        <input
                            v-model="item.row.value"
                            class="field num-slot value-field"
                            :aria-label="item.row.label"
                        />
                        <PressButton
                            class="row-delete"
                            icon="trash"
                            label="删掉这一条状态"
                            @click="detail.cond!.splice(item.index, 1)"
                        />
                    </div>
                </template>
                <template #lines="{ item }">
                    <div class="detail-row effect-row">
                        <SelectField
                            v-if="['特技', '特效'].includes(item.row.label)"
                            v-model="item.row.value"
                            :options="effectValues(item.row.label, item.row.value)"
                            label="特殊内容"
                            placeholder="未选"
                            class="effect-select row-name slip-row sm"
                        />
                        <input
                            v-else
                            v-model="item.row.value"
                            class="field num-slot effect-value"
                            aria-label="特殊内容"
                        />
                        <PressButton
                            class="row-delete"
                            icon="trash"
                            label="删掉这一条效果"
                            @click="detail.lines!.splice(item.index, 1)"
                        />
                    </div>
                </template>
            </GearProperties>

            <label class="gear-note">
                <span class="field-label">备注</span>
                <textarea v-model="detail.note" class="field area" rows="3" aria-label="装备备注" />
            </label>
        </div>
        <div class="gear-add">
            <PressButton
                v-for="group in statShortcuts"
                :key="group.value"
                class="gear-color"
                :class="'gear-color-' + group.value"
                icon="add"
                :text="group.label + '行'"
                :label="'添加' + group.label + '行'"
                @click="addStat(group.value)"
            />
            <PressButton
                v-for="effect in effectShortcuts"
                :key="effect.value"
                class="gear-color"
                :class="'gear-color-' + effect.kind"
                icon="add"
                :text="effect.label + '行'"
                :label="'添加' + effect.label + '行'"
                @click="addLine(effect.value)"
            />
            <PressButton
                class="gear-color gear-color-status"
                icon="add"
                text="状态行"
                label="添加状态行"
                @click="addCond"
            />
        </div>
    </PaperCard>
</template>

<style scoped>
/* 一层纸：根元素是 `PaperCard`（全局 `.board`），与属性 / 师门 / 召唤兽那几页同一个材质。
 * 2026-11-10 用户：「右边装备详情部分，可以参考下属性、师门、召唤兽这些，也是用一个卡片
 * 样式背景」。此前这里是一圈 1px 边框 + `--paper` 平底，同一扇窗里别的页是立体纸片，只有
 * 这一页读作「一块表单」。纸自己带棱、断面与落影，这里不再画框，也不再走 `.dual-rule`
 * 那圈内衬线（角色卡 2026-11-06 同样去掉了）。
 *
 * 纸色跟着**角色门派主题色**走（2026-11-10 用户：「装备和召唤兽右侧卡片背景，和属性师门
 * 这些保持一致，走角色门派主题色」）：`.character-theme` 在 `blocks.css` 里给了 `--card-bg`
 * （门派色按 135° 掺进纸，两端浓度随亮暗反转），这里只是 `background: var(--card-bg)`——
 * 与角色卡 `CharacterCard` 用的是**同一条**，不另抄一份色号。
 *
 * `--slip-base` 也跟着回落（原先写死 `var(--paper)`）：票面读的中点色由 `.character-theme`
 * 给，纸一染色票就一起走色相；留死白会变成「彩纸上的白条」。 */
.gear-form {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    /* 只撤掉 `.board` 那 20px 内边距：`.gear-content` 与 `.gear-add` 各自带 14，
     * 叠上 20 就比召唤兽那一页缩进一档。也**不**补底边内衬——这里滚动容器的
     * 裁剪线落在 `.gear-add` 的上沿（卡中间），不在纸的底缘，与 `.pet-form` 的情况
     * 不同，那 12 留着只会让按钮下方多一圈空纸。 */
    padding: 0;
    /* 回落链是给「万一不在 `.character-theme` 里」留的：`--card-bg` 算不出来时整条
     * `background` 会变成透明（substitution 失败不回落到 `.board` 那条），一张纸就没了。 */
    background: var(--card-bg, var(--board-face, var(--board-paper)));
}
.gear-content {
    flex: 1;
    min-height: 0;
    padding: 14px max(0px, calc(14px - var(--scrollbar-w))) 14px 14px;
    overflow-y: auto;
    scrollbar-gutter: stable;
}
.gear-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
}
.gear-identity .gear-form-icon {
    --tile-w: 36px;
    --tile-h: 36px;
    --shot: 30px;
    --tile-r: var(--r-2);
}
.gear-form-mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--ochre);
    font-size: var(--fs-md);
}
.gear-name {
    flex: 1;
    min-width: 0;
}
.gear-name .field-label {
    padding-left: 4px;
    font-size: var(--fs-mini);
}
.inline-field {
    width: 100%;
    min-width: 0;
    height: auto;
    padding: 2px 3px;
    border-color: transparent;
    border-radius: var(--r-1);
    background: transparent;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: 1.5;
}
.inline-field:hover,
.inline-field:focus {
    border-color: var(--rule-2);
    /* 纸染了门派色之后，悬停提亮不能再回落到 `--paper-2`——那会在彩纸上贴一块白。
     * `--slip-base` 是同一层纸的中点色（`.character-theme` 给），深浅跟着纸走。 */
    background: var(--slip-base);
}
.gear-name .name-field {
    color: var(--ink);
    font-size: var(--fs-md);
}
.gear-kind {
    display: grid;
    grid-template-columns: minmax(70px, 0.8fr) minmax(0, 1.2fr);
    gap: 6px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.detail-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) calc(26px * var(--fs-scale));
    align-items: center;
    gap: 6px;
    width: 100%;
    font-size: var(--fs-sm);
}
.stat-row.fixed-base {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}
.stat-number {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: calc(10px * var(--fs-scale));
    min-width: 0;
    font-variant-numeric: tabular-nums;
}
.stat-number:has(.stat-extra) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}
.row-name,
.value-field,
.effect-value {
    width: 100%;
    min-width: 0;
    height: var(--gear-row-h);
    color: inherit;
    font: inherit;
}
.row-name.slip-row {
    gap: 0;
    height: var(--gear-row-h);
    padding: 0;
}
.value-field {
    padding: 0 6px;
    text-align: right;
    font-weight: 700;
}
.stat-extra {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
}
.stat-extra::before,
.stat-extra::after {
    position: absolute;
    pointer-events: none;
}
.stat-extra::before {
    left: calc(-5px * var(--fs-scale));
    content: '[';
}
.stat-extra::after {
    right: calc(-5px * var(--fs-scale));
    content: ']';
}
.effect-row {
    grid-template-columns: minmax(0, 1fr) calc(26px * var(--fs-scale));
}
.effect-value {
    padding: 0 7px;
}
.effect-label {
    width: 100%;
    min-width: 0;
    color: inherit;
    font-size: inherit;
}
.stat-fixed.slip-row {
    padding: 0 7px;
    white-space: nowrap;
}
.row-name :deep(.select-trigger),
.effect-label :deep(.select-trigger) {
    height: var(--gear-row-h);
    padding: 0 7px;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: inherit;
    font: inherit;
}
.row-name :deep(.select-trigger:hover),
.row-name :deep(.select-trigger:focus),
.effect-label :deep(.select-trigger:hover),
.effect-label :deep(.select-trigger:focus) {
    border-color: var(--rule-2);
    background: color-mix(in srgb, var(--property-ink) 6%, transparent);
}
.row-name :deep(.select-trigger) {
    gap: 4px;
}
.effect-label :deep(.select-trigger) {
    position: relative;
    padding-inline: 14px;
    text-align: center;
}
.effect-label :deep(.select-text) {
    text-align: center;
}
.effect-label :deep(.select-arrow) {
    position: absolute;
    right: 4px;
    width: calc(10px * var(--fs-scale));
    height: calc(10px * var(--fs-scale));
}
.row-delete {
    justify-self: end;
    color: var(--muted);
}
.row-delete:hover {
    color: var(--cinnabar);
}
.gear-note {
    display: grid;
    gap: 6px;
    margin-top: 16px;
}
.gear-note textarea {
    width: 100%;
}
.gear-add {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 14px 14px;
    border-top: var(--w-hair) solid var(--rule-2);
}
/* 分类底也从纸里取（`--slip-base` = 这张纸的中点色），不走 `--paper-2`：
 * 纸染了门派色之后，拿纯纸白混分类色，会在彩纸上摆出一排白底小签。
 * 与 §44「普通按钮复用 `--slip-base` 的门派浅染」是同一条。 */
.gear-add .press-btn {
    --tile-h: calc(30px * var(--fs-scale));
    --tile-face: color-mix(in srgb, var(--property-ink) 12%, var(--slip-base));
    --tile-face-hover: color-mix(in srgb, var(--property-ink) 20%, var(--slip-base));
    --tile-face-active: color-mix(in srgb, var(--property-ink) 26%, var(--slip-base));
}
.gear-add :deep(.press-btn-inner) {
    color: var(--property-ink);
}
</style>

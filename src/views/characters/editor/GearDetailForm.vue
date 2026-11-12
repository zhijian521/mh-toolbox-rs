<script setup lang="ts">
import { computed, watch } from 'vue';
import SelectField from '../../../components/SelectField.vue';
import { withCurrentOption } from '../../../components/select-options';
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
import NumberField from '../../../components/NumberField.vue';
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
function effectValues(label: string, current: string) {
    const names = label === '特技' ? GEAR_ACTIVES : label === '特效' ? GEAR_SPECIALS : [];
    return withCurrentOption(
        names.map((value) => ({ value, label: value })),
        current,
    );
}
function statOptions(stat: GearStat) {
    const options = gearStatOptions(props.slotName, gearStatGroup(stat, props.slotName));
    return withCurrentOption(options, stat.label);
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
const { icon: gearIcon } = useGearIcon();
const icon = computed(() =>
    gearIcon({ slot: props.slotName, caption: caption.value, detail: detail.value }),
);
function setName(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    detail.value.name = value;
    caption.value = value;
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
    <PaperCard class="gear-form character-detail">
        <div class="gear-content character-detail-content">
            <header class="gear-identity character-detail-identity">
                <IconTile v-if="icon" class="gear-form-icon" :src="icon" />
                <span v-else class="gear-form-mark" aria-hidden="true">{{ slotName[0] }}</span>
                <div class="gear-id character-detail-id">
                    <div class="gear-name-row character-detail-name-row">
                        <label class="gear-name-field character-detail-name-field">
                            <input
                                class="field gear-name-input character-detail-name-input"
                                :value="detail.name || caption"
                                :aria-label="slotName + ' 的装备名'"
                                :placeholder="slotName + '装备名'"
                                @input="setName"
                            />
                        </label>
                        <slot name="name-extra" />
                    </div>
                    <!-- 类型与等级照召唤兽那两格（2026-11-11 用户：「装备修改页面的类型和
                         等级条件样式参考召唤兽的等级和参战等级样式，现在的数字输入框样式不对」）：
                         同样是 `label.slip-row.sm` + 票面里的凹槽，数值格用 `NumberField`。
                         等级只记一个数（用户同日：「等级条件，修改为等级，我们只记录等级即可」）——
                         旧档的「等级 80」在归一化时抽进 level，五行 / 装备角色仍留在 requires 里
                         只给浮片读，界面不再编辑。 -->
                    <div class="id-pair gear-kind character-detail-pair">
                        <label class="slip-row sm">
                            <span class="slip-name">类型</span>
                            <input
                                v-model="detail.kind"
                                class="field num-slot slip-input"
                                aria-label="装备类型"
                                placeholder="类型"
                            />
                        </label>
                        <label class="slip-row sm">
                            <span class="slip-name">等级</span>
                            <NumberField
                                class="field num-slot slip-input"
                                :model-value="detail.level ?? 0"
                                label="装备等级"
                                zero-as-empty
                                @update:model-value="detail.level = $event || undefined"
                            />
                        </label>
                    </div>
                </div>
            </header>

            <GearProperties :detail="detail" :slot-name="slotName" editable>
                <template #label="{ group }">
                    <SelectField
                        v-if="group.items[0].source === 'lines'"
                        v-model="group.items[0].row.label"
                        :options="
                            withCurrentOption(gearEffectOptions(slotName), group.items[0].row.label)
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
                            danger
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
                                withCurrentOption(gearConditionOptions(slotName), item.row.label)
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
                            danger
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
                            danger
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
.gear-identity .gear-form-icon {
    --tile-w: 64px;
    --tile-h: 64px;
    --shot: 56px;
    --tile-r: var(--r-3);
}
.gear-form-mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: var(--r-3);
    background: var(--paper-2);
    color: var(--ochre);
    font-size: var(--fs-lg);
}
.gear-kind .slip-name {
    white-space: nowrap;
}
.gear-kind .slip-input {
    min-width: 0;
}
/* 类型是文字、等级是数：两格都收进票面那枚凹槽。等级这格由 `NumberField` 自己的
 * 72 宽收回到票宽——它那条是 0-1-0，压不过 `.slip-row .field.slip-input`（0-3-0），
 * 所以不必再写一遍宽度。 */
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
    background: var(--slip-base);
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
}
.stat-row:has(.stat-extra) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) calc(26px * var(--fs-scale));
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
    color: var(--danger);
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
    padding: 12px 16px 0;
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

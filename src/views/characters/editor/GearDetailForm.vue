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
    <PaperCard class="gear-form">
        <div class="gear-content">
            <header class="gear-identity">
                <IconTile v-if="icon" class="gear-form-icon" :src="icon" />
                <span v-else class="gear-form-mark" aria-hidden="true">{{ slotName[0] }}</span>
                <div class="gear-id">
                    <div class="gear-name-row">
                        <label class="gear-name-field">
                            <input
                                class="field gear-name-input"
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
                    <div class="id-pair gear-kind">
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
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: var(--w-hair) solid var(--rule);
}
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
.gear-id {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
}
.gear-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.gear-name-field {
    flex: 1;
    min-width: 0;
}
.gear-name-input {
    width: 100%;
    height: calc(30px * var(--fs-scale));
    padding: 0 6px;
    color: var(--ink);
    font-size: var(--fs-md);
}
.id-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px;
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

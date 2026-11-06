<script setup lang="ts">
import { computed, ref } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import EditorRail from './EditorRail.vue';
import type { RailItem } from './rail';
import { PET_PILL_SLOTS, PET_QUALITY_FIELDS, PET_SKILL_SLOTS, type Pet } from '../character';

/**
 * 召唤兽：**左栏常驻全部兽名，右侧只编选中的那一只**（2026-11-05 改，方案 P3）。
 *
 * 旧版是「一只一行、展开填细节」：一次只能开一只，展开第二只时第一只收起，
 * 下面整块内容移走几百像素。装备页刚因为同一个理由换成了左栏（方案 E2），
 * 这两页是同一个弹窗里的两个分区，**形状该是一套**，否则每次切页签都要重认版面。
 *
 * 召唤兽比装备更适合左栏：一只兽的全部字段（身份七项 + 六项资质 + 属性 + 技能）
 * 一屏放得下，而装备那一件要分六段。于是右栏在这里是**一整张表**，不是目录里的
 * 一页；左栏仍然只做一件事——「现在在编哪一只」。
 *
 * 顺带解决两件事：
 *   · 每行一枚五行章（22，与装备左栏那枚 22 的小白盘同尺寸、同一套压印）；
 *   · 行尾一个点，加顶端「N 只」，哪几只还是空壳一眼数得出。
 *
 * **两栏各自滚**（2026-11-06 用户：「左右部分滚动不联动」），左栏的 `sticky` 同一天删掉。
 * 行高与装备统一到 34（用户：「两个的左边里面项的大小保持一致」），
 * 行尾那枚 × 是**真的删掉这一只**（装备那边是「清空这一件」，两件事，文案分开写）。
 */
const pets = defineModel<Pet[]>({ required: true });

/** 当前编辑的**下标**。用下标而不是对象引用：`defineModel` 拿到的数组可能整份被替换
 *  （名册读档、撤销），对象引用会静默失效；下标越界由 `current` 兜成 `null`。 */
const selected = ref(0);

const current = computed<Pet | null>(() => pets.value[selected.value] ?? null);

/**
 * 「这一只填了没有」——任何一处有内容就算。
 *
 * 不用「名字非空」这一条：先录等级、后补名字是常态，那时点应该是实的；
 * 也不看 `quality` 的默认 0（新建的兽六项都是 0，那是「没填」不是「填了 0」）。
 */
function filled(pet: Pet): boolean {
    return Boolean(
        pet.name?.trim() ||
        pet.level ||
        pet.joinLevel ||
        pet.life ||
        pet.growth?.trim() ||
        pet.element?.trim() ||
        pet.spirit !== undefined ||
        pet.attrs.length ||
        pet.skills.length ||
        pet.innerPills.length ||
        Object.values(pet.quality).some(Boolean),
    );
}

/** 左栏一行显示的名字：留空时给「未命名」，否则五行章旁边是一片空白，读不出这是一只兽。 */
function petName(pet: Pet): string {
    return pet.name?.trim() || '未命名';
}

/** 五行章里的字。没填时给破折号而不是留空——空格子读作「这里坏了」。 */
function petMark(pet: Pet): string {
    return pet.element?.trim()?.[0] ?? '—';
}

/**
 * 左栏的行数据。`key` 用**下标**而不是名字：名字可以重复、可以空着，
 * 而且改名时按名字定位会瞬间丢选中。下标与 `selected` 本来就是同一个坐标系。
 */
const railItems = computed<RailItem[]>(() =>
    pets.value.map((pet, index) => ({
        key: String(index),
        name: petName(pet),
        label: `编辑第 ${index + 1} 只召唤兽：${petName(pet)}`,
        filled: filled(pet),
        mark: petMark(pet),
        /* 召唤兽的 × 是**真的删掉这一只**，与装备那边「清空这一件」不是同一件事，
         * 所以文案写「删除第 N 只」——只说「删除」看不出删的是谁。 */
        kill: `删除第 ${index + 1} 只召唤兽：${petName(pet)}`,
    })),
);

/** 左栏抛上来的是下标字符串。越界由 `current` 兜成 `null`，这里不额外判。 */
function selectAt(key: string) {
    selected.value = Number(key);
}

function addPet() {
    pets.value.push({
        name: '',
        level: 0,
        joinLevel: 0,
        quality: { attack: 0, defense: 0, hp: 0, mp: 0, speed: 0, dodge: 0 },
        life: 0,
        growth: '',
        element: '',
        attrs: [],
        skills: [],
        innerPills: [],
    });
    selected.value = pets.value.length - 1;
}

/**
 * 删掉第几只：左栏行尾那枚 × 的动作（2026-11-06 用户：「都可以删除新增」）。
 * 下标从 `key` 里来（构造时写成 `String(index)`）。
 *
 * 选中项要跟着挪：删的排在选中项**之前** → 选中项整体前移一格（还是同一只兽）；
 * 删的是选中项或它之后的 → 原地不动，越过末尾时退到最后一个。一只都不剩时
 * `selected` 归 0、`current` 变 `null`，右侧回到空态。
 */
function removeAt(key: string) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= pets.value.length) return;
    pets.value.splice(index, 1);
    if (index < selected.value) selected.value -= 1;
    if (selected.value >= pets.value.length) selected.value = Math.max(0, pets.value.length - 1);
}

/**
 * 详情窗底部那枚「删除这一只」：等价于点它自己那一行尾的 ×。
 * 删完选**同一位置的下一只**（它顶上来的是同一个行序），没有下一只就退到上一只。
 */
function removeCurrent() {
    if (!current.value) return;
    removeAt(String(selected.value));
}

/* 技能与内丹都是「一串名字」。用 textarea + `@change`（失焦才解析）而不是 `v-model`：
 * 每敲一个字就 split 再 join 会把用户正在输入的那一格重排，光标跳到行首。
 * 顿号、逗号、空格、换行都当分隔符——手抄游戏面板时四种都会出现。 */
function readNames(event: Event): string[] {
    return (event.target as HTMLTextAreaElement).value
        .split(/[,，、\s]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}

const nameList = (list: string[]) => list.join('、');
</script>

<template>
    <div class="pet-editor">
        <!-- 左栏是这张表单的目录：从上到下就是列表里的顺序，高度不变，
             所以「我在改哪一只」由位置回答，不用读标题。
             行高 34 与装备页同一个数（`EditorRail` 的默认值），行尾 × 删掉这一只，
             底部「＋ 加一只」添一只——增删都在目录里，不用滚到详情底部。 -->
        <EditorRail
            label="召唤兽"
            :count="pets.length"
            suffix=" 只"
            :items="railItems"
            :selected="String(selected)"
            @pick="selectAt"
            @kill="removeAt"
        >
            <template #footer>
                <button type="button" class="rail-add" aria-label="加一只召唤兽" @click="addPet">
                    ＋ 加一只
                </button>
            </template>
        </EditorRail>

        <!-- `pet-block` 这个名字留着：烟测按 `.pet-block` 定位这一只的输入格，
             而新结构里同时只有一只在页面上，正好是它。 -->
        <div v-if="current" class="pet-block well upright">
            <!-- 身份七格：名字占两格，其余各一格。标签在上、值在下——
                 这一页的列宽只有 99，标签放左边会把输入格压到 60 以下。 -->
            <div class="id7">
                <label class="id-cell span-2">
                    <span class="id-k">名字</span>
                    <input
                        v-model="current.name"
                        class="field"
                        aria-label="召唤兽名称"
                        placeholder="召唤兽名称"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">等级</span>
                    <NumberField
                        :model-value="current.level"
                        label="等级"
                        @update:model-value="current.level = $event"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">参战等级</span>
                    <NumberField
                        :model-value="current.joinLevel"
                        label="参战等级"
                        @update:model-value="current.joinLevel = $event"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">成长</span>
                    <input
                        v-model="current.growth"
                        class="field"
                        aria-label="成长"
                        placeholder="1.202"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">五行</span>
                    <input
                        v-model="current.element"
                        class="field"
                        aria-label="五行"
                        placeholder="火"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">寿命</span>
                    <NumberField
                        :model-value="current.life"
                        label="寿命"
                        @update:model-value="current.life = $event"
                    />
                </label>
                <label class="id-cell">
                    <span class="id-k">灵性</span>
                    <NumberField
                        :model-value="current.spirit ?? 0"
                        zero-as-empty
                        label="进阶灵性"
                        placeholder="未进阶"
                        @update:model-value="current.spirit = $event || undefined"
                    />
                </label>
            </div>

            <!-- 六项资质写死标签、只给数值：这六项是游戏面板的固定行，
                 让用户自己敲「攻击资质」四个字，等于每次录入都重抄一遍面板。
                 一行六格，从左到右就是面板那六行。 -->
            <div class="sec-head"><span class="section-mark"></span>资质</div>
            <div class="q6">
                <label v-for="field in PET_QUALITY_FIELDS" :key="field.key" class="q-cell">
                    <span class="id-k">{{ field.label }}</span>
                    <NumberField
                        :model-value="current.quality[field.key]"
                        :label="`${field.label}资质`"
                        @update:model-value="current.quality[field.key] = $event"
                    />
                </label>
            </div>

            <!-- 战斗属性两列：只记上限，条目数不定，所以「加一条」跟着小标题走。 -->
            <div class="sec-head">
                <span class="section-mark"></span>战斗属性
                <span class="meta">只记上限</span>
                <PressButton
                    class="sec-act"
                    icon="add"
                    text="加一条"
                    label="加一条战斗属性"
                    @click="current.attrs.push({ label: '', value: '' })"
                />
            </div>
            <div class="attrs">
                <div v-for="(attr, ai) in current.attrs" :key="ai" class="attr">
                    <input
                        v-model="attr.label"
                        class="field attr-label"
                        aria-label="属性名"
                        placeholder="气血"
                    />
                    <input
                        v-model="attr.value"
                        class="field attr-value"
                        aria-label="属性值"
                        placeholder="1773"
                    />
                    <PressButton
                        icon="trash"
                        label="删掉这条属性"
                        @click="current.attrs.splice(ai, 1)"
                    />
                </div>
            </div>
            <p v-if="!current.attrs.length" class="hint">还没有战斗属性，点上面的「加一条」</p>

            <div class="lists">
                <label class="list-block">
                    <span class="list-k">
                        技能
                        <i class="cnt num">{{ current.skills.length }} / {{ PET_SKILL_SLOTS }}</i>
                    </span>
                    <textarea
                        class="field area"
                        rows="2"
                        aria-label="已学技能，顿号或逗号分隔"
                        placeholder="连击、必杀、吸血"
                        :value="nameList(current.skills)"
                        @change="current.skills = readNames($event)"
                    />
                    <!-- 一排小格：满没满不用数顿号。超出上限时前 N 格全实、计数仍说真话
                         （`13 / 12`）——这种数据不该被 `Math.min` 悄悄藏起来。 -->
                    <span class="dots" aria-hidden="true">
                        <i
                            v-for="n in PET_SKILL_SLOTS"
                            :key="n"
                            :class="{ on: n <= current.skills.length }"
                        ></i>
                    </span>
                </label>
                <label class="list-block">
                    <span class="list-k">
                        内丹
                        <i class="cnt num"
                            >{{ current.innerPills.length }} / {{ PET_PILL_SLOTS }}</i
                        >
                    </span>
                    <textarea
                        class="field area"
                        rows="2"
                        aria-label="内丹名，顿号或逗号分隔"
                        placeholder="狂怒、坚甲"
                        :value="nameList(current.innerPills)"
                        @change="current.innerPills = readNames($event)"
                    />
                    <span class="dots" aria-hidden="true">
                        <i
                            v-for="n in PET_PILL_SLOTS"
                            :key="n"
                            :class="{ on: n <= current.innerPills.length }"
                        ></i>
                    </span>
                </label>
            </div>

            <div class="pet-foot">
                <span class="hint">名字留空的保存时会被丢掉</span>
                <PressButton
                    icon="trash"
                    text="删掉这一只"
                    :label="`删掉 ${petName(current)}`"
                    @click="removeCurrent"
                />
            </div>
        </div>

        <p v-else class="empty-note">还没有召唤兽，点左栏下面的「加一只」</p>
    </div>
</template>

<style scoped>
/* 左右两栏：左栏 152 与装备页同一个数——两页是同一个弹窗里的两个分区，
 * 切页签时目录不该忽宽忽窄。名字最长「天狗（人形）」六个字，152 放得下。
 *
 * **两栏各是一道竖槽**（2026-11-06，与装备页同一轮、同一条理由）：原先是左栏裸着、
 * 右栏一条 `border-left`，读作「一张表单被划开了」；两边各自凹进去之后才是
 * 「同一层架子上的两列」，与开发页「原子组件」那一对完全同构。 */
.pet-editor {
    display: grid;
    /* 两栏等高：装备那页详情长，空出来的那截是「这一栏的底」（见 `GearEditor`）。 */
    grid-template-columns: 152px minmax(0, 1fr);
    gap: 12px;
    /* 铺满内容区的可视高度，两栏各自滚（与装备页同一条，见 `GearEditor` 的注释）。 */
    height: 100%;
    min-height: 0;
}

/* 「加一只」是往目录里添一行，所以长得像一行虚线，不是一个按钮：
 * 它跟着那几行走，位置只由「现在几只」决定。
 * 左右各让 2 与目录行同宽（槽有 4 的内衬，行再让 2）——不齐的话，
 * 虚线框会比上面那几枚浅纸键宽出一圈，读作「另一个东西」。 */
.rail-add {
    /* 与目录行同高同宽：它是「往这一列里再添一行」，高度跟着 `--rail-h` 走
     * （原来写死 30，行高统一到 34 之后会矮一截）。 */
    height: var(--rail-h);
    margin: 5px 2px 0;
    border: var(--w-hair) dashed color-mix(in srgb, var(--rule-2) 82%, transparent);
    border-radius: var(--r-2);
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
    cursor: pointer;
}
.rail-add:hover {
    border-color: var(--cinnabar);
    color: var(--cinnabar);
}
.rail-add:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

/* 右侧详情：与左栏同一道竖槽（模板上的 `well upright`），只给内衬与圆角。
 * 深度由 `base.css` 那一处说了算；原来那条 `border-left` 已删——两块槽之间的
 * 界线由槽自己的边交代，再画一道就成了「槽里还套着一条线」。 */
.pet-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px 8px;
    border-radius: var(--r-2);
    /* 自己滚：召唤兽的字段比可视区矮时不出轨道，但 `stable` 让宽度恒定，
     * 与装备页切来切去时不会整块抖（见 `GearEditor` 的 `.pane-detail`）。 */
    overflow: auto;
    scrollbar-gutter: stable;
}

/* ---------- 身份七格 ---------- */
.id7 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 14px;
}
.id-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.id-cell.span-2 {
    grid-column: span 2;
}
.id-k {
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
    line-height: 1;
}
/* 输入格吃掉整格宽：`NumberField` 自己兜的是 72，在 99 的列里会留一段空白；
 * 选择器要带 `.id-cell` / `.q6` 一层——`NumberField` 的 scoped 规则与这里同特异性，
 * 谁赢取决于注入顺序，多一层父选择器才稳（GearEditor 那条同一个坑）。 */
.id-cell .field,
.id-cell :deep(.number-field) {
    width: 100%;
}

/* ---------- 资质六格 ---------- */
.sec-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 4px;
}
.sec-head .section-mark {
    align-self: center;
}
/* 「加一条」推到右端：它属于这一段，但不像标题那样需要被读。 */
.sec-act {
    margin-left: auto;
}
.q6 {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
}
.q-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.q-cell :deep(.number-field) {
    width: 100%;
    text-align: right;
}

/* ---------- 战斗属性两列 ---------- */
.attrs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 18px;
}
.attr {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.attr-label {
    flex: none;
    width: 84px;
}
/* 数值右对齐：两列一左一右摆着时，扫的是同一列数字，不是同一列文字。 */
.attr-value {
    flex: 1;
    min-width: 0;
    text-align: right;
}

/* ---------- 技能 / 内丹 ---------- */
.lists {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-top: 3px;
}
.list-block {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.list-k {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
}
.cnt {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-style: normal;
    letter-spacing: 0.04em;
}
.list-block .area {
    width: 100%;
}
/* 一排小格。4px 高、圆角 1：再高就成进度条（那是另一个说法），
 * 再矮在暗色下会散成一条虚线。 */
.dots {
    display: flex;
    gap: 4px;
}
.dots i {
    flex: 1;
    height: 4px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--well) 62%, transparent);
}
.dots i.on {
    background: var(--num);
}

/* ---------- 页脚 ---------- */
.pet-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
    padding-top: 9px;
    border-top: var(--w-hair) solid var(--rule);
}
.pet-foot .hint {
    margin: 0;
}
.pet-foot > :last-child {
    margin-left: auto;
}

/* 空态：一只都没有时右边不留一片白，也不画一张空表。 */
.empty-note {
    margin: 0;
    padding: 40px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
}
</style>

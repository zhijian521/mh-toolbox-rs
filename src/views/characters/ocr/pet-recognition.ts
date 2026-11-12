import { loadPetAssets } from '../../../services/pet-assets';
import { PET_QUALITY_FIELDS } from '../../../services/game-rules';
import type { OcrLine } from './attr-panel';
import { findTiles, matchIcons, type Tile } from './matcher';
import { parsePetPanel, petLevelLines, type PetPanelResult } from './pet-panel';
import { petPanelLines } from './pet-panel-layout';

/** 图标只在资质窗口技能区域中比对，装备栏和左侧其他召唤兽不参与技能识别。 */
export async function recognizePetPanel(
    lines: OcrLine[],
    image: ImageData,
): Promise<PetPanelResult> {
    const { panel, skills, portraits } = await loadPetAssets();
    lines = petPanelLines(lines, panel);
    const text = (line: OcrLine) => line.text.replace(/\s+/g, '');
    const levels = petLevelLines(lines, panel);
    const selected = levels
        .map((line) => {
            let highlight = 0;
            let pixels = 0;
            for (
                let y = Math.max(0, Math.floor(line.y));
                y < Math.min(image.height, line.y + line.height);
                y++
            ) {
                for (
                    let x = Math.max(0, Math.floor(line.x));
                    x < Math.min(image.width, line.x + line.width);
                    x++
                ) {
                    const at = (y * image.width + x) * 4;
                    const [r, g, b] = image.data.subarray(at, at + 3);
                    // 黄色文字标记参战兽；当前查看项由蓝紫色行背景标记。
                    if (b > 150 && b - Math.max(r, g) > 60) highlight++;
                    pixels++;
                }
            }
            return { line, score: pixels ? highlight / pixels : 0 };
        })
        .filter((one) => one.score > 0.2)
        .sort((a, b) => b.score - a.score)[0]?.line;
    const result = parsePetPanel(lines, panel, selected);
    const qualityLabels = PET_QUALITY_FIELDS.map(
        (field) => field.label + panel.labels.qualityTitle.slice(-2),
    );
    const quality = lines.filter((line) =>
        qualityLabels.some((label) => text(line).startsWith(label)),
    );
    const element = lines.find((line) => text(line).startsWith(panel.labels.element));
    const marker = lines.find((line) => text(line) === panel.labels.qualityTitle);
    let region: Tile | null = null;
    if (quality.length >= 2 || marker) {
        const x = quality.length
            ? Math.min(...quality.map((line) => line.x))
            : Math.max(0, marker!.x - marker!.width * 0.6);
        const tail = lines.filter((line) =>
            panel.qualityTail.some((key) => text(line).startsWith(panel.labels[key])),
        );
        const last = element ?? [...quality, ...tail].sort((a, b) => b.y - a.y)[0];
        if (last) {
            const y = Math.ceil(last.y + last.height * 1.5);
            region = {
                x: Math.max(0, Math.floor(x - last.height)),
                y,
                width: Math.min(image.width - x + last.height, last.height * 18),
                height: image.height - y,
            };
        }
    }
    const tiles = region
        ? findTiles(image).filter(
              (tile) =>
                  tile.x >= region!.x &&
                  tile.y >= region!.y &&
                  tile.x + tile.width <= region!.x + region!.width,
          )
        : [];
    const hits = await matchIcons(
        image,
        skills.map((entry) => ({ name: entry.name, url: entry.url })),
        {
            tiles,
            sampleSize: 32,
            floor: 0.65,
            margin: 0.04,
            onAmbiguous: (names) => {
                (result.ambiguousSkills ??= []).push(names);
            },
            // 低级蓝字与高级红字可能同形；保留颜色，避开边框和左上角认证标记。
            appearance: { color: true, inset: 0.08, ignoreTopLeft: 0.26 },
        },
    );
    if (hits.length) {
        result.patch.skills = hits
            .sort((a, b) =>
                Math.abs(a.box.y - b.box.y) > Math.min(a.box.height, b.box.height) * 0.5
                    ? a.box.y - b.box.y
                    : a.box.x - b.box.x,
            )
            .map((hit) => hit.name);
        result.skillCount = hits.length;
        result.hit += hits.length;
    }
    // 选中等级行左侧即当前头像；不按自定义名称推断物种。
    const level = selected ?? (levels.length === 1 ? levels[0] : undefined);
    if (level && result.patch.level !== undefined) {
        const side = Math.round(level.height * 2.5);
        const box = {
            x: Math.round(level.x - side - level.height * 0.25),
            y: Math.round(level.y - side + level.height * 1.2),
            width: side,
            height: side,
        };
        if (
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + side <= image.width &&
            box.y + side <= image.height
        ) {
            const seen = new Set<string>();
            const candidates = portraits.filter((entry) => {
                const key = entry.fingerprint ?? entry.url;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            const matches = await matchIcons(
                image,
                candidates.map((entry) => ({ name: entry.id, url: entry.url })),
                {
                    tiles: [box],
                    floor: 0.72,
                    margin: 0.08,
                    sampleSize: 32,
                },
            );
            if (matches[0]) {
                result.patch.portrait = matches[0].name;
                result.hit++;
            }
        }
    }
    return result;
}

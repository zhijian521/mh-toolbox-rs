import { attributes } from './ocr/attributes.mjs';
import { skills } from './ocr/skills.mjs';
import { assists } from './ocr/assists.mjs';
import { training } from './ocr/training.mjs';
import { draft } from './ocr/draft.mjs';
import { queue } from './ocr/queue.mjs';
import { createOcrTools } from './ocr/shared.mjs';

export async function ocr(ctx) {
    const scenarios = { attributes, skills, assists, training, draft, queue };
    const selected = new Set(ctx.ocrScenarios ?? Object.keys(scenarios));
    const tools = createOcrTools(ctx);
    for (const [key, run] of Object.entries(scenarios)) {
        if (selected.has(key)) await run(ctx, tools);
    }
}

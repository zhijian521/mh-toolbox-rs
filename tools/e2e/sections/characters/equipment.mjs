import { entry } from './equipment/entry.mjs';
import { quick } from './equipment/quick.mjs';
import { batch } from './equipment/batch.mjs';
import { originals } from './equipment/originals.mjs';
import { createEquipmentTools } from './equipment/shared.mjs';

export async function equipment(ctx) {
    const scenarios = { entry, quick, batch, originals };
    const selected = new Set(ctx.equipmentScenarios ?? Object.keys(scenarios));
    const tools = createEquipmentTools(ctx);
    for (const [key, run] of Object.entries(scenarios)) {
        if (selected.has(key)) await run(ctx, tools);
    }
}

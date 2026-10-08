import { readJson, compose } from './core.mjs';
import { composeFocused } from './focused.mjs';
const [variant, inputPath, stage] = process.argv.slice(2);
try {
  if (!inputPath)
    throw new Error('Usage: compose.mjs A|B|C input.json [semantics|implementation|verification]');
  if (stage && variant !== 'C') throw new Error('Focused stages apply only to C.');
  const input = readJson(inputPath);
  // Verification preview has no candidate reports until both investigations finish.
  process.stdout.write(
    variant === 'C' ? composeFocused(stage || 'semantics', input) : compose(variant, input),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

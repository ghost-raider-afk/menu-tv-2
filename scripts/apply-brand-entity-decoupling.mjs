import { readFile, writeFile } from 'node:fs/promises';

async function replace(path, from, to, label) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(from)) throw new Error(`${path}: missing ${label}`);
  await writeFile(path, source.replace(from, to));
}

await replace(
  'src/web/admin-ui/public/animation.html',
  '<input id="animation-brand-text" type="text" maxlength="80" value="MIRA-TV" />',
  '<input id="animation-brand-text" type="text" maxlength="80" placeholder="Например: БАР МАЯК" />',
  'hard-coded MIRA-TV Brand Entity value'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `    node.addEventListener(eventName, () => {\n      currentBrand = brandFromControls();\n      syncBrandControls(currentBrand);\n      renderBrandPreview();\n    });`,
  `    node.addEventListener(eventName, () => {\n      currentBrand = brandFromControls();\n      // Text is an editable draft: do not rewrite the input on every keystroke.\n      // Re-syncing it here used to restore the product-brand fallback and move the caret.\n      if (id !== 'animation-brand-text') syncBrandControls(currentBrand);\n      renderBrandPreview();\n    });`,
  'Brand Entity input listener'
);

await replace(
  'tests/animation-studio.test.js',
  `  assert.equal(parsed.brand.text, 'MIRA-TV');`,
  `  assert.equal(parsed.brand.text, '');`,
  'legacy product-brand default assertion'
);

await replace(
  'tests/animation-studio.test.js',
  `  assert.equal(brand.effect, 'neon-pulse');\n  const aquarium = aquariumInput`,
  `  assert.equal(brand.effect, 'neon-pulse');\n  assert.equal(brandTitleInput({}).text, '');\n  assert.throws(() => brandTitleInput({ enabled: true, text: '' }), /Введите название бренда/);\n  assert.equal(brandTitleInput({ enabled: true, text: 'MIRA-TV' }).text, 'MIRA-TV');\n  const aquarium = aquariumInput`,
  'Brand Entity validation coverage'
);

console.log('Brand Entity decoupling patch applied');

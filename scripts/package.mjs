import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const target = process.env.BROWSER_TARGET ?? 'chrome';
if (!['chrome', 'firefox', 'edge'].includes(target)) throw new Error(`Unsupported BROWSER_TARGET: ${target}`);
const manifest = JSON.parse(await readFile(`manifest/${target}.json`, 'utf8'));
await mkdir('dist/icons', { recursive: true });
await cp('icons', 'dist/icons', { recursive: true });
await mkdir('dist/src/sidepanel', { recursive: true });
await cp('styles.css', 'dist/styles.css');
await cp('src/sidepanel/writing-assistant.css', 'dist/src/sidepanel/writing-assistant.css');
const sidePanelHtml = await readFile('sidepanel.html', 'utf8');
await writeFile('dist/sidepanel.html', sidePanelHtml.replace('./dist/sidepanel.js', './sidepanel.js'));
if (target === 'firefox') {
  manifest.background = { scripts: ['background.js'] };
  manifest.sidebar_action.default_panel = 'sidepanel.html';
} else {
  manifest.background = { service_worker: 'background.js', type: 'module' };
  manifest.side_panel = { default_path: 'sidepanel.html' };
}
manifest.content_scripts[0].js = ['content.js'];
manifest.icons = { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' };
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));

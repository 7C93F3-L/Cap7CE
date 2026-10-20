const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const files = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
  .flatMap(item => item.isDirectory() ? files(`${directory}/${item.name}`) : [`${directory}/${item.name}`]);
for (const file of files('shell/Cap7CE.WinUI').filter(name => name.endsWith('.cs'))) {
  const source = read(file);
  assert(!/Microsoft\.Data\.Sqlite|Core\.Catalog|Core\.Host|FileSystemWatcher/.test(source), `${file}: UI cannot own Catalog, Reader or indexing`);
  assert(source.split('\n').length <= 260, `${file}: split responsibilities before growing beyond 260 lines`);
}
const host = read('shell/Cap7CE.QueryHost/Program.cs').replace(/\/\/[^\r\n]*/g, '');
assert(!/\.InitializeAsync|ActivateMaintenanceAsync|ConfigureMetadataBuild|StartSynchronization|FileFactHostSession/.test(host), 'query host must never activate storage writes or maintenance');
const allowed = host.match(/var allowed =[\s\S]*?\};/)[0];
assert.deepEqual([...allowed.matchAll(/CoreOperations\.(\w+)/g)].map(m => m[1]).sort(),
  ['CatalogStatus', 'CatalogResolveScope', 'SearchStart', 'SearchNextPage', 'SearchCancel', 'SearchManualKeywords'].sort());
assert(host.includes('if (interactive) { allowed.Add(CoreOperations.KeywordsRead); allowed.Add(CoreOperations.KeywordsWrite); }'), 'manual keyword admission must require interactive composition');
assert.deepEqual([...host.matchAll(/allowed\.Add\(CoreOperations\.(\w+)\)/g)].map(m => m[1]).sort(), ['KeywordsRead', 'KeywordsWrite']);
const session = read('core/src/Cap7CE.Core.Host/CorePipeSession.cs');
assert(session.indexOf('!allowedOperations.Contains(request.Operation)') < session.indexOf('var response = await dispatcher.DispatchAsync'), 'admission must precede dispatcher');
assert(session.includes('allowedOperations is null || allowedOperations.Contains(operation)'), 'hello cannot advertise forbidden operations');
const project = read('shell/Cap7CE.WinUI/Cap7CE.WinUI.csproj');
assert(project.includes('<WindowsPackageType>None</WindowsPackageType>'));
assert(read('shell/Directory.Build.props').includes('<RuntimeIdentifier>win-x64</RuntimeIdentifier>'));
assert(!/arm64|win-x86/.test(project + read('shell/Directory.Build.props')));
assert(read('shell/Cap7CE.WinUI/Controls/ResultsView.cs').includes('ItemsWrapGrid'), 'preserve native grid virtualization');
assert(read('shell/Cap7CE.WinUI/Controls/FilterBar.cs').includes('VariableSizedWrapGrid'), 'standalone filter children require a nonvirtualizing panel, not an ownerless WrapGrid');
assert(read('shell/Cap7CE.WinUI/Themes/ShellResources.xaml').includes('<controls:AssetTile/>'), 'custom tile must appear in compiled XAML to generate WinUI activation metadata');
assert(/Unloaded\s*\+=/.test(read('shell/Cap7CE.WinUI/Controls/AssetTile.cs')), 'recycled tiles must release pixels');
assert(read('shell/Cap7CE.WinUI/Services/VisualConnection.cs').includes('Cap7CE-PhaseF'), 'visual cache must be separate from production');
const theme = read('shell/Cap7CE.WinUI/Themes/ThemeService.cs');
assert(theme.includes('MicaKind.BaseAlt') && theme.includes('MicaKind.Base') && theme.includes('DesktopAcrylicBackdrop'));
assert(!/\.css|\.tsx|assets\/icons\/\*/.test(project), 'only active native UI and selected icon families belong in the project');
const nativeUi = files('shell/Cap7CE.WinUI').filter(f => /\.(cs|xaml)$/.test(f)).map(read).join('\n');
assert(!/LineWindow|toggleLine|lineMode|DemoAssets|FakeData/.test(nativeUi), 'excluded standby line and discarded demo UI must not return');
const commands = read('shell/Cap7CE.WinUI/Services/FileCommands.cs');
assert(commands.includes('BeforeMutation?.Invoke()') && commands.includes('ReleaseSourcesAsync') && commands.includes('deletedPaths'));
console.log('WinUI shell boundaries passed');

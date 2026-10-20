const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const modelFiles = ['AssetCollection', 'AssetItem', 'BrowseFilter', 'FileFormat', 'FormatRegistry', 'HomeEntries', 'ShellPreferences']
  .map(name => `shell/Cap7CE.WinUI/Models/${name}.cs`);
for (const file of modelFiles) assert(fs.existsSync(path.join(root, file)), `${file}: required WinUI model source must be present`);
const ignoredModels = require('node:child_process').spawnSync('git', ['check-ignore', '--no-index', '--stdin'],
  { cwd: root, input: modelFiles.join('\n') + '\n', encoding: 'utf8', windowsHide: true });
assert.equal(ignoredModels.status, 1, `WinUI model source must not be ignored: ${ignoredModels.stdout || ignoredModels.stderr}`);
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
assert(read('shell/Cap7CE.WinUI/Controls/Workspace/GalleryLayout.cs').includes(': VirtualizingLayout'), 'original-ratio gallery must remain virtualized');
for (const name of ['Models/GalleryGeometry', 'Models/WorkspacePathRules', 'Controllers/WorkspaceSelection'])
  assert(!/Microsoft\.UI|Services|PreferenceStore|\.RequestAsync/.test(read(`shell/Cap7CE.WinUI/${name}.cs`)), `${name}: geometry and selection must stay pure`);
assert(read('shell/Cap7CE.WinUI/Themes/WorkspaceResources.xaml').includes('<controls:GalleryTile/>'), 'gallery tile needs compiled activation metadata');
assert(read('shell/Cap7CE.WinUI/Controls/ResultsGridLayout.cs').includes('grid.ItemsPanelRoot is ItemsWrapGrid'), 'compact row must retain the existing virtualizing panel');
const filterBar = read('shell/Cap7CE.WinUI/Controls/FilterBar.cs');
assert(!/new\s+(?:Items)?WrapGrid|ItemsPanel/.test(filterBar), 'standalone filter options must use nonvirtualizing Grid/StackPanel layout');
assert(filterBar.includes('FilterPresets') && filterBar.includes('FilterFlyouts'), 'top filters must share presets and a single flyout owner');
assert(read('shell/Cap7CE.WinUI/App.xaml').includes('Themes/FilterResources.xaml'), 'top filter visuals must use compiled shared theme resources');
assert(read('scripts/winui-resources.cjs').includes('winui-filter-resources.cjs'), 'native visual filters must generate constraints from the existing semantic owner');
assert(read('scripts/winui-resources.cjs').includes('winui-advanced-filter-resources.cjs'), 'native advanced presets must be generated from the current mainline converters');
assert(read('shell/Cap7CE.WinUI/Controls/Filters/FactFilterStrip.cs').includes('AdvancedFilterPanel'), 'specialized facts must use the shared advanced filter component');
assert(!/brightnessMean|saturationMean|borderWhiteRatio/.test(read('shell/Cap7CE.WinUI/Models/VisualFilterRules.cs')), 'native visual filters must not duplicate semantic thresholds');
const availabilityController = read('shell/Cap7CE.WinUI/Controllers/FilterAvailabilityController.cs');
assert(!/Microsoft\.UI|System\.IO|Services|PeriodicTimer|DispatcherTimer|Task\.Delay/.test(availabilityController), 'availability scheduling must stay UI-independent and event-driven');
const availability = read('shell/Cap7CE.WinUI/Services/FilterAvailabilityService.cs');
assert(!/CatalogBuild|CatalogRebuild|metadata\.build|MetadataBuild|KeywordsWrite|Timer|Task\.Delay/.test(availability), 'filter probes cannot start extraction, write operations or polling');
assert(!/new\s+CoreSearch(?:AspectRange|IntegerRange)/.test(read('shell/Cap7CE.WinUI/Models/MediaFilterRules.cs')), 'native media presets must use generated mainline bounds');
assert(read('shell/Cap7CE.WinUI/Themes/ShellResources.xaml').includes('<controls:AssetTile/>'), 'custom tile must appear in compiled XAML to generate WinUI activation metadata');
assert(/Unloaded\s*\+=/.test(read('shell/Cap7CE.WinUI/Controls/AssetTile.cs')), 'recycled tiles must release pixels');
assert(read('shell/Cap7CE.WinUI/Services/VisualConnection.cs').includes('Cap7CE-PhaseF'), 'visual cache must be separate from production');
const theme = read('shell/Cap7CE.WinUI/Themes/ThemeService.cs');
const sidebarAssets = read('scripts/winui-sidebar-assets.cjs');
assert(!/\.tsx|\.css/.test(sidebarAssets), 'sidebar asset extraction must not import old UI code or styles');
assert(read('shell/Cap7CE.WinUI/Themes/SidebarResources.xaml').includes('<controls:SidebarIcon'), 'sidebar vectors must have compiled XAML activation metadata');
assert(!/FontIcon|Ui\.Icon\(/.test(read('shell/Cap7CE.WinUI/Controls/SidebarView.cs')), 'sidebar visuals must use theme-aware vectors instead of font or fixed-color image fallbacks');
const layoutPolicy = read('shell/Cap7CE.WinUI/Controllers/WorkspaceLayoutPolicy.cs');
assert(!/Microsoft\.UI|System\.IO|Services|PreferenceStore/.test(layoutPolicy), 'responsive policy must stay independent of UI and persistence');
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml.cs').includes('WorkspaceLayoutController'), 'main window must compose the shared layout controller');
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml').includes('<controls:PaneResizer'), 'resizer must be included in compiled XAML activation metadata');
assert(theme.includes('MicaKind.BaseAlt') && theme.includes('MicaKind.Base') && theme.includes('DesktopAcrylicBackdrop'));
assert(!/\.css|\.tsx|assets\/icons\/\*/.test(project), 'only active native UI and selected icon families belong in the project');
const nativeUi = files('shell/Cap7CE.WinUI').filter(f => /\.(cs|xaml)$/.test(f)).map(read).join('\n');
assert(!/LineWindow|toggleLine|lineMode|DemoAssets|FakeData/.test(nativeUi), 'excluded standby line and discarded demo UI must not return');
const commands = read('shell/Cap7CE.WinUI/Services/FileCommands.cs');
assert(commands.includes('BeforeMutation?.Invoke()') && commands.includes('ReleaseSourcesAsync') && commands.includes('deletedPaths'));
console.log('WinUI shell boundaries passed');

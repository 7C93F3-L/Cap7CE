const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
require('./winui-language-check.cjs')(root);
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
  // Launching the existing product executable is allowed; referencing its implementation is not.
  const dependencies = source.replaceAll('Cap7CE.Core.Host.exe', 'native-product-host.exe');
  assert(!/Microsoft\.Data\.Sqlite|Core\.Catalog|Core\.Host|FileSystemWatcher/.test(dependencies), `${file}: UI cannot own Catalog, Reader or indexing`);
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
const identitySource=read('shell/Cap7CE.WinUI/Services/ApplicationIdentity.cs');
const productIdentity="Cap7CE";
assert(identitySource.includes(`AppUserModelId="${productIdentity}"`) && project.includes('<AssemblyTitle>Cap7CE</AssemblyTitle>'), 'native public identity must match the existing product');
const startup=read('shell/Cap7CE.WinUI/Program.cs');
assert(startup.indexOf('ApplicationIdentity.Initialize()')>=0 && startup.indexOf('ApplicationIdentity.Initialize()')<startup.indexOf('WinRT.ComWrappersSupport.InitializeComWrappers()'), 'public AUMID must be set before WinRT notification or window initialization');
assert(!read('shell/Cap7CE.WinUI/Themes/ThemeService.cs').includes('window.Title = ""'), 'theme changes cannot erase system window titles');
const browseRouting = read('shell/Cap7CE.WinUI/Controllers/BrowseSession.cs');
const catalogRefresh = read('shell/Cap7CE.WinUI/MainWindow.xaml.cs');
assert(catalogRefresh.includes('sidebar.SetActiveEntry(active.EntryPath,active.PreferenceScope')
  && !catalogRefresh.includes('sidebar.SetActivePath(active.PathValue)'),
  'sidebar selection must follow the explicit workspace entry rather than the current filesystem path');
const workspacePreferences=read('shell/Cap7CE.WinUI/Controllers/WorkspacePreferencesController.cs');
assert(workspacePreferences.includes('Preferences.UpdateAsync') && workspacePreferences.includes('WorkspaceOptions.Write')
  && read('shell/Cap7CE.WinUI/Controls/WorkspaceToolbar.cs').includes('value.AddressRevision')
  && read('shell/Cap7CE.WinUI/Controls/Workspace/WorkspaceAddress.cs').includes('searchMode=defaultSearch||nextQuery.Length>0'),
  'toolbar preferences must be scoped and editor mode reset on explicit entry');
assert(catalogRefresh.includes('active.UsesCatalogResults&&Models.CatalogRefreshRules.AffectsChange(active.PathValue,roots)')
  && catalogRefresh.includes('active is {UsesCatalogResults:true} session&&Models.CatalogRefreshRules.CanRefresh')
  && catalogRefresh.includes('CatalogRefreshRules.CanRefresh')
  && catalogRefresh.includes('CatalogRefreshRules.AffectsChange')
  && !catalogRefresh.includes('FilesystemBrowsing:false'),
  'Catalog notifications must not invalidate or rebuild the plain home or filesystem views');
assert(read('shell/Cap7CE.WinUI/Controls/ResultsView.cs').includes('CatalogRefreshRules.RetainSelection')
  && browseRouting.includes('result=Items') && browseRouting.includes('preserveSelection&&result.Count<Items.Count'),
  'background refresh must preserve existing identities, unchanged collections and loaded depth');
assert(browseRouting.includes('ForegroundBusy=>Busy&&!PreserveSelection')
  && catalogRefresh.includes('details.SetContext(active.PathValue,active.ForegroundBusy?')
  && read('shell/Cap7CE.WinUI/Controls/WorkspaceToolbar.cs').includes('refresh.IsEnabled=!value.ForegroundBusy'),
  'background refresh must not replace retained counts or disable manual refresh');
assert(catalogRefresh.includes('if(closed||catalogRefreshQueued)return;catalogRefreshQueued=true;')
  && catalogRefresh.includes('catalogRefreshQueued=false;if(CanCatalogRefresh()'),
  'queued refresh must coalesce pending dispatch and recheck interaction eligibility without a timer');
const changeService=read('shell/Cap7CE.WinUI/Services/ShellServices.cs').split('private async Task OnCatalogChanged')[1];
assert(changeService.indexOf('CatalogChanged?.Invoke(new(null,precise));return;')<changeService.indexOf('await RefreshVolumesAsync()')
  && changeService.indexOf('await Metadata.NotifyAsync()')<changeService.indexOf('CatalogChanged?.Invoke(new(null,precise));return;')
  && read('shell/Cap7CE.WinUI/Services/MetadataTasks.cs').split('public async Task NotifyAsync()')[1].split('private static JsonElement')[0].includes('InvokeAsync("notify")'),
  'precise filesystem changes must wake Core metadata maintenance without requesting volume or task status');
assert(browseRouting.includes('if(path.Length>0&&plainBrowse&&!Recursive)')
  && browseRouting.indexOf('return await BrowseFilesystemAsync(path,remember,version,token,origin)') < browseRouting.indexOf('if (services.Core?.IsConnected!=true)'),
  'direct-child browsing must remain fresh and independent of Core');
assert(browseRouting.includes('if(plainBrowse)return await BrowseFilesystemAsync')
  && browseRouting.includes('IncludeTotalCount: false'),
  'recursive browsing must retain an unindexed fallback without forcing an exact count before the first Catalog page');
assert(project.includes('<WindowsPackageType>None</WindowsPackageType>'));
assert(read('shell/Directory.Build.props').includes('<RuntimeIdentifier>win-x64</RuntimeIdentifier>'));
assert(!/arm64|win-x86/.test(project + read('shell/Directory.Build.props')));
assert(read('shell/Cap7CE.WinUI/Controls/ResultsView.cs').includes('ItemsWrapGrid'), 'preserve native grid virtualization');
const resultDoubleTap=read('shell/Cap7CE.WinUI/Controls/ResultsView.cs').split('private void OnItemDoubleTapped')[1].split('private void Context')[0];
const galleryDoubleTap=read('shell/Cap7CE.WinUI/Controls/Workspace/ResultsGallery.cs').split('private void Open(GalleryTile tile)')[1].split('private void Context')[0];
for(const source of [resultDoubleTap,galleryDoubleTap])assert(source.includes('commands.Open(item)')&&!source.includes('commands.Preview'), 'double-click uses the same default open action as the context menu, not preview');
assert(read('shell/Cap7CE.WinUI/Controls/Workspace/GalleryLayout.cs').includes(': VirtualizingLayout'), 'original-ratio gallery must remain virtualized');
for (const name of ['Models/GalleryGeometry', 'Models/WorkspacePathRules', 'Controllers/WorkspaceSelection'])
  assert(!/Microsoft\.UI|Services|PreferenceStore|\.RequestAsync/.test(read(`shell/Cap7CE.WinUI/${name}.cs`)), `${name}: geometry and selection must stay pure`);
assert(read('shell/Cap7CE.WinUI/Themes/WorkspaceResources.xaml').includes('<controls:GalleryTile/>'), 'gallery tile needs compiled activation metadata');
assert(read('shell/Cap7CE.WinUI/Controls/ResultsGridLayout.cs').includes('grid.ItemsPanelRoot is ItemsWrapGrid'), 'compact row must retain the existing virtualizing panel');
const filterBar = read('shell/Cap7CE.WinUI/Controls/FilterBar.cs');
assert(!filterBar.includes('FilterAvailabilityNotice') && !filterBar.includes('RetryAvailability')
  && filterBar.includes('facts.SetAvailability(state)'),
  'availability state must retain detailed filter gating without a status button or popup');
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
const nativeVisualConnection = read('shell/Cap7CE.WinUI/Services/VisualConnection.cs');
assert(nativeVisualConnection.includes('format?.CanShellPreview == true') && nativeVisualConnection.includes('preview ? "skim-shell-preview" : "skim-shell-thumbnail"'), 'native visuals must route registered Shell formats through both thumbnail and preview providers');
const theme = read('shell/Cap7CE.WinUI/Themes/ThemeService.cs');
const sidebarAssets = read('scripts/winui-sidebar-assets.cjs');
assert(!/\.tsx|\.css/.test(sidebarAssets), 'sidebar asset extraction must not import old UI code or styles');
assert(read('shell/Cap7CE.WinUI/Themes/SidebarResources.xaml').includes('<controls:SidebarIcon'), 'sidebar vectors must have compiled XAML activation metadata');
assert(!/FontIcon|Ui\.Icon\(/.test(read('shell/Cap7CE.WinUI/Controls/SidebarView.cs')), 'sidebar visuals must use theme-aware vectors instead of font or fixed-color image fallbacks');
const layoutPolicy = read('shell/Cap7CE.WinUI/Controllers/WorkspaceLayoutPolicy.cs');
assert(!/Microsoft\.UI|System\.IO|Services|PreferenceStore/.test(layoutPolicy), 'responsive policy must stay independent of UI and persistence');
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml.cs').includes('WorkspaceLayoutController'), 'main window must compose the shared layout controller');
const edgeController=read('shell/Cap7CE.WinUI/Controllers/EdgeCollapseController.cs');
const edgeGeometry=read('shell/Cap7CE.WinUI/Models/EdgeCollapseGeometry.cs');
const edgeMotion=read('shell/Cap7CE.WinUI/Services/EdgeCollapse/EdgeWindowMotion.cs');
const edgeInput=read('shell/Cap7CE.WinUI/Services/EdgeCollapse/EdgeInputMonitor.cs');
assert(!/Microsoft\.UI|Services|PreferenceStore|DllImport|File\.|Directory\./.test(edgeGeometry), 'edge geometry must remain a pure physical-pixel policy');
assert(!/NavigateAsync|SearchStart|RequestAsync|ItemsSource|Selection|ConfigurePin|SetWindowsHookEx/.test(edgeController+edgeMotion), 'edge lifecycle cannot requery, rebind grids or bypass native pin ownership');
assert(edgeMotion.includes('positionOnly:true') && edgeMotion.includes('180d') && edgeMotion.includes('Stop();completed();'), 'edge animation must only move the window and stop after its bounded transition');
assert(edgeController.includes('leave.IsRepeating=false') && edgeController.includes('WindowActivation.Showing+=Showing') && edgeController.includes('WindowActivation.Showing-=Showing'), 'edge mode must use one-shot dismissal and the unified activation lifecycle');
assert(edgeInput.includes('PointerCaptureLostEvent') && edgeInput.includes('RemoveHandler') && edgeInput.includes('popup.Closed'), 'edge input must cover content capture and popup completion, with paired cleanup');
assert(settingsModeConnected(), 'window-mode setting must persist through the existing preference update gate');
function settingsModeConnected() { const text=read('shell/Cap7CE.WinUI/Views/Settings/SettingsCatalog.cs');return text.includes('Current.EdgeCollapseEnabled?1:0') && text.includes('UpdateAsync(value=>value with{EdgeCollapseEnabled=index==1})'); }
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml.cs').includes('ResultDrag.IsActive') && read('shell/Cap7CE.WinUI/Controls/Workspace/GalleryTile.cs').includes('finally {dragging=false;ResultDrag.SetActive(this,false);}'), 'file drag completion must unblock auto-hide without interfering with selection');
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml').includes('<controls:PaneResizer'), 'resizer must be included in compiled XAML activation metadata');
assert(theme.includes('MicaKind.BaseAlt') && theme.includes('MicaKind.Base') && theme.includes('DesktopAcrylicBackdrop'));
assert(!/\.css|\.tsx|assets\/icons\/\*/.test(project), 'only active native UI and selected icon families belong in the project');
const nativeUi = files('shell/Cap7CE.WinUI').filter(f => /\.(cs|xaml)$/.test(f)).map(read).join('\n');
assert(read('scripts/winui-resources.cjs').includes('winui-settings-resources.cjs'), 'settings reference must be generated with native resources');
const settingsWindow = read('shell/Cap7CE.WinUI/Views/SettingsWindow.cs');
assert(settingsWindow.includes('NavigationView') && settingsWindow.includes('SettingsPages'), 'settings window only composes native navigation and pages');
assert(!/\.RequestAsync|\.SaveAsync|new ColorPicker/.test(settingsWindow), 'settings window cannot own setting actions or editors');
const settingsCatalog = read('shell/Cap7CE.WinUI/Views/Settings/SettingsCatalog.cs');
const mainlineSettings = require('./winui-settings-baseline.json').slice();
const maintenanceSettings = read('shell/Cap7CE.WinUI/Views/Settings/MaintenanceSettingsView.cs');
assert(settingsCatalog.includes('new MaintenanceSettingsView(services,owner)') && !settingsCatalog.includes('services.ShowMaintenance()'), 'settings must show maintenance inline');
assert(maintenanceSettings.includes('new IndexMaintenanceView(services)') && settingsCatalog.includes('MetadataView,true'), 'settings must host index and metadata management inline');
assert(settingsCatalog.indexOf('new MaintenanceSettingsView(services,owner)') < settingsCatalog.indexOf('"native.metadata.section","native.metadata.title"')
  && settingsCatalog.indexOf('"native.metadata.section","native.metadata.title"') < settingsCatalog.indexOf('new CacheSettingsView'), 'storage settings must retain index, metadata, cache ordering');
assert(read('shell/Cap7CE.WinUI/Controls/SidebarView.cs').includes('commands.StartMetadataAsync(item.Path)')
  && read('shell/Cap7CE.WinUI/Services/ResultContextMenu.cs').includes('commands.StartMetadataAsync(first)'), 'metadata shortcuts must share the explicit directory queue action');
// Version/update owns a standard card with a dynamic version description and shared header action.
const nativeUpdateCard = read('shell/Cap7CE.WinUI/Controls/Settings/NativeUpdateView.cs');
assert(settingsCatalog.includes('"stableSettings.section.application","","",VersionActions,true')
  && nativeUpdateCard.includes('new SettingsCard("settings.versionUpdate", "", section, localized: true, descriptionContent: version)')
  && nativeUpdateCard.includes('new SettingsSection(check, details)'), 'update card must retain the standard settings header/body layout');
const nativeSettings = [...settingsCatalog.matchAll(/Mainline\("[^"]+","[^"]+","([^"]+)","([^"]+)"/g)].map(m => `${m[1]}:${m[2]}`);
// WinUI separates the existing runtime start/stop action from version selection.
assert.deepEqual(nativeSettings.sort(), mainlineSettings.sort(), 'settings cards and copy must match the frozen native settings baseline without extra workspace controls');
assert(!/uiFontSize|preferences\.FontSize|settings\.FontSize|Current\.FontSize/.test(nativeUi)
  && !/public double FontSize/.test(read('shell/Cap7CE.WinUI/Models/ShellPreferences.cs')), 'retired native UI font preference and setting cannot return');
const settingsColors = read('shell/Cap7CE.WinUI/Controls/Settings/SettingsColors.cs');
const colorEditor = read('shell/Cap7CE.WinUI/Controls/Settings/SettingsColorEditor.cs');
assert(settingsColors.includes('new SettingsColorEditor') && colorEditor.includes('new ColorPicker') && colorEditor.includes('IsAlphaEnabled=false'), 'color editing must retain native opaque RGB spectrum');
assert(!/CoreNodeHost|\.RequestAsync|Process\.Start/.test(settingsColors + colorEditor), 'color editor only uses preference delegates');
assert(!/LineWindow|toggleLine|lineMode|DemoAssets|FakeData/.test(nativeUi), 'excluded standby line and discarded demo UI must not return');
assert(!/standbyLine|hideToLine|\bline:|win:line/.test(nativeUi), 'native UI must not expose retired line settings, shortcuts or commands');
const nativeSettingsReference = JSON.parse(read('shell/artifacts/assets/settings-reference.json'));
assert(!/standbyLine|hideToLine|stableSettings\.desc\.line|line:|win:line/.test(JSON.stringify(nativeSettingsReference)), 'native settings resources must exclude retired line copy, bindings and command help');
assert(!/uiFontSize|ui:font/.test(JSON.stringify(nativeSettingsReference)), 'native settings resources must exclude retired font size copy and commands');
assert(!/0x31\s*,/.test(read('shell/Cap7CE.WinUI/Services/NativeHotKeys.cs')), 'retired Alt+1 line binding must not be registered');
const commands = read('shell/Cap7CE.WinUI/Services/FileCommands.cs');
const autoKeywordProcessor=read('shell/Cap7CE.WinUI/Services/AutoKeywordProcessor.cs');
const keywordEditor=read('shell/Cap7CE.WinUI/Controls/Details/DetailsKeywordEditor.cs');
assert(keywordEditor.includes('await write(snapshot,values,token)') && keywordEditor.includes('if(draft.Dirty){refreshPending=true;return;}') && read('shell/Cap7CE.WinUI/Services/KeywordSelectionWriter.cs').includes('current.Revision'), 'keyword tag edits must retain explicit revision-checked save and protect dirty drafts');
assert(read('shell/Cap7CE.WinUI/Services/KeywordSelectionWriter.cs').includes('MaxDegreeOfParallelism=4') && read('shell/Cap7CE.WinUI/Services/KeywordSelectionWriter.cs').includes('KeywordBatchPolicy.Apply'), 'batch keyword editing must preserve unique words with bounded revision-checked writes');
assert(!/CoreNodeHost|RequestAsync|File\.|Directory\./.test(read('shell/Cap7CE.WinUI/Models/KeywordDraft.cs')+read('shell/Cap7CE.WinUI/Controls/Details/KeywordChip.cs')+read('shell/Cap7CE.WinUI/Controls/Details/KeywordWrapPanel.cs')), 'keyword draft and tag layout must not own storage or source reads');
assert(!fs.existsSync(path.join(root,'shell/Cap7CE.WinUI/Views/AutoKeywordWindow.cs')) && read('shell/Cap7CE.WinUI/Controllers/AutoKeywordNoticeController.cs').includes('notice.SetTask('), 'AI recognition must run directly and reuse the compact notice');
assert(read('shell/Cap7CE.WinUI/Controls/Details/DetailsKeywordEditor.cs').includes('generate(target)') && !read('shell/Cap7CE.WinUI/Controls/DetailsPane.cs').includes('file.Entry.FileReference is not null?file:null'), 'keyword card must wire generation and accept live file identities');
assert(['localKeywords.fingerprint','temporaryImage','localKeywords.generate','localKeywords.cancel','runtime.beginAI','runtime.endAI'].every(operation=>autoKeywordProcessor.includes(operation)), 'AI keywords must reuse existing visual/model owners and their cancellation/use lifetime');
assert(!/HttpClient|Process.Start|Sqlite|BitmapImage/.test(autoKeywordProcessor), 'AI keyword adapter cannot duplicate inference, model process or source decoding');
assert(read('shell/Cap7CE.WinUI/Services/AutoKeywordWriter.cs').includes('attempt<3') && read('shell/Cap7CE.WinUI/Services/AutoKeywordTargets.cs').includes('100000'), 'AI keyword writes and target collection must be bounded');
const previewSpaceKey = read('shell/Cap7CE.WinUI/Services/PreviewSpaceKey.cs');
assert(previewSpaceKey.includes('GetCurrentThreadId()') && previewSpaceKey.includes('Owns(message.Window)') && previewSpaceKey.includes('UnhookWindowsHookEx(hook)'), 'preview Space interception must be thread/window scoped and released');
assert(read('shell/Cap7CE.WinUI/Services/VisualConnection.cs').includes('!preview && format?.CanThumbnail != true'), 'grid must retain Shell fallback for formats without native image thumbnails');
const fontPreview = read('shell/Cap7CE.WinUI/Controls/FontPreviewView.cs');
assert(fontPreview.includes('64*1024*1024') && !/AddFont|Install|CoreNodeHost|RequestAsync/.test(fontPreview), 'font preview must stay bounded and cannot install fonts or create another provider');
assert(read('shell/Cap7CE.WinUI/Models/FontPreviewDocument.cs').includes('FontCharacterCoverage.Supports(font,ChineseSample)'), 'Chinese specimen must use exact source-font coverage');
const archivePreview = read('shell/Cap7CE.WinUI/Controls/ArchivePreviewView.cs');
assert(archivePreview.includes('new ListView') && archivePreview.includes('ListViewSelectionMode.None') && archivePreview.includes('truncated'), 'archive preview must keep a virtualized read-only list and report truncation');
assert(!/CoreNodeHost|RequestAsync|File\.|Directory\.|FileCommands|ItemClick\+=/.test(archivePreview), 'archive display cannot extract entries or issue source operations');
const previewNavigation = read('shell/Cap7CE.WinUI/Controls/PreviewNavigationView.cs');
assert(previewNavigation.includes('GetCurrentPoint(viewport)') && previewNavigation.includes('pointerOwner=viewport;'), 'preview hover must use the stable viewport for both coordinates and pointer observation');
const previewWindow = read('shell/Cap7CE.WinUI/PreviewWindow.cs');
const previewSelection = read('shell/Cap7CE.WinUI/Controllers/PreviewSelectionController.cs');
assert(!/CoreNodeHost|RequestAsync|Dispatcher|File\.|Directory\.|Focus\(|Activate\(/.test(previewSelection), 'preview selection coordination cannot own loading, storage or window focus');
assert(previewWindow.includes('UnobserveItems();reading.Cancel()') && previewWindow.includes('followTimer.Stop()'), 'preview follow must release source observation and pending work on close');
assert(previewWindow.indexOf('ThemeService.Apply(this,root,services.Preferences.Current);') < previewWindow.indexOf('public void Show(') && !previewWindow.includes('services.Preferences.Changed-=ApplyTheme;ApplyTheme();'), 'preview initial theme/titlebar must be installed synchronously before Show can force layout');
assert(read('shell/Cap7CE.WinUI/Controls/Workspace/ResultsGallery.cs').includes('PreviewKeyDown+=NavigateKey'), 'gallery selection must run before native directional focus movement');
assert(previewNavigation.includes('var region=new Grid {Width=56,Background=null') && previewNavigation.includes('faces[i].IsHitTestVisible=visible&&buttons[i].IsEnabled'), 'preview side regions and invisible arrows must pass input to underlying content');
assert(previewNavigation.includes('AddHandler(PointerMovedEvent,pointerPosition,true)') && previewNavigation.includes('RemoveHandler(PointerMovedEvent,pointerPosition)'), 'preview hover observation must use the viewport with balanced subscriptions');
const genericPreview = read('shell/Cap7CE.WinUI/Controls/FileInfoPreviewView.cs');
assert(genericPreview.includes('ThumbnailOptions.ReturnOnlyIfCached') && genericPreview.includes('ThumbnailType.Image'), 'generic preview must use existing/embedded thumbnails and reject icon substitutes');
assert(!/CoreNodeHost|RequestAsync|PrepareAsync|StoredMetadata|Timer/.test(genericPreview), 'generic preview cannot generate caches, extract content or start background work');
const textDocument = read('shell/Cap7CE.WinUI/Models/TextPreviewDocument.cs');
const textView = read('shell/Cap7CE.WinUI/Controls/TextPreviewView.cs');
const textBrowser = read('shell/Cap7CE.WinUI/Controls/TextDocumentWebView.cs');
assert(!/CoreNodeHost|\.RequestAsync|File\.|Directory\.|Sqlite/.test(textDocument + textView), 'text presentation cannot read sources, own storage or call Core');
assert(textDocument.includes('.DisableHtml()') && textDocument.includes("default-src 'none'"), 'formatted previews must disable Markdown HTML and block external resources');
assert(textBrowser.includes('IsScriptEnabled=false') && textBrowser.includes('e.NavigationId!=navigationId') && textBrowser.includes('browser.Close()'), 'text browser must disable page scripts, match navigation and release on unload');
const animationSource = read('shell/Cap7CE.WinUI/Services/AnimationSource.cs');
const animationView = read('shell/Cap7CE.WinUI/Controls/AnimatedImageView.cs');
assert(!/CoreNodeHost|RequestAsync|WriteAll|FileMode\.Create|Timer/.test(animationSource), 'animation source reader cannot publish caches, write sources or schedule background work');
assert(animationSource.includes('64*1024*1024') && animationSource.includes('40_000_000') && animationSource.includes('i<512'), 'animation input and header walks must stay bounded');
assert(animationView.includes('IsScriptEnabled=false') && animationView.includes('403,"Forbidden"') && animationView.includes('browser.Close()'), 'animation browser must block page scripts/external resources and close on disposal');
assert(animationView.includes('core.Navigate(DocumentUri)') && animationView.includes('e.NavigationId!=navigationId') && !animationView.includes('NavigateToString('), 'animation readiness must belong to the explicit in-memory document navigation, never a cancelled initialization navigation');
assert(!/AnimationSource|AnimatedImageView/.test(read('shell/Cap7CE.WinUI/Controls/AssetTile.cs') + read('shell/Cap7CE.WinUI/Services/VisualConnection.cs')), 'animation playback belongs only to independent preview');
assert(commands.includes('BeforeMutation?.Invoke()') && commands.includes('ReleaseSourcesAsync') && commands.includes('deletedPaths'));
const taskNotices=read('shell/Cap7CE.WinUI/Services/TaskNotifications.cs');
assert(!/Microsoft\.UI|DllImport|RequestAsync|Task\.Delay|Timer|File\.|Directory\./.test(taskNotices), 'task notice policy must not own windows, task execution, polling or storage');
assert(!read('shell/Cap7CE.WinUI/Controls/Settings/IndexMaintenanceView.cs').includes('services.Notify('), 'index system notices must survive settings-page lifecycle');
assert(read('shell/Cap7CE.WinUI/Services/ShellServices.cs').includes('TaskNotices.IndexStatus('), 'index terminal notices must use shared service snapshots');
assert(read('shell/Cap7CE.WinUI/Services/AutoKeywordTasks.cs').includes('TaskNotices.Finish('), 'AI batches must publish one aggregate terminal outcome');
const shortcutCatalog=read('shell/Cap7CE.WinUI/Models/ShortcutCatalog.cs');
const singleMain=read('shell/Cap7CE.WinUI/MainWindow.xaml.cs');
assert(!/\bTabView(?:Item)?\b|\bTabs\b|NewTab|CloseTab|StepTab/.test(singleMain+read('shell/Cap7CE.WinUI/MainWindow.xaml')),
  'the native main window must own one browsing page, without tab UI or session collections');
assert(singleMain.includes('private readonly BrowseSession active;')&&singleMain.match(/new BrowseSession\(services\)/g)?.length===1
  &&singleMain.includes('commands.ItemsDeleted+=active.RemoveDeleted')&&singleMain.includes('active.Dispose()'), 'single-session creation, deletion updates and shutdown must stay paired');
assert(!/newTab|closeTab|previousTab|nextTab/.test(shortcutCatalog), 'removed tab-page actions cannot return through shortcut settings');
const shortcutGesture=read('shell/Cap7CE.WinUI/Models/ShortcutGesture.cs');
const shortcutInput=read('shell/Cap7CE.WinUI/Controllers/WorkspaceShortcutInput.cs');
const shortcutService=read('shell/Cap7CE.WinUI/Services/WindowShortcutService.cs');
assert(!/AllowGlobal|scope\.SelectionChanged/.test(read('shell/Cap7CE.WinUI/Views/Settings/SettingsShortcutEditor.cs'))
  && shortcutCatalog.includes('record ShortcutBinding(string Gesture);'), 'shortcut scopes must be owned by the action catalog, never editable or persisted overrides');
assert(!/Microsoft\.UI|DllImport|RequestAsync|File\.|Directory\./.test(shortcutCatalog+shortcutGesture), 'shortcut definitions and validation must stay independent of UI and IO');
const shortcutActionOwners=read('shell/Cap7CE.WinUI/MainWindow.xaml.cs')+shortcutService;
for(const match of shortcutCatalog.matchAll(/new\("([A-Za-z]+)"/g))assert(shortcutActionOwners.includes(`["${match[1]}"]`), `shortcut action must have a real owner: ${match[1]}`);
assert(shortcutInput.includes('KeyboardAccelerator')&&shortcutInput.includes('WasKeyDown')&&shortcutInput.includes('OldDefault')&&shortcutInput.includes('RemoveHandler'), 'shortcut routing must preserve native accelerators, repeat suppression, cleared-default handling and cleanup');
assert(!/SetWindowsHookEx|Process\.Start|RequestAsync/.test(shortcutInput+shortcutService), 'shortcut dispatch cannot introduce a global keyboard hook or bypass domain actions');
assert(read('shell/Cap7CE.WinUI/Views/Settings/SettingsShortcutEditor.cs').includes('UpdateAsync')&&!read('shell/Cap7CE.WinUI/Views/Settings/SettingsCatalog.cs').includes('Shortcuts?.Configure'), 'shortcut updates must use serialized field-level preferences');

// Commands stay a bounded allowlist and reuse existing owners; ordinary text is never a script.
const commandInput=read('shell/Cap7CE.WinUI/Commands/QuickCommandInput.cs');
assert(commandInput.includes('QuickCommandParser.IsCandidate') && commandInput.includes('confirmation.Answer') && commandInput.includes('if(busy)return true'), 'command input must distinguish search, confirmation and in-flight execution');
assert(read('shell/Cap7CE.WinUI/Commands/QuickCommandActions.cs').includes('services.ClearVisualCacheAsync()') && read('shell/Cap7CE.WinUI/Commands/QuickCommandActions.cs').includes('workspace.UpdateAsync'), 'commands must reuse cache maintenance and scoped workspace preferences');
assert(!read('shell/Cap7CE.WinUI/Controls/SidebarView.cs').includes('menu.renameFolder'), 'sidebar cannot expose real-folder rename');

const trayOwner=read('shell/Cap7CE.WinUI/Services/Tray/TrayController.cs');
assert(trayOwner.includes('TrayPolicy.HideOnClose')&&trayOwner.includes('args.Cancel=true')&&trayOwner.includes('WindowActivation.Show'), 'tray must separate hide/exit and reuse activation');
assert(read('shell/Cap7CE.WinUI/Commands/QuickCommandActions.cs').includes('case "app:quit":exit();')&&singleMain.includes('tray.Exit'), 'explicit quit must bypass close-to-tray');
assert(edgeController.includes('if(!args.Cancel)Dispose()')&&edgeController.includes('window.AppWindow.IsVisible')&&singleMain.indexOf('tray=new(')<singleMain.indexOf('edgeCollapse=new('), 'a cancelled close must not dispose or animate the hidden edge window');
assert(read('shell/Cap7CE.WinUI/Services/Tray/TrayIcon.cs').includes('taskbarCreated')&&read('shell/Cap7CE.WinUI/Services/Tray/TrayIcon.cs').includes('RemoveWindowSubclass'), 'tray restart registration and callback cleanup are required');
const trayMenu=read('shell/Cap7CE.WinUI/Services/Tray/TrayMenu.cs');
assert(trayMenu.includes('TrackPopupMenuEx')&&trayMenu.includes('SetForegroundWindow')&&trayMenu.includes('PostMessageW'), 'tray menu must use native tracking and foreground/dismissal protocol');
assert(trayMenu.includes('DestroyMenu')&&trayMenu.includes('DestroyWindow')&&!trayMenu.includes('MenuFlyout'), 'tray menu must release native resources without a XAML popup host');
console.log('WinUI shell boundaries passed');
const diagnosticJournal=read("shell/Cap7CE.WinUI/Services/DiagnosticJournal.cs");
assert(!/Microsoft\.UI|RequestAsync|ProcessStartInfo|DispatcherTimer/.test(diagnosticJournal), "journal must remain an IO-only bounded sink");
assert(diagnosticJournal.includes("512*1024") && diagnosticJournal.includes("session-trace.3.jsonl") && diagnosticJournal.includes("lock(gate)"), "journal must keep bounded synchronized retention");
assert(read("shell/Cap7CE.WinUI/Services/DiagnosticsArchive.cs").includes("LogNames.Concat(DiagnosticJournal.Names)"), "diagnostic export must include retained sessions");

const renameUi=read('shell/Cap7CE.WinUI/Controls/Workspace/ResultRenameController.cs');
assert(!/File\.(?:Move|Delete)|Directory\.(?:Move|Delete)|NativeCoreRequest|ProcessStartInfo/.test(renameUi),'rename dialog must use the shared FileCommands coordinator');
assert(read('shell/Cap7CE.WinUI/Services/ItemRenameService.cs').includes('core/artifacts/file-operations-host/')&&!/File\.Move|Directory\.Move/.test(read('shell/Cap7CE.WinUI/Services/FileCommands.cs')),'rename must execute through the Core file operations host');

assert(renameUi.includes('L.Dialog(root,"menu.rename"') && !/TransformToVisual|new Popup|RenameAnchor/.test(renameUi),'rename editor must use a native dialog independent of thumbnail layout');

// Product startup must remain independent of a full database health scan.
const catalogInitialization=read('core/src/Cap7CE.Core.Catalog/CatalogV2Database.cs').split('public async Task InitializeAsync')[1].split('public async Task<long> ReadRevisionAsync')[0];
assert(!/CheckIntegrityAsync|quick_check/.test(catalogInitialization), 'full health check cannot gate ordinary startup');
const healthCheck=read('core/src/Cap7CE.Core.Host/CatalogStorage/CatalogHealthCheck.cs').replace(/\/\/[^\r\n]*/g, '');
assert(healthCheck.includes('SqliteOpenMode.ReadWrite,') && !healthCheck.includes('ReadWriteCreate')
  && healthCheck.indexOf('PRAGMA query_only=ON;') < healthCheck.indexOf('PRAGMA quick_check;'), 'health connection cannot create storage and must block mutations before checking');

const updateTray=read('shell/Cap7CE.WinUI/Services/Tray/TrayController.cs');
assert(updateTray.includes('case 31:updates();break;') && !updateTray.includes('NativeUpdates.CheckAsync'), 'tray updates must navigate to the shared settings flow');
assert(read('shell/Cap7CE.WinUI/MainWindow.xaml.cs').includes('services.Updates.InstallerStarted+=tray.Exit')
  && read('shell/Cap7CE.WinUI/Views/SettingsWindow.cs').includes('pages.FocusUpdates()'), 'native update installation must reuse normal exit and settings navigation');

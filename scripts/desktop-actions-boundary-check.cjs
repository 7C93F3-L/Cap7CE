const assert = require('node:assert/strict');
module.exports = read => {
  const base = 'shell/Cap7CE.WinUI/DesktopActions/';
  const limits = { 'ScopedSearchHistory.cs': 25, 'NativeSnapInput.cs': 110, 'NativeSnapSequence.cs': 40, 'DesktopActionStore.cs': 65, 'DesktopActionController.cs': 95, 'DesktopProgramWindows.cs': 55,
    'CapsuleShadowTexture.cs': 35, 'CapsuleLayeredSurface.cs': 55, 'CapsuleShadowWindow.cs': 50, 'CapsuleGlowTexture.cs': 65, 'CapsuleGlowImage.cs': 40, 'CapsuleAppearance.cs': 75, 'CapsuleWindow.cs': 155, 'CapsuleWindowFrame.cs': 75, 'CapsuleTransparentBackdrop.cs': 30, 'CapsuleTransparency.cs': 45, 'CapsuleShape.cs': 25, 'CapsuleMenu.cs': 75, 'DesktopProgramSettingsRow.cs': 45, 'DesktopProgramIcon.cs': 25, 'DesktopActionSettings.cs': 110 };
  for (const [file, limit] of Object.entries(limits)) {
    const source = read(base + file);
    assert(source.trimEnd().split(/\r?\n/).length <= limit, `${file}: desktop action responsibility budget exceeded`);
    assert(!/CoreConnection|RequestAsync|Microsoft\.Data\.Sqlite|CoreNodeHost|Process\.Kill/.test(source), `${file}: desktop actions cannot own Core, storage queries or application termination`);
    if (file !== 'DesktopActionStore.cs') assert(!/File\.(?:Write|Move|Delete)/.test(source), `${file}: desktop configuration writes have one owner`);
    if (file !== 'NativeSnapInput.cs') assert(!/SendInput|keybd_event/.test(source), `${file}: keyboard injection belongs to the native snap driver`);
    if (file !== 'DesktopProgramWindows.cs') assert(!/Process\.Start|EnumWindows/.test(source), `${file}: external window operations have one owner`);
  }
  const shadow = read(base + 'CapsuleShadowWindow.cs');
  assert(shadow.includes('0x080800a8') && shadow.includes('SetWindowPos(handle,capsule') && shadow.includes('DestroyWindow(handle)'), 'capsule shadow must be layered, click-through, nonactivating, behind its owner and explicitly destroyed');
  const surface = read(base + 'CapsuleLayeredSurface.cs');
  assert(surface.includes('finally') && surface.includes('DeleteObject(bitmap)') && surface.includes('DeleteDC(dc)') && surface.includes('ReleaseDC(0,screen)'), 'shadow upload must release temporary GDI resources');
  const native = read(base + 'NativeSnapInput.cs');
  assert(native.includes('GetForegroundWindow()!=window') && native.includes('IsWindowArranged(window)') && native.includes('HasHeldKeys()')
    && native.includes('token.ThrowIfCancellationRequested()') && native.includes('if(sent>0)'), 'native snapping requires focus, key-state, result, cancellation and partial-input release guards');
  assert(!/Key\(0x5a/.test(native), 'the first experiment uses fixed native halves without dynamic layout numbers');
  assert(!read(base + 'CapsuleAppearance.cs').includes('glowBands') && read(base + 'CapsuleGlowTexture.cs').includes('Math.Exp('), 'capsule glow must use a continuous distance profile rather than stacked border rings');
  assert(read(base + 'CapsuleGlowImage.cs').includes('version==revision') && read(base + 'CapsuleGlowImage.cs').includes('writer.DetachStream()'), 'transient glow decoding must retire stale results and release memory streams');
  const capsule = read(base + 'CapsuleWindow.cs');
  assert(capsule.includes('next.Opened+=') && capsule.includes('next.Closed+=') && capsule.includes('ReferenceEquals(menu,next)')
    && capsule.includes('pill.SetExpanded(false,inside)'), 'capsule highlight follows the current flyout lifetime and reconciles pointer position after closing');
  const frame = read(base + 'CapsuleWindowFrame.cs');
  assert(frame.includes('PreferredMinimumWidth=1') && frame.includes('PreferredMinimumHeight=1') && frame.includes('DwmSetWindowAttribute(handle,2')
    && frame.includes('args.DidPositionChange') && frame.includes('CapsuleShape.Contains') && frame.includes('CapsuleTransparency.Clear') && frame.includes('message==0x83') && frame.includes('message==0x24') && frame.includes('RemoveWindowSubclass') && frame.includes('window.AppWindow.Changed-=Changed'), 'capsule frame must own small-window sizing, decoration suppression, shape refresh and teardown');
  assert(!frame.includes('SetWindowRgn') && !frame.includes('CreateRoundRectRgn'), 'capsule edges must retain compositor antialiasing rather than integer region clipping');
  const backdrop = read(base + 'CapsuleTransparentBackdrop.cs');
  assert(backdrop.includes('override void OnDefaultSystemBackdropConfigurationChanged') && !backdrop.includes('base.OnDefaultSystemBackdropConfigurationChanged'), 'capsule transparent brush must explicitly handle theme notifications without invoking the default material controller callback');
  assert(backdrop.includes('Colors.Transparent') && backdrop.includes('target.SystemBackdrop=null') && backdrop.includes('compositor?.Dispose()'), 'capsule transparent surface must own and release its brush and compositor');
  assert(read(base + 'CapsuleWindow.cs').includes('CapsuleShape.RadiusPixels(width,height)/scale'), 'capsule drawing must use the same physical geometry as hit testing');
  assert(!read(base + 'CapsuleWindow.cs').includes('ThemeService.Apply('), 'capsule cannot acquire the main-window caption wrapper');
  const store = read(base + 'DesktopActionStore.cs'), controller = read(base + 'DesktopActionController.cs');
  const historyPopup = read('shell/Cap7CE.WinUI/Controls/Workspace/SearchHistoryPopup.cs');
  assert(historyPopup.trimEnd().split(/\r?\n/).length <= 90 && !/DesktopActionStore|BrowseSession|File\.|RequestAsync|CoreConnection/.test(historyPopup), 'history popup must remain a bounded presentation component with injected suggestions and submission');
  assert(historyPopup.includes('ThemeService.Flyout(surface)') && historyPopup.includes('popup.ShowAt(input') && historyPopup.includes('FlyoutShowMode.Transient') && !/HorizontalOffset|VerticalOffset|TransformToVisual|new Popup/.test(historyPopup), 'search history must use the shared acrylic flyout anchored to its editor without compounded coordinate offsets or stolen typing focus');
  assert(historyPopup.includes('Control.BackgroundProperty,Application.Current.Resources["CapFlyoutSurfaceBrush"]') && historyPopup.includes('Control.CornerRadiusProperty,Application.Current.Resources["CapPanelRadius"]'), 'local history presenter styling must retain the shared backdrop-transparent surface and panel radius');
  assert(!/File\.|BrowseSession|ShellServices|Microsoft.UI.Xaml/.test(read(base + 'ScopedSearchHistory.cs')), 'scoped history projection must remain pure');
  assert(controller.includes('DesktopActions.ClearHistoryAsync()') && read(base + 'DesktopActionSettings.cs').includes('store.ClearHistoryAsync()'), 'search and Settings must share the store-owned history clear path');
  assert(store.includes('desktop-actions.json') && store.includes('gate.WaitAsync()') && store.includes('File.Move(temp,path,true);Current=next;Changed?.Invoke()'), 'desktop preferences must persist atomically before publication');
  assert(!store.includes('public bool NativeSnap') && !controller.includes('ArrangeAsync') && !read(base + 'DesktopProgramWindows.cs').includes('SetWindowPos'), 'native snapping is the sole placement path; retired size-based placement cannot return');
  assert(store.includes('!v.RecordHistory?v:v with') && store.includes('Take(50)'), 'history admission and retention must be bounded');
  assert(controller.includes('WindowActivation.Show(main)') && controller.includes('session.OpenLocationAsync') && controller.includes('session.NavigateAsync'), 'history must reuse native activation and navigation');
  assert(controller.includes('lifetime.Cancel()') && controller.includes('toolbar.SearchSubmitted-=Remember'), 'desktop action shutdown must cancel discovery and detach search observers');
  console.log('Desktop capsule module ownership, budgets, history and shutdown boundaries passed.');
};

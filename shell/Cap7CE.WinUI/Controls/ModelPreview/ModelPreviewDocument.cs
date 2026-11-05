namespace Cap7CE.WinUI.Controls;

internal static class ModelPreviewDocument
{
    public const string Uri="https://cap7ce-model.invalid/preview",ScriptUri="https://cap7ce-model.invalid/viewer.js",ConfigUri="https://cap7ce-model.invalid/config.json";
    public const string Headers="Cache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self' blob: data:; img-src 'self' blob: data:; style-src 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'\r\n";
    public const string Html="<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body,canvas{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}canvas{display:block;touch-action:none;outline:none}</style><canvas id='model' tabindex='0'></canvas><script type='module' src='/viewer.js'></script></html>";
}

using System.Globalization;
using System.Text.Json;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;

internal static class LanguagePreferenceChecks
{
    public static async Task RunAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"cap7ce-language-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var file=Path.Combine(root,"preferences.json");var blocked=Path.Combine(root,"blocked.json");
        var original=AppLanguage.Session.Current;var uiCulture=CultureInfo.CurrentUICulture;
        var element=new FrameworkElement();var property=new DependencyProperty();
        try {
            var store=new PreferenceStore(file,null);await store.LoadAsync();
            if(store.Current.Language!="system")throw new Exception("New preferences must follow the system language.");
            LanguageBinding.Attach(element,property,AppLanguage.Session,"navigation.general");element.Load();
            var notifications=0;
            store.Changed+=()=>{
                notifications++;
                using var saved=JsonDocument.Parse(File.ReadAllText(file));
                if(saved.RootElement.GetProperty("language").GetString()!=store.Current.Language)throw new Exception("Language changes must follow successful persistence.");
                if((string?)element.GetValue(property)!=AppLanguage.Text("navigation.general"))throw new Exception("The existing binding must update in place before the preference notification.");
            };
            await store.UpdateAsync(value=>value with{Language="en-US"});
            if((string?)element.GetValue(property)!="General"||notifications!=1)throw new Exception("Saving English must update an existing bound element immediately.");
            var restored=new PreferenceStore(file,null);await restored.LoadAsync();
            if(restored.Current.Language!="en-US"||AppLanguage.Session.Current!="en-US")throw new Exception("Language must survive a store reload.");
            await Task.WhenAll(store.UpdateAsync(value=>value with{Theme="dark"}),store.UpdateAsync(value=>value with{Language="zh-CN"}));
            if(store.Current.Theme!="dark"||store.Current.Language!="zh-CN"||(string?)element.GetValue(property)!="通用")throw new Exception("Serialized updates must preserve other settings while switching language.");
            CultureInfo.CurrentUICulture=CultureInfo.GetCultureInfo("en-US");
            await store.UpdateAsync(value=>value with{Language="system"});
            if(AppLanguage.Session.Current!="en-US")throw new Exception("Follow system must resolve from the current system UI culture.");
            var before=File.ReadAllText(file);var calls=notifications;
            try{await store.UpdateAsync(value=>value with{Language="invalid"});throw new Exception("Invalid preference accepted.");}catch(ArgumentOutOfRangeException){}
            if(File.ReadAllText(file)!=before||notifications!=calls||AppLanguage.Session.Current!="en-US")throw new Exception("Rejected values cannot change the file, language or notifications.");
            Directory.CreateDirectory(blocked);var failing=new PreferenceStore(blocked,null);
            try{await failing.UpdateAsync(value=>value with{Language="zh-CN",Theme="dark"});throw new Exception("A blocked target unexpectedly saved.");}catch(IOException){}catch(UnauthorizedAccessException){}
            if(AppLanguage.Session.Current!="en-US"||failing.Current.Theme!="system"||Directory.EnumerateFiles(root,"*.tmp").Any())throw new Exception("Failed persistence must not apply the requested language/settings or leave a temporary file.");
            await File.WriteAllTextAsync(file,"{\"language\":\"unknown\",\"theme\":\"dark\"}");await restored.LoadAsync();
            if(restored.Current.Language!="system"||restored.Current.Theme!="dark")throw new Exception("Unknown persisted language must follow the system without discarding unrelated preferences.");
            foreach(var legacySize in new[]{"16","99","\"legacy\"","null"}) {
                var legacy="{\"fontSize\":"+legacySize+",\"theme\":\"dark\",\"language\":\"en-US\",\"showDetails\":false}";
                await File.WriteAllTextAsync(file,legacy);await restored.LoadAsync();
                if(restored.Current.Theme!="dark"||restored.Current.Language!="en-US"||restored.Current.ShowDetails)throw new Exception("Retired font size must not affect valid preferences.");
                if(await File.ReadAllTextAsync(file)!=legacy)throw new Exception("Loading a retired font preference must not rewrite user data.");
                await restored.UpdateAsync(value=>value with{Theme="light"});
                using var saved=JsonDocument.Parse(await File.ReadAllTextAsync(file));
                if(saved.RootElement.TryGetProperty("fontSize",out _)||saved.RootElement.GetProperty("language").GetString()!="en-US"||saved.RootElement.GetProperty("showDetails").GetBoolean())throw new Exception("Normal saves must omit retired font size and preserve unrelated preferences.");
            }
            Console.WriteLine("Retired UI font preference passed: legacy sizes/types ignored, unrelated settings retained, load read-only and normal save omits the field.");
            foreach(var choice in LanguagePreferenceOptions.Choices) {
                if(LanguagePreferenceOptions.Choices[LanguagePreferenceOptions.Index(choice.Id)].Id!=choice.Id)throw new Exception("Selector identity must not depend on translated labels.");
            }
            Console.WriteLine("Language preference integration passed: actual store persistence, reload, live binding, system language, serialized updates and failed-save rollback in an isolated temporary directory.");
        } finally {
            LanguageBinding.Clear(element,property);element.Unload();CultureInfo.CurrentUICulture=uiCulture;AppLanguage.Apply(original);
            if(File.Exists(file))File.Delete(file);if(Directory.Exists(blocked))Directory.Delete(blocked);
            foreach(var temporary in Directory.EnumerateFiles(root,"*.tmp"))File.Delete(temporary);Directory.Delete(root);
        }
    }
}

namespace Cap7CE.WinUI.Localization;

internal static class LanguagePreferenceOptions
{
    public static readonly (string Id,string Key)[] Choices=[("system","theme.system"),("zh-CN","language.chinese"),("en-US","language.english")];
    public static int Index(string preference)=>Array.FindIndex(Choices,choice=>choice.Id==preference) is var index&&index>=0?index:1;
}

namespace Cap7CE.WinUI.Models;

// Win32 virtual keys and modifier bits; no keyboard layout, UI or registration side effects.
internal readonly record struct ShortcutGesture(uint Key,uint Modifiers)
{
    private static readonly Dictionary<string,uint> Named=new(StringComparer.OrdinalIgnoreCase){
        ["Enter"]=13,["Space"]=32,["Tab"]=9,["Escape"]=27,["Backspace"]=8,["Delete"]=46,
        ["Left"]=37,["Up"]=38,["Right"]=39,["Down"]=40,["Home"]=36,["End"]=35,["PageUp"]=33,["PageDown"]=34,
        ["`"]=192,[","]=188,["."]=190,["/"]=191,[";"]=186,["'"]=222,["["]=219,["]"]=221,["\\"]=220,["-"]=189,["="]=187,
        ["Num0"]=96,["Num1"]=97,["Num2"]=98,["Num3"]=99,["Num4"]=100,["Num5"]=101,["Num6"]=102,["Num7"]=103,["Num8"]=104,["Num9"]=105,
        ["NumMultiply"]=106,["NumAdd"]=107,["NumSubtract"]=109,["NumDecimal"]=110,["NumDivide"]=111};
    public static bool TryParse(string? text,out ShortcutGesture value)
    {
        value=default;if(string.IsNullOrWhiteSpace(text))return false;
        var parts=text.Split('+',StringSplitOptions.TrimEntries);uint modifiers=0;
        foreach(var part in parts[..^1]) {
            var bit=part.ToUpperInvariant() switch {"CTRL"=>2u,"ALT"=>1u,"SHIFT"=>4u,"WIN"=>8u,_=>0u};
            if(bit==0||(modifiers&bit)!=0)return false;modifiers|=bit;
        }
        var keyText=parts[^1];uint key;
        if(keyText.Length==1&&char.ToUpperInvariant(keyText[0]) is var c&&(c is >= 'A' and <= 'Z' or >= '0' and <= '9'))key=c;
        else if(Named.TryGetValue(keyText,out key)){}
        else if(keyText.StartsWith("F",StringComparison.OrdinalIgnoreCase)&&int.TryParse(keyText.AsSpan(1),out var number)&&number is >=1 and <=24)key=(uint)(111+number);
        else return false;
        value=new(key,modifiers);return true;
    }
    public bool Allowed(bool global,bool results)
    {
        if((Modifiers&8)!=0||Key==27||Key==9&&Modifiers==0||Key==8&&Modifiers==0)return false;
        if((Modifiers&1)!=0&&Key is 9 or 115||(Modifiers&3)==3&&Key==46)return false;
        if(!results&&Modifiers==2&&Key is 65 or 67 or 86 or 88 or 89 or 90)return false;
        if(global)return (Modifiers&3)!=0&&Key!=123;
        return Modifiers!=0||Key is >=112 and <=135||results&&Key is 13 or 32 or 46;
    }
    public override string ToString()
    {
        var numeric=Key;var key=Named.FirstOrDefault(pair=>pair.Value==numeric).Key??(Key is >=112 and <=135?"F"+(Key-111):Key is >=65 and <=90 or >=48 and <=57?((char)Key).ToString():"Key"+Key);
        return ((Modifiers&2)!=0?"Ctrl+":"")+((Modifiers&1)!=0?"Alt+":"")+((Modifiers&4)!=0?"Shift+":"")+((Modifiers&8)!=0?"Win+":"")+key;
    }
}

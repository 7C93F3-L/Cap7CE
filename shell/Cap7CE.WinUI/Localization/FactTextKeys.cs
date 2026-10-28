namespace Cap7CE.WinUI.Localization;

// Display keys follow generated preset identities, never translated labels.
internal static class FactTextKeys
{
    public static string Group(string id)=>$"ui.facts.advanced.{id}.title";
    public static string Option(string group,string id)=>$"ui.facts.advanced.{group}.{id}";
    public static string Media(string domain,string scope,string id)
    {
        var group=scope switch {"aspect"=>domain+"-aspect","resolution"=>"video-resolution","channels"=>"audio-channels","duration"=>domain+"-duration",_=>throw new ArgumentOutOfRangeException(nameof(scope))};
        return $"ui.facts.media.{group}.{id}";
    }
    public static string Type(string id)=>$"ui.facts.type.{id}";
    public static string Color(string id)=>$"ui.facts.color.{id}";
}

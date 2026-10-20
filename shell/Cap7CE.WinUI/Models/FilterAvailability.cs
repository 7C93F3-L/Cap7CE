namespace Cap7CE.WinUI.Models;
internal enum FilterAvailabilityState { Unknown,Checking,Available,Missing,Failed }
internal sealed record FilterAvailability(IReadOnlyDictionary<string,FilterAvailabilityState> States,int Revision=0)
{
    public static readonly FilterAvailability Empty=new(new Dictionary<string,FilterAvailabilityState>());
    public FilterAvailabilityState Get(string kind,bool colors=false)=>States.TryGetValue(colors?kind+":colors":kind,out var value)?value:FilterAvailabilityState.Unknown;
    public bool Enabled(string kind,bool colors=false)=>Get(kind,colors) is FilterAvailabilityState.Unknown or FilterAvailabilityState.Available;
}

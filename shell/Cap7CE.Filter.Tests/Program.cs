using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

var checks=0;
void Require(bool condition,string label){if(!condition)throw new Exception(label);checks++;}
var empty=new BrowseFilter();
var sunday=new DateTime(2026,10,25,23,59,0);
var week=FilterPresets.Time(empty,"week",sunday);
Require(week.After?.Date==new DateTime(2026,10,19)&&week.Before?.Date==new DateTime(2026,10,26),"Sunday stays in the Monday-based week");
var feb=FilterPresets.Time(empty,"month",new DateTime(2028,2,29));
Require(feb.After?.Date==new DateTime(2028,2,1)&&feb.Before?.Date==new DateTime(2028,3,1),"Leap-month calendar boundaries");
var prior=FilterPresets.Time(empty,"last-year",sunday);
Require(prior.After?.Date==new DateTime(2025,1,1)&&prior.Before?.Date==new DateTime(2026,1,1),"Previous calendar year");
Require(week.ToConditions()!.MaximumModifiedFileTime==(week.Before!.Value.UtcDateTime.ToFileTimeUtc()-1).ToString(),"Exclusive UI end becomes inclusive Core FILETIME without next-day leakage");
Require(FilterPresets.Time(week,"all",sunday).Count==0,"Unlimited time removes the condition");
for(var i=0;i<FilterPresets.Sizes.Length-1;i++)Require(FilterPresets.Sizes[i].Max+1==FilterPresets.Sizes[i+1].Min,"Size presets neither overlap nor leave gaps");
var images=FilterPresets.ToggleType(empty,"visual");
Require(FilterPresets.Selected(images,"visual")&&FilterPresets.Domain(images)=="image-dimensions","Image group selects all registered searchable images");
var mixed=FilterPresets.ToggleType(images with {Facts=new CoreSearchFactFilter("image-dimensions",1,MinimumWidth:100)},"audio");
Require(FilterPresets.Selected(mixed,"visual")&&FilterPresets.Selected(mixed,"audio")&&mixed.Facts is null,"Mixed categories combine extensions and remove incompatible facts");
var remaining=FilterPresets.ToggleType(mixed,"visual");
Require(FilterPresets.Selected(remaining,"audio")&&!FilterPresets.Selected(remaining,"visual"),"Removing one category retains the other");
var other=FilterPresets.ToggleType(images,"other");
Require(other.Category=="other"&&other.Extensions.Length==0&&other.ToConditions()!.ExcludedExtensions!.Count>0,"Unclassified selection uses exclusion rather than image includes");
Require(FilterPresets.ToggleType(other,"other").Count==0,"Unclassified selection toggles off");
Require(FormatRegistry.Formats.Select(f=>f.Extension).Distinct().Count()<=128,"Registered formats fit the existing Core condition bound");
Console.WriteLine($"Top filter checks passed: {checks}");

namespace Cap7CE.WinUI.Controls;

internal sealed class GridSizePicker(double value,Action<double> preview)
    : SizeSlider("main.gridSize",value,96,280,4,16,160,value=>$"{value/160:0%}",preview);

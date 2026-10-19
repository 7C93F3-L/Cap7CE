namespace Cap7CE.Core.Protocol;

public sealed record CatalogPreparationProgress(string VolumeId, string Drive, string Stage,
    long Processed, long? Total, double? Fraction, double? RemainingSeconds);

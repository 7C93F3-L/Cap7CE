using Cap7CE.Core.Reader.Host;

if (!OperatingSystem.IsWindows() || args.Length != 0)
{
    return 2;
}

#if P23_LIFECYCLE
ReaderHostConstants.UseLifecycleProfile();
#endif

return ReaderWindowsService.Run(async cancellationToken =>
{
    var config = await ReaderServiceConfig.LoadAsync(cancellationToken);
    return config.Phase == "volume"
        ? await ReaderVolumeService.RunAsync(config, cancellationToken)
        : await ReaderFixtureService.RunAsync(cancellationToken);
});

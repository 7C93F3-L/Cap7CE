using Cap7CE.Core.Reader.Host;

if (!OperatingSystem.IsWindows() || args.Length != 0)
{
    return 2;
}

#if P23_LIFECYCLE
ReaderHostConstants.UseLifecycleProfile();
#endif
#if P33_CAPABILITY
ReaderHostConstants.UseCapabilityProfile();
#endif
#if P37_RECOVERY
ReaderHostConstants.UseRecoveryProfile();
#endif
#if P37_LIFECYCLE
ReaderHostConstants.UseP37LifecycleProfile();
#endif
#if P38_PRODUCT
ReaderHostConstants.UseProductProfile();
#endif

return ReaderWindowsService.Run(async cancellationToken =>
{
    var config = await ReaderServiceConfig.LoadAsync(cancellationToken);
    return config.Phase == "volume"
        ? await ReaderVolumeService.RunAsync(config, cancellationToken)
        : await ReaderFixtureService.RunAsync(cancellationToken);
});

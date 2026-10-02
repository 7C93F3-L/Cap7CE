using Cap7CE.Core.Setup;

if (args is ["--verify-payload"])
{
    return await CapabilitySetupPayloadCli.RunAsync(Console.Out);
}

if (CapabilitySetupCoordinatorCli.IsRequest(args))
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
    return await CapabilitySetupCoordinatorCli.RunAsync(args, Console.Out, timeout.Token);
}

if (CapabilitySetupActivationCli.IsServerRequest(args))
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
    return await CapabilitySetupActivationCli.RunServerAsync(args, Console.Out, timeout.Token);
}

if (CapabilitySetupActivationCli.IsClientRequest(args))
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
    return await CapabilitySetupActivationCli.RunClientAsync(args, Console.Out, timeout.Token);
}

return await CapabilitySetupDryRunCli.RunAsync(args, Console.In, Console.Out);

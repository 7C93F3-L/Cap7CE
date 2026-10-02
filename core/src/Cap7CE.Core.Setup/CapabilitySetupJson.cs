using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupJson
{
    private static readonly CapabilitySetupJsonContext Context = CreateContext();

    public static CapabilitySetupManifest? DeserializeManifest(Stream stream) =>
        JsonSerializer.Deserialize(stream, Context.CapabilitySetupManifest);

    public static CapabilityPayloadManifest? DeserializePayloadManifest(Stream stream) =>
        JsonSerializer.Deserialize(stream, Context.CapabilityPayloadManifest);

    public static CapabilitySetupPlanRequest? DeserializePlanRequest(string source) =>
        JsonSerializer.Deserialize(source, Context.CapabilitySetupPlanRequest);

    public static CapabilitySetupActivationRequest? DeserializeActivationRequest(ReadOnlySpan<byte> source) =>
        JsonSerializer.Deserialize(source, Context.CapabilitySetupActivationRequest);

    public static CapabilitySetupActivationResponse? DeserializeActivationResponse(ReadOnlySpan<byte> source) =>
        JsonSerializer.Deserialize(source, Context.CapabilitySetupActivationResponse);

    public static string Serialize(CapabilitySetupPlan value) =>
        JsonSerializer.Serialize(value, Context.CapabilitySetupPlan);

    public static string Serialize(CapabilitySetupCliStatus value) =>
        JsonSerializer.Serialize(value, Context.CapabilitySetupCliStatus);

    public static string Serialize(CapabilityPayloadCliStatus value) =>
        JsonSerializer.Serialize(value, Context.CapabilityPayloadCliStatus);

    public static byte[] Serialize(CapabilitySetupActivationRequest value) =>
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Context.CapabilitySetupActivationRequest));

    public static byte[] Serialize(CapabilitySetupActivationResponse value) =>
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Context.CapabilitySetupActivationResponse));

    public static string SerializeToString(CapabilitySetupActivationResponse value) =>
        JsonSerializer.Serialize(value, Context.CapabilitySetupActivationResponse);

    public static byte[] Serialize(CapabilitySetupReaderConfiguration value) =>
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Context.CapabilitySetupReaderConfiguration));

    public static byte[] Serialize(CapabilitySetupOwnership value) =>
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Context.CapabilitySetupOwnership));

    public static CapabilitySetupOwnership? DeserializeOwnership(ReadOnlySpan<byte> source) =>
        JsonSerializer.Deserialize(source, Context.CapabilitySetupOwnership);

    private static CapabilitySetupJsonContext CreateContext()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
        };
        options.Converters.Add(new JsonStringEnumConverter<CapabilitySetupAction>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilityRuntimeState>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilityInstallationState>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilityOwnershipState>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilityCatalogDisposition>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilitySetupNextStep>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilityPayloadComponent>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilitySetupTransactionStatus>(JsonNamingPolicy.CamelCase, false));
        options.Converters.Add(new JsonStringEnumConverter<CapabilitySetupTransactionStage>(JsonNamingPolicy.CamelCase, false));
        return new(options);
    }
}

[JsonSourceGenerationOptions(
    JsonSerializerDefaults.Web,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow)]
[JsonSerializable(typeof(CapabilitySetupManifest))]
[JsonSerializable(typeof(CapabilityPayloadManifest))]
[JsonSerializable(typeof(CapabilitySetupPlanRequest))]
[JsonSerializable(typeof(CapabilitySetupPlan))]
[JsonSerializable(typeof(CapabilitySetupCliStatus))]
[JsonSerializable(typeof(CapabilityPayloadCliStatus))]
[JsonSerializable(typeof(CapabilitySetupActivationRequest))]
[JsonSerializable(typeof(CapabilitySetupActivationResponse))]
[JsonSerializable(typeof(CapabilitySetupReaderConfiguration))]
[JsonSerializable(typeof(CapabilitySetupOwnership))]
internal partial class CapabilitySetupJsonContext : JsonSerializerContext
{
}

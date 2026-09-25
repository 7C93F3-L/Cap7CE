namespace Cap7CE.Core.Protocol;

public sealed class CoreProtocolException : Exception
{
    public CoreProtocolException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public CoreProtocolException(string code, string message, Exception innerException)
        : base(message, innerException)
    {
        Code = code;
    }

    public string Code { get; }
}

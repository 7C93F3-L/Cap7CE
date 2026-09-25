namespace Cap7CE.Core.Reader.Protocol;

public sealed class ReaderProtocolException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

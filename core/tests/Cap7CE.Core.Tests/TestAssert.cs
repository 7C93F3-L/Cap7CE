namespace Cap7CE.Core.Tests;

internal static class TestAssert
{
    public static void True(bool value, string message)
    {
        if (!value) throw new InvalidOperationException(message);
    }

    public static void False(bool value, string message) => True(!value, message);

    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException($"{message}: expected {expected}, actual {actual}");
        }
    }

    public static async Task ThrowsAsync<TException>(Func<Task> action, string message)
        where TException : Exception
    {
        try
        {
            await action();
        }
        catch (TException)
        {
            return;
        }
        throw new InvalidOperationException($"{message}: expected {typeof(TException).Name}");
    }

    public static async Task ThrowsCodeAsync(string code, Func<Task> action, string message)
    {
        try
        {
            await action();
        }
        catch (Core.Protocol.CoreProtocolException error)
        {
            Equal(code, error.Code, message);
            return;
        }
        throw new InvalidOperationException($"{message}: expected protocol exception");
    }

    public static void ThrowsCode(string code, Action action, string message)
    {
        try
        {
            action();
        }
        catch (Core.Protocol.CoreProtocolException error)
        {
            Equal(code, error.Code, message);
            return;
        }
        throw new InvalidOperationException($"{message}: expected protocol exception");
    }
}

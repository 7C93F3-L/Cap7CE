namespace Cap7CE.Core.Catalog;

public sealed class CatalogSchemaException(string message, Exception? innerException = null)
    : Exception(message, innerException);

public sealed class CatalogConcurrencyException(string message, Exception? innerException = null)
    : Exception(message, innerException);

public sealed class CatalogStateTransitionException(string message, Exception? innerException = null)
    : Exception(message, innerException);

public sealed class CatalogNotQueryableException(string message, Exception? innerException = null)
    : Exception(message, innerException);

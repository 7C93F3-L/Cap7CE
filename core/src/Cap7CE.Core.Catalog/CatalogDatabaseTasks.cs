namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public async Task StartTaskAsync(
        CatalogTaskRecord task,
        CancellationToken cancellationToken = default)
    {
        ValidateTask(task);
        if (task.CompletedUtcTicks is not null || task.ErrorCode is not null)
        {
            throw new ArgumentException("A new catalog task cannot already be completed.", nameof(task));
        }
        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO catalog_tasks(
                task_id, volume_id, kind, phase, processed, total,
                started_utc_ticks, completed_utc_ticks, error_code)
            VALUES($taskId, $volumeId, $kind, $phase, $processed, $total, $started, NULL, NULL);
            """;
        BindTask(command, task);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task UpdateTaskProgressAsync(
        string taskId,
        string phase,
        long processed,
        long? total,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(taskId, 128, nameof(taskId));
        RequireBoundedText(phase, 64, nameof(phase));
        if (processed < 0 || total < 0) throw new ArgumentOutOfRangeException(nameof(processed));
        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE catalog_tasks
            SET phase = $phase, processed = $processed, total = $total
            WHERE task_id = $taskId AND completed_utc_ticks IS NULL;
            """;
        command.Parameters.AddWithValue("$phase", phase);
        command.Parameters.AddWithValue("$processed", processed);
        command.Parameters.AddWithValue("$total", (object?)total ?? DBNull.Value);
        command.Parameters.AddWithValue("$taskId", taskId);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new CatalogConcurrencyException("Catalog task is missing or already completed.");
        }
    }

    public async Task CompleteTaskAsync(
        string taskId,
        long completedUtcTicks,
        string? errorCode,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(taskId, 128, nameof(taskId));
        if (completedUtcTicks < 0) throw new ArgumentOutOfRangeException(nameof(completedUtcTicks));
        if (errorCode is not null) RequireBoundedText(errorCode, 128, nameof(errorCode));
        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE catalog_tasks
            SET completed_utc_ticks = $completed, error_code = $errorCode
            WHERE task_id = $taskId AND completed_utc_ticks IS NULL;
            """;
        command.Parameters.AddWithValue("$completed", completedUtcTicks);
        command.Parameters.AddWithValue("$errorCode", (object?)errorCode ?? DBNull.Value);
        command.Parameters.AddWithValue("$taskId", taskId);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new CatalogConcurrencyException("Catalog task is missing or already completed.");
        }
    }

    public async Task<CatalogTaskRecord?> ReadTaskAsync(
        string taskId,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(taskId, 128, nameof(taskId));
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT task_id, volume_id, kind, phase, processed, total,
                   started_utc_ticks, completed_utc_ticks, error_code
            FROM catalog_tasks WHERE task_id = $taskId;
            """;
        command.Parameters.AddWithValue("$taskId", taskId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CatalogTaskRecord(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetInt64(4), reader.IsDBNull(5) ? null : reader.GetInt64(5),
            reader.GetInt64(6), reader.IsDBNull(7) ? null : reader.GetInt64(7),
            reader.IsDBNull(8) ? null : reader.GetString(8));
    }

    private static void ValidateTask(CatalogTaskRecord task)
    {
        ArgumentNullException.ThrowIfNull(task);
        RequireBoundedText(task.TaskId, 128, nameof(task.TaskId));
        RequireBoundedText(task.VolumeId, 128, nameof(task.VolumeId));
        RequireBoundedText(task.Kind, 64, nameof(task.Kind));
        RequireBoundedText(task.Phase, 64, nameof(task.Phase));
        if (task.Processed < 0 || task.Total < 0 || task.StartedUtcTicks < 0 || task.CompletedUtcTicks < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(task));
        }
    }

    private static void BindTask(Microsoft.Data.Sqlite.SqliteCommand command, CatalogTaskRecord task)
    {
        command.Parameters.AddWithValue("$taskId", task.TaskId);
        command.Parameters.AddWithValue("$volumeId", task.VolumeId);
        command.Parameters.AddWithValue("$kind", task.Kind);
        command.Parameters.AddWithValue("$phase", task.Phase);
        command.Parameters.AddWithValue("$processed", task.Processed);
        command.Parameters.AddWithValue("$total", (object?)task.Total ?? DBNull.Value);
        command.Parameters.AddWithValue("$started", task.StartedUtcTicks);
    }
}

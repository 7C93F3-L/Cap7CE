using Cap7CE.Core.Configuration;

namespace Cap7CE.Core.FileOperations;

public sealed record FolderRenameState(string Kind, FolderRenameRecord? Record, string? Ticket, IReadOnlyList<FavoriteDirectory> Directories);

public sealed class FolderRenameWorkflow(string configurationPath)
{
    private readonly FolderRenameJournal journal = new(configurationPath);
    private readonly FavoriteDirectoryRegistry registry = new(new(configurationPath));
    private static FavoriteConfigurationException Failure(string code) => new("folder-rename-" + code);
    public async Task<FolderRenameState> PrepareAsync(string id, string name)
    {
        if (await journal.ReadAsync() is not null) throw Failure("recovery-needed");
        var directories = await registry.ExecuteAsync("list");
        var item = directories.SingleOrDefault(value => value.Id == id) ?? throw new FavoriteConfigurationException("favorite-directory-not-found");
        var oldPath = FavoriteDirectoryRules.PathValue(item.Path); WindowsFileOperationRules.Name(name);
        if (oldPath.Length <= 3) throw Failure("root");
        var newPath = FavoriteDirectoryRules.PathValue(Path.Combine(Path.GetDirectoryName(oldPath)!, name));
        if (newPath == oldPath) return new("none", null, null, directories);
        try { FavoriteDirectoryRelocation.Apply(directories, oldPath, newPath); }
        catch (FavoriteConfigurationException) { throw Failure("favorite-conflict"); }
        var source = WindowsDirectorySource.Capture(oldPath);
        if (source is not { IsDirectory: true, IsLink: false }) throw Failure("not-directory");
        if (FavoriteDirectoryRules.Key(source.RealPath) != FavoriteDirectoryRules.Key(oldPath)
            || FavoriteDirectoryRules.Relocate(journal.PathValue, oldPath, newPath) != journal.PathValue) throw Failure("protected");
        await journal.WriteAsync(new(oldPath, newPath, source.Dev, source.Ino));
        var checkpoint = (await journal.ReadAsync())!;
        return new("prepared", checkpoint.Record, checkpoint.Ticket, directories);
    }
    public async Task<FolderRenameState> ObserveAsync(WindowsFileOperationResult? outcome)
    {
        var checkpoint = await journal.ReadAsync() ?? throw Failure("recovery-needed"); var record = checkpoint.Record;
        if (outcome is { Status: "renamed", Path: { } actual } && actual != record.NewPath)
        {
            record = record with { NewPath = FavoriteDirectoryRules.PathValue(actual) };
            await journal.WriteAsync(record); checkpoint = (await journal.ReadAsync())!;
        }
        if (Committed(record)) return await MovedAsync(checkpoint);
        if (outcome?.Status == "renamed") throw Failure("target-changed");
        var recovery = await RecoverAsync();
        if (outcome?.Status == "failed") throw Failure($"shell-failed:{outcome.Error}");
        return recovery;
    }
    public async Task<FolderRenameState> RecoverAsync()
    {
        var checkpoint = await journal.ReadAsync(); if (checkpoint is null) return new("none", null, null, []);
        if (Committed(checkpoint.Record)) return await MovedAsync(checkpoint);
        var old = WindowsDirectorySource.Capture(checkpoint.Record.OldPath);
        if (Matches(old, checkpoint.Record)) { journal.Remove(); return new("none", null, null, await registry.ExecuteAsync("list")); }
        throw Failure("recovery-needed");
    }
    public async Task<FolderRenameState> CompleteAsync(string ticket)
    {
        var checkpoint = await journal.ReadAsync();
        if (checkpoint is null || checkpoint.Ticket != ticket || !Committed(checkpoint.Record)) throw Failure("recovery-needed");
        var directories = await registry.ExecuteAsync("relocate", oldPath: checkpoint.Record.OldPath, newPath: checkpoint.Record.NewPath);
        journal.Remove(); return new("none", null, null, directories);
    }
    private async Task<FolderRenameState> MovedAsync(FolderRenameCheckpoint checkpoint) => new("moved", checkpoint.Record, checkpoint.Ticket,
        FavoriteDirectoryRelocation.Apply(await registry.ExecuteAsync("list"), checkpoint.Record.OldPath, checkpoint.Record.NewPath));
    private static bool Matches(WindowsDirectoryIdentity? actual, FolderRenameRecord expected) => actual is { IsDirectory: true, IsLink: false }
        && actual.Dev == expected.Dev && actual.Ino == expected.Ino;
    private static bool Committed(FolderRenameRecord record)
    {
        if (!Matches(WindowsDirectorySource.Capture(record.NewPath), record)) return false;
        return FavoriteDirectoryRules.Key(record.OldPath) != FavoriteDirectoryRules.Key(record.NewPath) || WindowsDirectorySource.ExactName(record.NewPath);
    }
}

// Conversation Lab workbench host.
//
// A tiny .NET Minimal API that lets the Angular Conversation Lab talk to a REAL
// coding-agent CLI (Claude Code / Codex / Gemini) through the published
// CodingAgentRunner NuGet package. It exposes chat-shaped session endpoints and
// streams every produced line as a Server-Sent Event whose JSON shape matches
// `CliOutputLine` from '@coding-agent/chat/core' ({timestamp, stream, text}).
//
// ── How "interactive sessions" map onto the runner API ─────────────────────────
// CodingAgentRunner does NOT model a conversation as a long-lived stdin-driven
// process. Its hardening gives every spawned CLI an immediate-EOF stdin by
// default (a live stdin pipe can wedge Node CLIs on Windows), and each prompt is
// executed as a one-shot `stream-json` run that ends with the CLI's own result
// frame. The idiomatic multi-turn pattern — documented on
// `CliRunRequest.ResumeSessionId` — is:
//
//   1. run #1 carries the initial prompt; the adapter surfaces the CLI-native
//      session id via `CliRunEvent.SessionStarted`,
//   2. every follow-up message starts a NEW run whose `ResumeSessionId` is that
//      captured id, so the CLI itself restores the conversation context.
//
// A workbench "session" is therefore a chain of one-shot runs sharing one
// CLI-native session id. Runs use `ContextMode=shared` (the operator's signed-in
// CLI home) because a resume must find the session transcript the previous run
// wrote — the default `clean` mode gives every run a fresh isolated home, which
// would break the chain.
//
// The SSE line stream is synthesized from the runner's normalized
// `CliRunEvent` vocabulary (plus raw stderr passthrough), NOT from the raw
// stdout frames: raw Claude stdout is `stream-json` protocol noise, while the
// chat projection (`projectConversation`) consumes activity-log-style lines
// (user turns on stream 'user', agent text on 'stdout', `* Verb …` tool action
// markers, `[taskboard]`-prefixed run bookkeeping on 'system').

using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using CodingAgentRunner;
using CodingAgentRunner.Abstractions;
using CodingAgentRunner.Events;
using CodingAgentRunner.Execution;
using CodingAgentRunner.Model;

const string CorsPolicy = "lab";

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5055");

// The lab serves on its fixed port 4201 (see angular.json); 4200 stays
// allowed as a fallback for a manually chosen `ng serve --port 4200`.
builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy => policy
    .WithOrigins("http://localhost:4201", "http://localhost:4200")
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddSingleton<WorkbenchSessionStore>();

var app = builder.Build();
app.UseCors(CorsPolicy);

var store = app.Services.GetRequiredService<WorkbenchSessionStore>();

// Default sandbox workdir next to the workbench project so agent runs never
// touch the chat repo itself unless the caller explicitly points them at one.
var defaultWorkdir = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "sandbox"));
Directory.CreateDirectory(defaultWorkdir);

// Clean process teardown: stop every live CLI run before Kestrel goes away so
// no orphaned agent process keeps editing the sandbox after the host is gone.
app.Lifetime.ApplicationStopping.Register(store.StopAll);

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

app.MapGet("/api/health", (WorkbenchSessionStore s) =>
    Results.Ok(new { status = "ok", clis = s.SupportedCliTypes, defaultWorkdir }));

app.MapPost("/api/sessions", async (StartSessionRequest request, WorkbenchSessionStore s) =>
{
    if (string.IsNullOrWhiteSpace(request.Prompt))
        return Results.BadRequest(new { error = "prompt is required" });

    var workdir = string.IsNullOrWhiteSpace(request.Workdir) ? defaultWorkdir : Path.GetFullPath(request.Workdir);
    Directory.CreateDirectory(workdir);

    var (session, error) = s.CreateSession(request.CliType ?? CliTypes.Claude, workdir);
    if (session is null)
        return Results.BadRequest(new { error });

    var startError = await session.StartRunAsync(request.Prompt);
    if (startError is not null)
    {
        s.Remove(session.Id);
        return Results.Problem(startError, statusCode: StatusCodes.Status502BadGateway);
    }
    return Results.Created($"/api/sessions/{session.Id}", new { sessionId = session.Id });
});

app.MapPost("/api/sessions/{id}/messages", async (string id, PostMessageRequest request, WorkbenchSessionStore s) =>
{
    if (!s.TryGet(id, out var session))
        return Results.NotFound(new { error = $"unknown session '{id}'" });
    if (string.IsNullOrWhiteSpace(request.Text))
        return Results.BadRequest(new { error = "text is required" });
    if (session.IsRunning)
        return Results.Conflict(new { error = "the agent is still working on the previous message" });

    var error = await session.StartRunAsync(request.Text);
    return error is null
        ? Results.Accepted($"/api/sessions/{id}/stream", new { sessionId = id })
        : Results.Problem(error, statusCode: StatusCodes.Status502BadGateway);
});

app.MapGet("/api/sessions/{id}/stream", async (string id, HttpContext ctx, WorkbenchSessionStore s) =>
{
    if (!s.TryGet(id, out var session))
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    ctx.Response.Headers.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers["X-Accel-Buffering"] = "no";

    var ct = ctx.RequestAborted;
    var (snapshot, reader, unsubscribe) = session.Subscribe();
    try
    {
        foreach (var line in snapshot)
            await WriteSseAsync(ctx.Response, line, jsonOptions, ct);
        await ctx.Response.Body.FlushAsync(ct);

        while (!ct.IsCancellationRequested)
        {
            var readTask = reader.WaitToReadAsync(ct).AsTask();
            var winner = await Task.WhenAny(readTask, Task.Delay(TimeSpan.FromSeconds(15), ct));
            if (winner != readTask)
            {
                // SSE comment as keep-alive so proxies / the browser keep the pipe open.
                await ctx.Response.WriteAsync(": keep-alive\n\n", ct);
                await ctx.Response.Body.FlushAsync(ct);
                continue;
            }
            if (!await readTask)
                break; // channel completed — the session was deleted.
            while (reader.TryRead(out var line))
                await WriteSseAsync(ctx.Response, line, jsonOptions, ct);
            await ctx.Response.Body.FlushAsync(ct);
        }
    }
    catch (OperationCanceledException)
    {
        // Client went away — normal SSE teardown.
    }
    finally
    {
        unsubscribe();
    }
});

app.MapDelete("/api/sessions/{id}", (string id, WorkbenchSessionStore s) =>
{
    if (!s.TryGet(id, out var session))
        return Results.NotFound(new { error = $"unknown session '{id}'" });
    session.Stop();
    s.Remove(id);
    return Results.NoContent();
});

app.Run();

static async Task WriteSseAsync(HttpResponse response, OutputLineDto line, JsonSerializerOptions options, CancellationToken ct)
{
    var payload = JsonSerializer.Serialize(line, options);
    await response.WriteAsync($"data: {payload}\n\n", ct);
}

/// <summary>Body of <c>POST /api/sessions</c>.</summary>
sealed record StartSessionRequest(string? CliType, string? Workdir, string? Prompt);

/// <summary>Body of <c>POST /api/sessions/{id}/messages</c>.</summary>
sealed record PostMessageRequest(string? Text);

/// <summary>
/// The wire shape of one streamed line — structurally identical to
/// <c>CliOutputLine</c> from '@coding-agent/chat/core' once serialized with
/// web defaults ({"timestamp": ISO-8601, "stream", "text"}).
/// </summary>
sealed record OutputLineDto(DateTime Timestamp, string Stream, string Text);

/// <summary>
/// Owns the one <see cref="CliRunner"/> instance and every live workbench
/// session. Driver events are multiplexed (one subscription per driver) and
/// routed to sessions by the consumer-assigned run id.
/// </summary>
sealed class WorkbenchSessionStore
{
    private readonly CliRunner _runner = new(new CliOptions());
    private readonly ConcurrentDictionary<string, WorkbenchSession> _sessions = new();
    private readonly ConcurrentDictionary<string, WorkbenchSession> _sessionsByRunId = new();

    public WorkbenchSessionStore()
    {
        foreach (var driver in _runner.Drivers)
        {
            driver.OnRunEvent += (runId, evt) =>
            {
                if (_sessionsByRunId.TryGetValue(runId, out var session))
                    session.HandleRunEvent(evt);
            };
            // Raw stderr passthrough: real error text (crashes, auth problems)
            // never shows up in the typed event stream verbatim, but the chat
            // projection renders stderr lines as error rows.
            driver.OnOutput += (runId, line) =>
            {
                if (line.Stream == "stderr" && _sessionsByRunId.TryGetValue(runId, out var session))
                    session.AppendLine("stderr", line.Text);
            };
        }
    }

    public IReadOnlyCollection<string> SupportedCliTypes => _runner.SupportedCliTypes;

    public (WorkbenchSession? Session, string? Error) CreateSession(string cliType, string workdir)
    {
        if (!_runner.TryGet(cliType, out var driver))
            return (null, $"unknown cliType '{cliType}'. Known: {string.Join(", ", _runner.SupportedCliTypes)}");
        var session = new WorkbenchSession(Guid.NewGuid().ToString("n")[..12], driver, workdir, RegisterRunId);
        _sessions[session.Id] = session;
        return (session, null);
    }

    public bool TryGet(string id, out WorkbenchSession session) => _sessions.TryGetValue(id, out session!);

    public void Remove(string id)
    {
        if (_sessions.TryRemove(id, out var session))
        {
            session.Stop();
            foreach (var runId in session.RunIds)
                _sessionsByRunId.TryRemove(runId, out _);
        }
    }

    public void StopAll()
    {
        foreach (var id in _sessions.Keys.ToArray())
            Remove(id);
    }

    private void RegisterRunId(string runId, WorkbenchSession session) => _sessionsByRunId[runId] = session;
}

/// <summary>
/// One chat session = a chain of one-shot CLI runs linked by the CLI-native
/// session id (see the file header for why this is the runner's idiomatic
/// interactive pattern). Buffers every synthesized line and fans it out to any
/// number of SSE subscribers.
/// </summary>
sealed class WorkbenchSession
{
    private readonly ICliDriver _driver;
    private readonly string _workdir;
    private readonly Action<string, WorkbenchSession> _registerRunId;
    private readonly object _gate = new();
    private readonly List<OutputLineDto> _lines = [];
    private readonly Dictionary<Guid, Channel<OutputLineDto>> _subscribers = [];
    private readonly List<string> _runIds = [];

    private string? _cliSessionId;
    private string? _activeRunId;
    private int _runSeq;
    private bool _closed;

    public WorkbenchSession(string id, ICliDriver driver, string workdir, Action<string, WorkbenchSession> registerRunId)
    {
        Id = id;
        _driver = driver;
        _workdir = workdir;
        _registerRunId = registerRunId;
    }

    public string Id { get; }

    public bool IsRunning { get { lock (_gate) return _activeRunId is not null; } }

    public IReadOnlyList<string> RunIds { get { lock (_gate) return _runIds.ToArray(); } }

    /// <summary>Start the next one-shot run of this session (initial prompt or follow-up).</summary>
    public async Task<string?> StartRunAsync(string prompt)
    {
        string runId;
        string? resume;
        lock (_gate)
        {
            if (_closed) return "session is closed";
            if (_activeRunId is not null) return "a run is already active";
            _runSeq += 1;
            runId = $"{Id}-r{_runSeq}";
            _activeRunId = runId;
            _runIds.Add(runId);
            resume = _cliSessionId;
        }
        _registerRunId(runId, this);

        // The user's turn, in the shape the chat projection expects.
        AppendLine("user", prompt);

        var (_, error) = await _driver.StartAsync(new CliRunRequest
        {
            RunId = runId,
            Prompt = prompt,
            WorkingDirectory = _workdir,
            // Follow-ups resume the CLI-native session captured from run #1's
            // SessionStarted event — the runner's one-shot + resume session model.
            ResumeSessionId = resume,
            // Shared context (the operator's signed-in CLI home) is required for
            // the resume chain: a clean per-run home would not contain the
            // session transcript the previous run wrote.
            ContextMode = CliContextModes.Shared,
        });

        if (error is not null)
        {
            lock (_gate) _activeRunId = null;
            AppendLine("stderr", $"Failed to start {_driver.CliType} run: {error}");
            return error;
        }
        return null;
    }

    /// <summary>Map the runner's normalized event vocabulary onto activity-log-style chat lines.</summary>
    public void HandleRunEvent(CliRunEvent evt)
    {
        switch (evt)
        {
            case CliRunEvent.RunStarted started:
                // `[taskboard]`-prefixed system lines are run bookkeeping: the
                // projection captures `model=` from them and drops the line.
                AppendLine("system", $"[taskboard] Started {started.CliType} run{(started.Model is null ? "" : $" model={started.Model}")}");
                break;

            case CliRunEvent.SessionStarted session when !string.IsNullOrWhiteSpace(session.SessionId):
                lock (_gate) _cliSessionId ??= session.SessionId;
                AppendLine("system", $"[taskboard] session {session.SessionId}");
                break;

            case CliRunEvent.OutputDelta delta:
                foreach (var line in delta.Text.Replace("\r\n", "\n").Split('\n'))
                    AppendLine("stdout", line);
                break;

            case CliRunEvent.ToolStarted tool:
                AppendLine("stdout", $"* {ToolActionLabel(tool.ToolName, tool.Argument)}");
                break;

            case CliRunEvent.ToolCompleted { IsError: true } failed:
                AppendLine("stdout", $"x {failed.ToolName} failed{(string.IsNullOrWhiteSpace(failed.FirstLine) ? "" : $": {failed.FirstLine}")}");
                break;

            case CliRunEvent.PlanUpdated plan:
                AppendLine("stdout", $"* Todo {string.Join("; ", plan.Items.Select(i => $"[{i.Status}] {i.Title}"))}");
                break;

            case CliRunEvent.TurnFailed turnFailed:
                AppendLine("stderr", $"Turn failed: {turnFailed.Reason}");
                break;

            case CliRunEvent.NeedsInput needsInput:
                AppendLine("orchestrator", $"[needs-input] {needsInput.Reason}");
                break;

            case CliRunEvent.ApprovalRequested approval:
                AppendLine("orchestrator", $"[approval] {approval.Description}");
                break;

            case CliRunEvent.Interrupt { IsFatal: true } interrupt:
                AppendLine("stderr", $"Interrupt ({interrupt.Reason}): {interrupt.Detail}");
                break;

            case CliRunEvent.TurnCompleted turn:
                AppendLine("system", $"[taskboard] turn completed{(turn.UsageSummary is null ? "" : $" — {turn.UsageSummary}")}");
                break;

            case CliRunEvent.RunEnded ended:
                lock (_gate) _activeRunId = null;
                AppendLine("system", $"[taskboard] Exited outcome={ended.Outcome} exit={ended.ExitCode?.ToString() ?? "?"} after {ended.Duration:F1}s");
                if (ended.Outcome == RunOutcome.Failed)
                    AppendLine("stderr", $"Run failed: {ended.Reason ?? "unknown reason"}");
                break;

            // Deliberately silent: protocol/liveness noise the chat has no row for.
            case CliRunEvent.SessionInitializing:
            case CliRunEvent.TurnStarted:
            case CliRunEvent.Heartbeat:
            case CliRunEvent.RateLimitObserved:
            case CliRunEvent.ToolCompleted:
            case CliRunEvent.Interrupt:
            case CliRunEvent.Unknown:
            case CliRunEvent.SessionStarted:
                break;
        }
    }

    public void AppendLine(string stream, string text)
    {
        var line = new OutputLineDto(DateTime.UtcNow, stream, text);
        lock (_gate)
        {
            if (_closed) return;
            _lines.Add(line);
            foreach (var channel in _subscribers.Values)
                channel.Writer.TryWrite(line);
        }
    }

    /// <summary>Atomically snapshot the backlog and register a live subscriber channel.</summary>
    public (OutputLineDto[] Snapshot, ChannelReader<OutputLineDto> Reader, Action Unsubscribe) Subscribe()
    {
        var key = Guid.NewGuid();
        var channel = Channel.CreateUnbounded<OutputLineDto>(new UnboundedChannelOptions { SingleReader = true });
        OutputLineDto[] snapshot;
        lock (_gate)
        {
            snapshot = [.. _lines];
            if (_closed)
                channel.Writer.TryComplete();
            else
                _subscribers[key] = channel;
        }
        return (snapshot, channel.Reader, () =>
        {
            lock (_gate) _subscribers.Remove(key);
            channel.Writer.TryComplete();
        });
    }

    /// <summary>Stop the live run (reported as a deliberate stop, not a crash) and close the stream.</summary>
    public void Stop()
    {
        string? activeRunId;
        List<Channel<OutputLineDto>> toComplete;
        lock (_gate)
        {
            if (_closed) return;
            _closed = true;
            activeRunId = _activeRunId;
            _activeRunId = null;
            toComplete = [.. _subscribers.Values];
            _subscribers.Clear();
        }
        if (activeRunId is not null)
            _driver.Stop(activeRunId, RunStopReason.UserStop);
        foreach (var channel in toComplete)
            channel.Writer.TryComplete();
    }

    /// <summary>
    /// Map the runner's normalized tool names onto the verb vocabulary the chat
    /// activity-log parser classifies (`Read` / `Search` / `Edit` / `Run` / …) so
    /// tool activity folds into tool-burst rows instead of raw text.
    /// </summary>
    private static string ToolActionLabel(string toolName, string? argument)
    {
        var arg = string.IsNullOrWhiteSpace(argument) ? "" : $" {argument.Trim()}";
        return toolName switch
        {
            "Read" or "NotebookRead" => $"Read{arg}",
            "Grep" or "Glob" or "Search" or "WebSearch" or "WebFetch" => $"Search{arg}",
            "Edit" or "MultiEdit" or "NotebookEdit" => $"Edit{arg}",
            "Write" => $"Write{arg}",
            "Bash" or "Shell" or "BashOutput" => $"Run{arg} (shell)",
            "Task" => $"Task{arg}",
            "TodoWrite" or "Todo" => $"Todo{arg}",
            _ => $"Execute {toolName}{arg}",
        };
    }
}

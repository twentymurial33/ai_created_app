import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Gauge, Play, RotateCcw, Zap } from "lucide-react";
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";

const DEFAULT_PROMPT = "Explain the difference between REST APIs and GraphQL in about 100 words.";

function ms(value) {
  return value == null ? "—" : `${(value / 1000).toFixed(2)} s`;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export default function App() {
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState(["openai", "anthropic", "gemini"]);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [runs, setRuns] = useState(3);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/providers")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load provider configuration.");
        return response.json();
      })
      .then((data) => {
        setProviders(data);
        setSelected(data.filter((provider) => provider.configured).map((provider) => provider.id));
      })
      .catch((err) => setError(err.message));
  }, []);

  const configuredSelected = selected.filter((id) =>
    providers.find((provider) => provider.id === id)?.configured
  );

  const summaries = useMemo(() => {
    return providers
      .filter((provider) => selected.includes(provider.id))
      .map((provider) => {
        const rows = results.filter((result) => result.provider === provider.id && result.success);
        return {
          ...provider,
          count: rows.length,
          avgTtft: average(rows.map((row) => row.ttftMs)),
          avgTotal: average(rows.map((row) => row.totalMs)),
          avgTps: average(rows.map((row) => row.tokensPerSecond))
        };
      });
  }, [providers, selected, results]);

  const chartData = summaries
    .filter((item) => item.avgTotal != null)
    .map((item) => ({
      provider: item.name.replace("Google ", ""),
      "TTFT (ms)": item.avgTtft == null ? 0 : Math.round(item.avgTtft),
      "Total (ms)": Math.round(item.avgTotal)
    }));

  async function runBenchmark(event) {
    event.preventDefault();
    setError("");
    setResults([]);
    setLoading(true);
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, providers: selected, runs: Number(runs) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Benchmark request failed.");
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleProvider(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><Activity size={21} /></div><div><span className="eyebrow">MODEL PERFORMANCE</span><h1>LLM Benchmark</h1></div></div>
        <div className="live-pill"><span /> Direct API testing</div>
      </header>

      <section className="intro">
        <div>
          <span className="eyebrow">BENCHMARK WORKSPACE</span>
          <h2>Compare model speed.<br /><em>Make better decisions.</em></h2>
          <p>Run the same prompt against multiple AI providers and measure streaming latency, completion time, and throughput.</p>
        </div>
        <div className="intro-mark"><Gauge size={76} strokeWidth={1.1} /></div>
      </section>

      <section className="workspace">
        <form className="panel setup-panel" onSubmit={runBenchmark}>
          <div className="section-heading"><div><span className="eyebrow">01 / CONFIGURATION</span><h3>Configure your test</h3></div><span className="step">01</span></div>

          <label className="field-label" htmlFor="prompt">Test prompt</label>
          <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={12000} placeholder="Enter the prompt to send to each model..." />

          <div className="field-row">
            <label className="field-label" htmlFor="runs">Number of runs</label>
            <select id="runs" value={runs} onChange={(e) => setRuns(e.target.value)}>
              {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? "run" : "runs"}</option>)}
            </select>
          </div>

          <div className="provider-heading"><label className="field-label">Providers</label><span className="muted">Choose one or more</span></div>
          <div className="provider-list">
            {providers.map((provider) => (
              <label className={`provider-option ${selected.includes(provider.id) ? "chosen" : ""}`} key={provider.id}>
                <input type="checkbox" checked={selected.includes(provider.id)} disabled={!provider.configured} onChange={() => toggleProvider(provider.id)} />
                <span className={`provider-dot ${provider.id}`} />
                <span className="provider-copy"><strong>{provider.name}</strong><small>{provider.model}</small></span>
                <span className={`status ${provider.configured ? "ready" : "missing"}`}>{provider.configured ? "API key ready" : "Key missing"}</span>
              </label>
            ))}
          </div>

          <button className="run-button" type="submit" disabled={loading || !prompt.trim() || !configuredSelected.length}>
            {loading ? <><span className="spinner" /> Running benchmark…</> : <><Play size={17} fill="currentColor" /> Run benchmark</>}
          </button>
          <p className="hint">Each run makes one billable API request per selected provider. Requests within a run execute concurrently.</p>
          {error && <div className="error-box">{error}</div>}
          {providers.length > 0 && configuredSelected.length === 0 && <div className="warning-box">Add at least one provider API key in <code>server/.env</code>, then restart the server.</div>}
        </form>

        <section className="results-column">
          <div className="section-heading results-title"><div><span className="eyebrow">02 / RESULTS</span><h3>Performance overview</h3></div><span className="step">02</span></div>
          <div className="metric-grid">
            <Metric icon={<Clock3 />} label="Avg. time to first token" value={ms(average(results.filter(r => r.success).map(r => r.ttftMs)))} />
            <Metric icon={<Zap />} label="Avg. total response" value={ms(average(results.filter(r => r.success).map(r => r.totalMs)))} />
            <Metric icon={<Gauge />} label="Successful requests" value={`${results.filter(r => r.success).length}/${results.length || 0}`} />
          </div>

          <div className="panel chart-panel">
            <div className="panel-heading"><div><h3>Response time comparison</h3><p>Average across successful runs</p></div><span className="chart-key"><i /> TTFT <i className="key-total" /> Total</span></div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263044" vertical={false} />
                  <XAxis dataKey="provider" stroke="#8d9ab0" tickLine={false} axisLine={false} />
                  <YAxis stroke="#8d9ab0" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#111a2b", border: "1px solid #2b3850", borderRadius: 10, color: "#eef3ff" }} />
                  <Bar dataKey="TTFT (ms)" fill="#51d6b2" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Total (ms)" fill="#8194ff" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text={loading ? "Waiting for provider responses…" : "Run a benchmark to see your comparison chart."} />}
          </div>

          <div className="panel table-panel">
            <div className="panel-heading"><div><h3>Provider results</h3><p>Average metrics by provider</p></div><button className="icon-button" onClick={() => setResults([])} type="button" title="Clear results"><RotateCcw size={16} /></button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Provider / model</th><th>Avg. TTFT</th><th>Avg. total</th><th>Tokens/sec</th><th>Runs</th></tr></thead>
                <tbody>
                  {summaries.map((item) => <tr key={item.id}>
                    <td><strong>{item.name}</strong><small>{item.model}</small></td>
                    <td>{ms(item.avgTtft)}</td><td>{ms(item.avgTotal)}</td><td>{item.avgTps == null ? "—" : item.avgTps.toFixed(1)}</td><td>{item.count}</td>
                  </tr>)}
                  {!summaries.length && <tr><td colSpan="5" className="empty-cell">Provider information will appear here.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>

      {results.length > 0 && <section className="panel detail-panel">
        <div className="panel-heading"><div><span className="eyebrow">03 / RUN LOG</span><h3>Individual responses</h3></div></div>
        <div className="run-list">
          {results.map((result, index) => <article className="run-row" key={`${result.run}-${result.provider}-${index}`}>
            <div><strong>{result.providerName} · Run {result.run}</strong><small>{result.model}</small></div>
            {result.success ? <><span>{ms(result.ttftMs)} TTFT</span><span>{ms(result.totalMs)} total</span><span>{result.outputTokens ?? "—"} tokens</span></> : <span className="failure">{result.error}</span>}
            {result.success && <details><summary>Response preview</summary><p>{result.response || "(No text returned)"}</p></details>}
          </article>)}
        </div>
      </section>}

      <footer><span>LLM Benchmark · Direct provider APIs</span><span>Latency varies with network, model, load, and provider region.</span></footer>
    </main>
  );
}

function Metric({ icon, label, value }) {
  return <div className="metric-card"><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><Activity size={26} /><p>{text}</p></div>;
}

export function ErrorBox({ source, errors }: { source: string; errors: string[] }) {
  return (
    <div className="error-box" role="alert">
      <h3>This log can't be opened</h3>
      <p>
        <code>{source.replace(/^upload:/, '')}</code> doesn't match <code>schema/game_log.schema.json</code> (v1.0.0).
        The first problems found:
      </p>
      <ul>
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <p className="muted">Tip: run <code>npm run validate-logs -- path/to/file.json</code> for the full report.</p>
    </div>
  )
}

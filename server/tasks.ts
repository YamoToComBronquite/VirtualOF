/** A detached task must observe both execution and cleanup failures. Neither escapes. */
export async function runBackground(
  run: () => Promise<unknown>,
  cleanup: () => void,
  onFailure: (error: unknown) => void,
  onCleanupFailure: (error: unknown) => void,
) {
  const report = (handler: (error: unknown) => void, error: unknown) => {
    try { handler(error); } catch (reportError) {
      console.error('Falha ao registrar erro da tarefa:', error, reportError);
    }
  };
  try { await run(); } catch (error) { report(onFailure, error); }
  finally {
    try { cleanup(); } catch (error) { report(onCleanupFailure, error); }
  }
}

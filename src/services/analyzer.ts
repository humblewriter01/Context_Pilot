import { CategorizedFiles } from '../types';

/**
 * Analyzes a Jira ticket via the server-side Gemini 3.8 Flash API route.
 * No mock data: sends the real ticket text and key to /api/analyze.
 */
export async function analyzeTicket(ticketText: string, ticketKey: string): Promise<CategorizedFiles> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticket_text: ticketText,
      ticket_key: ticketKey,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Analysis request failed with status ${response.status}`;
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const result = await response.json();

  const frontend_files: string[] = Array.isArray(result.frontend_files) ? result.frontend_files : [];
  const backend_files: string[] = Array.isArray(result.backend_files) ? result.backend_files : [];
  const database_files: string[] = Array.isArray(result.database_files) ? result.database_files : [];
  const config_files: string[] = Array.isArray(result.config_files) ? result.config_files : [];
  const test_files: string[] = Array.isArray(result.test_files) ? result.test_files : [];

  const total_files =
    result.total_files ??
    (frontend_files.length +
      backend_files.length +
      database_files.length +
      config_files.length +
      test_files.length);

  return {
    frontend_files,
    backend_files,
    database_files,
    config_files,
    test_files,
    confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : 0.85,
    reasoning: result.reasoning || 'Identified impacted files via Gemini 3.8 Flash analysis.',
    total_files,
  };
}

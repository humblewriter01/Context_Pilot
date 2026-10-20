import { CategorizedFiles } from '../types';
import { storageService } from './storage';

export interface AnalysisResponse extends CategorizedFiles {
  processingTimeMs?: number;
  usage?: {
    ticketsProcessed: number;
    monthlyLimit: number;
    remainingTickets: number;
  };
}

/**
 * Analyzes a Jira ticket via the server-side Gemini 3.8 Flash API route (/api/analyze-ticket).
 * Passes user email for server-side Supabase quota enforcement and history logging.
 */
export async function analyzeTicket(
  ticketText: string,
  ticketKey: string,
  userEmail?: string,
  ticketTitle?: string
): Promise<AnalysisResponse> {
  const email = userEmail || storageService.getUser()?.email || '';

  const response = await fetch('/api/analyze-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(email ? { 'x-user-email': email } : {}),
    },
    body: JSON.stringify({
      ticket_text: ticketText,
      ticket_key: ticketKey,
      ticket_title: ticketTitle,
      user_email: email,
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
    processingTimeMs: result.processingTimeMs,
    usage: result.usage,
  };
}

import { ExecutionMethod } from 'appwrite';
import { API_FUNCTION_ID, functions } from './appwrite';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Calls the `api` function synchronously as the signed-in user.
export async function callApi<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const execution = await functions.createExecution({
    functionId: API_FUNCTION_ID,
    body: body === undefined ? '' : JSON.stringify(body),
    async: false,
    xpath: path,
    method: ExecutionMethod[method],
    headers: { 'content-type': 'application/json' },
  });
  let data: any = null;
  try {
    data = execution.responseBody ? JSON.parse(execution.responseBody) : null;
  } catch {
    data = { message: execution.responseBody };
  }
  if (execution.responseStatusCode >= 400 || execution.status === 'failed') {
    throw new ApiError(execution.responseStatusCode || 500, data?.message || 'Something went wrong. Try again.');
  }
  return data as T;
}

// Lightweight logger — minimal subset of source service's terminal logger.
// Discovery emits short, structured events for run lifecycle and agent calls.

const tag = '[discovery]';

export function logInfo(msg: string): void {
  console.log(`${tag} ${msg}`);
}

export function logWarn(msg: string): void {
  console.warn(`${tag} ${msg}`);
}

export function logError(msg: string, err?: unknown): void {
  if (err instanceof Error) {
    console.error(`${tag} ${msg}: ${err.message}`);
  } else if (err !== undefined) {
    console.error(`${tag} ${msg}: ${String(err)}`);
  } else {
    console.error(`${tag} ${msg}`);
  }
}

export function logAgentTokens(input: number, output: number): void {
  console.log(`${tag} agent tokens: in=${input} out=${output}`);
}

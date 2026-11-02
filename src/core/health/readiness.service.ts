import { Injectable } from '@nestjs/common';

/**
 * Process-level readiness. Subsystems (e.g. the default-deny route check in
 * phase 3, RBAC snapshot) register a failure reason; any reason => not ready.
 */
@Injectable()
export class ReadinessService {
  private readonly failures = new Map<string, string>();

  markFailed(key: string, reason: string) {
    this.failures.set(key, reason);
  }

  markOk(key: string) {
    this.failures.delete(key);
  }

  isReady(): boolean {
    return this.failures.size === 0;
  }

  getFailures(): string[] {
    return [...this.failures.keys()];
  }
}

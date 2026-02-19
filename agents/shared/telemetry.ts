export type TelemetrySeverity = "debug" | "info" | "warn" | "error";

export interface TelemetryOptions {
  component: string;
  stream?: (payload: Record<string, unknown>) => Promise<void> | void;
}

export class Telemetry {
  private component: string;
  private stream?: (payload: Record<string, unknown>) => Promise<void> | void;

  constructor(options: TelemetryOptions) {
    this.component = options.component;
    this.stream = options.stream;
  }

  async emit(event: string, severity: TelemetrySeverity, data: Record<string, unknown> = {}) {
    const payload = {
      component: this.component,
      event,
      severity,
      data,
      timestamp: new Date().toISOString(),
    };
    console.log(`[${payload.component}] ${severity.toUpperCase()} ${event}`, data);
    if (this.stream) {
      await this.stream(payload);
    }
  }

  info(event: string, data?: Record<string, unknown>) {
    return this.emit(event, "info", data);
  }

  warn(event: string, data?: Record<string, unknown>) {
    return this.emit(event, "warn", data);
  }

  error(event: string, data?: Record<string, unknown>) {
    return this.emit(event, "error", data);
  }
}

export class NullMetricsService {
  async putMetric(
    _metricName: string,
    _value: number,
    _dimensions: Record<string, string>,
  ) {}

  async safePutMetric(
    _metricName: string,
    _value: number,
    _dimensions: Record<string, string>,
  ) {}
}

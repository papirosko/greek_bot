/**
 * Test double that drops metrics without side effects.
 */
export class NullMetricsService {
  /**
   * No-op metrics sender.
   * @param _metricName Metric name.
   * @param _value Metric value.
   * @param _dimensions Metric dimensions.
   * @returns Promise resolved immediately.
   */
  async putMetric(
    _metricName: string,
    _value: number,
    _dimensions: Record<string, string>,
  ) {}

  /**
   * No-op safe metrics sender.
   * @param _metricName Metric name.
   * @param _value Metric value.
   * @param _dimensions Metric dimensions.
   * @returns Promise resolved immediately.
   */
  async safePutMetric(
    _metricName: string,
    _value: number,
    _dimensions: Record<string, string>,
  ) {}

  /**
   * Returns a no-op counter helper.
   * @param _metricName Metric name.
   * @returns Counter helper.
   */
  counter(_metricName: string) {
    return {
      inc: async (
        _valueOrDimensions?: number | Record<string, string>,
        _dimensions: Record<string, string> = {},
      ) => {},
    };
  }
}

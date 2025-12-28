import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

export type MetricDimensions = Record<string, string>;

const toDimensions = (dimensions: MetricDimensions) =>
  Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }));

/**
 * CloudWatch metrics client with safe wrapper.
 */
export class MetricsService {
  private readonly client: CloudWatchClient;

  /**
   * Creates a metrics client instance.
   */
  constructor() {
    this.client = new CloudWatchClient({});
  }

  /**
   * Sends a metric to CloudWatch.
   * @param metricName Metric name.
   * @param value Metric value.
   * @param dimensions Metric dimensions.
   * @returns Promise resolved when the metric is sent.
   */
  async putMetric(
    metricName: string,
    value: number,
    dimensions: MetricDimensions,
  ) {
    const command = new PutMetricDataCommand({
      Namespace: "GreekBot",
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: "Count",
          Dimensions: toDimensions(dimensions),
        },
      ],
    });
    await this.client.send(command);
  }

  /**
   * Sends a metric but swallows errors to avoid breaking the bot.
   * @param metricName Metric name.
   * @param value Metric value.
   * @param dimensions Metric dimensions.
   * @returns Promise resolved after attempting to send the metric.
   */
  async safePutMetric(
    metricName: string,
    value: number,
    dimensions: MetricDimensions,
  ) {
    try {
      await this.putMetric(metricName, value, dimensions);
    } catch (error) {
      // Metrics should not break the bot.
      console.warn("metric_error", metricName, error);
    }
  }

  /**
   * Returns a counter helper for a metric.
   * @param metricName Metric name.
   * @returns Counter helper.
   */
  counter(metricName: string) {
    return new MetricCounter(this, metricName);
  }
}

/**
 * Counter helper for metrics.
 */
class MetricCounter {
  /**
   * @param metricsService Metrics service.
   * @param metricName Metric name.
   */
  constructor(
    private readonly metricsService: MetricsService,
    private readonly metricName: string,
  ) {}

  /**
   * Increments the counter.
   * @param valueOrDimensions Optional value or dimensions.
   * @param dimensions Optional dimensions when value is provided.
   * @returns Promise resolved after sending the metric.
   */
  inc(
    valueOrDimensions?: number | MetricDimensions,
    dimensions: MetricDimensions = {},
  ) {
    if (typeof valueOrDimensions === "number") {
      return this.metricsService.safePutMetric(
        this.metricName,
        valueOrDimensions,
        dimensions,
      );
    }
    return this.metricsService.safePutMetric(
      this.metricName,
      1,
      valueOrDimensions ?? {},
    );
  }
}

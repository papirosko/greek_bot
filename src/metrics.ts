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
}

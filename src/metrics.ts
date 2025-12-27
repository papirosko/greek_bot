import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

export type MetricDimensions = Record<string, string>;

const toDimensions = (dimensions: MetricDimensions) =>
  Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }));

export class MetricsService {
  private readonly client: CloudWatchClient;

  constructor() {
    this.client = new CloudWatchClient({});
  }

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
